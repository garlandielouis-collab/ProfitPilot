'use server';

import { cache } from 'react';
import { getSupabaseServer } from './supabaseServerClient';

export type BusinessContext = {
  supabase: Awaited<ReturnType<typeof getSupabaseServer>>;
  userId: string;
  businessId: string;
  exchangeRate: number;       // USD→HTG rate (cached with context)
  defaultCurrency: 'HTG' | 'USD';
};

// cache() deduplicates calls within the same server request —
// multiple server actions called from the same page only hit the DB once.
export const getBusinessContext = cache(async (): Promise<BusinessContext> => {
  const supabase = await getSupabaseServer();

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr) console.error('[getBusinessContext] auth.getUser error:', authErr.message);
  if (!user) console.warn('[getBusinessContext] No authenticated user — session not found server-side');
  if (authErr || !user) throw new Error('Non authentifié.');
  const userId = user.id;

  const { data: biz, error: bizErr } = await supabase
    .from('businesses')
    .select('id, exchange_rate, default_currency')
    .eq('owner_id', user.id)
    .maybeSingle();

  if (bizErr) throw new Error(bizErr.message);

  // ── Helper: ensure owner is in business_members (needed for RLS on all biz tables) ──
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

  if (!biz) {
    const { data: newBiz, error: createErr } = await supabase
      .from('businesses')
      .insert({
        owner_id:         user.id,
        name:             user.user_metadata?.business_name ?? user.user_metadata?.full_name ?? 'Mon Entreprise',
        default_currency: 'HTG',
        exchange_rate:    130,
      })
      .select('id, exchange_rate, default_currency')
      .single();

    if (createErr || !newBiz) throw new Error(createErr?.message ?? 'Impossible de créer le business.');
    await ensureOwnerMembership((newBiz as any).id);
    return {
      supabase,
      userId:          user.id,
      businessId:      (newBiz as any).id,
      exchangeRate:    Number((newBiz as any).exchange_rate ?? 130),
      defaultCurrency: ((newBiz as any).default_currency ?? 'HTG') as 'HTG' | 'USD',
    };
  }

  await ensureOwnerMembership((biz as any).id);
  return {
    supabase,
    userId:          user.id,
    businessId:      (biz as any).id,
    exchangeRate:    Number((biz as any).exchange_rate ?? 130),
    defaultCurrency: ((biz as any).default_currency ?? 'HTG') as 'HTG' | 'USD',
  };
});

/**
 * Vérifie que l'utilisateur courant est un membre actif du business.
 */
export async function verifyBusinessAccess(businessId: string): Promise<BusinessContext> {
  const supabase = await getSupabaseServer();

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) throw new Error('Non authentifié.');

  const { data: member, error: mErr } = await supabase
    .from('business_members')
    .select('business_id')
    .eq('business_id', businessId)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .is('deleted_at', null)
    .maybeSingle();

  if (mErr) throw new Error(mErr.message);
  if (!member) throw new Error("Vous n'êtes pas membre de cette entreprise.");

  // Fetch exchange rate for this business
  const { data: biz } = await supabase
    .from('businesses')
    .select('exchange_rate, default_currency')
    .eq('id', businessId)
    .maybeSingle();

  return {
    supabase,
    userId:          user.id,
    businessId,
    exchangeRate:    Number((biz as any)?.exchange_rate ?? 130),
    defaultCurrency: ((biz as any)?.default_currency ?? 'HTG') as 'HTG' | 'USD',
  };
}

/**
 * Fetch the business's current USD→HTG exchange rate.
 * Uses the context cache when possible — avoids extra DB round-trip.
 */
export async function getBusinessExchangeRate(supabase: any, businessId: string): Promise<number> {
  // Try to get from already-cached context first (no extra DB call)
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
