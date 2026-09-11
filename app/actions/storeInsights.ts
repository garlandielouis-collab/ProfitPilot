'use server';

// ─────────────────────────────────────────────────────────────────────────────
// L'état de la boutique, et ce qu'elle a produit (§30, §43, §44, §45)
//
// Trois lectures, un fichier :
//
//   `getStoreOverview()`   le score de santé et les onze étapes du lancement.
//   `getStoreAnalytics()`  l'entonnoir, les produits, la provenance, les
//                          paniers perdus.
//   `markStorePreviewed()` la seule étape du lancement qui ne laisse pas de
//                          trace en base toute seule.
//
// ── Rien n'est stocké, tout est relu ────────────────────────────────────────
//
// Ni le score ni l'avancement du lancement ne sont enregistrés. Ils se
// recalculent à chaque ouverture, depuis les mêmes tables que la vitrine.
// C'est ce qui les empêche de mentir : une boutique dépubliée repasse à
// « à faire » sur l'étape « Publier », et un produit dont on retire la photo
// fait redescendre la note. Un avancement figé en base afficherait « terminé »
// sur une boutique fermée.
//
// ── Chaque agrégat se fait en base ──────────────────────────────────────────
//
// `store_funnel`, `store_top_products`, `store_traffic_sources` et
// `store_abandoned_carts` sont des fonctions SQL. Compter côté Node
// demanderait de rapatrier `store_analytics_events` entier — la table qui
// grossit le plus vite de tout le schéma.
//
// Toutes tolèrent une base en retard : une fonction absente rend zéro, jamais
// une erreur. Ce dépôt déploie le code avant le SQL (les migrations se collent
// à la main dans l'éditeur Supabase), et un écran qui casse pendant cet
// intervalle est un écran que le marchand croit cassé pour de bon.
// ─────────────────────────────────────────────────────────────────────────────

import { revalidatePath } from 'next/cache';

import { assertFeature } from '../../lib/entitlements';
import { getBusinessContext, requirePermission } from '../../lib/serverAuth';
import { getSupabaseService } from '../../lib/supabaseServiceClient';
import { parseThemeConfig, storePublicUrl } from '../../lib/storeTheme';
import { computeStoreHealth, type StoreHealth, type StoreHealthFacts } from '../../lib/storeHealth';

const COMMERCE_FEATURE = 'online_store' as const;

/** Les modes qui exigent des identifiants chez un fournisseur. */
const GATEWAY_METHODS = ['moncash', 'natcash'] as const;

type HealthProduct = {
  id: string;
  category: string | null;
  image_url: string | null;
  enhanced_image_url: string | null;
  store_description: string | null;
  seo_title: string | null;
  is_published_to_store: boolean | null;
};

/**
 * Le catalogue, réduit à ce que le score regarde.
 *
 * Deux requêtes possibles, et c'est délibéré : `store_description` (20260903)
 * et `seo_title` (20260907) n'existent pas sur une base dont les migrations
 * n'ont pas encore été collées dans l'éditeur SQL. PostgREST refuse alors la
 * SELECT entière, `data` vaut `null`, et l'écran annoncerait « 0 produit » à un
 * marchand qui en a quarante — un chiffre faux, ce que ce produit s'interdit.
 *
 * On retombe donc sur les colonnes qui existent depuis toujours. Le score perd
 * deux critères, il n'invente rien.
 */
async function loadHealthProducts(businessId: string): Promise<HealthProduct[]> {
  const svc = getSupabaseService();

  const full = await svc
    .from('products')
    .select(
      'id, category, image_url, enhanced_image_url, ' +
      'store_description, seo_title, is_published_to_store',
    )
    .eq('business_id', businessId)
    .limit(1000);

  // Le double passage par `unknown` : quand la SELECT nomme une colonne absente,
  // PostgREST type `data` en `GenericStringError[]`, qui ne recoupe pas
  // `HealthProduct`. Le garde-fou est la ligne au-dessus — on n'est ici que si
  // `error` est nul, donc la réponse porte bien des produits.
  if (!full.error) return (full.data ?? []) as unknown as HealthProduct[];

  const basic = await svc
    .from('products')
    .select('id, category, image_url')
    .eq('business_id', businessId)
    .limit(1000);

  return ((basic.data ?? []) as Array<{ id: string; category: string | null; image_url: string | null }>)
    .map((p) => ({
      id: p.id,
      category: p.category,
      image_url: p.image_url,
      // Absentes du schéma : traitées comme remplies, pour ne pas reprocher au
      // marchand un manque que l'application ne sait pas encore mesurer.
      enhanced_image_url: null,
      store_description: 'n/a',
      seo_title: 'n/a',
      is_published_to_store: true,
    }));
}

// ═══════════════════════════════════════════════════════════════════════════
// L'aperçu : santé + lancement
// ═══════════════════════════════════════════════════════════════════════════

