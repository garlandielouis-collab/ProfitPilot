'use server';

import { getBusinessContext } from '../../lib/serverAuth';
import { revalidatePath } from 'next/cache';
import { classifyExpenseCategory, isBankPaymentMethod, isAssetCategory, classifyAssetCategory, classifyTransaction, CHART_OF_ACCOUNTS, ACCOUNT_CODES as ENGINE_CODES } from '../../lib/accountingEngine';

// ── Types ─────────────────────────────────────────────────────────────────────

export type AccountClass = 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense';

export type ChartAccount = {
  id: string;
  code: string;
  name: string;
  name_ht: string;
  account_class: AccountClass;
  parent_id: string | null;
  is_active: boolean;
};

export type JournalEntryLine = {
  account_code: string;
  description: string;
  debit: number;
  credit: number;
};

export type JournalEntryPayload = {
  date:           string;       // YYYY-MM-DD
  description:    string;
  reference?:     string;
  reference_type?: string;      // 'sale' | 'purchase' | 'expense' | 'manual'
  reference_id?:  string;
  currency?:      'HTG' | 'USD';
  exchangeRate?:  number;
  lines:          JournalEntryLine[];
};

// ── CLASSIFICATION ENGINE ─────────────────────────────────────────────────────
// Maps transaction types to account codes (Plan Comptable Haïtien)
// ACCOUNT_CODES is now in lib/accountingEngine (CHART_OF_ACCOUNTS)

type AccountCode = string;

// Classify expense category → account code
// helpers are now imported from lib/accountingEngine

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getAccountId(supabase: any, businessId: string, code: string): Promise<string | null> {
  const { data } = await supabase
    .from('chart_of_accounts')
    .select('id')
    .eq('business_id', businessId)
    .eq('code', code)
    .single();
  return data?.id ?? null;
}

async function getOrCreatePeriod(supabase: any, businessId: string, transactionDate: string): Promise<string | null> {
  // Use the transaction date to find or create the matching accounting period.
  const effectiveDate = new Date(transactionDate).toISOString().split('T')[0];
  const { data: existing } = await supabase
    .from('accounting_periods')
    .select('id')
    .eq('business_id', businessId)
    .lte('start_date', effectiveDate)
    .gte('end_date', effectiveDate)
    .eq('is_closed', false)
    .maybeSingle();

  if (existing) return existing.id;

  // Get or create fiscal year that covers the transaction date.
  const year = new Date(transactionDate).getFullYear();
  let fyId: string;
  const { data: fy } = await supabase
    .from('fiscal_years')
    .select('id')
    .eq('business_id', businessId)
    .lte('start_date', effectiveDate)
    .gte('end_date', effectiveDate)
    .maybeSingle();

  if (fy) {
    fyId = fy.id;
  } else {
    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;
    const { data: newFy, error: fyErr } = await supabase
      .from('fiscal_years')
      .insert({ business_id: businessId, name: `Ane Fiskal ${year}`, start_date: yearStart, end_date: yearEnd })
      .select('id')
      .single();
    if (fyErr) throw new Error(fyErr.message);
    fyId = newFy.id;
  }

  const dateObj = new Date(transactionDate);
  const startOfMonth = new Date(dateObj.getFullYear(), dateObj.getMonth(), 1).toISOString().split('T')[0];
  const endOfMonth = new Date(dateObj.getFullYear(), dateObj.getMonth() + 1, 0).toISOString().split('T')[0];
  const monthName = dateObj.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

  const { data: period, error: periodErr } = await supabase
    .from('accounting_periods')
    .insert({ business_id: businessId, fiscal_year_id: fyId, name: monthName, start_date: startOfMonth, end_date: endOfMonth })
    .select('id')
    .single();

  if (periodErr) throw new Error(periodErr.message);
  return period?.id ?? null;
}

function generateEntryNumber(): string {
  const d = new Date();
  return `JE-${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}-${Math.floor(Math.random()*9000)+1000}`;
}

// ── CORE: Create Journal Entry ────────────────────────────────────────────────

