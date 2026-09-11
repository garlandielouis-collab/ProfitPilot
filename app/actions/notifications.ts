'use server';

import { getSupabaseServer } from '../../lib/supabaseServerClient';
import { getBusinessContext, requirePermission } from '../../lib/serverAuth';
import { assertPermission } from '../../lib/entitlements';
import { revalidatePath } from 'next/cache';

export type Notification = {
  id:          string;
  companyId:   string;
  type:        string;
  title:       string;
  body:        string | null;
  entity:      string | null;
  entityId:    string | null;
  data:        Record<string, any> | null;
  readAt:      string | null;
  createdAt:   string;
  triggeredBy: string | null;
};

export type NotifPreference = {
  type:    string;
  enabled: boolean;
};

// ── List notifications ────────────────────────────────────────────────────────

export async function listNotifications(opts?: {
  unreadOnly?: boolean;
  limit?: number;
  offset?: number;
}): Promise<Notification[]> {
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const limit  = opts?.limit  ?? 30;
  const offset = opts?.offset ?? 0;

  // Les noms de colonnes lus ici ne sont PAS ceux de la table.
  //
  //   code          table
  //   ────────────  ─────────────────
  //   company_id    business_id
  //   entity        reference_type
  //   entity_id     reference_id
  //   data          metadata
  //   triggered_by  (n'existe pas)
  //
  // PostgREST rejette la requête entière dès la première colonne inconnue :
  // la cloche restait donc vide quoi qu'il arrive. On garde le nom des champs
  // renvoyés — les composants s'appuient dessus — et on corrige la lecture.
  let q = supabase
    .from('notifications')
    .select('id, business_id, type, title, body, reference_type, reference_id, metadata, read_at, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (opts?.unreadOnly) q = q.is('read_at', null);

  const { data } = await q;
  return (data ?? []).map((r: any): Notification => ({
    id:          r.id,
    companyId:   r.business_id,
    type:        r.type,
    title:       r.title,
    body:        r.body ?? null,
    entity:      r.reference_type ?? null,
    entityId:    r.reference_id ?? null,
    data:        r.metadata ?? null,
    readAt:      r.read_at ?? null,
    createdAt:   r.created_at,
    triggeredBy: null,
  }));
}

// ── Unread count ──────────────────────────────────────────────────────────────

export async function getUnreadCount(): Promise<number> {
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 0;

  const { count } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .is('read_at', null);

  return count ?? 0;
}

// ── Mark as read ──────────────────────────────────────────────────────────────

export async function markAsRead(id: string): Promise<void> {
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString(), is_read: true })
    .eq('id', id)
    .eq('user_id', user.id)
    .is('read_at', null);
}

export async function markAllAsRead(): Promise<void> {
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString(), is_read: true })
    .eq('user_id', user.id)
    .is('read_at', null);

  revalidatePath('/', 'layout');
}

// ── Preferences ───────────────────────────────────────────────────────────────

// `notification_preferences` ne stocke PAS une ligne par type. Elle stocke une
// ligne par (entreprise, utilisateur) et une colonne booléenne par type :
// low_stock, payment_due, new_sale, new_purchase, new_expense, ai_insights,
// weekly_summary. Le code lisait `type` / `enabled` / `company_id` — trois
// colonnes inexistantes — donc la liste revenait toujours vide et l'écriture
// échouait sans bruit : aucune préférence n'était ni lue ni enregistrée.
//
// Les valeurs reprennent les DEFAULT de la table (20260526_complete_schema_v2)
// afin que l'écran affiche, avant toute ligne enregistrée, exactement ce que la
// base appliquera : les trois notifications d'activité courante sont muettes par
// défaut, les alertes qui demandent une action ne le sont pas.
// Constantes volontairement NON exportées : ce fichier est `'use server'`, et
// tout export y doit être une fonction asynchrone.
const PREFERENCE_DEFAULTS = {
  low_stock:      true,
  payment_due:    true,
  new_sale:       false,
  new_purchase:   false,
  new_expense:    false,
  ai_insights:    true,
  weekly_summary: true,
} as const;

const PREFERENCE_COLUMNS = Object.keys(PREFERENCE_DEFAULTS) as (keyof typeof PREFERENCE_DEFAULTS)[];

