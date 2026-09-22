import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import {
  loadStore, loadProduct, loadCatalog, loadRatings, buildStorefrontContext,
} from '../../../../../lib/storefrontData';
import { loadProductPageSections } from '../../../../../lib/storefrontHome';
import { storePublicUrl } from '../../../../../lib/storeTheme';
import { toStoreView } from '../../../../../components/store/types';
import { resolveTemplateId } from '../../../../../components/store/templates/registry';
import { pdpProfileFor, TAB_SECTION } from '../../../../../lib/storeProductPage';
import { ProductGrid } from '../../../../../components/store/blocks/ProductGrid';
import { RelatedStrip } from '../../../../../components/store/product/RelatedStrip';
import { BoughtTogether } from '../../../../../components/store/product/BoughtTogether';
import { TrackView } from '../../../../../components/store/blocks/TrackView';
import { getBoughtTogetherIds } from '../../../../actions/store-public';
import { getProductReviews } from '../../../../actions/store-content';
import { SectionRenderer } from '../../../../../components/store/sections';
import { ProductDetailClient } from './ProductDetailClient';

type Props = { params: Promise<{ slug: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, id } = await params;
  const store = await loadStore(slug);
  if (!store) return {};
  const product = await loadProduct(store.business_id, id);
  if (!product) return { title: 'Produit introuvable' };

  // Ce que le marchand a écrit pour Google passe avant ce qu'on peut déduire.
  // L'ordre dit la précision décroissante : le texte fait pour la balise, puis
  // l'accroche — une phrase, la bonne longueur —, puis la description longue
  // que Google coupera, puis un pis-aller qui vaut mieux qu'une balise vide.
  const title = product.seo_title?.trim() || product.name;
  const description =
    product.seo_description?.trim()
    || product.short_description?.trim()
    || product.description?.trim()
    || `${product.name} — ${store.store_name ?? 'Boutique'}`;

  return {
    title,
    description,
    openGraph: {
      type:  'website',
      title,
      description,
      images: product.image_url ? [{ url: product.image_url }] : undefined,
    },
  };
}

export default async function ProductDetailPage({ params }: Props) {
  const { slug, id } = await params;
  const store = await loadStore(slug);
  if (!store) notFound();

  const product = await loadProduct(store.business_id, id);
  if (!product) notFound();

  const ctx        = await buildStorefrontContext(store, slug);
  const templateId = resolveTemplateId(store.template_id);
  const view       = toStoreView(store, { base: ctx.base, origin: ctx.origin, templateId });

  // Un produit dépublié n'est pas seulement absent de la grille : son URL ne
  // doit pas rester une porte dérobée vers un article que le marchand a retiré.
  if (ctx.theme.catalog.mode === 'selected' && !product.is_published) notFound();

  const onlyPublished = ctx.theme.catalog.mode === 'selected';

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

  // ── « Vous aimerez aussi » (§26) ──────────────────────────────────────────
  //
  // Deux sources, dans cet ordre : ce que d'autres ont RÉELLEMENT acheté avec
  // ce produit, puis la même catégorie pour compléter. La co-occurrence est
  // meilleure que la similarité — elle vient des clients, pas d'une hypothèse —
  // mais elle n'existe pas tant que la boutique n'a pas vendu.
  // ── Deux listes, et deux intentions (§26) ──────────────────────────────
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

  const origin  = ctx.origin || storePublicUrl(store);
  const pageUrl = `${origin}${ctx.base}/products/${product.id}`;

  // Schema.org — le prix, la disponibilité et la devise, tels quels. Aucun
  // champ inventé : un balisage qui annonce une note moyenne inexistante fait
  // désindexer la vitrine, pas remonter.
  const productLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    ...(product.description ? { description: product.description } : {}),
    ...(product.image_url ? { image: [product.image_url] } : {}),
    ...(product.category ? { category: product.category } : {}),
    ...(product.sku ? { sku: product.sku } : {}),
    // La note agrégée n'apparaît QUE s'il y a de vrais avis publiés. Un
    // balisage qui annonce une note inexistante fait désindexer la vitrine,
    // pas remonter — et c'est aussi la règle du §27, appliquée au SEO.
    ...(reviewData.count > 0
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: String(reviewData.average),
            reviewCount: String(reviewData.count),
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
      { '@type': 'ListItem', position: 1, name: 'Accueil',  item: `${origin}${ctx.base}` },
      { '@type': 'ListItem', position: 2, name: 'Produits', item: `${origin}${ctx.base}/products` },
      { '@type': 'ListItem', position: 3, name: product.name, item: pageUrl },
    ],
  };

  return (
    <>
      {/* Trois colonnes réclament de la place : à 1152 px, la galerie, l'achat
          et le rail se serrent au point que le prix passe sur deux lignes. Les
          gabarits restés en deux colonnes gardent la largeur d'avant. */}
      <div className={`mx-auto ${profile.rail ? 'max-w-7xl' : 'max-w-6xl'} px-4 py-8 sm:px-6 sm:py-12`}>
      <TrackView businessId={store.business_id} event="product_view" productId={product.id} />

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

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([productLd, breadcrumbLd]).replace(/</g, '\\u003c'),
        }}
      />
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
