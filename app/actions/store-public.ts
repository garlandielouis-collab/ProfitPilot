'use server';

import { getSupabaseService } from '../../lib/supabaseServiceClient';
import { failIfUnreadable } from '../../lib/storeRead';
import { queueStoreOrderNotification } from '../../lib/storePaymentGateway';
import { attempt, UserFacingError, type ActionResult } from '../../lib/actionResult';



// ─── Types ────────────────────────────────────────────────────────────────────

export type StoreSettings = {
  id:               string;
  business_id:      string;
  slug:             string;
  is_active:        boolean;
  // ── Store Builder ──────────────────────────────────────────────────────────
  // Ces cinq colonnes arrivent avec 20260903_store_builder.sql. Elles sont
  // typées non-optionnelles côté lecture parce que la migration leur donne un
  // DEFAULT : une vitrine créée avant ne les a pas à NULL, elle les a au défaut.
  // `theme_config` reste `unknown` ici — c'est `parseThemeConfig` qui le
  // transforme en thème utilisable, et lui seul.
  template_id:      string;
  theme_config:     unknown;
  custom_domain:    string | null;
  whatsapp_number:  string | null;
  published_at:     string | null;
  store_name:       string | null;
  tagline:          string | null;
  logo_url:         string | null;
  banner_url:       string | null;
  banner_text:      string | null;
  primary_color:    string;
  secondary_color:  string;
  show_prices:      boolean;
  show_stock:       boolean;
  currency:         string;
  payment_methods:  string[];
  shipping_modes:   ShippingMode[];
  meta_title:       string | null;
  meta_description: string | null;
  contact_email:    string | null;
  contact_phone:    string | null;
  contact_address:  string | null;
  social_links:     Record<string, string>;
};

export type ShippingMode = {
  id:    string;
  label: string;
  price: number;
  days:  string;
};

export type StoreProduct = {
  id:          string;
  name:        string;
  description: string | null;
  price:       number;
  sale_price:  number | null;
  /**
   * L'image à afficher : la version retouchée par le Studio IA si elle existe,
   * sinon la photo d'origine. Les gabarits lisent ce champ et jamais
   * `original_image_url` — c'est ce qui fait qu'appliquer une retouche change la
   * vitrine sans toucher une ligne de gabarit.
   */
  image_url:   string | null;
  /** La photo telle que le marchand l'a téléversée. */
  original_image_url: string | null;
  images:      string[];
  category_id: string | null;
  category:    string | null;
  stock:       number;
  /**
   * L'ancien prix, barré à côté du prix courant. Nul quand il n'y a pas de
   * remise, ou quand il est inférieur ou égal au prix — un « ancien prix » plus
   * bas que le prix actuel n'est pas une remise, c'est une erreur de saisie, et
   * l'afficher ferait douter le visiteur du reste de la page.
   */
  compare_at_price: number | null;
  sku:         string | null;
  tags:        string[];
  /** { "taille": "M", "couleur": "Rouge" } — la matière des filtres (§20). */
  attributes:  Record<string, string>;
  /** Coché par le marchand. Ne pas confondre avec « meilleure vente ». */
  is_featured: boolean;
  /** Commandable même à zéro (§25). */
  allow_backorders: boolean;
  is_new:      boolean;
  is_published: boolean;
  created_at:  string;
};

export type StoreCategory = {
  id:    string;
  name:  string;
  count: number;
};

/**
 * Ce qu'un navigateur a le droit d'envoyer pour passer commande.
 *
 * Remarquer ce qui n'y est PAS : ni prix, ni nom de produit, ni image, ni
 * total. La version précédente acceptait `unit_price` depuis le client et le
 * stockait tel quel — un acheteur pouvait donc fixer son propre prix. Le
 * serveur relit tout depuis le catalogue (`create_store_order`), et un panier
 * n'est plus qu'une liste d'identifiants et de quantités.
 */
export type CreateOrderInput = {
  business_id:      string;
  customer_name:    string;
  customer_email:   string;
  customer_phone:   string;
  shipping_address: {
    line1:       string;
    line2?:      string;
    city:        string;
    country:     string;
  };
  shipping_mode:    string;
  payment_method:   string;
  notes?:           string;
  /**
   * Une ligne porte SOIT un produit, SOIT un lot. Jamais les deux, jamais un
   * prix : `create_store_order` relit le prix du produit dans `products` et
   * celui du lot dans `product_bundles`.
   */
  items: Array<
    | { product_id: string; bundle_id?: never; quantity: number }
    | { bundle_id: string; product_id?: never; quantity: number }
  >;
  /** Le CODE, jamais le montant : la remise se calcule en base. */
  coupon_code?: string;
  /** Identifiant d'onglet, pour boucler l'entonnoir. Anonyme. */
  session_id?: string;
};

