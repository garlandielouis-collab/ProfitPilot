-- Migration: backfill clients.business_id from sales and fill inventory_movements.warehouse_id
BEGIN;

-- 1) Populate clients.business_id from sales (choose most frequent business_id per client)
WITH best AS (
  SELECT customer_id, business_id
  FROM (
    SELECT customer_id, business_id,
           ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY COUNT(*) DESC) as rn
    FROM sales
    WHERE customer_id IS NOT NULL AND business_id IS NOT NULL
    GROUP BY customer_id, business_id
  ) t
  WHERE rn = 1
)
UPDATE clients
SET business_id = best.business_id
FROM best
WHERE clients.id = best.customer_id
  AND clients.business_id IS NULL;

-- 2) If still null, try to set from owner_id -> businesses.owner_id
UPDATE clients
SET business_id = b.id
FROM businesses b
WHERE clients.owner_id = b.owner_id
  AND clients.business_id IS NULL;

-- 3) Backfill inventory_movements.warehouse_id from warehouse_stock when possible (match by product_id and business_id)
WITH candidates AS (
  SELECT DISTINCT ON (ws.product_id, ws.business_id) ws.product_id, ws.business_id, ws.warehouse_id
  FROM warehouse_stock ws
  WHERE ws.business_id IS NOT NULL
  ORDER BY ws.product_id, ws.business_id
)
UPDATE inventory_movements im
SET warehouse_id = c.warehouse_id
FROM candidates c
WHERE im.warehouse_id IS NULL
  AND im.product_id = c.product_id
  AND im.business_id = c.business_id;

COMMIT;

-- After running this backfill, re-check counts of NULLs:
-- SELECT count(*) FROM clients WHERE business_id IS NULL;
-- SELECT count(*) FROM inventory_movements WHERE warehouse_id IS NULL;
