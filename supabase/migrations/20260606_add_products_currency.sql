-- Add currency column to products (was dropped in clean_products_rebuild)
ALTER TABLE products ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'HTG';
