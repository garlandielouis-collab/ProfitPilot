'use server';

// ─────────────────────────────────────────────────────────────────────────────
// Ce que la vitrine publique lit et écrit, au-delà du catalogue
//
// Sections, avis, coupons, inscriptions, alertes de réapprovisionnement.
//
// Tout passe par la clé service — un visiteur n'a pas de compte, et aucune de
// ces tables n'accorde le moindre droit à `anon`. Chaque écriture vérifie donc
// ELLE-MÊME ce que RLS aurait vérifié : que la boutique est ouverte, que la
// commande existe, que l'adresse correspond.
// ─────────────────────────────────────────────────────────────────────────────

import { getSupabaseService } from '../../lib/supabaseServiceClient';
import { failIfUnreadable } from '../../lib/storeRead';
import { verifyReviewToken } from '../../lib/reviewToken';
import type { StoredSection } from '../../lib/storeSections';
import type { StoreReview } from '../../components/store/sections/types';
import { attempt, UserFacingError, type ActionResult } from '../../lib/actionResult';

// ── Sections ────────────────────────────────────────────────────────────────

export async function getStoreSections(businessId: string): Promise<StoredSection[]> {
  const svc = getSupabaseService();
  const { data, error } = await svc
    .from('store_sections')
    .select('section_key, position, is_enabled, config')
    .eq('business_id', businessId)
    .order('position', { ascending: true });

  // Seule lecture volontairement tolérante : la table peut ne pas exister
  // encore (migration non jouée) et la vitrine sait s'afficher sans elle — le
  // préréglage du gabarit s'applique alors. Échouer ici rendrait la boutique
  // inaccessible pour une personnalisation absente.
  if (error || !data) return [];
  return data as StoredSection[];
}

// ── Avis ────────────────────────────────────────────────────────────────────

/** Les avis publiés de la boutique, tous produits confondus. */
export async function getStoreReviews(businessId: string, limit = 9): Promise<StoreReview[]> {
  const svc = getSupabaseService();
  const { data, error } = await svc
    .from('reviews')
    .select('id, author_name, rating, body, created_at, products(name)')
    .eq('business_id', businessId)
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(limit);

  failIfUnreadable(error, 'les avis publiés');
  if (!data) return [];

  return (data as any[]).map((r) => ({
    id:           r.id,
    author_name:  r.author_name,
    rating:       Number(r.rating ?? 0),
    body:         r.body ?? null,
    created_at:   r.created_at,
    product_name: r.products?.name ?? null,
  }));
}

/**
 * Les notes moyennes de toute la boutique, en une lecture.
 *
 * Les cartes des rayons cosmétique et électronique portent une note (§5) ; la
 * calculer produit par produit ferait douze requêtes pour une grille de douze.
 * Une seule lecture, agrégée en mémoire.
 *
 * Un produit sans avis publié n'apparaît pas dans le résultat, et sa carte
 * n'affiche donc aucune étoile. C'est la règle du §29 : jamais de faux avis,
 * jamais de note par défaut — l'absence de note est une information juste, une
 * note inventée est un mensonge que le marchand paiera à notre place.
 */
export async function getStoreRatings(
  businessId: string,
): Promise<Record<string, { average: number; count: number }>> {
  const svc = getSupabaseService();
  const { data, error } = await svc
    .from('reviews')
    .select('product_id, rating')
    .eq('business_id', businessId)
    .eq('status', 'published');

  failIfUnreadable(error, 'les notes des produits');
  if (!data) return {};

  const sums = new Map<string, { total: number; count: number }>();
  for (const row of data as Array<{ product_id: string | null; rating: number | null }>) {
    if (!row.product_id) continue;
    const acc = sums.get(row.product_id) ?? { total: 0, count: 0 };
    acc.total += Number(row.rating ?? 0);
    acc.count += 1;
    sums.set(row.product_id, acc);
  }

  const out: Record<string, { average: number; count: number }> = {};
  for (const [productId, { total, count }] of sums) {
    if (count === 0) continue;
    out[productId] = { average: Math.round((total / count) * 10) / 10, count };
  }
  return out;
}

