/**
 * Fire-and-forget notification helper.
 * Uses the service client so it can look up the company owner and insert
 * regardless of which user triggered the action.
 */

import { getSupabaseService } from './supabaseServiceClient';

export type NotifType =
  | 'sale_created'
  | 'invoice_paid'
  | 'stock_low'
  | 'expense_created'
  | 'purchase_created'
  | 'client_created'
  | 'employee_created'
  | 'invitation_accepted'
  | 'company_created'
  | 'generic';

export type NotifyInput = {
  companyId:   string;
  triggeredBy?: string | null;
  type:        NotifType;
  title:       string;
  body?:       string;
  entity?:     string;
  entityId?:   string;
  data?:       Record<string, any>;
  /** Override recipient — defaults to company owner */
  recipientId?: string;
};

export async function notify(input: NotifyInput): Promise<void> {
  try {
    const svc = getSupabaseService();

    // Resolve recipient: explicit override OR look up owner of the business
    let recipientId = input.recipientId ?? null;
    if (!recipientId) {
      const { data: biz } = await svc
        .from('businesses')
        .select('owner_id')
        .eq('id', input.companyId)
        .single();
      recipientId = biz?.owner_id ?? null;
    }
    if (!recipientId) return;

    // Check notification preference for this user/company/type
    const { data: pref } = await svc
      .from('notification_preferences')
      .select('enabled')
      .eq('user_id', recipientId)
      .eq('company_id', input.companyId)
      .eq('type', input.type)
      .maybeSingle();

    // If an explicit preference exists and is disabled, skip
    if (pref && pref.enabled === false) return;

    await svc.from('notifications').insert({
      company_id:   input.companyId,
      user_id:      recipientId,
      triggered_by: input.triggeredBy ?? null,
      type:         input.type,
      title:        input.title,
      body:         input.body ?? null,
      entity:       input.entity ?? null,
      entity_id:    input.entityId ?? null,
      data:         input.data ?? null,
    });
  } catch {
    // Never break main operation
  }
}
