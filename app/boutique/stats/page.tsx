'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Store Analytics — l'entonnoir et ce qu'il laisse passer (§30)
//
// Visiteurs → Fiches vues → Panier → Paiement → Achat, et les trois lectures
// qui vont avec : ce qui se vend, d'où viennent les gens, ce qui s'est perdu.
//
// ── Deux sources, jamais mélangées ──────────────────────────────────────────
//
// L'ENTONNOIR vient de `store_analytics_events` : des événements de navigateur,
// « au mieux ». Sur une connexion haïtienne, il s'en perd. C'est assez pour
// comparer deux étapes entre elles, pas pour affirmer un chiffre d'affaires.
//
// L'ARGENT vient de `orders`. Une commande ne se perd pas.
//
// Les deux ne sont donc jamais additionnés ni recoupés dans une même carte, et
// l'écart entre « Achats » (événement) et « Commandes » (table) n'est pas un
// bug : c'est la mesure qui a des trous, pas la caisse.
//
// ── Le taux de conversion ne s'invente pas ──────────────────────────────────
//
// La version précédente de cet écran affichait « Taux de conversion — Bientôt
// disponible » dans une carte de la même taille que les autres. C'était honnête
// et c'était laid ; c'est surtout devenu inutile : la mesure existe. Quand elle
// n'a rien à dire — aucun visiteur sur la période — l'écran l'écrit en toutes
// lettres plutôt que d'afficher 0 %, qui se lirait comme un échec commercial.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowDown, ExternalLink, Globe } from 'lucide-react';

import { getStoreStats, type StoreStats } from '../../actions/boutique';
import { getStoreAnalytics, type StoreAnalytics } from '../../actions/storeInsights';
import { PeriodBars, type BarPoint } from '../../../components/ds';
import { Card } from '../../../components/ds/Surface';
import { FilterPill } from '../../../components/ds/Badge';

const WINDOWS = [7, 30, 90];

const STATUS_LABELS: Record<string, string> = {
  pending:   'En attente',
  confirmed: 'Confirmées',
  preparing: 'Préparation',
  shipped:   'Expédiées',
  delivered: 'Livrées',
  cancelled: 'Annulées',
  refunded:  'Remboursées',
};

/** Une couleur par sens, jamais une par ligne (§4.2 de la constitution). */
const STATUS_TONE: Record<string, string> = {
  pending:   'bg-warning',
  confirmed: 'bg-info',
  preparing: 'bg-info',
  shipped:   'bg-info',
  delivered: 'bg-success',
  cancelled: 'bg-danger',
  refunded:  'bg-danger',
};

function money(n: number, currency = 'HTG') {
  return `${new Intl.NumberFormat('fr-HT', { maximumFractionDigits: 0 }).format(Math.round(n))} ${currency}`;
}

function count(n: number) {
  return new Intl.NumberFormat('fr-HT').format(n);
}

