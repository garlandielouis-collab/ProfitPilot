ALTER TABLE IF EXISTS public.customers
ADD COLUMN IF NOT EXISTS outstanding_balance NUMERIC(20,4) NOT NULL DEFAULT 0;

ALTER TABLE IF EXISTS public.customers
ALTER COLUMN outstanding_balance SET DEFAULT 0;