export async function createJournalEntry(payload: JournalEntryPayload): Promise<string> {
  const { supabase, businessId, userId } = await getBusinessContext();
  const exchangeRate = payload.exchangeRate ?? 1;

  // Validate double-entry balance
  const totalDebit  = payload.lines.reduce((s, l) => s + l.debit,  0);
  const totalCredit = payload.lines.reduce((s, l) => s + l.credit, 0);
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw new Error(`Dezekilib! Débit=${totalDebit} ≠ Crédit=${totalCredit}`);
  }

  // Get/create period based on the transaction date
  const periodId = await getOrCreatePeriod(supabase, businessId, payload.date);

  // Get account IDs for all lines
  const accountIds = await Promise.all(
    payload.lines.map(l => getAccountId(supabase, businessId, l.account_code))
  );

  // Ensure chart of accounts exists
  if (accountIds.some(id => id === null)) {
    // Auto-initialize chart of accounts if missing
    await supabase.rpc('fn_seed_chart_of_accounts', { p_business_id: businessId });
    // Retry
    const retryIds = await Promise.all(
      payload.lines.map(l => getAccountId(supabase, businessId, l.account_code))
    );
    if (retryIds.some(id => id === null)) {
      console.warn('[accounting] Some accounts not found, skipping journal entry');
      return '';
    }
    accountIds.splice(0, accountIds.length, ...retryIds);
  }

  // Create journal entry header
  const { data: entry, error: jeErr } = await supabase
    .from('journal_entries')
    .insert({
      business_id:    businessId,
      period_id:      periodId,
      entry_number:   generateEntryNumber(),
      entry_date:     payload.date,
      reference:      payload.reference ?? null,
      reference_type: payload.reference_type ?? 'manual',
      reference_id:   payload.reference_id ?? null,
      description:    payload.description,
      status:         'posted',
      currency:       payload.currency ?? 'HTG',
      exchange_rate:  exchangeRate,
      total_debit:    totalDebit,
      total_credit:   totalCredit,
      is_auto:        payload.reference_type !== 'manual',
      created_by:     userId,
    })
    .select('id')
    .single();

  if (jeErr) throw new Error(jeErr.message);
  const entryId = entry.id;

  // Create journal entry lines
  const lines = payload.lines.map((l, i) => ({
    journal_entry_id: entryId,
    business_id:      businessId,
    account_id:       accountIds[i],
    description:      l.description,
    debit_amount:     l.debit,
    credit_amount:    l.credit,
    currency:         payload.currency ?? 'HTG',
    exchange_rate:    exchangeRate,
    base_debit:       parseFloat((l.debit * exchangeRate).toFixed(2)),
    base_credit:      parseFloat((l.credit * exchangeRate).toFixed(2)),
  }));

  const { error: linesErr } = await supabase.from('journal_entry_lines').insert(lines);
  if (linesErr) throw new Error(linesErr.message);

  revalidatePath('/rapports');
  return entryId;
}

// ── TRANSACTION HOOKS ─────────────────────────────────────────────────────────

// Called after a sale is created
export async function recordSaleEntry(params: {
  saleId: string;
  invoiceNumber: string;
  amount: number;
  isCredit: boolean;
  date: string;
  currency: 'HTG' | 'USD';
  paymentMethod?: string;
  exchangeRate?: number;
}): Promise<void> {
  try {
    const debitAccount = params.isCredit
      ? ENGINE_CODES.CLIENTS
      : isBankPaymentMethod(params.paymentMethod)
        ? ENGINE_CODES.BANQUE
        : ENGINE_CODES.CAISSE;

    await createJournalEntry({
      date:           params.date,
      description:    `Vente — Fakti ${params.invoiceNumber}`,
      reference:      params.invoiceNumber,
      reference_type: 'sale',
      reference_id:   params.saleId,
      currency:       params.currency,
      exchangeRate:   params.exchangeRate,
      lines: [
        {
          account_code: debitAccount,
          description:  params.isCredit ? 'Vente à crédit — Clients' : `Vente comptant — ${debitAccount === ENGINE_CODES.BANQUE ? 'Banque' : 'Caisse'}`,
          debit:  params.amount,
          credit: 0,
        },
        {
          account_code: ENGINE_CODES.VENTES,
          description:  `Revenu vente — ${params.invoiceNumber}`,
          debit:  0,
          credit: params.amount,
        },
      ],
    });
  } catch (e) {
    console.error('[accounting] recordSaleEntry error:', (e as Error).message);
    // Non-blocking — don't fail the sale
  }
}

