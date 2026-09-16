// ─────────────────────────────────────────────────────────────────────────────
// L'atelier des gabarits — la page
//
// Rend un gabarit métier en entier, avec une boutique de démonstration, SANS
// base de données. C'est l'outil de celui qui fabrique les gabarits : il permet
// de regarder la page complète à toutes les largeurs, et de comparer six
// gabarits entre eux en changeant un mot dans l'adresse.
//
// Fermée en production (`notFound`). Elle n'est référencée nulle part dans le
// produit : ni menu, ni lien, ni plan du site.
//
// L'enveloppe et le moteur de sections sont CEUX DE LA VITRINE. Un atelier qui
// dessinerait ses propres sections ne dirait rien du gabarit réel.
// ─────────────────────────────────────────────────────────────────────────────

import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { toStoreView } from '../../../components/store/types';
import { StorefrontShell } from '../../../components/store/StorefrontShell';
import { SectionRenderer } from '../../../components/store/sections';
import { resolveSections } from '../../../lib/storeSections';
import { atelierStore, isAtelierTemplate, ATELIER_TEMPLATES } from '../../../lib/demo/atelier';
import type { SectionData } from '../../../components/store/sections/types';

export const metadata: Metadata = {
  title:  'Atelier des gabarits',
  robots: { index: false, follow: false },
};

/**
 * Rien à prégénérer en production : la page y répond 404, et laisser six
 * pages d'atelier dans la sortie de compilation ferait six 404 prérendues
 * plus un module de données de démonstration embarqué pour rien.
 */
export function generateStaticParams() {
  if (process.env.NODE_ENV === 'production') return [];
  return ATELIER_TEMPLATES.map((template) => ({ template }));
}

type Props = { params: Promise<{ template: string }> };

export default async function AtelierPage({ params }: Props) {
  if (process.env.NODE_ENV === 'production') notFound();

  const { template } = await params;
  if (!isAtelierTemplate(template)) notFound();

  const { settings, products, categories } = atelierStore(template);

  const view = toStoreView(settings, {
    base:       `/atelier/${template}`,
    origin:     'http://localhost:3000',
    templateId: template,
  });

  const newest = [...products].sort(
    (a, b) => +new Date(b.created_at) - +new Date(a.created_at),
  );

  const data: SectionData = {
    products,
    categories,
    featured:    products.filter((p) => p.is_featured),
    bestsellers: products.slice(0, 4),
    newArrivals: newest.slice(0, 4),
    reviews:     [],
    bundles:     [],
    ratings:     {},
  };

  const sections = resolveSections(template, null);

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 bg-amber-100 px-4 py-2 text-[12px] text-amber-900">
        <strong>Atelier — données de démonstration.</strong>
        <span>Aucune de ces boutiques, photos, prix ou avis n&apos;existe.</span>
        <span className="flex flex-wrap gap-2">
          {ATELIER_TEMPLATES.map((t) => (
            <Link
              key={t}
              href={`/atelier/${t}`}
              className={t === template ? 'font-bold underline' : 'underline'}
            >
              {t}
            </Link>
          ))}
        </span>
      </div>

      <StorefrontShell
        view={view}
        businessId={settings.business_id}
        searchIndex={products}
        categories={categories}
        homeSections={sections.filter((sec) => sec.enabled).map((sec) => sec.key)}
      >
        <SectionRenderer store={view} data={data} sections={sections} />
      </StorefrontShell>
    </>
  );
}