export type LaunchStep = {
  key: string;
  /** L'intitulé du §45, en français du produit. */
  label: string;
  /** Ce que l'étape demande, en une phrase. */
  hint: string;
  done: boolean;
  /** Où on la fait. Une adresse interne, ou l'URL publique pour l'aperçu. */
  href: string;
  /** Vrai pour l'aperçu : le lien s'ouvre dans un onglet. */
  external?: boolean;
};

export type StoreOverview = {
  storeExists: boolean;
  isActive: boolean;
  publicUrl: string;
  storeName: string;
  health: StoreHealth;
  steps: LaunchStep[];
  /** Combien des onze étapes sont faites. */
  stepsDone: number;
  /** Le nombre de commandes déjà reçues. Zéro n'est pas un échec, c'est un début. */
  orderCount: number;
};

export async function getStoreOverview(): Promise<StoreOverview> {
  await assertFeature(COMMERCE_FEATURE);
  const { businessId } = await getBusinessContext();
  const svc = getSupabaseService();

  const [businessRes, storeRes, products, credsRes, ordersRes] = await Promise.all([
    svc.from('businesses').select('name, sector, phone, email').eq('id', businessId).maybeSingle(),
    svc.from('store_settings').select('*').eq('business_id', businessId).maybeSingle(),
    loadHealthProducts(businessId),
    svc.from('store_payment_credentials').select('credentials').eq('business_id', businessId).maybeSingle(),
    svc.from('orders').select('id', { count: 'exact', head: true }).eq('business_id', businessId),
  ]);

  const business = (businessRes.data ?? null) as any;
  const store = (storeRes.data ?? null) as any;

  const theme = parseThemeConfig(store?.theme_config, {
    primary_color: store?.primary_color,
    secondary_color: store?.secondary_color,
  });

  // Le mode de catalogue décide de ce qui est « en vitrine ». En mode « tout »,
  // une fiche non cochée est quand même visible : la compter comme non publiée
  // ferait afficher « 0 produit en vitrine » à un marchand dont la boutique en
  // montre quarante.
  const selectedOnly = theme.catalog.mode === 'selected';
  const visible = products.filter((p) => !selectedOnly || p.is_published_to_store === true);

  const paymentMethods: string[] = Array.isArray(store?.payment_methods)
    ? store.payment_methods.map((m: unknown) => String(m))
    : [];

  const credentials = ((credsRes.data ?? null) as any)?.credentials ?? {};
  const gatewayMissingCredentials = GATEWAY_METHODS.some(
    (g) =>
      paymentMethods.includes(g) &&
      !(credentials?.[g]?.client_id && credentials?.[g]?.client_secret),
  );

  const facts: StoreHealthFacts = {
    isActive: store?.is_active === true,
    productCount: products.length,
    publishedCount: visible.length,
    missingImage: visible.filter((p) => !p.image_url && !p.enhanced_image_url).length,
    missingDescription: visible.filter((p) => !String(p.store_description ?? '').trim()).length,
    missingSeo: visible.filter((p) => !String(p.seo_title ?? '').trim()).length,
    // `products.category` reste tenue à jour par un déclencheur depuis la
    // convergence des catégories (20260905) : elle suffit à savoir si la fiche
    // est rangée, et elle existe sur toutes les bases.
    missingCategory: visible.filter((p) => !String(p.category ?? '').trim()).length,
    hasStoreSeo: Boolean(
      String(store?.meta_title ?? '').trim() && String(store?.meta_description ?? '').trim(),
    ),
    hasLogo: Boolean(store?.logo_url),
    hasTagline: Boolean(String(store?.tagline ?? '').trim()),
    // Une palette touchée, c'est une palette qui n'est plus celle par défaut.
    hasCustomColors:
      store?.theme_config != null &&
      typeof store.theme_config === 'object' &&
      'palette' in (store.theme_config as object),
    hasContact: Boolean(
      String(store?.contact_phone ?? business?.phone ?? '').trim() ||
        String(store?.contact_email ?? business?.email ?? '').trim(),
    ),
    paymentMethodCount: paymentMethods.length,
    gatewayMissingCredentials,
    shippingModeCount: Array.isArray(store?.shipping_modes) ? store.shipping_modes.length : 0,
  };

  const health = computeStoreHealth(facts);

  const slug = store?.slug ?? '';
  const publicUrl = slug
    ? storePublicUrl({ slug, custom_domain: store?.custom_domain ?? null })
    : '';

  // ── Les étapes du §45 ─────────────────────────────────────────────────────
  //
  // Chacune se LIT. « Choisir un gabarit » est faite dès qu'une ligne
  // `store_settings` existe : on ne peut pas en créer une sans passer par
  // l'éditeur, et le gabarit y est le premier choix.
  const steps: LaunchStep[] = [
    {
      key: 'sector',
      label: "Type d'activité",
      hint: 'Ce que vous vendez — cela oriente le gabarit et les textes.',
      done: Boolean(String(business?.sector ?? '').trim()),
      href: '/settings',
    },
    {
      key: 'template',
      label: 'Gabarit',
      hint: "L'ossature de la vitrine : ce qui s'affiche, et dans quel ordre.",
      done: Boolean(store?.id),
      href: '/boutique/builder',
    },
    {
      key: 'logo',
      label: 'Logo',
      hint: 'Votre marque en haut de chaque page.',
      done: facts.hasLogo,
      href: '/boutique/builder',
    },
    {
      key: 'colors',
      label: 'Couleurs',
      hint: 'Deux couleurs suffisent. Le contraste est vérifié pour vous.',
      done: facts.hasCustomColors,
      href: '/boutique/builder',
    },
    {
      key: 'content',
      label: 'Contenu de la page',
      hint: 'Accroche, réassurance, questions fréquentes : une section vide ne s\'affiche pas.',
      // Lue, comme les autres : un seul bloc rempli suffit à considérer que le
      // marchand s'est emparé de l'onglet Contenu. Le gabarit affiche ce qu'il
      // a saisi et rien d'autre — tant qu'il n'a rien saisi, sa page se réduit
      // à une bannière et une grille, quel que soit le gabarit choisi.
      done: Boolean(
        theme.hero.headline.trim()
        || theme.brandStory.body.trim()
        || theme.trust.badges.length > 0
        || theme.faq.items.length > 0
        || theme.stats.items.length > 0
        || theme.process.steps.length > 0
        || theme.gallery.images.length > 0,
      ),
      href: '/boutique/builder',
    },
    {
      key: 'products',
      label: 'Produits',
      hint: 'Ce qui part en ligne, coché fiche par fiche.',
      done: facts.publishedCount > 0,
      href: '/boutique/builder',
    },
    {
      key: 'payment',
      label: 'Paiement',
      hint: 'Comment vos clients paient — et avec quels identifiants.',
      done: facts.paymentMethodCount > 0 && !facts.gatewayMissingCredentials,
      href: '/boutique',
    },
    {
      key: 'shipping',
      label: 'Livraison',
      hint: 'Vos zones et vos tarifs. Le retrait en boutique compte.',
      done: facts.shippingModeCount > 0,
      href: '/boutique',
    },
    {
      key: 'copy',
      label: 'Textes du catalogue',
      hint: 'Chaque fiche visible a une description. Le Studio les rédige.',
      done: facts.publishedCount > 0 && facts.missingDescription === 0,
      href: '/boutique/merchandising',
    },
    {
      key: 'preview',
      label: 'Aperçu',
      hint: 'Regardez votre boutique comme un client la verra.',
      done: Boolean(theme.launch.previewedAt),
      href: publicUrl || '/boutique/builder',
      external: Boolean(publicUrl),
    },
    {
      key: 'publish',
      label: 'Publication',
      hint: 'La boutique devient accessible à tout le monde.',
      done: facts.isActive,
      href: '/boutique/builder',
    },
  ];

  return {
    storeExists: Boolean(store?.id),
    isActive: facts.isActive,
    publicUrl,
    storeName: store?.store_name ?? business?.name ?? 'Ma boutique',
    health,
    steps,
    stepsDone: steps.filter((s) => s.done).length,
    orderCount: ordersRes.count ?? 0,
  };
}

