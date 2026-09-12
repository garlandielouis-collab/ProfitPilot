import { getProductsAction } from '../actions/products';
import { getSupabaseServer } from '../../lib/supabaseServerClient';
import { getBusinessContext } from '../../lib/serverAuth';
import { ProductsClient } from './ProductsClient';

export default async function ProductsPage() {
  // Fetch data server-side — zero loading spinner on first render
  const [products, supabase, ctx] = await Promise.all([
    getProductsAction().catch(() => []),
    getSupabaseServer(),
    getBusinessContext().catch(() => null),
  ]);

  const { data: { user } } = await supabase.auth.getUser();

  // Le taux de l'entreprise ACTIVE (cookie multi-entreprise, pas la première
  // entreprise possédée), et seulement s'il a été saisi : ni le repli à 130 du
  // contexte, ni le 1 par défaut de la colonne ne sont un taux du marchand.
  // Sans taux saisi, rien n'est transmis : aucune marge au taux inventé.
  const exchangeRate = ctx?.exchangeRateSet ? ctx.exchangeRate : undefined;

  return (
    <ProductsClient
      initialProducts={products}
      initialUserId={user?.id ?? ''}
      exchangeRate={exchangeRate}
    />
  );
}
