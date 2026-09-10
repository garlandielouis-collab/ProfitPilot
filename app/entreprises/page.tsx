'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Building2 } from 'lucide-react';
import {
  listCompanies,
  createCompany,
  updateCompany,
  deleteCompany,
  archiveCompany,
  restoreCompany,
  duplicateCompany,
  switchActiveCompany,
  type CompanyRow,
  type CreateCompanyInput,
} from '../actions/company';

// ─── helpers ─────────────────────────────────────────────────────────────────

function Spinner({ sm }: { sm?: boolean }) {
  return (
    <div className={`animate-spin rounded-full border-2 border-slate-200 border-t-[#001F3F] ${sm ? 'h-4 w-4' : 'h-6 w-6'}`} />
  );
}

function relDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

const SECTORS = [
  'Commerce', 'Restauration', 'Agriculture', 'Services', 'Santé',
  'Construction', 'Transport', 'Éducation', 'Technologie', 'Artisanat', 'Autre',
];

const CURRENCIES: Array<'HTG' | 'USD'> = ['HTG', 'USD'];

// ─── Company form modal ───────────────────────────────────────────────────────

type FormData = {
  name: string; sector: string; defaultCurrency: 'HTG' | 'USD';
  exchangeRate: string; country: string; timezone: string;
  email: string; phone: string; address: string; taxId: string;
};

const EMPTY_FORM: FormData = {
  name: '', sector: '', defaultCurrency: 'HTG', exchangeRate: '130',
  country: 'Haiti', timezone: 'America/Port-au-Prince',
  email: '', phone: '', address: '', taxId: '',
};

function toInput(f: FormData): CreateCompanyInput {
  return {
    name: f.name, sector: f.sector || undefined,
    defaultCurrency: f.defaultCurrency,
    exchangeRate: parseFloat(f.exchangeRate) || 130,
    country: f.country || 'Haiti',
    timezone: f.timezone || 'America/Port-au-Prince',
    email: f.email || undefined, phone: f.phone || undefined,
    address: f.address || undefined, taxId: f.taxId || undefined,
  };
}

function fromRow(r: CompanyRow): FormData {
  return {
    name: r.name, sector: r.sector ?? '',
    defaultCurrency: r.defaultCurrency,
    exchangeRate: String(r.exchangeRate),
    country: r.country, timezone: r.timezone,
    email: r.email ?? '', phone: r.phone ?? '',
    address: r.address ?? '', taxId: r.taxId ?? '',
  };
}