export async function getNotifPreferences(): Promise<NotifPreference[]> {
  try {
    const { supabase, businessId } = await getBusinessContext();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data } = await supabase
      .from('notification_preferences')
      .select(PREFERENCE_COLUMNS.join(','))
      .eq('user_id', user.id)
      .eq('business_id', businessId)
      .maybeSingle();

    return PREFERENCE_COLUMNS.map((type) => ({
      type,
      enabled: (data as any)?.[type] ?? PREFERENCE_DEFAULTS[type],
    }));
  } catch {
    return [];
  }
}

export async function setNotifPreference(type: string, enabled: boolean): Promise<void> {
  try {
    // Le nom du type devient un nom de colonne : on n'accepte que la liste
    // connue, jamais une chaîne venue de l'appelant.
    if (!(PREFERENCE_COLUMNS as readonly string[]).includes(type)) return;

    const { supabase, businessId } = await getBusinessContext();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from('notification_preferences')
      .upsert(
        { user_id: user.id, business_id: businessId, [type]: enabled },
        { onConflict: 'business_id,user_id' },
      );
  } catch { /* swallow */ }
}

// ── Le résumé du dimanche soir ───────────────────────────────────────────────
//
// Le cron hebdomadaire (`/api/cron/weekly-digest`) ne prépare le message que
// pour les entreprises dont `weekly_digest_enabled` n'est pas `false`. Ce
// réglage tournait donc en production sans qu'aucun écran ne permette de
// l'éteindre : le seul moyen de ne plus recevoir le résumé était d'ouvrir la
// base. C'est l'interrupteur qui manquait, pas la fonctionnalité.

export async function getWeeklyDigestEnabled(): Promise<boolean> {
  try {
    const { supabase, businessId } = await getBusinessContext();
    const { data } = await supabase
      .from('businesses')
      .select('weekly_digest_enabled')
      .eq('id', businessId)
      .maybeSingle();

    // Le cron traite « pas de valeur » comme un oui : l'écran dit la même chose.
    return (data as { weekly_digest_enabled?: boolean } | null)?.weekly_digest_enabled ?? true;
  } catch {
    return true;
  }
}

export async function setWeeklyDigestEnabled(enabled: boolean): Promise<void> {
  const { supabase, businessId } = await getBusinessContext();
  // Un employé ne coupe pas les rapports du patron.
  await assertPermission('settings:write');

  await supabase
    .from('businesses')
    .update({ weekly_digest_enabled: enabled })
    .eq('id', businessId);

  revalidatePath('/automation');
}

// ── L'alerte de stock bas ────────────────────────────────────────────────────
//
// Même histoire que le résumé : le cron quotidien saute les entreprises dont
// `low_stock_alerts_enabled` vaut `false`, mais aucun écran n'écrivait ce
// réglage. L'interrupteur de /automation écrivait à la place une préférence
// `stock_low` qui n'existe pas — et ne coupait donc rien. C'est ce réglage
// d'entreprise, celui que le cron lit, qu'il pilote désormais ; la préférence
// personnelle `low_stock` reste sur /notifications.

export async function getLowStockAlertsEnabled(): Promise<boolean> {
  try {
    const { supabase, businessId } = await getBusinessContext();
    const { data } = await supabase
      .from('businesses')
      .select('low_stock_alerts_enabled')
      .eq('id', businessId)
      .maybeSingle();

    // Le cron ne saute que `false` : sans valeur, l'alerte part.
    return (data as { low_stock_alerts_enabled?: boolean } | null)?.low_stock_alerts_enabled ?? true;
  } catch {
    return true;
  }
}

export async function setLowStockAlertsEnabled(enabled: boolean): Promise<void> {
  const { supabase, businessId } = await requirePermission('settings:write');

  const { data, error } = await supabase
    .from('businesses')
    .update({ low_stock_alerts_enabled: enabled })
    .eq('id', businessId)
    .select('id');

  if (error) throw new Error(error.message);
  // La RLS de `businesses` ne laisse modifier que le propriétaire : un refus
  // y rend zéro ligne, pas une erreur. Sans ce contrôle, l'interrupteur
  // resterait sur la position choisie alors que la base n'a rien changé.
  if (!data || data.length === 0) throw new Error('Réglage non enregistré.');

  revalidatePath('/automation');
}
