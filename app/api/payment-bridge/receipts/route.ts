// ─────────────────────────────────────────────────────────────────────────────
// POST /api/payment-bridge/receipts — un encaissement constaté par un appareil
//
// C'est la porte du compagnon Android. Elle n'est pas ouverte : elle est
// authentifiée par un jeton d'appareil, et c'est ce jeton qui désigne
// l'entreprise.
//
// ── Pourquoi cette route se garde elle-même ────────────────────────────────
//
// `proxy.ts` (le middleware de ce projet, nommé ainsi depuis Next 16) EXCLUT tout
// `/api` de son `matcher`. Aucune route d'API de ce dépôt n'est protégée par le
// middleware : chacune s'authentifie seule. Compter sur le middleware ici aurait
// donné un point d'entrée public capable d'écrire des encaissements.
//
// ── L'ordre des refus, et pourquoi il est celui-là ─────────────────────────
//
//   1. la cadence            (429) — avant de lire le corps
//   2. le jeton              (401) — avant de toucher la base
//   3. l'appareil révoqué    (403)
//   4. le corps illisible    (400)
//   5. les champs            (422)
//   6. l'enregistrement      (200, même si déjà connu)
//
// La cadence passe en premier parce qu'elle doit coûter le moins cher possible :
// un appareil en boucle ne doit pas nous faire hacher un jeton ni ouvrir une
// connexion SQL à chaque tour.
//
// ── Ce que le corps de la requête N'A PAS le droit de contenir ─────────────
//
// `business_id`, `merchant_id`, `intent_id`, `order_id`. Aucun n'est lu, et c'est
// vérifié : les nommer permettrait à un appareil de désigner la dette qu'il
// prétend régler, ou le commerce chez qui il déclare. L'entreprise vient du
// jeton ; la dette vient du rapprochement.
//
// Le TEXTE du SMS n'est pas accepté non plus. Le téléphone analyse en local et
// n'envoie que les champs normalisés (§6, §47). Un champ « message » ici ferait
// entrer dans notre base le solde du marchand et les noms de ses correspondants.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from 'next/server';

import { authenticateDevice } from '../../../../lib/paymentBridge/deviceAuth';
import { deviceTokenFrom } from '../../../../lib/paymentBridge/devices';
import { ingestReceipt } from '../../../../lib/paymentBridge/receipts';
import { logSafe } from '../../../../lib/paymentBridge/mask';
import { overRate, rateKeyFor } from '../../../../lib/paymentBridge/rateLimit';
import { screenMessage } from '../../../../lib/actionResult';
import type { ReceiptProvider } from '../../../../lib/paymentBridge/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PROVIDERS: readonly ReceiptProvider[] = ['moncash', 'natcash', 'cash', 'bank', 'other'];

// ─── La cadence ──────────────────────────────────────────────────────────────
//
// 120 par minute : un marchand très actif reçoit quelques dizaines
// d'encaissements par jour. Une réinstallation qui rejoue tout l'historique passe
// donc largement — et c'est voulu, puisque la déduplication les absorbe. Les
// limites de ce compteur sont dites dans lib/paymentBridge/rateLimit.ts.
const RATE_MAX = 120;

