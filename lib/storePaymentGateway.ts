// ─────────────────────────────────────────────────────────────────────────────
// Passerelles de paiement — ce que MonCash et NatCash partagent
//
// Les deux routes faisaient la même chose de deux façons légèrement
// différentes, et les deux avaient les mêmes trois défauts :
//
//   Elles lisaient les identifiants dans `store_settings.payment_credentials`.
//   Cette colonne a été déplacée dans `store_payment_credentials`, une table
//   que seule la clé service peut lire — la précédente était visible de tout
//   compte connecté (cf. 20260904_commerce_integrity.sql).
//
//   Elles passaient `orderData.total` — un nombre venu du navigateur — au
//   fournisseur. Un acheteur pouvait donc payer le montant de son choix pour
//   une commande enregistrée à un autre. Le total qui part à la passerelle est
//   maintenant celui que la base a calculé.
//
//   Au retour, elles écrivaient `status = 'confirmed'` directement dans la
//   table. Aucune vente ProfitPilot n'était créée, aucun stock décrémenté : une
//   commande payée par MonCash n'existait pour le reste de l'application que
//   comme une ligne dans `orders`. Le règlement passe désormais par
//   `confirm_store_order`, la même transaction que la confirmation manuelle.
// ─────────────────────────────────────────────────────────────────────────────

import { after } from 'next/server';
import { getSupabaseService } from './supabaseServiceClient';
import { notify } from './notify';

export type GatewayName = 'moncash' | 'natcash';

export type GatewayCredentials = {
  client_id:     string;
  client_secret: string;
  sandbox:       boolean;
};

/**
 * Les identifiants du marchand pour une passerelle, ou `null` s'il ne les a pas
 * configurés. Lecture par clé service uniquement — cette table n'a aucune
 * politique RLS, donc aucun autre rôle ne peut la lire.
 */
export async function readGatewayCredentials(
  businessId: string,
  gateway: GatewayName,
): Promise<GatewayCredentials | null> {
  const svc = getSupabaseService();
  const { data } = await svc
    .from('store_payment_credentials')
    .select('credentials')
    .eq('business_id', businessId)
    .maybeSingle();

  const creds = (data as any)?.credentials?.[gateway];
  if (!creds?.client_id || !creds?.client_secret) return null;

  return {
    client_id:     String(creds.client_id),
    client_secret: String(creds.client_secret),
    sandbox:       creds.sandbox === true,
  };
}

/** Le slug de la vitrine d'une entreprise — pour construire les redirections. */
export async function storeSlugOf(businessId: string): Promise<string> {
  const svc = getSupabaseService();
  const { data } = await svc
    .from('store_settings')
    .select('slug')
    .eq('business_id', businessId)
    .maybeSingle();
  return (data as any)?.slug ?? '';
}

// ─── L'alerte au marchand ────────────────────────────────────────────────────

export type StoreOrderEvent = 'placed' | 'paid';

/**
 * Prévient le propriétaire qu'une commande en ligne l'attend.
 *
 * Personne ne le faisait : une commande passée sur la vitrine n'existait pour
 * le marchand que s'il pensait à ouvrir /boutique/commandes. Vit ici plutôt
 * que dans `app/actions/store-public.ts` parce que ce fichier-là est
 * `'use server'` : exportée de là, elle deviendrait un point d'entrée public
 * par lequel n'importe qui pourrait spammer la cloche d'un marchand.
 *
 * Un seul moment par commande :
 *   'placed'  paiement à la livraison — la commande est ferme dès sa création ;
 *   'paid'    MonCash / NatCash — au règlement vérifié, PAS à la création. Une
 *             commande créée puis abandonnée chez la passerelle n'est pas une
 *             commande ; l'annoncer ferait préparer un colis que personne n'a payé.
 *
 * Planifiée avec `after()` : elle part après la réponse, ne rallonge pas le
 * tunnel d'achat et ne peut pas le faire échouer. `notify` avale déjà ses
 * erreurs ; le `catch` d'ici couvre la lecture de la commande, et le repli
 * `void` un appel hors requête, où `after` lève.
 *
 * Type `generic`, sans préférence : `sale_created` est gouverné par `new_sale`,
 * désactivée par défaut — l'alerte ne serait arrivée chez presque personne. Et
 * on n'invente pas de type (`notifications.type` a pu devenir une énum).
 */
export function queueStoreOrderNotification(orderId: string, event: StoreOrderEvent): void {
  const send = () => sendStoreOrderNotification(orderId, event);
  try {
    after(send);
  } catch {
    void send();
  }
}

async function sendStoreOrderNotification(orderId: string, event: StoreOrderEvent): Promise<void> {
  try {
    const svc = getSupabaseService();
    const { data: order } = await svc
      .from('orders')
      .select('id, business_id, order_number, customer_name, total, currency')
      .eq('id', orderId)
      .maybeSingle();

    if (!order) return;

    const total    = Number(order.total ?? 0);
    const currency = (order.currency as string | null) ?? 'HTG';

    await notify({
      companyId: order.business_id as string,
      type:      'generic',
      title:     event === 'paid'
        ? `Commande payée en ligne — ${order.order_number}`
        : `Nouvelle commande en ligne — ${order.order_number}`,
      body:      `${order.customer_name ?? 'Client'} · ${total.toLocaleString('fr-FR')} ${currency}`,
      entity:    'order',
      // `notifications.reference_id` est un UUID : l'identifiant, pas le numéro.
      entityId:  order.id as string,
      data: {
        href:     '/boutique/commandes',
        order:    order.order_number,
        total,
        currency,
        event,
      },
    });
  } catch {
    // Jamais au détriment de la commande.
  }
}

