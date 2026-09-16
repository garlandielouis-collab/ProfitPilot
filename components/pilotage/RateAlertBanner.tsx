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
//
// ── Moment 4 (§7) ────────────────────────────────────────────────────────────
// « Quand le taux gourde/dollar change, une bannière discrète glisse depuis le
//   haut avec l'ancien et le nouveau taux. Elle pulse une seule fois, reste
//   consultable, ne revient pas à chaque écran. »
// D'où : `pp-drop` à l'entrée, l'ancien taux affiché à côté du nouveau, et le
// cache d'un jour qui garantit qu'elle ne se rejoue pas.
//
// Couleurs : rouge système uniquement quand des produits se vendent à perte —
// c'est-à-dire quand quelque chose coûte vraiment de l'argent. Sinon, ambre :
// une échéance qui approche, pas encore une alerte (§4.2).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, TrendingDown, TrendingUp, X } from 'lucide-react';
import { refreshRateWithAlert, type RateAlert } from '../../app/actions/exchangeRate';
import { Card } from '../ds';

const STORAGE_KEY = 'pp_rate_alert_check';
// Le taux dont l'alerte a été fermée. Le §7 promet une bannière qui « reste
// consultable, ne revient pas à chaque écran » : fermer ne tenait que dans
// l'état du composant, et la bannière se rouvrait à la navigation suivante,
// puis à la suivante, tant que le cache du jour la resservait.
const DISMISS_KEY = 'pp_rate_alert_dismissed';
const ONE_DAY_MS  = 24 * 3600 * 1000;

export function RateAlertBanner({ initial }: { initial?: RateAlert | null }) {
  const [alert, setAlert]     = useState<RateAlert | null>(initial ?? null);
  const [dismissed, setDismiss] = useState(false);
  // Lu après le montage : `localStorage` n'existe pas au rendu serveur, et le
  // lire pendant le rendu ferait diverger les deux.
  const [dismissedRate, setDismissedRate] = useState<number | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DISMISS_KEY);
      if (raw !== null && raw !== '') setDismissedRate(Number(raw));
    } catch { /* localStorage indisponible */ }
  }, []);

  // Fermer vaut pour CE taux, pas pour toujours : au prochain mouvement, la
  // marge rebouge et la bannière a de nouveau quelque chose à dire.
  function close() {
    setDismiss(true);
    try {
      if (alert) localStorage.setItem(DISMISS_KEY, String(alert.rate));
    } catch { /* quota */ }
  }

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
  if (dismissedRate !== null && alert.rate === dismissedRate) return null;

  const atLoss = alert.productsAtLoss ?? [];
  if (!alert.shouldAlert && atLoss.length === 0) return null;

  const up       = alert.variationPercent > 0;
  const critical = atLoss.length > 0;
  const Icon     = critical ? AlertTriangle : up ? TrendingUp : TrendingDown;

  return (
    // Elle glisse depuis le haut, une fois. Pas de pulsation permanente : une
    // bannière qui clignote sans arrêt cesse d'être lue.
    <Card className="pp-drop relative p-4">
      <button
        type="button"
        onClick={close}
        aria-label="Fermer l'alerte"
        className="pressable absolute right-2 top-2 flex h-touch w-touch items-center justify-center rounded-control text-muted"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>

      <div className="flex items-start gap-3 pr-touch">
        <Icon
          className={`mt-1 h-5 w-5 flex-shrink-0 ${critical ? 'text-danger' : 'text-warning'}`}
          aria-hidden
        />

        <div className="min-w-0 flex-1">
          {/* L'ancien taux ET le nouveau : sans les deux, « le taux a changé »
              ne dit rien d'actionnable (§1, critère du texte). */}
          <p className="text-body font-bold text-primary dark:text-dark-text">
            1 USD = <span className="amount">{alert.rate} HTG</span>
            {alert.previousRate ? (
              <span className="amount ml-2 text-note font-normal text-muted line-through">
                {alert.previousRate}
              </span>
            ) : null}
            <span className={`amount ml-2 text-note font-bold ${critical || up ? 'text-danger' : 'text-success'}`}>
              {up ? '+' : '−'}{Math.abs(alert.variationPercent)} %
            </span>
          </p>

          {critical ? (
            <>
              <p className="mt-1 text-body text-text2 dark:text-dark-text2">
                {atLoss.length === 1
                  ? '1 produit se vend à perte au nouveau taux.'
                  : `${atLoss.length} produits se vendent à perte au nouveau taux.`}
                {' '}Augmentez leur prix avant la prochaine vente.
              </p>

              <ul className="mt-2 space-y-1">
                {atLoss.slice(0, 3).map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 text-note">
                    <span className="min-w-0 truncate text-text2 dark:text-dark-text2">{p.name}</span>
                    <span className="amount flex-shrink-0 font-bold text-danger">
                      {p.marginPercent.toFixed(1)} %
                    </span>
                  </li>
                ))}
              </ul>

              {/* Une seule action, en lien : la bannière informe, elle ne
                  dispute pas l'accent principal de l'écran (§4.1). */}
              <Link
                href="/products"
                className="pressable mt-3 inline-flex min-h-touch items-center text-note font-bold text-primary underline underline-offset-4 dark:text-dark-text"
              >
                Voir ces produits
              </Link>
            </>
          ) : (
            <p className="mt-1 text-body text-text2 dark:text-dark-text2">
              Le changement dépasse votre seuil de {alert.threshold} %. Vérifiez la marge des
              produits achetés en dollars.
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
