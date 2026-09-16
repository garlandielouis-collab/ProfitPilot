// ─────────────────────────────────────────────────────────────────────────────
// L'atelier — la fiche produit
//
// Même composant que la vitrine (`ProductDetailClient`), même enveloppe, mais
// nourri par la boutique de démonstration. Fermée en production, comme le
// reste de l'atelier.
// ─────────────────────────────────────────────────────────────────────────────

import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { toStoreView } from '../../../../../components/store/types';
import { StorefrontShell } from '../../../../../components/store/StorefrontShell';
import { SectionRenderer } from '../../../../../components/store/sections';
import { ProductGrid } from '../../../../../components/store/blocks/ProductGrid';
import { resolveSections, pdpSectionsFor } from '../../../../../lib/storeSections';
import { atelierStore, isAtelierTemplate, ATELIER_TEMPLATES } from '../../../../../lib/demo/atelier';
import type { SectionData } from '../../../../../components/store/sections/types';
import { ProductDetailClient } from '../../../../store/[slug]/products/[id]/ProductDetailClient';

export const metadata: Metadata = {
  title:  'Atelier — fiche produit',
  robots: { index: false, follow: false },
};

type Props = { params: Promise<{ template: string; id: string }> };

export default async function AtelierProductPage({ params }: Props) {
  if (process.env.NODE_ENV === 'production') notFound();

  const { template, id } = await params;
  if (!isAtelierTemplate(template)) notFound();

  const { settings, products, categories } = atelierStore(template);
  const product = products.find((p) => p.id === id);
  if (!product) notFound();

  const view = toStoreView(settings, {
    base:       `/atelier/${template}`,
    origin:     'http://localhost:3000',
    templateId: template,
  });

  const wanted = pdpSectionsFor(template);
  const sections = resolveSections(template, null)
    .filter((s) => wanted.includes(s.key))
    .sort((a, b) => wanted.indexOf(a.key) - wanted.indexOf(b.key));

  const empty: SectionData = {
    products: [], categories: [], featured: [], bestsellers: [],
    newArrivals: [], reviews: [], bundles: [], ratings: {},
  };

  const recommended = products.filter((p) => p.id !== product.id).slice(0, 4);

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 bg-amber-100 px-4 py-2 text-[12px] text-amber-900">
        <strong>Atelier — données de démonstration.</strong>
        <Link href={`/atelier/${template}`} className="underline">← retour à l&apos;accueil du gabarit</Link>
        <span className="flex flex-wrap gap-2">
          {ATELIER_TEMPLATES.map((t) => (
            <Link key={t} href={`/atelier/${t}`} className={t === template ? 'font-bold underline' : 'underline'}>{t}</Link>
          ))}
        </span>
      </div>

      <StorefrontShell
        view={view}
        businessId={settings.business_id}
        searchIndex={products}
        categories={categories}
      >
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
          <ProductDetailClient
            product={product}
            store={view}
            businessId={settings.business_id}
            rating={{ average: 0, count: 0 }}
            shippingModes={settings.shipping_modes}
            paymentMethods={settings.payment_methods}
          />

          {recommended.length > 0 && (
            <section className="mt-20">
              <h2
                className="mb-6 text-[var(--st-ink)]"
                style={{ fontFamily: 'var(--st-font-heading)', fontSize: 'var(--st-h2)', fontWeight: 600 }}
              >
                Vous aimerez aussi
              </h2>
              <ProductGrid store={view} products={recommended} priorityCount={0} />
            </section>
          )}
        </div>

        {sections.length > 0 && (
          <SectionRenderer store={view} data={empty} sections={sections} />
        )}
      </StorefrontShell>
    </>
  );
}
