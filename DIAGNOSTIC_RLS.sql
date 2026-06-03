-- ═══════════════════════════════════════════════════════════════════════
-- DIAGNOSTIC COMPLET: RLS POLICIES + GRANTS + SCHEMA
-- ═══════════════════════════════════════════════════════════════════════

-- SECTION 1: RLS POLICIES
-- ═══════════════════════════════════════════════════════════════════════

-- RLS on PRODUCTS
SELECT 'products' as table_name, pol.polname, pol.poltype,
       pg_get_expr(pol.polqual, pol.polrelid) as qual,
       pg_get_expr(pol.polwithcheck, pol.polrelid) as with_check
FROM pg_policy pol
JOIN pg_class t ON pol.polrelid = t.oid
WHERE t.relname = 'products';

-- RLS on BUSINESSES
SELECT 'businesses' as table_name, pol.polname, pol.poltype,
       pg_get_expr(pol.polqual, pol.polrelid) as qual,
       pg_get_expr(pol.polwithcheck, pol.polrelid) as with_check
FROM pg_policy pol
JOIN pg_class t ON pol.polrelid = t.oid
WHERE t.relname = 'businesses';

-- RLS on AI_CONVERSATIONS
SELECT 'ai_conversations' as table_name, pol.polname, pol.poltype,
       pg_get_expr(pol.polqual, pol.polrelid) as qual,
       pg_get_expr(pol.polwithcheck, pol.polrelid) as with_check
FROM pg_policy pol
JOIN pg_class t ON pol.polrelid = t.oid
WHERE t.relname = 'ai_conversations';

-- RLS on AI_MESSAGES
SELECT 'ai_messages' as table_name, pol.polname, pol.poltype,
       pg_get_expr(pol.polqual, pol.polrelid) as qual,
       pg_get_expr(pol.polwithcheck, pol.polrelid) as with_check
FROM pg_policy pol
JOIN pg_class t ON pol.polrelid = t.oid
WHERE t.relname = 'ai_messages';

-- SECTION 2: RLS ENABLED?
-- ═══════════════════════════════════════════════════════════════════════

SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE tablename IN ('products', 'businesses', 'ai_conversations', 'ai_messages', 'customers', 'sales', 'expenses')
ORDER BY tablename;

-- SECTION 3: GRANTS
-- ═══════════════════════════════════════════════════════════════════════

SELECT 'products' as table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_name='products'
UNION ALL
SELECT 'businesses', grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_name='businesses'
UNION ALL
SELECT 'ai_conversations', grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_name='ai_conversations'
UNION ALL
SELECT 'ai_messages', grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_name='ai_messages'
ORDER BY table_name, grantee;

-- SECTION 4: SCHEMA COLUMNS
-- ═══════════════════════════════════════════════════════════════════════

-- PRODUCTS columns
SELECT 'products' as table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'products'
ORDER BY ordinal_position;

-- BUSINESSES columns
SELECT 'businesses' as table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'businesses'
ORDER BY ordinal_position;

-- AI_CONVERSATIONS columns
SELECT 'ai_conversations' as table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'ai_conversations'
ORDER BY ordinal_position;

-- AI_MESSAGES columns
SELECT 'ai_messages' as table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'ai_messages'
ORDER BY ordinal_position;

-- SECTION 5: FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════

-- Check if is_business_owner exists
SELECT routine_name, routine_type, routine_definition
FROM information_schema.routines
WHERE routine_name = 'is_business_owner'
AND routine_schema = 'public';

-- Check create_user_business function
SELECT routine_name, routine_type, routine_definition
FROM information_schema.routines
WHERE routine_name = 'create_user_business'
AND routine_schema = 'public';

-- Check fn_seed_products function
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_name LIKE 'fn_seed%'
AND routine_schema = 'public';

-- SECTION 6: DATA INSPECTION
-- ═══════════════════════════════════════════════════════════════════════

-- Your user
SELECT id, email FROM auth.users WHERE email = 'garlandielouis@gmail.com';

-- Your business (for that user ID)
SELECT id, name, owner_id FROM businesses
WHERE owner_id = (SELECT id FROM auth.users WHERE email = 'garlandielouis@gmail.com' LIMIT 1);

-- Product count
SELECT COUNT(*) as product_count FROM products;

-- AI conversations (check owner)
SELECT id, user_id, business_id FROM ai_conversations LIMIT 5;

-- Check if auth.uid() works in RLS context
SELECT current_user, session_user;
