'use server';

import { getBusinessContext, requirePermission } from '../../lib/serverAuth';
import { getSupabaseService } from '../../lib/supabaseServiceClient';
import {
  type Role,
  type Permission,
  ROLE_PERMISSIONS,
  ALL_PERMISSIONS,
  isValidRole,
} from '../../lib/rbac';

// ─── Types ────────────────────────────────────────────────────────────────────

export type RbacRole = {
  id:         string;
  name:       string;
  label:      string;
  color:      string;
  is_system:  boolean;
  company_id: string | null;
};

export type PermissionRecord = {
  name:        string;
  label:       string;
  category:    string;
  description: string | null;
};

// ─── hasPermission (server-side, DB-aware) ────────────────────────────────────

/**
 * Returns true if the current user has the given permission for their active company.
 * Checks company-specific DB overrides first, then falls back to static defaults.
 */
export async function hasPermission(permission: Permission): Promise<boolean> {
  try {
    const { role, businessId, supabase } = await getBusinessContext();

    const { data: overrides } = await supabase
      .from('rbac_role_permissions')
      .select('permission_name')
      .eq('company_id', businessId)
      .eq('role_name', role);

    if (overrides && overrides.length > 0) {
      return overrides.some((r: any) => r.permission_name === permission);
    }

    return ROLE_PERMISSIONS[role as Role]?.includes(permission) ?? false;
  } catch {
    return false;
  }
}

// ─── List all permissions ─────────────────────────────────────────────────────

export async function listPermissions(): Promise<PermissionRecord[]> {
  const { supabase } = await getBusinessContext();
  const { data, error } = await supabase
    .from('rbac_permissions')
    .select('name, label, category, description')
    .order('category')
    .order('name');
  if (error) throw new Error(error.message);
  return (data ?? []) as PermissionRecord[];
}

// ─── List roles (system + company) ───────────────────────────────────────────

export async function listRoles(): Promise<RbacRole[]> {
  const { supabase, businessId } = await getBusinessContext();
  const { data, error } = await supabase
    .from('rbac_roles')
    .select('id, name, label, color, is_system, company_id')
    .or(`company_id.is.null,company_id.eq.${businessId}`)
    .order('is_system', { ascending: false })
    .order('name');
  if (error) throw new Error(error.message);
  return (data ?? []) as RbacRole[];
}

// ─── Get all role→permissions map for a company ───────────────────────────────

export async function getCompanyRbacMatrix(): Promise<Record<string, string[]>> {
  const { supabase, businessId } = await getBusinessContext();

  const { data: companyPerms } = await supabase
    .from('rbac_role_permissions')
    .select('role_name, permission_name')
    .eq('company_id', businessId);

  const { data: systemPerms } = await supabase
    .from('rbac_role_permissions')
    .select('role_name, permission_name')
    .is('company_id', null);

  // Company overrides take precedence per-role
  const companyRoles = new Set((companyPerms ?? []).map((r: any) => r.role_name));
  const matrix: Record<string, string[]> = {};

  for (const row of (companyPerms ?? [])) {
    const r = row as any;
    if (!matrix[r.role_name]) matrix[r.role_name] = [];
    matrix[r.role_name].push(r.permission_name);
  }

  for (const row of (systemPerms ?? [])) {
    const r = row as any;
    if (!companyRoles.has(r.role_name)) {
      if (!matrix[r.role_name]) matrix[r.role_name] = [];
      matrix[r.role_name].push(r.permission_name);
    }
  }

  return matrix;
}

// ─── Save role permissions (company-level override) ───────────────────────────

export async function saveRolePermissions(
  roleName: string,
  permissions: string[],
): Promise<void> {
  await requirePermission('settings:write');
  const { businessId } = await getBusinessContext();

  const valid = permissions.filter((p) => ALL_PERMISSIONS.includes(p as Permission));
  const svc   = getSupabaseService();

  await svc
    .from('rbac_role_permissions')
    .delete()
    .eq('company_id', businessId)
    .eq('role_name', roleName);

  if (valid.length === 0) return;

  const rows = valid.map((permission_name) => ({
    company_id: businessId,
    role_name:  roleName,
    permission_name,
  }));

  const { error } = await svc.from('rbac_role_permissions').insert(rows);
  if (error) throw new Error(error.message);
}

// ─── Create custom role ───────────────────────────────────────────────────────

export async function createCustomRole(
  name: string,
  label: string,
  color: string,
  permissions: string[],
): Promise<RbacRole> {
  await requirePermission('settings:write');
  const { businessId } = await getBusinessContext();

  const slug = name.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  const svc  = getSupabaseService();

  const { data: role, error } = await svc
    .from('rbac_roles')
    .insert({ company_id: businessId, name: slug, label, color, is_system: false })
    .select()
    .single();

  if (error || !role) throw new Error(error?.message ?? 'Erreur création rôle');

  await saveRolePermissions(slug, permissions);
  return role as RbacRole;
}

// ─── Delete custom role ───────────────────────────────────────────────────────

export async function deleteCustomRole(roleId: string): Promise<void> {
  await requirePermission('settings:write');
  const { businessId } = await getBusinessContext();

  const svc = getSupabaseService();
  const { error } = await svc
    .from('rbac_roles')
    .delete()
    .eq('id', roleId)
    .eq('company_id', businessId)
    .eq('is_system', false);

  if (error) throw new Error(error.message);
}

// ─── Assign role to user ──────────────────────────────────────────────────────

export async function assignRoleToUser(userId: string, roleName: string): Promise<void> {
  await requirePermission('employees:update');
  const { businessId, userId: assignedBy } = await getBusinessContext();

  const svc = getSupabaseService();
  await svc.from('employee_roles').upsert({
    company_id:  businessId,
    user_id:     userId,
    role_name:   roleName,
    assigned_by: assignedBy,
  }, { onConflict: 'company_id,user_id' });

  // Sync to business_members.role for backward compatibility
  await svc
    .from('business_members')
    .update({ role: roleName })
    .eq('business_id', businessId)
    .eq('user_id', userId);
}
