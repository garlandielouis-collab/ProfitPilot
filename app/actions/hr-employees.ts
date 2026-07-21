'use server';

import { getBusinessContext } from '../../lib/serverAuth';
import { getSupabaseService } from '../../lib/supabaseServiceClient';
import { revalidatePath } from 'next/cache';

export type EmployeeStatus = 'actif' | 'inactif' | 'conge';

export type HrEmployee = {
  id:              string;
  company_id:      string;
  first_name:      string;
  last_name:       string;
  email:           string | null;
  phone:           string | null;
  position:        string | null;
  avatar_url:      string | null;
  status:          EmployeeStatus;
  hire_date:       string | null;
  salary:          number | null;
  salary_currency: string;
  notes:           string | null;
  created_at:      string;
};

export type UpsertEmployeeInput = {
  id?:             string;
  first_name:      string;
  last_name:       string;
  email?:          string;
  phone?:          string;
  position?:       string;
  status?:         EmployeeStatus;
  hire_date?:      string;
  salary?:         number | null;
  salary_currency?: string;
  notes?:          string;
};

export async function listHrEmployees(): Promise<HrEmployee[]> {
  const { supabase, businessId } = await getBusinessContext();
  const { data, error } = await supabase
    .from('employees')
    .select('*')
    .eq('company_id', businessId)
    .is('deleted_at', null)
    .order('last_name', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []).map(normalise);
}

export async function upsertHrEmployee(input: UpsertEmployeeInput): Promise<HrEmployee> {
  const { supabase, businessId } = await getBusinessContext();

  const payload = {
    company_id:      businessId,
    first_name:      input.first_name.trim(),
    last_name:       input.last_name.trim(),
    email:           input.email?.trim() || null,
    phone:           input.phone?.trim() || null,
    position:        input.position?.trim() || null,
    status:          input.status ?? 'actif',
    hire_date:       input.hire_date || null,
    salary:          input.salary ?? null,
    salary_currency: input.salary_currency ?? 'HTG',
    notes:           input.notes?.trim() || null,
  };

  let data: any;
  let error: any;

  if (input.id) {
    ({ data, error } = await supabase
      .from('employees')
      .update(payload)
      .eq('id', input.id)
      .eq('company_id', businessId)
      .select()
      .single());
  } else {
    ({ data, error } = await supabase
      .from('employees')
      .insert(payload)
      .select()
      .single());
  }

  if (error) throw new Error(error.message);
  revalidatePath('/employes');
  return normalise(data);
}

export async function deleteHrEmployee(id: string): Promise<void> {
  const { supabase, businessId } = await getBusinessContext();
  const { error } = await supabase
    .from('employees')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('company_id', businessId);

  if (error) throw new Error(error.message);
  revalidatePath('/employes');
}

export async function inviteEmployeeByEmail(email: string): Promise<void> {
  const { supabase, businessId, userId } = await getBusinessContext();
  const svc = await getSupabaseService();

  // Check if user already exists in auth
  const { data: users } = await svc.auth.admin.listUsers();
  const existing = users?.users?.find((u) => u.email === email);

  if (existing) {
    // Add directly as business member
    const { error } = await supabase
      .from('business_members')
      .upsert({
        business_id: businessId,
        user_id:     existing.id,
        role:        'viewer',
        is_active:   true,
        invited_by:  userId,
      }, { onConflict: 'business_id,user_id' });
    if (error) throw new Error(error.message);
  } else {
    // Create invitation record
    const { error } = await supabase
      .from('invitations')
      .insert({
        business_id: businessId,
        email:       email.toLowerCase().trim(),
        role:        'viewer',
        invited_by:  userId,
        expires_at:  new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      });
    if (error) throw new Error(error.message);
  }

  revalidatePath('/employees');
  revalidatePath('/employes');
}

function normalise(row: any): HrEmployee {
  return {
    id:              row.id,
    company_id:      row.company_id,
    first_name:      row.first_name,
    last_name:       row.last_name,
    email:           row.email ?? null,
    phone:           row.phone ?? null,
    position:        row.position ?? null,
    avatar_url:      row.avatar_url ?? null,
    status:          (row.status ?? 'actif') as EmployeeStatus,
    hire_date:       row.hire_date ?? null,
    salary:          row.salary != null ? Number(row.salary) : null,
    salary_currency: row.salary_currency ?? 'HTG',
    notes:           row.notes ?? null,
    created_at:      row.created_at,
  };
}
