-- Grant all existing tables in public schema
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, service_role;

-- Grant all existing sequences (needed for INSERT with serial/uuid defaults)
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

-- Auto-grant any table created in the future
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated, service_role;
