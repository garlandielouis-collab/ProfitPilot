import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseService } from '../../../lib/supabaseServiceClient';

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

  return NextResponse.json({
    id:          inv.id,
    email:       inv.email,
    companyName: (inv as any).businesses?.name ?? 'ProfitPilot',
    expiresAt:   inv.expires_at,
  });
}

// POST /api/invitations  → accept invitation, create account, join company
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const { token, password } = body ?? {};

  if (!token || !password) {
    return NextResponse.json({ error: 'Token et mot de passe requis.' }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Le mot de passe doit contenir au moins 8 caractères.' }, { status: 400 });
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

  // Check if user already exists
  const { data: existingList } = await svc.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const existing = existingList?.users?.find((u) => u.email === email);

  let userId: string;

  if (existing) {
    // User exists — update their password
    userId = existing.id;
    const { error: pwErr } = await svc.auth.admin.updateUserById(userId, { password });
    if (pwErr) return NextResponse.json({ error: pwErr.message }, { status: 500 });
  } else {
    // Create new user (email_confirm bypassed — they verified via invitation link)
    const { data: created, error: createErr } = await svc.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createErr || !created?.user) {
      return NextResponse.json({ error: createErr?.message ?? 'Erreur création compte' }, { status: 500 });
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

  return NextResponse.json({ email, success: true });
}
