import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseService } from '../../../lib/supabaseServiceClient';
import { screenMessage } from '../../../lib/actionResult';

// GET /api/invitations?token=xxx  → validate token, return invitation details
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'Token manquant' }, { status: 400 });

  const svc = getSupabaseService();

  const { data: inv, error } = await svc
    .from('employee_invitations')
    .select('id, email, expires_at, accepted_at, company_id, businesses(name)')
    .eq('token', token)
    .maybeSingle();

  if (error || !inv) {
    return NextResponse.json({ error: 'Invitation invalide ou introuvable.' }, { status: 404 });
  }
  if (inv.accepted_at) {
    return NextResponse.json({ error: 'Cette invitation a déjà été utilisée.' }, { status: 410 });
  }
  if (new Date(inv.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Cette invitation a expiré.' }, { status: 410 });
  }

  // L'écran doit savoir s'il faut proposer de CRÉER un mot de passe ou
  // simplement de rejoindre l'équipe : le porteur du lien voit déjà l'adresse,
  // lui dire qu'elle a un compte ne lui apprend rien qu'il ne puisse exploiter.
  // En cas d'échec de lecture, on retombe sur le formulaire de création : le
  // POST refait la vérification, et c'est lui seul qui décide.
  const hasAccount = await findAuthUserByEmail(svc, inv.email as string)
    .then((u) => u !== null)
    .catch(() => false);

  return NextResponse.json({
    id:          inv.id,
    email:       inv.email,
    companyName: (inv as any).businesses?.name ?? 'ProfitPilot',
    expiresAt:   inv.expires_at,
    hasAccount,
  });
}

/**
 * Le compte Auth portant cette adresse, ou `null`.
 *
 * Parcourt TOUTES les pages : la première page seule (1 000 comptes) laissait
 * passer un compte existant pour un nouveau, et `createUser` échouait alors sur
 * « déjà inscrit ». La comparaison ignore la casse — l'invitation est stockée en
 * minuscules, un compte ancien ne l'est pas forcément.
 */
async function findAuthUserByEmail(
  svc: ReturnType<typeof getSupabaseService>,
  email: string,
): Promise<{ id: string } | null> {
  const target = email.trim().toLowerCase();
  const perPage = 1000;
  for (let page = 1; ; page++) {
    const { data, error } = await svc.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(error.message);
    const users = data?.users ?? [];
    const found = users.find((u) => (u.email ?? '').toLowerCase() === target);
    if (found) return { id: found.id };
    if (users.length < perPage) return null;
  }
}

// POST /api/invitations  → accept invitation, create account (or attach the
// existing one), join company
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const { token, password } = body ?? {};

  if (!token) {
    return NextResponse.json({ error: 'Token manquant.' }, { status: 400 });
  }

  const svc = getSupabaseService();

  // Validate invitation
  const { data: inv, error: invErr } = await svc
    .from('employee_invitations')
    .select('id, email, expires_at, accepted_at, company_id, employee_id, role')
    .eq('token', token)
    .maybeSingle();

  if (invErr || !inv) {
    return NextResponse.json({ error: 'Invitation invalide ou introuvable.' }, { status: 404 });
  }
  if (inv.accepted_at) {
    return NextResponse.json({ error: 'Cette invitation a déjà été utilisée.' }, { status: 410 });
  }
  if (new Date(inv.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Cette invitation a expiré.' }, { status: 410 });
  }

  const email = inv.email as string;

  let existing: { id: string } | null;
  try {
    existing = await findAuthUserByEmail(svc, email);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  let userId: string;

  if (existing) {
    // ── Compte existant : on ne touche JAMAIS à son mot de passe ─────────────
    //
    // Ce chemin remplaçait le mot de passe du compte par celui que tapait le
    // porteur du lien. Or le lien n'authentifie personne : il suffit qu'il soit
    // transféré, intercepté ou deviné pour que n'importe qui prenne le contrôle
    // d'un compte — propriétaire d'une autre entreprise compris — avec ses
    // données et ses abonnements.
    //
    // Le lien reste une invitation : il rattache le compte à l'équipe, ce que
    // l'employeur a voulu. Pour entrer, la personne se connecte avec SON mot de
    // passe habituel ; un mot de passe éventuellement envoyé est ignoré.
    userId = existing.id;
  } else {
    // Nouveau compte : le mot de passe choisi ici devient celui du compte.
    if (!password || typeof password !== 'string') {
      return NextResponse.json({ error: 'Mot de passe requis.' }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Le mot de passe doit contenir au moins 8 caractères.' }, { status: 400 });
    }
    // Create new user (email_confirm bypassed — they verified via invitation link)
    const { data: created, error: createErr } = await svc.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createErr || !created?.user) {
      return NextResponse.json({ error: screenMessage(createErr, 'Erreur création compte') }, { status: 500 });
    }
    userId = created.user.id;
  }

  // Add to business_members
  const role = (inv.role ?? 'viewer') as string;
  const { error: memberErr } = await svc
    .from('business_members')
    .upsert({
      business_id: inv.company_id,
      user_id:     userId,
      role,
      is_active:   true,
    }, { onConflict: 'business_id,user_id' });

  if (memberErr) return NextResponse.json({ error: memberErr.message }, { status: 500 });

  // Mark invitation as accepted
  await svc
    .from('employee_invitations')
    .update({ accepted_at: new Date().toISOString() })
    .eq('id', inv.id);

  // `existingAccount` dit à l'écran de ne pas tenter de connexion avec un mot
  // de passe qui n'est pas celui du compte, mais d'envoyer vers la connexion.
  return NextResponse.json({ email, success: true, existingAccount: Boolean(existing) });
}
