'use server';

import { getBusinessContext } from '../../lib/serverAuth';
import { revalidatePath } from 'next/cache';
import { recordExpenseEntry, recordExpensePaymentEntry, reverseDocumentEntries } from '../../lib/accounting/posting';
import { logActivity } from '../../lib/activityLog';
import { notify } from '../../lib/notify';
import { mapCategoryToAccountCode } from '../../lib/accountingEngine';
import type { ExpenseScope } from '../../lib/expenseScope';
import { attempt, UserFacingError, type ActionResult } from '../../lib/actionResult';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ExpensePayload = {
  id?: string;
  description: string;
  category: string;          // UI text — mapped to category_id
  amount: number;
  currency: 'HTG' | 'USD';
  payment_status: 'Payé' | 'En attente' | 'Dette';
  payment_method?: string;
  date: string;              // YYYY-MM-DD
  supplier_id?: string;
  scope?: ExpenseScope;
  /** Part professionnelle d'une dépense `mixed`, en %. Ignoré sinon. */
  business_share_pct?: number;
};

// Map UI payment status → DB enum
const STATUS_MAP: Record<string, string> = {
  'Payé':       'paid',
  'En attente': 'pending',
  'Dette':      'credit',
};

// Map UI payment method → DB enum
const METHOD_MAP: Record<string, string> = {
  'Espèces': 'Cash', 'Cash': 'Cash',
  'Mobile':   'MonCash',
  'Moncash':  'MonCash', 'MonCash': 'MonCash',
  'Natcash':  'Natcash',
  'Carte':    'Card',   'Carte Visa': 'Card', 'Card': 'Card',
  'Virement': 'Virement', 'Chèque': 'Chèque',
};

// ── findOrCreateCategory ──────────────────────────────────────────────────────

async function findOrCreateCategory(
  supabase: any,
  businessId: string,
  userId: string,
  name: string
): Promise<string | null> {
  if (!name?.trim()) return null;

  // Try to find existing
  const { data: existing } = await supabase
    .from('expense_categories')
    .select('id')
    .eq('business_id', businessId)
    .ilike('name', name.trim())
    .maybeSingle();

  if (existing?.id) return existing.id;

  // Create new with proper account_code so DB trigger and reports work correctly
  const accountCode = mapCategoryToAccountCode(name.trim());
  const { data: created, error } = await supabase
    .from('expense_categories')
    .insert({ business_id: businessId, name: name.trim(), account_code: accountCode })
    .select('id')
    .single();

  if (error) {
    console.error('[findOrCreateCategory]', error.message);
    return null;
  }
  return created.id;
}

// ── upsertExpense ─────────────────────────────────────────────────────────────

/** Non exporté : un fichier 'use server' n'exporte que des fonctions async. */
const EXCHANGE_RATE_MISSING_MESSAGE =
  "Renseignez le taux USD/HTG de l'entreprise (Paramètres) avant d'enregistrer un montant en dollars.";

/**
 * `{ error }` pour un refus que le formulaire doit afficher tel quel : en
 * production, Next masque le message d'une exception levée par une action.
 */