// Called after a purchase is created
export async function recordPurchaseEntry(params: {
  purchaseId: string;
  poNumber: string;
  amount: number;
  isCredit: boolean;
  date: string;
  currency: 'HTG' | 'USD';
  paymentMethod?: string;
  exchangeRate?: number;
}): Promise<void> {
  try {
    const creditAccount = params.isCredit
      ? ENGINE_CODES.FOURNISSEURS
      : isBankPaymentMethod(params.paymentMethod)
        ? ENGINE_CODES.BANQUE
        : ENGINE_CODES.CAISSE;

    await createJournalEntry({
      date:           params.date,
      description:    `Achat — ${params.poNumber}`,
      reference:      params.poNumber,
      reference_type: 'purchase',
      reference_id:   params.purchaseId,
      currency:       params.currency,
      exchangeRate:   params.exchangeRate,
      lines: [
        {
          account_code: ENGINE_CODES.ACHATS,
          description:  'Achat de marchandises',
          debit:  params.amount,
          credit: 0,
        },
        {
          account_code: creditAccount,
          description:  params.isCredit ? 'Dette fournisseur' : `Paiement ${creditAccount === ENGINE_CODES.BANQUE ? 'Banque' : 'Caisse'}`,
          debit:  0,
          credit: params.amount,
        },
      ],
    });
  } catch (e) {
    console.error('[accounting] recordPurchaseEntry error:', (e as Error).message);
  }
}

// Called after an expense is created
export async function recordExpenseEntry(params: {
  expenseId: string;
  description: string;
  amount: number;
  categoryName: string;
  paymentStatus?: string;   // 'paid' | 'pending' | 'credit'
  date: string;
  currency: 'HTG' | 'USD';
  paymentMethod?: string;
  exchangeRate?: number;
}): Promise<void> {
  try {
    const { supabase, businessId } = await getBusinessContext();

    // Idempotence: if a journal entry already exists (likely from DB trigger with wrong codes),
    // void it and create a correct one instead of skipping
    const { data: existing } = await supabase
      .from('journal_entries')
      .select('id, total_debit, total_credit, status')
      .eq('business_id', businessId)
      .eq('reference_type', 'expense')
      .eq('reference_id', params.expenseId)
      .maybeSingle();

    if (existing?.id) {
      if (existing.status === 'void') {
        // Previous entry was already voided (e.g. by deleteExpense) — skip creation
        return;
      }
      // Void the trigger-created entry with wrong codes so we can create the correct one
      await supabase
        .from('journal_entries')
        .update({ status: 'void', voided_reason: 'Remplacé par écriture correcte (app-side)' })
        .eq('id', existing.id);
    }

    // ── DÉBIT: asset account if it's an asset purchase, otherwise expense account ──
    const debitCode = isAssetCategory(params.categoryName)
      ? classifyAssetCategory(params.categoryName)
      : classifyExpenseCategory(params.categoryName);

    const debitName = isAssetCategory(params.categoryName)
      ? 'Achat actif — capitalisation'
      : 'Dépense';

    // ── CRÉDIT: Accounts Payable if unpaid, otherwise Cash/Bank ──
    const isUnpaid = params.paymentStatus === 'credit' || params.paymentStatus === 'pending';
    const creditCode = isUnpaid
      ? ENGINE_CODES.FOURNISSEURS  // 2110 — Dette fournisseur
      : isBankPaymentMethod(params.paymentMethod)
        ? ENGINE_CODES.BANQUE
        : ENGINE_CODES.CAISSE;

    const creditName = isUnpaid
      ? 'Dette fournisseur (à payer)'
      : 'Paiement';

    await createJournalEntry({
      date:           params.date,
      description:    params.description,
      reference_type: 'expense',
      reference_id:   params.expenseId,
      currency:       params.currency,
      exchangeRate:   params.exchangeRate,
      lines: [
        { account_code: debitCode,  description: `${debitName} — ${params.description}`, debit: params.amount, credit: 0 },
        { account_code: creditCode, description: creditName,                              debit: 0,             credit: params.amount },
      ],
    });
  } catch (e) {
    console.error('[accounting] recordExpenseEntry error:', (e as Error).message);
  }
}

// ── BACKFILL: All existing transactions ───────────────────────────────────────

export type BackfillResult = {
  sales:     number;
  purchases: number;
  expenses:  number;
  errors:    string[];
};

