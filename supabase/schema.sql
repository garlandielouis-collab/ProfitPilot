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

-- Profiles table for extended user metadata
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  phone text,
  language text not null default 'fr' check (language in ('fr', 'ht')),
  timezone text not null default 'America/Port-au-Prince',
  onboarded boolean not null default false,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Function to create profile when user signs up
create or replace function public.handle_new_user() returns trigger as $$
begin
  insert into public.profiles (id)
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

-- Missing schema additions for current app usage

create table if not exists business_members (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'viewer',
  is_active boolean not null default true,
  invited_by uuid references auth.users(id),
  joined_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique(business_id, user_id)
);

create table if not exists warehouses (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  address text,
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  sku text,
  barcode text,
  purchase_price numeric default 0,
  sale_price numeric default 0,
  attributes jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists warehouse_stock (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  warehouse_id uuid not null references warehouses(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  variant_id uuid references product_variants(id) on delete cascade,
  quantity integer not null default 0,
  reserved_qty integer not null default 0,
  updated_at timestamptz not null default now(),
  unique (warehouse_id, product_id, variant_id) nulls not distinct
);

create table if not exists inventory_movements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  warehouse_id uuid not null references warehouses(id) on delete restrict,
  product_id uuid not null references products(id) on delete restrict,
  variant_id uuid references product_variants(id),
  movement_type text not null,
  quantity integer not null,
  unit_cost numeric default 0,
  total_cost numeric default 0,
  currency text not null default 'HTG' check (currency in ('HTG', 'USD')),
  reference_type text,
  reference_id uuid,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists stock_adjustments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  warehouse_id uuid not null references warehouses(id),
  product_id uuid not null references products(id) on delete cascade,
  variant_id uuid references product_variants(id),
  quantity_before integer not null,
  quantity_after integer not null,
  reason text not null,
  approved_by uuid references auth.users(id),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists low_stock_alerts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  warehouse_id uuid references warehouses(id),
  current_qty integer not null,
  reorder_point integer not null,
  is_resolved boolean not null default false,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  business_id uuid references businesses(id) on delete set null,
  name text not null,
  phone text,
  email text,
  total_credit numeric not null default 0,
  created_at timestamptz not null default now()
);

alter table clients
  add column if not exists business_id uuid references businesses(id) on delete set null,
  add column if not exists total_credit numeric not null default 0,
  add column if not exists created_at timestamptz not null default now();

create index if not exists idx_clients_business_id on clients(business_id) where business_id is not null;
create index if not exists idx_clients_owner_id on clients(owner_id);

alter table clients enable row level security;
drop policy if exists clients_owner_or_member on clients;
create policy clients_owner_or_member on clients
  for all using (
    owner_id = auth.uid()
    or (
      business_id is not null
      and exists (
        select 1 from business_members bm
        where bm.business_id = clients.business_id
          and bm.user_id = auth.uid()
          and bm.is_active = true
          and bm.deleted_at is null
      )
    )
  ) with check (
    owner_id = auth.uid()
    or (
      business_id is not null
      and exists (
        select 1 from business_members bm
        where bm.business_id = clients.business_id
          and bm.user_id = auth.uid()
          and bm.is_active = true
          and bm.deleted_at is null
      )
    )
  );

alter table sales
  add column if not exists warehouse_id uuid references warehouses(id) on delete set null,
  add column if not exists customer_id uuid references clients(id) on delete set null,
  add column if not exists customer_name text,
  add column if not exists invoice_number text,
  add column if not exists exchange_rate numeric not null default 1.0,
  add column if not exists discount_percent numeric not null default 0,
  add column if not exists payment_status text not null default 'paid';

create table if not exists sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references sales(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  product_id uuid not null references products(id) on delete restrict,
  variant_id uuid references product_variants(id),
  product_name text not null,
  sku text,
  quantity integer not null check (quantity > 0),
  unit_price numeric not null check (unit_price >= 0),
  cost_price numeric not null default 0,
  discount_percent numeric not null default 0,
  discount_amount numeric not null default 0,
  tax_rate numeric not null default 0,
  tax_amount numeric not null default 0,
  line_total numeric not null,
  currency text not null default 'HTG' check (currency in ('HTG', 'USD')),
  created_at timestamptz not null default now()
);
create index if not exists idx_sale_items_sale on sale_items(sale_id);
create index if not exists idx_sale_items_product on sale_items(product_id);

alter table sale_items enable row level security;
drop policy if exists sale_items_access on sale_items;
create policy sale_items_access on sale_items
  for all using (
    exists (
      select 1 from business_members bm
      where bm.business_id = sale_items.business_id
        and bm.user_id = auth.uid()
        and bm.is_active = true
        and bm.deleted_at is null
    )
  ) with check (
    exists (
      select 1 from business_members bm
      where bm.business_id = sale_items.business_id
        and bm.user_id = auth.uid()
        and bm.is_active = true
        and bm.deleted_at is null
    )
  );

create table if not exists sale_payments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references sales(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  amount numeric not null check (amount > 0),
  currency text not null default 'HTG' check (currency in ('HTG', 'USD')),
  payment_method text,
  payment_date date not null default current_date,
  reference text,
  notes text,
  received_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_sale_payments_sale on sale_payments(sale_id);
create index if not exists idx_sale_payments_biz on sale_payments(business_id, payment_date desc);

alter table sale_payments enable row level security;
drop policy if exists sale_payments_access on sale_payments;
create policy sale_payments_access on sale_payments
  for all using (
    exists (
      select 1 from business_members bm
      where bm.business_id = sale_payments.business_id
        and bm.user_id = auth.uid()
        and bm.is_active = true
        and bm.deleted_at is null
    )
  ) with check (
    exists (
      select 1 from business_members bm
      where bm.business_id = sale_payments.business_id
        and bm.user_id = auth.uid()
        and bm.is_active = true
        and bm.deleted_at is null
    )
  );

alter table purchases
  add column if not exists warehouse_id uuid references warehouses(id) on delete set null,
  add column if not exists po_number text,
  add column if not exists exchange_rate numeric not null default 1.0,
  add column if not exists paid_amount numeric not null default 0;

create table if not exists purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references purchases(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  product_id uuid not null references products(id) on delete restrict,
  variant_id uuid references product_variants(id),
  product_name text not null,
  quantity integer not null check (quantity > 0),
  unit_cost numeric not null check (unit_cost >= 0),
  discount_percent numeric not null default 0,
  discount_amount numeric not null default 0,
  tax_rate numeric not null default 0,
  tax_amount numeric not null default 0,
  line_total numeric not null,
  quantity_received integer not null default 0,
  currency text not null default 'HTG' check (currency in ('HTG', 'USD')),
  created_at timestamptz not null default now()
);
create index if not exists idx_purchase_items_purchase on purchase_items(purchase_id);
create index if not exists idx_purchase_items_product on purchase_items(product_id);

alter table purchase_items enable row level security;
drop policy if exists purchase_items_access on purchase_items;
create policy purchase_items_access on purchase_items
  for all using (
    exists (
      select 1 from business_members bm
      where bm.business_id = purchase_items.business_id
        and bm.user_id = auth.uid()
        and bm.is_active = true
        and bm.deleted_at is null
    )
  ) with check (
    exists (
      select 1 from business_members bm
      where bm.business_id = purchase_items.business_id
        and bm.user_id = auth.uid()
        and bm.is_active = true
        and bm.deleted_at is null
    )
  );

create table if not exists purchase_payments (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references purchases(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  amount numeric not null check (amount > 0),
  currency text not null default 'HTG' check (currency in ('HTG', 'USD')),
  payment_method text,
  payment_date date not null default current_date,
  reference text,
  notes text,
  paid_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_purchase_payments_purchase on purchase_payments(purchase_id);
create index if not exists idx_purchase_payments_biz on purchase_payments(business_id, payment_date desc);

alter table purchase_payments enable row level security;
drop policy if exists purchase_payments_access on purchase_payments;
create policy purchase_payments_access on purchase_payments
  for all using (
    exists (
      select 1 from business_members bm
      where bm.business_id = purchase_payments.business_id
        and bm.user_id = auth.uid()
        and bm.is_active = true
        and bm.deleted_at is null
    )
  ) with check (
    exists (
      select 1 from business_members bm
      where bm.business_id = purchase_payments.business_id
        and bm.user_id = auth.uid()
        and bm.is_active = true
        and bm.deleted_at is null
    )
  );

create table if not exists customer_transactions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  business_id uuid references businesses(id) on delete cascade,
  client_id uuid references clients(id) on delete set null,
  client_name text,
  sale_id uuid references sales(id) on delete set null,
  invoice_number text,
  transaction_date date not null default current_date,
  type text not null default 'sale',
  amount numeric not null,
  currency text not null default 'HTG' check (currency in ('HTG', 'USD')),
  payment_method text,
  notes text,
  reference_type text,
  reference_id uuid,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_ct_business_id on customer_transactions(business_id) where business_id is not null;
create index if not exists idx_ct_client_id on customer_transactions(client_id);
create index if not exists idx_ct_sale_id on customer_transactions(sale_id);
create index if not exists idx_ct_owner_date on customer_transactions(owner_id, created_at desc);

alter table customer_transactions enable row level security;
drop policy if exists customer_transactions_business_member on customer_transactions;
create policy customer_transactions_business_member on customer_transactions
  for all using (
    business_id is not null
    and exists (
      select 1 from business_members bm
      where bm.business_id = customer_transactions.business_id
        and bm.user_id = auth.uid()
        and bm.is_active = true
        and bm.deleted_at is null
    )
  ) with check (
    business_id is not null
    and exists (
      select 1 from business_members bm
      where bm.business_id = customer_transactions.business_id
        and bm.user_id = auth.uid()
        and bm.is_active = true
        and bm.deleted_at is null
    )
  );

create table if not exists supplier_transactions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  business_id uuid references businesses(id) on delete cascade,
  supplier_id uuid references suppliers(id) on delete set null,
  transaction_date date not null default current_date,
  type text not null default 'purchase',
  amount numeric not null,
  currency text not null default 'HTG' check (currency in ('HTG', 'USD')),
  description text,
  payment_method text,
  reference_type text,
  reference_id uuid,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_st_business_id on supplier_transactions(business_id) where business_id is not null;
create index if not exists idx_st_supplier_id on supplier_transactions(supplier_id);
create index if not exists idx_st_owner_date on supplier_transactions(owner_id, created_at desc);

alter table supplier_transactions enable row level security;
drop policy if exists supplier_transactions_business_member on supplier_transactions;
create policy supplier_transactions_business_member on supplier_transactions
  for all using (
    business_id is not null
    and exists (
      select 1 from business_members bm
      where bm.business_id = supplier_transactions.business_id
        and bm.user_id = auth.uid()
        and bm.is_active = true
        and bm.deleted_at is null
    )
  ) with check (
    business_id is not null
    and exists (
      select 1 from business_members bm
      where bm.business_id = supplier_transactions.business_id
        and bm.user_id = auth.uid()
        and bm.is_active = true
        and bm.deleted_at is null
    )
  );

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
