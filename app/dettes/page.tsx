'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useLanguage } from '../../components/LanguageWrapper';
import { supabase } from '../../lib/supabaseClient';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import { recordDebtPayment } from '../actions/debts';
import { markClientCreditPaid } from '../actions/clients';
import { markExpensePaid } from '../actions/expenses';

// ── Types ─────────────────────────────────────────────────────────────────────

type EtatCritique = 'Critique' | 'Atansyon' | 'Nòmal';

type SupplierDebt = {
  id: string;
  supplier_id: string;
  supplier_name: string;
  supplier_phone: string | null;
  product_name: string;
  quantity: number;
  amount: number;
  currency: string;
  purchase_date: string;   // ISO date
  due_date: string;        // purchase_date + 30 days
  days_overdue: number;    // days since purchase_date
  payment_status: 'Payé' | 'À Crédit';
  etat: EtatCritique;
};

type ClientCredit = {
  id: string;
  client_id: string | null;
  client_name: string;
  client_phone: string | null;
  invoice_number: string | null;
  amount: number;
  currency: string;
  payment_status: 'À Crédit' | 'Payé';
  created_at: string;
  due_date: string;        // created_at + 30 days
  days_since: number;
  etat: EtatCritique;
};

type ExpenseDebt = {
  id: string;
  description: string;
  category: string;
  amount: number;
  currency: string;
  expense_date: string;
  due_date: string;
  days_overdue: number;
  payment_status: 'Payé' | 'À Crédit';
  etat: EtatCritique;
};

type FilterStatus = 'all' | 'unpaid' | 'paid';

// ── Helpers ───────────────────────────────────────────────────────────────────

function computeEtat(days: number, paid: boolean): EtatCritique {
  if (paid) return 'Nòmal';
  if (days > 30) return 'Critique';
  if (days >= 15)  return 'Atansyon';
  return 'Nòmal';
}

