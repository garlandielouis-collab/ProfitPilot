'use server';

import { cache } from 'react';
import { cookies } from 'next/headers';
import { getSupabaseServer } from './supabaseServerClient';
import { type Role, type Permission, roleHasPermission, getPermissionsForRole } from './rbac';

const ACTIVE_STORE_COOKIE = 'pp_active_store';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validUuid(v: string | null | undefined): string | null {
  return v && UUID_RE.test(v) ? v : null;
}

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
  let user;
  // Robust getUser with a small retry on transient failures/timeouts
  let attempts = 0;
  while (attempts < 2) {
    attempts += 1;
    try {
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr) {
        console.error(`[getBusinessContext] auth.getUser error (attempt ${attempts}):`, authErr.message);
        user = null;
      } else {
        user = authData?.user ?? null;
      }
      if (user) break;
    } catch (err) {
      console.error(`[getBusinessContext] auth.getUser threw (attempt ${attempts}):`, (err as Error).message);
      user = null;
    }
    // short backoff
    if (!user && attempts < 2) await new Promise((r) => setTimeout(r, 150));
  }
  if (!user) throw new Error('Non authentifié.');
  const userId = user.id;

  // Respect active store cookie (multi-store)
  const jar = await cookies();
  const activeStoreId = validUuid(jar.get(ACTIVE_STORE_COOKIE)?.value);

  async function getActiveStoreBusiness(storeId: string) {
    const { data, error } = await supabase
      .from('businesses')
      .select('id, owner_id, exchange_rate, default_currency')
      .eq('id', storeId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    if (data.owner_id === userId) return data;
    const { data: member } = await supabase
      .from('business_members')
      .select('id')
      .eq('business_id', storeId)
      .eq('user_id', userId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .maybeSingle();
    return member ? data : null;
  }

  async function getOwnedBusiness() {
    const { data, error } = await supabase
      .from('businesses')
      .select('id, owner_id, exchange_rate, default_currency')
      .eq('owner_id', userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  }

  async function getMemberBusiness() {
    const { data, error } = await supabase
      .from('business_members')
      .select('businesses (id, owner_id, exchange_rate, default_currency)')
      .eq('user_id', userId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data?.businesses ?? null;
  }

  let biz = null;
  if (activeStoreId) {
    biz = await getActiveStoreBusiness(activeStoreId);
  }
  if (!biz) {
    biz = await getOwnedBusiness();
  }
  if (!biz) {
    biz = await getMemberBusiness();
  }

  /**
   * Appartenance et rôle en UNE lecture.
   *
   * Le chemin précédent en faisait trois, à chaque server action : vérifier la
   * ligne `business_members`, puis redemander à `businesses` si l'utilisateur
   * en est propriétaire, puis relire `business_members` pour le rôle. Or
   * `owner_id` est déjà là — l'entreprise vient d'être lue avec — et la même
   * ligne de membre répond aux deux autres questions.
   *
   * La ligne de propriétaire reste créée si elle manque : les politiques RLS
   * s'appuient sur `business_members`, sans elle le propriétaire perdrait
   * l'accès à ses propres données.
   */
  async function resolveMembership(businessId: string, ownerId: string | undefined): Promise<Role> {
    const isOwner = ownerId === userId;

    const { data: member } = await supabase
      .from('business_members')
      .select('id, role, is_active')
      .eq('business_id', businessId)
      .eq('user_id', userId)
      .maybeSingle();

    if (!member && isOwner) {
      await supabase.from('business_members').insert({
        business_id: businessId,
        user_id:     userId,
        role:        'owner',
        is_active:   true,
      });
    }

    if (isOwner) return 'owner';
    return member?.is_active ? ((member.role as Role) ?? 'viewer') : 'viewer';
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
    await resolveMembership(id, userId);   // entreprise qu'on vient de créer : propriétaire
    return buildContext(supabase, userId, id, newBiz as any, 'owner');
  }

  const id = (biz as any).id as string;
  const role = await resolveMembership(id, (biz as any).owner_id);
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
  if (!validUuid(businessId)) throw new Error('ID entreprise invalide.');

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
