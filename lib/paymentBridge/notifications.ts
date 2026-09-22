// ─────────────────────────────────────────────────────────────────────────────
// Prévenir le marchand — un seul endroit
//
// Sorti de receipts.ts pour une raison concrète : la déclaration « J'ai effectué
// le paiement » (intents.ts) doit prévenir le marchand elle aussi, et intents.ts
// ne peut pas importer receipts.ts, qui l'importe déjà.
//
// ── Pourquoi `type: 'generic'` ─────────────────────────────────────────────
//
// `notifications.type` a pu être converti en énum par
// 20260607_data_robustness.sql, et un type inconnu ferait échouer l'insert EN
// SILENCE — le marchand ne serait jamais prévenu et rien ne le dirait. Le cahier
// des charges listait PAYMENT_CONFIRMED, PAYMENT_DUPLICATE et les autres comme
// des types de notification ; ils sont ici dans `data.event`, où ils ne risquent
// rien. C'est le choix déjà fait par les relances de créances et le résumé du
// dimanche (voir l'en-tête de lib/notify.ts).
//
// `preference: 'payment_due'` : l'interrupteur « Relance des créances », le seul
// qui parle d'argent dû. Sans lui, aucune colonne ne gouvernerait ces
// notifications et le réglage qui prétend les couper ne couperait rien.
//
// ── Le client, lui, n'est pas prévenu par ce fichier ───────────────────────
//
// `notify()` écrit à des MEMBRES du commerce. L'acheteur d'une vitrine n'en est
// pas un : il voit l'état de son paiement sur la page de paiement, qui se relit
// seule. Un courriel ou un WhatsApp au client est une intégration externe que le
// §33 demande de ne pas créer maintenant.
// ─────────────────────────────────────────────────────────────────────────────

import { notify } from '../notify';

export type PaymentNotice =
  | 'payment_reported'
  | 'payment_confirmed'
  | 'payment_partial'
  | 'payment_overpayment'
  | 'payment_review'
  | 'payment_duplicate'
  | 'payment_unmatched'
  | 'payment_settlement_failed';

export async function notifyMerchant(params: {
  businessId: string;
  event:      PaymentNotice;
  title:      string;
  body:       string;
  intentId?:  string | null;
  receiptId?: string | null;
}): Promise<void> {
  await notify({
    companyId:  params.businessId,
    type:       'generic',
    preference: 'payment_due',
    title:      params.title,
    body:       params.body,
    entity:     'payment_intent',
    entityId:   params.intentId ?? undefined,
    data: {
      event:      params.event,
      intent_id:  params.intentId ?? null,
      receipt_id: params.receiptId ?? null,
      action_url: params.intentId ? `/paiements?id=${params.intentId}` : '/paiements',
    },
  });
}

export const money = (n: number, currency = 'HTG') =>
  `${new Intl.NumberFormat('fr-HT', { maximumFractionDigits: 0 }).format(n)} ${currency}`;
