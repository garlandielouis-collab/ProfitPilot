'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'next/navigation';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../lib/useAuth';
import { upsertCustomer, deleteCustomer, markCustomerCreditPaid } from '../actions/customers';
import { useLanguage } from '../../components/LanguageWrapper';
import { Button, FirstRun, NoResult, closestMatch } from '../../components/ds';
import { EntityDocuments } from '../../components/documents/EntityDocuments';
// Une seule bibliothèque d'icônes, en contour, à épaisseur constante (§3.5) :
// l'étoile ⭐ et le trombone 📋 étaient dessinés par le téléphone, pas par nous.
import { CalendarDays, CheckCircle2, FileText, Hash, Mail, Phone, Star } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

type Client = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  outstanding_balance: number;
  created_at: string;
  // enriched client-side — montants en HTG, USD convertis au taux de l'entreprise
  totalPurchases: number;
  saleCount: number;
  isVIP: boolean;
  /** Au moins une vente/créance non soldée avec un reste dû > 0 (quelle que soit la devise). */
  hasDebt: boolean;
  /** Des montants USD n'ont pas pu être convertis (taux indisponible) : afficher « … ». */
  purchasesPending: boolean;
  debtPending: boolean;
};

type Sale = {
  id: string;
  invoice_number: string | null;
  total_amount: number;
  currency: string;
  payment_method: string;
  payment_status: string;
  discount_percent: number;
  created_at: string;
};

type ClientCredit = {
  /** id de la vente — ce qu'attend markCustomerCreditPaid. */
  id: string;
  invoice_number: string | null;
  /** Montant facturé (total_amount), dans la devise de la vente. */
  amount: number;
  /** Reste dû (balance_due de v_receivables). `null` = vue indisponible → « … ». */
  due: number | null;
  currency: string;
  created_at: string;
};

type Invoice = {
  invoice_number: string;
  total: number;
  currency: string;
  payment_method: string;
  payment_status: string;
  date: string;
  itemCount: number;
};

// ── Config ────────────────────────────────────────────────────────────────────

const VIP_THRESHOLD  = 50_000;   // HTG — total purchases to be VIP
const VIP_SALE_COUNT = 5;        // OR >= 5 sales

// Une vente n'est plus « due » une fois payée, annulée ou remboursée. Le
// déclencheur fn_on_sale_payment compte comme ouvertes credit, partial, pending
// et overdue ; `v_receivables` n'écarte que `paid` — les ventes annulées ou
// remboursées sont retirées ici, comme le fait markCustomerCreditPaid.
const CLOSED_SALE_STATUSES = new Set(['paid', 'cancelled', 'refunded']);
const OPEN_SALE_STATUSES   = new Set(['credit', 'partial', 'pending', 'overdue']);
// Sous un centime, markCustomerCreditPaid répond « déjà soldée » : la vente ne
// compte donc ni dans la dette ni dans la liste des créances.
const OWED_MIN = 0.01;

// `sales.payment_status` est l'énum payment_status_type : on l'affiche en mots,
// la valeur brute ne sort plus que si la base en ajoute une inconnue ici.
const PAYMENT_STATUS_LABEL: Record<string, { fr: string; ht: string }> = {
  pending:   { fr: 'En attente', ht: 'Annatant' },
  partial:   { fr: 'Partielle',  ht: 'Pasyèl' },
  paid:      { fr: 'Payée',      ht: 'Peye' },
  credit:    { fr: 'Crédit',     ht: 'Kredi' },
  overdue:   { fr: 'En retard',  ht: 'An reta' },
  cancelled: { fr: 'Annulée',    ht: 'Anile' },
  refunded:  { fr: 'Remboursée', ht: 'Ranbouse' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number, currency = 'HTG') {
  if (currency === 'USD') {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n);
  }
  return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' HTG';
}

/** Un total qui contient des USD non convertis ne s'affiche pas : « … » vaut mieux qu'un chiffre faux. */
function fmtTotal(n: number | null, pending = false) {
  return n === null || pending ? '…' : fmt(n);
}

function statusLabel(status: string) {
  return PAYMENT_STATUS_LABEL[status] ?? { fr: status, ht: status };
}

function initials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase() || '?';
}

