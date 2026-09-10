'use client';

import { Suspense, useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import { useLanguage } from '../../components/LanguageWrapper';
import { toast } from 'sonner';
import {
  listHrEmployees,
  upsertHrEmployee,
  deleteHrEmployee,
  type HrEmployee,
  type EmployeeStatus,
  type UpsertEmployeeInput,
} from '../actions/hr-employees';
import { sendHrInvitation } from '../actions/invitations';
import { Button, FirstRun, NoResult, closestMatch } from '../../components/ds';
import { EntityDocuments } from '../../components/documents/EntityDocuments';
// La fiche employé annonçait ses champs par des émojis (📞 ✉️ 🏢 📅 ⏳ 🔑).
// Une icône de contour, à épaisseur constante, prend la couleur du texte —
// un émoji, non : il reste jaune vif à côté d'un libellé gris (§3.5).
import { Briefcase, CalendarDays, Clock, Hash, Mail, Phone } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

type FilterStatus = 'all' | EmployeeStatus;

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<EmployeeStatus, { label: string; color: string; dot: string }> = {
  actif:   { label: 'Actif',    color: 'text-emerald-600 bg-emerald-50 border-emerald-200',  dot: 'bg-emerald-500' },
  inactif: { label: 'Inactif',  color: 'text-slate-500   bg-slate-50   border-slate-200',    dot: 'bg-slate-400'   },
  conge:   { label: 'En congé', color: 'text-amber-600   bg-amber-50   border-amber-200',    dot: 'bg-amber-400'   },
};

const POSITIONS = [
  'Gérant', 'Caissier', 'Vendeur', 'Comptable', 'Magasinier',
  'Livreur', 'Agent de sécurité', 'Technicien', 'Assistant administratif',
  'Superviseur', 'Directeur', 'RH', 'Marketing', 'Autre',
];

// Aucun employé de démonstration (audit §1.1, §5.10). Cinq salariés fictifs
// s'affichaient avec leurs postes et leurs salaires — 35 000 HTG pour l'un —
// jusqu'à ce que la base réponde, et restaient là si elle ne répondait pas.
// Un registre RH qui invente du personnel invente une masse salariale.

// ── Helpers ───────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  'bg-primary/20 text-primary',
  'bg-blue-500/20 text-blue-700',
  'bg-emerald-500/20 text-emerald-700',
  'bg-orange-500/20 text-orange-700',
  'bg-pink-500/20 text-pink-700',
  'bg-cyan-500/20 text-cyan-700',
  'bg-violet-500/20 text-violet-700',
];
function avatarColor(name: string) {
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[h];
}

function initials(emp: HrEmployee) {
  return ((emp.first_name[0] ?? '') + (emp.last_name[0] ?? '')).toUpperCase() || '?';
}

function fullName(emp: HrEmployee) { return `${emp.first_name} ${emp.last_name}`; }

function fmt(n: number, currency = 'HTG') {
  if (currency === 'USD') return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
  return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n) + ' HTG';
}

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function yearsWorked(hireDate: string | null) {
  if (!hireDate) return null;
  const ms = Date.now() - new Date(hireDate).getTime();
  const years = ms / (365.25 * 24 * 60 * 60 * 1000);
  if (years < 1) {
    const months = Math.floor(years * 12);
    return months <= 0 ? 'Moins d\'un mois' : `${months} mois`;
  }
  return `${years.toFixed(1)} an${years >= 2 ? 's' : ''}`;
}

// ── InputField ────────────────────────────────────────────────────────────────

const INP = 'w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm text-[var(--color-text)] outline-none ring-1 ring-transparent transition placeholder:text-slate-400 focus:ring-primary/20 focus:border-primary/50';

// ── EmployeeModal ─────────────────────────────────────────────────────────────

