// ─────────────────────────────────────────────────────────────────────────────
// Le corps de la fiche produit, rendu pour la boutique ET pour l'aperçu
//
// ── Pourquoi il sort de `page.tsx` ─────────────────────────────────────────
//
// Les vingt-trois gabarits ont chacun leur fiche (`storeProductPage.ts`), et le
// marchand ne pouvait en voir qu'UNE : celle de son gabarit en ligne.
//
// L'aperçu (`/apercu/[template]`) ne rendait que l'accueil, et ses liens
// portaient l'adresse de la vraie boutique. Chaque clic sur un produit quittait
// donc l'aperçu pour la fiche EN LIGNE, dessinée dans le gabarit réel — Lalou
// Store, en `proximite`, montrait la fiche de Proximité depuis l'aperçu de
// Style Chic, de Tech Store et de Food Market. Vingt-trois fiches écrites,
// une seule visible, et rien pour dire au marchand qu'il avait changé de
// gabarit en changeant de page.
//
// Le corps est ici, écrit une fois, et deux routes le rendent :
//
//   /store/[slug]/products/[id]       la boutique, dans son gabarit
//   /apercu/[template]/products/[id]  l'aperçu, dans le gabarit REGARDÉ
//
// Deux copies auraient divergé au premier bloc ajouté — et c'est l'aperçu qui
// aurait menti, sans que personne ne le voie, puisque personne ne le compare.
//
// ── Ce qui diffère entre les deux ──────────────────────────────────────────
//
// Deux choses, et elles ne regardent que la boutique publique :
//
//   la mesure     une vue de fiche comptée depuis l'aperçu gonflerait les
//                 statistiques du marchand avec ses propres visites
//   le balisage   Schema.org sert les moteurs de recherche ; un aperçu n'est
//                 pas indexé (`robots: noindex`), et son adresse n'est pas
//                 celle qu'un client partagera
//
// Tout le reste — données, blocs, ordre — est le même, et c'est le but.
// ─────────────────────────────────────────────────────────────────────────────

import { loadCatalog, loadRatings } from '../../../../../lib/storefrontData';
import { loadProductPageSections } from '../../../../../lib/storefrontHome';
import { pdpProfileFor, TAB_SECTION } from '../../../../../lib/storeProductPage';
import { ProductGrid } from '../../../../../components/store/blocks/ProductGrid';
import { RelatedStrip } from '../../../../../components/store/product/RelatedStrip';
import { BoughtTogether } from '../../../../../components/store/product/BoughtTogether';
import { TrackView } from '../../../../../components/store/blocks/TrackView';
import { SectionRenderer } from '../../../../../components/store/sections';
import { getBoughtTogetherIds } from '../../../../actions/store-public';
import { getProductReviews } from '../../../../actions/store-content';
import { ProductDetailClient } from './ProductDetailClient';
import type { StoreSettings } from '../../../../actions/store-public';
import type { StoreProduct, StoreView } from '../../../../../components/store/types';
import type { TemplateId } from '../../../../../lib/storeTheme';

