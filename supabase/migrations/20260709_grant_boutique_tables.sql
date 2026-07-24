-- ══════════════════════════════════════════════════════════════════════════════
-- GRANT permissions for boutique tables to authenticated / service roles
-- Fixes: "permission denied for table store_settings" when using service client
-- ══════════════════════════════════════════════════════════════════════════════

GRANT ALL ON store_settings      TO authenticated, service_role;
GRANT ALL ON customers           TO authenticated, service_role;
GRANT ALL ON customer_addresses  TO authenticated, service_role;
GRANT ALL ON orders              TO authenticated, service_role;
GRANT ALL ON order_items         TO authenticated, service_role;
GRANT ALL ON store_pages         TO authenticated, service_role;
