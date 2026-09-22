// ─────────────────────────────────────────────────────────────────────────────
// La caisse de la vitrine, quand le marchand n'a pas de contrat API
//
// Les routes `/api/store/payment/{moncash,natcash}` savaient faire une chose :
// rediriger l'acheteur chez l'opérateur, avec les identifiants API du marchand.
// Sans ces identifiants, elles répondaient « Identifiants MonCash non
// configurés » — à l'ACHETEUR, qui n'y peut rien, sur une boutique qui affichait
// pourtant MonCash comme moyen de paiement.
//
// C'est ici que la seconde voie se branche. L'ordre de préférence est fixe :
//
//   1. la passerelle API, quand le marchand en a une — la confirmation vient
//      de l'opérateur, c'est la voie la plus sûre ;
//   2. Payment Bridge, quand il a déclaré un numéro — l'acheteur transfère
//      directement, le rapprochement ou le marchand confirme ;
//   3. sinon, le refus d'avant.
//
// Rien n'est dupliqué : la commande est créée par `createStoreOrder`, la même
// fonction que pour la passerelle et le paiement à la livraison. Le montant dû
// est relu depuis `orders` par `createIntentForOrder`.
// ─────────────────────────────────────────────────────────────────────────────

import { createStoreOrder } from '../../app/actions/store-public';
import { checkGatewayCurrency, readGatewayCredentials } from '../storePaymentGateway';
import { bridgeMethodsFor, createIntentForOrder, BridgeError } from './intents';
import { logSafe } from './mask';

export type BridgeCheckoutResult =
  | { ok: true;  orderId: string; orderNumber: string; intentId: string }
  | { ok: false; status: number; error: string };

/** Ce commerce peut-il encaisser ce moyen en direct ? */
export async function bridgeAvailable(businessId: string, method: 'moncash' | 'natcash'): Promise<boolean> {
  try {
    return (await bridgeMethodsFor(businessId)).includes(method);
  } catch {
    // Une table absente (migration pas encore collée) ne doit pas casser la
    // caisse : on retombe sur le refus d'avant.
    return false;
  }
}

/**
 * Les moyens que la caisse peut RÉELLEMENT encaisser, parmi ceux que la boutique
 * a cochés.
 *
 * Cocher NatCash dans les réglages de la vitrine ne dit pas où l'argent doit
 * aller. Sans identifiants API ni numéro déclaré, la caisse proposait NatCash,
 * l'acheteur remplissait tout le formulaire, et le refus n'arrivait qu'au
 * dernier bouton. Un moyen mobile n'est donc proposé que s'il a une
 * destination : la passerelle, ou un numéro Payment Bridge.
 */
export async function payableMethods(businessId: string, methods: readonly string[]): Promise<string[]> {
  const out: string[] = [];
  for (const m of methods) {
    if (m !== 'moncash' && m !== 'natcash') { out.push(m); continue; }
    const [creds, bridge] = await Promise.all([
      readGatewayCredentials(businessId, m).catch(() => null),
      bridgeAvailable(businessId, m),
    ]);
    if (creds || bridge) out.push(m);
  }
  return out;
}

export async function startBridgeCheckout(params: {
  businessId: string;
  method:     'moncash' | 'natcash';
  orderData:  any;
}): Promise<BridgeCheckoutResult> {
  // La devise AVANT la commande. MonCash et NatCash n'encaissent que des gourdes :
  // une vitrine en dollars sans taux saisi ne sait pas combien demander, et
  // créer la commande d'abord laisserait une commande impayable à chaque essai —
  // la leçon de `checkGatewayCurrency`, que la passerelle a déjà apprise.
  const currency = await checkGatewayCurrency(params.businessId);
  if (!currency.ok) {
    console.error('[payment-bridge] caisse : devise non facturable', logSafe({
      businessId: params.businessId, reason: currency.reason,
    }));
    return { ok: false, status: 409, error: "Le paiement en ligne n'est pas disponible pour le moment dans cette boutique." };
  }

  // La commande ensuite, avec son total calculé par la base. Un refus métier
  // (stock, panier vide) est une erreur de la requête, dite telle quelle.
  const created = await createStoreOrder(params.orderData);
  if (!created.ok) return { ok: false, status: 400, error: created.message };

  const { orderId, orderNumber } = created.data;

  try {
    const intent = await createIntentForOrder({ orderId, method: params.method });
    return { ok: true, orderId, orderNumber, intentId: intent.intentId };
  } catch (err) {
    console.error('[payment-bridge] caisse : paiement non ouvert', logSafe({
      businessId: params.businessId,
      reason:     (err as Error).message,
    }));
    // La commande existe : elle reste « en attente » chez le marchand, qui peut
    // la régler à la main. On le dit à l'acheteur plutôt qu'un échec muet.
    return {
      ok: false,
      status: err instanceof BridgeError ? 400 : 500,
      error: err instanceof BridgeError
        ? err.message
        : `Votre commande ${orderNumber} est enregistrée, mais le paiement n'a pas pu s'afficher. La boutique vous contactera.`,
    };
  }
}
