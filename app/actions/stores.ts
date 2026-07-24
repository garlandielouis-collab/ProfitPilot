'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { getSupabaseServer } from '../../lib/supabaseServerClient';
import { getSupabaseService } from '../../lib/supabaseServiceClient';
import { planMaxStores } from '../../lib/planFeatures';
import type { PlanKey } from '../../lib/plans';

const ACTIVE_STORE_COOKIE = 'pp_active_store';

export async function listMyStores() {
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Non authentifié');

  const { data, error } = await supabase
    .from('businesses')
    .select('id, name, sector, address')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getActiveStoreId(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(ACTIVE_STORE_COOKIE)?.value ?? null;
}

export async function switchStore(storeId: string) {
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Non authentifié');

  // Verify ownership or membership
  const { data: biz } = await supabase
    .from('businesses')
    .select('id')
    .eq('id', storeId)
    .eq('owner_id', user.id)
    .maybeSingle();

  if (!biz) throw new Error('Boutique introuvable ou accès refusé');

  const jar = await cookies();
  jar.set(ACTIVE_STORE_COOKIE, storeId, {
    path:     '/',
    httpOnly: false,
    sameSite: 'lax',
    maxAge:   60 * 60 * 24 * 30, // 30 days
  });

  revalidatePath('/', 'layout');
}

export async function createStore(name: string) {
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Non authentifié');

  if (!name.trim()) throw new Error('Le nom de la boutique est requis');

  // ── Vérifier la limite d'entreprises du plan ─────────────────
  const [{ count }, { data: sub }] = await Promise.all([
    supabase
      .from('businesses')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', user.id)
      .is('deleted_at', null)
      .is('archived_at', null),
    supabase
      .from('subscriptions')
      .select('plan_key')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle(),
  ]);

  const planKey = (sub?.plan_key as PlanKey) ?? 'Ti Machann';
  const maxStores = planMaxStores(planKey);
  const current = count ?? 0;

  if (current >= maxStores) {
    throw new Error(
      `Limite atteinte : votre plan "${planKey}" permet ${maxStores} entreprise${maxStores > 1 ? 's' : ''} maximum. Vous en avez déjà ${current}.`
    );
  }

  const { data, error } = await supabase
    .from('businesses')
    .insert({
      owner_id:         user.id,
      name:             name.trim(),
      default_currency: 'HTG',
      exchange_rate:    130,
    })
    .select('id, name')
    .single();

  if (error) throw new Error(error.message);

  // Add owner to business_members (use service role to bypass RLS on a brand-new business)
  const svc = getSupabaseService();
  const { error: memberErr } = await svc.from('business_members').insert({
    business_id: data.id,
    user_id:     user.id,
    role:        'owner',
    is_active:   true,
  });
  if (memberErr) throw new Error('Erreur création membre: ' + memberErr.message);

  // Auto-switch to the new store
  const jar = await cookies();
  jar.set(ACTIVE_STORE_COOKIE, data.id, {
    path:     '/',
    httpOnly: false,
    sameSite: 'lax',
    maxAge:   60 * 60 * 24 * 30,
  });

  revalidatePath('/', 'layout');
  return data;
}
