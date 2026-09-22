'use server';

// ─────────────────────────────────────────────────────────────────────────────
// La page de paiement de la vitrine — ce que l'ACHETEUR peut faire
//
// Trois gestes, et aucun ne règle rien :
//
//   relire l'état      « est-ce que la boutique a reçu mon paiement ? »
//   rouvrir le délai   la session de quinze minutes a expiré, il recommence
//   signaler           « j'ai effectué le paiement »
//
// L'acheteur n'a pas de compte, donc pas de session : ces actions tournent avec
// la clé service (voir l'en-tête de lib/paymentBridge/intents.ts). Ce qu'elles
// vérifient en échange, à CHAQUE appel : que la dette désignée appartient bien à
// la vitrine visitée. Sans ce contrôle, l'identifiant d'une dette d'une autre
// boutique, glissé dans l'URL d'une vitrine quelconque, suffirait à signaler un
// paiement chez un commerce qu'on n'a jamais visité.
// ─────────────────────────────────────────────────────────────────────────────

import { attempt, UserFacingError, type ActionResult } from '../../lib/actionResult';
import { loadStore } from '../../lib/storefrontData';
import { getPublicIntent, openSession, reportPayment } from '../../lib/paymentBridge/intents';
import type { IntentStatus } from '../../lib/paymentBridge/types';

async function intentOfStore(slug: string, intentId: string) {
  // Une coupure réseau n'est pas une absence : elle se dit comme telle, et
  // l'acheteur réessaie au lieu de croire son paiement perdu.
  const [store, intent] = await Promise.all([
    loadStore(String(slug ?? '')).catch(() => {
      throw new UserFacingError(
        "La connexion est momentanément impossible. Votre paiement n'est pas perdu : réessayez dans un instant.",
      );
    }),
    getPublicIntent(String(intentId ?? '')),
  ]);
  // Un seul message pour « introuvable » et « pas à cette boutique » : les
  // distinguer apprendrait à qui sonde qu'un identifiant existe ailleurs.
  if (!store || !intent || intent.businessId !== (store as any).business_id) {
    throw new UserFacingError('Ce paiement est introuvable.');
  }
  return intent;
}

export type PaymentStatusView = {
  status:    IntentStatus;
  remaining: number;
  expiresAt: string | null;
  reported:  boolean;
};

export async function getCustomerPaymentStatus(input: {
  slug: string; intentId: string;
}): Promise<ActionResult<PaymentStatusView>> {
  return attempt(async () => {
    const i = await intentOfStore(input.slug, input.intentId);
    return { status: i.status, remaining: i.remaining, expiresAt: i.expiresAt, reported: i.reported };
  });
}

/** Rouvrir quinze minutes sur la MÊME dette — jamais une seconde dette. */
export async function restartPaymentSession(input: {
  slug: string; intentId: string;
}): Promise<ActionResult<{ expiresAt: string }>> {
  return attempt(async () => {
    const i = await intentOfStore(input.slug, input.intentId);
    if (i.status === 'confirmed') throw new UserFacingError('Ce paiement est déjà confirmé.');
    const s = await openSession(i.id);
    return { expiresAt: s.expiresAt };
  });
}

/**
 * « J'ai effectué le paiement. »
 *
 * Une DÉCLARATION : la boutique est prévenue et vérifie. Rien n'est réglé, rien
 * n'est livré sur cette seule foi (§57).
 */
export async function reportCustomerPayment(input: {
  slug:               string;
  intentId:           string;
  declaredAmount?:    number | null;
  declaredReference?: string | null;
  declaredSender?:    string | null;
  comment?:           string | null;
}): Promise<ActionResult<{ status: IntentStatus }>> {
  return attempt(async () => {
    const i = await intentOfStore(input.slug, input.intentId);
    return reportPayment({
      intentId:          i.id,
      declaredAmount:    input.declaredAmount ?? null,
      declaredReference: input.declaredReference ?? null,
      declaredSender:    input.declaredSender ?? null,
      comment:           input.comment ?? null,
    });
  });
}
