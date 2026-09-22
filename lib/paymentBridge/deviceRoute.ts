// ─────────────────────────────────────────────────────────────────────────────
// La garde commune des routes appelées par un téléphone enrôlé
//
// Cadence → jeton → appareil, dans cet ordre, et les mêmes codes partout :
// 429, 401, 403, et 503 quand la base ne répond pas. Le 503 n'est pas un détail :
// un client qui reçoit 401 peut conclure que son jeton est mauvais et l'effacer
// — un à-coup réseau désenrôlerait le téléphone (voir deviceAuth.ts).
//
// `proxy.ts` exclut tout `/api` : ces routes se gardent seules, et c'est ici.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { authenticateDevice, type AuthenticatedDevice } from './deviceAuth';
import { deviceTokenFrom } from './devices';
import { logSafe } from './mask';
import { overRate, rateKeyFor } from './rateLimit';

export async function guardDevice(
  req: Request,
  bucket: string,
  maxPerMinute: number,
): Promise<{ device: AuthenticatedDevice } | { response: NextResponse }> {
  const token = deviceTokenFrom(req.headers);

  if (overRate(bucket, rateKeyFor(req.headers, token), maxPerMinute)) {
    return { response: NextResponse.json({ error: 'Trop de requêtes. Réessayez dans une minute.' }, { status: 429 }) };
  }
  if (!token) {
    return { response: NextResponse.json({ error: 'Appareil non authentifié.' }, { status: 401 }) };
  }

  try {
    const auth = await authenticateDevice(token);
    if (!auth.ok) return { response: NextResponse.json({ error: auth.reason }, { status: auth.status }) };
    return { device: auth.device };
  } catch (err) {
    console.error('[payment-bridge] authentification impossible', logSafe({ reason: (err as Error).message }));
    return {
      response: NextResponse.json({ error: 'Service momentanément indisponible. Réessayez.' }, { status: 503 }),
    };
  }
}
