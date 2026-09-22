// ─────────────────────────────────────────────────────────────────────────────
// POST /api/payment-bridge/devices/revoke — l'appareil renonce à son accès
//
// Appelée par le compagnon lui-même : déconnexion, désinstallation propre. Le
// jeton qu'il présente est celui qu'il révoque — il ne peut renoncer qu'à SON
// propre accès, jamais à celui d'un autre appareil, et c'est pourquoi aucun
// identifiant d'appareil n'est lu dans le corps.
//
// La révocation par le MARCHAND (téléphone perdu, employé parti) ne passe pas
// par ici : elle se fait depuis l'écran « Recevoir des paiements », en session,
// par l'action `revokeMerchantDevice`. Un téléphone volé ne va pas se révoquer
// tout seul.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from 'next/server';
import { guardDevice } from '../../../../../lib/paymentBridge/deviceRoute';
import { revokeDevice } from '../../../../../lib/paymentBridge/deviceAuth';
import { logSafe } from '../../../../../lib/paymentBridge/mask';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const guard = await guardDevice(req, 'revoke', 10);
  if ('response' in guard) return guard.response;
  const { device } = guard;

  try {
    await revokeDevice({ deviceId: device.deviceId, businessId: device.businessId, userId: null });
  } catch (err) {
    console.error('[payment-bridge] révocation échouée', logSafe({
      businessId: device.businessId, reason: (err as Error).message,
    }));
    return NextResponse.json({ error: 'Service momentanément indisponible. Réessayez.' }, { status: 503 });
  }

  return NextResponse.json({ ok: true, status: 'revoked' });
}
