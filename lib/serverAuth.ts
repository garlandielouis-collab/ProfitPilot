'use server';

import { cache } from 'react';
import { getSupabaseServer } from './supabaseServerClient';

export type BusinessContext = {
  supabase: Awaited<ReturnType<typeof getSupabaseServer>>;
  userId: string;
  businessId: string;
};

// cache() deduplicates calls within the same server request —
// multiple server actions called from the same page only hit the DB once.
export const getBusinessContext = cache(async (): Promise<BusinessContext> => {
  const supabase = await getSupabaseServer();

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) throw new Error('Non authentifié.');

  const { data: biz, error: bizErr } = await supabase
    .from('businesses')
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle();

  if (bizErr) throw new Error(bizErr.message);

  if (!biz) {
    const { data: newBiz, error: createErr } = await supabase
      .from('businesses')
      .insert({
        owner_id:         user.id,
        name:             user.user_metadata?.business_name ?? user.user_metadata?.full_name ?? 'Mon Entreprise',
        default_currency: 'HTG',
        exchange_rate:    130,
      })
      .select('id')
      .single();

    if (createErr || !newBiz) throw new Error(createErr?.message ?? 'Impossible de créer le business.');
    return { supabase, userId: user.id, businessId: (newBiz as any).id };
  }

  return { supabase, userId: user.id, businessId: biz.id };
});

/**
 * Vérifie que l'utilisateur courant est un membre actif du business.
 * Utilisé par les Server Actions qui reçoivent un business_id du client.
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

  return { supabase, userId: user.id, businessId };
}

/** Fetch the business's current USD→HTG exchange rate. */
export async function getBusinessExchangeRate(supabase: any, businessId: string): Promise<number> {
  const { data } = await supabase
    .from('businesses')
    .select('exchange_rate')
    .eq('id', businessId)
    .maybeSingle();
  return Number(data?.exchange_rate ?? 130);
}
