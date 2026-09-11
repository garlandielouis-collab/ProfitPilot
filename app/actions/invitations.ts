'use server';

import { getBusinessContext } from '../../lib/serverAuth';
import { getSupabaseService } from '../../lib/supabaseServiceClient';
import { sendInvitationEmail } from '../../lib/email';
import { assertFeature, assertSeatAvailable } from '../../lib/entitlements';
import { notify } from '../../lib/notify';

// Sur Vercel sans NEXT_PUBLIC_APP_URL, l'adresse de production injectée par la
// plateforme ; localhost seulement en dernier recours — chez l'invité, il n'ouvre rien.
const APP_URL = process.env.NEXT_PUBLIC_APP_URL?.trim()
  || (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : 'http://localhost:3000');

export type InvitationResult = {
  id:         string;
  email:      string;
  token:      string;
  expires_at: string;
};

export async function sendHrInvitation({
  employeeId,
  email,
  firstName,
  lastName,
}: {
  employeeId?: string;
  email:       string;
  firstName:   string;
  lastName:    string;
}): Promise<InvitationResult> {
  const { supabase, businessId, userId } = await getBusinessContext();

  // Même porte que `inviteEmployee` : ce chemin RH crée aussi un siège, et
  // sans ce contrôle il suffisait de passer par là pour ignorer l'offre.
  await assertFeature('employees');
  await assertSeatAvailable(businessId);

  // Get business name + inviter name
  const [{ data: biz }, { data: { user: inviter } }] = await Promise.all([
    supabase.from('businesses').select('name').eq('id', businessId).single(),
    supabase.auth.getUser(),
  ]);

  const companyName = (biz as any)?.name ?? 'ProfitPilot';
  const inviterName = inviter?.user_metadata?.full_name ?? inviter?.email ?? 'Le propriétaire';
  const inviteeName = `${firstName} ${lastName}`.trim();

  // Cancel any existing pending invitation for this email in this company
  await supabase
    .from('employee_invitations')
    .update({ accepted_at: new Date().toISOString() })  // mark old ones as "used"
    .eq('company_id', businessId)
    .eq('email', email.toLowerCase())
    .is('accepted_at', null);

  // Create new invitation
  const svc = getSupabaseService();
  const { data: inv, error } = await svc
    .from('employee_invitations')
    .insert({
      company_id:  businessId,
      employee_id: employeeId ?? null,
      email:       email.toLowerCase().trim(),
      invited_by:  userId,
    })
    .select('id, email, token, expires_at')
    .single();

  if (error || !inv) throw new Error(error?.message ?? 'Erreur création invitation');

  const acceptUrl = `${APP_URL}/auth/accept-invitation?token=${inv.token}`;

  // Send email via Resend
  await sendInvitationEmail({
    to:          email,
    inviteeName,
    companyName,
    inviterName,
    acceptUrl,
  });

  void notify({
    companyId: businessId, triggeredBy: userId,
    type: 'employee_created',
    title: `Invitation envoyée — ${inviteeName}`,
    body: `Email : ${email} · En attente d'acceptation`,
    entity: 'invitation', entityId: inv.id,
    data: { email, inviteeName, companyName },
  });

  return inv as InvitationResult;
}

export async function listPendingInvitations(): Promise<Array<{
  id: string; email: string; created_at: string; expires_at: string; employee_id: string | null;
}>> {
  const { supabase, businessId } = await getBusinessContext();
  const { data, error } = await supabase
    .from('employee_invitations')
    .select('id, email, created_at, expires_at, employee_id')
    .eq('company_id', businessId)
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function cancelInvitation(id: string): Promise<void> {
  const { supabase, businessId } = await getBusinessContext();
  const { error } = await supabase
    .from('employee_invitations')
    .delete()
    .eq('id', id)
    .eq('company_id', businessId);
  if (error) throw new Error(error.message);
}