export async function ProductPageBody({
  store, product, view, templateId, slug, publicPage,
}: {
  store:      StoreSettings;
  product:    StoreProduct;
  /** La vue déjà résolue avec le gabarit à rendre, et la base de ses liens. */
  view:       StoreView;
  templateId: TemplateId;
  slug:       string;
  /**
   * La page publique de la boutique : l'adresse à baliser pour les moteurs,
   * et la mesure de la visite. `null` dans l'aperçu, qui ne fait ni l'un ni
   * l'autre.
   */
  publicPage: { origin: string } | null;
}) {
  const onlyPublished = view.theme.catalog.mode === 'selected';

  const [sameCategory, togetherIds, reviewData, ratings, pdp] = await Promise.all([
    loadCatalog(store.business_id, {
      category: product.category ?? undefined,
      limit: 12,
      onlyPublished,
    }),
    getBoughtTogetherIds(store.business_id, product.id, 4),
    getProductReviews(product.id),
    loadRatings(store.business_id),
    // Ce que CE gabarit reprend de la boutique sous la fiche (§16, §34) : la
    // composition chez un traiteur, la fabrication chez un artisan, la grille
    // de gros chez un éleveur. Une lecture de plus, dans le même aller-retour.
    loadProductPageSections(store, { slug, templateId }),
  ]);

  // ── Deux listes, et deux intentions (§26) ──────────────────────────────────
  //
  // Elles n'en faisaient qu'une, et la fusion perdait ce qui les distingue.
  //
  //   commandés ensemble   ce que d'autres ont RÉELLEMENT mis dans la même
  //                        commande. Un fait, pas une hypothèse — et c'est ce
  //                        qui autorise le bouton d'ajout.
  //   aimerez aussi        le même rayon, faute de mieux. Une ressemblance
  //                        supposée, donc sans bouton : sous une fiche, on a
  //                        déjà choisi.
  //
  // Le co-achat était en plus RAPPROCHÉ du seul rayon déjà chargé, celui du
  // produit affiché. Or un produit souvent commandé avec celui-ci est rarement
  // du même rayon — le riz et les haricots ne se ressemblent pas, ils se
  // commandent ensemble. Les identifiants absents du rayon étaient donc perdus,
  // c'est-à-dire exactement ceux qui avaient quelque chose à apprendre. Ils sont
  // relus par identifiant, et seulement s'il en manque.
  const catalogById = new Map(sameCategory.map((p) => [p.id, p]));
  const missing = togetherIds.filter((tid) => !catalogById.has(tid));
  const fetched = missing.length > 0
    ? await loadCatalog(store.business_id, { ids: missing, onlyPublished })
    : [];
  for (const p of fetched) catalogById.set(p.id, p);

  // Épuisé et non commandable : le bloc porte un bouton d'ajout, et proposer
  // d'ajouter ce qu'on ne peut pas commander est une impasse de plus dans une
  // page qui en a déjà assez.
  const together = togetherIds
    .map((tid) => catalogById.get(tid))
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .filter((p) => p.id !== product.id && (p.stock > 0 || p.allow_backorders))
    .slice(0, 4);

  const togetherIdSet = new Set(together.map((p) => p.id));

  // Le rayon complète, sans redire ce que la première liste vient de dire.
  const recommended = sameCategory
    .filter((p) => p.id !== product.id && !togetherIdSet.has(p.id))
    .filter((p, i, arr) => arr.findIndex((x) => x.id === p.id) === i)
    .slice(0, 4);

  // Les sections reprises sous la fiche, moins celles qu'un onglet porte déjà.
  const profile  = pdpProfileFor(templateId);
  const inTabs   = new Set(profile.tabs.map((t) => TAB_SECTION[t.key]).filter(Boolean));
  const repeated = pdp.sections.filter((s) => !inTabs.has(s.key));

  const jsonLd = publicPage
    ? structuredData({ product, view, origin: publicPage.origin, reviews: reviewData })
    : null;

  return (
    <>
      {/* Trois colonnes réclament de la place : à 1152 px, la galerie, l'achat
          et le rail se serrent au point que le prix passe sur deux lignes. Les
          gabarits restés en deux colonnes gardent la largeur d'avant. */}
      <div className={`mx-auto ${profile.rail ? 'max-w-7xl' : 'max-w-6xl'} px-4 py-8 sm:px-6 sm:py-12`}>
        {publicPage && (
          <TrackView businessId={store.business_id} event="product_view" productId={product.id} />
        )}

        <ProductDetailClient
          product={product}
          store={view}
          businessId={store.business_id}
          rating={{ average: reviewData.average, count: reviewData.count }}
          reviews={reviewData.reviews}
          shippingModes={Array.isArray(store.shipping_modes) ? store.shipping_modes : []}
          paymentMethods={Array.isArray(store.payment_methods) ? store.payment_methods : []}
        />

        <BoughtTogether
          store={view}
          businessId={store.business_id}
          products={together}
          title="Produits souvent commandés ensemble"
        />

        {recommended.length > 0 && (
          profile.rail ? (
            <RelatedStrip store={view} products={recommended} title={profile.relatedTitle} />
          ) : (
            <section className="mt-20">
              <h2
                className="mb-6 text-[var(--st-ink)]"
                style={{
                  fontFamily: 'var(--st-font-heading)',
                  fontSize:   'var(--st-h2)',
                  fontWeight: 600,
                }}
              >
                {profile.relatedTitle}
              </h2>
              <ProductGrid store={view} products={recommended} ratings={ratings} priorityCount={0} />
            </section>
          )
        )}

        {jsonLd && (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
          />
        )}
      </div>

      {/* ── Ce que le rayon demande sous la fiche (§16, §34) ─────────────────
          Elles sortent du cadre étroit de la fiche : ces sections posent leur
          propre largeur et leur propre rythme, comme sur la page d'accueil. Une
          section rendue dans le conteneur ci-dessus se retrouverait avec deux
          fois la marge et un rythme vertical écrasé.

          Aucune n'apparaît si le marchand ne l'a pas remplie — c'est la règle du
          moteur, et c'est elle qui permet de proposer cette reprise à tous les
          gabarits sans allonger la fiche de personne.

          Celles qu'un ONGLET porte déjà sont retirées ici : depuis que la fiche
          a ses onglets, « Composition » ou « Questions fréquentes » paraîtraient
          deux fois sur la même page, une fois repliées et une fois en pleine
          largeur. L'onglet gagne — il est à hauteur de décision. */}
      {repeated.length > 0 && (
        <SectionRenderer store={view} data={pdp.data} sections={repeated} />
      )}
    </>
  );
}

/**
 * Schema.org — le prix, la disponibilité et la devise, tels quels.
 *
 * Aucun champ inventé : la note agrégée n'apparaît QUE s'il y a de vrais avis
 * publiés. Un balisage qui annonce une note inexistante fait désindexer la
 * vitrine, pas remonter — c'est la règle du §27, appliquée au SEO.
 */
function structuredData({ product, view, origin, reviews }: {
  product: StoreProduct;
  view:    StoreView;
  origin:  string;
  reviews: { average: number; count: number };
}) {
  const pageUrl = `${origin}${view.base}/products/${product.id}`;

  const productLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    ...(product.description ? { description: product.description } : {}),
    ...(product.image_url ? { image: [product.image_url] } : {}),
    ...(product.category ? { category: product.category } : {}),
    ...(product.sku ? { sku: product.sku } : {}),
    ...(reviews.count > 0
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: String(reviews.average),
            reviewCount: String(reviews.count),
          },
        }
      : {}),
    offers: {
      '@type': 'Offer',
      price: String(product.sale_price ?? product.price),
      priceCurrency: view.currency,
      availability:
        product.stock > 0
          ? 'https://schema.org/InStock'
          : product.allow_backorders
            ? 'https://schema.org/BackOrder'
            : 'https://schema.org/OutOfStock',
      url: pageUrl,
      seller: { '@type': 'Organization', name: view.name },
    },
  };

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Accueil',  item: `${origin}${view.base}` },
      { '@type': 'ListItem', position: 2, name: 'Produits', item: `${origin}${view.base}/products` },
      { '@type': 'ListItem', position: 3, name: product.name, item: pageUrl },
    ],
  };

  return [productLd, breadcrumbLd];
}
