'use server';

import { getSupabaseServer } from './supabaseServerClient';
import { getBusinessContext } from './serverAuth';

/**
 * Debug helper to verify authentication is working correctly
 * Call this at the START of server actions to confirm:
 * 1. User is authenticated
 * 2. User's business is found
 * 3. RLS policies work
 */
export async function debugAuth(context: string) {
  console.log(`\n🔍 [DEBUG-AUTH] ${context}`);
  console.log('═'.repeat(80));

  try {
    // 1. Server session
    const supabase = await getSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    console.log(`✅ auth.getUser():`, user?.id ? `${user.id}` : '❌ NULL');

    if (!user) {
      console.log('❌ User is not authenticated!');
      console.log('═'.repeat(80));
      return { success: false, error: 'User not authenticated' };
    }

    // 2. Business context
    const { userId, businessId } = await getBusinessContext();
    console.log(`✅ userId: ${userId}`);
    console.log(`✅ businessId: ${businessId}`);

    // 3. Test RLS - products query (scope by user_id)
    const { data: products, count } = await supabase
      .from('products')
      .select('id, name', { count: 'exact' })
      .eq('user_id', userId);

    console.log(`✅ Products query: ${count} found`);
    if (products && products.length > 0) {
      console.log(`   Sample: "${products[0].name}"`);
    }

    // 4. Test RLS - ai_conversations
    const { data: convs } = await supabase
      .from('ai_conversations')
      .select('id, user_id')
      .eq('user_id', userId);

    console.log(`✅ AI conversations: ${convs?.length || 0} found`);

    console.log('═'.repeat(80));
    return {
      success: true,
      userId,
      businessId,
      productCount: count,
      conversationCount: convs?.length || 0,
    };

  } catch (err: any) {
    console.error(`❌ [DEBUG-AUTH] Error:`, err.message);
    console.log('═'.repeat(80));
    return { success: false, error: err.message };
  }
}