function addDays(isoDate: string, n: number): string {
  const d = new Date(isoDate);
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

function daysBetween(isoDate: string): number {
  const then = new Date(isoDate);
  const now  = new Date();
  return Math.floor((now.getTime() - then.getTime()) / 86_400_000);
}

function fmtDate(iso: string) {
  return new Date(iso + (iso.includes('T') ? '' : 'T00:00:00'))
    .toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' });
}

function fmtAmt(n: number, currency = 'HTG') {
  return new Intl.NumberFormat('fr-HT', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
    .format(n) + ' ' + currency;
}

function waLink(phone: string | null, message: string): string | null {
  if (!phone) return null;
  const clean = phone.replace(/\D/g, '');
  const e164  = clean.startsWith('509') ? clean : `509${clean}`;
  return `https://wa.me/${e164}?text=${encodeURIComponent(message)}`;
}

// ── Mock data ─────────────────────────────────────────────────────────────────

const MOCK_DEBTS: SupplierDebt[] = [
  { id:'sd1', supplier_id:'s1', supplier_name:'Distribisyon ABC',   supplier_phone:'47123456', product_name:'Riz 50kg', quantity:10, amount:55000, currency:'HTG', purchase_date:'2026-04-10', due_date:'2026-05-10', days_overdue:42, payment_status:'À Crédit', etat:'Critique' },
  { id:'sd2', supplier_id:'s2', supplier_name:'Boutik Santé Plus',  supplier_phone:'36987654', product_name:'Savon Detèjan', quantity:50, amount:18000, currency:'HTG', purchase_date:'2026-05-01', due_date:'2026-05-31', days_overdue:21, payment_status:'À Crédit', etat:'Atansyon' },
  { id:'sd3', supplier_id:'s3', supplier_name:'Agri Depou Nò',      supplier_phone:null,       product_name:'Maïs Moulu', quantity:20, amount:12000, currency:'HTG', purchase_date:'2026-05-15', due_date:'2026-06-14', days_overdue:7,  payment_status:'À Crédit', etat:'Nòmal' },
  { id:'sd4', supplier_id:'s1', supplier_name:'Distribisyon ABC',   supplier_phone:'47123456', product_name:'Farin Blé', quantity:15, amount:22500, currency:'HTG', purchase_date:'2026-04-05', due_date:'2026-05-05', days_overdue:47, payment_status:'Payé',    etat:'Nòmal' },
];

const MOCK_CREDITS: ClientCredit[] = [
  { id:'cc1', client_id:'c1', client_name:'Marie Joseph',    client_phone:'34561234', invoice_number:'PP-2026-100123', amount:8500,  currency:'HTG', payment_status:'À Crédit', created_at:'2026-04-08T10:00:00', due_date:'2026-05-08', days_since:44, etat:'Critique' },
  { id:'cc2', client_id:'c2', client_name:'Jean Pierre',     client_phone:'47009988', invoice_number:'PP-2026-100456', amount:4200,  currency:'HTG', payment_status:'À Crédit', created_at:'2026-05-05T10:00:00', due_date:'2026-06-04', days_since:17, etat:'Atansyon' },
  { id:'cc3', client_id:'c3', client_name:'Claudette René',  client_phone:null,        invoice_number:'PP-2026-100789', amount:11000, currency:'HTG', payment_status:'À Crédit', created_at:'2026-05-16T10:00:00', due_date:'2026-06-15', days_since:6,  etat:'Nòmal' },
  { id:'cc4', client_id:'c4', client_name:'Robert Alexis',   client_phone:'32001122', invoice_number:'PP-2026-100321', amount:6750,  currency:'HTG', payment_status:'Payé',    created_at:'2026-05-01T10:00:00', due_date:'2026-05-31', days_since:21, etat:'Nòmal' },
];

// ── Sub-components ────────────────────────────────────────────────────────────

function EtatBadge({ etat }: { etat: EtatCritique }) {
  const { t } = useLanguage();
  if (etat === 'Critique') return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/40 bg-red-500/15 px-2.5 py-1 text-xs font-bold text-red-400">
      <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
      {t({ fr: 'Critique', ht: 'Critique' })}
    </span>
  );
  if (etat === 'Atansyon') return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-500/40 bg-orange-500/15 px-2.5 py-1 text-xs font-bold text-orange-400">
      <span className="h-1.5 w-1.5 rounded-full bg-orange-400" />
      {t({ fr: 'Attention', ht: 'Atansyon' })}
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1 text-xs font-bold text-emerald-400">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
      {t({ fr: 'Normal', ht: 'Nòmal' })}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useLanguage();
  const paid = status === 'Payé';
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold
      ${paid ? 'bg-emerald-500/15 text-emerald-400' : 'bg-blue-500/15 text-blue-400'}`}>
      {t({ fr: { 'Payé': 'Payé', 'À Crédit': 'À Crédit' }[status] || status, ht: status })}
    </span>
  );
}

interface RelancerButtonProps {
  phone: string | null;
  message: string;
}
function RelancerButton({ phone, message }: RelancerButtonProps) {
  const { t } = useLanguage();
  const link = waLink(phone, message);
  if (!link) return (
    <span className="text-xs text-slate-300 italic">{t({ fr: 'Pas de #', ht: 'Nan gen #' })}</span>
  );
  return (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/20 transition-colors"
    >
      {/* WhatsApp icon */}
      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
      </svg>
      {t({ fr: 'Relance', ht: 'Relanse' })}
    </a>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, accent, glow, icon }: {
  label: string; value: string; sub?: string;
  accent: string; glow: string; icon: React.ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-white backdrop-blur-xl p-5 flex flex-col gap-2">
      <div className={`absolute -top-5 -right-5 h-20 w-20 rounded-full blur-2xl opacity-25 ${glow}`} />
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-muted)]">{label}</span>
        <span className={`${accent} opacity-70`}>{icon}</span>
      </div>
      <p className={`text-xl font-bold tracking-tight ${accent}`}>{value}</p>
      {sub && <p className="text-xs text-[var(--color-muted)]">{sub}</p>}
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionTitle({ color, label, count }: { color: string; label: string; count: number }) {
  const { t } = useLanguage();
  return (
    <div className="flex items-center gap-3">
      <div className={`h-8 w-1 rounded-full ${color}`} />
      <div>
        <h2 className="font-bold text-[#001F3F] text-lg">{label}</h2>
        <p className="text-xs text-[var(--color-muted)]">{count} {t({ fr: 'entrées', ht: 'antrèman' })}</p>
      </div>
    </div>
  );
}

// ── DettesInner ───────────────────────────────────────────────────────────────

function DettesInner() {
  const { t } = useLanguage();
  const [supplierDebts,  setSupplierDebts]  = useState<SupplierDebt[]>(MOCK_DEBTS);
  const [clientCredits,  setClientCredits]  = useState<ClientCredit[]>(MOCK_CREDITS);
  const [loading,        setLoading]        = useState(true);
  const [isDemo,         setIsDemo]         = useState(false);
  const [userId,         setUserId]         = useState<string | null>(null);

  // ── Filters ─────────────────────────────────────────────────────────────────
  const [debtStatus,     setDebtStatus]     = useState<FilterStatus>('unpaid');
  const [creditStatus,   setCreditStatus]   = useState<FilterStatus>('unpaid');
  const [debtCritOnly,   setDebtCritOnly]   = useState(false);
  const [creditCritOnly, setCreditCritOnly] = useState(false);
  const [debtSearch,     setDebtSearch]     = useState('');
  const [creditSearch,   setCreditSearch]   = useState('');

  // ── Expense debts ──────────────────────────────────────────────────────────────
  const [expenseDebts,   setExpenseDebts]   = useState<ExpenseDebt[]>([]);
  const [expenseStatus,  setExpenseStatus]  = useState<FilterStatus>('unpaid');
  const [expenseCritOnly, setExpenseCritOnly] = useState(false);
  const [expenseSearch,  setExpenseSearch]  = useState('');

  // ── Business context ──────────────────────────────────────────────────────────
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [exchangeRate, setExchangeRate] = useState(130);

  const getBusinessId = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data: biz } = await supabase
      .from('businesses')
      .select('id, exchange_rate')
      .eq('owner_id', user.id)
      .maybeSingle();
    if (biz) {
      setBusinessId(biz.id);
      setExchangeRate(Number(biz.exchange_rate ?? 130));
      return biz.id;
    }
    return null;
  }, []);

  const refreshExchangeRate = useCallback(async () => {
    if (!businessId) return;
    const { data: bizRes } = await supabase
      .from('businesses')
      .select('exchange_rate')
      .eq('id', businessId)
      .maybeSingle();
    if (bizRes?.exchange_rate) setExchangeRate(Number(bizRes.exchange_rate));
  }, [businessId]);

  // Auto-refresh exchange rate every 60s + on tab visibility change
  useEffect(() => {
    refreshExchangeRate();
    const interval = setInterval(refreshExchangeRate, 60_000);
    const onVisible = () => { if (!document.hidden) refreshExchangeRate(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refreshExchangeRate]);

  // ── Action loading states ────────────────────────────────────────────────────
  const [payingId, setPayingId] = useState<string | null>(null);

  // ── Load ─────────────────────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      setUserId(user?.id ?? null);

      const bizId = await getBusinessId();
      if (!bizId) { setLoading(false); return; }

      const today = new Date();

      // ── Supplier debts ──────────────────────────────────────────────────────
      // purchases has: id, supplier_id, purchase_date, total_amount, payment_status
      // product info is in purchase_items
      const [purchRes, suppRes] = await Promise.all([
        supabase
          .from('purchases')
          .select(`
            id, supplier_id, purchase_date, total_amount, payment_status, currency,
            purchase_items ( product_name, quantity )
          `)
          .eq('business_id', bizId)
          .is('deleted_at', null)
          .order('purchase_date', { ascending: false }),
        supabase
          .from('suppliers')
          .select('id,name,phone')
          .eq('business_id', bizId)
          .is('deleted_at', null),
      ]);

      const suppMap = new Map<string, { name: string; phone: string | null }>(
        (suppRes.data ?? []).map((s: any) => [
          s.id as string,
          { name: s.name as string, phone: (s.phone ?? null) as string | null },
        ])
      );

      const debtsData: SupplierDebt[] = (purchRes.data ?? []).map((r: any) => {
        const days  = Math.floor((today.getTime() - new Date(r.purchase_date).getTime()) / 86_400_000);
        // Normalize DB status → display
        const dbStatus = r.payment_status as string;
        const isPaid   = dbStatus === 'paid';
        const displayStatus: 'Payé' | 'À Crédit' = isPaid ? 'Payé' : 'À Crédit';
        const supp     = suppMap.get(r.supplier_id) ?? { name: '—', phone: null };
        const items: any[] = r.purchase_items ?? [];
        const productName = items.map((i: any) => i.product_name).filter(Boolean).join(', ') || '—';
        const qty = items.reduce((s: number, i: any) => s + Number(i.quantity ?? 0), 0);
        return {
          id:             r.id,
          supplier_id:    r.supplier_id,
          supplier_name:  supp.name,
          supplier_phone: supp.phone,
          product_name:   productName,
          quantity:       qty,
          amount:         Number(r.total_amount),
          currency:       r.currency ?? 'HTG',
          purchase_date:  r.purchase_date,
          due_date:       addDays(r.purchase_date, 30),
          days_overdue:   days,
          payment_status: displayStatus,
          etat:           computeEtat(days, isPaid),
        };
      });

      // ── Client credits ─────────────────────────────────────────────────────
      const { data: ccRaw } = await supabase
        .from('sales')
        .select('id,customer_id,customer_name,invoice_number,total_amount,currency,payment_status,created_at')
        .eq('business_id', bizId)
        .eq('payment_status', 'credit')
        .order('created_at', { ascending: false });

      const creditsData: ClientCredit[] = (ccRaw ?? []).map((r: any) => {
        const days = Math.floor((today.getTime() - new Date(r.created_at).getTime()) / 86_400_000);
        return {
          id:             r.id,
          client_id:      r.customer_id ?? null,
          client_name:    r.customer_name ?? '—',
          client_phone:   null,
          invoice_number: r.invoice_number ?? null,
          amount:         Number(r.total_amount),
          currency:       r.currency ?? 'HTG',
          payment_status: 'À Crédit' as const,
          created_at:     r.created_at,
          due_date:       addDays(r.created_at.split('T')[0], 30),
          days_since:     days,
          etat:           computeEtat(days, false),
        };
      });

      // ── Expense debts ─────────────────────────────────────────────────────
      const { data: expRaw } = await supabase
        .from('expenses')
        .select(`id, description, amount, currency, expense_date, expense_categories ( name )`)
        .eq('business_id', bizId)
        .eq('payment_status', 'credit')
        .is('deleted_at', null)
        .order('expense_date', { ascending: false });

      const expensesData: ExpenseDebt[] = (expRaw ?? []).map((r: any) => {
        const days = Math.floor((today.getTime() - new Date(r.expense_date).getTime()) / 86_400_000);
        return {
          id:             r.id,
          description:    r.description ?? '—',
          category:       r.expense_categories?.name ?? '—',
          amount:         Number(r.amount),
          currency:       r.currency ?? 'HTG',
          expense_date:   r.expense_date,
          due_date:       addDays(r.expense_date, 30),
          days_overdue:   days,
          payment_status: 'À Crédit' as const,
          etat:           computeEtat(days, false),
        };
      });

      // Only show demo if all lists are truly empty after successful fetch
      const hasReal = debtsData.length > 0 || creditsData.length > 0 || expensesData.length > 0;
      setIsDemo(!hasReal);
      setSupplierDebts(hasReal ? debtsData : MOCK_DEBTS);
      setClientCredits(hasReal ? creditsData : MOCK_CREDITS);
      setExpenseDebts(expensesData);
    } catch (e: any) {
      console.error('[dettes] loadAll error:', e?.message);
      // Do NOT fall back to demo silently — show empty so user knows
      setIsDemo(false);
      setSupplierDebts([]);
      setClientCredits([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Handlers ─────────────────────────────────────────────────────────────────
  async function handlePayDebt(debtId: string) {
    setPayingId(debtId);
    try {
      await recordDebtPayment({ purchase_id: debtId });
      await loadAll();
    } catch { alert('Erè pandan peman an.'); }
    setPayingId(null);
  }

  async function handlePayCredit(creditId: string) {
    setPayingId(creditId);
    try {
      await markClientCreditPaid(creditId);
      await loadAll();
    } catch { alert('Erè pandan mak kòm peye.'); }
    setPayingId(null);
  }

  async function handlePayExpense(expenseId: string) {
    setPayingId(expenseId);
    try {
      await markExpensePaid(expenseId);
      await loadAll();
    } catch { alert('Erè pandan peman depans.'); }
    setPayingId(null);
  }

  // ── Derived ─────────────────────────────────────────────────────────────────
  const filteredDebts = useMemo(() => {
    let rows = supplierDebts;
    if (debtStatus === 'unpaid') rows = rows.filter(r => r.payment_status === 'À Crédit');
    else if (debtStatus === 'paid') rows = rows.filter(r => r.payment_status === 'Payé');
    if (debtCritOnly) rows = rows.filter(r => r.etat === 'Critique');
    if (debtSearch)   rows = rows.filter(r => r.supplier_name.toLowerCase().includes(debtSearch.toLowerCase()) || r.product_name.toLowerCase().includes(debtSearch.toLowerCase()));
    return rows;
  }, [supplierDebts, debtStatus, debtCritOnly, debtSearch]);

  const filteredExpenses = useMemo(() => {
    let rows = expenseDebts;
    if (expenseStatus === 'unpaid') rows = rows.filter(r => r.payment_status === 'À Crédit');
    else if (expenseStatus === 'paid') rows = rows.filter(r => r.payment_status === 'Payé');
    if (expenseCritOnly) rows = rows.filter(r => r.etat === 'Critique');
    if (expenseSearch)   rows = rows.filter(r => r.description.toLowerCase().includes(expenseSearch.toLowerCase()) || r.category.toLowerCase().includes(expenseSearch.toLowerCase()));
    return rows;
  }, [expenseDebts, expenseStatus, expenseCritOnly, expenseSearch]);

  const filteredCredits = useMemo(() => {
    let rows = clientCredits;
    if (creditStatus === 'unpaid') rows = rows.filter(r => r.payment_status === 'À Crédit');
    else if (creditStatus === 'paid') rows = rows.filter(r => r.payment_status === 'Payé');
    if (creditCritOnly) rows = rows.filter(r => r.etat === 'Critique');
    if (creditSearch)   rows = rows.filter(r => r.client_name.toLowerCase().includes(creditSearch.toLowerCase()) || (r.invoice_number ?? '').toLowerCase().includes(creditSearch.toLowerCase()));
    return rows;
  }, [clientCredits, creditStatus, creditCritOnly, creditSearch]);

  // Summary numbers (all converted to HTG for the top stat cards)
  const toHtg = (amt: number, cur: string) => (cur === 'USD' ? amt * exchangeRate : amt);
  const totalDebtUnpaid    = useMemo(() => supplierDebts.filter(d => d.payment_status === 'À Crédit').reduce((s, d) => s + toHtg(d.amount, d.currency), 0), [supplierDebts, exchangeRate]);
  const totalCreditUnpaid  = useMemo(() => clientCredits.filter(c => c.payment_status === 'À Crédit').reduce((s, c) => s + toHtg(c.amount, c.currency), 0), [clientCredits, exchangeRate]);
  const totalExpenseUnpaid = useMemo(() => expenseDebts.filter(e => e.payment_status === 'À Crédit').reduce((s, e) => s + toHtg(e.amount, e.currency), 0), [expenseDebts, exchangeRate]);
  const critDebts   = useMemo(() => supplierDebts.filter(d => d.etat === 'Critique' && d.payment_status === 'À Crédit').length, [supplierDebts]);
  const critCredits = useMemo(() => clientCredits.filter(c => c.etat === 'Critique' && c.payment_status === 'À Crédit').length, [clientCredits]);
  const critExpenses = useMemo(() => expenseDebts.filter(e => e.etat === 'Critique' && e.payment_status === 'À Crédit').length, [expenseDebts]);

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
      <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 lg:px-8 space-y-8">

        {/* ── Header ──────────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orange-400/80">ProfitPilot</p>
            <h1 className="mt-1 text-2xl font-bold md:text-3xl">{t({ fr: 'Gestion Crédit Actif', ht: 'Jesyon Kredi Aktif' })}</h1>
            <p className="text-sm text-[var(--color-muted)] mt-0.5">{t({ fr: 'Dettes Fournisseurs · Créances Clients', ht: 'Dèt Founisè · Kreyans Kliyan' })}</p>
          </div>
          {isDemo && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-400">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
              {t({ fr: 'Données démo', ht: 'Done demo' })}
            </span>
          )}
        </div>

        {/* ── Stat Cards ──────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <StatCard label={t({ fr: 'Dettes Fournisseurs', ht: 'Dèt Founisè' })} value={fmtAmt(totalDebtUnpaid)}
            accent="text-orange-400" glow="bg-orange-500"
            icon={<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"/></svg>}
          />
          <StatCard label={t({ fr: 'Créances Clients', ht: 'Kreyans Kliyan' })} value={fmtAmt(totalCreditUnpaid)}
            accent="text-blue-400" glow="bg-blue-500"
            icon={<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>}
          />
          <StatCard label={t({ fr: 'Dépenses Dues', ht: 'Depans Dite' })} value={fmtAmt(totalExpenseUnpaid)}
            accent="text-violet-400" glow="bg-violet-500"
            icon={<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg>}
          />
          <StatCard label={t({ fr: 'Dettes Critiques', ht: 'Dèt Critique' })} value={`${critDebts + critExpenses} ${t({ fr: 'impayés', ht: 'san peye' })}`}
            sub={critDebts + critExpenses > 0 ? t({ fr: '+30 jours sans paiement', ht: '+30 jou san peman' }) : t({ fr: 'Tout en règle', ht: 'Tout an règ' })}
            accent="text-red-400" glow="bg-red-500"
            icon={<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>}
          />
          <StatCard label={t({ fr: 'Créances Critiques', ht: 'Kreyans Critique' })} value={`${critCredits} ${t({ fr: 'clients', ht: 'kliyan' })}`}
            sub={critCredits > 0 ? t({ fr: '+30 jours sans paiement', ht: '+30 jou san peman' }) : t({ fr: 'Tout en règle', ht: 'Tout an règ' })}
            accent="text-red-400" glow="bg-red-500"
            icon={<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>}
          />
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            SECTION 1 — Dèt Founisè
        ════════════════════════════════════════════════════════════════════ */}
        <div className="rounded-2xl border border-[var(--color-border)] bg-white backdrop-blur-xl overflow-hidden">

          {/* Section header */}
          <div className="flex flex-col gap-3 border-b border-[var(--color-border)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <SectionTitle color="bg-orange-500" label={t({ fr: 'Dettes Fournisseurs', ht: 'Dèt Founisè' })} count={filteredDebts.length} />

            {/* Controls */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Search */}
              <div className="relative">
                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--color-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                </svg>
                <input
                  type="text" placeholder={t({ fr: 'Recherche…', ht: 'Rechèch…' })} value={debtSearch}
                  onChange={e => setDebtSearch(e.target.value)}
                  className="w-40 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-400 outline-none focus:border-orange-500/60 transition"
                />
              </div>
              {/* Status pills */}
              {(['all','unpaid','paid'] as FilterStatus[]).map(s => (
                <button key={s} onClick={() => setDebtStatus(s)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition
                    ${debtStatus === s ? 'bg-orange-600 text-white' : 'bg-[var(--color-surface)] text-[var(--color-muted)] hover:text-[#001F3F] hover:bg-slate-100'}`}>
                  {s === 'all' ? 'Tout' : s === 'unpaid' ? 'À Crédit' : 'Payé'}
                </button>
              ))}
              {/* Smart filter */}
              <button
                onClick={() => setDebtCritOnly(p => !p)}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition
                  ${debtCritOnly
                    ? 'bg-red-500/25 text-red-300 border border-red-500/50'
                    : 'bg-[var(--color-surface)] text-[var(--color-muted)] border border-[var(--color-border)] hover:text-red-300 hover:bg-red-500/10 hover:border-red-500/30'}`}>
                <span className={`h-1.5 w-1.5 rounded-full bg-red-400 ${debtCritOnly ? 'animate-pulse' : ''}`} />
                {t({ fr: 'Critique seulement', ht: 'Critique sèlman' })}
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[680px]">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  {(['Founisè', 'Pwodui', 'Dat Ref.', 'Dat Échéance', 'Montan Rete', 'État', 'Relanse', 'Aksyon'] as const).map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)] whitespace-nowrap">
                      {t({ fr: { Founisè: 'Fournisseur', Pwodui: 'Produit', 'Dat Ref.': 'Date Réf.', 'Dat Échéance': 'Date Échéance', 'Montan Rete': 'Montant Restant', 'État': 'État', Relanse: 'Relance', Aksyon: 'Action' }[h] || h, ht: h })}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [...Array(4)].map((_, i) => (
                    <tr key={i} className="border-b border-[var(--color-border)]">
                      {[...Array(8)].map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-3 rounded bg-[var(--color-surface)] animate-pulse" style={{ width: `${35 + Math.random() * 50}%` }} />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : filteredDebts.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-[var(--color-muted)] text-sm">
                      {t({ fr: 'Aucune dette pour ce filtre.', ht: 'Pa gen dèt pou filtè sa a.' })}
                    </td>
                  </tr>
                ) : filteredDebts.map((debt, i) => {
                  const waMsg = `Bonjou ${debt.supplier_name}, nou ta renmen raple ou ke gen yon peman annatant depi ${debt.days_overdue} jou. Montan: ${fmtAmt(debt.amount)}. Mèsi pou kolaborasyon ou.`;
                  return (
                    <tr key={debt.id}
                      className={`border-b border-[var(--color-border)] transition-colors group
                        ${debt.etat === 'Critique' && debt.payment_status === 'À Crédit' ? 'bg-red-50' : ''}
                        ${i % 2 === 0 ? '' : 'bg-[var(--color-surface)]'}
                        hover:bg-slate-50`}>
                      {/* Founisè */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-orange-500/15 text-xs font-bold text-orange-400">
                            {debt.supplier_name.charAt(0).toUpperCase()}
                          </div>
                          <span className="font-medium text-[var(--color-text)] text-sm">{debt.supplier_name}</span>
                        </div>
                      </td>
                      {/* Pwodui */}
                      <td className="px-4 py-3 text-[var(--color-muted)] text-xs max-w-[140px] truncate" title={debt.product_name}>
                        {debt.product_name} <span className="text-[var(--color-muted)]">×{debt.quantity}</span>
                      </td>
                      {/* Dat ref */}
                      <td className="px-4 py-3 whitespace-nowrap text-[var(--color-muted)] text-xs font-mono">
                        {fmtDate(debt.purchase_date)}
                      </td>
                      {/* Dat échéance */}
                      <td className="px-4 py-3 whitespace-nowrap text-xs">
                        <span className={debt.etat === 'Critique' ? 'text-red-400 font-semibold' : debt.etat === 'Atansyon' ? 'text-orange-400' : 'text-[var(--color-muted)]'}>
                          {fmtDate(debt.due_date)}
                        </span>
                        {debt.payment_status === 'À Crédit' && (
                          <span className="ml-1.5 text-[var(--color-muted)]">({debt.days_overdue}j)</span>
                        )}
                      </td>
                      {/* Montan */}
                      <td className={`px-4 py-3 whitespace-nowrap font-bold tabular-nums
                        ${debt.payment_status === 'Payé' ? 'text-emerald-400' : 'text-[var(--color-text)]'}`}>
                        {fmtAmt(debt.amount)}
                      </td>
                      {/* État */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {debt.payment_status === 'Payé'
                          ? <StatusBadge status="Payé" />
                          : <EtatBadge etat={debt.etat} />}
                      </td>
                      {/* Relanse */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {debt.payment_status === 'À Crédit'
                          ? <RelancerButton phone={debt.supplier_phone} message={waMsg} />
                          : <span className="text-xs text-slate-300">—</span>}
                      </td>
                      {/* Aksyon */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {debt.payment_status === 'À Crédit' ? (
                          <button
                            onClick={() => handlePayDebt(debt.id)}
                            disabled={payingId === debt.id}
                            className="rounded-lg bg-emerald-600/80 hover:bg-emerald-600 disabled:opacity-50 px-3 py-1.5 text-xs font-semibold text-white transition">
                            {payingId === debt.id ? '…' : t({ fr: 'Payer', ht: 'Peye' })}
                          </button>
                        ) : (
                          <span className="text-xs text-emerald-400">{t({ fr: '✓ Payé', ht: '✓ Peye' })}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Section footer */}
          <div className="border-t border-[var(--color-border)] px-5 py-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-[var(--color-muted)]">
            <span>{t({ fr: 'Total en attente:', ht: 'Total annatant:' })} <span className="text-orange-400 font-semibold">{fmtAmt(totalDebtUnpaid)}</span></span>
            <span>{t({ fr: 'Critique:', ht: 'Critique:' })} <span className="text-red-400 font-semibold">{critDebts}</span></span>
            <span>{t({ fr: 'Attention:', ht: 'Atansyon:' })} <span className="text-orange-400 font-semibold">{supplierDebts.filter(d => d.etat === 'Atansyon' && d.payment_status === 'À Crédit').length}</span></span>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            SECTION 2 — Dépenses Dues
        ════════════════════════════════════════════════════════════════════ */}
        <div className="rounded-2xl border border-[var(--color-border)] bg-white backdrop-blur-xl overflow-hidden">

          {/* Section header */}
          <div className="flex flex-col gap-3 border-b border-[var(--color-border)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <SectionTitle color="bg-violet-500" label={t({ fr: 'Dépenses Dues', ht: 'Depans Dite' })} count={filteredExpenses.length} />

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--color-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                </svg>
                <input
                  type="text" placeholder={t({ fr: 'Recherche…', ht: 'Rechèch…' })} value={expenseSearch}
                  onChange={e => setExpenseSearch(e.target.value)}
                  className="w-40 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-400 outline-none focus:border-violet-500/60 transition"
                />
              </div>
              {(['all','unpaid','paid'] as FilterStatus[]).map(s => (
                <button key={s} onClick={() => setExpenseStatus(s)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition
                    ${expenseStatus === s ? 'bg-violet-600 text-white' : 'bg-[var(--color-surface)] text-[var(--color-muted)] hover:text-[#001F3F] hover:bg-slate-100'}`}>
                  {s === 'all' ? 'Tout' : s === 'unpaid' ? 'À Crédit' : 'Payé'}
                </button>
              ))}
              <button
                onClick={() => setExpenseCritOnly(p => !p)}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition
                  ${expenseCritOnly
                    ? 'bg-red-500/25 text-red-300 border border-red-500/50'
                    : 'bg-[var(--color-surface)] text-[var(--color-muted)] border border-[var(--color-border)] hover:text-red-300 hover:bg-red-500/10 hover:border-red-500/30'}`}>
                <span className={`h-1.5 w-1.5 rounded-full bg-red-400 ${expenseCritOnly ? 'animate-pulse' : ''}`} />
                {t({ fr: 'Critique seulement', ht: 'Critique sèlman' })}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[680px]">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  {(['Deskripsyon', 'Kategori', 'Dat Depans', 'Dat Échéance', 'Montan Rete', 'État', 'Aksyon'] as const).map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)] whitespace-nowrap">
                      {t({ fr: { Deskripsyon: 'Description', Kategori: 'Catégorie', 'Dat Depans': 'Date Dépense', 'Dat Échéance': 'Date Échéance', 'Montan Rete': 'Montant Restant', 'État': 'État', Aksyon: 'Action' }[h] || h, ht: h })}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [...Array(4)].map((_, i) => (
                    <tr key={i} className="border-b border-[var(--color-border)]">
                      {[...Array(7)].map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-3 rounded bg-[var(--color-surface)] animate-pulse" style={{ width: `${35 + Math.random() * 50}%` }} />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : filteredExpenses.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-[var(--color-muted)] text-sm">
                      {t({ fr: 'Aucune dépense due pour ce filtre.', ht: 'Pa gen depans dite pou filtè sa a.' })}
                    </td>
                  </tr>
                ) : filteredExpenses.map((exp, i) => (
                  <tr key={exp.id}
                    className={`border-b border-[var(--color-border)] transition-colors group
                      ${exp.etat === 'Critique' && exp.payment_status === 'À Crédit' ? 'bg-red-50' : ''}
                      ${i % 2 === 0 ? '' : 'bg-[var(--color-surface)]'}
                      hover:bg-slate-50`}>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-500/15 text-xs font-bold text-violet-400">
                          {exp.description.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium text-[var(--color-text)] text-sm max-w-[200px] truncate" title={exp.description}>{exp.description}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[var(--color-muted)] text-xs">{exp.category}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-[var(--color-muted)] text-xs font-mono">{fmtDate(exp.expense_date)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs">
                      <span className={exp.etat === 'Critique' ? 'text-red-400 font-semibold' : exp.etat === 'Atansyon' ? 'text-orange-400' : 'text-[var(--color-muted)]'}>
                        {fmtDate(exp.due_date)}
                      </span>
                      {exp.payment_status === 'À Crédit' && (
                        <span className="ml-1.5 text-[var(--color-muted)]">({exp.days_overdue}j)</span>
                      )}
                    </td>
                    <td className={`px-4 py-3 whitespace-nowrap font-bold tabular-nums
                      ${exp.payment_status === 'Payé' ? 'text-emerald-400' : 'text-[var(--color-text)]'}`}>
                      {fmtAmt(exp.amount, exp.currency)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {exp.payment_status === 'Payé'
                        ? <StatusBadge status="Payé" />
                        : <EtatBadge etat={exp.etat} />}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {exp.payment_status === 'À Crédit' ? (
                        <button
                          onClick={() => handlePayExpense(exp.id)}
                          disabled={payingId === exp.id}
                          className="rounded-lg bg-violet-600/80 hover:bg-violet-600 disabled:opacity-50 px-3 py-1.5 text-xs font-semibold text-white transition">
                          {payingId === exp.id ? '…' : t({ fr: 'Payer', ht: 'Peye' })}
                        </button>
                      ) : (
                        <span className="text-xs text-emerald-400">{t({ fr: '✓ Payé', ht: '✓ Peye' })}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="border-t border-[var(--color-border)] px-5 py-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-[var(--color-muted)]">
            <span>{t({ fr: 'Total en attente:', ht: 'Total annatant:' })} <span className="text-violet-400 font-semibold">{fmtAmt(totalExpenseUnpaid)}</span></span>
            <span>{t({ fr: 'Critique:', ht: 'Critique:' })} <span className="text-red-400 font-semibold">{critExpenses}</span></span>
            <span>{t({ fr: 'Attention:', ht: 'Atansyon:' })} <span className="text-orange-400 font-semibold">{expenseDebts.filter(e => e.etat === 'Atansyon' && e.payment_status === 'À Crédit').length}</span></span>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            SECTION 3 — Kreyans Kliyan
        ════════════════════════════════════════════════════════════════════ */}
        <div className="rounded-2xl border border-[var(--color-border)] bg-white backdrop-blur-xl overflow-hidden">

          {/* Section header */}
          <div className="flex flex-col gap-3 border-b border-[var(--color-border)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <SectionTitle color="bg-blue-500" label={t({ fr: 'Créances Clients', ht: 'Kreyans Kliyan' })} count={filteredCredits.length} />

            <div className="flex flex-wrap items-center gap-2">
              {/* Search */}
              <div className="relative">
                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--color-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                </svg>
                <input
                  type="text" placeholder={t({ fr: 'Recherche…', ht: 'Rechèch…' })} value={creditSearch}
                  onChange={e => setCreditSearch(e.target.value)}
                  className="w-40 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-400 outline-none focus:border-blue-500/60 transition"
                />
              </div>
              {(['all','unpaid','paid'] as FilterStatus[]).map(s => (
                <button key={s} onClick={() => setCreditStatus(s)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition
                    ${creditStatus === s ? 'bg-blue-600 text-white' : 'bg-[var(--color-surface)] text-[var(--color-muted)] hover:text-[#001F3F] hover:bg-slate-100'}`}>
                  {s === 'all' ? t({ fr: 'Tout', ht: 'Tout' }) : s === 'unpaid' ? t({ fr: 'À Crédit', ht: 'À Crédit' }) : t({ fr: 'Payé', ht: 'Payé' })}
                </button>
              ))}
              {/* Smart filter */}
              <button
                onClick={() => setCreditCritOnly(p => !p)}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition
                  ${creditCritOnly
                    ? 'bg-red-500/25 text-red-300 border border-red-500/50'
                    : 'bg-[var(--color-surface)] text-[var(--color-muted)] border border-[var(--color-border)] hover:text-red-300 hover:bg-red-500/10 hover:border-red-500/30'}`}>
                <span className={`h-1.5 w-1.5 rounded-full bg-red-400 ${creditCritOnly ? 'animate-pulse' : ''}`} />
                {t({ fr: 'Critique seulement', ht: 'Critique sèlman' })}
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[680px]">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  {(['Kliyan', 'Fakti #', 'Dat Kredi', 'Dat Échéance', 'Montan Rete', 'État', 'Relanse', 'Aksyon'] as const).map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)] whitespace-nowrap">
                      {t({ fr: { Kliyan: 'Client', 'Fakti #': 'Facture #', 'Dat Kredi': 'Date Crédit', 'Dat Échéance': 'Date Échéance', 'Montan Rete': 'Montant Restant', 'État': 'État', Relanse: 'Relance', Aksyon: 'Action' }[h] || h, ht: h })}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [...Array(4)].map((_, i) => (
                    <tr key={i} className="border-b border-[var(--color-border)]">
                      {[...Array(8)].map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-3 rounded bg-[var(--color-surface)] animate-pulse" style={{ width: `${35 + Math.random() * 50}%` }} />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : filteredCredits.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-[var(--color-muted)] text-sm">
                      {t({ fr: 'Aucune créance pour ce filtre.', ht: 'Pa gen kreyans pou filtè sa a.' })}
                    </td>
                  </tr>
                ) : filteredCredits.map((cc, i) => {
                  const waMsg = `Bonjou ${cc.client_name}, nou ta renmen raple ou ke ou gen yon balans annatant${cc.invoice_number ? ` (Fakti #${cc.invoice_number})` : ''}: ${fmtAmt(cc.amount, cc.currency)}. Mèsi pou peman ou a.`;
                  return (
                    <tr key={cc.id}
                      className={`border-b border-[var(--color-border)] transition-colors group
                        ${cc.etat === 'Critique' && cc.payment_status === 'À Crédit' ? 'bg-red-50' : ''}
                        ${i % 2 === 0 ? '' : 'bg-[var(--color-surface)]'}
                        hover:bg-slate-50`}>
                      {/* Kliyan */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-500/15 text-xs font-bold text-blue-400">
                            {cc.client_name.charAt(0).toUpperCase()}
                          </div>
                          <Link
                            href={cc.client_id ? `/clients?highlight=${cc.client_id}` : '/clients'}
                            className="font-medium text-[var(--color-text)] text-sm hover:text-blue-500 hover:underline transition-colors"
                          >
                            {cc.client_name}
                          </Link>
                        </div>
                      </td>
                      {/* Invoice */}
                      <td className="px-4 py-3 font-mono text-xs text-[var(--color-muted)] whitespace-nowrap">
                        {cc.invoice_number ? cc.invoice_number.slice(-8) : '—'}
                      </td>
                      {/* Dat kredi */}
                      <td className="px-4 py-3 whitespace-nowrap text-[var(--color-muted)] text-xs font-mono">
                        {fmtDate(cc.created_at)}
                      </td>
                      {/* Dat échéance */}
                      <td className="px-4 py-3 whitespace-nowrap text-xs">
                        <span className={cc.etat === 'Critique' ? 'text-red-400 font-semibold' : cc.etat === 'Atansyon' ? 'text-orange-400' : 'text-[var(--color-muted)]'}>
                          {fmtDate(cc.due_date)}
                        </span>
                        {cc.payment_status === 'À Crédit' && (
                          <span className="ml-1.5 text-[var(--color-muted)]">({cc.days_since}j)</span>
                        )}
                      </td>
                      {/* Montan */}
                      <td className={`px-4 py-3 whitespace-nowrap font-bold tabular-nums
                        ${cc.payment_status === 'Payé' ? 'text-emerald-400' : 'text-[var(--color-text)]'}`}>
                        {fmtAmt(cc.amount, cc.currency)}
                      </td>
                      {/* État */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {cc.payment_status === 'Payé'
                          ? <StatusBadge status="Payé" />
                          : <EtatBadge etat={cc.etat} />}
                      </td>
                      {/* Relanse */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {cc.payment_status === 'À Crédit'
                          ? <RelancerButton phone={cc.client_phone} message={waMsg} />
                          : <span className="text-xs text-slate-300">—</span>}
                      </td>
                      {/* Aksyon */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {cc.payment_status === 'À Crédit' ? (
                          <button
                            onClick={() => handlePayCredit(cc.id)}
                            disabled={payingId === cc.id}
                            className="rounded-lg bg-blue-600/80 hover:bg-blue-600 disabled:opacity-50 px-3 py-1.5 text-xs font-semibold text-white transition">
                            {payingId === cc.id ? '…' : t({ fr: 'Encaisser', ht: 'Touche' })}
                          </button>
                        ) : (
                          <span className="text-xs text-emerald-400">{t({ fr: '✓ Encaissé', ht: '✓ Touche' })}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Section footer */}
          <div className="border-t border-[var(--color-border)] px-5 py-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-[var(--color-muted)]">
            <span>{t({ fr: 'Total en attente:', ht: 'Total annatant:' })} <span className="text-blue-400 font-semibold">{fmtAmt(totalCreditUnpaid)}</span></span>
            <span>{t({ fr: 'Critique:', ht: 'Critique:' })} <span className="text-red-400 font-semibold">{critCredits}</span></span>
            <span>{t({ fr: 'Attention:', ht: 'Atansyon:' })} <span className="text-orange-400 font-semibold">{clientCredits.filter(c => c.etat === 'Atansyon' && c.payment_status === 'À Crédit').length}</span></span>
          </div>
        </div>

      </div>
    </div>
  );
}

// ── Page export ───────────────────────────────────────────────────────────────

export default function DettesPage() {
  return (
    <ProtectedRoute>
      <DettesInner />
    </ProtectedRoute>
  );
}