export default function StatsPage() {
  const [days, setDays]           = useState(30);
  const [stats, setStats]         = useState<StoreStats | null>(null);
  const [analytics, setAnalytics] = useState<StoreAnalytics | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);

  const load = useCallback(async (window: number) => {
    setLoading(true);
    setError(null);
    try {
      const [s, a] = await Promise.all([getStoreStats(window), getStoreAnalytics(window)]);
      setStats(s);
      setAnalytics(a);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chargement impossible.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(days); }, [days, load]);

  // Sept jours, une barre chacun, un libellé d'une lettre : L M M J V S D.
  // « Une barre par période, et pas une de plus » (§3.8).
  const lastSevenDays: BarPoint[] = useMemo(() => {
    const JOURS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
    return (stats?.revenueByDay ?? []).slice(-7).map((d) => ({
      label: JOURS[new Date(`${d.date}T12:00:00`).getDay()] ?? '·',
      value: d.total,
    }));
  }, [stats]);

  const currency = analytics?.currency ?? 'HTG';

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8">
      {/* ── En-tête ── */}
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-screen font-semibold text-primary dark:text-dark-text">
            Statistiques
          </h1>
          <p className="mt-1 text-body text-text2 dark:text-dark-text2">
            Ce que votre boutique a produit sur les {days} derniers jours.
          </p>
        </div>

        <div className="flex flex-wrap gap-2" role="group" aria-label="Période">
          {WINDOWS.map((d) => (
            <FilterPill
              key={d}
              label={`${d} jours`}
              selected={days === d}
              onClick={() => setDays(d)}
            />
          ))}
        </div>
      </header>

      {error && (
        <div className="mb-6 flex items-start gap-2 rounded-control bg-danger-sub px-3 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-danger" strokeWidth={1.8} aria-hidden />
          <p className="text-body text-danger">{error}</p>
        </div>
      )}

      {loading || !stats || !analytics ? (
        <div className="flex h-64 items-center justify-center">
          <span
            className="h-8 w-8 animate-spin rounded-pill border-2 border-border border-t-primary"
            aria-label="Chargement"
          />
        </div>
      ) : (
        <div className="space-y-8">
          {/* ══ Les quatre nombres ══ */}
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <Kpi
              label="Chiffre d'affaires"
              value={money(analytics.revenue, currency)}
              note={`${analytics.orders} commande${analytics.orders > 1 ? 's' : ''}`}
              emphasis
            />
            <Kpi
              label="Panier moyen"
              value={analytics.orders > 0 ? money(analytics.averageOrderValue, currency) : '—'}
              note={analytics.orders > 0 ? 'par commande' : 'aucune commande'}
            />
            <Kpi
              label="Conversion"
              value={analytics.conversionRate === null ? '—' : `${analytics.conversionRate} %`}
              note={
                analytics.conversionRate === null
                  ? 'aucun visiteur mesuré'
                  : 'des visiteurs achètent'
              }
            />
            <Kpi
              label="Paniers perdus"
              value={count(analytics.abandonedSessions)}
              note={
                analytics.abandonedValue > 0
                  ? `~${money(analytics.abandonedValue, currency)}`
                  : 'ajouts sans achat'
              }
            />
          </div>

          {/* ══ L'entonnoir ══ */}
          <section className="space-y-3">
            <div>
              <h2 className="text-card font-bold text-primary dark:text-dark-text">
                L'entonnoir
              </h2>
              <p className="mt-1 text-note text-muted dark:text-dark-muted">
                Où les visiteurs s'arrêtent. Mesuré sans cookie et sans identifier personne.
              </p>
            </div>

            {!analytics.measurementReady ? (
              <Card className="p-4">
                <p className="text-body text-text2 dark:text-dark-text2">
                  La mesure n'est pas encore active sur cette installation. Les chiffres
                  d'affaires ci-dessus, eux, viennent de vos commandes et sont exacts.
                </p>
              </Card>
            ) : analytics.funnel[0].value === 0 ? (
              <Card className="p-4">
                <p className="text-body text-text2 dark:text-dark-text2">
                  Aucune visite mesurée sur la période. Partagez l'adresse de votre boutique
                  pour commencer à voir ce parcours se remplir.
                </p>
              </Card>
            ) : (
              <Card className="space-y-1 p-4">
                {analytics.funnel.map((stage, index) => (
                  <div key={stage.key}>
                    {index > 0 && (
                      <p className="flex items-center gap-1 py-1 pl-1 text-note text-muted dark:text-dark-muted">
                        <ArrowDown className="h-3 w-3" strokeWidth={1.8} aria-hidden />
                        {stage.fromPrevious === null
                          ? 'sans base de comparaison'
                          : `${stage.fromPrevious} % passent cette étape`}
                      </p>
                    )}
                    <FunnelBar
                      label={stage.label}
                      value={stage.value}
                      max={analytics.funnel[0].value}
                    />
                  </div>
                ))}
              </Card>
            )}
          </section>

          {/* ══ Ce qui se vend, d'où ils viennent ══ */}
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="space-y-3">
              <h2 className="text-card font-bold text-primary dark:text-dark-text">
                Chiffre d'affaires par jour
              </h2>
              <Card className="p-4">
                {lastSevenDays.length === 0 ? (
                  <p className="py-8 text-center text-body text-muted dark:text-dark-muted">
                    Aucune vente sur la boutique pour l'instant.
                  </p>
                ) : (
                  <PeriodBars
                    data={lastSevenDays}
                    currency={currency}
                    currentIndex={lastSevenDays.length - 1}
                  />
                )}
              </Card>
            </section>

            <section className="space-y-3">
              <h2 className="text-card font-bold text-primary dark:text-dark-text">
                D'où viennent les visiteurs
              </h2>
              <Card className="p-4">
                {analytics.sources.length === 0 ? (
                  <p className="py-8 text-center text-body text-muted dark:text-dark-muted">
                    Aucune provenance mesurée.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {analytics.sources.map((s) => {
                      const total = analytics.sources.reduce((sum, x) => sum + x.sessions, 0);
                      const pct = total > 0 ? (s.sessions / total) * 100 : 0;
                      return (
                        <li key={s.source}>
                          <div className="mb-1 flex items-center justify-between gap-4 text-note">
                            <span className="flex min-w-0 items-center gap-2 text-primary dark:text-dark-text">
                              <Globe className="h-3 w-3 flex-shrink-0 text-muted" strokeWidth={1.8} aria-hidden />
                              <span className="truncate">
                                {s.source === 'direct' ? 'Accès direct' : s.source}
                              </span>
                            </span>
                            <span className="amount flex-shrink-0 text-muted dark:text-dark-muted">
                              {count(s.sessions)}
                            </span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-pill bg-surface2 dark:bg-dark-surface2">
                            <div className="h-full rounded-pill bg-primary dark:bg-accent" style={{ width: `${pct}%` }} />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
            </section>
          </div>

          {/* ══ Les produits ══ */}
          <section className="space-y-3">
            <div>
              <h2 className="text-card font-bold text-primary dark:text-dark-text">Produits</h2>
              <p className="mt-1 text-note text-muted dark:text-dark-muted">
                Vues et ventes côte à côte : très vu et peu vendu, c'est la fiche qu'il faut
                reprendre.
              </p>
            </div>

            <Card className="p-0">
              {analytics.topProducts.length === 0 ? (
                <p className="p-8 text-center text-body text-muted dark:text-dark-muted">
                  Aucune vue ni vente sur la période.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-body">
                    <thead>
                      <tr className="border-b border-border text-note font-bold uppercase tracking-wide text-muted dark:border-dark-border dark:text-dark-muted">
                        <th className="p-4 text-left">Produit</th>
                        <th className="p-4 text-right">Vues</th>
                        <th className="p-4 text-right">Vendus</th>
                        <th className="p-4 text-right">Revenu</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border dark:divide-dark-border">
                      {analytics.topProducts.map((p) => (
                        <tr key={p.productId}>
                          <td className="max-w-[16rem] truncate p-4 text-primary dark:text-dark-text">
                            {p.name}
                          </td>
                          <td className="amount p-4 text-right text-text2 dark:text-dark-text2">
                            {count(p.views)}
                          </td>
                          <td className="amount p-4 text-right text-text2 dark:text-dark-text2">
                            {count(p.unitsSold)}
                          </td>
                          <td className="amount p-4 text-right font-semibold text-primary dark:text-dark-text">
                            {money(p.revenue, currency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </section>

          {/* ══ Les commandes ══ */}
          <section className="space-y-3">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="text-card font-bold text-primary dark:text-dark-text">
                Répartition des commandes
              </h2>
              <Link
                href="/boutique/commandes"
                className="pressable inline-flex min-h-touch items-center gap-1 text-body font-semibold text-primary underline underline-offset-4 dark:text-accent"
              >
                Voir les commandes
                <ExternalLink className="h-3 w-3" strokeWidth={1.8} aria-hidden />
              </Link>
            </div>

            <Card className="p-4">
              {Object.keys(stats.statusBreakdown).length === 0 ? (
                <p className="py-8 text-center text-body text-muted dark:text-dark-muted">
                  Aucune commande sur la période.
                </p>
              ) : (
                <ul className="space-y-3">
                  {Object.entries(stats.statusBreakdown).map(([status, n]) => {
                    const total = Object.values(stats.statusBreakdown).reduce((a, b) => a + b, 0);
                    const pct = total > 0 ? (n / total) * 100 : 0;
                    return (
                      <li key={status}>
                        <div className="mb-1 flex justify-between gap-4 text-note">
                          <span className="text-primary dark:text-dark-text">
                            {STATUS_LABELS[status] ?? status}
                          </span>
                          <span className="amount text-muted dark:text-dark-muted">
                            {n} · {Math.round(pct)} %
                          </span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-pill bg-surface2 dark:bg-dark-surface2">
                          <div
                            className={`h-full rounded-pill ${STATUS_TONE[status] ?? 'bg-border'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </section>
        </div>
      )}
    </div>
  );
}

// ── Un indicateur ───────────────────────────────────────────────────────────

function Kpi({
  label, value, note, emphasis = false,
}: {
  label: string;
  value: string;
  note: string;
  /** L'indicateur qui domine la zone. Un seul (§4.5). */
  emphasis?: boolean;
}) {
  return (
    <Card className="flex flex-col gap-2 p-4">
      <p className="text-note font-bold uppercase tracking-wide text-muted dark:text-dark-muted">
        {label}
      </p>
      <p
        className={`amount text-primary dark:text-dark-text ${
          emphasis ? 'text-amount-lg font-hero' : 'text-amount font-semibold'
        }`}
      >
        {value}
      </p>
      <p className="truncate text-note text-muted dark:text-dark-muted">{note}</p>
    </Card>
  );
}

// ── Une étape de l'entonnoir ────────────────────────────────────────────────

function FunnelBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? Math.max(2, (value / max) * 100) : 2;

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-4">
        <span className="text-body text-primary dark:text-dark-text">{label}</span>
        <span className="amount text-body font-semibold text-primary dark:text-dark-text">
          {count(value)}
        </span>
      </div>
      <div className="h-4 w-full overflow-hidden rounded-control bg-surface2 dark:bg-dark-surface2">
        <div
          className="h-full rounded-control bg-primary transition-[width] duration-500 dark:bg-accent"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
