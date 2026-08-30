'use server';

// ─────────────────────────────────────────────────────────────────────────────
// Connexion par numéro de téléphone (§6.1, « Contexte haïtien »)
//
// « Connexion par numéro de téléphone en premier, indicatif +509 prérempli,
//   clavier numérique automatique ; l'e-mail en option secondaire. »
//
// Le mot de passe reste la preuve ; le téléphone n'est qu'un identifiant. Le
// marchand connaît son numéro par cœur — son adresse e-mail est souvent une
// formalité créée le jour de l'inscription et jamais relue.
//
// ── Pourquoi la résolution se fait ICI, et pas dans le navigateur ────────────
//
// Une action qui répondrait « ce numéro correspond à untel@gmail.com » serait
// un annuaire ouvert : on essaierait les numéros un à un pour récolter des
// adresses. Le mot de passe est donc vérifié AVANT que l'adresse ne sorte
// d'ici. On n'apprend l'e-mail rattaché à un numéro que si l'on connaissait
// déjà le mot de passe — c'est-à-dire si l'on est le marchand.
//
// La vérification passe par un client anonyme JETABLE, sans cookies : elle ne
// doit poser aucune session côté serveur. C'est le navigateur qui ouvre la
// sienne, ensuite, exactement comme pour une connexion par e-mail — un seul
// chemin de session à maintenir.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js';
import { getSupabaseServer } from '../../lib/supabaseServerClient';
import { getSupabaseService } from '../../lib/supabaseServiceClient';

/**
 * Huit chiffres, sans indicatif, sans espace ni tiret.
 * « +509 3712-4521 », « 509 37124521 » et « 3712 4521 » sont le même numéro ;
 * sans normalisation, la contrainte d'unicité ne le saurait pas.
 */
export async function normalizeHaitianPhone(raw: string): Promise<string | null> {
  let digits = (raw ?? '').replace(/\D/g, '');
  if (digits.startsWith('509') && digits.length === 11) digits = digits.slice(3);
  if (digits.startsWith('00509')) digits = digits.slice(5);
  // Un numéro haïtien fait huit chiffres et commence par 2, 3, 4 ou 5.
  return /^[2-5][0-9]{7}$/.test(digits) ? digits : null;
}

export type PhoneLoginResult =
  | { ok: true; email: string }
  | { ok: false; reason: 'bad_phone' | 'no_account' | 'bad_password' | 'unavailable' };

/**
 * Rend l'adresse e-mail rattachée à un numéro — et seulement si le mot de passe
 * fourni est le bon. Le navigateur ouvre ensuite la session avec cette adresse.
 */
export async function resolvePhoneLogin(rawPhone: string, password: string): Promise<PhoneLoginResult> {
  const phone = await normalizeHaitianPhone(rawPhone);
  if (!phone) return { ok: false, reason: 'bad_phone' };
  if (!password) return { ok: false, reason: 'bad_password' };

  const url  = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return { ok: false, reason: 'unavailable' };

  let email: string | null = null;
  try {
    const service = getSupabaseService();

    const { data: link, error: linkErr } = await service
      .from('user_phones')
      .select('user_id')
      .eq('phone', phone)
      .maybeSingle();

    // Table absente = migration non appliquée. Ce n'est pas « numéro inconnu » :
    // le dire franchement évite de faire douter le marchand de son propre numéro.
    if (linkErr) return { ok: false, reason: 'unavailable' };
    if (!link) return { ok: false, reason: 'no_account' };

    const { data: account, error: accErr } = await service.auth.admin.getUserById(link.user_id);
    if (accErr || !account?.user?.email) return { ok: false, reason: 'no_account' };
    email = account.user.email;
  } catch {
    return { ok: false, reason: 'unavailable' };
  }

  // Client jetable, sans persistance : il vérifie le mot de passe et disparaît.
  const probe = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { error } = await probe.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, reason: 'bad_password' };

  return { ok: true, email };
}

/**
 * Rattache un numéro au compte connecté. Appelé juste après l'inscription, et
 * disponible depuis les réglages pour qui s'est inscrit avant cet écran.
 */
export async function linkPhoneToAccount(rawPhone: string): Promise<{ ok: boolean; error?: string }> {
  const phone = await normalizeHaitianPhone(rawPhone);
  if (!phone) return { ok: false, error: 'Numéro haïtien attendu : 8 chiffres, par exemple 3712 4521.' };

  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Non authentifié.' };

  const { error } = await supabase
    .from('user_phones')
    .upsert({ user_id: user.id, phone, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });

  if (error) {
    // Contrainte d'unicité : le numéro sert déjà à quelqu'un d'autre. Le dire
    // sans révéler à qui.
    if (error.code === '23505') {
      return { ok: false, error: 'Ce numéro est déjà rattaché à un autre compte.' };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/**
 * Rattrape le numéro laissé dans les métadonnées à l'inscription.
 *
 * Quand la confirmation par e-mail est active, l'inscription ne pose pas de
 * session : impossible d'écrire dans `user_phones` à ce moment-là. Le numéro
 * attend donc dans les métadonnées du compte, et se rattache à la première
 * connexion réussie. Sans ce rattrapage, tout marchand inscrit avec
 * confirmation ne pourrait jamais se connecter avec son numéro.
 */
export async function ensurePhoneLinked(): Promise<void> {
  try {
    const supabase = await getSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const pending = (user.user_metadata as Record<string, unknown> | null)?.phone;
    if (typeof pending !== 'string' || !pending) return;

    const phone = await normalizeHaitianPhone(pending);
    if (!phone) return;

    const { data: existing } = await supabase
      .from('user_phones')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (existing) return;

    await supabase.from('user_phones').insert({ user_id: user.id, phone });
  } catch {
    // Un rattrapage qui échoue ne doit jamais empêcher une connexion : le
    // marchand entre par e-mail, et réessaiera au prochain passage.
  }
}
