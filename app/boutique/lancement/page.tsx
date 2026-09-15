'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Lancement — l'état de la boutique en un écran (§43, §44, §45)
//
// Le §43 le résume : « le commerçant doit pouvoir comprendre immédiatement
// l'état de sa boutique ». Trois blocs, dans l'ordre où on s'en sert :
//
//   LES DIX ÉTAPES  tant qu'il en reste, c'est la seule chose qui compte. Une
//                   boutique sans mode de paiement n'a pas un problème de
//                   score, elle a un problème de caisse.
//   LA NOTE         une fois lancée, la question devient « qu'est-ce qui la
//                   rend meilleure ». La note et ses recommandations répondent.
//   LE DÉTAIL       chaque critère, ce qu'il vaut, ce qui lui manque.
//
// ── Ce que cet écran ne fait pas ────────────────────────────────────────────
//
// Il ne garde aucune position. Rien n'est enregistré : tout se relit à chaque
// ouverture depuis les tables de la vitrine. Un assistant qui mémorise « étape
// 7 sur 10 » finit toujours par afficher « terminé » sur une boutique qui a
// perdu son mode de livraison entre-temps.
//
// Il ne félicite pas non plus dans le vide. « 82/100 » ne s'affiche pas tant
// qu'aucun produit n'existe : une note calculée sur un catalogue vide n'est
// pas une note, c'est une décoration.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import {
  AlertTriangle, ArrowRight, Check, ExternalLink, Circle, Rocket,
} from 'lucide-react';

import {
  getStoreOverview, markStorePreviewed, type LaunchStep, type StoreOverview,
} from '../../actions/storeInsights';
import { StatsPanel } from './StatsPanel';
import { healthTone, type HealthCriterion } from '../../../lib/storeHealth';
import { Button } from '../../../components/ds/Button';
import { Card } from '../../../components/ds/Surface';
import { Badge } from '../../../components/ds/Badge';
import { screenMessage } from '../../../lib/actionResult';

const LEVEL_LABEL: Record<StoreOverview['health']['level'], string> = {
  neuf:      'À construire',
  faible:    'À reprendre',
  correct:   'Correcte',
  bon:       'Bonne',
  excellent: 'Excellente',
};

/** Le trait de la note. Il double le chiffre, il ne le remplace pas. */
function ScoreBar({ score, tone }: { score: number; tone: 'neutral' | 'danger' | 'warning' | 'success' }) {
  const color =
    tone === 'success' ? 'bg-success'
    : tone === 'warning' ? 'bg-warning'
    : tone === 'danger' ? 'bg-danger'
    : 'bg-border';

  return (
    <div className="h-2 w-full overflow-hidden rounded-pill bg-surface2 dark:bg-dark-surface2">
      <div
        className={`h-full rounded-pill transition-[width] duration-500 ${color}`}
        style={{ width: `${Math.max(2, score)}%` }}
      />
    </div>
  );
}

type Tab = 'sante' | 'ventes';

