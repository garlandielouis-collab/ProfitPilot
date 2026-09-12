'use server';

import { getBusinessContext } from '../../lib/serverAuth';
import { assertAccess, assertPermission } from '../../lib/entitlements';
import { revalidatePath } from 'next/cache';
import {
  insertJournalEntry,
  postEvent,
  recordSaleCogs,
  recordExpenseEntry,
  type AccountClass,
  type JournalEntryPayload,
  type JournalEventType,
  type PostingContext,
} from '../../lib/accounting/posting';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ChartAccount = {
  id: string;
  code: string;
  name: string;
  name_ht: string;
  account_class: AccountClass;
  parent_id: string | null;
  is_active: boolean;
};

// ── GARDES : qui peut lire et toucher au journal ─────────────────────────────
//
// Ce fichier n'avait aucune garde : n'importe quel membre — un vendeur, un
// lecteur — pouvait appeler directement la saisie manuelle, la reprise ou le
// dédoublonnage (qui annule des écritures), et lire bilan et grand livre, sur
// une offre qui n'inclut pas la comptabilité.
//
// Deux gardes, posées sur les POINTS D'ENTRÉE de l'écran `/rapports/comptabilite`
// seulement, avec la capacité que `nav.tsx` exige pour cet écran
// (`advanced_reports`) :
//
//   lecture  → `reports:read`    (comme `financialReporting.ts`)
//   écriture → `reports:export`  le registre n'a pas de permission comptable
//              dédiée ; celle-ci est tenue exactement par les rôles qui ont la
//              main sur les chiffres (propriétaire, admin, gérant, comptable) et
//              par aucun rôle de comptoir (caissier, employé, stock) ni par le
//              lecteur.
//
// Les écritures AUTOMATIQUES (postEvent, record*Entry, reverseDocumentEntries)
// n'ont PAS de garde d'offre, et c'est voulu : elles partent d'une vente, d'un
// achat, d'une dépense ou d'un règlement, et un marchand sans l'offre doit
// pouvoir vendre — son journal se tient quand même, prêt le jour où il monte.
// C'est pourquoi elles vivent dans `lib/accounting/posting.ts`, module serveur
// ordinaire : exportées d'ici, elles seraient des Server Actions appelables
// depuis le navigateur sans aucune garde. Règle de ce fichier : tout export est
// une fonction async gardée. Ne jamais réexporter le cœur depuis ici.

async function assertAccountingRead(): Promise<void> {
  await assertAccess('advanced_reports', 'reports:read');
}

async function assertAccountingWrite(): Promise<void> {
  await assertAccess('advanced_reports', 'reports:export');
}

// ── CORE: Create Journal Entry ────────────────────────────────────────────────

/**
 * Saisie MANUELLE d'une écriture — le formulaire de `/rapports/comptabilite`.
 * Gardée : c'est un point d'entrée de l'écran, pas un effet d'une transaction.
 */
export async function createJournalEntry(payload: JournalEntryPayload): Promise<string> {
  await assertAccountingWrite();
  return insertJournalEntry(payload);
}

// ── POSTING FAILURES — surfaced in /rapports/comptabilite ─────────────────────

export type PostingFailure = {
  id:             string;
  reference_type: string;
  reference_id:   string;
  event_type:     string;
  error_message:  string;
  created_at:     string;
};