export async function backfillAllJournalEntries(): Promise<BackfillResult> {
  const { supabase, businessId, exchangeRate } = await getBusinessContext();
  const result: BackfillResult = { sales: 0, purchases: 0, expenses: 0, errors: [] };

  // ── 1. Ventes ────────────────────────────────────────────────────────────────
  const { data: sales } = await supabase
    .from('sales')
    .select('id, invoice_number, total_amount, currency, payment_method, payment_status, sale_date, created_at')
    .eq('business_id', businessId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true });

  for (const s of sales ?? []) {
    const { data: existing } = await supabase
      .from('journal_entries')
      .select('id')
      .eq('business_id', businessId)
      .eq('reference_type', 'sale')
      .eq('reference_id', s.id)
      .maybeSingle();
    if (existing?.id) continue;

    try {
      const isCredit = s.payment_status === 'credit';
      const debitCode = isCredit
        ? ENGINE_CODES.CLIENTS
        : isBankPaymentMethod(s.payment_method) ? ENGINE_CODES.BANQUE : ENGINE_CODES.CAISSE;
      const date = s.sale_date ?? (s.created_at as string).split('T')[0];
      await createJournalEntry({
        date,
        description:    `[Backfill] Vente — ${s.invoice_number ?? s.id}`,
        reference:      s.invoice_number ?? s.id,
        reference_type: 'sale',
        reference_id:   s.id,
        currency:       (s.currency as any) ?? 'HTG',
        exchangeRate:   (s.currency as any) === 'USD' ? exchangeRate : 1,
        lines: [
          { account_code: debitCode,          description: 'Encaissement / Créance', debit: Number(s.total_amount), credit: 0 },
          { account_code: ENGINE_CODES.VENTES, description: 'Revenu vente',           debit: 0, credit: Number(s.total_amount) },
        ],
      });
      result.sales++;
    } catch (e: any) {
      result.errors.push(`Vente ${s.id}: ${e.message}`);
    }
  }

  // ── 2. Achats ────────────────────────────────────────────────────────────────
  const { data: purchases } = await supabase
    .from('purchases')
    .select('id, po_number, total_amount, currency, payment_method, payment_status, purchase_date')
    .eq('business_id', businessId)
    .is('deleted_at', null)
    .order('purchase_date', { ascending: true });

  for (const p of purchases ?? []) {
    const { data: existing } = await supabase
      .from('journal_entries')
      .select('id')
      .eq('business_id', businessId)
      .eq('reference_type', 'purchase')
      .eq('reference_id', p.id)
      .maybeSingle();
    if (existing?.id) continue;

    try {
      const isCredit = p.payment_status === 'credit';
      const creditCode = isCredit
        ? ENGINE_CODES.FOURNISSEURS
        : isBankPaymentMethod(p.payment_method) ? ENGINE_CODES.BANQUE : ENGINE_CODES.CAISSE;
      await createJournalEntry({
        date:           p.purchase_date ?? new Date().toISOString().split('T')[0],
        description:    `[Backfill] Acha — ${p.po_number ?? p.id}`,
        reference:      p.po_number ?? p.id,
        reference_type: 'purchase',
        reference_id:   p.id,
        currency:       (p.currency as any) ?? 'HTG',
        exchangeRate:   (p.currency as any) === 'USD' ? exchangeRate : 1,
        lines: [
          { account_code: ENGINE_CODES.ACHATS, description: 'Achat stock', debit: Number(p.total_amount), credit: 0 },
          { account_code: creditCode,           description: isCredit ? 'Dette fournisseur' : 'Paiement', debit: 0, credit: Number(p.total_amount) },
        ],
      });
      result.purchases++;
    } catch (e: any) {
      result.errors.push(`Acha ${p.id}: ${(e as Error).message}`);
    }
  }

  // ── 3. Dépenses ─────────────────────────────────────────────────────────────
  result.expenses = await reconcileMissingExpenseEntries();

  revalidatePath('/rapports/comptabilite');
  return result;
}

