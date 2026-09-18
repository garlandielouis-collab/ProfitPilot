// ─────────────────────────────────────────────────────────────────────────────
// Les pages internes d'une vitrine — « À propos », « Contact », « FAQ »,
// « Livraison & retours », « Témoignages »
//
// Une seule route pour les cinq. Le segment d'adresse est résolu dans
// `lib/storefrontPages.ts`, qui porte aussi l'ordre des sections de chaque page
// et le prédicat qui dit si CE marchand en a la matière.
//
// ── Pourquoi un segment dynamique plutôt que cinq fichiers ────────────────
//
// Cinq fichiers auraient été cinq fois le même : charger la vitrine, résoudre
// le gabarit, assembler les sections, rendre. C'est exactement l'erreur que le
// moteur de sections a corrigée sur les gabarits — trois composants qui
// dessinaient chacun leur bannière, donc trois fois la même correction à faire,
// et deux fois faite en pratique.
//
// Next donne la priorité aux segments statiques : `/cart`, `/checkout`,
// `/products`, `/favoris`, `/collections/...` continuent d'être servis par
// leurs routes, et ce fichier ne reçoit que ce qui reste. Un segment inconnu
// rend 404, comme avant.
//
// ── Une page vide n'existe pas ─────────────────────────────────────────────
//
// Si le marchand n'a rien écrit pour cette page, l'adresse rend 404 — et le
// pied de page ne l'aura de toute façon pas proposée, puisque les deux lisent
// la même liste. Une vitrine de trois produits n'a pas à porter cinq pages
// blanches pour ressembler à un grand site.
// ─────────────────────────────────────────────────────────────────────────────

import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { loadStore, buildStorefrontContext } from '../../../../lib/storefrontData';
import { loadInfoPage } from '../../../../lib/storefrontHome';
import { infoPageBySlug, infoPageHasContent } from '../../../../lib/storefrontPages';
import { storePublicUrl } from '../../../../lib/storeTheme';
import { toStoreView } from '../../../../components/store/types';
import { resolveTemplateId } from '../../../../components/store/templates/registry';
import { SectionRenderer } from '../../../../components/store/sections';
import { TrackView } from '../../../../components/store/blocks/TrackView';

type Props = { params: Promise<{ slug: string; page: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, page: segment } = await params;
  const page  = infoPageBySlug(segment);
  if (!page) return {};

  const store = await loadStore(slug);
  if (!store) return {};

  const nom = store.store_name ?? 'Boutique';

  return {
    title: page.title,
    // La description dit de QUI il s'agit : « Livraison & retours » seul, dans
    // un résultat de recherche, ne désigne aucune boutique.
    description: `${page.title} — ${nom}.`,
    alternates: { canonical: `${storePublicUrl(store)}/${page.slug}` },
    openGraph: { type: 'website', siteName: nom, title: page.title },
  };
}

export default async function StoreInfoPage({ params }: Props) {
  const { slug, page: segment } = await params;

  const page = infoPageBySlug(segment);
  if (!page) notFound();

  const store = await loadStore(slug);
  if (!store) notFound();

  const ctx        = await buildStorefrontContext(store, slug);
  const templateId = resolveTemplateId(store.template_id);
  const view       = toStoreView(store, { base: ctx.base, origin: ctx.origin, templateId });

  const { data, sections } = await loadInfoPage(store, { slug, templateId, page });

  // Les avis viennent d'être lus par `loadInfoPage` quand la page en dépend :
  // le prédicat les reçoit sans une lecture de plus.
  if (!infoPageHasContent(page, { ...view, hasReviews: data.reviews.length > 0 })) notFound();

  return (
    <>
      <TrackView businessId={store.business_id} event="page_view" path={`/${page.slug}`} />

      {/* Le titre de la page et le chemin pour en sortir. Le rythme vertical
          est celui du gabarit (`--st-section-y`), comme toute section : une
          page interne n'est pas une pièce rapportée. */}
      <div
        className="mx-auto max-w-6xl px-4 sm:px-6"
        style={{ paddingTop: 'var(--st-section-y)' }}
      >
        <nav
          aria-label="Fil d'Ariane"
          className="mb-4 flex flex-wrap items-center gap-2 text-[12px] text-[var(--st-ink-3)]"
        >
          {/* `py-2 -my-2` : la zone touchée fait 34 pixels de haut là où le texte
              n'en fait que 18, sans rien déplacer autour. Un fil d'Ariane écrit
              en 12 pixels est le seul lien de sortie de ces pages sur
              téléphone — le manquer du pouce renvoie au bouton « retour ». */}
          <Link href={view.base || '/'} className="-my-2 py-2 hover:text-[var(--st-ink-2)]">Accueil</Link>
          <span aria-hidden>/</span>
          <span className="text-[var(--st-ink-2)]">{page.label}</span>
        </nav>

        <h1
          className="text-[var(--st-ink)]"
          style={{
            fontFamily:    'var(--st-font-heading)',
            fontSize:      'var(--st-h1)',
            lineHeight:    1.1,
            letterSpacing: 'var(--st-tracking)',
          }}
        >
          {page.label}
        </h1>
      </div>

      <SectionRenderer store={view} data={data} sections={sections} infoPage={page.key} />
    </>
  );
}