export async function getPostingFailures(): Promise<PostingFailure[]> {
  try {
    // Refus → liste vide, comme tout autre échec de lecture ici.
    await assertAccountingRead();
    const { supabase, businessId } = await getBusinessContext();
    const { data } = await supabase
      .from('journal_posting_failures')
      .select('id, reference_type, reference_id, event_type, error_message, created_at')
      .eq('business_id', businessId)
      .is('resolved_at', null)
      .order('created_at', { ascending: false })
      .limit(100);
    return (data ?? []) as PostingFailure[];
  } catch {
    return [];
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
  // Bouton « Rekonsilye » de l'écran : il écrit dans tout le journal.
  await assertAccountingWrite();
  const result: BackfillResult = { sales: 0, purchases: 0, expenses: 0, errors: [] };

  // Delegates to the reconcilers rather than re-deriving account codes here.
  // The old version hardcoded its own debit/credit pairs, which meant backfill
  // and live posting could — and did — drift into two different sets of rules.
  try { result.sales = await reconcileMissingSaleEntries(); }
  catch (e) { result.errors.push(`Ventes: ${(e as Error).message}`); }

  try { result.purchases = await reconcileMissingPurchaseEntries(); }
  catch (e) { result.errors.push(`Achats: ${(e as Error).message}`); }

  try { result.expenses = await reconcileMissingExpenseEntries(); }
  catch (e) { result.errors.push(`Dépenses: ${(e as Error).message}`); }

  revalidatePath('/rapports/comptabilite');
  return result;
}

/**
 * Documents that already carry a non-void entry for a given event.
 * Event-aware on purpose: a document now legitimately has several entries
 * (created, cogs, payment), so keying dedup on reference_id alone would
 * wrongly treat a settled sale as fully posted.
 */
async function postedDocumentIds(
  supabase: any, businessId: string, refType: string, event: JournalEventType, ids: string[],
): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const { data } = await supabase
    .from('journal_entries')
    .select('reference_id')
    .eq('business_id', businessId)
    .eq('reference_type', refType)
    .eq('event_type', event)
    .neq('status', 'void')
    .in('reference_id', ids);
  return new Set((data ?? []).map((r: any) => r.reference_id));
}

// Les trois réconciliations balaient tout l'historique et postent en masse.
// Aucun écran ne les appelle directement (seulement la reprise ci-dessus, et
// `/api/reconcile` pour les dépenses) : elles reçoivent la permission
// d'écriture, mais PAS la garde d'offre — la route d'exploitation doit pouvoir
// combler un trou de journal chez un marchand sans l'offre. La reprise, elle,
// a déjà vérifié l'offre avant d'arriver ici.

// Reconcile sales: create journal entries for sales that have none
export async function reconcileMissingSaleEntries(): Promise<number> {
  await assertPermission('reports:export');
  const { supabase, businessId, exchangeRate } = await getBusinessContext();

  const { data: sales } = await supabase
    .from('sales')
    .select('id, invoice_number, total_amount, currency, exchange_rate, payment_method, payment_status, sale_date, created_at')
    .eq('business_id', businessId)
    .is('deleted_at', null);

  if (!sales?.length) return 0;

  const saleIds = sales.map((s: any) => s.id);
  const doneCreated = await postedDocumentIds(supabase, businessId, 'sale', 'created', saleIds);
  const doneCogs    = await postedDocumentIds(supabase, businessId, 'sale', 'cogs',    saleIds);

  let created = 0;
  for (const s of sales) {
    const saleId = (s as any).id;
    // Le taux de la vente quand il a été saisi (> 1) : une vente boutique en USD
    // porte le taux figé au paiement, pas celui du jour de la reprise. 1 est la
    // valeur par défaut de la colonne, pas un taux.
    const saleRate = Number((s as any).exchange_rate);
    const ctx: PostingContext = {
      amount:        Number((s as any).total_amount),
      date:          (s as any).sale_date ?? ((s as any).created_at as string).split('T')[0],
      currency:      (((s as any).currency as any) ?? 'HTG') as 'HTG' | 'USD',
      exchangeRate:  ((s as any).currency as any) === 'USD'
        ? (Number.isFinite(saleRate) && saleRate > 1 ? saleRate : exchangeRate)
        : 1,
      isCredit:      (s as any).payment_status === 'credit',
      paymentMethod: (s as any).payment_method ?? undefined,
      label:         (s as any).invoice_number ?? saleId,
    };

    if (!doneCreated.has(saleId)) {
      if (await postEvent('sale', 'created', saleId, ctx)) created += 1;
    }
    // Perpetual inventory: a sale without its COGS leg overstates gross margin.
    if (!doneCogs.has(saleId)) {
      await recordSaleCogs(saleId, ctx);
    }
  }

  return created;
}

