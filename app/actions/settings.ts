'use server';

import { revalidatePath }   from 'next/cache';
import { getSupabaseServer } from '../../lib/supabaseServerClient';
import {
  businessProfileSchema,
  userPreferencesSchema,
  type BusinessProfileInput,
  type UserPreferencesInput,
} from '../../lib/validations';

// ── helpers ────────────────────────────────────────────────────────────────────

async function getAuthUser() {
  const supabase = getSupabaseServer();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error('Non authentifié');
  return { user, supabase };
}

// ── Business Profile ──────────────────────────────────────────────────────────

export async function getBusinessProfile() {
  const { user, supabase } = await getAuthUser();

  const { data, error } = await supabase
    .from('businesses')
    .select('*')
    .eq('owner_id', user.id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

export async function upsertBusinessProfile(raw: BusinessProfileInput) {
  const { user, supabase } = await getAuthUser();

  // Validate with Zod
  const parsed = businessProfileSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'Données invalides');
  }
  const data = parsed.data;

  // Check if a record already exists
  const { data: existing } = await supabase
    .from('businesses')
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle();

  const payload = {
    owner_id:         user.id,
    name:             data.name,
    sector:           data.sector           || null,
    phone:            data.phone            || null,
    address:          data.address          || null,
    website:          data.website          || null,
    tax_id:           data.tax_id           || null,
    exchange_rate:    data.exchange_rate,
    default_currency: data.default_currency,
  };

  if (existing?.id) {
    const { error } = await supabase
      .from('businesses')
      .update(payload)
      .eq('id', existing.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from('businesses')
      .insert(payload);
    if (error) throw new Error(error.message);
  }

  revalidatePath('/settings');
  revalidatePath('/dashboard');
}

// ── User Preferences ──────────────────────────────────────────────────────────

export async function getUserPreferences() {
  const { user, supabase } = await getAuthUser();

  const { data, error } = await supabase
    .from('user_preferences')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

export async function upsertUserPreferences(raw: UserPreferencesInput) {
  const { user, supabase } = await getAuthUser();

  const parsed = userPreferencesSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'Données invalides');
  }
  const data = parsed.data;

  const { data: existing } = await supabase
    .from('user_preferences')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  const payload = {
    user_id:               user.id,
    language:              data.language,
    currency:              data.currency,
    dark_mode:             data.dark_mode,
    notifications_enabled: data.notifications_enabled,
    auto_save:             data.auto_save,
  };

  if (existing?.id) {
    const { error } = await supabase
      .from('user_preferences')
      .update(payload)
      .eq('id', existing.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from('user_preferences')
      .insert(payload);
    if (error) throw new Error(error.message);
  }

  revalidatePath('/settings');
}

// ── Data Export ───────────────────────────────────────────────────────────────

export async function exportUserData() {
  const { user, supabase } = await getAuthUser();

  const [
    { data: business },
    { data: prefs },
    { data: sales },
    { data: expenses },
    { data: products },
    { data: purchases },
    { data: clients },
  ] = await Promise.all([
    supabase.from('businesses').select('*').eq('owner_id', user.id).maybeSingle(),
    supabase.from('user_preferences').select('*').eq('user_id', user.id).maybeSingle(),
    supabase.from('sales').select('*').eq('owner_id', user.id).order('created_at', { ascending: false }),
    supabase.from('expenses').select('*').eq('owner_id', user.id).order('date', { ascending: false }),
    supabase.from('products').select('*').eq('owner_id', user.id),
    supabase.from('purchases').select('*').eq('owner_id', user.id).order('created_at', { ascending: false }),
    supabase.from('clients').select('*').eq('owner_id', user.id),
  ]);

  return {
    exported_at: new Date().toISOString(),
    user_id: user.id,
    email: user.email,
    business,
    preferences: prefs,
    sales:     sales     ?? [],
    expenses:  expenses  ?? [],
    products:  products  ?? [],
    purchases: purchases ?? [],
    clients:   clients   ?? [],
  };
}

// ── Delete Account ────────────────────────────────────────────────────────────

export async function deleteAccount() {
  const { user, supabase } = await getAuthUser();

  // Cascade-delete owned data in order (foreign keys)
  const tables: Array<{ table: string; col: string }> = [
    { table: 'sales',            col: 'owner_id' },
    { table: 'expenses',         col: 'owner_id' },
    { table: 'products',         col: 'owner_id' },
    { table: 'purchases',        col: 'owner_id' },
    { table: 'clients',          col: 'owner_id' },
    { table: 'user_preferences', col: 'user_id'  },
    { table: 'businesses',       col: 'owner_id' },
  ];

  for (const { table, col } of tables) {
    const { error } = await supabase.from(table).delete().eq(col, user.id);
    if (error) console.error(`Error deleting ${table}:`, error.message);
  }

  // Sign out — actual auth user deletion requires admin SDK
  await supabase.auth.signOut();
}

// ── Password Change (client-side via Supabase Auth) ────────────────────────────
// This is handled purely client-side with supabase.auth.updateUser({ password: '...' })
// No server action needed — exported here just for documentation completeness.
export type PasswordChangeNote = 'Use supabase.auth.updateUser({ password }) on the client';
