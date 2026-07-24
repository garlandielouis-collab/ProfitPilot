'use server';

import { getBusinessContext } from '../../lib/serverAuth';
import { getSupabaseService } from '../../lib/supabaseServiceClient';
import { notify } from '../../lib/notify';

export type EmployeeRole = 'owner' | 'manager' | 'cashier' | 'viewer';

export type Employee = {
  id:         string;
  user_id:    string;
  role:       EmployeeRole;
  is_active:  boolean;
  created_at: string;
  email:      string | null;
  full_name:  string | null;
};

export async function listEmployees(): Promise<Employee[]> {
  const { supabase, businessId, userId } = await getBusinessContext();

  // Must be owner or manager to list
  const { data: me } = await supabase
    .from('business_members')
    .select('role')
    .eq('business_id', businessId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!me || !['owner', 'manager'].includes(me.role)) {
    throw new Error('Accès non autorisé');
  }

  const { data, error } = await supabase
    .from('business_members')
    .select('id, user_id, role, is_active, created_at')
    .eq('business_id', businessId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);

  // Fetch auth user metadata for each member via service client
  const svc = getSupabaseService();
  const members = await Promise.all(
    (data ?? []).map(async (m) => {
      try {
        const { data: u } = await svc.auth.admin.getUserById(m.user_id);
        return {
          ...m,
          email:     u.user?.email ?? null,
          full_name: u.user?.user_metadata?.full_name ?? null,
          role:      m.role as EmployeeRole,
        };
      } catch {
        return { ...m, email: null, full_name: null, role: m.role as EmployeeRole };
      }
    }),
  );

  return members;
}

export async function inviteEmployee(email: string, role: EmployeeRole = 'cashier') {
  const { supabase, businessId, userId } = await getBusinessContext();

  // Only owner can invite
  const { data: me } = await supabase
    .from('business_members')
    .select('role')
    .eq('business_id', businessId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!me || me.role !== 'owner') throw new Error('Seul le propriétaire peut inviter des employés');

  if (!email.trim() || !email.includes('@')) throw new Error('Email invalide');

  const svc = getSupabaseService();

  // Get the business name for the invite email
  const { data: biz } = await supabase
    .from('businesses')
    .select('name')
    .eq('id', businessId)
    .maybeSingle();

  // Check if user already exists in auth
  const { data: existingList } = await svc.auth.admin.listUsers();
  const existing = existingList?.users?.find((u) => u.email === email.toLowerCase().trim());

  let invitedUserId: string;

  if (existing) {
    invitedUserId = existing.id;
  } else {
    // Send invite email via Supabase
    const { data: invited, error: invErr } = await svc.auth.admin.inviteUserByEmail(email.trim(), {
      data: {
        invited_to_business: businessId,
        invited_role:        role,
        business_name:       biz?.name ?? 'ProfitPilot',
      },
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? 'https://profitpilot.app'}/auth/callback?type=invite`,
    });
    if (invErr) throw new Error(invErr.message);
    invitedUserId = invited.user!.id;
  }

  // Add to business_members (upsert to avoid duplicates)
  const { error: memberErr } = await supabase
    .from('business_members')
    .upsert({
      business_id: businessId,
      user_id:     invitedUserId,
      role,
      is_active:   true,
    }, { onConflict: 'business_id,user_id' });

  if (memberErr) throw new Error(memberErr.message);

  void notify({
    companyId: businessId, triggeredBy: userId,
    type: 'employee_created',
    title: `Nouvel employé invité`,
    body: `${email} — rôle : ${role}`,
    entity: 'employee', entityId: invitedUserId,
    data: { email, role },
  });

  return { email, role };
}

export async function updateEmployeeRole(memberId: string, role: EmployeeRole) {
  const { supabase, businessId, userId } = await getBusinessContext();

  const { data: me } = await supabase
    .from('business_members')
    .select('role')
    .eq('business_id', businessId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!me || me.role !== 'owner') throw new Error('Seul le propriétaire peut modifier les rôles');

  const { error } = await supabase
    .from('business_members')
    .update({ role })
    .eq('id', memberId)
    .eq('business_id', businessId);

  if (error) throw new Error(error.message);
}

export async function removeEmployee(memberId: string) {
  const { supabase, businessId, userId } = await getBusinessContext();

  const { data: me } = await supabase
    .from('business_members')
    .select('role')
    .eq('business_id', businessId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!me || me.role !== 'owner') throw new Error('Seul le propriétaire peut retirer des membres');

  // Soft delete
  const { error } = await supabase
    .from('business_members')
    .update({ is_active: false, deleted_at: new Date().toISOString() })
    .eq('id', memberId)
    .eq('business_id', businessId)
    .neq('user_id', userId); // can't remove yourself

  if (error) throw new Error(error.message);
}