// Reconcile purchases: create journal entries for purchases that have none
export async function reconcileMissingPurchaseEntries(): Promise<number> {
  await assertPermission('reports:export');
  const { supabase, businessId, exchangeRate } = await getBusinessContext();

  const { data: purchases } = await supabase
    .from('purchases')
    .select('id, po_number, total_amount, currency, payment_method, payment_status, purchase_date')
    .eq('business_id', businessId)
    .is('deleted_at', null);

  if (!purchases?.length) return 0;

  const purchaseIds = purchases.map((p: any) => p.id);
  const alreadyDone = await postedDocumentIds(supabase, businessId, 'purchase', 'created', purchaseIds);

  let created = 0;
  for (const p of purchases) {
    const purchaseId = (p as any).id;
    if (alreadyDone.has(purchaseId)) continue;

    const posted = await postEvent('purchase', 'created', purchaseId, {
      amount:        Number((p as any).total_amount),
      date:          (p as any).purchase_date ?? new Date().toISOString().split('T')[0],
      currency:      (((p as any).currency as any) ?? 'HTG') as 'HTG' | 'USD',
      exchangeRate:  ((p as any).currency as any) === 'USD' ? exchangeRate : 1,
      isCredit:      (p as any).payment_status === 'credit',
      paymentMethod: (p as any).payment_method ?? undefined,
      label:         (p as any).po_number ?? purchaseId,
    });
    if (posted) created += 1;
  }

  return created;
}

