import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getStoreBySlug, getStoreProduct, getStoreProducts } from '../../../../actions/store-public';
import { ProductDetailClient } from './ProductDetailClient';
import { ProductCard } from '../../ProductCard';

type Props = { params: Promise<{ slug: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, id } = await params;
  const store   = await getStoreBySlug(slug);
  if (!store) return {};
  const product = await getStoreProduct(store.business_id, id);
  return {
    title:       product?.name ?? 'Produit',
    description: product?.description ?? '',
    openGraph:   product?.image_url ? { images: [product.image_url] } : undefined,
  };
}

export default async function ProductDetailPage({ params }: Props) {
  const { slug, id } = await params;
  const store   = await getStoreBySlug(slug);
  if (!store) notFound();

  const product = await getStoreProduct(store.business_id, id);
  if (!product) notFound();

  const similar = await getStoreProducts(store.business_id, {
    category: product.category_id ?? undefined,
    limit: 4,
  }).then((ps) => ps.filter((p) => p.id !== product.id).slice(0, 4));

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <ProductDetailClient product={product} slug={slug} showPrice={store.show_prices} showStock={store.show_stock} />

      {/* Similar products */}
      {similar.length > 0 && (
        <section className="mt-16">
          <h2 className="mb-6 text-xl font-bold text-slate-800">Produits similaires</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {similar.map((p) => (
              <ProductCard key={p.id} product={p} slug={slug} showPrice={store.show_prices} showStock={store.show_stock} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