/**
 * Note que le marchand a ouvert l'aperçu de sa vitrine.
 *
 * Écrit dans `theme_config.launch`, à côté du reste du contenu de vitrine, et
 * relu par `parseThemeConfig` — donc jamais écrasé par un enregistrement de
 * design, qui repart du même objet.
 */
export async function markStorePreviewed(): Promise<void> {
  await assertFeature(COMMERCE_FEATURE);
  const { businessId } = await requirePermission('settings:write');
  const svc = getSupabaseService();

  const { data } = await svc
    .from('store_settings')
    .select('id, theme_config')
    .eq('business_id', businessId)
    .maybeSingle();

  const row = (data ?? null) as any;
  if (!row?.id) return;

  const theme = parseThemeConfig(row.theme_config);
  if (theme.launch.previewedAt) return; // déjà noté : on ne réécrit pas pour rien

  // Le JSON de la base, complété — pas le thème résolu. Réécrire celui-ci
  // posait une palette que personne n'avait choisie, et figeait les couleurs
  // de tous les gabarits (voir `themeForStorage`).
  const raw = row.theme_config && typeof row.theme_config === 'object' ? row.theme_config : {};

  await svc
    .from('store_settings')
    .update({
      theme_config: { ...raw, launch: { previewedAt: new Date().toISOString() } },
    })
    .eq('id', row.id);

  revalidatePath('/boutique/lancement');
}