// Reconcile expenses: create journal entries for expenses that have none
export async function reconcileMissingExpenseEntries(): Promise<number> {
  await assertPermission('reports:export');
  const { supabase, businessId, exchangeRate } = await getBusinessContext();

  // Get all expenses
  const { data: expenses } = await supabase
    .from('expenses')
    .select('id, description, amount, currency, expense_date, payment_method, payment_status, expense_categories(name)')
    .eq('business_id', businessId)
    .is('deleted_at', null);

  if (!expenses?.length) return 0;

  // Get expense IDs that already have non-void journal entries
  const expenseIds = expenses.map((e: any) => e.id);
  const alreadyDone = await postedDocumentIds(supabase, businessId, 'expense', 'created', expenseIds);

  let created = 0;
  for (const e of expenses) {
    const expenseId = (e as any).id;
    if (alreadyDone.has(expenseId)) continue;

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
  // Sans appelant aujourd'hui, mais exportée donc appelable : même garde que
  // les autres lectures de l'écran comptable.
  await assertAccountingRead();
  const { supabase, businessId } = await getBusinessContext();

  // Cleanup: soft-delete non-system accounts that duplicate a system account's code
  const { data: allAccounts } = await supabase
    .from('chart_of_accounts')
    .select('id,code,is_system')
    .eq('business_id', businessId)
    .is('deleted_at', null);
  if (allAccounts) {
    const systemCodes = new Set(allAccounts.filter(a => a.is_system).map(a => a.code));
    const dupIds = allAccounts
      .filter(a => !a.is_system && systemCodes.has(a.code))
      .map(a => a.id);
    if (dupIds.length > 0) {
      await supabase
        .from('chart_of_accounts')
        .update({ deleted_at: new Date().toISOString() })
        .in('id', dupIds);
    }
  }

  const { data } = await supabase
    .from('chart_of_accounts')
    .select('id,code,name,name_ht,account_class,parent_id,is_active')
    .eq('business_id', businessId)
    .is('deleted_at', null)
    .order('code');

  return (data ?? []) as ChartAccount[];
}

// `offset` sert au « Charger plus » du grand livre : sans lui, tout ce qui
// dépassait la première page était invisible, sans le moindre avertissement.
export async function getJournalEntries(limit = 50, offset = 0) {
  await assertAccountingRead();
  const { supabase, businessId } = await getBusinessContext();

  // Pas de réconciliation ici. Lire le journal ne doit pas l'écrire : ces trois
  // appels balayaient TOUTES les ventes, achats et dépenses de l'entreprise à
  // chaque affichage de la page, et postaient hors transaction. Les nouvelles
  // transactions se comptabilisent maintenant à leur création ; la reprise de
  // l'historique reste explicite (bouton « Rekonsilye » → backfillAllJournalEntries).
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
    .range(offset, offset + limit - 1);

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
  await assertAccountingRead();
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
  await assertAccountingRead();
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

    if (acc.account_class === 'Revenue' || acc.account_class === 'ContraRevenue') {
      // Un contra-produit (7090R Retours sur ventes) a un solde DÉBITEUR : la
      // même formule le rend naturellement négatif, donc il vient en déduction
      // du chiffre d'affaires au lieu de gonfler les charges.
      const amt = credit - debit;
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
  await assertAccountingRead();
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
  // Résultat non encore affecté : produits − charges depuis l'ouverture.
  let runningResult = 0;

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
    } else if (acc.account_class === 'Revenue' || acc.account_class === 'ContraRevenue') {
      runningResult += credit - debit;
    } else if (acc.account_class === 'Expense') {
      runningResult -= debit - credit;
    }
  }

  // Sans écriture de clôture, les classes 6 et 7 restent ouvertes : le bénéfice
  // vit hors du bilan et Actif ≠ Passif + Capitaux, de l'exact montant du
  // résultat. On le présente donc comme une ligne de capitaux propres, ce qui
  // est aussi sa vraie nature comptable tant qu'il n'est pas affecté.
  if (Math.abs(runningResult) >= 0.01) {
    const label = "Résultat de l'exercice (non affecté)";
    equity[label] = (equity[label] ?? 0) + parseFloat(runningResult.toFixed(2));
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

// ── CLEANUP: Remove duplicate journal entries ──────────────────────────────

export async function cleanupDuplicateJournalEntries(): Promise<{ removed: number; kept: number }> {
  // Annule des écritures postées : écriture, pas lecture.
  await assertAccountingWrite();
  const { supabase, businessId, userId } = await getBusinessContext();

  // Ne considère que les écritures POSTÉES : une écriture déjà annulée n'est pas
  // un doublon, et la contre-passer une seconde fois casserait le lien
  // reversal_of.
  const { data: entries } = await supabase
    .from('journal_entries')
    .select('id, reference_type, reference_id, event_type, settlement_id, status, created_at')
    .eq('business_id', businessId)
    .neq('reference_type', 'manual')
    .not('reference_id', 'is', null)
    .eq('status', 'posted')
    .order('created_at', { ascending: true });

  // La clé de groupement doit être EXACTEMENT celle de uq_je_document_event.
  // Grouper sur (reference_type, reference_id) seul — ce que faisait cette
  // fonction — était juste tant qu'un document n'avait qu'une écriture. Depuis
  // l'event sourcing, une vente en porte légitimement plusieurs (created, cogs,
  // puis un payment par versement) : ce nettoyage annulait le COGS et tous les
  // encaissements sauf le dernier, et vidait leurs lignes. Il détruisait le
  // journal au lieu de le nettoyer.
  const groups: Record<string, any[]> = {};
  for (const e of entries ?? []) {
    // Les contre-écritures sont hors index d'unicité : un document annulé en
    // produit une par écriture d'origine. Ce ne sont jamais des doublons.
    if (e.event_type === 'reversal') continue;
    const key = `${e.reference_type}:${e.reference_id}:${e.event_type ?? 'created'}:${e.settlement_id ?? '-'}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(e);
  }

  let removed = 0;
  let kept = 0;

  for (const [key, group] of Object.entries(groups)) {
    if (group.length <= 1) continue;

    // Keep the newest non-void entry; void the rest
    const posted = group.filter((e: any) => e.status === 'posted');
    const keep = posted.length > 0
      ? posted.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
      : group.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

    for (const e of group) {
      if (e.id === keep.id) { kept++; continue; }
      // On ne touche PAS aux lignes : une écriture annulée garde ses montants,
      // c'est ce qui rend l'annulation auditable. Le statut 'void' l'exclut déjà
      // de la balance, du bilan et du compte de résultat.
      await supabase
        .from('journal_entries')
        .update({
          status: 'void',
          voided_by: userId,
          voided_at: new Date().toISOString(),
          voided_reason: 'Duplicate automatiquement nettoyé',
        })
        .eq('id', e.id);
      removed++;
    }
  }

  revalidatePath('/rapports/comptabilite');
  return { removed, kept };
}
