'use server';

import { getSupabaseServer } from './supabaseServerClient';

/**
 * Complete diagnostic of current auth state
 * Call this at the START of any problematic server action
 */
export async function diagnoseAuth(context: string) {
  console.log(`\n🔍 [DIAGNOSTIC] Context: ${context}`);
  console.log('═'.repeat(80));

  try {
    const supabase = await getSupabaseServer();

    // 1. Get user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    console.log(`✅ supabase.auth.getUser()`);
    console.log(`   Error: ${authError?.message || 'none'}`);
    console.log(`   User ID: ${user?.id || '❌ NULL'}`);
    console.log(`   Email: ${user?.email || 'N/A'}`);
    console.log(`   Created: ${user?.created_at || 'N/A'}`);

    // 2. Test a simple query WITH auth context
    console.log(`\n🧪 Testing RLS with authenticated user...`);
    const { data: testData, error: testError, count } = await supabase
      .from('businesses')
      .select('id, name', { count: 'exact' })
      .limit(1);

    console.log(`   Query: businesses.select('id, name').limit(1)`);
    console.log(`   Error: ${testError?.message || 'none'}`);
    console.log(`   Count: ${count}`);
    console.log(`   Data: ${JSON.stringify(testData)}`);

    if (!user) {
      console.log(`\n❌ CRITICAL: No authenticated user!`);
      console.log(`   This means RLS policies will block everything.`);
      return {
        hasUser: false,
        userId: null,
        businessId: null,
        businesses: [],
        error: 'No authenticated user'
      };
    }

    const uid = user.id;

    // 2. List businesses
    const { data: businesses, error: bizError } = await supabase
      .from('businesses')
      .select('id, name, owner_id')
      .eq('owner_id', uid);

    console.log(`\n✅ Query: businesses WHERE owner_id = '${uid}'`);
    console.log(`   Error: ${bizError?.message || 'none'}`);
    console.log(`   Count: ${businesses?.length || 0}`);
    if (businesses && businesses.length > 0) {
      businesses.forEach((biz: any, i: number) => {
        console.log(`   [${i}] ID: ${biz.id}, Name: ${biz.name}`);
      });
    }

    const businessId = businesses?.[0]?.id;

    // 3. Test products query
    if (businessId) {
      const { data: products, error: prodError, count } = await supabase
        .from('products')
        .select('id, name', { count: 'exact' })
        .eq('user_id', uid);

      console.log(`\n✅ Query: products WHERE user_id = '${uid}'`);
      console.log(`   Error: ${prodError?.message || 'none'}`);
      console.log(`   Count: ${count || 0}`);
      if (products && products.length > 0) {
        console.log(`   First 3 products:`);
        products.slice(0, 3).forEach((p: any, i: number) => {
          console.log(`     [${i}] ID: ${p.id}, Name: ${p.name}`);
        });
      }
    }

    // 4. Test RLS by trying simple insert (will fail but shows RLS state)
    console.log(`\n🧪 Testing RLS policies...`);
    const { error: insertError } = await supabase
      .from('products')
      .insert([{ name: '_TEST_', user_id: uid, category: 'Test', purchase_price: 0, sale_price: 0 }])
      .select();

    if (insertError) {
      console.log(`   Insert error (expected): ${insertError.message}`);
      if (insertError.message.includes('permission denied')) {
        console.log(`   ❌ RLS IS BLOCKING THIS USER FROM WRITING`);
      }
    } else {
      console.log(`   ✅ RLS allowed insert (unexpected, check why)`);
    }

    console.log('\n' + '═'.repeat(80));
    return {
      hasUser: true,
      userId: uid,
      businessId: businessId || null,
      businesses: businesses || [],
      remark: 'Diagnostic complete - check logs above'
    };
  } catch (err: any) {
    console.error(`❌ [DIAGNOSTIC] Exception:`, err.message);
    return {
      hasUser: false,
      userId: null,
      businessId: null,
      businesses: [],
      error: err.message
    };
  }
}
