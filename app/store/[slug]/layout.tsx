import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getStoreBySlug } from '../../actions/store-public';
import { CartProvider } from './StoreCartContext';
import { StoreNav } from './StoreNav';
import { StoreFooter } from './StoreFooter';

type Props = {
  params: Promise<{ slug: string }>;
  children: React.ReactNode;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) return { title: 'Boutique introuvable' };
  return {
    title:       store.meta_title ?? store.store_name ?? 'Boutique',
    description: store.meta_description ?? store.tagline ?? '',
  };
}

export default async function StoreLayout({ params, children }: Props) {
  const { slug } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) notFound();

  const primary   = store.primary_color   ?? '#001F3F';
  const secondary = store.secondary_color ?? '#50C878';

  return (
    <CartProvider slug={slug}>
      <style>{`
        :root {
          --store-primary:   ${primary};
          --store-secondary: ${secondary};
          --store-primary-10: ${primary}1a;
        }
      `}</style>
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <StoreNav store={store} slug={slug} />
        <main className="flex-1">{children}</main>
        <StoreFooter store={store} />
      </div>
    </CartProvider>
  );
}
