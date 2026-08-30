'use server';

import { revalidatePath }   from 'next/cache';
import { getSupabaseServer } from '../../lib/supabaseServerClient';
import { getSupabaseService } from '../../lib/supabaseServiceClient';
import { getBusinessContext } from '../../lib/serverAuth';
import {
  businessProfileSchema,
  userPreferencesSchema,
  type BusinessProfileInput,
  type UserPreferencesInput,
} from '../../lib/validations';

// ── helpers ────────────────────────────────────────────────────────────────────

async function getAuthUser() {
  const supabase = await getSupabaseServer();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error('Non authentifié');
  return { user, supabase };
}

// ── Business Profile ──────────────────────────────────────────────────────────

// Ces deux fonctions cherchaient « l'entreprise dont je suis propriétaire »,
// au singulier. Deux conséquences, toutes deux corrigées ici en passant par le
// contexte métier, qui sait déjà répondre à la question :
//
//   Elles LEVAIENT pour un marchand qui possède deux commerces — `maybeSingle()`
//   sur plusieurs lignes ne renvoie pas la première, il échoue.
//
//   Elles ignoraient le sélecteur d'entreprise : un marchand passé sur sa
//   seconde boutique ouvrait les réglages… de la première, et les modifiait.

export async function getBusinessProfile() {
  const { supabase, businessId } = await getBusinessContext();

  const { data, error } = await supabase
    .from('businesses')
    .select('*')
    .eq('id', businessId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

export async function upsertBusinessProfile(raw: BusinessProfileInput) {
  // Le contexte garantit qu'une entreprise existe — il la crée au besoin. La
  // branche « insertion » d'avant n'a donc plus de raison d'être.
  const { supabase, businessId } = await getBusinessContext();

  // Validate with Zod
  const parsed = businessProfileSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'Données invalides');
  }
  const data = parsed.data;

  // `owner_id` n'est pas dans la charge utile : on met à jour un profil, on ne
  // change pas de propriétaire. L'y laisser faisait tenter à un employé qui
  // corrige une adresse de s'approprier le commerce — et RLS le refusait.
  const payload = {
    name:             data.name,
    sector:           data.sector           || null,
    phone:            data.phone            || null,
    address:          data.address          || null,
    website:          data.website          || null,
    tax_id:           data.tax_id           || null,
    exchange_rate:    data.exchange_rate,
    default_currency: data.default_currency,
  };

  const { error } = await supabase
    .from('businesses')
    .update(payload)
    .eq('id', businessId);
  if (error) throw new Error(error.message);

  revalidatePath('/settings');
  revalidatePath('/dashboard');
  revalidatePath('/rapports');
  revalidatePath('/rapports/comptabilite');
  revalidatePath('/expenses');
  revalidatePath('/dettes');
  revalidatePath('/sales');
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
  const { businessId } = await getBusinessContext();

  const [
    { data: business },
    { data: prefs },
    { data: sales },
    { data: expenses },
    { data: products },
    { data: purchases },
    { data: clients },
  ] = await Promise.all([
    // L'entreprise EN COURS, pas « celle dont je suis propriétaire » :
    // `businessId` vient du contexte, juste au-dessus, et respecte le sélecteur.
    supabase.from('businesses').select('*').eq('id', businessId).maybeSingle(),
    supabase.from('user_preferences').select('*').eq('user_id', user.id).maybeSingle(),
    supabase.from('sales').select('*').eq('business_id', businessId).order('created_at', { ascending: false }),
    supabase.from('expenses').select('*').eq('business_id', businessId).order('created_at', { ascending: false }),
    supabase.from('products').select('*').eq('user_id', user.id),
    supabase.from('purchases').select('*').eq('business_id', businessId).order('created_at', { ascending: false }),
    supabase.from('customers').select('*').eq('business_id', businessId).is('deleted_at', null),
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

  // Exiger une ré-authentification récente (protection anti-CSRF/détournement)
  const { error: recentAuthError } = await supabase.auth.getUser();
  if (recentAuthError || !user) {
    throw new Error('Session invalide. Veuillez vous reconnecter.');
  }

  // Cascade-delete owned data in order (foreign keys)
  const tables: Array<{ table: string; col: string }> = [
    { table: 'sales',            col: 'owner_id'  },
    { table: 'expenses',         col: 'owner_id'  },
    { table: 'purchases',        col: 'owner_id'  },
    { table: 'products',         col: 'user_id'   },
    { table: 'customers',        col: 'owner_id'  },
    { table: 'user_preferences', col: 'user_id'   },
    { table: 'businesses',       col: 'owner_id'  },
  ];

  for (const { table, col } of tables) {
    const { error } = await supabase.from(table).delete().eq(col, user.id);
    if (error) console.error(`Error deleting ${table}:`, error.message);
  }

  // Supprimer l'utilisateur Auth via le service client (service_role)
  try {
    const svc = getSupabaseService();
    const { error: deleteErr } = await svc.auth.admin.deleteUser(user.id);
    if (deleteErr) {
      console.error(`Error deleting auth user via Admin API: ${deleteErr.message}`);
    }
  } catch (e: any) {
    console.error(`Error deleting auth user: ${e.message}`);
  }

  await supabase.auth.signOut();
}

// ── Password Change (client-side via Supabase Auth) ────────────────────────────
// This is handled purely client-side with supabase.auth.updateUser({ password: '...' })
// No server action needed — exported here just for documentation completeness.
export type PasswordChangeNote = 'Use supabase.auth.updateUser({ password }) on the client';