export type CreatedOrder = {
  orderId:     string;
  orderNumber: string;
  /** Le total calculé par le serveur. C'est celui qui fait foi. */
  total:       number;
  /** La remise réellement appliquée. Zéro si le code n'a pas pris. */
  discount:    number;
  couponApplied: boolean;
};

// ─── Get store by slug ────────────────────────────────────────────────────────

export async function getStoreBySlug(slug: string): Promise<StoreSettings | null> {
  const svc = getSupabaseService();
  const { data, error } = await svc
    .from('store_settings')
    .select('*')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle();

  failIfUnreadable(error, 'cette vitrine');
  if (!data) return null;
  return data as StoreSettings;
}

// ─── Get products for store ───────────────────────────────────────────────────
//
// Le catalogue se lit par ENTREPRISE.
//
// Il se lisait par `businesses.owner_id` → `products.user_id`, ce qui faisait
// deux allers-retours au lieu d'un et, surtout, excluait tout produit créé par
// un employé : le marchand ajoutait un article depuis le compte de sa vendeuse
// et ne le voyait jamais apparaître en boutique.
//
// `products.business_id` est renseigné sur toutes les lignes et NOT NULL depuis
// 20260904_commerce_integrity.sql, et la politique RLS `products_access`
// l'acceptait déjà.
//
// Colonnes réelles : name, category (texte), sale_price (prix de vente),
// purchase_price, stock_quantity, image_url, currency.

export async function getStoreProducts(
  businessId: string,
  opts?: {
    category?: string;
    search?:   string;
    sort?:     'price_asc' | 'price_desc' | 'newest' | 'name';
    featured?: boolean;
    limit?:    number;
    /**
     * Vitrine en mode « sélection » : seuls les produits cochés dans l'éditeur
     * partent en ligne. Par défaut faux — c'est le comportement des boutiques
     * créées avant le Store Builder, et le conserver évite de vider leur
     * catalogue le jour de la migration (`is_published_to_store` vaut FALSE
     * partout au départ).
     */
    onlyPublished?: boolean;
    /** Filtre par identifiant de catégorie — le chemin propre depuis §20. */
    categoryId?: string;
    /** Facettes d'attributs : { couleur: 'Rouge' }. Toutes doivent coïncider. */
    attributes?: Record<string, string>;
    minPrice?:  number;
    maxPrice?:  number;
    /** Ne rendre que ce qui est réellement disponible. */
    inStock?:   boolean;
  },
): Promise<StoreProduct[]> {
  const svc = getSupabaseService();

  let q = svc
    .from('products')
    .select(PRODUCT_COLUMNS)
    .eq('business_id', businessId)
    .gte('stock_quantity', 0); // show all, including 0-stock (filtered by UI)

  if (opts?.onlyPublished) q = q.eq('is_published_to_store', true);
  if (opts?.featured)      q = q.eq('is_featured', true);
  if (opts?.categoryId)    q = q.eq('category_id', opts.categoryId);
  // `category` (texte) reste accepté : les liens déjà partagés et indexés par
  // les moteurs de recherche pointent dessus, et une URL publique ne se casse
  // pas parce qu'on a normalisé un schéma.
  else if (opts?.category) q = q.eq('category', opts.category);

  if (opts?.search)   q = q.ilike('name', `%${opts.search}%`);
  if (opts?.inStock)  q = q.gt('stock_quantity', 0);

  if (typeof opts?.minPrice === 'number') q = q.gte('sale_price', opts.minPrice);
  if (typeof opts?.maxPrice === 'number') q = q.lte('sale_price', opts.maxPrice);

  // Les facettes : `contains` sur le JSONB. Une seule requête, quel que soit le
  // nombre de critères.
  if (opts?.attributes && Object.keys(opts.attributes).length > 0) {
    q = q.contains('attributes', opts.attributes);
  }

  switch (opts?.sort) {
    case 'price_asc':  q = q.order('sale_price', { ascending: true });  break;
    case 'price_desc': q = q.order('sale_price', { ascending: false }); break;
    case 'newest':     q = q.order('created_at', { ascending: false }); break;
    default:           q = q.order('name', { ascending: true }); break;
  }

  if (opts?.limit) q = q.limit(opts.limit);

  const { data, error } = await q;
  failIfUnreadable(error, 'le catalogue');
  if (!data) return [];

  return data.map((p: any) => mapProduct(p));
}

