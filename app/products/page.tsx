import { getProductsAction } from '../actions/products';
import { getSupabaseServer } from '../../lib/supabaseServerClient';
import { ProductsClient } from './ProductsClient';

export default async function ProductsPage() {
  // Fetch data server-side — zero loading spinner on first render
  const [products, supabase] = await Promise.all([
    getProductsAction().catch(() => []),
    getSupabaseServer(),
  ]);

  const { data: { user } } = await supabase.auth.getUser();

  // Fetch exchange rate
  let exchangeRate = 130;
  try {
    const { data: biz } = await supabase
      .from('businesses')
      .select('exchange_rate')
      .eq('owner_id', user?.id)
      .maybeSingle();
    if (biz?.exchange_rate) exchangeRate = Number(biz.exchange_rate);
  } catch { /* use default */ }

  return (
    <ProductsClient
      initialProducts={products}
      initialUserId={user?.id ?? ''}
      exchangeRate={exchangeRate}
    />
  );
}
