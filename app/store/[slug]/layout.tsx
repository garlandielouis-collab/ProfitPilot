// ─────────────────────────────────────────────────────────────────────────────
// Le layout d'une vitrine — le point d'entrée du moteur de gabarits
//
// Il fait trois choses, et rien d'autre :
//
//   1. Résout la vitrine et valide son thème (`buildStorefrontContext`).
//   2. Charge l'index de recherche et les rayons de la navigation.
//   3. Publie les métadonnées et le balisage Schema.org.
//
// L'enveloppe elle-même — variables CSS, polices, panier, en-tête, pied,
// tiroir — vit dans `components/store/StorefrontShell.tsx`, partagée avec
// l'aperçu de gabarit du marchand. Recopiée ici, elle aurait vieilli à la
// première correction faite dans l'autre.
// ─────────────────────────────────────────────────────────────────────────────

import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import {
  loadStore, loadCatalog, loadCategories, loadReviews, buildStorefrontContext,
} from '../../../lib/storefrontData';
import { infoPagesFor } from '../../../lib/storefrontPages';
import { storePublicUrl } from '../../../lib/storeTheme';
import { toStoreView } from '../../../components/store/types';
import { resolveTemplateId } from '../../../components/store/templates/registry';
import { StorefrontShell } from '../../../components/store/StorefrontShell';

type Props = {
  params: Promise<{ slug: string }>;
  children: React.ReactNode;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const store = await loadStore(slug);
  if (!store) return { title: 'Boutique introuvable' };

  const ctx   = await buildStorefrontContext(store, slug);
  const title = store.meta_title ?? store.store_name ?? 'Boutique';
  const description =
    store.meta_description ?? store.tagline ?? `Commandez en ligne chez ${title}.`;
  const url   = ctx.origin || storePublicUrl(store);
  const image = ctx.theme.hero.imageUrl ?? store.banner_url ?? store.logo_url ?? undefined;

  return {
    // `absolute`, et non `default` : le layout racine impose le gabarit
    // « %s | ProfitPilot », et un `default` s'y soumet. L'onglet du client du
    // marchand affichait donc « Lalou Store | ProfitPilot » — notre marque sur
    // sa vitrine, exactement ce que le commentaire ci-dessous prétendait
    // éviter. Seul `absolute` rompt la chaîne des gabarits parents.
    // `template` reste pour les pages filles : « Savon karité · Lalou Store ».
    title: { absolute: title, template: `%s · ${title}` },
    description,
    // La vitrine du marchand n'est pas une page de ProfitPilot : elle ne porte
    // ni notre nom dans le titre, ni notre icône dans l'onglet.
    icons: store.logo_url ? { icon: store.logo_url } : undefined,
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      siteName: title,
      title,
      description,
      url,
      locale: 'fr_HT',
      images: image ? [{ url: image }] : undefined,
    },
    twitter: {
      card: image ? 'summary_large_image' : 'summary',
      title,
      description,
      images: image ? [image] : undefined,
    },
    robots: { index: store.is_active, follow: store.is_active },
  };
}

export default async function StoreLayout({ params, children }: Props) {
  const { slug } = await params;
  const store = await loadStore(slug);
  if (!store) notFound();

  const ctx        = await buildStorefrontContext(store, slug);
  const templateId = resolveTemplateId(store.template_id);
  const view       = toStoreView(store, { base: ctx.base, origin: ctx.origin, templateId });

  // L'index de recherche : le catalogue déjà en cache, réduit aux champs que la
  // recherche utilise. Le `loadCatalog` ci-dessous est le même appel que celui
  // de la page d'accueil — il ne coûte donc pas une seconde lecture.
  const catalog = await loadCatalog(store.business_id, {
    sort: 'name',
    limit: 200,
    onlyPublished: ctx.theme.catalog.mode === 'selected',
  });

  const searchIndex = catalog.map((p) => ({ ...p, images: [] }));

  // Les rayons de la navigation. Une vraie navigation e-commerce (§13) mène aux
  // collections ; sans eux, l'en-tête n'offrait qu'un lien « Produits », ce qui
  // est un sommaire, pas une navigation. Même lecture que la page d'accueil,
  // donc pas de requête supplémentaire.
  const navCategories = await loadCategories(
    store.business_id,
    ctx.theme.catalog.mode === 'selected',
  );

  // Les pages internes que CETTE vitrine porte — « À propos », « Contact »,
  // « FAQ », « Livraison & retours », « Témoignages ». Une seule résolution,
  // partagée par l'en-tête, le pied de page et le plan du site : un lien
  // proposé quelque part mène forcément à une page qui existe.
  //
  // Les avis sont lus ici parce que la page « Témoignages » n'ouvre qu'à partir
  // du premier avis publié. C'est la même lecture en cache que la page
  // d'accueil, donc pas une requête de plus.
  const reviews   = await loadReviews(store.business_id);
  const infoPages = infoPagesFor({ ...view, hasReviews: reviews.length > 0 });

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Store',
    name: view.name,
    url: ctx.origin || storePublicUrl(store),
    ...(store.logo_url ? { logo: store.logo_url } : {}),
    ...(store.tagline ? { description: store.tagline } : {}),
    ...(store.contact_phone ? { telephone: store.contact_phone } : {}),
    ...(store.contact_address
      ? { address: { '@type': 'PostalAddress', streetAddress: store.contact_address, addressCountry: 'HT' } }
      : {}),
    currenciesAccepted: view.currency,
  };

  return (
    <>
      <StorefrontShell
        view={view}
        businessId={store.business_id}
        searchIndex={searchIndex}
        categories={navCategories}
        infoPages={infoPages}
      >
        {children}
      </StorefrontShell>

      <script
        type="application/ld+json"
        // Contenu construit par nous à partir de champs texte du marchand ;
        // JSON.stringify échappe déjà les guillemets, et `<` ne peut pas
        // apparaître en sortie de stringify sans être encodé par le remplacement
        // ci-dessous — sans lui, un nom de boutique contenant « </script> »
        // fermerait la balise.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
    </>
  );
}
