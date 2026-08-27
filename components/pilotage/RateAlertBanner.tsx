'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Alerte taux de change — Diagnostic 1 (l'illusion du chiffre d'affaires)
//
// « Je vends bien, mais je ne sais pas si j'ai gagné de l'argent. » Le piège
// est mécanique : on achète en USD, on encaisse en HTG, et le prix de vente
// ne bouge pas quand le taux monte. La vente d'hier devient la perte d'aujourd'hui.
//
// Le rafraîchissement est fait une fois par jour : le taux ne bouge pas assez
// vite pour justifier un appel réseau à chaque ouverture du dashboard.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, TrendingDown, TrendingUp, X } from 'lucide-react';
import { refreshRateWithAlert, type RateAlert } from '../../app/actions/exchangeRate';

const STORAGE_KEY = 'pp_rate_alert_check';
const ONE_DAY_MS  = 24 * 3600 * 1000;

export function RateAlertBanner({ initial }: { initial?: RateAlert | null }) {
  const [alert, setAlert]     = useState<RateAlert | null>(initial ?? null);
  const [dismissed, setDismiss] = useState(false);

  useEffect(() => {
    // Déjà servi par le lot de la bande de pilotage : rien à aller chercher.
    if (initial !== undefined) return;

    let cancelled = false;

    // Le résultat est mis en cache : un rechargement de page ne doit ni
    // relancer l'appel réseau, ni faire réapparaître une alerte déjà lue.
    let cached: { at: number; alert: RateAlert | null } | null = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) cached = JSON.parse(raw);
    } catch { /* localStorage indisponible */ }

    if (cached && Date.now() - cached.at < ONE_DAY_MS) {
      setAlert(cached.alert);
      return;
    }

    refreshRateWithAlert()
      .then((res) => {
        if (cancelled) return;
        setAlert(res);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify({ at: Date.now(), alert: res }));
        } catch { /* quota */ }
      })
      .catch(() => { /* offre sans alerte taux, ou hors ligne : on reste muet */ });

    return () => { cancelled = true; };
  }, [initial]);

  if (!alert || dismissed) return null;

  const atLoss = alert.productsAtLoss ?? [];
  if (!alert.shouldAlert && atLoss.length === 0) return null;

  const up       = alert.variationPercent > 0;
  const critical = atLoss.length > 0;

  return (
    <div
      className={critical
        ? 'relative rounded-2xl border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/30'
        : 'relative rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30'}
    >
      <button
        onClick={() => setDismiss(true)}
        aria-label="Fèmen alèt la"
        className="absolute right-3 top-3 rounded-lg p-1 text-slate-400 transition hover:bg-black/5 hover:text-slate-600"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex items-start gap-3 pr-8">
        <div className={critical ? 'mt-0.5 text-red-600' : 'mt-0.5 text-amber-600'}>
          {critical ? <AlertTriangle className="h-5 w-5" /> : up ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
        </div>

        <div className="min-w-0 flex-1">
          <p className={critical ? 'text-sm font-semibold text-red-800 dark:text-red-300' : 'text-sm font-semibold text-amber-800 dark:text-amber-300'}>
            To a chanje {alert.variationPercent > 0 ? '+' : ''}{alert.variationPercent}% — 1 USD = {alert.rate} HTG
          </p>

          {critical ? (
            <>
              <p className="mt-1 text-sm text-red-700 dark:text-red-400">
                {atLoss.length === 1
                  ? '1 pwodwi ap vann a pèt kounye a nan nouvo to a.'
                  : `${atLoss.length} pwodwi ap vann a pèt kounye a nan nouvo to a.`}
                {' '}Ogmante pri yo anvan pwochèn vant la.
              </p>
              <ul className="mt-2 space-y-1">
                {atLoss.slice(0, 3).map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 text-xs text-red-700 dark:text-red-400">
                    <span className="truncate">{p.name}</span>
                    <span className="shrink-0 font-semibold">{p.marginPercent.toFixed(1)}%</span>
                  </li>
                ))}
              </ul>
              <Link
                href="/products"
                className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700"
              >
                Wè pwodwi yo
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </>
          ) : (
            <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
              Sa depase sèy {alert.threshold}% ou a. Verifye mòj pwodwi ou achte an dola yo.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
