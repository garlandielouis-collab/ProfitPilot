'use server';

// ─────────────────────────────────────────────────────────────────────────────
// La modération des avis, côté marchand
//
// ── Pourquoi cet écran est indispensable et pas décoratif ──────────────────
//
// `reviews.status` vaut `pending` par défaut, et `v_product_ratings` ne compte
// que les `published`. Sans un endroit pour publier, un avis déposé n'atteint
// jamais une fiche : la note n'apparaît nulle part, quel que soit le nombre de
// clients qui prennent la peine de noter. Le formulaire après achat et la
// relance nocturne alimentent une table que personne ne vide.
//
// ── Ce que le marchand peut, et ce qu'il ne peut pas ───────────────────────
//
//   Il peut PUBLIER un avis en attente.
//   Il peut REFUSER un avis — une insulte, un propos qui vise une personne, un
//   commentaire qui n'a rien à voir avec le produit.
//   Il peut DÉPUBLIER un avis déjà publié, s'il découvre après coup ce qu'il
//   contient.
//
//   Il ne peut PAS en écrire un. C'est garanti par la base, pas par cet
//   écran : `reviews` n'a aucune politique d'INSERT, donc RLS refuse toute
//   création par un membre. La seule insertion possible passe par la clé
//   service dans `submitReview`, qui exige une commande réelle.
//
//   Il ne peut PAS modifier le texte ni la note. Cette action n'écrit que
//   `status` et `published_at` — un avis dont le commerçant pourrait corriger
//   la formulation n'est plus l'avis de son client, et la note de la fiche ne
//   voudrait plus rien dire.
//
// C'est la ligne du §27, et elle passe ici : refuser un propos, oui ; fabriquer
// un éloge, jamais.
// ─────────────────────────────────────────────────────────────────────────────

import { revalidatePath } from 'next/cache';

import { assertFeature } from '../../lib/entitlements';
import { getBusinessContext, requirePermission } from '../../lib/serverAuth';
import { getSupabaseService } from '../../lib/supabaseServiceClient';
import { revalidateStore } from '../../lib/storefrontData';
import { attempt, UserFacingError, type ActionResult } from '../../lib/actionResult';

export type ModerationReview = {
  id:          string;
  productId:   string;
  productName: string;
  authorName:  string;
  rating:      number;
  body:        string | null;
  status:      'pending' | 'published' | 'rejected';
  createdAt:   string;
  orderNumber: string | null;
};

export type ModerationState = {
  pending:   ModerationReview[];
  published: ModerationReview[];
  rejected:  ModerationReview[];
};

function toReview(r: any): ModerationReview {
  return {
    id:          r.id,
    productId:   r.product_id,
    productName: r.products?.name ?? 'Produit retiré',
    authorName:  r.author_name ?? 'Client',
    rating:      Number(r.rating ?? 0),
    body:        r.body ?? null,
    status:      r.status,
    createdAt:   r.created_at,
    orderNumber: r.orders?.order_number ?? null,
  };
}

/**
 * Tous les avis de la boutique, rangés par statut.
 *
 * Une seule lecture : le volume d'avis d'un commerce haïtien tient en une page,
 * et trois requêtes filtrées pour trois onglets coûteraient trois allers-retours
 * pour afficher la même chose.
 */
export async function getModerationState(): Promise<ModerationState> {
  await assertFeature('online_store');
  await requirePermission('settings:write');
  const { businessId } = await getBusinessContext();

  const svc = getSupabaseService();
  const { data, error } = await svc
    .from('reviews')
    .select('id, product_id, author_name, rating, body, status, created_at, '
          + 'products(name), orders(order_number)')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit(300);

  // Table absente (migration non jouée) : l'écran s'affiche vide plutôt que de
  // tomber. Il n'y a alors rien à modérer, ce qui est vrai.
  if (error || !data) return { pending: [], published: [], rejected: [] };

  const all = (data as any[]).map(toReview);

  return {
    pending:   all.filter((r) => r.status === 'pending'),
    published: all.filter((r) => r.status === 'published'),
    rejected:  all.filter((r) => r.status === 'rejected'),
  };
}

/**
 * Change le statut d'un avis. N'écrit rien d'autre.
 *
 * Le `business_id` est ajouté à la clause `eq` alors que l'identifiant suffirait
 * à désigner la ligne : c'est ce qui garantit qu'un marchand ne peut pas
 * modérer l'avis d'une autre boutique en passant un identifiant deviné. La clé
 * service ne passe pas par RLS — le cadrage doit donc être écrit ici, à la main,
 * comme partout ailleurs dans ce dépôt.
 */
export async function moderateReview(
  reviewId: string,
  status: 'published' | 'rejected' | 'pending',
): Promise<ActionResult> {
  return attempt(async () => {
  await assertFeature('online_store');
  await requirePermission('settings:write');
  const { businessId } = await getBusinessContext();

  if (!/^[0-9a-f-]{36}$/i.test(reviewId)) throw new UserFacingError('Avis introuvable.');
  if (!['published', 'rejected', 'pending'].includes(status)) {
    throw new UserFacingError('Statut inconnu.');
  }

  const svc = getSupabaseService();

  const { data, error } = await svc
    .from('reviews')
    .update({
      status,
      // La date de publication n'est posée qu'à la publication, et retirée si
      // l'avis est dépublié : « publié le » doit rester vrai.
      published_at: status === 'published' ? new Date().toISOString() : null,
    })
    .eq('id', reviewId)
    .eq('business_id', businessId)
    .select('id')
    .maybeSingle();

  if (error)  throw new UserFacingError("Le statut de l'avis n'a pas pu être changé.");
  if (!data)  throw new UserFacingError('Avis introuvable.');

  // La vitrine sert ses pages en cache par étiquettes : sans invalidation, un
  // avis publié n'apparaîtrait qu'à l'expiration du cache — le marchand
  // conclurait que le bouton ne marche pas et cliquerait encore.
  const { data: store } = await svc
    .from('store_settings')
    .select('slug')
    .eq('business_id', businessId)
    .maybeSingle();

  await revalidateStore(store?.slug ?? null, businessId);
  revalidatePath('/boutique/avis');
  });
}
