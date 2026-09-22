// ─────────────────────────────────────────────────────────────────────────────
// POST /api/payment-bridge/devices/heartbeat — « je suis là »
//
// Le compagnon bat régulièrement. Ce battement permet au marchand de distinguer
// « aucun paiement n'est arrivé » de « mon téléphone ne parle plus depuis hier »
// (voir `deviceHeartbeat`, lib/paymentBridge/deviceAuth.ts).
//
// Corps facultatif : { app_version?: string, synced?: boolean }
// `synced: true` quand le téléphone vient de vider sa file de reçus en attente.
//
// La réponse sert aussi d'état de synchronisation : le statut de l'appareil tel
// que le serveur le voit. Un appareil révoqué n'arrive jamais jusqu'ici — il
// reçoit 403 de la garde, et c'est ce 403 qui doit lui faire cesser d'envoyer.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from 'next/server';
import { guardDevice } from '../../../../../lib/paymentBridge/deviceRoute';
import { deviceHeartbeat } from '../../../../../lib/paymentBridge/deviceAuth';
import { logSafe } from '../../../../../lib/paymentBridge/mask';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const guard = await guardDevice(req, 'heartbeat', 30);
  if ('response' in guard) return guard.response;
  const { device } = guard;

  let body: any = {};
  try { body = await req.json(); } catch { /* corps facultatif */ }

  try {
    await deviceHeartbeat({
      deviceId:   device.deviceId,
      appVersion: typeof body?.app_version === 'string' ? body.app_version : null,
      synced:     body?.synced === true,
    });
  } catch (err) {
    console.error('[payment-bridge] battement perdu', logSafe({
      businessId: device.businessId, reason: (err as Error).message,
    }));
    return NextResponse.json({ error: 'Service momentanément indisponible. Réessayez.' }, { status: 503 });
  }

  return NextResponse.json({
    ok:          true,
    device_id:   device.deviceId,
    device_name: device.deviceName,
    // `active` après un battement réussi, par construction.
    status:      'active',
    server_time: new Date().toISOString(),
  });
}
