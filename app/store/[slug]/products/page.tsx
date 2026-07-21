import { notFound } from 'next/navigation';
import { getStoreBySlug, getStoreProducts, getStoreCategories } from '../../../actions/store-public';
import { ProductsClient } from './ProductsClient';

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string>> };

export default async function StoreProductsPage({ params, searchParams }: Props) {
  const { slug }  = await params;
  const sp        = await searchParams;
  const store     = await getStoreBySlug(slug);
  if (!store) notFound();

  const filter   = sp.filter ?? '';
  const category = sp.category ?? '';
  const search   = sp.search ?? '';
  const sort     = (sp.sort as any) ?? 'newest';

  const [products, categories] = await Promise.all([
    getStoreProducts(store.business_id, {
      category: category || undefined,
      search:   search   || undefined,
      sort,
    }),
    getStoreCategories(store.business_id),
  ]);

  // Client-side filters
  const filtered = filter === 'new'
    ? products.filter((p) => p.is_new)
    : products;

  return (
    <ProductsClient
      products={filtered}
      categories={categories}
      slug={slug}
      showPrice={store.show_prices}
      showStock={store.show_stock}
      initialCategory={category}
      initialSort={sort}
      initialSearch={search}
    />
  );
}
