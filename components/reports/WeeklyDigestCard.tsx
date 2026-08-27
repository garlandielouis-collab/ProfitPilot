'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Rapport hebdomadaire WhatsApp — Bonus 1
//
// WhatsApp est déjà l'outil que le marchand a dans la main toute la journée :
// l'information doit venir à lui, pas l'inverse. Ici il voit le message exact
// qui sera envoyé et peut l'expédier en un tap ; le cron du dimanche soir
// (`/api/cron/weekly-digest`) fait la même chose sans intervention.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { Copy, Loader2, MessageCircle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { buildWeeklyReport, type WeeklyDigest } from '../../app/actions/pilotage';

const fmt = (n: number): string =>
  new Intl.NumberFormat('fr-HT', { maximumFractionDigits: 0 }).format(n);

export function WeeklyDigestCard() {
  const [digest, setDigest]     = useState<WeeklyDigest | null>(null);
  const [loading, setLoading]   = useState(true);
  const [locked, setLocked]     = useState(false);

  const load = () => {
    setLoading(true);
    buildWeeklyReport()
      .then(setDigest)
      .catch(() => setLocked(true))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white py-16 dark:border-slate-800 dark:bg-slate-950">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }

  // Offre sans rapport hebdo : on ne montre rien plutôt qu'un bloc mort.
  if (locked || !digest) return null;

  const period = `${new Date(digest.periodStart).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })} → ${new Date(digest.periodEnd).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}`;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-center gap-3 bg-[#001F3F] px-5 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#50C878]/20">
          <MessageCircle className="h-5 w-5 text-[#50C878]" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-white">Rezime semèn nan</h3>
          <p className="text-[11px] text-white/60">{period}</p>
        </div>
        <button
          onClick={load}
          aria-label="Rafrechi"
          className="rounded-lg p-2 text-white/60 transition hover:bg-white/10 hover:text-white"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-3 divide-x divide-slate-100 border-b border-slate-100 dark:divide-slate-800 dark:border-slate-800">
        {[
          { label: 'Lajan antre', value: fmt(digest.revenue) },
          { label: 'Mòj brit',    value: fmt(digest.grossMargin) },
          { label: 'Vant',        value: String(digest.salesCount) },
        ].map((s) => (
          <div key={s.label} className="px-4 py-3 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
              {s.label}
            </p>
            <p className="mt-0.5 text-base font-black text-[#001F3F] dark:text-slate-100">
              {s.value}
            </p>
          </div>
        ))}
      </div>

      <pre className="max-h-64 overflow-auto whitespace-pre-wrap px-5 py-4 font-sans text-sm leading-relaxed text-slate-600 dark:text-slate-300">
        {digest.message}
      </pre>

      <div className="flex flex-wrap gap-2 border-t border-slate-100 px-5 py-4 dark:border-slate-800">
        <a
          href={digest.whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-xl bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-95"
        >
          <MessageCircle className="h-4 w-4" />
          Voye sou WhatsApp
        </a>
        <button
          onClick={() => {
            navigator.clipboard.writeText(digest.message)
              .then(() => toast.success('Mesaj la kopye.'))
              .catch(() => toast.error('Kopi enposib.'));
          }}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900"
        >
          <Copy className="h-4 w-4" />
          Kopye
        </button>
      </div>
    </div>
  );
}
