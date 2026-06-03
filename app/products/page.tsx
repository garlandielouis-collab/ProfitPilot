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

  return (
    <ProductsClient
      initialProducts={products}
      initialUserId={user?.id ?? ''}
    />
  );
}
