import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getStoreBySlug, getStoreProducts, getStoreCategories } from '../../actions/store-public';
import { ProductCard } from './ProductCard';

type Props = { params: Promise<{ slug: string }> };

export default async function StorePage({ params }: Props) {
  const { slug } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) notFound();

  const base = `/store/${slug}`;

  const [newest, categories] = await Promise.all([
    getStoreProducts(store.business_id, { sort: 'newest', limit: 12 }),
    getStoreCategories(store.business_id),
  ]);

  const featured = newest.slice(0, 4);
  const hasPromo = false; // single price schema, no separate sale price

  return (
    <div>
      {/* ── Hero Banner ── */}
      <section
        className="relative overflow-hidden"
        style={{
          background: store.banner_url
            ? `url(${store.banner_url}) center/cover no-repeat`
            : `linear-gradient(135deg, var(--store-primary) 0%, var(--store-primary)cc 100%)`,
          minHeight: '340px',
        }}
      >
        <div className="absolute inset-0 bg-black/30" />
        <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 text-white text-center">
          <h1 className="text-4xl font-extrabold sm:text-5xl drop-shadow-md">
            {store.store_name ?? 'Notre Boutique'}
          </h1>
          {store.banner_text && (
            <p className="mt-4 text-lg text-white/90 max-w-xl mx-auto">{store.banner_text}</p>
          )}
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href={`${base}/products`}
              className="rounded-2xl px-8 py-3 text-sm font-bold transition shadow-lg hover:shadow-xl"
              style={{ backgroundColor: 'var(--store-secondary)', color: '#fff' }}
            >
              Voir tous les produits →
            </Link>
            {hasPromo && (
              <Link
                href={`${base}/products?filter=sale`}
                className="rounded-2xl border border-white/60 bg-white/10 px-8 py-3 text-sm font-bold text-white backdrop-blur transition hover:bg-white/20"
              >
                🏷 Voir les promos
              </Link>
            )}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 space-y-16">

        {/* ── Categories ── */}
        {categories.length > 0 && (
          <section>
            <h2 className="mb-6 text-xl font-bold text-slate-800">Catégories</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {categories.map((cat) => (
                <Link
                  key={cat.id}
                  href={`${base}/products?category=${cat.id}`}
                  className="group flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-4 text-center transition hover:border-slate-300 hover:shadow-md"
                >
                  <div
                    className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl text-white text-sm font-bold"
                    style={{ backgroundColor: 'var(--store-primary)' }}
                  >
                    {cat.name[0].toUpperCase()}
                  </div>
                  <p className="text-xs font-semibold text-slate-700 group-hover:text-slate-900">{cat.name}</p>
                  <p className="text-[10px] text-slate-400">{cat.count} produit{cat.count !== 1 ? 's' : ''}</p>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ── Featured (first 4) ── */}
        {featured.length > 0 && (
          <section>
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-800">⭐ À la une</h2>
              <Link href={`${base}/products`} className="text-sm font-medium text-slate-500 hover:text-slate-700">
                Voir tout →
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {featured.map((p) => (
                <ProductCard key={p.id} product={p} slug={slug} showPrice={store.show_prices} showStock={store.show_stock} />
              ))}
            </div>
          </section>
        )}

        {/* ── All products ── */}
        {newest.length > 4 && (
          <section>
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-800">🛍 Tous les produits</h2>
              <Link href={`${base}/products`} className="text-sm font-medium text-slate-500 hover:text-slate-700">
                Voir tout →
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {newest.slice(4).map((p) => (
                <ProductCard key={p.id} product={p} slug={slug} showPrice={store.show_prices} showStock={store.show_stock} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