/**
 * Les identifiants des meilleures ventes, la plus vendue d'abord.
 *
 * Calculées sur 90 jours par `v_store_bestsellers`. Rendues comme une simple
 * liste d'identifiants : la section de vitrine les rapproche du catalogue déjà
 * chargé plutôt que de relire les fiches.
 */
export async function getStoreBestsellerIds(businessId: string, limit = 12): Promise<string[]> {
  const svc = getSupabaseService();
  const { data, error } = await svc
    .from('v_store_bestsellers')
    .select('product_id, units_sold')
    .eq('business_id', businessId)
    .order('units_sold', { ascending: false })
    .limit(limit);

  failIfUnreadable(error, 'les meilleures ventes');
  if (!data) return [];
  return (data as any[]).map((r) => r.product_id as string);
}

/**
 * Les produits souvent achetés avec celui-ci (§26).
 *
 * Premier algorithme : la co-occurrence en facture, sur un an. Il ne demande
 * aucun modèle, il se lit, et il se vérifie — trois qualités qu'une
 * recommandation « intelligente » n'a pas toujours. La colonne
 * `v_store_bought_together` est prête pour qu'un jour un modèle la remplace.
 */
export async function getBoughtTogetherIds(
  businessId: string,
  productId: string,
  limit = 4,
): Promise<string[]> {
  const svc = getSupabaseService();
  const { data, error } = await svc
    .from('v_store_bought_together')
    .select('partner_id, times_together')
    .eq('business_id', businessId)
    .eq('product_id', productId)
    .order('times_together', { ascending: false })
    .limit(limit);

  failIfUnreadable(error, 'les achats associés');
  if (!data) return [];
  return (data as any[]).map((r) => r.partner_id as string);
}

/** Les colonnes que la vitrine lit sur `products`. Une seule liste, partagée. */
const PRODUCT_COLUMNS =
  'id, name, category, category_id, sale_price, purchase_price, compare_at_price, sku, tags, ' +
  'attributes, image_url, stock_quantity, currency, created_at, is_featured, allow_backorders, ' +
  'is_published_to_store, store_description, enhanced_image_url, gallery_urls';

function mapProduct(p: any): StoreProduct {
  const price   = Number(p.sale_price ?? p.purchase_price ?? 0);
  const compare = p.compare_at_price === null || p.compare_at_price === undefined
    ? null
    : Number(p.compare_at_price);

  return {
    id:          p.id,
    name:        p.name,
    description: p.store_description ?? null,
    price,
    sale_price:  null, // le prix courant EST `price` ; voir `compare_at_price`
    // La retouche IA prime sur la photo brute, quand elle existe.
    image_url:   p.enhanced_image_url ?? p.image_url ?? null,
    original_image_url: p.image_url ?? null,
    images:      Array.isArray(p.gallery_urls) ? p.gallery_urls.filter(Boolean) : [],
    category_id: p.category_id ?? null,
    category:    p.category ?? null,
    stock:       Number(p.stock_quantity ?? 0),
    // Un « ancien prix » qui ne dépasse pas le prix courant n'est pas affiché.
    compare_at_price: compare !== null && compare > price ? compare : null,
    sku:         p.sku ?? null,
    tags:        Array.isArray(p.tags) ? p.tags.filter(Boolean) : [],
    attributes:  normalizeAttributes(p.attributes),
    is_featured: p.is_featured === true,
    allow_backorders: p.allow_backorders === true,
    is_new:      isNew(p.created_at),
    is_published: p.is_published_to_store === true,
    created_at:  p.created_at,
  };
}

/**
 * Les attributs, réduits à des paires texte/texte.
 *
 * `attributes` est du JSONB : un marchand — ou un import — peut y mettre un
 * nombre, un tableau, `null`. Les facettes de filtre comparent des chaînes ;
 * tout ce qui n'en est pas une est écarté ici plutôt que de produire un filtre
 * « [object Object] ».
 */
function normalizeAttributes(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'string' && value.trim()) out[key] = value.trim();
    else if (typeof value === 'number' && Number.isFinite(value)) out[key] = String(value);
  }
  return out;
}

function isNew(createdAt: string): boolean {
  const days = (Date.now() - new Date(createdAt).getTime()) / 86_400_000;
  return days <= 30;
}

// ─── Get single product ───────────────────────────────────────────────────────

