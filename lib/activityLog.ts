'use server';

import { headers } from 'next/headers';
import { getBusinessContext } from './serverAuth';
import { getSupabaseServer } from './supabaseServerClient';

export type ActivityAction =
  | 'create' | 'update' | 'delete' | 'archive' | 'restore'
  | 'duplicate' | 'switch' | 'login' | 'logout' | 'export'
  | 'invite' | 'accept_invite' | 'revoke' | 'pay' | 'confirm';

export type ActivityEntity =
  | 'sale' | 'product' | 'client' | 'expense' | 'purchase'
  | 'supplier' | 'employee' | 'company' | 'store' | 'order'
  | 'role' | 'invitation' | 'payment' | 'debt';

export type LogInput = {
  action:     ActivityAction;
  entity:     ActivityEntity;
  entityId?:  string;
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
  /** Override businessId — used when context not yet available (e.g. company creation) */
  businessId?: string;
  userId?:     string;
};

/**
 * Fire-and-forget audit logger.
 * Never throws — call with `void logActivity(...)` to avoid blocking the action.
 */
export async function logActivity(input: LogInput): Promise<void> {
  try {
    const hdrs = await headers();
    const ip        = hdrs.get('x-forwarded-for')?.split(',')[0]?.trim()
                   ?? hdrs.get('x-real-ip')
                   ?? null;
    const userAgent = hdrs.get('user-agent') ?? null;

    let businessId = input.businessId;
    let userId     = input.userId;

    if (!businessId || !userId) {
      try {
        const ctx = await getBusinessContext();
        businessId = businessId ?? ctx.businessId;
        userId     = userId     ?? ctx.userId;
      } catch {
        // If context unavailable (e.g. unauthenticated path), skip silently
        return;
      }
    }

    if (!businessId || !userId) return;

    const supabase = await getSupabaseServer();
    await supabase.from('activity_logs').insert({
      company_id:  businessId,
      user_id:     userId,
      action:      input.action,
      entity:      input.entity,
      entity_id:   input.entityId ?? null,
      old_values:  input.oldValues ?? null,
      new_values:  input.newValues ?? null,
      ip,
      user_agent:  userAgent,
    });
  } catch {
    // Swallow all errors — logging must never break the main operation
  }
}

// ── Server action: list logs for UI ──────────────────────────────────────────

export type ActivityLog = {
  id:         string;
  userId:     string;
  userEmail:  string | null;
  action:     string;
  entity:     string;
  entityId:   string | null;
  oldValues:  any;
  newValues:  any;
  ip:         string | null;
  userAgent:  string | null;
  createdAt:  string;
};

export type ListActivityLogsOpts = {
  search?:    string;
  action?:    string;
  entity?:    string;
  userId?:    string;
  dateFrom?:  string;
  dateTo?:    string;
  limit?:     number;
  offset?:    number;
};

export async function listActivityLogs(opts: ListActivityLogsOpts = {}): Promise<{
  logs:  ActivityLog[];
  total: number;
}> {
  try {
    const ctx = await getBusinessContext();
    const { supabase, businessId } = ctx;

    const limit  = opts.limit  ?? 50;
    const offset = opts.offset ?? 0;

    let q = supabase
      .from('activity_logs')
      .select(`
        id, user_id, action, entity, entity_id,
        old_values, new_values, ip, user_agent, created_at,
        auth_users:user_id ( email )
      `, { count: 'exact' })
      .eq('company_id', businessId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (opts.action)   q = q.eq('action', opts.action);
    if (opts.entity)   q = q.eq('entity', opts.entity);
    if (opts.userId)   q = q.eq('user_id', opts.userId);
    if (opts.dateFrom) q = q.gte('created_at', opts.dateFrom + 'T00:00:00');
    if (opts.dateTo)   q = q.lte('created_at', opts.dateTo   + 'T23:59:59');
    if (opts.search) {
      q = q.or(
        `action.ilike.%${opts.search}%,entity.ilike.%${opts.search}%,entity_id.ilike.%${opts.search}%`
      );
    }

    const { data, count, error } = await q;
    if (error) return { logs: [], total: 0 };

    const logs: ActivityLog[] = (data ?? []).map((r: any) => ({
      id:        r.id,
      userId:    r.user_id,
      userEmail: (r.auth_users as any)?.email ?? null,
      action:    r.action,
      entity:    r.entity,
      entityId:  r.entity_id,
      oldValues: r.old_values,
      newValues: r.new_values,
      ip:        r.ip,
      userAgent: r.user_agent,
      createdAt: r.created_at,
    }));

    return { logs, total: count ?? 0 };
  } catch {
    return { logs: [], total: 0 };
  }
}