// Reconcile expenses: create journal entries for expenses that have none
export async function reconcileMissingExpenseEntries(): Promise<number> {
  const { supabase, businessId, exchangeRate } = await getBusinessContext();

  // Get expenses for this business
  const { data: expenses } = await supabase
    .from('expenses')
    .select('id, description, amount, currency, expense_date, payment_method, payment_status, expense_categories(name)')
    .eq('business_id', businessId)
    .is('deleted_at', null);

  let created = 0;
  for (const e of (expenses ?? [])) {
    const expenseId = (e as any).id;

    // Process all expenses — recordExpenseEntry now voids trigger-created entries
    // and creates correct ones. This replaces the old skip-if-exists behavior.
    try {
      await recordExpenseEntry({
        expenseId,
        description: (e as any).description ?? 'Dépense',
        amount: parseFloat(String((e as any).amount ?? 0)),
        categoryName: (e as any).expense_categories?.name ?? 'Autre',
        paymentStatus: (e as any).payment_status ?? 'paid',
        date: (e as any).expense_date ?? new Date().toISOString().split('T')[0],
        currency: ((e as any).currency as any) ?? 'HTG',
        paymentMethod: (e as any).payment_method ?? 'Cash',
        exchangeRate: ((e as any).currency as any) === 'USD' ? exchangeRate : 1,
      });
      created += 1;
    } catch (err) {
      console.error('[accounting] reconcileExpense failed for', expenseId, (err as Error).message);
    }
  }

  return created;
}

// ── REPORTING ACTIONS ─────────────────────────────────────────────────────────

export async function getChartOfAccounts(): Promise<ChartAccount[]> {
  const { supabase, businessId } = await getBusinessContext();

  let { data } = await supabase
    .from('chart_of_accounts')
    .select('id,code,name,name_ht,account_class,parent_id,is_active')
    .eq('business_id', businessId)
    .is('deleted_at', null)
    .order('code');

  // Auto-initialize if empty
  if (!data?.length) {
    await supabase.rpc('fn_seed_chart_of_accounts', { p_business_id: businessId });
    const retry = await supabase
      .from('chart_of_accounts')
      .select('id,code,name,name_ht,account_class,parent_id,is_active')
      .eq('business_id', businessId)
      .is('deleted_at', null)
      .order('code');
    data = retry.data;
  }

  return (data ?? []) as ChartAccount[];
}

