'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Recommandations automatiques — Diagnostic 9 (les données sans interprétation)
//
// Le marchand n'a pas à « lire » un tableau de bord : l'app lui dit quoi
// remarquer et quoi faire, une phrase à la fois.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, CheckCircle2, Info, Lightbulb, Loader2 } from 'lucide-react';
import { getInsights } from '../../app/actions/pilotage';
import type { Insight, InsightSeverity } from '../../lib/insights';

const STYLE: Record<
  InsightSeverity,
  { icon: React.ReactNode; card: string; accent: string }
> = {
  critical: {
    icon: <AlertTriangle className="h-4 w-4" />,
    card: 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30',
    accent: 'text-red-600 dark:text-red-400',
  },
  warning: {
    icon: <AlertTriangle className="h-4 w-4" />,
    card: 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30',
    accent: 'text-amber-600 dark:text-amber-400',
  },
  info: {
    icon: <Info className="h-4 w-4" />,
    card: 'border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30',
    accent: 'text-blue-600 dark:text-blue-400',
  },
  success: {
    icon: <CheckCircle2 className="h-4 w-4" />,
    card: 'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30',
    accent: 'text-[#50C878]',
  },
};

export function InsightsFeed({ limit = 5 }: { limit?: number }) {
  const [items, setItems]     = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getInsights(limit)
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [limit]);

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white py-10 dark:border-slate-800 dark:bg-slate-950">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }

  if (items.length === 0) return null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card dark:border-slate-800 dark:bg-slate-950">
      <div className="mb-4 flex items-center gap-2">
        <Lightbulb className="h-4 w-4 text-[#50C878]" />
        <h3 className="text-sm font-bold text-[#001F3F] dark:text-slate-100">
          Ce qu'il faut remarquer
        </h3>
      </div>

      <ul className="space-y-2.5">
        {items.map((insight) => {
          const style = STYLE[insight.severity];
          return (
            <li key={insight.id} className={`rounded-xl border p-3.5 ${style.card}`}>
              <div className="flex gap-3">
                <span className={`mt-0.5 flex-shrink-0 ${style.accent}`}>{style.icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[#001F3F] dark:text-slate-100">
                    {insight.message}
                  </p>
                  {insight.action && (
                    <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
                      {insight.action}
                    </p>
                  )}
                </div>
                {insight.href && (
                  <Link
                    href={insight.href}
                    className={`flex-shrink-0 self-center rounded-lg p-1.5 transition hover:bg-white/60 dark:hover:bg-white/10 ${style.accent}`}
                    aria-label="Ouvrir"
                  >
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
