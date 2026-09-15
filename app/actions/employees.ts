'use server';

import { getBusinessContext } from '../../lib/serverAuth';
import { getSupabaseService } from '../../lib/supabaseServiceClient';
import { assertFeature } from '../../lib/entitlements';
import { attempt, UserFacingError, type ActionResult } from '../../lib/actionResult';

// ─────────────────────────────────────────────────────────────────────────────
// Les membres de l'entreprise — qui peut entrer dans ProfitPilot
//
// À ne pas confondre avec `hr-employees.ts`, qui tient le REGISTRE du personnel
// (poste, salaire, date d'embauche). Ici il n'est question que d'accès : une
// ligne de `business_members` est un compte qui ouvre l'application.
//
// ── `inviteEmployee` a disparu ──────────────────────────────────────────────
//
// Deux chemins d'invitation coexistaient, et tous deux consommaient un siège :
// celui-ci (invitation Supabase `admin.inviteUserByEmail`, appelé par l'écran
// `/employees`) et `sendHrInvitation` (table `employee_invitations`, courriel
// Resend, page `/auth/accept-invitation`). Le second est le seul complet : il a
// une page d'acceptation, un jeton qui expire, et il rattache l'invité à sa
// fiche RH. Le premier envoyait un courriel Supabase qui atterrissait sur un
// `/auth/callback?type=invite` sans rien rattacher.
//
// L'écran `/employees` ayant fusionné dans `/employes`, ce chemin-là n'a plus
// d'appelant — et deux portes vers le même siège, c'est une porte de trop.
// ─────────────────────────────────────────────────────────────────────────────

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

/** Le rôle de l'appelant dans l'entreprise courante, ou `null` s'il n'en est pas. */
async function myRole(
  supabase: Awaited<ReturnType<typeof getBusinessContext>>['supabase'],
  businessId: string,
  userId: string,
): Promise<EmployeeRole | null> {
  const { data } = await supabase
    .from('business_members')
    .select('role')
    .eq('business_id', businessId)
    .eq('user_id', userId)
    .maybeSingle();
  return (data?.role as EmployeeRole | undefined) ?? null;
}

export async function listEmployees(): Promise<ActionResult<Employee[]>> {
  return attempt(async () => {
    const { supabase, businessId, userId } = await getBusinessContext();

    const role = await myRole(supabase, businessId, userId);
    if (!role || !['owner', 'manager'].includes(role)) {
      throw new UserFacingError(
        "Seuls le propriétaire et les gérants voient qui a accès à l'entreprise.",
      );
    }

    const { data, error } = await supabase
      .from('business_members')
      .select('id, user_id, role, is_active, created_at')
      .eq('business_id', businessId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });

    if (error) throw new Error(error.message);

    // Le nom et l'adresse vivent dans `auth.users`, que seule la clé service
    // lit. Un membre dont la lecture échoue reste dans la liste, sans nom :
    // mieux vaut une ligne anonyme qu'un membre invisible à qui on a donné
    // les clés.
    const svc = getSupabaseService();
    return Promise.all(
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
  });
}

export async function updateEmployeeRole(
  memberId: string,
  role: EmployeeRole,
): Promise<ActionResult> {
  return attempt(async () => {
    const { supabase, businessId, userId } = await getBusinessContext();

    if ((await myRole(supabase, businessId, userId)) !== 'owner') {
      throw new UserFacingError('Seul le propriétaire peut modifier les rôles.');
    }

    // `assertFeature` lève une `FeatureLockedError`, dont le message nomme
    // l'offre requise : `attempt` le laisse passer tel quel.
    await assertFeature('multi_user_roles');

    const { error } = await supabase
      .from('business_members')
      .update({ role })
      .eq('id', memberId)
      .eq('business_id', businessId);

    if (error) throw new Error(error.message);
  });
}

export async function removeEmployee(memberId: string): Promise<ActionResult> {
  return attempt(async () => {
    const { supabase, businessId, userId } = await getBusinessContext();

    if ((await myRole(supabase, businessId, userId)) !== 'owner') {
      throw new UserFacingError("Seul le propriétaire peut retirer un accès.");
    }

    // `neq('user_id', userId)` : on ne se retire pas soi-même. Sans ce garde,
    // un propriétaire seul pouvait se fermer la porte de sa propre entreprise.
    const { data, error } = await supabase
      .from('business_members')
      .update({ is_active: false, deleted_at: new Date().toISOString() })
      .eq('id', memberId)
      .eq('business_id', businessId)
      .neq('user_id', userId)
      .select('id');

    if (error) throw new Error(error.message);
    if (!data?.length) {
      throw new UserFacingError(
        "Vous ne pouvez pas retirer votre propre accès : l'entreprise se retrouverait sans propriétaire.",
      );
    }
  });
}
