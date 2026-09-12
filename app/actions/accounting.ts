'use server';

import { getBusinessContext } from '../../lib/serverAuth';
import { assertAccess, assertPermission } from '../../lib/entitlements';
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

/** Where a document sits in its lifecycle. A document yields one entry per event. */
export type JournalEventType = 'created' | 'payment' | 'cogs' | 'reversal' | 'adjustment';

export type JournalEntryPayload = {
  date:           string;       // YYYY-MM-DD
  description:    string;
  reference?:     string;
  reference_type?: string;      // 'sale' | 'purchase' | 'expense' | 'manual'
  reference_id?:  string;
  event_type?:    JournalEventType;  // defaults to 'created'
  reversal_of?:   string;
  /** Settlements only — which instalment this entry clears. See PostingContext. */
  settlement_id?: string;
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
    .limit(1);
  return (data && data.length > 0) ? data[0].id : null;
}

async function getOrCreatePeriod(supabase: any, businessId: string, transactionDate: string): Promise<string | null> {
  // Use the transaction date to find or create the matching accounting period.
  const effectiveDate = new Date(transactionDate).toISOString().split('T')[0];
  // Look up WITHOUT filtering on is_closed. Filtering it out made a closed
  // period invisible, so the code below tried to INSERT a second period with
  // the same start_date — a unique-violation that surfaced as an opaque posting
  // failure instead of the real reason.
  const { data: existing } = await supabase
    .from('accounting_periods')
    .select('id, is_closed, name')
    .eq('business_id', businessId)
    .lte('start_date', effectiveDate)
    .gte('end_date', effectiveDate)
    .maybeSingle();

  if (existing) {
    // A closed period is closed: its statements are published. Backdating into
    // it would silently restate them. The correction belongs in an open period.
    if (existing.is_closed) {
      throw new Error(
        `Peryòd "${existing.name}" fèmen — ou pa ka poste yon ekriti nan dat ${effectiveDate}. ` +
        `Itilize yon dat nan yon peryòd ouvè, oswa reouvri peryòd la.`,
      );
    }
    return existing.id;
  }

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

/**
 * Numérotation des pièces : laissée à la base.
 *
 * La colonne entry_number porte DEFAULT fn_generate_ref('JE'), qui tire sur une
 * séquence Postgres — donc strictement unique. La version JS tirait 4 chiffres
 * au hasard sur une contrainte UNIQUE (business_id, entry_number) : par le
 * paradoxe des anniversaires, une collision devenait probable dès ~100 écritures
 * dans la même journée, et se manifestait comme un échec de comptabilisation
 * incompréhensible. On n'envoie donc plus la colonne du tout.
 */

/**
 * Classe comptable déduite du code, quand un compte doit être créé à la volée.
 * Le plan (CHART_OF_ACCOUNTS) reste l'autorité ; ceci n'est qu'un filet.
 * Sans lui, tout code inconnu tombait en 'Expense' — un véhicule à 900 000 HTG
 * atterrissait dans les charges et n'en ressortait jamais.
 */
function inferAccountClass(code: string): AccountClass {
  switch (code[0]) {
    case '2': return 'Asset';      // immobilisations
    case '3': return 'Asset';      // stocks
    case '5': return 'Asset';      // trésorerie
    case '7': return 'Revenue';    // produits
    case '6': return 'Expense';    // charges
    case '1': return 'Equity';     // capitaux (les dettes financières 16xx sont au plan)
    default:  return 'Liability';  // classe 4 — tiers : le passif est le défaut prudent
  }
}

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

/**
 * Le cœur, sans garde — réservé aux écritures automatiques de ce module
 * (`postEvent`, `reverseDocumentEntries`). Non exporté : un fichier
 * `'use server'` rend chaque export appelable depuis le navigateur, et ce cœur
 * exposé contournerait la garde de `createJournalEntry`.
 */
async function insertJournalEntry(payload: JournalEntryPayload): Promise<string> {
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

  // Ensure chart of accounts exists — dynamically create any missing accounts
  if (accountIds.some(id => id === null)) {
    const missing: { code: string; line: typeof payload.lines[0] }[] = [];
    for (let i = 0; i < accountIds.length; i++) {
      if (accountIds[i] === null) {
        missing.push({ code: payload.lines[i].account_code, line: payload.lines[i] });
      }
    }
    for (const m of missing) {
      const info = CHART_OF_ACCOUNTS[m.code];
      if (!info) {
        console.warn(
          `[accounting] compte ${m.code} absent du plan CHART_OF_ACCOUNTS — ` +
          `créé par déduction (classe ${inferAccountClass(m.code)}). Ajoutez-le au plan.`,
        );
      }
      const { error: insErr } = await supabase
        .from('chart_of_accounts')
        .upsert({
          business_id:   businessId,
          code:          m.code,
          name:          info?.name ?? m.line.description,
          name_ht:       info?.name_ht ?? m.line.description,
          account_class: info?.class ?? inferAccountClass(m.code),
          is_system:     false,
        }, { onConflict: 'business_id,code', ignoreDuplicates: true });
      if (insErr) console.error(`[accounting] create account ${m.code} failed:`, insErr.message);
    }
    // Retry
    const retryIds = await Promise.all(
      payload.lines.map(l => getAccountId(supabase, businessId, l.account_code))
    );
    if (retryIds.some(id => id === null)) {
      const stillMissing = payload.lines
        .filter((_, i) => retryIds[i] === null)
        .map(l => l.account_code)
        .join(', ');
      throw new Error(`Impossible de trove kont comptab pou kòd sa yo apre kreyasyon: ${stillMissing}.`);
    }
    accountIds.splice(0, accountIds.length, ...retryIds);
  }

  // Create journal entry header
  const eventType = payload.event_type ?? 'created';
  const { data: entry, error: jeErr } = await supabase
    .from('journal_entries')
    .insert({
      business_id:    businessId,
      period_id:      periodId,
      // entry_number : laissé à DEFAULT fn_generate_ref('JE') — voir plus haut.
      entry_date:     payload.date,
      reference:      payload.reference ?? null,
      reference_type: payload.reference_type ?? 'manual',
      reference_id:   payload.reference_id ?? null,
      event_type:     eventType,
      reversal_of:    payload.reversal_of ?? null,
      settlement_id:  payload.settlement_id ?? null,
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

  if (jeErr) {
    // 23505 = unique_violation on uq_je_document_event: this (document, event) is
    // already posted. Idempotent by construction — return the existing entry
    // instead of creating a duplicate.
    if ((jeErr as any).code === '23505' && payload.reference_id) {
      let q = supabase
        .from('journal_entries')
        .select('id')
        .eq('business_id', businessId)
        .eq('reference_type', payload.reference_type ?? 'manual')
        .eq('reference_id', payload.reference_id)
        .eq('event_type', eventType)
        .neq('status', 'void');
      // Must mirror uq_je_document_event exactly — settlement_id included, or a
      // 2nd instalment would resolve to the 1st one's entry and look like a
      // successful post.
      q = payload.settlement_id
        ? q.eq('settlement_id', payload.settlement_id)
        : q.is('settlement_id', null);
      const { data: existing } = await q.maybeSingle();
      if (existing?.id) return existing.id;
    }
    throw new Error(jeErr.message);
  }
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

// ── POSTING RULES ─────────────────────────────────────────────────────────────
// One declarative rule per (document, event). Adding a lifecycle event means
// adding a row here, not writing another record*Entry function.
//
// Inventory method: PERPETUAL. A purchase capitalises into 3700 Stock (asset);
// the charge is recognised at sale time via the `cogs` event (6030 / 3700).
// That is what makes gross margin exact in real time.

export type PostingContext = {
  amount:        number;
  date:          string;
  currency:      'HTG' | 'USD';
  exchangeRate?: number;
  /** Document settles later — hits the client/supplier account instead of cash. */
  isCredit?:     boolean;
  paymentMethod?: string;
  /** Expenses only — drives which charge (or asset) account is debited. */
  categoryName?: string;
  /** Invoice / PO number or free label, used in the entry description. */
  label?:        string;
  reference?:    string;
  /**
   * Settlements only — id of the instalment row being cleared (customer_transactions,
   * supplier_transactions…). It is what makes N partial payments on one document
   * distinct in the idempotency key; omit it and only the first one ever posts.
   */
  settlementId?: string;
};

type PostingRule = {
  debit:       (c: PostingContext) => string;
  credit:      (c: PostingContext) => string;
  describe:    (c: PostingContext) => string;
  debitLabel:  (c: PostingContext) => string;
  creditLabel: (c: PostingContext) => string;
};

/** Cash-side account: bank-like payment methods land in 5110, everything else in 5310. */
const cashAccount = (c: PostingContext): string =>
  isBankPaymentMethod(c.paymentMethod) ? ENGINE_CODES.BANQUE : ENGINE_CODES.CAISSE;

const cashLabel = (c: PostingContext): string =>
  isBankPaymentMethod(c.paymentMethod) ? 'Banque' : 'Caisse';

/** Expense debit side: capitalise real assets, otherwise book a charge. */
const expenseDebit = (c: PostingContext): string =>
  isAssetCategory(c.categoryName ?? '')
    ? classifyAssetCategory(c.categoryName ?? '')
    : classifyExpenseCategory(c.categoryName ?? '');

/**
 * Table de correspondance événement → écriture comptable.
 *
 * Volontairement **non exportée** : un fichier `'use server'` ne peut exposer
 * que des fonctions asynchrones, et Next refuse le build sinon. Rien hors de ce
 * module ne s'en sert ; si un jour c'est nécessaire, la table doit descendre
 * dans `lib/accountingEngine.ts` avec le reste des règles métier, pas être
 * réexportée d'ici.
 */
const POSTING_RULES: Record<string, PostingRule> = {
  // ── VENTES ────────────────────────────────────────────────────────────────
  'sale.created': {
    debit:       c => (c.isCredit ? ENGINE_CODES.CLIENTS : cashAccount(c)),
    credit:      () => ENGINE_CODES.VENTES,
    describe:    c => `Vente — Facture ${c.label ?? ''}`.trim(),
    debitLabel:  c => (c.isCredit ? 'Vente à crédit — Clients' : `Vente comptant — ${cashLabel(c)}`),
    creditLabel: c => `Revenu vente — ${c.label ?? ''}`.trim(),
  },
  // Sortie de stock constatée en charge (inventaire permanent).
  'sale.cogs': {
    debit:       () => ENGINE_CODES.COUT_VENTES,
    credit:      () => ENGINE_CODES.STOCK,
    describe:    c => `Coût marchandises vendues — ${c.label ?? ''}`.trim(),
    debitLabel:  () => 'Coût des marchandises vendues',
    creditLabel: () => 'Sortie de stock',
  },
  // Le client règle sa dette : la créance 4110 s'éteint, la caisse entre.
  'sale.payment': {
    debit:       c => cashAccount(c),
    credit:      () => ENGINE_CODES.CLIENTS,
    describe:    c => `Règlement client — ${c.label ?? ''}`.trim(),
    debitLabel:  c => `Encaissement — ${cashLabel(c)}`,
    creditLabel: () => 'Extinction créance client',
  },

  // Règlement reçu d'un client SANS facture rattachée (règlement de compte,
  // acompte, versement global sur plusieurs factures). Même écriture que
  // sale.payment, mais accrochée au client. Sans cette règle, l'argent entrait
  // en caisse réelle sans jamais entrer au journal : la caisse comptable
  // divergeait de la caisse physique, et la créance client restait au bilan.
  'customer.payment': {
    debit:       c => cashAccount(c),
    credit:      () => ENGINE_CODES.CLIENTS,
    describe:    c => `Règlement client — ${c.label ?? ''}`.trim(),
    debitLabel:  c => `Encaissement — ${cashLabel(c)}`,
    creditLabel: () => 'Extinction créance client',
  },

  // ── ACHATS ────────────────────────────────────────────────────────────────
  'purchase.created': {
    debit:       () => ENGINE_CODES.STOCK,
    credit:      c => (c.isCredit ? ENGINE_CODES.FOURNISSEURS : cashAccount(c)),
    describe:    c => `Achat — ${c.label ?? ''}`.trim(),
    debitLabel:  () => 'Entrée en stock',
    creditLabel: c => (c.isCredit ? 'Dette fournisseur' : `Paiement ${cashLabel(c)}`),
  },
  // Nous réglons le fournisseur : la dette 4010 s'éteint, la caisse sort.
  'purchase.payment': {
    debit:       () => ENGINE_CODES.FOURNISSEURS,
    credit:      c => cashAccount(c),
    describe:    c => `Règlement fournisseur — ${c.label ?? ''}`.trim(),
    debitLabel:  () => 'Extinction dette fournisseur',
    creditLabel: c => `Décaissement — ${cashLabel(c)}`,
  },

  // ── DÉPENSES ──────────────────────────────────────────────────────────────
  'expense.created': {
    debit:       c => expenseDebit(c),
    credit:      c => (c.isCredit ? ENGINE_CODES.FOURNISSEURS : cashAccount(c)),
    describe:    c => c.label ?? 'Dépense',
    debitLabel:  c => `${isAssetCategory(c.categoryName ?? '') ? 'Achat actif — capitalisation' : 'Dépense'} — ${c.label ?? ''}`.trim(),
    creditLabel: c => (c.isCredit ? 'Dette fournisseur (à payer)' : 'Paiement'),
  },
  'expense.payment': {
    debit:       () => ENGINE_CODES.FOURNISSEURS,
    credit:      c => cashAccount(c),
    describe:    c => `Règlement dépense — ${c.label ?? ''}`.trim(),
    debitLabel:  () => 'Extinction dette fournisseur',
    creditLabel: c => `Décaissement — ${cashLabel(c)}`,
  },
};

// ── FAILURE LOG ───────────────────────────────────────────────────────────────
// Posting stays non-blocking: a journal failure must never refuse a sale. But it
// must not vanish either — every failure is recorded so the UI can surface it.

async function recordPostingFailure(
  refType: string, refId: string, event: JournalEventType, message: string, ctx: PostingContext,
): Promise<void> {
  try {
    const { supabase, businessId } = await getBusinessContext();
    // onConflict cannot name an expression index (uq_jpf_open uses COALESCE), so
    // resolve the open row ourselves. Two failed instalments must stay separate.
    let q = supabase
      .from('journal_posting_failures')
      .select('id')
      .eq('business_id', businessId)
      .eq('reference_type', refType)
      .eq('reference_id', refId)
      .eq('event_type', event)
      .is('resolved_at', null);
    q = ctx.settlementId ? q.eq('settlement_id', ctx.settlementId) : q.is('settlement_id', null);
    const { data: open } = await q.maybeSingle();

    const row = {
      business_id:    businessId,
      reference_type: refType,
      reference_id:   refId,
      event_type:     event,
      settlement_id:  ctx.settlementId ?? null,
      error_message:  message,
      payload:        ctx as any,
      updated_at:     new Date().toISOString(),
    };

    if (open?.id) {
      await supabase.from('journal_posting_failures').update(row).eq('id', open.id);
    } else {
      await supabase.from('journal_posting_failures').insert(row);
    }
  } catch (e) {
    console.error('[accounting] could not record posting failure:', (e as Error).message);
  }
}

async function clearPostingFailure(
  refType: string, refId: string, event: JournalEventType, settlementId?: string,
): Promise<void> {
  try {
    const { supabase, businessId } = await getBusinessContext();
    let q = supabase
      .from('journal_posting_failures')
      .update({ resolved_at: new Date().toISOString() })
      .eq('business_id', businessId)
      .eq('reference_type', refType)
      .eq('reference_id', refId)
      .eq('event_type', event)
      .is('resolved_at', null);
    // Resolve only the instalment that just succeeded — clearing them all would
    // hide instalments that are still broken.
    q = settlementId ? q.eq('settlement_id', settlementId) : q.is('settlement_id', null);
    await q;
  } catch { /* best-effort */ }
}

// ── CORE: post one business event ─────────────────────────────────────────────
/**
 * Posts the double entry for one (document, event) pair.
 * Never throws — a journal failure must not roll back the business transaction.
 * Returns the entry id, or null if nothing was posted.
 */
export async function postEvent(
  refType: string,
  event: JournalEventType,
  refId: string,
  ctx: PostingContext,
): Promise<string | null> {
  const rule = POSTING_RULES[`${refType}.${event}`];
  if (!rule) {
    console.error(`[accounting] no posting rule for ${refType}.${event}`);
    return null;
  }

  // A zero-amount entry carries no information and would only add noise.
  const amount = Number(ctx.amount);
  if (!Number.isFinite(amount) || Math.abs(amount) < 0.01) return null;

  try {
    // Le cœur non gardé : une vente doit se comptabiliser sans l'offre Rapports.
    const entryId = await insertJournalEntry({
      date:           ctx.date,
      description:    rule.describe(ctx),
      reference:      ctx.reference ?? ctx.label,
      reference_type: refType,
      reference_id:   refId,
      event_type:     event,
      settlement_id:  ctx.settlementId,
      currency:       ctx.currency,
      exchangeRate:   ctx.exchangeRate,
      lines: [
        { account_code: rule.debit(ctx),  description: rule.debitLabel(ctx),  debit: amount, credit: 0 },
        { account_code: rule.credit(ctx), description: rule.creditLabel(ctx), debit: 0,      credit: amount },
      ],
    });
    await clearPostingFailure(refType, refId, event, ctx.settlementId);
    return entryId;
  } catch (e) {
    const msg = (e as Error).message;
    console.error(`[accounting] ${refType}.${event} posting failed:`, msg);
    await recordPostingFailure(refType, refId, event, msg, ctx);
    return null;
  }
}

// ── REVERSAL ──────────────────────────────────────────────────────────────────
/**
 * Corrects a document by posting mirror-image counter-entries, then marking the
 * originals void. Never mutates a posted entry's amounts — that would destroy
 * the audit trail and silently change past financial statements.
 */
export async function reverseDocumentEntries(
  refType: string, refId: string, reason: string,
  /**
   * Restreint la contre-passation à certains événements. Sert à la MODIFICATION
   * d'un document : on annule et re-poste son écriture de création sans toucher
   * aux règlements déjà encaissés, qui eux n'ont pas changé.
   * Non renseigné = tout le cycle de vie (cas de l'annulation du document).
   */
  opts?: { events?: JournalEventType[] },
): Promise<number> {
  const { supabase, businessId, userId } = await getBusinessContext();

  let query = supabase
    .from('journal_entries')
    .select('id, entry_date, description, currency, exchange_rate, event_type, reference, settlement_id')
    .eq('business_id', businessId)
    .eq('reference_type', refType)
    .eq('reference_id', refId)
    .neq('status', 'void');

  if (opts?.events?.length) query = query.in('event_type', opts.events);

  const { data: entries } = await query;

  let reversed = 0;

  for (const je of entries ?? []) {
    const { data: lines } = await supabase
      .from('journal_entry_lines')
      .select('account_id, description, debit_amount, credit_amount')
      .eq('journal_entry_id', je.id);

    if (!lines?.length) continue;

    // Resolve account ids back to codes so createJournalEntry can re-map them.
    const { data: accounts } = await supabase
      .from('chart_of_accounts')
      .select('id, code')
      .in('id', lines.map((l: any) => l.account_id));
    const codeById = new Map((accounts ?? []).map((a: any) => [a.id, a.code]));

    try {
      // Mark the original void FIRST: the partial unique index excludes void
      // rows, which frees the (document, event) slot for the counter-entry.
      await supabase
        .from('journal_entries')
        .update({
          status:        'void',
          voided_by:     userId,
          voided_at:     new Date().toISOString(),
          voided_reason: reason,
        })
        .eq('id', je.id);

      // Cœur non gardé : la contre-passation suit la modification ou
      // l'annulation d'une dépense, quelle que soit l'offre.
      const reversalId = await insertJournalEntry({
        date:           je.entry_date,
        description:    `ANNULATION — ${je.description}`,
        reference:      je.reference ?? undefined,
        reference_type: refType,
        reference_id:   refId,
        event_type:     'reversal',
        reversal_of:    je.id,
        // Carried over so a reversal stays traceable to the instalment it cancels.
        settlement_id:  (je as any).settlement_id ?? undefined,
        currency:       (je.currency ?? 'HTG') as 'HTG' | 'USD',
        exchangeRate:   Number(je.exchange_rate ?? 1),
        // Debit ↔ credit swapped: the two entries now sum to zero.
        lines: lines.map((l: any) => ({
          account_code: codeById.get(l.account_id) ?? '',
          description:  `Annulation — ${l.description ?? ''}`.trim(),
          debit:        Number(l.credit_amount ?? 0),
          credit:       Number(l.debit_amount ?? 0),
        })).filter((l: any) => l.account_code),
      });

      await supabase
        .from('journal_entries')
        .update({ reversal_of: reversalId })
        .eq('id', je.id);

      reversed++;
    } catch (e) {
      console.error('[accounting] reversal failed for entry', je.id, (e as Error).message);
    }
  }

  revalidatePath('/rapports');
  revalidatePath('/rapports/comptabilite');
  return reversed;
}

// ── TRANSACTION HOOKS ─────────────────────────────────────────────────────────
// Thin wrappers kept for the existing call sites; all logic lives in POSTING_RULES.

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
  const ctx: PostingContext = {
    amount:        params.amount,
    date:          params.date,
    currency:      params.currency,
    exchangeRate:  params.exchangeRate,
    isCredit:      params.isCredit,
    paymentMethod: params.paymentMethod,
    label:         params.invoiceNumber,
    reference:     params.invoiceNumber,
  };

  await postEvent('sale', 'created', params.saleId, ctx);

  // Perpetual inventory: recognise the stock outflow as a charge at sale time.
  await recordSaleCogs(params.saleId, ctx);
}

/**
 * Posts the COGS leg of a sale from the cost actually captured on its lines.
 * Skipped when the sale carries no cost data — a 0 HTG entry would be noise,
 * and guessing a cost would silently falsify gross margin.
 */
export async function recordSaleCogs(saleId: string, ctx: PostingContext): Promise<void> {
  try {
    const { supabase, businessId } = await getBusinessContext();
    const { data: items } = await supabase
      .from('sale_items')
      .select('quantity, cost_price')
      .eq('business_id', businessId)
      .eq('sale_id', saleId);

    const cogs = (items ?? []).reduce(
      (sum: number, it: any) => sum + Number(it.quantity ?? 0) * Number(it.cost_price ?? 0),
      0,
    );
    if (cogs < 0.01) return;

    await postEvent('sale', 'cogs', saleId, { ...ctx, amount: parseFloat(cogs.toFixed(2)) });
  } catch (e) {
    console.error('[accounting] recordSaleCogs error:', (e as Error).message);
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
  await postEvent('purchase', 'created', params.purchaseId, {
    amount:        params.amount,
    date:          params.date,
    currency:      params.currency,
    exchangeRate:  params.exchangeRate,
    isCredit:      params.isCredit,
    paymentMethod: params.paymentMethod,
    label:         params.poNumber,
    reference:     params.poNumber,
  });
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
  // No pre-flight duplicate SELECT: uq_je_document_event makes this idempotent,
  // and the old check broke as soon as a document carried more than one event.
  const isUnpaid = params.paymentStatus === 'credit' || params.paymentStatus === 'pending';

  await postEvent('expense', 'created', params.expenseId, {
    amount:        params.amount,
    date:          params.date,
    currency:      params.currency,
    exchangeRate:  params.exchangeRate,
    isCredit:      isUnpaid,
    paymentMethod: params.paymentMethod,
    categoryName:  params.categoryName,
    label:         params.description,
  });
}

// ── SETTLEMENT HOOKS — the events that were missing entirely ──────────────────

// `settlementId` is what lets a document take several instalments: it is part of
// the idempotency key, so each payment row gets its own entry. Pass the id of the
// row that records the payment (customer_transactions, supplier_transactions…).
// Omitting it caps the document at ONE settlement entry for its whole life.

/** A customer pays down a credit sale: cash in, receivable 4110 extinguished. */
export async function recordSalePaymentEntry(params: {
  saleId: string;
  amount: number;
  date: string;
  currency: 'HTG' | 'USD';
  paymentMethod?: string;
  exchangeRate?: number;
  label?: string;
  settlementId?: string;
}): Promise<void> {
  await postEvent('sale', 'payment', params.saleId, {
    amount:        params.amount,
    date:          params.date,
    currency:      params.currency,
    exchangeRate:  params.exchangeRate,
    paymentMethod: params.paymentMethod,
    label:         params.label,
    settlementId:  params.settlementId,
  });
}

/**
 * A customer settles their account without pointing at one invoice.
 * `customerId` is the document the entry hangs on; `settlementId` (the
 * customer_transactions row) is what keeps successive payments distinct.
 */
export async function recordCustomerPaymentEntry(params: {
  customerId: string;
  amount: number;
  date: string;
  currency: 'HTG' | 'USD';
  paymentMethod?: string;
  exchangeRate?: number;
  label?: string;
  settlementId?: string;
}): Promise<void> {
  await postEvent('customer', 'payment', params.customerId, {
    amount:        params.amount,
    date:          params.date,
    currency:      params.currency,
    exchangeRate:  params.exchangeRate,
    paymentMethod: params.paymentMethod,
    label:         params.label,
    settlementId:  params.settlementId,
  });
}

/** We pay a supplier: payable 4010 extinguished, cash out. */
export async function recordPurchasePaymentEntry(params: {
  purchaseId: string;
  amount: number;
  date: string;
  currency: 'HTG' | 'USD';
  paymentMethod?: string;
  exchangeRate?: number;
  label?: string;
  settlementId?: string;
}): Promise<void> {
  await postEvent('purchase', 'payment', params.purchaseId, {
    amount:        params.amount,
    date:          params.date,
    currency:      params.currency,
    exchangeRate:  params.exchangeRate,
    paymentMethod: params.paymentMethod,
    label:         params.label,
    settlementId:  params.settlementId,
  });
}

/** An expense booked on credit gets settled. */
export async function recordExpensePaymentEntry(params: {
  expenseId: string;
  amount: number;
  date: string;
  currency: 'HTG' | 'USD';
  paymentMethod?: string;
  exchangeRate?: number;
  label?: string;
  settlementId?: string;
}): Promise<void> {
  await postEvent('expense', 'payment', params.expenseId, {
    amount:        params.amount,
    date:          params.date,
    currency:      params.currency,
    exchangeRate:  params.exchangeRate,
    paymentMethod: params.paymentMethod,
    label:         params.label,
    settlementId:  params.settlementId,
  });
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
    .select('id, invoice_number, total_amount, currency, payment_method, payment_status, sale_date, created_at')
    .eq('business_id', businessId)
    .is('deleted_at', null);

  if (!sales?.length) return 0;

  const saleIds = sales.map((s: any) => s.id);
  const doneCreated = await postedDocumentIds(supabase, businessId, 'sale', 'created', saleIds);
  const doneCogs    = await postedDocumentIds(supabase, businessId, 'sale', 'cogs',    saleIds);

  let created = 0;
  for (const s of sales) {
    const saleId = (s as any).id;
    const ctx: PostingContext = {
      amount:        Number((s as any).total_amount),
      date:          (s as any).sale_date ?? ((s as any).created_at as string).split('T')[0],
      currency:      (((s as any).currency as any) ?? 'HTG') as 'HTG' | 'USD',
      exchangeRate:  ((s as any).currency as any) === 'USD' ? exchangeRate : 1,
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
