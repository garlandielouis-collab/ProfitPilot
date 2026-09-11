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
  // Le centre documentaire (§48). `notifications.type` est du TEXT libre en
  // base — vérifié : pas de CHECK, donc pas de migration.
  | 'document_expiring'
  | 'document_expired'
  | 'document_missing'
  | 'document_approval_required'
  | 'generic';

/**
 * Quel type de notification est réglable, et par quelle colonne de
 * `notification_preferences`. Les types absents de cette table ne sont pas
 * désactivables — une invitation acceptée ou une entreprise créée se signalent
 * toujours. Les valeurs par défaut reprennent les DEFAULT de la table
 * (20260526_complete_schema_v2.sql).
 *
 * Les alertes documentaires en sont volontairement absentes : une licence qui
 * expire sans prévenir coûte le commerce, pas une fonctionnalité. Les rendre
 * désactivables demanderait en outre une colonne de plus sur
 * `notification_preferences` — donc une migration — pour un réglage dont
 * personne n'a besoin. Le garde-fou contre le harcèlement est ailleurs, dans le
 * cron : une alerte par document et par jour au maximum.
 */
const PREFERENCE_COLUMN: Partial<Record<NotifType, PreferenceColumn>> = {
  sale_created:     'new_sale',
  purchase_created: 'new_purchase',
  expense_created:  'new_expense',
  stock_low:        'low_stock',
  invoice_paid:     'payment_due',
};

const PREFERENCE_DEFAULT = {
  new_sale:       false,
  new_purchase:   false,
  new_expense:    false,
  low_stock:      true,
  payment_due:    true,
  weekly_summary: true,
} as const;

export type PreferenceColumn = keyof typeof PREFERENCE_DEFAULT;

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
  /**
   * La préférence à respecter quand le type seul ne la désigne pas.
   *
   * Les relances de créances et le résumé du dimanche partent en `generic` :
   * sans ce champ, aucune colonne ne les gouvernait et l'interrupteur qui
   * prétendait les couper ne coupait rien. On ne crée pas de nouveau type pour
   * autant — `notifications.type` a pu être converti en énum par
   * 20260607_data_robustness, et un type inconnu y ferait échouer l'insert en
   * silence.
   */
  preference?: PreferenceColumn;
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

    // Préférence de l'utilisateur pour ce type.
    //
    // `notification_preferences` porte une colonne booléenne par type, pas une
    // ligne par type : le filtre `.eq('type', …)` visait une colonne
    // inexistante et la lecture échouait à chaque fois. Tous les types ne sont
    // pas réglables — ceux qui ne le sont pas passent toujours.
    const prefColumn = input.preference ?? PREFERENCE_COLUMN[input.type];
    if (prefColumn) {
      const { data: pref } = await svc
        .from('notification_preferences')
        .select(prefColumn)
        .eq('user_id', recipientId)
        .eq('business_id', input.companyId)
        .maybeSingle();

      // Une préférence explicitement à `false` fait taire la notification.
      // Sans ligne enregistrée, on applique le DEFAULT de la table.
      const enabled = (pref as any)?.[prefColumn] ?? PREFERENCE_DEFAULT[prefColumn];
      if (!enabled) return;
    }

    // Les noms de colonnes de `notifications` : business_id / reference_type /
    // reference_id / metadata. L'insert utilisait company_id, entity, entity_id,
    // data et triggered_by — cinq colonnes qui n'existent pas. Le `catch` en fin
    // de fonction avalait l'erreur : la table est restée vide depuis toujours.
    await svc.from('notifications').insert({
      business_id:    input.companyId,
      user_id:        recipientId,
      type:           input.type,
      title:          input.title,
      body:           input.body ?? null,
      reference_type: input.entity ?? null,
      reference_id:   input.entityId ?? null,
      metadata:       input.triggeredBy
        ? { ...(input.data ?? {}), triggered_by: input.triggeredBy }
        : (input.data ?? null),
    });
  } catch {
    // Never break main operation
  }
}
