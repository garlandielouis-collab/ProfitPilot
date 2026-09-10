// ─────────────────────────────────────────────────────────────────────────────
// Le balayage des demandes d'avis
//
// Une fois par nuit : les commandes livrées il y a trois jours reçoivent la
// demande d'avis, une seule fois, et on note qu'elle est partie.
//
// ── Les deux bornes, et pourquoi la haute est la plus importante ────────────
//
//   BASSE — trois jours après livraison. Le client a eu le temps d'ouvrir le
//   colis et de s'en servir. Demander plus tôt fait noter l'emballage.
//
//   HAUTE — trente jours. C'est elle qui évite la catastrophe du premier soir :
//   sans elle, la première nuit qui suit la migration `20260917` enverrait une
//   demande pour CHAQUE commande livrée depuis l'ouverture de la boutique.
//   Des clients de l'an dernier recevraient « donnez votre avis » et
//   concluraient que le commerçant s'est fait pirater. Le rattrapage de la
//   migration remplit `delivered_at` sur tout l'historique : la borne haute est
//   la seule chose qui l'empêche de devenir un envoi de masse.
//
// ── L'ordre des deux écritures ──────────────────────────────────────────────
//
// `review_email_sent_at` est posée AVANT l'envoi, pas après. Le risque est
// asymétrique et il faut choisir son côté :
//
//   marquer après  → l'envoi réussit, l'écriture échoue, et le client reçoit
//                    la même demande chaque nuit jusqu'à ce que quelqu'un
//                    s'en aperçoive.
//   marquer avant  → l'écriture réussit, l'envoi échoue, et ce client n'est
//                    jamais relancé.
//
// Un avis manquant est un manque. Une relance quotidienne est un harcèlement,
// et elle brûle l'adresse d'expédition pour toutes les boutiques du produit.
// On marque avant.
//
// ── Le plafond par nuit ─────────────────────────────────────────────────────
//
// Cent envois maximum. Le cron a soixante secondes (`maxDuration`), et un appel
// réseau par courriel. Sans plafond, une boutique qui livre trois cents
// commandes le même jour ferait expirer la route — et les autres balayages de
// la nuit avec elle. Le reste part la nuit suivante : la borne haute de trente
// jours laisse largement la place.
// ─────────────────────────────────────────────────────────────────────────────

import { getSupabaseService } from './supabaseServiceClient';
import { sendReviewRequestEmail } from './reviewRequestEmail';

const DAYS_AFTER_DELIVERY = 3;
const MAX_AGE_DAYS        = 30;
const MAX_PER_RUN         = 100;

export type ReviewSweepResult = {
  /** Courriels réellement acceptés par le fournisseur. */
  sent:    number;
  /** Commandes écartées faute d'adresse, de produit ou de boutique ouverte. */
  skipped: number;
  /** Envois refusés par le fournisseur. La commande reste marquée — voir l'en-tête. */
  failed:  number;
};

export async function sweepReviewRequests(): Promise<ReviewSweepResult> {
  const svc = getSupabaseService();

  const now   = Date.now();
  const from  = new Date(now - MAX_AGE_DAYS * 86_400_000).toISOString();
  const until = new Date(now - DAYS_AFTER_DELIVERY * 86_400_000).toISOString();

  const { data, error } = await svc
    .from('orders')
    .select(
      'id, business_id, order_number, customer_name, customer_email, ' +
      'order_items(product_id, product_name)',
    )
    .eq('status', 'delivered')
    .is('review_email_sent_at', null)
    .gte('delivered_at', from)
    .lte('delivered_at', until)
    .order('delivered_at', { ascending: true })
    .limit(MAX_PER_RUN);

  // La colonne peut ne pas exister : migration `20260917` non jouée. On ne fait
  // rien et on ne lève pas — le cron a d'autres choses à faire cette nuit.
  if (error || !data) return { sent: 0, skipped: 0, failed: 0 };

  // Double conversion : PostgREST type la relation imbriquée comme une union
  // avec son cas d'erreur, que TypeScript refuse de rapprocher de la forme
  // attendue. Le passage par `unknown` est le seul endroit du fichier où l'on
  // affirme une forme — et les champs sont tous relus défensivement plus bas.
  const rows = data as unknown as Array<{
    id: string; business_id: string; order_number: string;
    customer_name: string | null; customer_email: string | null;
    order_items: Array<{ product_id: string; product_name: string }> | null;
  }>;

  if (rows.length === 0) return { sent: 0, skipped: 0, failed: 0 };

  // Le nom de la boutique et son adresse publique, une lecture pour toutes les
  // commandes de la nuit plutôt qu'une par commande.
  const businessIds = [...new Set(rows.map((r) => r.business_id))];
  const { data: stores } = await svc
    .from('store_settings')
    .select('business_id, store_name, slug, custom_domain, is_active')
    .in('business_id', businessIds);

  const byBusiness = new Map(
    (stores ?? []).map((s: any) => [s.business_id as string, s]),
  );

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '');

  let sent = 0, skipped = 0, failed = 0;

  for (const order of rows) {
    const store = byBusiness.get(order.business_id);
    const email = (order.customer_email ?? '').trim();
    const items = (order.order_items ?? []).filter((i) => i.product_id);

    // Boutique fermée, adresse absente, commande sans ligne : rien à demander.
    // On ne marque PAS ces commandes — si la boutique rouvre dans la fenêtre,
    // elles repasseront.
    if (!store || store.is_active !== true || !email || items.length === 0) {
      skipped++;
      continue;
    }

    // L'adresse de la vitrine : domaine personnalisé s'il existe, sinon le
    // chemin interne. Un lien qui sort le client du domaine où il a acheté
    // ressemble à un hameçonnage — c'est exactement ce qu'on lui apprend à
    // fuir.
    const origin = store.custom_domain
      ? `https://${store.custom_domain}`
      : appUrl;
    const base = store.custom_domain ? '' : `/store/${store.slug}`;

    if (!origin) { skipped++; continue; }

    // Pas de jeton dans l'URL, et c'est volontaire : le lien porte l'UUID de la
    // commande, et charger la page de confirmation avec cet UUID est DÉJÀ la
    // preuve que le jeton établirait. La page en fabrique un, côté serveur, pour
    // le formulaire. Un jeton de plus dans l'adresse n'ajouterait aucune
    // garantie et allongerait un lien que certains clients de messagerie
    // coupent.
    const reviewUrl =
      `${origin}${base}/confirmation?id=${encodeURIComponent(order.id)}#avis`;

    // AVANT l'envoi. Voir l'en-tête : on préfère un avis manquant à une
    // relance qui repart chaque nuit.
    const { error: markError } = await svc
      .from('orders')
      .update({ review_email_sent_at: new Date().toISOString() })
      .eq('id', order.id)
      .is('review_email_sent_at', null);

    if (markError) { skipped++; continue; }

    try {
      const ok = await sendReviewRequestEmail({
        to:           email,
        storeName:    store.store_name || 'Votre boutique',
        customerName: order.customer_name ?? '',
        orderNumber:  order.order_number,
        productNames: items.map((i) => i.product_name),
        reviewUrl,
      });
      if (ok) sent++; else skipped++;
    } catch {
      failed++;
    }
  }

  return { sent, skipped, failed };
}
