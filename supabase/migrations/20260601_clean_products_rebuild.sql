-- Clean products rebuild: drop old, create new minimal table
-- Removes all legacy bloat (owner_id, business_id, currency, barcode, image_url, etc.)

-- 1. Drop dependent objects
DROP VIEW IF EXISTS stock_value_htg;
DROP TRIGGER IF EXISTS sales_decrement_stock_trigger ON sales;
DROP TRIGGER IF EXISTS purchases_increment_stock_trigger ON purchases;
DROP TRIGGER IF EXISTS purchases_create_expense_trigger ON purchases;
DROP FUNCTION IF EXISTS decrement_product_stock();
DROP FUNCTION IF EXISTS increment_product_stock_on_purchase();
DROP FUNCTION IF EXISTS create_expense_on_paid_purchase();

-- 2. Drop old RLS policies on products (exact names may vary; use DO block to catch all)
DO $$
BEGIN
  FOR r IN (
    SELECT policyname FROM pg_policies WHERE tablename = 'products'
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON products', r.policyname);
  END LOOP;
END $$;

-- 3. Drop foreign key constraints referencing products
ALTER TABLE sales      DROP CONSTRAINT IF EXISTS sales_product_id_fkey;
ALTER TABLE purchases  DROP CONSTRAINT IF EXISTS purchases_product_id_fkey;

-- 4. Drop old products table
DROP TABLE IF EXISTS products CASCADE;

-- 5. Create new minimal products table
CREATE TABLE products (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name            text NOT NULL,
  category        text,
  purchase_price  numeric DEFAULT 0,
  sale_price      numeric DEFAULT 0,
  stock_quantity  integer DEFAULT 0,
  created_at      timestamptz DEFAULT now()
);

-- 6. Recreate foreign keys from child tables
ALTER TABLE sales      ADD CONSTRAINT sales_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT;
ALTER TABLE purchases  ADD CONSTRAINT purchases_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT;

-- 7. Enable RLS
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- 8. Minimal RLS policies: user_id = auth.uid() only
CREATE POLICY "products_select" ON products FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "products_insert" ON products FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "products_update" ON products FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "products_delete" ON products FOR DELETE USING (user_id = auth.uid());

-- 9. Recreate stock decrement trigger for sales
CREATE OR REPLACE FUNCTION decrement_product_stock()
RETURNS trigger AS $$
DECLARE
  current_stock integer;
BEGIN
  SELECT stock_quantity INTO current_stock FROM products WHERE id = new.product_id FOR UPDATE;
  IF current_stock IS NULL THEN
    RAISE EXCEPTION 'Product not found: %', new.product_id;
  END IF;
  IF current_stock < new.quantity THEN
    RAISE EXCEPTION 'Insufficient stock for product %: available %, requested %', new.product_id, current_stock, new.quantity;
  END IF;
  UPDATE products SET stock_quantity = stock_quantity - new.quantity WHERE id = new.product_id;
  RETURN new;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sales_decrement_stock_trigger
  BEFORE INSERT ON sales
  FOR EACH ROW EXECUTE FUNCTION decrement_product_stock();

-- 10. Recreate stock increment trigger for purchases
CREATE OR REPLACE FUNCTION increment_product_stock_on_purchase()
RETURNS trigger AS $$
DECLARE
  current_stock integer;
BEGIN
  SELECT stock_quantity INTO current_stock FROM products WHERE id = new.product_id FOR UPDATE;
  IF current_stock IS NULL THEN
    RAISE EXCEPTION 'Product not found: %', new.product_id;
  END IF;
  UPDATE products SET stock_quantity = stock_quantity + new.quantity WHERE id = new.product_id;
  RETURN new;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER purchases_increment_stock_trigger
  AFTER INSERT ON purchases
  FOR EACH ROW EXECUTE FUNCTION increment_product_stock_on_purchase();
