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

import { getSupabaseService } from './supabaseServiceClient';

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
    .select('id, business_id, order_number, payment_status, sale_id')
    .eq('id', params.orderId)
    .maybeSingle();

  if (!order) return { ok: false, slug: '', reason: 'order_not_found' };

  const slug = await storeSlugOf(order.business_id);

  await svc
    .from('orders')
    .update({
      payment_status:         'paid',
      payment_transaction_id: params.transactionId,
      payment_gateway:        params.gateway,
    })
    .eq('id', order.id);

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

  return {
    ok: true,
    slug,
    orderId:     order.id as string,
    orderNumber: order.order_number as string,
    businessId:  order.business_id as string,
  };
}