export async function upsertExpense(payload: ExpensePayload): Promise<ActionResult<{ error: string } | undefined>> {
  return attempt(async () => {
  if (!payload.description?.trim()) throw new UserFacingError('Deskripsyon obligatwa.');
  if (!payload.amount || payload.amount <= 0) throw new UserFacingError('Montan pa valab.');

  const { supabase, businessId, userId, exchangeRate, exchangeRateSet } = await getBusinessContext();

  // Une dépense en dollars (création comme modification) ne s'enregistre
  // qu'avec le taux saisi par le marchand : sinon expenses.exchange_rate et le
  // journal porteraient 130 (repli) ou 1 (défaut de colonne). Refus avant toute
  // écriture — findOrCreateCategory ci-dessous peut déjà insérer une catégorie.
  if ((payload.currency ?? 'HTG') === 'USD' && !exchangeRateSet) {
    return { error: EXCHANGE_RATE_MISSING_MESSAGE };
  }

  const dbStatus = STATUS_MAP[payload.payment_status] ?? 'paid';
  const dbMethod = payload.payment_method
    ? (METHOD_MAP[payload.payment_method] ?? null)
    : null;
  const finalStatus = dbStatus;

  const categoryId = await findOrCreateCategory(supabase, businessId, userId, payload.category);

  // Generate expense number app-side (avoid fn_generate_ref sequence permission)
  const year   = new Date().getFullYear();
  const rand   = Math.floor(Math.random() * 900000) + 100000;
  const expNum = `EXP-${year}-${rand}`;

  const fields: Record<string, unknown> = {
    description:    payload.description.trim(),
    category_id:    categoryId,
    amount:         payload.amount,
    currency:       payload.currency       ?? 'HTG',
    exchange_rate:  (payload.currency ?? 'HTG') === 'USD' ? exchangeRate : 1,
    payment_status: finalStatus,
    payment_method: dbMethod,
    expense_date:   payload.date,
    supplier_id:    payload.supplier_id    || null,
    created_by:     userId,
  };

  // Colonnes ajoutées par 20260821_profitpilot_features.sql. Renseignées
  // seulement si l'UI les fournit, pour que le trigger d'héritage de catégorie
  // continue de s'appliquer quand l'utilisateur n'a rien choisi.
  if (payload.scope) {
    fields.scope = payload.scope;
    fields.business_share_pct =
      payload.scope === 'mixed'
        ? Math.min(Math.max(Number(payload.business_share_pct) || 0, 0), 100)
        : payload.scope === 'personal' ? 0 : 100;
  }

  if (payload.id) {
    // Ce qui existait AVANT la modification : sans ça, impossible de savoir si
    // l'écriture comptable doit être refaite.
    const { data: before } = await supabase
      .from('expenses')
      .select('amount, currency, expense_date, payment_status, payment_method, category_id')
      .eq('id', payload.id)
      .eq('business_id', businessId)
      .maybeSingle();

    const { error } = await supabase
      .from('expenses')
      .update(fields)
      .eq('id', payload.id)
      .eq('business_id', businessId);
    if (error) throw new Error(error.message);
    void logActivity({ action: 'update', entity: 'expense', entityId: payload.id, newValues: { description: payload.description, amount: payload.amount, category: payload.category } });

    // Une modification qui touche le montant, la devise, la date, la catégorie
    // ou le mode de règlement change l'écriture. Or re-poster ne suffit PAS :
    // uq_je_document_event rend le second post idempotent, il ne fait rien et
    // le journal garde silencieusement l'ancien montant. Il faut donc
    // contre-passer l'écriture de création, puis en poster une neuve.
    // Les règlements déjà encaissés ne sont pas touchés (events: ['created']).
    const accountingChanged = !before || (
      Number(before.amount)            !== Number(payload.amount) ||
      (before.currency       ?? 'HTG') !== (payload.currency ?? 'HTG') ||
      (before.expense_date   ?? '')    !== payload.date ||
      (before.payment_status ?? '')    !== finalStatus ||
      (before.payment_method ?? null)  !== dbMethod ||
      (before.category_id    ?? null)  !== categoryId
    );

    if (accountingChanged) {
      try {
        await reverseDocumentEntries('expense', payload.id, 'Dépense modifiée', { events: ['created'] });
      } catch (err) {
        console.error('[accounting] reversal on expense update failed:', (err as Error).message);
      }
    }

    try {
      await recordExpenseEntry({
        expenseId: payload.id,
        description: payload.description.trim(),
        amount: payload.amount,
        categoryName: payload.category,
        paymentStatus: finalStatus,
        date: payload.date,
        currency: payload.currency ?? 'HTG',
        paymentMethod: dbMethod ?? 'Cash',
        exchangeRate: (payload.currency ?? 'HTG') === 'USD' ? exchangeRate : 1,
      });
    } catch (err) {
      console.error('[accounting] recordExpenseEntry failed on update:', (err as Error).message);
    }
  } else {
    const { data: created, error } = await supabase
      .from('expenses')
      .insert({ ...fields, business_id: businessId, expense_number: expNum })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    void logActivity({ action: 'create', entity: 'expense', entityId: created.id, newValues: { description: payload.description, amount: payload.amount, category: payload.category } });
    void notify({
      companyId: businessId, triggeredBy: userId,
      type: 'expense_created',
      title: `Nouvelle dépense — ${payload.category}`,
      body: `${payload.description} · ${payload.amount.toLocaleString('fr-FR')} ${payload.currency}`,
      entity: 'expense', entityId: created.id,
      data: { description: payload.description, amount: payload.amount, currency: payload.currency, category: payload.category },
    });

    try {
      await recordExpenseEntry({
        expenseId: created.id,
        description: payload.description.trim(),
        amount: payload.amount,
        categoryName: payload.category,
        paymentStatus: finalStatus,
        date: payload.date,
        currency: payload.currency ?? 'HTG',
        paymentMethod: dbMethod ?? 'Cash',
        exchangeRate: (payload.currency ?? 'HTG') === 'USD' ? exchangeRate : 1,
      });
    } catch (err) {
      console.error('[accounting] recordExpenseEntry failed:', (err as Error).message);
    }
  }

  revalidatePath('/expenses');
  revalidatePath('/rapports/comptabilite');
  return undefined;
  });
}

// ── deleteExpense ─────────────────────────────────────────────────────────────

export async function deleteExpense(expenseId: string): Promise<ActionResult> {
  return attempt(async () => {
  const { supabase, businessId } = await getBusinessContext();

  // Post counter-entries instead of zeroing the original lines in place.
  // Rewriting a posted entry's amounts destroys the audit trail and silently
  // restates already-published financial statements.
  await reverseDocumentEntries('expense', expenseId, 'Dépense annulée');

  // Soft-delete the expense
  const { error } = await supabase
    .from('expenses')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', expenseId)
    .eq('business_id', businessId);

  if (error) throw new Error(error.message);
  void logActivity({ action: 'delete', entity: 'expense', entityId: expenseId });
  revalidatePath('/expenses');
  revalidatePath('/rapports/comptabilite');
  revalidatePath('/rapports');
  revalidatePath('/dashboard');
  });
}