export async function getStoreProduct(businessId: string, productId: string): Promise<StoreProduct | null> {
  const svc = getSupabaseService();

  const { data, error } = await svc
    .from('products')
    .select(PRODUCT_COLUMNS)
    .eq('id', productId)
    .eq('business_id', businessId)
    .maybeSingle();

  failIfUnreadable(error, 'cette fiche produit');
  if (!data) return null;
  return mapProduct(data as any);
}

// ─── Résolution par domaine personnalisé ─────────────────────────────────────

/**
 * La vitrine derrière un domaine acheté par le marchand.
 *
 * Le middleware fait déjà cette résolution sur l'edge pour réécrire l'URL ;
 * celle-ci sert au rendu, quand une page a besoin de la vitrine complète et pas
 * du seul slug.
 */
export async function getStoreByDomain(domain: string): Promise<StoreSettings | null> {
  const svc = getSupabaseService();
  const { data, error } = await svc
    .from('store_settings')
    .select('*')
    .eq('custom_domain', domain.toLowerCase())
    .eq('is_active', true)
    .maybeSingle();

  failIfUnreadable(error, 'la vitrine de ce domaine');
  if (!data) return null;
  return data as StoreSettings;
}

// ─── Get categories ───────────────────────────────────────────────────────────
// Products use a plain text `category` column — derive distinct values from products.