export default function LancementPage() {
  const [data, setData]     = useState<StoreOverview | null>(null);
  const [error, setError]   = useState<string | null>(null);
  const [pending, start]    = useTransition();
  const [tab, setTab]       = useState<Tab>('sante');

  const reload = useCallback(async () => {
    try {
      setData(await getStoreOverview());
    } catch (err) {
      setError(screenMessage(err, 'Chargement impossible.'));
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  /** L'aperçu ouvre la vitrine ET note l'étape. Un seul geste du marchand. */
  const preview = useCallback((url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
    start(async () => {
      try {
        await markStorePreviewed();
        await reload();
      } catch {
        // L'étape ne s'est pas cochée. La boutique s'est quand même ouverte,
        // et c'était le but du clic — on ne dérange pas le marchand pour ça.
      }
    });
  }, [reload]);

  if (error && !data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-8">
        <div className="flex items-start gap-2 rounded-control bg-danger-sub px-3 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-danger" strokeWidth={1.8} aria-hidden />
          <p className="text-body text-danger">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <span
          className="h-8 w-8 animate-spin rounded-pill border-2 border-border border-t-primary"
          aria-label="Chargement"
        />
      </div>
    );
  }

  const { health, steps, stepsDone } = data;
  const tone = healthTone(health.level);
  const remaining = steps.filter((s) => !s.done);
  const nextStep = remaining[0] ?? null;

  return (
    <div className={`mx-auto px-4 py-8 sm:px-8 ${tab === 'ventes' ? 'max-w-5xl' : 'max-w-3xl'}`}>
      {/* ── En-tête ── */}
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-screen font-semibold text-primary dark:text-dark-text">
            {tab === 'ventes' ? 'Statistiques' : 'Lancement'}
          </h1>
          <p className="mt-1 text-body text-text2 dark:text-dark-text2">
            {data.isActive
              ? `${data.storeName} est en ligne.`
              : `${data.storeName} n'est pas encore publiée.`}
          </p>
        </div>

        {data.publicUrl && (
          <a
            href={data.publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-action items-center gap-2 rounded-surface border border-border px-4 text-body font-semibold text-primary transition hover:bg-surface dark:border-dark-border dark:text-dark-text"
          >
            <ExternalLink className="h-4 w-4" strokeWidth={1.8} aria-hidden />
            Voir ma boutique
          </a>
        )}
      </header>

      {/* ── Les deux questions ──
          « Où en suis-je ? » tant que la boutique se monte, « qu'est-ce que ça
          donne ? » une fois qu'elle tourne. L'onglet Ventes était une page
          orpheline (`/boutique/stats`) que rien ne reliait au produit. */}
      <div
        role="tablist"
        aria-label="Vue"
        className="mb-8 inline-flex rounded-surface bg-surface2 p-1 dark:bg-dark-surface2"
      >
        {([
          { key: 'sante'  as const, label: 'Santé' },
          { key: 'ventes' as const, label: 'Ventes' },
        ]).map((v) => (
          <button
            key={v.key}
            role="tab"
            type="button"
            aria-selected={tab === v.key}
            onClick={() => setTab(v.key)}
            className={`pressable min-h-touch rounded-control px-5 text-body font-bold transition ${
              tab === v.key
                ? 'bg-white text-primary shadow-card dark:bg-dark-surface dark:text-dark-text'
                : 'text-muted hover:text-primary dark:text-dark-muted'
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-6 flex items-start gap-2 rounded-control bg-danger-sub px-3 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-danger" strokeWidth={1.8} aria-hidden />
          <p className="text-body text-danger">{error}</p>
        </div>
      )}

      {tab === 'ventes' && <StatsPanel />}

      <div className={`space-y-8 ${tab === 'ventes' ? 'hidden' : ''}`}>
        {/* ══ Les onze étapes ══ */}
        <section className="space-y-3">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-card font-bold text-primary dark:text-dark-text">
              Mise en route
            </h2>
            <span className="amount text-note text-muted dark:text-dark-muted">
              {stepsDone} / {steps.length}
            </span>
          </div>

          {nextStep && (
            <Card className="flex flex-wrap items-center justify-between gap-4 p-4">
              <div className="min-w-0">
                <p className="text-note font-bold uppercase tracking-wide text-muted dark:text-dark-muted">
                  Prochaine étape
                </p>
                <p className="mt-1 text-body font-semibold text-primary dark:text-dark-text">
                  {nextStep.label}
                </p>
                <p className="mt-1 text-note text-muted dark:text-dark-muted">{nextStep.hint}</p>
              </div>

              {nextStep.external ? (
                <Button variant="accent" onClick={() => preview(nextStep.href)} disabled={pending}>
                  Ouvrir l'aperçu
                </Button>
              ) : (
                <Link href={nextStep.href}>
                  <Button variant="accent" icon={<Rocket className="h-4 w-4" strokeWidth={1.8} aria-hidden />}>
                    {nextStep.label}
                  </Button>
                </Link>
              )}
            </Card>
          )}

          <Card className="divide-y divide-border p-0 dark:divide-dark-border">
            {steps.map((step, index) => (
              <StepRow
                key={step.key}
                index={index + 1}
                step={step}
                onPreview={step.external ? () => preview(step.href) : undefined}
              />
            ))}
          </Card>
        </section>

        {/* ══ La note ══ */}
        <section className="space-y-3">
          <h2 className="text-card font-bold text-primary dark:text-dark-text">
            Santé de la boutique
          </h2>

          {health.level === 'neuf' ? (
            <Card className="p-4">
              <p className="text-body text-text2 dark:text-dark-text2">
                La note se calcule sur votre catalogue. Ajoutez un premier produit pour l'obtenir.
              </p>
              <Link
                href="/products"
                className="pressable mt-3 inline-flex min-h-touch items-center text-body font-semibold text-primary underline underline-offset-4 dark:text-accent"
              >
                Créer un produit
              </Link>
            </Card>
          ) : (
            <>
              <Card className="space-y-3 p-4">
                <div className="flex items-end justify-between gap-4">
                  <p className="amount text-amount-lg font-hero text-primary dark:text-dark-text">
                    {health.score}
                    <span className="text-body font-normal text-muted dark:text-dark-muted"> / 100</span>
                  </p>
                  <Badge tone={tone}>{LEVEL_LABEL[health.level]}</Badge>
                </div>
                <ScoreBar score={health.score} tone={tone} />
                <p className="text-note text-muted dark:text-dark-muted">
                  {data.orderCount === 0
                    ? 'Aucune commande reçue pour le moment.'
                    : `${data.orderCount} commande${data.orderCount > 1 ? 's' : ''} reçue${data.orderCount > 1 ? 's' : ''} depuis l'ouverture.`}
                </p>
              </Card>

              {health.todo.length > 0 && (
                <Card className="divide-y divide-border p-0 dark:divide-dark-border">
                  {health.todo.map((c) => (
                    <Link
                      key={c.key}
                      href={c.href}
                      className="pressable flex min-h-touch items-center justify-between gap-4 p-4 transition hover:bg-surface dark:hover:bg-white/5"
                    >
                      <div className="min-w-0">
                        <p className="text-body font-semibold text-primary dark:text-dark-text">
                          {c.recommendation}
                        </p>
                        <p className="mt-1 text-note text-muted dark:text-dark-muted">{c.detail}</p>
                      </div>
                      <span className="amount flex-shrink-0 text-note text-muted dark:text-dark-muted">
                        +{c.weight - c.earned}
                      </span>
                    </Link>
                  ))}
                </Card>
              )}
            </>
          )}
        </section>

        {/* ══ Le détail ══ */}
        {health.level !== 'neuf' && (
          <section className="space-y-3">
            <h2 className="text-card font-bold text-primary dark:text-dark-text">
              Le détail de la note
            </h2>
            <Card className="divide-y divide-border p-0 dark:divide-dark-border">
              {health.criteria.map((c) => <CriterionRow key={c.key} criterion={c} />)}
            </Card>
          </section>
        )}
      </div>
    </div>
  );
}

// ── Une étape ───────────────────────────────────────────────────────────────

function StepRow({
  index, step, onPreview,
}: {
  index: number;
  step: LaunchStep;
  onPreview?: () => void;
}) {
  const body = (
    <>
      <span
        className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-pill text-note font-bold ${
          step.done
            ? 'bg-success-sub text-success'
            : 'bg-surface2 text-muted dark:bg-dark-surface2 dark:text-dark-muted'
        }`}
        aria-hidden
      >
        {step.done ? <Check className="h-4 w-4" strokeWidth={2.4} /> : index}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-body font-semibold text-primary dark:text-dark-text">
          {step.label}
        </span>
        <span className="mt-0.5 block text-note text-muted dark:text-dark-muted">{step.hint}</span>
      </span>

      {!step.done && (
        <ArrowRight className="h-4 w-4 flex-shrink-0 text-muted dark:text-dark-muted" strokeWidth={1.8} aria-hidden />
      )}
    </>
  );

  const shell =
    'pressable flex min-h-touch w-full items-center gap-4 p-4 text-left transition hover:bg-surface dark:hover:bg-white/5';

  if (onPreview) {
    return (
      <button type="button" onClick={onPreview} className={shell}>
        {body}
        <span className="sr-only">Ouvre la boutique dans un nouvel onglet</span>
      </button>
    );
  }

  return (
    <Link href={step.href} className={shell}>
      {body}
    </Link>
  );
}

// ── Un critère de la note ───────────────────────────────────────────────────

function CriterionRow({ criterion }: { criterion: HealthCriterion }) {
  const dot =
    criterion.status === 'ok' ? 'text-success'
    : criterion.status === 'warn' ? 'text-warning'
    : 'text-muted dark:text-dark-muted';

  return (
    <div className="flex items-center justify-between gap-4 p-4">
      <div className="flex min-w-0 items-start gap-3">
        {criterion.status === 'ok' ? (
          <Check className={`mt-0.5 h-4 w-4 flex-shrink-0 ${dot}`} strokeWidth={2.2} aria-hidden />
        ) : (
          <Circle className={`mt-0.5 h-4 w-4 flex-shrink-0 ${dot}`} strokeWidth={1.8} aria-hidden />
        )}
        <div className="min-w-0">
          <p className="text-body text-primary dark:text-dark-text">{criterion.label}</p>
          <p className="mt-0.5 text-note text-muted dark:text-dark-muted">{criterion.detail}</p>
        </div>
      </div>

      <span className="amount flex-shrink-0 text-note text-muted dark:text-dark-muted">
        {criterion.earned} / {criterion.weight}
      </span>
    </div>
  );
}