// ═══════════════════════════════════════════════════════════════════════════
// L'analyse (§30)
// ═══════════════════════════════════════════════════════════════════════════

export type FunnelStage = {
  key: string;
  label: string;
  value: number;
  /** Le taux de passage depuis l'étape précédente. `null` sur la première. */
  fromPrevious: number | null;
};

export type TopProduct = {
  productId: string;
  name: string;
  views: number;
  unitsSold: number;
  revenue: number;
};

export type TrafficSource = {
  source: string;
  sessions: number;
};

export type StoreAnalytics = {
  days: number;
  funnel: FunnelStage[];
  /** Visiteurs → achats, en pourcentage. `null` sans visiteur : pas de division par zéro. */
  conversionRate: number | null;
  revenue: number;
  orders: number;
  averageOrderValue: number;
  topProducts: TopProduct[];
  sources: TrafficSource[];
  abandonedSessions: number;
  abandonedValue: number;
  currency: string;
  /** Faux quand la table de mesure n'existe pas encore : l'écran le dit. */
  measurementReady: boolean;
};

function rate(from: number, to: number): number | null {
  if (from <= 0) return null;
  return Math.round((to / from) * 1000) / 10;
}

export async function getStoreAnalytics(days = 30): Promise<StoreAnalytics> {
  await assertFeature(COMMERCE_FEATURE);
  const { businessId } = await getBusinessContext();
  const svc = getSupabaseService();

  const window = [7, 30, 90].includes(days) ? days : 30;
  const since = new Date(Date.now() - window * 86_400_000).toISOString();

  const [funnelRes, topRes, sourcesRes, abandonRes, ordersRes, storeRes] = await Promise.all([
    svc.rpc('store_funnel', { p_business_id: businessId, p_days: window }),
    svc.rpc('store_top_products', { p_business_id: businessId, p_days: window, p_limit: 8 }),
    svc.rpc('store_traffic_sources', { p_business_id: businessId, p_days: window }),
    svc.rpc('store_abandoned_carts', { p_business_id: businessId, p_days: window }),
    svc
      .from('orders')
      .select('total, status')
      .eq('business_id', businessId)
      .gte('created_at', since)
      .limit(2000),
    svc.from('store_settings').select('currency').eq('business_id', businessId).maybeSingle(),
  ]);

  const f = (Array.isArray(funnelRes.data) ? funnelRes.data[0] : funnelRes.data) as any;
  const visitors = Number(f?.visitors ?? 0);
  const productViews = Number(f?.product_views ?? 0);
  const addToCarts = Number(f?.add_to_carts ?? 0);
  const checkouts = Number(f?.checkouts_started ?? 0);
  const purchases = Number(f?.purchases ?? 0);

  const funnel: FunnelStage[] = [
    { key: 'visitors', label: 'Visiteurs', value: visitors, fromPrevious: null },
    { key: 'product_views', label: 'Fiches vues', value: productViews, fromPrevious: rate(visitors, productViews) },
    { key: 'add_to_cart', label: 'Ajouts au panier', value: addToCarts, fromPrevious: rate(productViews, addToCarts) },
    { key: 'checkout', label: 'Paiements entamés', value: checkouts, fromPrevious: rate(addToCarts, checkouts) },
    { key: 'purchase', label: 'Achats', value: purchases, fromPrevious: rate(checkouts, purchases) },
  ];

  // Le chiffre d'affaires vient de `orders`, jamais des événements : un
  // événement se perd sur une connexion coupée, une commande non.
  const orders = ((ordersRes.data ?? []) as any[]).filter(
    (o) => o.status !== 'cancelled' && o.status !== 'refunded',
  );
  const revenue = orders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);

  const abandon = (Array.isArray(abandonRes.data) ? abandonRes.data[0] : abandonRes.data) as any;

  return {
    days: window,
    funnel,
    conversionRate: rate(visitors, purchases),
    revenue,
    orders: orders.length,
    averageOrderValue: orders.length > 0 ? revenue / orders.length : 0,
    topProducts: ((topRes.data ?? []) as any[]).map((r) => ({
      productId: r.product_id,
      name: r.product_name,
      views: Number(r.views) || 0,
      unitsSold: Number(r.units_sold) || 0,
      revenue: Number(r.revenue) || 0,
    })),
    sources: ((sourcesRes.data ?? []) as any[]).map((r) => ({
      source: String(r.source ?? 'direct'),
      sessions: Number(r.sessions) || 0,
    })),
    abandonedSessions: Number(abandon?.sessions ?? 0),
    abandonedValue: Number(abandon?.estimated_value ?? 0),
    currency: ((storeRes.data ?? null) as any)?.currency ?? 'HTG',
    measurementReady: !funnelRes.error,
  };
}