export async function getStoreCategories(
  businessId: string,
  onlyPublished = false,
): Promise<StoreCategory[]> {
  const svc = getSupabaseService();

  // Compté sur les produits RÉELLEMENT visibles.
  //
  // La version précédente comptait tout le catalogue : en mode « sélection »,
  // une catégorie s'affichait avec « 12 » et menait à une page vide. Un rayon
  // annoncé plein qui s'ouvre sur rien est pire que pas de rayon du tout.
  const { data, error } = await svc
    .from('products')
    .select('category, category_id, is_published_to_store')
    .eq('business_id', businessId)
    .not('category', 'is', null);

  failIfUnreadable(error, 'les rayons');
  if (!data) return [];

  const visible = onlyPublished
    ? (data as any[]).filter((r) => r.is_published_to_store === true)
    : (data as any[]);

  const counts = new Map<string, { name: string; count: number }>();
  for (const row of visible) {
    if (!row.category) continue;
    // L'identifiant de catégorie quand il existe, le libellé sinon : les
    // anciennes vitrines n'ont pas encore de `category_id`, et leurs liens
    // partagés portent le nom.
    const id = row.category_id ?? row.category;
    const entry = counts.get(id);
    if (entry) entry.count += 1;
    else counts.set(id, { name: row.category, count: 1 });
  }

  return [...counts.entries()]
    .map(([id, { name, count }]) => ({ id, name, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Les facettes disponibles pour filtrer (§20).
 *
 * Dérivées du catalogue lui-même : on ne demande pas au marchand de déclarer
 * que ses produits ont une taille, on le constate. Une facette qui n'a qu'une
 * seule valeur n'en est pas une — elle ne filtre rien — et n'est pas rendue.
 */
export async function getStoreFacets(
  businessId: string,
  onlyPublished = false,
): Promise<Array<{ name: string; values: string[] }>> {
  const svc = getSupabaseService();

  let q = svc
    .from('products')
    .select('attributes')
    .eq('business_id', businessId);

  if (onlyPublished) q = q.eq('is_published_to_store', true);

  const { data, error } = await q;
  failIfUnreadable(error, 'les filtres du catalogue');
  if (!data) return [];

  const facets = new Map<string, Set<string>>();
  for (const row of data as any[]) {
    for (const [key, value] of Object.entries(normalizeAttributes(row.attributes))) {
      if (!facets.has(key)) facets.set(key, new Set());
      facets.get(key)!.add(value);
    }
  }

  return [...facets.entries()]
    .filter(([, values]) => values.size > 1)
    .map(([name, values]) => ({ name, values: [...values].sort((a, b) => a.localeCompare(b, 'fr')) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

// ─── Les lots (§18) ──────────────────────────────────────────────────────────

export type StoreBundle = {
  id:           string;
  name:         string;
  description:  string | null;
  /** Le prix DU LOT, tel que le marchand l'a fixé. */
  price:        number;
  /** Ce que les mêmes produits coûtent achetés séparément. */
  regularTotal: number;
  /** L'image de la première pièce — un lot n'a pas de photo à lui. */
  imageUrl:     string | null;
  inStock:      boolean;
  items: Array<{ productId: string; productName: string; quantity: number }>;
};

/**
 * Les lots publiés d'une boutique.
 *
 * Le prix « pièce par pièce » vient de `v_product_bundle_totals` et non d'une
 * addition faite ici : l'économie annoncée sur une vitrine est un argument de
 * vente, et un argument de vente se calcule en base. Le navigateur, lui, ne
 * reçoit que des nombres déjà arrêtés — il n'additionne jamais un prix.
 *
 * Un lot dont une pièce est épuisée n'est pas rendu. Il serait visible,
 * cliquable, et refusé à la commande : c'est le pire des trois états.
 */
export async function getStoreBundles(businessId: string, limit = 12): Promise<StoreBundle[]> {
  const svc = getSupabaseService();

  const { data, error } = await svc
    .from('product_bundles')
    .select(
      'id, name, description, price, ' +
      'product_bundle_items ( product_id, quantity, products ( name, image_url, enhanced_image_url ) )',
    )
    .eq('business_id', businessId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(limit);

  // Table absente (migration non jouée) : la section ne s'affiche pas. Une
  // vitrine ne casse jamais parce qu'une fonctionnalité n'est pas encore en
  // base.
  if (error || !data || data.length === 0) return [];

  const totals = new Map<string, { regular: number; inStock: boolean }>();
  const { data: t } = await svc
    .from('v_product_bundle_totals')
    .select('bundle_id, regular_total, in_stock')
    .eq('business_id', businessId);

  for (const row of (t ?? []) as any[]) {
    totals.set(row.bundle_id, {
      regular: Number(row.regular_total) || 0,
      inStock: row.in_stock !== false,
    });
  }

  return (data as any[])
    .map((b) => {
      const lines = (b.product_bundle_items ?? []) as any[];
      const total = totals.get(b.id);
      const first = lines[0]?.products;

      return {
        id:           b.id as string,
        name:         b.name as string,
        description:  (b.description ?? null) as string | null,
        price:        Number(b.price) || 0,
        regularTotal: total?.regular ?? 0,
        imageUrl:     (first?.enhanced_image_url ?? first?.image_url ?? null) as string | null,
        inStock:      total?.inStock ?? true,
        items: lines.map((i) => ({
          productId:   i.product_id as string,
          productName: (i.products?.name ?? 'Produit') as string,
          quantity:    Number(i.quantity) || 1,
        })),
      };
    })
    .filter((b) => b.items.length >= 2 && b.inStock);
}

// ─── Create order (guest checkout) ───────────────────────────────────────────

/**
 * Passe une commande. Tout le travail est fait par `create_store_order`.
 *
 * Une seule transaction Postgres pour : relire les prix du catalogue, vérifier
 * le stock et la publication de chaque article, valider le mode de livraison et
 * le mode de paiement contre les réglages de la boutique, attribuer un numéro
 * par compteur (et non par `COUNT(*)`, qui donnait le même numéro à deux
 * commandes simultanées), créer le client, la commande et ses lignes.
 *
 * Ce qui remonte ici est déjà cohérent, ou n'existe pas.
 */
export async function createStoreOrder(input: CreateOrderInput): Promise<ActionResult<CreatedOrder>> {
  return attempt(async () => {
  const svc = getSupabaseService();

  // Une ligne est réduite à un identifiant et une quantité. Toute autre clé
  // envoyée par le navigateur — un prix, un nom — est écartée ici et n'atteint
  // jamais la fonction SQL.
  const items = (input.items ?? [])
    .map((i) => {
      const quantity = Math.trunc(Number(i.quantity) || 0);
      return 'bundle_id' in i && i.bundle_id
        ? { bundle_id: i.bundle_id, quantity }
        : { product_id: (i as { product_id?: string }).product_id, quantity };
    })
    .filter((i) => ('bundle_id' in i ? Boolean(i.bundle_id) : Boolean(i.product_id)) && i.quantity > 0);

  if (items.length === 0) throw new UserFacingError('Votre panier est vide.');

  const { data, error } = await svc.rpc('create_store_order', {
    p_business_id:      input.business_id,
    p_customer_name:    input.customer_name,
    p_customer_email:   input.customer_email,
    p_customer_phone:   input.customer_phone,
    p_shipping_address: input.shipping_address,
    p_shipping_mode:    input.shipping_mode ?? '',
    p_payment_method:   input.payment_method,
    p_notes:            input.notes ?? null,
    p_items:            items,
    p_coupon_code:      input.coupon_code?.trim() || null,
    p_session_id:       input.session_id ?? null,
  });

  if (error) {
    // Les messages levés par la fonction sont écrits pour l'acheteur (« Stock
    // insuffisant pour « Savon karité » : il en reste 2. »). On les laisse
    // passer tels quels plutôt que de les remplacer par « Erreur commande ».
    throw new Error(error.message || 'La commande n\'a pas pu être enregistrée.');
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.out_order_id) throw new UserFacingError('La commande n\'a pas pu être enregistrée.');

  // L'alerte au marchand. Ici pour le paiement à la livraison : la commande est
  // ferme dès maintenant. Pour MonCash et NatCash elle part au règlement
  // vérifié (`settleGatewayOrder`), pas pour une commande que l'acheteur peut
  // encore abandonner chez la passerelle. Planifiée, jamais bloquante.
  if (input.payment_method !== 'moncash' && input.payment_method !== 'natcash') {
    queueStoreOrderNotification(row.out_order_id as string, 'placed');
  }

  return {
    orderId:       row.out_order_id as string,
    orderNumber:   row.out_order_number as string,
    total:         Number(row.out_order_total ?? 0),
    discount:      Number(row.out_discount ?? 0),
    couponApplied: row.out_coupon_applied === true,
  };
  });
}

/**
 * Confirme une commande : stock décrémenté, mouvement d'inventaire, vente
 * ProfitPilot créée, commande rattachée. Idempotente.
 *
 * Appelée par les rappels de passerelle après vérification du paiement, et par
 * l'écran des commandes quand le marchand confirme à la main.
 */
export async function confirmStoreOrder(orderId: string): Promise<string> {
  const svc = getSupabaseService();
  const { data, error } = await svc.rpc('confirm_store_order', { p_order_id: orderId });
  if (error) throw new Error(error.message || 'La commande n\'a pas pu être confirmée.');
  return data as string;
}

// ─── La commande, pour l'écran de confirmation ───────────────────────────────

export type PublicOrder = {
  id:              string;
  order_number:    string;
  status:          string;
  payment_status:  string;
  customer_name:   string;
  customer_email:  string;
  subtotal:        number;
  shipping_amount: number;
  total:           number;
  currency:        string;
  shipping_address: { line1?: string; line2?: string; city?: string; country?: string } | null;
  items: Array<{
    id:            string;
    /** Nécessaire au formulaire d'avis : on note un PRODUIT, pas une ligne. */
    product_id:    string;
    product_name:  string;
    product_image: string | null;
    quantity:      number;
    total_price:   number;
  }>;
};

/**
 * La commande désignée par son identifiant.
 *
 * Par l'IDENTIFIANT, plus par `(business_id, order_number)`.
 *
 * Les numéros de commande sont séquentiels (`ORD-2026-00001`) et
 * l'identifiant d'entreprise voyageait dans l'URL de confirmation : il
 * suffisait de décrémenter le numéro pour lire, une par une, les commandes des
 * autres clients de la boutique — nom, courriel, téléphone, adresse de
 * livraison. Un UUID ne s'énumère pas.
 *
 * La ligne est par ailleurs réduite ici à ce que l'acheteur doit voir : ni
 * `sale_id`, ni notes internes, ni référence de transaction.
 */
export async function getStoreOrder(orderId: string): Promise<PublicOrder | null> {
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) return null;

  const svc = getSupabaseService();
  const { data, error } = await svc
    .from('orders')
    .select(
      'id, order_number, status, payment_status, customer_name, customer_email, ' +
      'subtotal, shipping_amount, total, currency, shipping_address, ' +
      'order_items(id, product_id, product_name, product_image, quantity, total_price)',
    )
    .eq('id', orderId)
    .maybeSingle();

  if (error || !data) return null;

  const row = data as any;
  return {
    id:              row.id,
    order_number:    row.order_number,
    status:          row.status,
    payment_status:  row.payment_status,
    customer_name:   row.customer_name,
    customer_email:  row.customer_email,
    subtotal:        Number(row.subtotal ?? 0),
    shipping_amount: Number(row.shipping_amount ?? 0),
    total:           Number(row.total ?? 0),
    currency:        row.currency ?? 'HTG',
    shipping_address: row.shipping_address ?? null,
    items: (row.order_items ?? []).map((i: any) => ({
      id:            i.id,
      product_id:    i.product_id,
      product_name:  i.product_name,
      product_image: i.product_image ?? null,
      quantity:      Number(i.quantity ?? 0),
      total_price:   Number(i.total_price ?? 0),
    })),
  };
}
