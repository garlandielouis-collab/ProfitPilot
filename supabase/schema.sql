-- Supabase schema for ProfitPilot

create extension if not exists "uuid-ossp";

-- Businesses table for multi-currency support
create table if not exists businesses (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  sector text,
  location text,
  default_currency text not null default 'HTG' check (default_currency in ('HTG', 'USD')),
  exchange_rate numeric not null default 1.0 check (exchange_rate > 0),
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Employees table for team management
create table if not exists employees (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid not null references businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'vendeur')),
  created_at timestamp with time zone default now(),
  unique(business_id, user_id)
);

-- Function to create profile when user signs up
create or replace function public.handle_new_user() returns trigger as $$
begin
  insert into public.profiles (owner_id)
  values (new.id);
  return new;
end;
$$ language plpgsql security definer;

-- Trigger to automatically create profile on user signup
create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Products (minimal: directly owned by auth.users, no business/owner indirection)
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  category text,
  purchase_price numeric default 0,
  sale_price numeric default 0,
  stock_quantity integer default 0,
  created_at timestamptz default now()
);

-- Sales records that decrement stock automatically
create table if not exists sales (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  business_id uuid references businesses(id) on delete set null,
  product_id uuid not null references products(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  total_amount numeric not null check (total_amount >= 0),
  currency text not null default 'HTG' check (currency in ('HTG', 'USD')),
  payment_method text not null check (payment_method in ('Cash', 'MonCash', 'Card')),
  created_at timestamp with time zone default now()
);

-- Expenses per merchant
create table if not exists expenses (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  business_id uuid references businesses(id) on delete set null,
  amount numeric not null check (amount >= 0),
  currency text not null default 'HTG' check (currency in ('HTG', 'USD')),
  description text,
  category text,
  date date not null default current_date,
  created_at timestamp with time zone default now()
);

-- Subscriptions table
create table if not exists subscriptions (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid not null references businesses(id) on delete cascade,
  plan text not null check (plan in ('Ti Machann', 'Business Pilot', 'Expert')),
  status text not null default 'active' check (status in ('active', 'inactive', 'cancelled')),
  start_date date not null default current_date,
  end_date date,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Stock update trigger function for sales
create or replace function public.decrement_product_stock() returns trigger as $$
declare
  current_stock integer;
begin
  select stock_quantity into current_stock from products where id = new.product_id for update;

  if current_stock is null then
    raise exception 'Product not found: %', new.product_id;
  end if;

  if current_stock < new.quantity then
    raise exception 'Insufficient stock for product %: available %, requested %', new.product_id, current_stock, new.quantity;
  end if;

  update products
  set stock_quantity = stock_quantity - new.quantity
  where id = new.product_id;

  return new;
end;
$$ language plpgsql;

create trigger sales_decrement_stock_trigger
  before insert on sales
  for each row
  execute function public.decrement_product_stock();

-- Enable row level security for multi-tenant isolation
alter table profiles enable row level security;
alter table products enable row level security;
alter table sales enable row level security;
alter table expenses enable row level security;

-- Profiles policies
create policy profiles_select_own on profiles
  for select using (owner_id = auth.uid());

create policy profiles_insert_own on profiles
  for insert with check (owner_id = auth.uid());

create policy profiles_update_own on profiles
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy profiles_delete_own on profiles
  for delete using (owner_id = auth.uid());

-- Products policies (minimal: user_id = auth.uid() only)
create policy products_select on products
  for select using (user_id = auth.uid());

create policy products_insert on products
  for insert with check (user_id = auth.uid());

create policy products_update on products
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy products_delete on products
  for delete using (user_id = auth.uid());

-- Sales policies
create policy sales_select_own on sales
  for select using (owner_id = auth.uid());

create policy sales_insert_own on sales
  for insert with check (owner_id = auth.uid());

create policy sales_update_own on sales
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy sales_delete_own on sales
  for delete using (owner_id = auth.uid());

-- Expenses policies
create policy expenses_select_own on expenses
  for select using (owner_id = auth.uid());

create policy expenses_insert_own on expenses
  for insert with check (owner_id = auth.uid());

create policy expenses_update_own on expenses
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy expenses_delete_own on expenses
  for delete using (owner_id = auth.uid());

-- Suppliers table for purchases module
create table if not exists suppliers (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  business_id uuid references businesses(id) on delete set null,
  name text not null,
  phone text,
  email text,
  created_at timestamp with time zone default now()
);

-- Purchases table for tracking supplier purchases
create table if not exists purchases (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  business_id uuid references businesses(id) on delete set null,
  supplier_id uuid not null references suppliers(id) on delete restrict,
  product_id uuid not null references products(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  purchase_price_per_unit numeric not null check (purchase_price_per_unit >= 0),
  total_purchase_amount numeric not null check (total_purchase_amount >= 0),
  currency text not null default 'HTG' check (currency in ('HTG', 'USD')),
  payment_status text not null check (payment_status in ('Payé', 'À Crédit')),
  purchase_date date not null default current_date,
  created_at timestamp with time zone default now()
);

-- Function to increment product stock when purchase is inserted
create or replace function public.increment_product_stock_on_purchase() returns trigger as $$
declare
  current_stock integer;
begin
  -- Get current stock for update
  select stock_quantity into current_stock from products where id = new.product_id for update;

  if current_stock is null then
    raise exception 'Product not found: %', new.product_id;
  end if;

  -- Increment stock quantity
  update products
  set stock_quantity = stock_quantity + new.quantity
  where id = new.product_id;

  return new;
end;
$$ language plpgsql;

-- Trigger to automatically increment stock when purchase is inserted
create trigger purchases_increment_stock_trigger
  after insert on purchases
  for each row
  execute function public.increment_product_stock_on_purchase();

-- Function to create expense record when purchase is paid
create or replace function public.create_expense_on_paid_purchase() returns trigger as $$
begin
  -- Only create expense if payment status is 'Payé'
  if new.payment_status = 'Payé' then
    insert into expenses (owner_id, amount, description, category, date)
    values (
      new.owner_id,
      new.total_purchase_amount,
      'Achat fournisseur - ' || (select name from suppliers where id = new.supplier_id),
      'Achats',
      new.purchase_date
    );
  end if;

  return new;
end;
$$ language plpgsql;

-- Trigger to automatically create expense when purchase payment is marked as paid
create trigger purchases_create_expense_trigger
  after insert on purchases
  for each row
  execute function public.create_expense_on_paid_purchase();

-- Enable row level security for suppliers and purchases
alter table suppliers enable row level security;
alter table purchases enable row level security;

-- Suppliers policies
create policy suppliers_select_own on suppliers
  for select using (owner_id = auth.uid());

create policy suppliers_insert_own on suppliers
  for insert with check (owner_id = auth.uid());

create policy suppliers_update_own on suppliers
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy suppliers_delete_own on suppliers
  for delete using (owner_id = auth.uid());

-- Purchases policies
create policy purchases_select_own on purchases
  for select using (owner_id = auth.uid());

create policy purchases_insert_own on purchases
  for insert with check (owner_id = auth.uid());

create policy purchases_update_own on purchases
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy purchases_delete_own on purchases
  for delete using (owner_id = auth.uid());

-- Enable row level security for new tables
alter table businesses enable row level security;
alter table employees enable row level security;
alter table subscriptions enable row level security;

-- Businesses policies (only owners can access their businesses)
create policy businesses_select_own on businesses
  for select using (owner_id = auth.uid());

create policy businesses_insert_own on businesses
  for insert with check (owner_id = auth.uid());

create policy businesses_update_own on businesses
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy businesses_delete_own on businesses
  for delete using (owner_id = auth.uid());

-- Employees policies (admins can manage employees, employees can see their own record)
create policy employees_select_team on employees
  for select using (
    user_id = auth.uid() OR
    business_id IN (
      SELECT business_id FROM employees
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

create policy employees_insert_admin on employees
  for insert with check (
    business_id IN (
      SELECT business_id FROM employees
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

create policy employees_update_admin on employees
  for update using (
    business_id IN (
      SELECT business_id FROM employees
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  ) with check (
    business_id IN (
      SELECT business_id FROM employees
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

create policy employees_delete_admin on employees
  for delete using (
    business_id IN (
      SELECT business_id FROM employees
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );



-- Enhanced sales policies (sellers can create and view sales, but not financial aggregates)
create policy sales_select_team on sales
  for select using (
    owner_id = auth.uid() OR
    business_id IN (
      SELECT business_id FROM employees
      WHERE user_id = auth.uid()
    )
  );

create policy sales_insert_team on sales
  for insert with check (
    owner_id = auth.uid() OR
    business_id IN (
      SELECT business_id FROM employees
      WHERE user_id = auth.uid()
    )
  );

create policy sales_update_admin on sales
  for update using (
    owner_id = auth.uid() OR
    business_id IN (
      SELECT business_id FROM employees
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  ) with check (
    owner_id = auth.uid() OR
    business_id IN (
      SELECT business_id FROM employees
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

create policy sales_delete_admin on sales
  for delete using (
    owner_id = auth.uid() OR
    business_id IN (
      SELECT business_id FROM employees
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Expenses policies (only admins can see expenses)
create policy expenses_select_admin on expenses
  for select using (
    owner_id = auth.uid() OR
    business_id IN (
      SELECT business_id FROM employees
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

create policy expenses_insert_admin on expenses
  for insert with check (
    owner_id = auth.uid() OR
    business_id IN (
      SELECT business_id FROM employees
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

create policy expenses_update_admin on expenses
  for update using (
    owner_id = auth.uid() OR
    business_id IN (
      SELECT business_id FROM employees
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  ) with check (
    owner_id = auth.uid() OR
    business_id IN (
      SELECT business_id FROM employees
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

create policy expenses_delete_admin on expenses
  for delete using (
    owner_id = auth.uid() OR
    business_id IN (
      SELECT business_id FROM employees
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Subscriptions policies (only business owners can manage subscriptions)
create policy subscriptions_select_own on subscriptions
  for select using (
    business_id IN (
      SELECT id FROM businesses WHERE owner_id = auth.uid()
    )
  );

create policy subscriptions_insert_own on subscriptions
  for insert with check (
    business_id IN (
      SELECT id FROM businesses WHERE owner_id = auth.uid()
    )
  );

create policy subscriptions_update_own on subscriptions
  for update using (
    business_id IN (
      SELECT id FROM businesses WHERE owner_id = auth.uid()
    )
  ) with check (
    business_id IN (
      SELECT id FROM businesses WHERE owner_id = auth.uid()
    )
  );

create policy subscriptions_delete_own on subscriptions
  for delete using (
    business_id IN (
      SELECT id FROM businesses WHERE owner_id = auth.uid())
    )
  );

-- Suppliers policies (only admins can manage suppliers)
create policy suppliers_select_admin on suppliers
  for select using (
    owner_id = auth.uid() OR
    business_id IN (
      SELECT business_id FROM employees
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

create policy suppliers_insert_admin on suppliers
  for insert with check (
    owner_id = auth.uid() OR
    business_id IN (
      SELECT business_id FROM employees
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

create policy suppliers_update_admin on suppliers
  for update using (
    owner_id = auth.uid() OR
    business_id IN (
      SELECT business_id FROM employees
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  ) with check (
    owner_id = auth.uid() OR
    business_id IN (
      SELECT business_id FROM employees
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

create policy suppliers_delete_admin on suppliers
  for delete using (
    owner_id = auth.uid() OR
    business_id IN (
      SELECT business_id FROM employees
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Purchases policies (only admins can manage purchases)
create policy purchases_select_admin on purchases
  for select using (
    owner_id = auth.uid() OR
    business_id IN (
      SELECT business_id FROM employees
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

create policy purchases_insert_admin on purchases
  for insert with check (
    owner_id = auth.uid() OR
    business_id IN (
      SELECT business_id FROM employees
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

create policy purchases_update_admin on purchases
  for update using (
    owner_id = auth.uid() OR
    business_id IN (
      SELECT business_id FROM employees
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  ) with check (
    owner_id = auth.uid() OR
    business_id IN (
      SELECT business_id FROM employees
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

create policy purchases_delete_admin on purchases
  for delete using (
    owner_id = auth.uid() OR
    business_id IN (
      SELECT business_id FROM employees
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- ── AI Module ──────────────────────────────────────────────────────────────────

create table if not exists ai_conversations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  uuid REFERENCES businesses(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title        text,
  context      jsonb,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz
);

create index if not exists idx_ai_conv_user on ai_conversations(user_id);

create table if not exists ai_messages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  uuid NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role             text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content          text NOT NULL,
  tokens_used      integer,
  model            text,
  metadata         jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);

alter table ai_conversations enable row level security;
alter table ai_messages enable row level security;

create policy "ai_conversations: own" on ai_conversations
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "ai_messages: own" on ai_messages
  for all
  using (exists (
    select 1 from ai_conversations where id = conversation_id and user_id = auth.uid()
  ))
  with check (exists (
    select 1 from ai_conversations where id = conversation_id and user_id = auth.uid()
  ));

-- View: Stock value in HTG (simplified)
create or replace view stock_value_htg as
select
  id,
  name,
  category,
  stock_quantity,
  purchase_price,
  stock_quantity * purchase_price as total_stock_value_htg
from products
where stock_quantity > 0;