export async function getJournalEntries(limit = 50) {
  const { supabase, businessId } = await getBusinessContext();

  const { data, error } = await supabase
    .from('journal_entries')
    .select(`
      id, entry_number, entry_date, description,
      reference, reference_type, status,
      total_debit, total_credit, currency, is_auto,
      journal_entry_lines (
        id, account_id, description, debit_amount, credit_amount,
        base_debit, base_credit,
        chart_of_accounts ( code, name, account_class )
      )
    `)
    .eq('business_id', businessId)
    .eq('status', 'posted')
    .order('entry_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);

  // Compute HTG-equivalent totals for display (from base_ columns)
  const rows = (data ?? []).map((entry: any) => {
    const lines = entry.journal_entry_lines ?? [];
    const totalDebitBase = lines.reduce(
      (s: number, l: any) => s + Number(l.base_debit ?? l.debit_amount ?? 0), 0
    );
    const totalCreditBase = lines.reduce(
      (s: number, l: any) => s + Number(l.base_credit ?? l.credit_amount ?? 0), 0
    );
    return {
      ...entry,
      total_debit_base: parseFloat(totalDebitBase.toFixed(2)),
      total_credit_base: parseFloat(totalCreditBase.toFixed(2)),
    };
  });

  return rows;
}

export async function getTrialBalance() {
  const { supabase, businessId } = await getBusinessContext();

  // Aggregate from journal_entry_lines
  const { data: lines } = await supabase
    .from('journal_entry_lines')
    .select(`
      account_id, debit_amount, credit_amount, base_debit, base_credit,
      chart_of_accounts ( code, name, account_class ),
      journal_entries!inner ( business_id, status )
    `)
    .eq('journal_entries.business_id', businessId)
    .eq('journal_entries.status', 'posted');

  const map: Record<string, { code: string; name: string; class: string; debit: number; credit: number }> = {};
  for (const l of lines ?? []) {
    const acc = (l as any).chart_of_accounts;
    if (!acc) continue;
    if (!map[l.account_id]) {
      map[l.account_id] = { code: acc.code, name: acc.name, class: acc.account_class, debit: 0, credit: 0 };
    }
    map[l.account_id].debit  += Number(l.base_debit  ?? l.debit_amount  ?? 0);
    map[l.account_id].credit += Number(l.base_credit ?? l.credit_amount ?? 0);
  }

  const rows = Object.values(map).sort((a, b) => a.code.localeCompare(b.code));
  const totalDebit  = rows.reduce((s, r) => s + r.debit,  0);
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
  const balanced    = Math.abs(totalDebit - totalCredit) < 0.01;

  return { rows, totalDebit, totalCredit, balanced };
}

export async function getIncomeStatement(year: number, month?: number) {
  const { supabase, businessId } = await getBusinessContext();

  const dateFrom = month !== undefined
    ? new Date(year, month, 1).toISOString().split('T')[0]
    : `${year}-01-01`;
  const dateTo = month !== undefined
    ? new Date(year, month + 1, 0).toISOString().split('T')[0]
    : `${year}-12-31`;

  const { data: lines } = await supabase
    .from('journal_entry_lines')
    .select(`
      debit_amount, credit_amount, base_debit, base_credit,
      chart_of_accounts ( code, name, account_class ),
      journal_entries!inner ( business_id, status, entry_date )
    `)
    .eq('journal_entries.business_id', businessId)
    .eq('journal_entries.status', 'posted')
    .gte('journal_entries.entry_date', dateFrom)
    .lte('journal_entries.entry_date', dateTo);

  let totalRevenue = 0, totalExpense = 0;
  const revenues: Record<string, number> = {};
  const expenses: Record<string, number> = {};

  for (const l of lines ?? []) {
    const acc = (l as any).chart_of_accounts;
    if (!acc) continue;
    const credit = Number(l.base_credit ?? l.credit_amount ?? 0);
    const debit  = Number(l.base_debit  ?? l.debit_amount  ?? 0);

    if (acc.account_class === 'Revenue') {
      const amt = credit - debit; // Revenue has credit normal balance
      revenues[acc.name] = (revenues[acc.name] ?? 0) + amt;
      totalRevenue += amt;
    } else if (acc.account_class === 'Expense') {
      const amt = debit - credit; // Expense has debit normal balance
      expenses[acc.name] = (expenses[acc.name] ?? 0) + amt;
      totalExpense += amt;
    }
  }

  return {
    revenues,
    expenses,
    totalRevenue: parseFloat(totalRevenue.toFixed(2)),
    totalExpense: parseFloat(totalExpense.toFixed(2)),
    netIncome:    parseFloat((totalRevenue - totalExpense).toFixed(2)),
  };
}

export async function getBalanceSheet() {
  const { supabase, businessId } = await getBusinessContext();

  const { data: lines } = await supabase
    .from('journal_entry_lines')
    .select(`
      debit_amount, credit_amount, base_debit, base_credit,
      chart_of_accounts ( code, name, account_class ),
      journal_entries!inner ( business_id, status )
    `)
    .eq('journal_entries.business_id', businessId)
    .eq('journal_entries.status', 'posted');

  const assets: Record<string, number>      = {};
  const liabilities: Record<string, number> = {};
  const equity: Record<string, number>      = {};

  for (const l of lines ?? []) {
    const acc   = (l as any).chart_of_accounts;
    if (!acc) continue;
    const debit  = Number(l.base_debit  ?? l.debit_amount  ?? 0);
    const credit = Number(l.base_credit ?? l.credit_amount ?? 0);

    if (acc.account_class === 'Asset') {
      assets[acc.name]      = (assets[acc.name]      ?? 0) + (debit - credit);
    } else if (acc.account_class === 'Liability') {
      liabilities[acc.name] = (liabilities[acc.name] ?? 0) + (credit - debit);
    } else if (acc.account_class === 'Equity') {
      equity[acc.name]      = (equity[acc.name]      ?? 0) + (credit - debit);
    }
  }

  const totalAssets      = Object.values(assets).reduce((s, v) => s + v, 0);
  const totalLiabilities = Object.values(liabilities).reduce((s, v) => s + v, 0);
  const totalEquity      = Object.values(equity).reduce((s, v) => s + v, 0);

  return {
    assets, liabilities, equity,
    totalAssets:      parseFloat(totalAssets.toFixed(2)),
    totalLiabilities: parseFloat(totalLiabilities.toFixed(2)),
    totalEquity:      parseFloat(totalEquity.toFixed(2)),
    balanced:         Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 1,
  };
}