function CompanyModal({
  editing,
  onClose,
  onSaved,
}: {
  editing: CompanyRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FormData>(editing ? fromRow(editing) : EMPTY_FORM);
  const [error, setError] = useState('');
  const [pending, startPending] = useTransition();

  function field(k: keyof FormData) {
    return {
      value: form[k] as string,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
        setForm((p) => ({ ...p, [k]: e.target.value })),
    };
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError('Le nom est requis.'); return; }
    setError('');
    startPending(async () => {
      const res = editing
        ? await updateCompany({ id: editing.id, ...toInput(form) })
        : await createCompany(toInput(form));
      if ('error' in res && res.error) { setError(res.error); return; }
      onSaved();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 p-6">
          <h2 className="text-lg font-bold text-primary">
            {editing ? 'Modifier l\'entreprise' : 'Nouvelle entreprise'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
          )}

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-widest text-slate-400">
              Nom de l'entreprise *
            </label>
            <input {...field('name')} placeholder="Mon Entreprise SARL"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-primary/40 focus:bg-white" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-widest text-slate-400">Secteur</label>
              <select {...field('sector')}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-primary/40">
                <option value="">— Choisir —</option>
                {SECTORS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-widest text-slate-400">Devise</label>
              <select {...field('defaultCurrency')}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-primary/40">
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-widest text-slate-400">Taux de change (HTG/USD)</label>
              <input {...field('exchangeRate')} type="number" min="1" step="0.01"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-primary/40" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-widest text-slate-400">NIF / Tax ID</label>
              <input {...field('taxId')} placeholder="000-000-0"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-primary/40" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-widest text-slate-400">Email</label>
              <input {...field('email')} type="email" placeholder="contact@entreprise.ht"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-primary/40" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-widest text-slate-400">Téléphone</label>
              <input {...field('phone')} placeholder="+509 XX XX XXXX"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-primary/40" />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-widest text-slate-400">Adresse</label>
            <textarea {...field('address')} rows={2} placeholder="Rue des Miracles, Port-au-Prince"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-primary/40 resize-none" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-widest text-slate-400">Pays</label>
              <input {...field('country')}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-primary/40" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-widest text-slate-400">Fuseau horaire</label>
              <select {...field('timezone')}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-primary/40">
                <option value="America/Port-au-Prince">Port-au-Prince (UTC-5)</option>
                <option value="America/New_York">New York (UTC-5/-4)</option>
                <option value="America/Chicago">Chicago (UTC-6/-5)</option>
                <option value="America/Los_Angeles">Los Angeles (UTC-8/-7)</option>
                <option value="Europe/Paris">Paris (UTC+1/+2)</option>
                <option value="UTC">UTC</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">
              Annuler
            </button>
            <button type="submit" disabled={pending}
              className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white hover:bg-primary-h disabled:opacity-50">
              {pending && <Spinner sm />}
              {editing ? 'Enregistrer les changements' : "Créer l'entreprise"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Delete confirm modal ─────────────────────────────────────────────────────

function DeleteModal({ company, onClose, onDeleted }: { company: CompanyRow; onClose: () => void; onDeleted: () => void }) {
  const [pending, startPending] = useTransition();
  const [error, setError] = useState('');

  function handleDelete() {
    startPending(async () => {
      const res = await deleteCompany(company.id);
      if (res.error) { setError(res.error); return; }
      onDeleted();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-3xl bg-white shadow-2xl p-6">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50">
          <svg className="h-6 w-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </div>
        <h3 className="text-lg font-bold text-slate-800">Supprimer «&nbsp;{company.name}&nbsp;»&nbsp;?</h3>
        <p className="mt-2 text-sm text-slate-500">
          L'entreprise sera désactivée et masquée. Les données restent dans la base mais plus aucun utilisateur n'y aura accès.
        </p>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose} className="min-h-touch min-w-touch inline-flex items-center justify-center rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
            Annuler
          </button>
          <button onClick={handleDelete} disabled={pending}
            className="min-h-touch min-w-touch flex items-center gap-2 rounded-xl bg-red-500 px-4 py-2 text-sm font-bold text-white hover:bg-red-600 disabled:opacity-50">
            {pending && <Spinner sm />}
            Supprimer
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function EntreprisesPage() {
  const router = useRouter();
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [modal, setModal] = useState<'create' | 'edit' | 'delete' | null>(null);
  const [selected, setSelected] = useState<CompanyRow | null>(null);
  const [actionPending, startAction] = useTransition();
  const [actionTarget, setActionTarget] = useState<string | null>(null);
  const [toast, setToast] = useState('');

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  function load() {
    setLoading(true);
    listCompanies().then(setCompanies).finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  const visible = companies.filter((c) =>
    showArchived ? c.archivedAt !== null : c.archivedAt === null,
  );

  function doSwitch(c: CompanyRow) {
    setActionTarget(c.id + ':switch');
    startAction(async () => {
      await switchActiveCompany(c.id);
      showToast(`Entreprise active : ${c.name}`);
      router.refresh();
    });
  }

  function doArchive(c: CompanyRow) {
    setActionTarget(c.id + ':archive');
    startAction(async () => {
      const res = c.archivedAt ? await restoreCompany(c.id) : await archiveCompany(c.id);
      if (res.error) { showToast('Erreur : ' + res.error); return; }
      showToast(c.archivedAt ? `${c.name} restaurée.` : `${c.name} archivée.`);
      load();
    });
  }

  function doDuplicate(c: CompanyRow) {
    setActionTarget(c.id + ':dup');
    startAction(async () => {
      const res = await duplicateCompany(c.id);
      if ('error' in res) { showToast('Erreur : ' + res.error); return; }
      showToast(`Copie de ${c.name} créée.`);
      load();
    });
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[100] -translate-x-1/2 rounded-2xl bg-primary px-6 py-3 text-sm font-semibold text-white shadow-xl">
          {toast}
        </div>
      )}

      {/* Modals */}
      {(modal === 'create' || modal === 'edit') && (
        <CompanyModal
          editing={modal === 'edit' ? selected : null}
          onClose={() => { setModal(null); setSelected(null); }}
          onSaved={() => { setModal(null); setSelected(null); load(); showToast(modal === 'edit' ? 'Entreprise mise à jour.' : 'Entreprise créée !'); }}
        />
      )}
      {modal === 'delete' && selected && (
        <DeleteModal
          company={selected}
          onClose={() => { setModal(null); setSelected(null); }}
          onDeleted={() => { setModal(null); setSelected(null); load(); showToast('Entreprise supprimée.'); }}
        />
      )}

      {/* Header */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary">Mes entreprises</h1>
          <p className="mt-1 text-sm text-slate-500">
            {companies.filter((c) => c.archivedAt === null).length} entreprise{companies.filter((c) => c.archivedAt === null).length !== 1 ? 's' : ''} active{companies.filter((c) => c.archivedAt === null).length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowArchived((v) => !v)}
            className={`rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${showArchived ? 'border-primary bg-primary text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
            {showArchived ? '← Actives' : 'Archivées'}
          </button>
          <button
            onClick={() => setModal('create')}
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white hover:bg-primary-h">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nouvelle entreprise
          </button>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex h-48 items-center justify-center"><Spinner /></div>
      ) : visible.length === 0 ? (
        <div className="flex h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 text-slate-400">
          <Building2 className="mx-auto h-9 w-9 text-slate-300" strokeWidth={1.5} aria-hidden />
          <p className="mt-2 text-sm">
            {showArchived ? 'Aucune entreprise archivée.' : 'Aucune entreprise. Créez-en une !'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((c) => {
            const isLoading = (k: string) => actionPending && actionTarget === c.id + ':' + k;
            return (
              <div key={c.id}
                className={`group relative rounded-2xl border bg-white shadow-sm transition hover:shadow-md ${c.archivedAt ? 'border-slate-100 opacity-60' : 'border-slate-200'}`}>
                <div className="flex items-center gap-4 p-5">
                  {/* Avatar */}
                  <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-nav-active text-lg font-bold text-primary">
                    {c.name.charAt(0).toUpperCase()}
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-slate-800 truncate">{c.name}</p>
                      {c.archivedAt && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-note font-bold uppercase tracking-wider text-slate-400">
                          Archivée
                        </span>
                      )}
                      {!c.isOwner && (
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-note font-bold uppercase tracking-wider text-blue-500">
                          Membre · {c.memberRole}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-slate-400">
                      {c.sector && <span>{c.sector}</span>}
                      <span>{c.defaultCurrency}</span>
                      {c.email && <span>{c.email}</span>}
                      <span>Créée le {relDate(c.createdAt)}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-shrink-0 items-center gap-1">
                    {/* Switch to active */}
                    {c.isOwner && !c.archivedAt && (
                      <button
                        onClick={() => doSwitch(c)}
                        disabled={actionPending}
                        title="Définir comme active"
                        className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-white hover:bg-primary-h disabled:opacity-50">
                        {isLoading('switch') ? <Spinner sm /> : (
                          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                          </svg>
                        )}
                        Activer
                      </button>
                    )}

                    {/* Edit */}
                    {c.isOwner && (
                      <button
                        onClick={() => { setSelected(c); setModal('edit'); }}
                        title="Modifier"
                        className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                    )}

                    {/* Duplicate */}
                    {c.isOwner && (
                      <button
                        onClick={() => doDuplicate(c)}
                        disabled={actionPending}
                        title="Dupliquer"
                        className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50">
                        {isLoading('dup') ? <Spinner sm /> : (
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        )}
                      </button>
                    )}

                    {/* Archive / Restore */}
                    {c.isOwner && (
                      <button
                        onClick={() => doArchive(c)}
                        disabled={actionPending}
                        title={c.archivedAt ? 'Restaurer' : 'Archiver'}
                        className="rounded-xl p-2 text-slate-400 hover:bg-amber-50 hover:text-amber-600 disabled:opacity-50">
                        {isLoading('archive') ? <Spinner sm /> : c.archivedAt ? (
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                          </svg>
                        ) : (
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                          </svg>
                        )}
                      </button>
                    )}

                    {/* Delete */}
                    {c.isOwner && (
                      <button
                        onClick={() => { setSelected(c); setModal('delete'); }}
                        title="Supprimer"
                        className="rounded-xl p-2 text-slate-400 hover:bg-red-50 hover:text-red-500">
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Info box */}
      <div className="mt-8 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-700">
        <strong>Isolation complète</strong> — chaque entreprise a ses propres ventes, produits, clients, inventaire et employés.
        Switcher d'entreprise ne nécessite pas de reconnexion.
      </div>
    </div>
  );
}