export async function POST(req: NextRequest) {
  // ── 1. La cadence ───────────────────────────────────────────────────────
  const token = deviceTokenFrom(req.headers);

  if (overRate('receipts', rateKeyFor(req.headers, token), RATE_MAX)) {
    return NextResponse.json({ error: 'Trop de requêtes. Réessayez dans une minute.' }, { status: 429 });
  }

  // ── 2. Le jeton ─────────────────────────────────────────────────────────
  if (!token) {
    return NextResponse.json({ error: 'Appareil non authentifié.' }, { status: 401 });
  }

  let auth;
  try {
    auth = await authenticateDevice(token);
  } catch (err) {
    // Base injoignable : 503, pas 401. Un téléphone qui reçoit 401 peut conclure
    // que son jeton est mauvais et l'effacer — un à-coup réseau désenrôlerait
    // l'appareil, et le marchand perdrait la détection sans savoir pourquoi.
    console.error('[payment-bridge] authentification impossible', logSafe({
      reason: (err as Error).message,
    }));
    return NextResponse.json(
      { error: 'Service momentanément indisponible. Réessayez.' },
      { status: 503 },
    );
  }

  // ── 3. L'appareil ───────────────────────────────────────────────────────
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const device = auth.device;

  // ── 4. Le corps ─────────────────────────────────────────────────────────
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Corps de requête illisible.' }, { status: 400 });
  }

  // ── 5. Les champs ───────────────────────────────────────────────────────
  const provider = String(body?.provider ?? '').toLowerCase() as ReceiptProvider;
  if (!PROVIDERS.includes(provider)) {
    return NextResponse.json({ error: 'Opérateur inconnu.' }, { status: 422 });
  }

  const amount = Number(body?.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1e9) {
    return NextResponse.json({ error: 'Montant invalide.' }, { status: 422 });
  }

  const currency = String(body?.currency ?? 'HTG').toUpperCase();
  if (currency !== 'HTG' && currency !== 'USD') {
    return NextResponse.json({ error: 'Devise non prise en charge.' }, { status: 422 });
  }

  const receivedAt = parseReceivedAt(body?.received_at);
  if (!receivedAt) {
    return NextResponse.json({ error: "Date de réception invalide." }, { status: 422 });
  }

  // ── 6. L'enregistrement ─────────────────────────────────────────────────
  try {
    const result = await ingestReceipt({
      // L'entreprise vient du JETON. Tout `business_id` présent dans le corps est
      // ignoré — et ce silence est volontaire : refuser la requête apprendrait à
      // qui sonde que ce champ est regardé.
      businessId:           device.businessId,
      provider,
      source:               'sms_companion',
      amount,
      currency,
      transactionReference: str(body?.transaction_reference, 64),
      senderIdentifier:     str(body?.sender_identifier, 32),
      receivedAt,
      deviceId:             device.deviceId,
      parserVersion:        str(body?.parser_version, 40),
      actorType:            'device',
      actorLabel:           device.deviceName,
    });

    // 200 dans les deux cas, y compris « déjà connu ». Un 409 sur un doublon
    // pousserait le client à réessayer ou à signaler une erreur, là où la bonne
    // conduite est d'oublier ce message et de passer au suivant.
    return NextResponse.json({
      ok:            true,
      receipt_id:    result.receiptId,
      already_known: result.alreadyKnown,
      // Assez pour que le compagnon affiche « rapproché » ou « à vérifier », sans
      // rien apprendre des autres commandes du marchand : ni référence, ni montant
      // attendu, ni identité de client.
      match_status:  result.outcome?.matchStatus ?? null,
      confirmed:     result.confirmed,
    });
  } catch (err) {
    console.error('[payment-bridge] encaissement refusé', logSafe({
      businessId: device.businessId,
      provider,
      amount,
      reason:     (err as Error).message,
    }));
    return NextResponse.json(
      { error: screenMessage(err, "L'encaissement n'a pas pu être enregistré.") },
      { status: 500 },
    );
  }
}

function str(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s === '' ? null : s.slice(0, max);
}

/**
 * L'heure d'arrivée, telle que le téléphone la rapporte — bornée.
 *
 * Elle entre dans la clé de déduplication et dans la fenêtre temporelle du
 * rapprochement : un appareil qui enverrait `received_at: 1970` ou `2099` ferait
 * échouer les deux mécanismes silencieusement. Une date hors des bornes est donc
 * refusée plutôt que corrigée — corriger reviendrait à inventer l'heure d'un
 * paiement.
 *
 * Cinq minutes de tolérance dans le futur : l'horloge d'un téléphone dérive, et
 * refuser un encaissement pour trois secondes d'avance serait absurde.
 * Trente jours dans le passé : c'est ce qu'une réinstallation qui rejoue son
 * historique peut légitimement remonter.
 */
function parseReceivedAt(v: unknown): string | null {
  if (typeof v !== 'string' || v.trim() === '') return null;
  const d = new Date(v);
  const t = d.getTime();
  if (Number.isNaN(t)) return null;

  const now = Date.now();
  if (t > now + 5 * 60_000) return null;
  if (t < now - 30 * 86_400_000) return null;

  return d.toISOString();
}
