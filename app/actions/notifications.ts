'use server';

import { getSupabaseServer } from '../../lib/supabaseServerClient';
import { getBusinessContext } from '../../lib/serverAuth';
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

  let q = supabase
    .from('notifications')
    .select('id, company_id, type, title, body, entity, entity_id, data, read_at, created_at, triggered_by')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (opts?.unreadOnly) q = q.is('read_at', null);

  const { data } = await q;
  return (data ?? []).map((r: any): Notification => ({
    id:          r.id,
    companyId:   r.company_id,
    type:        r.type,
    title:       r.title,
    body:        r.body ?? null,
    entity:      r.entity ?? null,
    entityId:    r.entity_id ?? null,
    data:        r.data ?? null,
    readAt:      r.read_at ?? null,
    createdAt:   r.created_at,
    triggeredBy: r.triggered_by ?? null,
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
    .update({ read_at: new Date().toISOString() })
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
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .is('read_at', null);

  revalidatePath('/', 'layout');
}

// ── Preferences ───────────────────────────────────────────────────────────────

export async function getNotifPreferences(): Promise<NotifPreference[]> {
  try {
    const { supabase, businessId } = await getBusinessContext();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data } = await supabase
      .from('notification_preferences')
      .select('type, enabled')
      .eq('user_id', user.id)
      .eq('company_id', businessId);

    return (data ?? []).map((r: any) => ({ type: r.type, enabled: r.enabled }));
  } catch {
    return [];
  }
}

export async function setNotifPreference(type: string, enabled: boolean): Promise<void> {
  try {
    const { supabase, businessId } = await getBusinessContext();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from('notification_preferences')
      .upsert(
        { user_id: user.id, company_id: businessId, type, enabled },
        { onConflict: 'user_id,company_id,type' },
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