function daysSince(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

// ── Aucune donnée de démonstration (audit §1.1, §5.10) ───────────────────────
//
// Cinq clients inventés — Marie Josette Pierre, Jean-Baptiste Duval… — avec
// leurs téléphones, leurs achats cumulés et leurs dettes, s'affichaient tant que
// la base ne répondait pas. Un bandeau ambre prévenait ; le marchand, lui,
// voyait cinq noms qu'il ne connaissait pas dans SON carnet de clients.
//
// « Dans un logiciel de gestion, un chiffre affiché est une promesse. »
//
// La liste part donc vide et le reste tant qu'elle l'est. À la place : l'état
// de premier accueil, qui montre le geste — ajouter un premier client.

// ── ClientModal (Add / Edit) ──────────────────────────────────────────────────

function ClientModal({
  client, onClose, onSaved,
}: {
  client: Client | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useLanguage();
  const [name,  setName]  = useState(client?.name  ?? '');
  const [phone, setPhone] = useState(client?.phone ?? '');
  const [email, setEmail] = useState(client?.email ?? '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setErr(t({ fr: 'Le nom du client est obligatoire.', ht: 'Non kliyan an obligatwa.' }));
    setSaving(true); setErr('');
    try {
      await upsertCustomer({ id: client?.id, name, phone: phone || undefined, email: email || undefined });
      onSaved(); onClose();
    } catch (e: any) { setErr(e.message); }
    setSaving(false);
  }

  const inp = 'w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm text-[var(--color-text)] outline-none ring-1 ring-transparent transition placeholder:text-slate-600 focus:ring-primary/30';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-surface border border-[var(--color-border)] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-5">
          <div>
            <p className="text-xs uppercase tracking-widest text-[var(--color-muted)]">{client ? t({ fr: 'Modifier', ht: 'Modifye' }) : t({ fr: 'Nouveau Client', ht: 'Nouvo Kliyan' })}</p>
            <h3 className="mt-0.5 text-xl font-semibold text-primary">
              {client ? t({ fr: 'Modifier Client', ht: 'Modifye Kliyan' }) : t({ fr: 'Ajouter un Client', ht: 'Ajoute yon Kliyan' })}
            </h3>
          </div>
          <button onClick={onClose} className="min-h-touch min-w-touch inline-flex items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-[var(--color-muted)] transition hover:bg-slate-100 hover:text-white">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <form onSubmit={submit} className="space-y-4 p-6">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-[var(--color-muted)]">{t({ fr: 'Nom Client *', ht: 'Non Kliyan *' })}</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Marie Josette Pierre" className={inp} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-[var(--color-muted)]">{t({ fr: 'Téléphone', ht: 'Telefòn' })}</label>
              <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+509 XXXX-XXXX" className={inp} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-[var(--color-muted)]">{t({ fr: 'Email', ht: 'Imèl' })}</label>
              <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="email@example.com" className={inp} />
            </div>
          </div>
          {err && <p className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs text-red-400">{err}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] py-3 text-sm font-semibold text-[var(--color-muted)] transition hover:bg-slate-100">{t({ fr: 'Annuler', ht: 'Anile' })}</button>
            <button type="submit" disabled={saving} className="flex-1 rounded-2xl bg-primary py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-h disabled:opacity-50">
              {saving ? t({ fr: 'Enregistrement…', ht: 'Anrejistreman…' }) : client ? t({ fr: 'Sauvegarder les modifications', ht: 'Sove Chanjman' }) : t({ fr: 'Ajouter Client', ht: 'Ajoute Kliyan' })}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── DeleteModal ───────────────────────────────────────────────────────────────

function DeleteModal({ client, onClose, onConfirm }: { client: Client; onClose: () => void; onConfirm: () => Promise<void> }) {
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
      <div className="w-full max-w-sm overflow-hidden rounded-surface border border-[var(--color-border)] bg-white p-6 shadow-2xl">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/15">
          <svg className="h-5 w-5 text-red-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
        </div>
        <h3 className="text-lg font-semibold text-primary">{t({ fr: 'Supprimer le client?', ht: 'Efase kliyan?' })}</h3>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          <span className="font-medium text-[var(--color-text)]">{client.name}</span>{' '}{t({ fr: 'sera supprimé. Ses ventes resteront mais sans lien.', ht: 'pral efase. Ventes li yo ap rete men san lyen.' })}
        </p>
        {/* Tous les clients sont réels : plus de branche « faux client » à
            désamorcer, et le bouton de suppression fait toujours son travail. */}
        <div className="mt-5 flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] py-2.5 text-sm font-semibold text-[var(--color-muted)] transition hover:bg-slate-100">{t({ fr: 'Annuler', ht: 'Anile' })}</button>
          <button onClick={async () => { setBusy(true); await onConfirm(); setBusy(false); }} disabled={busy}
            className="flex-1 rounded-2xl bg-red-600 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50">
            {busy ? t({ fr: 'Suppression…', ht: 'Efasman…' }) : t({ fr: 'Oui, Supprimer', ht: 'Wi, Efase' })}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Avatar ────────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  'bg-primary/30 text-primary',
  'bg-blue-500/20 text-blue-300',
  'bg-emerald-500/20 text-emerald-300',
  'bg-orange-500/20 text-orange-300',
  'bg-pink-500/20 text-pink-300',
  'bg-cyan-500/20 text-cyan-300',
];
function avatarColor(name: string) {
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[h];
}

// ── Inner page (needs useSearchParams) ───────────────────────────────────────

function ClientsCRMInner() {
  const { t } = useLanguage();
  const params = useSearchParams();

  // ── State ──────────────────────────────────────────────────────────────────
  const [clients,      setClients]      = useState<Client[]>([]);
  const [selectedId,   setSelectedId]   = useState<string | null>(params.get('id') ?? null);

  const [loading,      setLoading]      = useState(true);
  const [detailLoad,   setDetailLoad]   = useState(false);

  // detail data
  const [invoices,     setInvoices]     = useState<Invoice[]>([]);
  const [credits,      setCredits]      = useState<ClientCredit[]>([]);
  const [busyCredit,   setBusyCredit]   = useState<Set<string>>(new Set());
  // Chargé avec la liste (loadClients) : taux USD→HTG de l'entreprise.
  // `null` = indisponible.
  const [rate,         setRate]         = useState<number | null>(null);

  // modals
  const [showModal,    setShowModal]    = useState(false);
  const [editClient,   setEditClient]   = useState<Client | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null);
  const { user } = useAuth();

  // filters
  const [search,       setSearch]       = useState('');
  const [filter,       setFilter]       = useState<'all' | 'vip' | 'debtor'>('all');

  // print ref
  const printRef = useRef<HTMLDivElement>(null);

  // ── Load all clients ───────────────────────────────────────────────────────

  function getActiveStoreId(): string | null {
    if (typeof document === 'undefined') return null;
    const match = document.cookie.match(/(?:^|; )pp_active_store=([0-9a-fA-F-]{36})/);
    return match ? match[1] : null;
  }

  async function resolveBusinessId(userId: string): Promise<string | null> {
    const activeStoreId = getActiveStoreId();
    if (activeStoreId) {
      const { data: activeBiz } = await supabase
        .from('businesses')
        .select('id, owner_id')
        .eq('id', activeStoreId)
        .maybeSingle();
      if (activeBiz?.owner_id === userId) return activeBiz.id;
      const { data: membership } = await supabase
        .from('business_members')
        .select('business_id')
        .eq('business_id', activeStoreId)
        .eq('user_id', userId)
        .eq('is_active', true)
        .is('deleted_at', null)
        .maybeSingle();
      if (membership?.business_id) return membership.business_id;
    }

    const { data: ownedBiz } = await supabase
      .from('businesses')
      .select('id')
      .eq('owner_id', userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (ownedBiz?.id) return ownedBiz.id;

    const { data: memberBiz } = await supabase
      .from('business_members')
      .select('business_id')
      .eq('user_id', userId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle();
    return memberBiz?.business_id ?? null;
  }

  const loadClients = useCallback(async () => {
    if (user === undefined) return;
    setLoading(true);
    if (!user) {
      setClients([]);
      setLoading(false);
      return;
    }

    const businessId = await resolveBusinessId(user.id);

    const clientQuery = supabase.from('customers').select('id,first_name,last_name,phone,email,created_at');
    if (businessId) {
      clientQuery.eq('business_id', businessId);
    } else {
      // If no business ID, no customers to show
      setClients([]);
      setLoading(false);
      return;
    }

    // ── Solde dû par client ─────────────────────────────────────────────────
    //
    // `outstanding_balance` était écrit à 0 en dur : filtre « Débiteurs »
    // toujours vide, carte « Dette active » à 0 HTG, badge « Dette » jamais
    // affiché. La source est `v_receivables`, la vue de /creances et /dettes :
    // le reste dû après paiements partiels (total_amount − paid_amount), ventes
    // non soldées seulement — un chiffre qui ne contredit pas ces deux écrans.
    const [clientRes, salesRes, receivRes, bizRes] = await Promise.all([
      clientQuery.order('first_name'),
      // `currency` pour convertir, `deleted_at` pour ne pas compter une vente
      // supprimée — `v_receivables` les écarte déjà, « Total Achats » aussi.
      // `id` + `payment_status` : écarter de la dette les ventes annulées ou
      // remboursées, que `v_receivables` laisse passer.
      businessId
        ? supabase.from('sales').select('id,customer_id,total_amount,currency,payment_status').eq('business_id', businessId).is('deleted_at', null).not('customer_id', 'is', null)
        : supabase.from('sales').select('id,customer_id,total_amount,currency,payment_status').is('deleted_at', null).not('customer_id', 'is', null),
      supabase.from('v_receivables')
        .select('sale_id,customer_id,balance_due,currency')
        .eq('business_id', businessId)
        .not('customer_id', 'is', null),
      supabase.from('businesses').select('exchange_rate').eq('id', businessId).maybeSingle(),
    ]);

    if (clientRes.error) {
      console.error('[clients] loadClients error:', clientRes.error.message);
      // Une requête qui échoue ne remplit pas la liste de clients imaginaires.
      setClients([]);
      setLoading(false);
      return;
    }

    const clientsData = clientRes.data ?? [];

    // Tous les montants de l'écran s'affichent en HTG : un montant en USD est
    // converti au taux de l'entreprise (`businesses.exchange_rate`, NOT NULL),
    // comme les totaux de /dettes et des dépenses. Additionner 50 USD et 50 HTG
    // aurait affiché « 100 HTG ». Sans taux valide, le montant USD reste hors du
    // total et le total s'affiche « … » plutôt qu'un chiffre faux.
    const rawRate = Number(bizRes.data?.exchange_rate);
    const bizRate = !bizRes.error && Number.isFinite(rawRate) && rawRate > 0 ? rawRate : null;
    const toHtg = (amount: number, currency: string | null | undefined): number | null =>
      currency === 'USD' ? (bizRate === null ? null : amount * bizRate) : amount;

    const agg: Record<string, { total: number; count: number; pending: boolean }> = {};
    for (const s of (salesRes.data ?? []) as any[]) {
      const cid = s.customer_id;
      if (!cid) continue;
      if (!agg[cid]) agg[cid] = { total: 0, count: 0, pending: false };
      const v = toHtg(Number(s.total_amount), s.currency);
      if (v === null) agg[cid].pending = true; else agg[cid].total += v;
      agg[cid].count += 1;
    }

    if (receivRes.error) console.error('[clients] v_receivables error:', receivRes.error.message);
    // Mêmes règles que la liste « Créances en cours » de la fiche (loadDetail) :
    // une vente annulée/remboursée ou un reste dû sous le centime ne compte pas.
    const closedSaleIds = new Set<string>(
      ((salesRes.data ?? []) as any[])
        .filter(s => CLOSED_SALE_STATUSES.has(s.payment_status))
        .map(s => s.id as string),
    );
    const debt: Record<string, { amount: number; pending: boolean }> = {};
    for (const r of (receivRes.data ?? []) as any[]) {
      const due = Number(r.balance_due ?? 0);
      if (!r.customer_id || !(due >= OWED_MIN) || closedSaleIds.has(r.sale_id)) continue;
      if (!debt[r.customer_id]) debt[r.customer_id] = { amount: 0, pending: false };
      const v = toHtg(due, r.currency);
      if (v === null) debt[r.customer_id].pending = true; else debt[r.customer_id].amount += v;
    }

    const enriched: Client[] = clientsData.map((c: any) => {
      const name = `${c.first_name} ${c.last_name}`.trim();
      const { total = 0, count = 0, pending: purchasesPending = false } = agg[c.id] ?? {};
      const d = debt[c.id];
      return {
        id: c.id, name: name, phone: c.phone ?? null, email: c.email ?? null,
        outstanding_balance: parseFloat((d?.amount ?? 0).toFixed(2)), created_at: c.created_at,
        totalPurchases: total, saleCount: count,
        isVIP: total >= VIP_THRESHOLD || count >= VIP_SALE_COUNT,
        hasDebt: !!d, purchasesPending, debtPending: d?.pending ?? false,
      };
    });

    setRate(bizRate);
    setClients(enriched);
    if (!selectedId && enriched.length > 0) setSelectedId(enriched[0].id);
    setLoading(false);
  }, [selectedId, user]);

  // ── Load client detail ─────────────────────────────────────────────────────

  const loadDetail = useCallback(async (clientId: string) => {

    setDetailLoad(true);
    const userResult = await supabase.auth.getUser();
    const businessId = userResult.data?.user ? await resolveBusinessId(userResult.data.user.id) : null;
    // ── Créances en cours ────────────────────────────────────────────────────
    //
    // La liste ne prenait que `payment_status = 'credit'` : après un acompte, la
    // vente passe à `partial` et disparaissait, alors que la carte « Dette
    // active » la comptait encore. Source désormais identique à cette carte :
    // `v_receivables` (reste dû après paiements partiels), pour ce client.
    //
    // `.if()` n'existe pas dans supabase-js (postgrest-js n'a aucune méthode de
    // ce nom) : l'appel levait « query.if is not a function », et la fiche ne
    // chargeait ni l'historique ni les créances. Le filtre entreprise est donc
    // ajouté à la main, seulement quand l'entreprise est connue.
    let salesQuery = supabase.from('sales')
      .select('id,invoice_number,total_amount,currency,payment_method,payment_status,discount_percent,created_at')
      .eq('customer_id', clientId)
      .is('deleted_at', null);
    let receivQuery = supabase.from('v_receivables')
      .select('sale_id,invoice_number,total_amount,balance_due,currency,sale_date')
      .eq('customer_id', clientId);
    if (businessId != null) {
      salesQuery  = salesQuery.eq('business_id', businessId);
      receivQuery = receivQuery.eq('business_id', businessId);
    }
    const [salesRes, receivRes] = await Promise.all([
      salesQuery.order('created_at', { ascending: false }),
      receivQuery.order('sale_date', { ascending: false }),
    ]);

    // Group sales → invoices
    const invMap: Record<string, Invoice> = {};
    for (const s of salesRes.data ?? []) {
      const key = s.invoice_number ?? s.id;
      if (!invMap[key]) invMap[key] = { invoice_number: s.invoice_number ?? '—', total: 0, currency: s.currency, payment_method: s.payment_method, payment_status: s.payment_status, date: s.created_at, itemCount: 0 };
      invMap[key].total += Number(s.total_amount);
      invMap[key].itemCount += 1;
    }
    setInvoices(Object.values(invMap).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));

    const saleById = new Map<string, any>(((salesRes.data ?? []) as any[]).map(s => [s.id as string, s]));
    if (receivRes.error) {
      // Vue indisponible : les ventes ouvertes restent listées — et encaissables —
      // mais leur reste dû s'affiche « … » plutôt qu'un chiffre deviné.
      console.error('[clients] loadDetail v_receivables error:', receivRes.error.message);
      setCredits(((salesRes.data ?? []) as any[])
        .filter(s => OPEN_SALE_STATUSES.has(s.payment_status))
        .map(s => ({
          id: s.id, invoice_number: s.invoice_number ?? null, amount: Number(s.total_amount),
          due: null, currency: s.currency ?? 'HTG', created_at: s.created_at,
        })));
    } else {
      setCredits(((receivRes.data ?? []) as any[])
        .filter(r => {
          const sale = saleById.get(r.sale_id);
          return Number(r.balance_due ?? 0) >= OWED_MIN && !(sale && CLOSED_SALE_STATUSES.has(sale.payment_status));
        })
        .map(r => {
          const sale = saleById.get(r.sale_id);
          return {
            id: r.sale_id, invoice_number: r.invoice_number ?? null, amount: Number(r.total_amount),
            due: Number(r.balance_due), currency: r.currency ?? 'HTG',
            created_at: sale?.created_at ?? r.sale_date,
          };
        }));
    }
    setDetailLoad(false);
  }, []);

  // ── Init + re-load on selection ────────────────────────────────────────────

  useEffect(() => { loadClients(); }, []);
  useEffect(() => { if (selectedId) loadDetail(selectedId); }, [selectedId, loadDetail]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  async function handlePayCredit(creditId: string) {
    setBusyCredit(s => new Set(s).add(creditId));
    try {
      // Plus de branche « faux crédit » : un règlement passe par la base, ou
      // il ne passe pas. Une créance soldée à l'écran mais pas en comptabilité
      // est exactement le genre de mensonge que cet audit chasse.
      const res = await markCustomerCreditPaid(creditId);
      // Rien d'encaissé (déjà soldée, annulée, ou reste dû changé entre
      // l'affichage et le clic) : on le dit, puis on recharge pour que la ligne
      // périmée affiche l'état réel.
      if (!res.settled) {
        alert(t(
          res.reason === 'already_settled'
            ? { fr: 'Cette vente est déjà soldée : rien n\'a été encaissé.', ht: 'Vant sa a deja peye nèt : anyen pa touche.' }
            : res.reason === 'cancelled'
              ? { fr: 'Cette vente est annulée ou remboursée : rien n\'a été encaissé.', ht: 'Vant sa a anile oswa ranbouse : anyen pa touche.' }
              : { fr: 'Le reste dû vient de changer : rien n\'a été encaissé. Vérifiez le montant puis réessayez.', ht: 'Montan ki rete a sot chanje : anyen pa touche. Verifye montan an epi eseye ankò.' },
        ));
      }
      if (selectedId) await loadDetail(selectedId);
      await loadClients();
    } catch (e: any) { alert(e.message); }
    finally { setBusyCredit(s => { const n = new Set(s); n.delete(creditId); return n; }); }
  }

  async function handleDeleteConfirm(client: Client) {
    try {
      await deleteCustomer(client.id);
      setDeleteTarget(null);
      if (selectedId === client.id) setSelectedId(null);
      await loadClients();
    } catch (e: any) { alert(e.message); }
  }

  // ── Print report ──────────────────────────────────────────────────────────
  //
  // « Imprimer » sortait une page blanche. globals.css masque à l'impression
  // tout enfant direct de <body> sauf #pp-print-root : le rapport, rendu au fond
  // de l'application, disparaissait avec elle, et son `display:none` n'était de
  // toute façon jamais levé — la règle injectée ne touchait qu'à `visibility`.
  // Il passe désormais par un portail monté sur <body> sous cet identifiant,
  // comme /rapports : la feuille globale l'affiche seul, et plus rien n'est
  // injecté puis retiré (trop tôt sur mobile, où print() ne bloque pas).
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => { setIsMounted(true); }, []);

  function handlePrint() {
    window.print();
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const filteredClients = useMemo(() => {
    let list = clients;
    if (search) list = list.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || c.phone?.includes(search) || c.email?.toLowerCase().includes(search.toLowerCase()));
    if (filter === 'vip')    list = list.filter(c => c.isVIP);
    if (filter === 'debtor') list = [...list].sort((a, b) => b.outstanding_balance - a.outstanding_balance).filter(c => c.hasDebt);
    return list;
  }, [clients, search, filter]);

  const selected = useMemo(() => clients.find(c => c.id === selectedId) ?? null, [clients, selectedId]);

  // ── Créances en cours : le RESTE DÛ, pas le montant de la vente ───────────
  //
  // Le badge additionnait `total_amount` de chaque vente à crédit, USD et HTG
  // mêlés : un acompte ne le faisait pas baisser, et 50 USD + 50 HTG y
  // valaient « 100 HTG ». `credits` porte le reste dû de `v_receivables`, la
  // source de la carte « Dette active » (mêmes ventes, même seuil) ; le total
  // est converti comme elle. `due: null` = vue indisponible → « … ».
  const openCredits = credits;

  const convertToHtg = useCallback((amount: number, currency: string): number | null =>
    currency === 'USD' ? (rate === null ? null : amount * rate) : amount, [rate]);

  const totalDebtActive = useMemo(() => {
    let sum = 0;
    for (const c of openCredits) {
      const v = c.due === null ? null : convertToHtg(c.due, c.currency);
      if (v === null) return null;
      sum += v;
    }
    return sum;
  }, [openCredits, convertToHtg]);

  // Pied de l'historique : factures HTG et USD converties avant la somme.
  const historyTotal = useMemo(() => {
    let sum = 0;
    for (const inv of invoices) {
      const v = convertToHtg(inv.total, inv.currency);
      if (v === null) return null;
      sum += v;
    }
    return sum;
  }, [invoices, convertToHtg]);

  // ── Render ────────────────────────────────────────────────────────────────

  const listVisible   = !selectedId || true;   // always render list (CSS hides it on mobile)
  const detailVisible = !!selectedId;

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--color-bg)]">

      {/* ════════════════════════════════════════
          LEFT PANEL — Master (client list)
          Hidden on mobile when detail is open
      ════════════════════════════════════════ */}
      <aside className={`flex w-full flex-col border-r border-[var(--color-border)] md:w-80 lg:w-96 ${selectedId ? 'hidden md:flex' : 'flex'}`}>

        {/* Header */}
        <div className="border-b border-[var(--color-border)] px-5 py-5">
          <div className="flex items-center justify-between">
            <div>
              {/* Le sur-titre « CRM » a sauté : trois lettres d'un jargon que
                  le marchand n'a aucune raison de connaître, posées au-dessus
                  d'un titre qui se suffisait (audit §9, contrôles 1 et 10). */}
              <h1 className="text-xl font-semibold text-primary">{t({ fr: 'Clients', ht: 'Kliyan yo' })}</h1>
            </div>
            <button onClick={() => { setEditClient(null); setShowModal(true); }}
              className="flex items-center gap-1.5 rounded-2xl bg-primary px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-primary-h active:scale-95">
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
              {/* Le bouton nomme ce qu'il fait. « Ajouter » seul obligeait
                  à deviner quoi (audit §9, contrôle 1). */}
              {t({ fr: 'Nouveau client', ht: 'Nouvo kliyan' })}
            </button>
          </div>

          {/* Search */}
          <div className="relative mt-3">
            <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted)]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t({ fr: 'Rechercher client…', ht: 'Chèche kliyan…' })}
              className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] py-2.5 pl-9 pr-4 text-sm text-[var(--color-text)] outline-none placeholder:text-slate-600 focus:border-primary/50 focus:ring-1 focus:ring-muted/30" />
          </div>

          {/* Filter tabs */}
          <div className="mt-3 flex gap-1.5">
            {([['all', t({ fr: 'Tout', ht: 'Tout' })], ['vip', t({ fr: 'Fidèles', ht: 'Fidèl' })], ['debtor', t({ fr: 'Débiteurs', ht: 'Debitè' })]] as const).map(([k, label]) => (
              <button key={k} onClick={() => setFilter(k)}
                className={`flex-1 rounded-xl py-1.5 text-xs font-semibold transition ${filter === k ? 'bg-primary text-white' : 'bg-[var(--color-surface)] text-[var(--color-muted)] hover:bg-slate-100'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Client list */}
        <div className="flex-1 overflow-y-auto py-2">

          {loading ? (
            <div className="flex justify-center py-10">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[#001F3F]" />
            </div>
          ) : clients.length === 0 ? (
            /* Premier accueil : le carnet est neuf, et il le dit (§5.10). */
            <FirstRun
              title={t({
                fr: 'Votre carnet de clients est vide',
                ht: 'Kanè kliyan ou vid',
              })}
              hint={t({
                fr: "Ajoutez ceux à qui vous vendez souvent : vous saurez qui vous doit, combien, et depuis quand.",
                ht: 'Ajoute moun ou vann souvan yo : w ap konnen kiyès ki dwe w, konbyen, depi kilè.',
              })}
              action={
                <Button variant="accent" block onClick={() => { setEditClient(null); setShowModal(true); }}>
                  {t({ fr: 'Ajouter un client', ht: 'Ajoute yon kliyan' })}
                </Button>
              }
            />
          ) : filteredClients.length === 0 ? (
            /* Résultat introuvable : ce n'est pas la même chose, et ça ne se
               dit pas pareil. La recherche propose une correction ; le filtre
               constate simplement, sans dramatiser. */
            search ? (
              <NoResult
                query={search}
                noun={t({ fr: 'client', ht: 'kliyan' })}
                suggestion={closestMatch(search, clients.map(c => c.name))}
                onUseSuggestion={setSearch}
                onClear={() => setSearch('')}
                action={
                  <Button variant="primary" onClick={() => { setEditClient(null); setShowModal(true); }}>
                    {t({ fr: 'Créer ce client', ht: 'Kreye kliyan sa a' })}
                  </Button>
                }
              />
            ) : (
              <p className="px-4 py-10 text-center text-body text-[var(--color-muted)]">
                {filter === 'vip'
                  ? t({ fr: 'Aucun client VIP pour le moment.', ht: 'Pa gen kliyan VIP pou kounye a.' })
                  : t({ fr: "Personne ne vous doit d'argent.", ht: 'Pèsonn pa dwe w lajan.' })}
              </p>
            )
          ) : filteredClients.map(c => (
            <button key={c.id} onClick={() => setSelectedId(c.id)}
              className={`w-full px-4 py-3.5 text-left transition ${selectedId === c.id ? 'bg-nav-active' : 'hover:bg-slate-50'}`}>
              <div className="flex items-center gap-3">
                {/* Avatar */}
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-sm font-bold ${avatarColor(c.name)}`}>
                  {initials(c.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-[var(--color-text)]">{c.name}</p>
                    {c.isVIP && (
                      <Star
                        className="h-4 w-4 shrink-0 text-warning"
                        strokeWidth={1.8}
                        aria-label={t({ fr: 'Client fidèle', ht: 'Kliyan fidèl' })}
                      />
                    )}
                  </div>
                  <p className="text-xs text-[var(--color-muted)]">{c.saleCount} {c.saleCount !== 1 ? t({ fr: 'ventes', ht: 'vant' }) : t({ fr: 'vente', ht: 'vant' })} · {fmtTotal(c.totalPurchases, c.purchasesPending)}</p>
                </div>
                {c.hasDebt && (
                  <span className="shrink-0 rounded-full bg-red-500/15 px-2 py-0.5 text-note font-bold text-red-400">
                    {fmtTotal(c.outstanding_balance, c.debtPending)}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>

        {/* List footer */}
        <div className="border-t border-[var(--color-border)] px-4 py-3 text-xs text-[var(--color-muted)]">
          {filteredClients.length}{' '}{t({ fr: 'clients', ht: 'kliyan' })}{' · '}{filteredClients.filter(c => c.isVIP).length} VIP
        </div>
      </aside>

      {/* ════════════════════════════════════════
          RIGHT PANEL — Detail view
      ════════════════════════════════════════ */}
      <main className={`flex flex-1 flex-col overflow-hidden ${!detailVisible ? 'hidden md:flex' : 'flex'}`}>
        {!selected ? (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <svg className="mb-4 h-16 w-16 text-slate-200" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
            </svg>
            <p className="text-[var(--color-muted)]">{t({ fr: 'Choisissez un client pour voir ses détails', ht: 'Chwazi yon kliyan pou wè detay li' })}</p>
          </div>
        ) : (
          <div className="flex flex-1 flex-col overflow-y-auto">

            {/* Detail header */}
            <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-[var(--color-border)] bg-white/95 px-6 py-4 backdrop-blur-xl">
              {/* Back on mobile */}
              <button onClick={() => setSelectedId(null)} className="mr-1 flex items-center gap-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs font-medium text-[var(--color-muted)] transition hover:bg-slate-100 md:hidden">
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                {t({ fr: 'Retour', ht: 'Retounen' })}
              </button>

              {/* Avatar + name */}
              <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-base font-bold ${avatarColor(selected.name)}`}>
                {initials(selected.name)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold text-primary">{selected.name}</h2>
                  {selected.isVIP && (
                    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-400">{t({ fr: 'Client fidèle', ht: 'Kliyan fidèl' })}</span>
                  )}
                  {selected.hasDebt && (
                    <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-semibold text-red-400">{t({ fr: 'Dette', ht: 'Dèt' })}</span>
                  )}
                </div>
                <p className="truncate text-xs text-[var(--color-muted)]">
                  {t({ fr: 'Client depuis', ht: 'Kliyan depi' })} {new Date(selected.created_at).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
                  {' · '}{daysSince(selected.created_at)} {t({ fr: 'jours', ht: 'jou' })}
                </p>
              </div>

              {/* Actions */}
              <div className="flex shrink-0 items-center gap-1.5">
                <button onClick={handlePrint} title={t({ fr: 'Imprimer', ht: 'Enprime' })}
                  className="min-h-touch min-w-touch inline-flex items-center justify-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-[var(--color-muted)] transition hover:bg-slate-100">
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                </button>
                <button onClick={() => { setEditClient(selected); setShowModal(true); }} title={t({ fr: 'Modifier', ht: 'Modifye' })}
                  className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-[var(--color-muted)] transition hover:bg-slate-100">
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                </button>
                <button onClick={() => setDeleteTarget(selected)} title={t({ fr: 'Supprimer', ht: 'Efase' })}
                  className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-[var(--color-muted)] transition hover:bg-red-500/15 hover:text-red-400">
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              </div>
            </div>

            {/* Detail content */}
            <div className="flex-1 space-y-6 px-6 py-6">

              {/* ── Profile ── */}
              <section className="rounded-surface border border-[var(--color-border)] bg-[var(--color-surface)] p-5 backdrop-blur-xl">
                <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-[var(--color-muted)]">{t({ fr: 'Profil Client', ht: 'Pwofil Kliyan' })}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[
                    { label: t({ fr: 'Téléphone', ht: 'Telefòn' }), value: selected.phone ?? '—', icon: Phone },
                    { label: t({ fr: 'Email', ht: 'Imèl' }), value: selected.email ?? '—', icon: Mail },
                    { label: t({ fr: 'Inscription', ht: 'Enskripsyon' }), value: new Date(selected.created_at).toLocaleDateString('fr-FR'), icon: CalendarDays },
                    { label: t({ fr: 'ID Client', ht: 'ID Kliyan' }), value: selected.id.slice(0, 8) + '…', icon: Hash },
                  ].map(({ label, value, icon: Icon }) => (
                    <div key={label as string} className="rounded-2xl bg-[var(--color-surface)] p-3">
                      <Icon className="mb-1 h-5 w-5 text-muted" strokeWidth={1.8} aria-hidden />
                      <p className="text-note uppercase tracking-widest text-[var(--color-muted)]">{label}</p>
                      <p className="mt-0.5 break-all text-sm font-medium text-[var(--color-text)]">{value}</p>
                    </div>
                  ))}
                </div>
              </section>

              {/* ── Analytics cards ── */}
              <section>
                <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-[var(--color-muted)]">{t({ fr: 'Analytique', ht: 'Analitik' })}</p>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: t({ fr: 'Total Achats', ht: 'Total Acha' }), value: fmtTotal(selected.totalPurchases, selected.purchasesPending), sub: `${selected.saleCount} ${t({ fr: 'ventes', ht: 'vant' })}`, color: 'text-primary', bg: 'bg-primary/10' },
                    // Couleur et mention suivent le même chiffre que la valeur : une vente
                    // « partielle » compte dans le solde dû sans figurer dans `credits`,
                    // et la carte affichait alors un montant sous l'étiquette « Aucune ».
                    { label: t({ fr: 'Dette Active', ht: 'Dèt Aktif' }), value: fmtTotal(selected.outstanding_balance, selected.debtPending), sub: selected.hasDebt ? t({ fr: 'En cours', ht: 'An Kou' }) : t({ fr: 'Aucune', ht: 'Okenn' }), color: selected.hasDebt ? 'text-red-400' : 'text-emerald-400', bg: selected.hasDebt ? 'bg-red-500/10' : 'bg-emerald-500/10' },
                    { label: t({ fr: 'Moyenne / Vente', ht: 'Mwayèn / Vant' }), value: selected.saleCount ? fmtTotal(selected.totalPurchases / selected.saleCount, selected.purchasesPending) : '—', sub: t({ fr: 'Panier moyen', ht: 'Mwayèn' }), color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
                    { label: t({ fr: 'Statistiques', ht: 'Estatistik' }), value: selected.isVIP ? t({ fr: 'Fidèle', ht: 'Fidèl' }) : t({ fr: 'Régulier', ht: 'Regilye' }), sub: selected.isVIP ? `+${VIP_THRESHOLD / 1000}k HTG` : `< ${VIP_THRESHOLD / 1000}k HTG`, color: selected.isVIP ? 'text-amber-400' : 'text-[var(--color-muted)]', bg: selected.isVIP ? 'bg-amber-500/10' : 'bg-[var(--color-surface)]' },
                  ].map(({ label, value, sub, color, bg }) => (
                    <div key={label as string} className={`rounded-surface border border-[var(--color-border)] ${bg} p-4 backdrop-blur-xl`}>
                      <p className="text-note uppercase tracking-widest text-[var(--color-muted)]">{label}</p>
                      <p className={`mt-1.5 text-xl font-bold ${color}`}>{value}</p>
                      <p className="mt-0.5 text-xs text-[var(--color-muted)]">{sub}</p>
                    </div>
                  ))}
                </div>
              </section>

              {/* ── Credit/Debt section ── */}
              {openCredits.length > 0 && (
                <section className="rounded-surface border border-red-500/20 bg-red-500/5 p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-widest text-red-400">{t({ fr: 'Créances en cours', ht: 'Kreyans an kou' })}</p>
                    <span className="rounded-full bg-red-500/15 px-3 py-1 text-xs font-bold text-red-400">{fmtTotal(totalDebtActive)}</span>
                  </div>
                  <div className="space-y-2">
                    {openCredits.map(cc => (
                      <div key={cc.id} className="flex items-center justify-between rounded-2xl bg-[var(--color-surface)] px-4 py-3">
                        <div>
                          <p className="font-mono text-xs text-[var(--color-muted)]">{cc.invoice_number ?? '—'}</p>
                          <p className="text-note text-[var(--color-muted)]">{new Date(cc.created_at).toLocaleDateString('fr-FR')} · {daysSince(cc.created_at)} {t({ fr: 'jours', ht: 'jou' })}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          {/* Reste dû dans la devise de la vente ; le montant
                              facturé en rappel quand un acompte a été versé. */}
                          <div className="text-right">
                            <p className="font-bold text-red-400">{cc.due === null ? '…' : fmt(cc.due, cc.currency)}</p>
                            {cc.due !== null && cc.due < cc.amount && (
                              <p className="text-note text-[var(--color-muted)]">{t({ fr: 'sur ', ht: 'sou ' })}{fmt(cc.amount, cc.currency)}</p>
                            )}
                          </div>
                          <button onClick={() => handlePayCredit(cc.id)} disabled={busyCredit.has(cc.id)}
                            className="rounded-xl bg-accent px-3 py-1.5 text-xs font-bold text-accent-ink transition hover:bg-accent-h disabled:opacity-50">
                            {busyCredit.has(cc.id) ? '…' : t({ fr: 'Encaisser', ht: 'Touche' })}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* ── Transaction history ── */}
              <section className="rounded-surface border border-[var(--color-border)] bg-[var(--color-surface)] backdrop-blur-xl">
                <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
                  <p className="text-xs font-semibold uppercase tracking-widest text-[var(--color-muted)]">
                    {t({ fr: 'Historique Transactions', ht: 'Istorik Tranzaksyon' })} ({invoices.length})
                  </p>
                  {detailLoad && <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[#001F3F]" />}
                </div>

                {invoices.length === 0 ? (
                  <p className="py-10 text-center text-sm text-[var(--color-muted)]">{t({ fr: 'Aucune transaction enregistrée', ht: 'Okenn tranzaksyon anregistre' })}</p>
                ) : (
                  <div className="divide-y divide-[var(--color-border)]">
                    {invoices.map(inv => (
                      <div key={inv.invoice_number} className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-slate-50">
                        {/* Icon — `sales.payment_status` est l'énum payment_status_type
                            (paid, credit, pending…) : « Payé » ne sort jamais de la base. */}
                        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm ${inv.payment_status === 'paid' ? 'bg-emerald-500/15' : 'bg-blue-500/15'}`}>
                          {inv.payment_status === 'paid'
                            ? <CheckCircle2 className="h-5 w-5 text-success" strokeWidth={1.8} aria-hidden />
                            : <FileText className="h-5 w-5 text-info" strokeWidth={1.8} aria-hidden />}
                        </div>
                        {/* Info */}
                        <div className="min-w-0 flex-1">
                          <p className="font-mono text-xs font-semibold text-[var(--color-text)]">{inv.invoice_number}</p>
                          <p className="text-note text-[var(--color-muted)]">
                            {new Date(inv.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                            {' · '}{inv.payment_method}
                            {' · '}{inv.itemCount} {t({ fr: 'articles', ht: 'atik' })}
                          </p>
                        </div>
                        {/* Amount + Status */}
                        <div className="text-right">
                          <p className="font-bold text-[var(--color-text)]">{fmt(inv.total, inv.currency)}</p>
                          <span className={`text-note font-semibold ${inv.payment_status === 'paid' ? 'text-emerald-400' : 'text-blue-400'}`}>
                            {t(statusLabel(inv.payment_status))}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* History total */}
                <div className="flex items-center justify-between border-t border-[var(--color-border)] px-5 py-3">
                  <span className="text-xs text-[var(--color-muted)]">{invoices.length} {t({ fr: 'factures', ht: 'fakti' })}</span>
                  <span className="text-sm font-bold text-primary">
                    {t({ fr: 'Total: ', ht: 'Total: ' })}{fmtTotal(historyTotal)}
                  </span>
                </div>
              </section>

              {/* ── Documents rattachés (§37) ──────────────────────────────
                  Après l'historique : ce qu'on vient chercher sur une fiche
                  client, c'est d'abord ce qu'il doit et ce qu'il a acheté. */}
              <EntityDocuments
                entityType="customer"
                entityId={selected.id}
                entityName={selected.name}
              />

            </div>{/* end detail content */}
          </div>
        )}
      </main>

      {/* ════ Print section — portail, enfant direct de <body> ════
          À l'écran : `display:none`. À l'impression, globals.css affiche
          #pp-print-root (display:block !important) et masque tout le reste.
          Monté dès qu'un client est choisi : le bouton « Imprimer » n'existe
          que dans ce cas, le bloc est donc toujours là quand print() part. */}
      {isMounted && selected && createPortal(
        <div id="pp-print-root" style={{ display: 'none' }}>
          <div style={{ fontFamily: 'sans-serif', color: '#111', padding: 32 }}>
            <div style={{ borderBottom: '2px solid #111', paddingBottom: 16, marginBottom: 24 }}>
              <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>{t({ fr: 'ProfitPilot — Rapport Client', ht: 'ProfitPilot — Rapò Kliyan' })}</h1>
              <p style={{ margin: '4px 0 0', color: '#555', fontSize: 13 }}>{t({ fr: 'Imprimé le ', ht: 'Enprime le ' })}{new Date().toLocaleDateString('fr-FR')}</p>
            </div>
            <h2 style={{ fontSize: 20, marginBottom: 4 }}>{selected.name}</h2>
            <p style={{ color: '#555', fontSize: 13, marginBottom: 4 }}>{t({ fr: 'Tél. ', ht: 'Tel. ' })}{selected.phone ?? '—'} &nbsp;·&nbsp; {t({ fr: 'E-mail ', ht: 'Imèl ' })}{selected.email ?? '—'}</p>
            <p style={{ color: '#555', fontSize: 13, marginBottom: 24 }}>{t({ fr: 'Client depuis ', ht: 'Kliyan depi ' })}{new Date(selected.created_at).toLocaleDateString('fr-FR')}</p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 32 }}>
              {[[t({ fr: 'Total Achats', ht: 'Total Acha' }), fmtTotal(selected.totalPurchases, selected.purchasesPending)], [t({ fr: 'Dette Active', ht: 'Dèt Aktif' }), fmtTotal(selected.outstanding_balance, selected.debtPending)], [t({ fr: 'Nombre de Ventes', ht: 'Nòm Ventes' }), String(selected.saleCount)]].map(([l, v]) => (
                <div key={l as string} style={{ border: '1px solid #ddd', borderRadius: 12, padding: 16 }}>
                  <p style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', marginBottom: 4 }}>{l}</p>
                  <p style={{ fontSize: 20, fontWeight: 700 }}>{v}</p>
                </div>
              ))}
            </div>

            <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>{t({ fr: 'Historique Transactions', ht: 'Istorik Tranzaksyon' })}</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f5f5f5' }}>
                  {[t({ fr: 'Date', ht: 'Dat' }), t({ fr: 'Numéro Facture', ht: 'Nimewo Fakti' }), t({ fr: 'Méthode', ht: 'Metòd' }), t({ fr: 'Montant', ht: 'Montan' }), t({ fr: 'Statut', ht: 'Estati' })].map(h => (
                    <th key={h as string} style={{ textAlign: 'left', padding: '8px 12px', fontSize: 11, textTransform: 'uppercase', color: '#555' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv, i) => (
                  <tr key={inv.invoice_number} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={{ padding: '8px 12px' }}>{new Date(inv.date).toLocaleDateString('fr-FR')}</td>
                    <td style={{ padding: '8px 12px', fontFamily: 'monospace' }}>{inv.invoice_number}</td>
                    <td style={{ padding: '8px 12px' }}>{inv.payment_method}</td>
                    <td style={{ padding: '8px 12px', fontWeight: 600 }}>{fmt(inv.total, inv.currency)}</td>
                    <td style={{ padding: '8px 12px', color: inv.payment_status === 'paid' ? '#16a34a' : '#1d4ed8' }}>{t(statusLabel(inv.payment_status))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ marginTop: 32, fontSize: 11, color: '#aaa', textAlign: 'center' }}>{t({ fr: 'ProfitPilot · Rapport généré automatiquement', ht: 'ProfitPilot · Rapò otomatikman' })}</p>
          </div>
        </div>,
        document.body,
      )}

      {/* ── Modals ── */}
      {showModal && (
        <ClientModal
          client={editClient}
          onClose={() => { setShowModal(false); setEditClient(null); }}
          onSaved={loadClients}
        />
      )}
      {deleteTarget && (
        <DeleteModal
          client={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => handleDeleteConfirm(deleteTarget)}
        />
      )}
    </div>
  );
}

// ── Page root (wraps Suspense for useSearchParams) ────────────────────────────

export default function ClientsPage() {
  return (
    <ProtectedRoute>
      <Suspense fallback={
        <div className="flex h-screen items-center justify-center bg-[var(--color-bg)]">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[#001F3F]" />
        </div>
      }>
        <ClientsCRMInner />
      </Suspense>
    </ProtectedRoute>
  );
}