/** Les avis publiés d'un produit, plus sa note moyenne. */
export async function getProductReviews(productId: string): Promise<{
  reviews: StoreReview[];
  average: number;
  count:   number;
}> {
  const svc = getSupabaseService();
  const { data } = await svc
    .from('reviews')
    .select('id, author_name, rating, body, created_at')
    .eq('product_id', productId)
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(20);

  const reviews: StoreReview[] = (data ?? []).map((r: any) => ({
    id:           r.id,
    author_name:  r.author_name,
    rating:       Number(r.rating ?? 0),
    body:         r.body ?? null,
    created_at:   r.created_at,
    product_name: null,
  }));

  const count   = reviews.length;
  const average = count === 0
    ? 0
    : Math.round((reviews.reduce((s, r) => s + r.rating, 0) / count) * 10) / 10;

  return { reviews, average, count };
}

/**
 * Dépose un avis.
 *
 * Trois vérifications, et aucune n'est facultative :
 *
 *   La commande existe et appartient à cette boutique.
 *   Le demandeur prouve qu'il est le client — voir ci-dessous.
 *   Le produit figure bien dans cette commande.
 *
 * ── Les deux preuves acceptées ─────────────────────────────────────────────
 *
 * `email` — l'adresse de la commande. C'est la preuve d'origine, et elle reste
 * la bonne pour un formulaire ouvert : un inconnu qui devinerait un identifiant
 * de commande ne connaît pas l'adresse.
 *
 * `token` — un jeton signé par ce serveur pour cette commande
 * (`lib/reviewToken.ts`). Il ne s'obtient que de deux façons : charger la page
 * de confirmation, ce qui demande l'UUID de la commande, ou recevoir la relance,
 * ce qui demande la boîte du client. Exactement ce que l'adresse établissait —
 * sans demander au client de retaper ce qu'il vient d'écrire à la caisse, ni de
 * répondre à une question dont le courriel connaît déjà la réponse.
 *
 * Une preuve suffit, aucune ne s'impose à l'autre, et **l'absence des deux est
 * un refus**. Le `if` est écrit en liste blanche pour cette raison : une
 * condition formulée à l'envers laisserait passer les deux champs vides.
 *
 * L'avis arrive en `pending`. Le marchand modère, il ne rédige pas : la table
 * n'accorde aucune politique d'INSERT aux membres.
 */
export async function submitReview(input: {
  orderId:   string;
  productId: string;
  email?:    string;
  token?:    string;
  rating:    number;
  body?:     string;
}): Promise<ActionResult> {
  return attempt(async () => {
  const svc = getSupabaseService();

  const rating = Math.round(Number(input.rating));
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    throw new UserFacingError('La note doit être comprise entre 1 et 5.');
  }

  const { data: order } = await svc
    .from('orders')
    .select('id, business_id, customer_id, customer_name, customer_email')
    .eq('id', input.orderId)
    .maybeSingle();

  if (!order) throw new UserFacingError('Commande introuvable.');

  const given     = (input.email ?? '').trim().toLowerCase();
  const byEmail   = given !== '' && given === String(order.customer_email ?? '').toLowerCase();
  const byToken   = verifyReviewToken(order.id, input.token);

  if (!byEmail && !byToken) {
    throw new UserFacingError("Nous n'avons pas pu vérifier que cette commande est la vôtre.");
  }

  const { data: line } = await svc
    .from('order_items')
    .select('id')
    .eq('order_id', order.id)
    .eq('product_id', input.productId)
    .maybeSingle();

  if (!line) throw new UserFacingError("Ce produit ne figure pas dans cette commande.");

  const { error } = await svc.from('reviews').insert({
    business_id: order.business_id,
    product_id:  input.productId,
    order_id:    order.id,
    customer_id: order.customer_id,
    author_name: order.customer_name || 'Client',
    rating,
    body:        input.body?.trim().slice(0, 1000) || null,
  });

  if (error) {
    // 23505 : un avis existe déjà pour cette ligne de commande.
    if (error.code === '23505') throw new UserFacingError('Vous avez déjà donné votre avis sur ce produit.');
    throw new UserFacingError("Votre avis n'a pas pu être enregistré.");
  }
  });
}

