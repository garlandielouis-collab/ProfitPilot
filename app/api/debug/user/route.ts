import { getSupabaseServer } from '../../../../lib/supabaseServerClient';

export async function GET() {
  try {
    const supabase = await getSupabaseServer();

    // Test 1: Get user from auth
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    console.log('🔍 [API] Auth check:');
    console.log('   User:', user?.id || 'NULL');
    console.log('   Error:', authError?.message || 'none');

    if (authError) {
      return Response.json(
        {
          success: false,
          error: `Auth error: ${authError.message}`,
          user: null,
          diagnosis: '❌ Middleware is NOT injecting session cookies correctly',
        },
        { status: 401 }
      );
    }

    if (!user) {
      return Response.json(
        {
          success: false,
          error: 'User is NULL - no session detected',
          user: null,
          diagnosis: '❌ Middleware is NOT injecting session cookies correctly',
        },
        { status: 401 }
      );
    }

    // Test 2: Try a simple query as the user
    const { data: testData, error: queryError } = await supabase
      .from('businesses')
      .select('id, name')
      .eq('owner_id', user.id)
      .limit(1);

    console.log('🔍 [API] Business query:');
    console.log('   Count:', testData?.length || 0);
    console.log('   Error:', queryError?.message || 'none');

    return Response.json(
      {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          created_at: user.created_at,
        },
        businesses: testData || [],
        diagnosis: '✅ Middleware IS injecting session cookies correctly',
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('🔴 [API] Exception:', error.message);

    return Response.json(
      {
        success: false,
        error: `Exception: ${error.message}`,
        user: null,
        diagnosis: '❌ Unexpected error - check logs',
      },
      { status: 500 }
    );
  }
}
