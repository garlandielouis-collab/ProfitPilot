'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import { recordDebtPayment } from '../actions/debts';
import { markClientCreditPaid } from '../actions/clients';

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
  { id:'sd1', supplier_id:'s1', supplier_name:'Distribisyon ABC',   supplier_phone:'47123456', product_name:'Riz 50kg', quantity:10, amount:55000, purchase_date:'2026-04-10', due_date:'2026-05-10', days_overdue:42, payment_status:'À Crédit', etat:'Critique' },
  { id:'sd2', supplier_id:'s2', supplier_name:'Boutik Santé Plus',  supplier_phone:'36987654', product_name:'Savon Detèjan', quantity:50, amount:18000, purchase_date:'2026-05-01', due_date:'2026-05-31', days_overdue:21, payment_status:'À Crédit', etat:'Atansyon' },
  { id:'sd3', supplier_id:'s3', supplier_name:'Agri Depou Nò',      supplier_phone:null,       product_name:'Maïs Moulu', quantity:20, amount:12000, purchase_date:'2026-05-15', due_date:'2026-06-14', days_overdue:7,  payment_status:'À Crédit', etat:'Nòmal' },
  { id:'sd4', supplier_id:'s1', supplier_name:'Distribisyon ABC',   supplier_phone:'47123456', product_name:'Farin Blé', quantity:15, amount:22500, purchase_date:'2026-04-05', due_date:'2026-05-05', days_overdue:47, payment_status:'Payé',    etat:'Nòmal' },
];

const MOCK_CREDITS: ClientCredit[] = [
  { id:'cc1', client_id:'c1', client_name:'Marie Joseph',    client_phone:'34561234', invoice_number:'PP-2026-100123', amount:8500,  currency:'HTG', payment_status:'À Crédit', created_at:'2026-04-08T10:00:00', due_date:'2026-05-08', days_since:44, etat:'Critique' },
  { id:'cc2', client_id:'c2', client_name:'Jean Pierre',     client_phone:'47009988', invoice_number:'PP-2026-100456', amount:4200,  currency:'HTG', payment_status:'À Crédit', created_at:'2026-05-05T10:00:00', due_date:'2026-06-04', days_since:17, etat:'Atansyon' },
  { id:'cc3', client_id:'c3', client_name:'Claudette René',  client_phone:null,        invoice_number:'PP-2026-100789', amount:11000, currency:'HTG', payment_status:'À Crédit', created_at:'2026-05-16T10:00:00', due_date:'2026-06-15', days_since:6,  etat:'Nòmal' },
  { id:'cc4', client_id:'c4', client_name:'Robert Alexis',   client_phone:'32001122', invoice_number:'PP-2026-100321', amount:6750,  currency:'HTG', payment_status:'Payé',    created_at:'2026-05-01T10:00:00', due_date:'2026-05-31', days_since:21, etat:'Nòmal' },
];

// ── Sub-components ────────────────────────────────────────────────────────────

