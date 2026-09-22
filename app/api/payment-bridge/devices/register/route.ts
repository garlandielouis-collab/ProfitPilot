// ─────────────────────────────────────────────────────────────────────────────
// POST /api/payment-bridge/devices/register — enrôler un téléphone
//
// Pour la future application ProfitPilot Pay Link : le marchand se connecte à
// son compte DANS l'application, qui appelle cette route pour obtenir son jeton
// d'appareil. (Depuis le web, l'écran « Recevoir des paiements » fait la même
// chose par l'action `enrollDevice`.)
//
// ── Ce qui autorise l'enrôlement ───────────────────────────────────────────
//
// Une SESSION DE MEMBRE, propriétaire ou administrateur — jamais le téléphone
// seul (§36). Deux formes acceptées :
//
//   Authorization: Bearer <jeton d'accès Supabase>   l'application mobile
//   cookie de session                                 un navigateur connecté
//
// Un jeton d'appareil (`ppdev_…`) n'est PAS accepté ici : un appareil enrôlé ne
// peut pas en enrôler un autre. Sinon un seul téléphone compromis suffirait à en
// fabriquer autant qu'il veut, et révoquer le premier ne servirait à rien.
//
// ── Quelle entreprise ──────────────────────────────────────────────────────
//
// `business_id` peut être envoyé — un compte peut avoir plusieurs commerces — mais
// il est VÉRIFIÉ contre les adhésions du compte, avec le rôle. Sans lui, et si le
// compte ne gère qu'un commerce, c'est celui-là.
//
// Corps : { device_name: string, platform?: 'android'|'ios', app_version?: string,
//           business_id?: uuid }
// Réponse : { device_id, token } — le jeton n'est rendu qu'une fois.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseService } from '../../../../../lib/supabaseServiceClient';
import { getSupabaseServer } from '../../../../../lib/supabaseServerClient';
import { registerDevice } from '../../../../../lib/paymentBridge/deviceAuth';
import { logSafe } from '../../../../../lib/paymentBridge/mask';
import { overRate, rateKeyFor } from '../../../../../lib/paymentBridge/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function userFrom(req: NextRequest): Promise<string | null> {
  const auth = req.headers.get('authorization');
  if (auth?.startsWith('Bearer ')) {
    const jwt = auth.slice(7).trim();
    if (!jwt || jwt.startsWith('ppdev_')) return null;
    const { data, error } = await getSupabaseService().auth.getUser(jwt);
    return error || !data.user ? null : data.user.id;
  }
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase.auth.getUser();
  return error || !data.user ? null : data.user.id;
}

export async function POST(req: NextRequest) {
  // Dix enrôlements par minute et par adresse : largement assez pour un humain,
  // et un frein à qui essaierait des jetons d'accès volés en série.
  if (overRate('register', rateKeyFor(req.headers, null), 10)) {
    return NextResponse.json({ error: 'Trop de requêtes. Réessayez dans une minute.' }, { status: 429 });
  }

  let userId: string | null;
  try {
    userId = await userFrom(req);
  } catch (err) {
    console.error('[payment-bridge] enrôlement : session illisible', logSafe({ reason: (err as Error).message }));
    return NextResponse.json({ error: 'Service momentanément indisponible. Réessayez.' }, { status: 503 });
  }
  if (!userId) return NextResponse.json({ error: 'Connectez-vous à votre compte.' }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Corps de requête illisible.' }, { status: 400 });
  }

  const deviceName = typeof body?.device_name === 'string' ? body.device_name.trim() : '';
  if (!deviceName) return NextResponse.json({ error: 'Donnez un nom à ce téléphone.' }, { status: 422 });

  const platform = ['android', 'ios'].includes(body?.platform) ? body.platform : 'android';
  const wanted = typeof body?.business_id === 'string' && UUID_RE.test(body.business_id) ? body.business_id : null;

  // Les commerces où ce compte a le droit d'enrôler — lus par la clé service,
  // filtrés par le compte authentifié ci-dessus. Même règle que `mpm_write`.
  const { data: memberships, error } = await getSupabaseService()
    .from('business_members')
    .select('business_id, role')
    .eq('user_id', userId)
    .eq('is_active', true)
    .is('deleted_at', null)
    .in('role', ['owner', 'admin']);

  if (error) {
    console.error('[payment-bridge] enrôlement : adhésions illisibles', logSafe({ reason: error.message }));
    return NextResponse.json({ error: 'Service momentanément indisponible. Réessayez.' }, { status: 503 });
  }

  const allowed = (memberships ?? []).map((m: any) => m.business_id as string);
  let businessId: string | null = null;
  if (wanted) businessId = allowed.includes(wanted) ? wanted : null;
  else if (allowed.length === 1) businessId = allowed[0];

  if (!businessId) {
    return NextResponse.json(
      {
        error: wanted || allowed.length === 0
          ? "Seul le propriétaire ou un administrateur du commerce peut enrôler un téléphone."
          : 'Précisez le commerce (business_id) : votre compte en gère plusieurs.',
      },
      { status: 403 },
    );
  }

  try {
    const res = await registerDevice({
      businessId,
      userId,
      deviceName,
      platform,
      appVersion: typeof body?.app_version === 'string' ? body.app_version.slice(0, 40) : null,
    });
    return NextResponse.json({ ok: true, device_id: res.deviceId, token: res.token });
  } catch (err) {
    console.error('[payment-bridge] enrôlement échoué', logSafe({ businessId, reason: (err as Error).message }));
    return NextResponse.json({ error: "Le téléphone n'a pas pu être enrôlé." }, { status: 500 });
  }
}