/**
 * Les produits de cette commande déjà notés.
 *
 * Le formulaire s'en sert pour ne pas proposer deux fois la même note : la
 * contrainte `UNIQUE (order_id, product_id)` refuserait le second avis, mais
 * refuser APRÈS avoir laissé le client choisir ses étoiles et écrire son
 * commentaire est une façon de lui faire perdre son travail.
 *
 * Rend les identifiants quel que soit le statut — `pending` compris. Un avis en
 * attente de modération est déposé : le client n'a pas à le redéposer, et lui
 * dire « publié » serait faux.
 *
 * Ne lève jamais : sans cette liste, le formulaire s'affiche entier et c'est la
 * contrainte d'unicité qui tranchera. Une page de confirmation ne doit pas
 * tomber parce que la lecture des avis a échoué.
 */
export async function getReviewedProductIds(orderId: string): Promise<string[]> {
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) return [];

  const svc = getSupabaseService();
  const { data, error } = await svc
    .from('reviews')
    .select('product_id')
    .eq('order_id', orderId);

  if (error || !data) return [];
  return (data as Array<{ product_id: string }>).map((r) => r.product_id);
}

// ── Coupons ─────────────────────────────────────────────────────────────────

export type CouponCheck = {
  valid:        boolean;
  reason:       string | null;
  discount:     number;
  freeShipping: boolean;
};

/**
 * Ce qu'un code vaut, avant de commander.
 *
 * Purement informatif : le montant qui s'appliquera vraiment est recalculé par
 * `create_store_order` au moment de la commande. Cette fonction sert à afficher
 * la remise dans le récapitulatif, pas à la décider.
 */
export async function checkCoupon(
  businessId: string,
  code: string,
  subtotal: number,
): Promise<CouponCheck> {
  const svc = getSupabaseService();
  const { data, error } = await svc.rpc('evaluate_store_coupon', {
    p_business_id: businessId,
    p_code:        code,
    p_subtotal:    subtotal,
  });

  if (error) return { valid: false, reason: 'Vérification impossible.', discount: 0, freeShipping: false };

  const row = Array.isArray(data) ? data[0] : data;
  return {
    valid:        row?.is_valid === true,
    reason:       row?.reason ?? null,
    discount:     Number(row?.discount ?? 0),
    freeShipping: row?.free_shipping === true,
  };
}

// ── Inscriptions et alertes ─────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Inscription à la lettre d'information.
 *
 * L'adresse rejoint le carnet de clients du marchand — c'est la même personne
 * que celle qui achètera peut-être demain, et il n'a pas besoin de deux
 * carnets. Aucune commande n'est créée, aucun solde n'est touché.
 */
export async function subscribeToStore(slug: string, email: string): Promise<ActionResult> {
  return attempt(async () => {
  const address = email.trim().toLowerCase();
  if (!EMAIL_RE.test(address)) throw new UserFacingError('Cette adresse ne semble pas valide.');

  const svc = getSupabaseService();
  const { data: store } = await svc
    .from('store_settings')
    .select('business_id')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle();

  if (!store) throw new UserFacingError('Boutique introuvable.');

  const { error } = await svc.from('customers').upsert(
    {
      business_id: store.business_id,
      email:       address,
      first_name:  'Abonné',
      last_name:   '-',
    },
    { onConflict: 'business_id,email', ignoreDuplicates: true },
  );

  if (error) throw new UserFacingError("L'inscription n'a pas abouti.");
  });
}

/** « Prévenez-moi quand c'est disponible » (§25). */
export async function notifyWhenAvailable(
  businessId: string,
  productId: string,
  email: string,
): Promise<ActionResult> {
  return attempt(async () => {
  const address = email.trim().toLowerCase();
  if (!EMAIL_RE.test(address)) throw new UserFacingError('Cette adresse ne semble pas valide.');

  const svc = getSupabaseService();

  // Le produit appartient-il bien à cette boutique ? Sans ce contrôle, un
  // identifiant deviné inscrirait une adresse chez un autre marchand.
  const { data: product } = await svc
    .from('products')
    .select('id')
    .eq('id', productId)
    .eq('business_id', businessId)
    .maybeSingle();

  if (!product) throw new UserFacingError('Produit introuvable.');

  const { error } = await svc.from('product_stock_notifications').upsert(
    { business_id: businessId, product_id: productId, email: address },
    { onConflict: 'product_id,email', ignoreDuplicates: true },
  );

  if (error) throw new UserFacingError("L'inscription n'a pas abouti.");
  });
}