function EtatBadge({ etat }: { etat: EtatCritique }) {
  if (etat === 'Critique') return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/40 bg-red-500/15 px-2.5 py-1 text-xs font-bold text-red-400">
      <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
      Critique
    </span>
  );
  if (etat === 'Atansyon') return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-500/40 bg-orange-500/15 px-2.5 py-1 text-xs font-bold text-orange-400">
      <span className="h-1.5 w-1.5 rounded-full bg-orange-400" />
      Atansyon
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1 text-xs font-bold text-emerald-400">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
      Nòmal
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const paid = status === 'Payé';
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold
      ${paid ? 'bg-emerald-500/15 text-emerald-400' : 'bg-blue-500/15 text-blue-400'}`}>
      {status}
    </span>
  );
}

interface RelancerButtonProps {
  phone: string | null;
  message: string;
}
function RelancerButton({ phone, message }: RelancerButtonProps) {
  const link = waLink(phone, message);
  if (!link) return (
    <span className="text-xs text-white/20 italic">Nan gen #</span>
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
      Relanse
    </a>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, accent, glow, icon }: {
  label: string; value: string; sub?: string;
  accent: string; glow: string; icon: React.ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-900/50 backdrop-blur-xl p-5 flex flex-col gap-2">
      <div className={`absolute -top-5 -right-5 h-20 w-20 rounded-full blur-2xl opacity-25 ${glow}`} />
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-white/40">{label}</span>
        <span className={`${accent} opacity-70`}>{icon}</span>
      </div>
      <p className={`text-xl font-bold tracking-tight ${accent}`}>{value}</p>
      {sub && <p className="text-xs text-white/30">{sub}</p>}
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionTitle({ color, label, count }: { color: string; label: string; count: number }) {
  return (
    <div className="flex items-center gap-3">
      <div className={`h-8 w-1 rounded-full ${color}`} />
      <div>
        <h2 className="font-bold text-white text-lg">{label}</h2>
        <p className="text-xs text-white/30">{count} antrèman</p>
      </div>
    </div>
  );
}

// ── DettesInner ───────────────────────────────────────────────────────────────

function DettesInner() {
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

  // ── Action loading states ────────────────────────────────────────────────────
  const [payingId, setPayingId] = useState<string | null>(null);

  // ── Load ─────────────────────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      setUserId(user?.id ?? null);

      const today = new Date();

      // ── Supplier debts ──────────────────────────────────────────────────────
      const [purchRes, suppRes, prodRes] = await Promise.all([
        supabase.from('purchases')
          .select('id,supplier_id,product_id,quantity,total_purchase_amount,purchase_date,payment_status')
          .order('purchase_date', { ascending: false }),
        supabase.from('suppliers').select('id,name,phone'),
        supabase.from('products').select('id,name'),
      ]);

      const suppMap = new Map<string, { name: string; phone: string | null }>(
        (suppRes.data ?? []).map((s: any) => [s.id as string, { name: s.name as string, phone: (s.phone ?? null) as string | null }])
      );
      const prodMap = new Map<string, string>((prodRes.data ?? []).map((p: any) => [p.id as string, p.name as string]));

      const debtsData: SupplierDebt[] = (purchRes.data ?? []).map((r: any) => {
        const days    = Math.floor((today.getTime() - new Date(r.purchase_date).getTime()) / 86_400_000);
        const paid    = r.payment_status === 'Payé';
        const supp    = suppMap.get(r.supplier_id) ?? { name: '—', phone: null };
        return {
          id: r.id,
          supplier_id: r.supplier_id,
          supplier_name: supp.name,
          supplier_phone: supp.phone,
          product_name: prodMap.get(r.product_id) ?? '—',
          quantity: Number(r.quantity),
          amount: Number(r.total_purchase_amount),
          purchase_date: r.purchase_date,
          due_date: addDays(r.purchase_date, 30),
          days_overdue: days,
          payment_status: r.payment_status,
          etat: computeEtat(days, paid),
        };
      });

      // ── Client credits ───────────────────────────────────────────────────────
      const { data: ccRaw } = await supabase
        .from('client_credits')
        .select('id,client_id,client_name,invoice_number,amount,currency,payment_status,created_at')
        .order('created_at', { ascending: false });

      // Fetch client phones for those with client_id
      const clientIds = [...new Set((ccRaw ?? []).filter((r: any) => r.client_id).map((r: any) => r.client_id))];
      let clientPhoneMap = new Map<string, string | null>();
      if (clientIds.length > 0) {
        const { data: cliData } = await supabase
          .from('clients')
          .select('id,phone')
          .in('id', clientIds);
        clientPhoneMap = new Map((cliData ?? []).map((c: any) => [c.id, c.phone ?? null]));
      }

      const creditsData: ClientCredit[] = (ccRaw ?? []).map((r: any) => {
        const days = Math.floor((today.getTime() - new Date(r.created_at).getTime()) / 86_400_000);
        const paid = r.payment_status === 'Payé';
        return {
          id: r.id,
          client_id: r.client_id ?? null,
          client_name: r.client_name,
          client_phone: r.client_id ? (clientPhoneMap.get(r.client_id) ?? null) : null,
          invoice_number: r.invoice_number ?? null,
          amount: Number(r.amount),
          currency: r.currency ?? 'HTG',
          payment_status: r.payment_status,
          created_at: r.created_at,
          due_date: addDays(r.created_at.split('T')[0], 30),
          days_since: days,
          etat: computeEtat(days, paid),
        };
      });

      // ── Demo fallback ────────────────────────────────────────────────────────
      if (debtsData.length === 0 && creditsData.length === 0) {
        setIsDemo(true);
        setSupplierDebts(MOCK_DEBTS);
        setClientCredits(MOCK_CREDITS);
      } else {
        setIsDemo(false);
        setSupplierDebts(debtsData);
        setClientCredits(creditsData);
      }
    } catch {
      setIsDemo(true);
      setSupplierDebts(MOCK_DEBTS);
      setClientCredits(MOCK_CREDITS);
    }
    setLoading(false);
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

  // ── Derived ─────────────────────────────────────────────────────────────────
  const filteredDebts = useMemo(() => {
    let rows = supplierDebts;
    if (debtStatus === 'unpaid') rows = rows.filter(r => r.payment_status === 'À Crédit');
    else if (debtStatus === 'paid') rows = rows.filter(r => r.payment_status === 'Payé');
    if (debtCritOnly) rows = rows.filter(r => r.etat === 'Critique');
    if (debtSearch)   rows = rows.filter(r => r.supplier_name.toLowerCase().includes(debtSearch.toLowerCase()) || r.product_name.toLowerCase().includes(debtSearch.toLowerCase()));
    return rows;
  }, [supplierDebts, debtStatus, debtCritOnly, debtSearch]);

  const filteredCredits = useMemo(() => {
    let rows = clientCredits;
    if (creditStatus === 'unpaid') rows = rows.filter(r => r.payment_status === 'À Crédit');
    else if (creditStatus === 'paid') rows = rows.filter(r => r.payment_status === 'Payé');
    if (creditCritOnly) rows = rows.filter(r => r.etat === 'Critique');
    if (creditSearch)   rows = rows.filter(r => r.client_name.toLowerCase().includes(creditSearch.toLowerCase()) || (r.invoice_number ?? '').toLowerCase().includes(creditSearch.toLowerCase()));
    return rows;
  }, [clientCredits, creditStatus, creditCritOnly, creditSearch]);

  // Summary numbers
  const totalDebtUnpaid   = useMemo(() => supplierDebts.filter(d => d.payment_status === 'À Crédit').reduce((s, d) => s + d.amount, 0), [supplierDebts]);
  const totalCreditUnpaid = useMemo(() => clientCredits.filter(c => c.payment_status === 'À Crédit').reduce((s, c) => s + c.amount, 0), [clientCredits]);
  const critDebts   = useMemo(() => supplierDebts.filter(d => d.etat === 'Critique' && d.payment_status === 'À Crédit').length, [supplierDebts]);
  const critCredits = useMemo(() => clientCredits.filter(c => c.etat === 'Critique' && c.payment_status === 'À Crédit').length, [clientCredits]);

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0B0F19] text-white">
      <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 lg:px-8 space-y-8">

        {/* ── Header ──────────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orange-400/80">ProfitPilot</p>
            <h1 className="mt-1 text-2xl font-bold md:text-3xl">Jesyon Kredi Aktif</h1>
            <p className="text-sm text-white/40 mt-0.5">Dèt Founisè · Kreyans Kliyan</p>
          </div>
          {isDemo && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-400">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
              Données démo
            </span>
          )}
        </div>

        {/* ── Stat Cards ──────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Dèt Founisè" value={fmtAmt(totalDebtUnpaid)}
            accent="text-orange-400" glow="bg-orange-500"
            icon={<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"/></svg>}
          />
          <StatCard label="Kreyans Kliyan" value={fmtAmt(totalCreditUnpaid)}
            accent="text-blue-400" glow="bg-blue-500"
            icon={<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>}
          />
          <StatCard label="Dèt Critique" value={`${critDebts} dèt`}
            sub={critDebts > 0 ? '+30 jou san peman' : 'Tout an règ'}
            accent="text-red-400" glow="bg-red-500"
            icon={<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>}
          />
          <StatCard label="Kreyans Critique" value={`${critCredits} kliyan`}
            sub={critCredits > 0 ? '+30 jou san peman' : 'Tout an règ'}
            accent="text-red-400" glow="bg-red-500"
            icon={<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>}
          />
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            SECTION 1 — Dèt Founisè
        ════════════════════════════════════════════════════════════════════ */}
        <div className="rounded-2xl border border-white/10 bg-slate-900/50 backdrop-blur-xl overflow-hidden">

          {/* Section header */}
          <div className="flex flex-col gap-3 border-b border-white/8 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <SectionTitle color="bg-orange-500" label="Dèt Founisè" count={filteredDebts.length} />

            {/* Controls */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Search */}
              <div className="relative">
                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                </svg>
                <input
                  type="text" placeholder="Rechèch…" value={debtSearch}
                  onChange={e => setDebtSearch(e.target.value)}
                  className="w-40 rounded-xl bg-white/5 border border-white/10 pl-8 pr-3 py-1.5 text-xs text-white placeholder-white/25 outline-none focus:border-orange-500/60 transition"
                />
              </div>
              {/* Status pills */}
              {(['all','unpaid','paid'] as FilterStatus[]).map(s => (
                <button key={s} onClick={() => setDebtStatus(s)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition
                    ${debtStatus === s ? 'bg-orange-600 text-white' : 'bg-white/5 text-white/50 hover:text-white hover:bg-white/10'}`}>
                  {s === 'all' ? 'Tout' : s === 'unpaid' ? 'À Crédit' : 'Payé'}
                </button>
              ))}
              {/* Smart filter */}
              <button
                onClick={() => setDebtCritOnly(p => !p)}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition
                  ${debtCritOnly
                    ? 'bg-red-500/25 text-red-300 border border-red-500/50'
                    : 'bg-white/5 text-white/50 border border-white/10 hover:text-red-300 hover:bg-red-500/10 hover:border-red-500/30'}`}>
                <span className={`h-1.5 w-1.5 rounded-full bg-red-400 ${debtCritOnly ? 'animate-pulse' : ''}`} />
                Critique sèlman
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[680px]">
              <thead>
                <tr className="border-b border-white/8">
                  {['Founisè', 'Pwodui', 'Dat Ref.', 'Dat Échéance', 'Montan Rete', 'État', 'Relanse', 'Aksyon'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-white/30 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [...Array(4)].map((_, i) => (
                    <tr key={i} className="border-b border-white/5">
                      {[...Array(8)].map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-3 rounded bg-white/8 animate-pulse" style={{ width: `${35 + Math.random() * 50}%` }} />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : filteredDebts.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-white/30 text-sm">
                      Pa gen dèt pou filtè sa a.
                    </td>
                  </tr>
                ) : filteredDebts.map((debt, i) => {
                  const waMsg = `Bonjou ${debt.supplier_name}, nou ta renmen raple ou ke gen yon peman annatant depi ${debt.days_overdue} jou. Montan: ${fmtAmt(debt.amount)}. Mèsi pou kolaborasyon ou.`;
                  return (
                    <tr key={debt.id}
                      className={`border-b border-white/5 transition-colors group
                        ${debt.etat === 'Critique' && debt.payment_status === 'À Crédit' ? 'bg-red-500/[0.03]' : ''}
                        ${i % 2 === 0 ? '' : 'bg-white/[0.01]'}
                        hover:bg-white/[0.04]`}>
                      {/* Founisè */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-orange-500/15 text-xs font-bold text-orange-400">
                            {debt.supplier_name.charAt(0).toUpperCase()}
                          </div>
                          <span className="font-medium text-white/90 text-sm">{debt.supplier_name}</span>
                        </div>
                      </td>
                      {/* Pwodui */}
                      <td className="px-4 py-3 text-white/60 text-xs max-w-[140px] truncate" title={debt.product_name}>
                        {debt.product_name} <span className="text-white/30">×{debt.quantity}</span>
                      </td>
                      {/* Dat ref */}
                      <td className="px-4 py-3 whitespace-nowrap text-white/50 text-xs font-mono">
                        {fmtDate(debt.purchase_date)}
                      </td>
                      {/* Dat échéance */}
                      <td className="px-4 py-3 whitespace-nowrap text-xs">
                        <span className={debt.etat === 'Critique' ? 'text-red-400 font-semibold' : debt.etat === 'Atansyon' ? 'text-orange-400' : 'text-white/50'}>
                          {fmtDate(debt.due_date)}
                        </span>
                        {debt.payment_status === 'À Crédit' && (
                          <span className="ml-1.5 text-white/30">({debt.days_overdue}j)</span>
                        )}
                      </td>
                      {/* Montan */}
                      <td className={`px-4 py-3 whitespace-nowrap font-bold tabular-nums
                        ${debt.payment_status === 'Payé' ? 'text-emerald-400' : 'text-white/90'}`}>
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
                          : <span className="text-xs text-white/20">—</span>}
                      </td>
                      {/* Aksyon */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {debt.payment_status === 'À Crédit' ? (
                          <button
                            onClick={() => handlePayDebt(debt.id)}
                            disabled={payingId === debt.id}
                            className="rounded-lg bg-emerald-600/80 hover:bg-emerald-600 disabled:opacity-50 px-3 py-1.5 text-xs font-semibold text-white transition">
                            {payingId === debt.id ? '…' : 'Peye'}
                          </button>
                        ) : (
                          <span className="text-xs text-emerald-400">✓ Peye</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Section footer */}
          <div className="border-t border-white/8 px-5 py-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-white/30">
            <span>Total annatant: <span className="text-orange-400 font-semibold">{fmtAmt(totalDebtUnpaid)}</span></span>
            <span>Critique: <span className="text-red-400 font-semibold">{critDebts}</span></span>
            <span>Atansyon: <span className="text-orange-400 font-semibold">{supplierDebts.filter(d => d.etat === 'Atansyon' && d.payment_status === 'À Crédit').length}</span></span>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            SECTION 2 — Kreyans Kliyan
        ════════════════════════════════════════════════════════════════════ */}
        <div className="rounded-2xl border border-white/10 bg-slate-900/50 backdrop-blur-xl overflow-hidden">

          {/* Section header */}
          <div className="flex flex-col gap-3 border-b border-white/8 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <SectionTitle color="bg-blue-500" label="Kreyans Kliyan" count={filteredCredits.length} />

            <div className="flex flex-wrap items-center gap-2">
              {/* Search */}
              <div className="relative">
                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                </svg>
                <input
                  type="text" placeholder="Rechèch…" value={creditSearch}
                  onChange={e => setCreditSearch(e.target.value)}
                  className="w-40 rounded-xl bg-white/5 border border-white/10 pl-8 pr-3 py-1.5 text-xs text-white placeholder-white/25 outline-none focus:border-blue-500/60 transition"
                />
              </div>
              {(['all','unpaid','paid'] as FilterStatus[]).map(s => (
                <button key={s} onClick={() => setCreditStatus(s)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition
                    ${creditStatus === s ? 'bg-blue-600 text-white' : 'bg-white/5 text-white/50 hover:text-white hover:bg-white/10'}`}>
                  {s === 'all' ? 'Tout' : s === 'unpaid' ? 'À Crédit' : 'Payé'}
                </button>
              ))}
              {/* Smart filter */}
              <button
                onClick={() => setCreditCritOnly(p => !p)}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition
                  ${creditCritOnly
                    ? 'bg-red-500/25 text-red-300 border border-red-500/50'
                    : 'bg-white/5 text-white/50 border border-white/10 hover:text-red-300 hover:bg-red-500/10 hover:border-red-500/30'}`}>
                <span className={`h-1.5 w-1.5 rounded-full bg-red-400 ${creditCritOnly ? 'animate-pulse' : ''}`} />
                Critique sèlman
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[680px]">
              <thead>
                <tr className="border-b border-white/8">
                  {['Kliyan', 'Fakti #', 'Dat Kredi', 'Dat Échéance', 'Montan Rete', 'État', 'Relanse', 'Aksyon'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-white/30 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [...Array(4)].map((_, i) => (
                    <tr key={i} className="border-b border-white/5">
                      {[...Array(8)].map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-3 rounded bg-white/8 animate-pulse" style={{ width: `${35 + Math.random() * 50}%` }} />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : filteredCredits.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-white/30 text-sm">
                      Pa gen kreyans pou filtè sa a.
                    </td>
                  </tr>
                ) : filteredCredits.map((cc, i) => {
                  const waMsg = `Bonjou ${cc.client_name}, nou ta renmen raple ou ke ou gen yon balans annatant${cc.invoice_number ? ` (Fakti #${cc.invoice_number})` : ''}: ${fmtAmt(cc.amount, cc.currency)}. Mèsi pou peman ou a.`;
                  return (
                    <tr key={cc.id}
                      className={`border-b border-white/5 transition-colors group
                        ${cc.etat === 'Critique' && cc.payment_status === 'À Crédit' ? 'bg-red-500/[0.03]' : ''}
                        ${i % 2 === 0 ? '' : 'bg-white/[0.01]'}
                        hover:bg-white/[0.04]`}>
                      {/* Kliyan */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-500/15 text-xs font-bold text-blue-400">
                            {cc.client_name.charAt(0).toUpperCase()}
                          </div>
                          <span className="font-medium text-white/90 text-sm">{cc.client_name}</span>
                        </div>
                      </td>
                      {/* Invoice */}
                      <td className="px-4 py-3 font-mono text-xs text-white/40 whitespace-nowrap">
                        {cc.invoice_number ? cc.invoice_number.slice(-8) : '—'}
                      </td>
                      {/* Dat kredi */}
                      <td className="px-4 py-3 whitespace-nowrap text-white/50 text-xs font-mono">
                        {fmtDate(cc.created_at)}
                      </td>
                      {/* Dat échéance */}
                      <td className="px-4 py-3 whitespace-nowrap text-xs">
                        <span className={cc.etat === 'Critique' ? 'text-red-400 font-semibold' : cc.etat === 'Atansyon' ? 'text-orange-400' : 'text-white/50'}>
                          {fmtDate(cc.due_date)}
                        </span>
                        {cc.payment_status === 'À Crédit' && (
                          <span className="ml-1.5 text-white/30">({cc.days_since}j)</span>
                        )}
                      </td>
                      {/* Montan */}
                      <td className={`px-4 py-3 whitespace-nowrap font-bold tabular-nums
                        ${cc.payment_status === 'Payé' ? 'text-emerald-400' : 'text-white/90'}`}>
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
                          : <span className="text-xs text-white/20">—</span>}
                      </td>
                      {/* Aksyon */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {cc.payment_status === 'À Crédit' ? (
                          <button
                            onClick={() => handlePayCredit(cc.id)}
                            disabled={payingId === cc.id}
                            className="rounded-lg bg-blue-600/80 hover:bg-blue-600 disabled:opacity-50 px-3 py-1.5 text-xs font-semibold text-white transition">
                            {payingId === cc.id ? '…' : 'Touche'}
                          </button>
                        ) : (
                          <span className="text-xs text-emerald-400">✓ Touche</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Section footer */}
          <div className="border-t border-white/8 px-5 py-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-white/30">
            <span>Total annatant: <span className="text-blue-400 font-semibold">{fmtAmt(totalCreditUnpaid)}</span></span>
            <span>Critique: <span className="text-red-400 font-semibold">{critCredits}</span></span>
            <span>Atansyon: <span className="text-orange-400 font-semibold">{clientCredits.filter(c => c.etat === 'Atansyon' && c.payment_status === 'À Crédit').length}</span></span>
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
