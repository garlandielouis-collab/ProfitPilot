'use server';

import { cache } from 'react';
import { cookies } from 'next/headers';
import { getSupabaseServer } from './supabaseServerClient';
import { type Role, type Permission, roleHasPermission, getPermissionsForRole } from './rbac';

const ACTIVE_STORE_COOKIE = 'pp_active_store';

export type BusinessContext = {
  supabase:        Awaited<ReturnType<typeof getSupabaseServer>>;
  userId:          string;
  businessId:      string;
  exchangeRate:    number;
  defaultCurrency: 'HTG' | 'USD';
  role:            Role;
  can:             (permission: Permission) => boolean;
};

// cache() deduplicates within a single server request.
export const getBusinessContext = cache(async (): Promise<BusinessContext> => {
  const supabase = await getSupabaseServer();

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr) console.error('[getBusinessContext] auth.getUser error:', authErr.message);
  if (!user) console.warn('[getBusinessContext] No authenticated user');
  if (authErr || !user) throw new Error('Non authentifié.');
  const userId = user.id;

  // Respect active store cookie (multi-store)
  const jar = await cookies();
  const activeStoreId = jar.get(ACTIVE_STORE_COOKIE)?.value ?? null;

  const bizQuery = supabase
    .from('businesses')
    .select('id, exchange_rate, default_currency');

  const { data: biz, error: bizErr } = activeStoreId
    ? await bizQuery.eq('id', activeStoreId).eq('owner_id', userId).maybeSingle()
    : await bizQuery.eq('owner_id', userId).maybeSingle();

  if (bizErr) throw new Error(bizErr.message);

  async function ensureOwnerMembership(businessId: string) {
    const { data: existing } = await supabase
      .from('business_members')
      .select('id')
      .eq('business_id', businessId)
      .eq('user_id', userId)
      .maybeSingle();
    if (!existing) {
      await supabase.from('business_members').insert({
        business_id: businessId,
        user_id:     userId,
        role:        'owner',
        is_active:   true,
      });
    }
  }

  async function getRoleForBusiness(businessId: string): Promise<Role> {
    // Owner of this business → always 'owner'
    const { data: ownership } = await supabase
      .from('businesses')
      .select('id')
      .eq('id', businessId)
      .eq('owner_id', userId)
      .maybeSingle();
    if (ownership) return 'owner';

    // Otherwise get role from business_members
    const { data: member } = await supabase
      .from('business_members')
      .select('role')
      .eq('business_id', businessId)
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle();
    return (member?.role as Role) ?? 'viewer';
  }

  if (!biz) {
    const { data: newBiz, error: createErr } = await supabase
      .from('businesses')
      .insert({
        owner_id:         userId,
        name:             user.user_metadata?.business_name ?? user.user_metadata?.full_name ?? 'Mon Entreprise',
        default_currency: 'HTG',
        exchange_rate:    130,
      })
      .select('id, exchange_rate, default_currency')
      .single();

    if (createErr || !newBiz) throw new Error(createErr?.message ?? 'Impossible de créer le business.');
    const id = (newBiz as any).id as string;
    await ensureOwnerMembership(id);
    return buildContext(supabase, userId, id, newBiz as any, 'owner');
  }

  const id = (biz as any).id as string;
  await ensureOwnerMembership(id);
  const role = await getRoleForBusiness(id);
  return buildContext(supabase, userId, id, biz as any, role);
});

function buildContext(
  supabase:   any,
  userId:     string,
  businessId: string,
  biz:        { exchange_rate?: number; default_currency?: string },
  role:       Role,
): BusinessContext {
  return {
    supabase,
    userId,
    businessId,
    exchangeRate:    Number(biz.exchange_rate ?? 130),
    defaultCurrency: (biz.default_currency ?? 'HTG') as 'HTG' | 'USD',
    role,
    can: (permission: Permission) => roleHasPermission(role, permission),
  };
}

/**
 * Throws 403 if the current user lacks the given permission.
 * Use at the top of any sensitive server action.
 */
export async function requirePermission(permission: Permission): Promise<BusinessContext> {
  const ctx = await getBusinessContext();
  if (!ctx.can(permission)) {
    throw new Error(`Permission refusée : ${permission}`);
  }
  return ctx;
}

/**
 * Vérifie qu'un utilisateur est membre actif d'un business spécifique.
 */
export async function verifyBusinessAccess(businessId: string): Promise<BusinessContext> {
  const supabase = await getSupabaseServer();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) throw new Error('Non authentifié.');

  const { data: member, error: mErr } = await supabase
    .from('business_members')
    .select('business_id, role')
    .eq('business_id', businessId)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .is('deleted_at', null)
    .maybeSingle();

  if (mErr) throw new Error(mErr.message);
  if (!member) throw new Error("Vous n'êtes pas membre de cette entreprise.");

  const { data: biz } = await supabase
    .from('businesses')
    .select('exchange_rate, default_currency')
    .eq('id', businessId)
    .maybeSingle();

  const role = (member.role as Role) ?? 'viewer';
  return buildContext(supabase, user.id, businessId, biz ?? {}, role);
}

export async function getBusinessExchangeRate(supabase: any, businessId: string): Promise<number> {
  try {
    const ctx = await getBusinessContext();
    if (ctx.businessId === businessId) return ctx.exchangeRate;
  } catch { /* fall through */ }

  const { data } = await supabase
    .from('businesses')
    .select('exchange_rate')
    .eq('id', businessId)
    .maybeSingle();
  return Number(data?.exchange_rate ?? 130);
}
