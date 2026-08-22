'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Registre de créances — Diagnostic 3 (dettes moun)
//
// Chaque gourde due est visible, datée, et relançable en un clic. Le tri met
// d'abord ce qui coûte de l'argent : critique → en retard → à échéance.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle, CalendarClock, CheckCircle2, Clock, Loader2, MessageCircle, Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  listReceivables,
  markReceivablePaid,
  prepareReceivableReminder,
  setReceivableDueDate,
  type Receivable,
  type ReceivableStatus,
  type ReceivablesSummary,
} from '../../app/actions/receivables';

const fmt = (n: number, currency: string): string =>
  `${new Intl.NumberFormat('fr-HT', { maximumFractionDigits: 0 }).format(n)} ${currency}`;

const STATUS_STYLE: Record<ReceivableStatus, { label: string; className: string }> = {
  critical: { label: 'Critique',    className: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400' },
  overdue:  { label: 'En retard',   className: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400' },
  due_soon: { label: 'Échéance proche', className: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400' },
  open:     { label: 'En cours',    className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
  paid:     { label: 'Payé',        className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400' },
};

function StatCard({
  icon, label, value, tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: 'navy' | 'emerald' | 'red';
}) {
  const toneClass =
    tone === 'red'     ? 'text-red-600 dark:text-red-400'
    : tone === 'emerald' ? 'text-[#50C878]'
    :                      'text-[#001F3F] dark:text-slate-100';

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-center gap-2 text-slate-400">
        {icon}
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className={`mt-2 text-xl font-black tabular-nums ${toneClass}`}>{value}</p>
    </div>
  );
}

export function ReceivablesPanel() {
  const [data, setData]       = useState<ReceivablesSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId]   = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await listReceivables());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Chargement impossible.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleReminder(r: Receivable) {
    setBusyId(r.saleId);
    try {
      const { message, whatsappUrl, hasPhone } = await prepareReceivableReminder(r.saleId);
      window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
      if (!hasPhone) {
        await navigator.clipboard?.writeText(message).catch(() => {});
        toast.info('Aucun numéro enregistré — message copié, choisissez le contact.');
      }
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Relance impossible.');
    } finally {
      setBusyId(null);
    }
  }

  async function handlePaid(r: Receivable) {
    setBusyId(r.saleId);
    try {
      await markReceivablePaid(r.saleId);
      toast.success(`${r.customerName} — créance soldée.`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Mise à jour impossible.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDueDate(r: Receivable, value: string) {
    if (!value) return;
    try {
      await setReceivableDueDate(r.saleId, value);
      toast.success('Échéance mise à jour.');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Mise à jour impossible.');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!data || data.items.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-card dark:border-slate-800 dark:bg-slate-950">
        <CheckCircle2 className="mx-auto h-10 w-10 text-[#50C878]" />
        <p className="mt-3 text-sm font-semibold text-[#001F3F] dark:text-slate-100">
          Aucune créance en attente
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Toutes vos ventes à crédit ont été encaissées.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          icon={<Wallet className="h-4 w-4" />}
          label="Total dû"
          value={fmt(data.totalOutstanding, data.currency)}
          tone="navy"
        />
        <StatCard
          icon={<AlertCircle className="h-4 w-4" />}
          label="En retard"
          value={fmt(data.totalOverdue, data.currency)}
          tone="red"
        />
        <StatCard
          icon={<Clock className="h-4 w-4" />}
          label="À relancer"
          value={`${data.overdueCount + data.dueSoonCount}`}
          tone="emerald"
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card dark:border-slate-800 dark:bg-slate-950">
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {data.items.map((r) => {
            const style = STATUS_STYLE[r.status];
            const busy  = busyId === r.saleId;

            return (
              <li key={r.saleId} className="p-4 transition hover:bg-slate-50/60 dark:hover:bg-slate-900/40">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-bold text-[#001F3F] dark:text-slate-100">
                        {r.customerName}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${style.className}`}>
                        {style.label}
                      </span>
                      {r.reminderCount > 0 && (
                        <span className="text-[11px] text-slate-400">
                          {r.reminderCount} relance{r.reminderCount > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>

                    <p className="mt-1 text-xs text-slate-500">
                      {r.invoiceNumber ? `${r.invoiceNumber} · ` : ''}
                      vente du {new Date(`${r.saleDate}T00:00:00`).toLocaleDateString('fr-FR')}
                      {r.daysOverdue > 0 && (
                        <span className="font-semibold text-orange-600"> · {r.daysOverdue} j de retard</span>
                      )}
                    </p>

                    <label className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                      <CalendarClock className="h-3.5 w-3.5" />
                      Échéance
                      <input
                        type="date"
                        defaultValue={r.dueDate ?? ''}
                        onChange={(e) => handleDueDate(r, e.target.value)}
                        className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus:border-[#50C878] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                      />
                    </label>
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <span className="text-lg font-black tabular-nums text-[#001F3F] dark:text-slate-100">
                      {fmt(r.balanceDue, r.currency)}
                    </span>
                    {r.paidAmount > 0 && (
                      <span className="text-[11px] text-slate-400">
                        déjà payé {fmt(r.paidAmount, r.currency)}
                      </span>
                    )}

                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleReminder(r)}
                        className="flex items-center gap-1.5 rounded-xl bg-[#25D366] px-3 py-2 text-xs font-bold text-white transition hover:brightness-95 active:scale-95 disabled:opacity-60"
                      >
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageCircle className="h-3.5 w-3.5" />}
                        Relancer
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handlePaid(r)}
                        className="flex items-center gap-1.5 rounded-xl bg-[#001F3F] px-3 py-2 text-xs font-bold text-white transition hover:bg-[#002D5B] active:scale-95 disabled:opacity-60"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Payé
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