// ── markExpensePaid ───────────────────────────────────────────────────────────

export async function markExpensePaid(expenseId: string): Promise<void> {
  const { supabase, businessId } = await getBusinessContext();

  // Read the amount before updating — the settlement entry needs it.
  const { data: expense } = await supabase
    .from('expenses')
    .select('amount, currency, payment_method, payment_status, description, exchange_rate')
    .eq('id', expenseId)
    .eq('business_id', businessId)
    .maybeSingle();

  const { error } = await supabase
    .from('expenses')
    .update({ payment_status: 'paid' })
    .eq('id', expenseId)
    .eq('business_id', businessId);
  if (error) throw new Error(error.message);

  // Only a previously-unpaid expense carries a payable to extinguish. One booked
  // as paid already credited cash at creation — posting again would double-count.
  const wasUnpaid = expense?.payment_status === 'credit' || expense?.payment_status === 'pending';
  if (expense && wasUnpaid) {
    await recordExpensePaymentEntry({
      expenseId,
      amount:        Number(expense.amount),
      date:          new Date().toISOString().split('T')[0],
      currency:      (expense.currency ?? 'HTG') as 'HTG' | 'USD',
      paymentMethod: expense.payment_method ?? undefined,
      exchangeRate:  expense.currency === 'USD' ? Number(expense.exchange_rate ?? 1) : 1,
      label:         expense.description ?? undefined,
    });
  }

  revalidatePath('/expenses');
  revalidatePath('/dettes');
  revalidatePath('/rapports/comptabilite');
}

// ── getExpenses ───────────────────────────────────────────────────────────────

export async function getExpenses() {
  const { supabase, businessId } = await getBusinessContext();

  const BASE = `
      id, description, amount, currency,
      payment_status, payment_method,
      expense_date, supplier_id,
      expense_categories ( name )
    `;

  // `scope` / `business_share_pct` viennent de la migration features. Si elle
  // n'a pas encore été jouée, la page dépenses doit continuer de s'afficher.
  const withScope = await supabase
    .from('expenses')
    .select(`${BASE}, scope, business_share_pct`)
    .eq('business_id', businessId)
    .is('deleted_at', null)
    .order('expense_date', { ascending: false });

  let rows: any[] = withScope.data ?? [];

  if (withScope.error) {
    const legacy = await supabase
      .from('expenses')
      .select(BASE)
      .eq('business_id', businessId)
      .is('deleted_at', null)
      .order('expense_date', { ascending: false });
    if (legacy.error) throw new Error(legacy.error.message);
    rows = legacy.data ?? [];
  }

  // Normalize to match UI expectations
  const STATUS_REVERSE: Record<string, string> = {
    'paid': 'Payé', 'pending': 'En attente', 'credit': 'Dette',
  };

  return rows.map((r: any) => ({
    id:             r.id,
    description:    r.description,
    category:       r.expense_categories?.name ?? '—',
    amount:         Number(r.amount),
    currency:       r.currency,
    payment_status: STATUS_REVERSE[r.payment_status] ?? r.payment_status,
    payment_method: r.payment_method ?? '',
    date:               r.expense_date,
    supplier_id:        r.supplier_id ?? null,
    scope:              (r.scope ?? 'business') as ExpenseScope,
    business_share_pct: r.business_share_pct === undefined || r.business_share_pct === null
      ? 100
      : Number(r.business_share_pct),
  }));
}

// ── cleanupDeletedExpenses ─────────────────────────────────────────────────────
// Nettoye les écritures comptables pour les dépenses déjà soft-supprimées
// (ancienne version de deleteExpense créait des entrées ANNULATION avec montants)

export async function cleanupDeletedExpenses(): Promise<number> {
  const { supabase, businessId } = await getBusinessContext();

  const { data: deletedExpenses } = await supabase
    .from('expenses')
    .select('id')
    .eq('business_id', businessId)
    .not('deleted_at', 'is', null);

  let cleaned = 0;
  for (const exp of deletedExpenses ?? []) {
    const { data: entries } = await supabase
      .from('journal_entries')
      .select('id')
      .eq('business_id', businessId)
      .eq('reference_type', 'expense')
      .eq('reference_id', exp.id);

    for (const je of entries ?? []) {
      await supabase
        .from('journal_entry_lines')
        .update({ debit_amount: 0, credit_amount: 0, base_debit: 0, base_credit: 0 })
        .eq('journal_entry_id', je.id);

      await supabase
        .from('journal_entries')
        .update({
          status: 'void',
          total_debit: 0,
          total_credit: 0,
          voided_reason: 'Dépense annulée (nettoyage)',
        })
        .eq('id', je.id);

      cleaned += 1;
    }
  }

  revalidatePath('/rapports/comptabilite');
  revalidatePath('/rapports');
  revalidatePath('/dashboard');
  return cleaned;
}