/**
 * Vrai si cette transaction a déjà réglé une AUTRE commande de la passerelle.
 *
 * Le rappel reçoit l'identifiant de transaction dans l'URL : rien n'empêche
 * de rejouer celui d'un achat réussi avec l'identifiant d'une autre commande.
 * La vérification auprès du fournisseur doit déjà le refuser (la référence ne
 * correspond pas) ; ce contrôle-ci ne dépend que de notre base, et tient même
 * si le fournisseur ne renvoie pas la référence qu'on attend.
 *
 * Une erreur de lecture lève : ne pas savoir n'est pas une autorisation.
 */
export async function transactionSettledElsewhere(params: {
  gateway:       GatewayName;
  transactionId: string;
  orderId:       string;
}): Promise<boolean> {
  const svc = getSupabaseService();
  const { data, error } = await svc
    .from('orders')
    .select('id')
    .eq('payment_gateway', params.gateway)
    .eq('payment_transaction_id', params.transactionId)
    .neq('id', params.orderId)
    .limit(1);

  if (error) {
    throw new Error(`[${params.gateway}] lecture des transactions impossible : ${error.message}`);
  }
  return (data ?? []).length > 0;
}

export type SettlementOutcome =
  | { ok: true;  slug: string; orderId: string; orderNumber: string; businessId: string }
  | { ok: false; slug: string; reason: string };

/**
 * Encaisse un paiement vérifié : marque la commande payée, puis la confirme.
 *
 * Idempotente de bout en bout — `confirm_store_order` retourne la vente
 * existante quand la commande en a déjà une. Un fournisseur qui rappelle deux
 * fois ne crée pas deux ventes et ne décrémente pas deux fois le stock.
 *
 * Si la confirmation échoue (stock devenu insuffisant entre la commande et le
 * paiement), le paiement reste enregistré et la commande reste `pending` : le
 * marchand la voit dans sa liste avec l'argent reçu, et tranche lui-même. Perdre
 * la trace d'un paiement encaissé serait pire que laisser une commande en
 * attente.
 */
export async function settleGatewayOrder(params: {
  orderId:       string;
  gateway:       GatewayName;
  transactionId: string;
}): Promise<SettlementOutcome> {
  const svc = getSupabaseService();

  const { data: order } = await svc
    .from('orders')
    .select('id, business_id, order_number, payment_status, payment_transaction_id, sale_id')
    .eq('id', params.orderId)
    .maybeSingle();

  if (!order) return { ok: false, slug: '', reason: 'order_not_found' };

  const slug = await storeSlugOf(order.business_id);

  // Conditionnelle : seule une commande pas encore payée passe à « paid ». Deux
  // rappels simultanés lisent tous deux `unpaid` ; un seul modifie la ligne, et
  // la transaction enregistrée n'est jamais écrasée par la seconde. C'est ce
  // résultat — pas le statut lu plus haut — qui dit si le règlement est le
  // premier. (`payment_status` est NOT NULL : le `neq` n'écarte pas de NULL.)
  const { data: marked, error: markError } = await svc
    .from('orders')
    .update({
      payment_status:         'paid',
      payment_transaction_id: params.transactionId,
      payment_gateway:        params.gateway,
    })
    .eq('id', order.id)
    .neq('payment_status', 'paid')
    .select('id');

  if (markError) {
    throw new Error(`[${params.gateway}] commande non marquée payée : ${markError.message}`);
  }

  const firstSettlement = (marked ?? []).length > 0;

  if (
    !firstSettlement
    && order.payment_transaction_id
    && order.payment_transaction_id !== params.transactionId
  ) {
    // Commande déjà réglée par une autre transaction : peut-être un double
    // paiement de l'acheteur. On n'écrase rien ; le journal garde la trace.
    console.error(`[${params.gateway}] commande déjà réglée par une autre transaction`, {
      orderId:  order.id,
      order:    order.order_number,
      recorded: order.payment_transaction_id,
      received: params.transactionId,
    });
  }

  try {
    await svc.rpc('confirm_store_order', { p_order_id: order.id }).throwOnError();
    await svc.from('orders').update({ status: 'confirmed' }).eq('id', order.id);
  } catch (err) {
    console.error(
      `[${params.gateway}] paiement encaissé mais commande non confirmée`,
      { orderId: order.id, order: order.order_number, error: (err as Error).message },
    );
    // Le paiement est enregistré ; la commande attend le marchand.
  }

  // Au PREMIER règlement seulement : un fournisseur qui rappelle deux fois ne
  // doit pas annoncer deux commandes au marchand.
  if (firstSettlement) {
    queueStoreOrderNotification(order.id as string, 'paid');
  }

  return {
    ok: true,
    slug,
    orderId:     order.id as string,
    orderNumber: order.order_number as string,
    businessId:  order.business_id as string,
  };
}