function EmployeeModal({
  employee, onClose, onSaved,
}: { employee: HrEmployee | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<UpsertEmployeeInput>({
    id:              employee?.id,
    first_name:      employee?.first_name ?? '',
    last_name:       employee?.last_name  ?? '',
    email:           employee?.email      ?? '',
    phone:           employee?.phone      ?? '',
    position:        employee?.position   ?? '',
    status:          employee?.status     ?? 'actif',
    hire_date:       employee?.hire_date  ?? '',
    salary:          employee?.salary     ?? undefined,
    salary_currency: employee?.salary_currency ?? 'HTG',
    notes:           employee?.notes      ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  function set<K extends keyof UpsertEmployeeInput>(k: K, v: UpsertEmployeeInput[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.first_name.trim()) return setErr('Le prénom est obligatoire.');
    if (!form.last_name.trim())  return setErr('Le nom est obligatoire.');
    setSaving(true); setErr('');
    try {
      await upsertHrEmployee(form);
      onSaved(); onClose();
    } catch (e: any) { setErr(e.message); }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
      <div className="w-full max-w-lg overflow-hidden rounded-surface border border-[var(--color-border)] bg-white shadow-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-5 flex-shrink-0">
          <div>
            <p className="text-xs uppercase tracking-widest text-[var(--color-muted)]">
              {employee ? 'Modifier' : 'Nouvel Employé'}
            </p>
            <h3 className="mt-0.5 text-xl font-semibold text-primary">
              {employee ? `${employee.first_name} ${employee.last_name}` : 'Ajouter un Employé'}
            </h3>
          </div>
          <button onClick={onClose} className="min-h-touch min-w-touch inline-flex items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-[var(--color-muted)] transition hover:bg-slate-100">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Body */}
        <form onSubmit={submit} className="overflow-y-auto flex-1">
          <div className="space-y-4 p-6">

            {/* Name row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-[var(--color-muted)]">Prénom *</label>
                <input value={form.first_name} onChange={e => set('first_name', e.target.value)} placeholder="Marie" className={INP} required />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-[var(--color-muted)]">Nom *</label>
                <input value={form.last_name} onChange={e => set('last_name', e.target.value)} placeholder="Josette" className={INP} required />
              </div>
            </div>

            {/* Contact row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-[var(--color-muted)]">Téléphone</label>
                <input value={form.phone ?? ''} onChange={e => set('phone', e.target.value)} placeholder="+509 XXXX-XXXX" className={INP} />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-[var(--color-muted)]">Email</label>
                <input value={form.email ?? ''} onChange={e => set('email', e.target.value)} type="email" placeholder="email@example.com" className={INP} />
              </div>
            </div>

            {/* Position + Status */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-[var(--color-muted)]">Poste</label>
                <select value={form.position ?? ''} onChange={e => set('position', e.target.value)} className={INP}>
                  <option value="">— Sélectionner —</option>
                  {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-[var(--color-muted)]">Statut</label>
                <select value={form.status} onChange={e => set('status', e.target.value as EmployeeStatus)} className={INP}>
                  <option value="actif">Actif</option>
                  <option value="inactif">Inactif</option>
                  <option value="conge">En congé</option>
                </select>
              </div>
            </div>

            {/* Hire date + Salary */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-[var(--color-muted)]">Date d&apos;embauche</label>
                <input value={form.hire_date ?? ''} onChange={e => set('hire_date', e.target.value)} type="date" className={INP} />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-[var(--color-muted)]">Salaire</label>
                <div className="flex gap-2">
                  <input
                    value={form.salary ?? ''}
                    onChange={e => set('salary', e.target.value ? Number(e.target.value) : null)}
                    type="number" min="0" step="100" placeholder="0"
                    className={`${INP} flex-1`}
                  />
                  <select value={form.salary_currency} onChange={e => set('salary_currency', e.target.value)} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-3 text-sm outline-none focus:border-primary/50">
                    <option value="HTG">HTG</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-[var(--color-muted)]">Notes</label>
              <textarea value={form.notes ?? ''} onChange={e => set('notes', e.target.value)} rows={2} placeholder="Notes internes…" className={`${INP} resize-none`} />
            </div>

            {err && <p className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs text-red-400">{err}</p>}
          </div>

          {/* Footer */}
          <div className="flex gap-3 border-t border-[var(--color-border)] px-6 py-4">
            <button type="button" onClick={onClose} className="flex-1 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] py-3 text-sm font-semibold text-[var(--color-muted)] transition hover:bg-slate-100">
              Annuler
            </button>
            <button type="submit" disabled={saving} className="flex-1 rounded-2xl bg-primary py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-h disabled:opacity-50">
              {/* « Ajouter Employé » répétait mot pour mot le sous-titre de
                  la fenêtre juste au-dessus (audit §9, contrôle 1). */}
              {saving ? 'Enregistrement…' : employee ? 'Enregistrer les changements' : "Ajouter l'employé"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── DeleteModal ───────────────────────────────────────────────────────────────

function DeleteModal({ employee, onClose, onConfirm }: {
  employee: HrEmployee; onClose: () => void; onConfirm: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
      <div className="w-full max-w-sm overflow-hidden rounded-surface border border-[var(--color-border)] bg-white p-6 shadow-2xl">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/15">
          <svg className="h-5 w-5 text-red-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
        </div>
        <h3 className="text-lg font-semibold text-primary">Supprimer l&apos;employé ?</h3>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          <span className="font-medium text-[var(--color-text)]">{fullName(employee)}</span>
          {' '}sera retiré du registre RH. Cette action est irréversible.
        </p>
        <div className="mt-5 flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] py-2.5 text-sm font-semibold text-[var(--color-muted)] transition hover:bg-slate-100">Annuler</button>
          <button onClick={async () => { setBusy(true); await onConfirm(); setBusy(false); }} disabled={busy}
            className="flex-1 rounded-2xl bg-red-600 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50">
            {busy ? 'Suppression…' : 'Oui, Supprimer'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── InviteModal ───────────────────────────────────────────────────────────────

function InviteModal({ employee, onClose }: { employee: HrEmployee; onClose: () => void }) {
  const [email, setEmail] = useState(employee.email ?? '');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');

  async function handleInvite() {
    if (!email.trim()) return;
    setBusy(true); setErr('');
    try {
      await sendHrInvitation({
        employeeId: employee.id.startsWith('demo-') ? undefined : employee.id,
        email:      email.trim(),
        firstName:  employee.first_name,
        lastName:   employee.last_name,
      });
      setDone(true);
    } catch (e: any) { setErr(e.message); }
    setBusy(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
      <div className="w-full max-w-sm overflow-hidden rounded-surface border border-[var(--color-border)] bg-white p-6 shadow-2xl">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-500/15">
          <svg className="h-5 w-5 text-blue-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
        </div>

        {done ? (
          <>
            <h3 className="text-lg font-semibold text-primary">Invitation envoyée</h3>
            <p className="mt-2 text-sm text-[var(--color-muted)]">
              <span className="font-medium text-[var(--color-text)]">{fullName(employee)}</span> recevra un accès à ProfitPilot.
            </p>
            <button onClick={onClose} className="mt-5 w-full rounded-2xl bg-primary py-2.5 text-sm font-semibold text-white transition hover:bg-primary-h">Fermer</button>
          </>
        ) : (
          <>
            <h3 className="text-lg font-semibold text-primary">Inviter sur ProfitPilot</h3>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              Donner accès à <span className="font-medium text-[var(--color-text)]">{fullName(employee)}</span> pour qu&apos;il puisse se connecter.
            </p>
            <div className="mt-4">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-[var(--color-muted)]">Email</label>
              <input
                value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleInvite()}
                type="email"
                placeholder="email@example.com"
                className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm outline-none focus:border-primary/50"
              />
            </div>
            {err && <p className="mt-2 rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-400">{err}</p>}
            <div className="mt-4 flex gap-3">
              <button onClick={onClose} className="flex-1 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] py-2.5 text-sm font-semibold text-[var(--color-muted)] transition hover:bg-slate-100">Annuler</button>
              <button onClick={handleInvite} disabled={busy || !email.trim()} className="flex-1 rounded-2xl bg-primary py-2.5 text-sm font-semibold text-white transition hover:bg-primary-h disabled:opacity-50">
                {busy ? 'Envoi…' : 'Inviter'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

function EmployeesPageInner() {
  const [employees,    setEmployees]    = useState<HrEmployee[]>([]);
  const [selectedId,   setSelectedId]   = useState<string | null>(null);
  const [loading,      setLoading]      = useState(true);

  const [search,       setSearch]       = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [filterPos,    setFilterPos]    = useState('');

  const [showModal,    setShowModal]    = useState(false);
  const [editTarget,   setEditTarget]   = useState<HrEmployee | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<HrEmployee | null>(null);
  const [inviteTarget, setInviteTarget] = useState<HrEmployee | null>(null);

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listHrEmployees();
      setEmployees(data);
      setSelectedId(prev => (prev && data.some(e => e.id === prev) ? prev : data[0]?.id ?? null));
    } catch {
      // Une erreur de chargement laisse le registre vide, pas peuplé de fictifs.
      setEmployees([]);
      setSelectedId(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Derived ───────────────────────────────────────────────────────────────

  const positions = useMemo(() => {
    const pos = new Set(employees.map(e => e.position).filter(Boolean) as string[]);
    return [...pos].sort();
  }, [employees]);

  const filtered = useMemo(() => {
    let list = employees;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(e =>
        fullName(e).toLowerCase().includes(q) ||
        e.email?.toLowerCase().includes(q) ||
        e.phone?.includes(q) ||
        e.position?.toLowerCase().includes(q)
      );
    }
    if (filterStatus !== 'all') list = list.filter(e => e.status === filterStatus);
    if (filterPos) list = list.filter(e => e.position === filterPos);
    return list;
  }, [employees, search, filterStatus, filterPos]);

  const selected = useMemo(() => employees.find(e => e.id === selectedId) ?? null, [employees, selectedId]);

  const stats = useMemo(() => ({
    total:   employees.length,
    actif:   employees.filter(e => e.status === 'actif').length,
    inactif: employees.filter(e => e.status === 'inactif').length,
    conge:   employees.filter(e => e.status === 'conge').length,
    masseSalariale: employees.filter(e => e.status === 'actif' && e.salary_currency === 'HTG').reduce((s, e) => s + (e.salary ?? 0), 0),
  }), [employees]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  async function handleDelete(emp: HrEmployee) {
    try {
      await deleteHrEmployee(emp.id);
      toast.success(`${fullName(emp)} supprimé`);
      setDeleteTarget(null);
      if (selectedId === emp.id) setSelectedId(null);
      await load();
    } catch (e: any) { toast.error(e.message); }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--color-bg)]">

      {/* ════════════════════════════════
          LEFT PANEL — Liste
      ════════════════════════════════ */}
      <aside className={`flex w-full flex-col border-r border-[var(--color-border)] md:w-80 lg:w-96 ${selectedId ? 'hidden md:flex' : 'flex'}`}>

        {/* Header */}
        <div className="border-b border-[var(--color-border)] px-5 py-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-[var(--color-muted)]">RH</p>
              <h1 className="mt-0.5 text-xl font-semibold text-primary">Employés</h1>
            </div>
            <button
              onClick={() => { setEditTarget(null); setShowModal(true); }}
              className="flex items-center gap-1.5 rounded-2xl bg-primary px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-primary-h active:scale-95"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
              Ajouter
            </button>
          </div>

          {/* Search */}
          <div className="relative mt-3">
            <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted)]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher employé…"
              className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] py-2.5 pl-9 pr-4 text-sm text-[var(--color-text)] outline-none placeholder:text-slate-400 focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
            />
          </div>

          {/* Status filters */}
          <div className="mt-3 flex gap-1.5">
            {(['all', 'actif', 'inactif', 'conge'] as const).map((k) => (
              <button
                key={k}
                onClick={() => setFilterStatus(k)}
                className={`flex-1 rounded-xl py-1.5 text-xs font-semibold transition ${filterStatus === k ? 'bg-primary text-white' : 'bg-[var(--color-surface)] text-[var(--color-muted)] hover:bg-slate-100'}`}
              >
                {k === 'all' ? 'Tous' : k === 'conge' ? 'Congé' : STATUS_CONFIG[k].label}
              </button>
            ))}
          </div>

          {/* Position filter */}
          {positions.length > 0 && (
            <select
              value={filterPos}
              onChange={e => setFilterPos(e.target.value)}
              className="mt-2 w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs text-[var(--color-muted)] outline-none focus:border-primary/50"
            >
              <option value="">Tous les postes</option>
              {positions.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          )}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto py-2">
          {loading ? (
            <div className="flex justify-center py-10">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[#001F3F]" />
            </div>
          ) : employees.length === 0 ? (
            /* Registre neuf : beaucoup de marchands travaillent seuls, et c'est
               une situation normale — l'écran ne la présente pas comme un manque. */
            <FirstRun
              title="Vous êtes seul aux commandes"
              hint="Ajoutez un employé quand vous embaucherez : postes, salaires et congés se suivront ici, et vous pourrez lui donner un accès à l'application."
              action={
                <Button variant="accent" block onClick={() => { setEditTarget(null); setShowModal(true); }}>
                  Ajouter un employé
                </Button>
              }
            />
          ) : filtered.length === 0 ? (
            search ? (
              <NoResult
                query={search}
                noun="employé"
                suggestion={closestMatch(search, employees.map(fullName))}
                onUseSuggestion={setSearch}
                onClear={() => setSearch('')}
              />
            ) : (
              <p className="px-4 py-10 text-center text-body text-[var(--color-muted)]">
                Aucun employé ne correspond à ce filtre.
              </p>
            )
          ) : (
            filtered.map(emp => (
              <button
                key={emp.id}
                onClick={() => setSelectedId(emp.id)}
                className={`w-full px-4 py-3.5 text-left transition ${selectedId === emp.id ? 'bg-nav-active' : 'hover:bg-slate-50'}`}
              >
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-sm font-bold ${avatarColor(fullName(emp))}`}>
                    {initials(emp)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-[var(--color-text)]">{fullName(emp)}</p>
                    </div>
                    <p className="truncate text-xs text-[var(--color-muted)]">
                      {emp.position ?? 'Sans poste'}{emp.phone ? ` · ${emp.phone}` : ''}
                    </p>
                  </div>
                  <span className={`shrink-0 flex items-center gap-1 rounded-full border px-2 py-0.5 text-note font-semibold ${STATUS_CONFIG[emp.status].color}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${STATUS_CONFIG[emp.status].dot}`} />
                    {STATUS_CONFIG[emp.status].label}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-[var(--color-border)] px-4 py-3 text-xs text-[var(--color-muted)]">
          {filtered.length} employé{filtered.length > 1 ? 's' : ''} · {stats.actif} actif{stats.actif > 1 ? 's' : ''}
        </div>
      </aside>

      {/* ════════════════════════════════
          RIGHT PANEL — Détail
      ════════════════════════════════ */}
      <main className={`flex flex-1 flex-col overflow-hidden ${!selectedId ? 'hidden md:flex' : 'flex'}`}>
        {!selected ? (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <svg className="mb-4 h-16 w-16 text-slate-200" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
            </svg>
            <p className="text-[var(--color-muted)]">Sélectionnez un employé pour voir son profil</p>
          </div>
        ) : (
          <div className="flex flex-1 flex-col overflow-y-auto">

            {/* Detail header */}
            <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-[var(--color-border)] bg-white/95 px-6 py-4 backdrop-blur-xl">
              {/* Back on mobile */}
              <button onClick={() => setSelectedId(null)} className="mr-1 flex items-center gap-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs font-medium text-[var(--color-muted)] transition hover:bg-slate-100 md:hidden">
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                Retour
              </button>

              {/* Avatar */}
              <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-base font-bold ${avatarColor(fullName(selected))}`}>
                {initials(selected)}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold text-primary">{fullName(selected)}</h2>
                  <span className={`flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_CONFIG[selected.status].color}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${STATUS_CONFIG[selected.status].dot}`} />
                    {STATUS_CONFIG[selected.status].label}
                  </span>
                </div>
                <p className="truncate text-xs text-[var(--color-muted)]">
                  {selected.position ?? 'Poste non défini'}
                  {selected.hire_date ? ` · Embauché le ${fmtDate(selected.hire_date)}` : ''}
                </p>
              </div>

              {/* Actions */}
              <div className="flex shrink-0 items-center gap-1.5">
                {/* Invite */}
                <button
                  onClick={() => setInviteTarget(selected)}
                  title="Inviter sur ProfitPilot"
                  className="flex items-center gap-1.5 rounded-2xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-600 transition hover:bg-blue-100"
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                  <span className="hidden sm:block">Inviter</span>
                </button>
                {/* Edit */}
                <button
                  onClick={() => { setEditTarget(selected); setShowModal(true); }}
                  title="Modifier"
                  className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-[var(--color-muted)] transition hover:bg-slate-100"
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                </button>
                {/* Delete */}
                <button
                  onClick={() => setDeleteTarget(selected)}
                  title="Supprimer"
                  className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-[var(--color-muted)] transition hover:bg-red-500/15 hover:text-red-400"
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              </div>
            </div>

            {/* Detail content */}
            <div className="flex-1 space-y-6 px-6 py-6">

              {/* ── Profil ── */}
              <section className="rounded-surface border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
                <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-[var(--color-muted)]">Profil Employé</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {[
                    { icon: Phone, label: 'Téléphone',    value: selected.phone    ?? '—' },
                    { icon: Mail, label: 'Email',         value: selected.email    ?? '—' },
                    { icon: Briefcase, label: 'Poste',         value: selected.position ?? '—' },
                    { icon: CalendarDays, label: 'Date d\'embauche', value: fmtDate(selected.hire_date) },
                    { icon: Clock, label: 'Ancienneté',    value: yearsWorked(selected.hire_date) ?? '—' },
                    { icon: Hash, label: 'ID',            value: selected.id.slice(0, 8) + '…' },
                  ].map(({ icon: Icon, label, value }) => (
                    <div key={label} className="rounded-2xl bg-white border border-[var(--color-border)] p-3">
                      <Icon className="mb-1 h-5 w-5 text-muted" strokeWidth={1.8} aria-hidden />
                      <p className="text-note uppercase tracking-widest text-[var(--color-muted)]">{label}</p>
                      <p className="mt-0.5 break-all text-sm font-medium text-[var(--color-text)]">{value}</p>
                    </div>
                  ))}
                </div>
              </section>

              {/* ── Stats cards ── */}
              <section>
                <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-[var(--color-muted)]">Rémunération & Statut</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-surface border border-[var(--color-border)] bg-primary/5 p-4">
                    <p className="text-note uppercase tracking-widest text-[var(--color-muted)]">Salaire Mensuel</p>
                    <p className="mt-1.5 text-xl font-bold text-primary">
                      {selected.salary != null ? fmt(selected.salary, selected.salary_currency) : '—'}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--color-muted)]">Par mois</p>
                  </div>
                  <div className={`rounded-surface border p-4 ${STATUS_CONFIG[selected.status].color.replace('text-', 'border-').replace(' bg-', ' bg-').split(' ')[2]} bg-opacity-30`}
                    style={{ background: selected.status === 'actif' ? 'rgba(16,185,129,0.07)' : selected.status === 'conge' ? 'rgba(245,158,11,0.07)' : 'rgba(100,116,139,0.07)' }}
                  >
                    <p className="text-note uppercase tracking-widest text-[var(--color-muted)]">Statut Actuel</p>
                    <p className={`mt-1.5 text-xl font-bold ${selected.status === 'actif' ? 'text-emerald-600' : selected.status === 'conge' ? 'text-amber-600' : 'text-slate-500'}`}>
                      {STATUS_CONFIG[selected.status].label}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--color-muted)]">
                      {selected.status === 'actif' ? 'En poste' : selected.status === 'conge' ? 'Absent temporaire' : 'Plus actif'}
                    </p>
                  </div>
                  <div className="rounded-surface border border-[var(--color-border)] bg-cyan-500/5 p-4">
                    <p className="text-note uppercase tracking-widest text-[var(--color-muted)]">Salaire Annuel</p>
                    <p className="mt-1.5 text-xl font-bold text-cyan-600">
                      {selected.salary != null ? fmt(selected.salary * 12, selected.salary_currency) : '—'}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--color-muted)]">Estimation</p>
                  </div>
                  <div className="rounded-surface border border-[var(--color-border)] bg-violet-500/5 p-4">
                    <p className="text-note uppercase tracking-widest text-[var(--color-muted)]">Ancienneté</p>
                    <p className="mt-1.5 text-xl font-bold text-violet-600">
                      {yearsWorked(selected.hire_date) ?? '—'}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--color-muted)]">Depuis l&apos;embauche</p>
                  </div>
                </div>
              </section>

              {/* ── Notes ── */}
              {selected.notes && (
                <section className="rounded-surface border border-amber-200 bg-amber-50 p-5">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-amber-600">Notes internes</p>
                  <p className="text-sm text-slate-700">{selected.notes}</p>
                </section>
              )}

              {/* ── Invite CTA ── */}
              {!selected.id.startsWith('demo-') && (
                <section className="rounded-surface border border-blue-200 bg-blue-50/60 p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-primary">Accès ProfitPilot</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        Donnez un accès à {selected.first_name} pour gérer la boutique depuis son téléphone.
                      </p>
                    </div>
                    <button
                      onClick={() => setInviteTarget(selected)}
                      className="flex-shrink-0 ml-4 flex items-center gap-2 rounded-2xl bg-primary px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-primary-h"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                      Inviter
                    </button>
                  </div>
                </section>
              )}

              {/* ── Documents rattachés (§37) ──────────────────────────────
                  Les lignes de démonstration n'ont pas d'identifiant réel :
                  leur rattacher un document échouerait en base, sur un UUID
                  que `demo-` n'est pas. */}
              {!selected.id.startsWith('demo-') && (
                <EntityDocuments
                  entityType="employee"
                  entityId={selected.id}
                  entityName={fullName(selected)}
                />
              )}

              {/* ── Équipe stats ── */}
              <section className="rounded-surface border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
                <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-[var(--color-muted)]">Vue d&apos;ensemble — Équipe</p>
                <div className="grid grid-cols-4 gap-3 text-center">
                  {[
                    { label: 'Total',   value: stats.total,   color: 'text-primary' },
                    { label: 'Actifs',  value: stats.actif,   color: 'text-emerald-600' },
                    { label: 'Congé',   value: stats.conge,   color: 'text-amber-600' },
                    { label: 'Inactifs',value: stats.inactif, color: 'text-slate-400' },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="rounded-2xl border border-[var(--color-border)] bg-white py-3">
                      <p className={`text-2xl font-bold ${color}`}>{value}</p>
                      <p className="text-note text-[var(--color-muted)]">{label}</p>
                    </div>
                  ))}
                </div>
                {stats.masseSalariale > 0 && (
                  <div className="mt-3 rounded-2xl border border-[var(--color-border)] bg-white px-4 py-3">
                    <p className="text-note uppercase tracking-widest text-[var(--color-muted)]">Masse Salariale Mensuelle (HTG)</p>
                    <p className="mt-1 text-lg font-bold text-primary">{fmt(stats.masseSalariale)}</p>
                  </div>
                )}
              </section>

            </div>
          </div>
        )}
      </main>

      {/* ── Modals ── */}
      {showModal && (
        <EmployeeModal
          employee={editTarget}
          onClose={() => { setShowModal(false); setEditTarget(null); }}
          onSaved={() => { load(); toast.success(editTarget ? 'Employé mis à jour' : 'Employé ajouté'); }}
        />
      )}
      {deleteTarget && (
        <DeleteModal
          employee={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => handleDelete(deleteTarget)}
        />
      )}
      {inviteTarget && (
        <InviteModal
          employee={inviteTarget}
          onClose={() => setInviteTarget(null)}
        />
      )}
    </div>
  );
}

// ── Export ────────────────────────────────────────────────────────────────────

export default function EmployeesPage() {
  return (
    <ProtectedRoute>
      <Suspense fallback={
        <div className="flex h-screen items-center justify-center bg-[var(--color-bg)]">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[#001F3F]" />
        </div>
      }>
        <EmployeesPageInner />
      </Suspense>
    </ProtectedRoute>
  );
}
