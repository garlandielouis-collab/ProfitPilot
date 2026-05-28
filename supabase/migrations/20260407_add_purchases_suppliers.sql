-- Migration: Add Purchases and Suppliers Module
-- Date: 2026-04-07
-- Description: Adds suppliers and purchases tables with stock management and expense tracking

-- Suppliers table for purchases module
create table if not exists suppliers (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  phone text,
  email text,
  created_at timestamp with time zone default now()
);

-- Purchases table for tracking supplier purchases
create table if not exists purchases (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  supplier_id uuid not null references suppliers(id) on delete restrict,
  product_id uuid not null references products(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  purchase_price_per_unit numeric not null check (purchase_price_per_unit >= 0),
  total_purchase_amount numeric not null check (total_purchase_amount >= 0),
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