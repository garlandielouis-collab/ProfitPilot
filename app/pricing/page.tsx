'use client';

// ─────────────────────────────────────────────────────────────────────────────
// La page de prix — Esansyel · Kwasans · Elit
//
// Les offres ne sont plus décrites ici : elles viennent de `lib/plans.ts`, qui
// est aussi la source de l'aperçu (PlanPreviewSwitcher), du paiement
// (/checkout) et des messages d'upsell. Deux listes d'arguments qui divergent,
// c'est une promesse invérifiable au moment de payer.
//
// Sur téléphone, les cartes s'empilent et Kwasans passe EN PREMIER (`order`) :
// c'est la seule position vraiment vue, et c'est l'offre qu'on recommande.
//
// ── L'étude de marché inversée (§13) ─────────────────────────────────────────
//
// Trois choses ont changé, et elles se lisent dans cet ordre :
//
//   1. le lecteur dit d'abord son métier — Komès ou Sèvis. Un coiffeur ne doit
//      pas lire « stock » ni un boutiquier « rendez-vous » : même prix, pas les
//      mêmes outils, pas les mêmes exemples (« Pour qui ») ;
//   2. le prix se lit aussi par jour (« ≈ 33 goud pa jou ») : l'objection
//      « li twò chè » tombe devant « mwens pase yon kola » (§7) ;
//   3. chaque offre dit sa limite et le signe qu'il est temps d'en changer —
//      le marchand se reconnaît dans une phrase avant de lire une liste.
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link';
import { useMemo, useState, useEffect } from 'react';
import { Check, Minus } from 'lucide-react';
import { useLanguage } from '../../components/LanguageWrapper';
import { checkSubscriptionExpired } from '../../hooks/useSubscription';
import { supabase } from '../../lib/supabaseClient';
import {
  PLANS, PLAN_COMMON_GROUND, PLAN_COMPARISON, TRIAL_DAYS, USD_RATE, pricePerDay,
  type ComparisonCell,
} from '../../lib/plans';

type Trade = 'commerce' | 'service';

function formatUsd(amount: number) {
  return new Intl.NumberFormat('en-US', {
    style:               'currency',
    currency:            'USD',
    maximumFractionDigits: 2,
  }).format(amount);
}

function CheckIcon() {
  return <Check className="h-4 w-4 flex-shrink-0 text-accent" strokeWidth={2.5} aria-hidden />;
}

export default function PricingPage() {
  const [currency, setCurrency] = useState<'HTG' | 'USD'>('HTG');
  const [trade, setTrade] = useState<Trade>('commerce');
  const [trialExpired, setTrialExpired] = useState(false);
  // `null` tant qu'on ne sait pas : le bouton d'essai n'apparaît qu'une fois
  // établi que le visiteur n'a pas de compte.
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const { t } = useLanguage();

  useEffect(() => {
    setTrialExpired(checkSubscriptionExpired());
    supabase.auth.getSession()
      .then(({ data: { session } }: any) => setSignedIn(Boolean(session)))
      .catch(() => setSignedIn(false));
  }, []);

  const plans = useMemo(
    () =>
      PLANS.map((plan) => ({
        ...plan,
        displayPrice: currency === 'HTG' ? plan.priceG : plan.priceG * USD_RATE,
        perDay:       currency === 'HTG' ? pricePerDay(plan.priceG) : (plan.priceG * USD_RATE) / 30,
      })),
    [currency]
  );

  const rows = PLAN_COMPARISON.filter((row) => !row.trade || row.trade === trade);

  const renderCell = (cell: ComparisonCell) => {
    if (cell === true)  return <Check className="mx-auto h-4 w-4 text-accent" strokeWidth={2.5} aria-label={t({ fr: 'Inclus', ht: 'Enkli' })} />;
    if (cell === false) return <Minus className="mx-auto h-4 w-4 text-[var(--color-muted)]" aria-label={t({ fr: 'Non inclus', ht: 'Pa enkli' })} />;
    return <span className="text-xs font-semibold text-primary dark:text-white">{t(cell)}</span>;
  };

  return (
    <div className="min-h-full bg-[var(--color-bg)] px-4 py-8 sm:px-6 lg:px-8">
      {/* ── Header ── */}
      <div className="mb-10 text-center">
        <span className="inline-block rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-accent">
          {t({ fr: 'Nos offres', ht: 'Ofr nou yo' })}
        </span>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-primary dark:text-white sm:text-4xl">
          {t({ fr: 'Quelle phrase vous ressemble ?', ht: 'Ki fraz ki sanble w ?' })}
        </h1>
        <p className="mt-3 max-w-xl mx-auto text-sm text-[var(--color-muted)]">
          {t({
            fr: 'Une offre par étape de votre business. Vous changez quand vous voulez, et vos chiffres restent les vôtres.',
            ht: 'Yon ofr pou chak etap biznis ou. Ou chanje lè ou vle, e chif ou yo rete pou ou.',
          })}
        </p>

        {/* Trial banner */}
        {trialExpired && (
          <div className="mt-6 mx-auto max-w-lg rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
            <p className="text-sm text-amber-600 dark:text-amber-400">
              {t({ fr: 'Votre période d\'essai est terminée. Choisissez une offre pour continuer.', ht: 'Periyòd esè ou fini. Chwazi yon ofr pou kontinye.' })}
            </p>
          </div>
        )}

        {/* L'essai est une ligne `subscriptions` écrite par le serveur
            (`lib/trial.ts`) à la première lecture de l'offre d'un compte. Un
            compte connecté l'a donc déjà — ou l'a consommé : aucun bouton ne
            peut « l'activer ». Pour un visiteur, il commence à l'inscription. */}
        {!trialExpired && signedIn === false && (
          <div className="mt-4 mx-auto max-w-lg">
            <Link
              href="/auth/register"
              className="block w-full rounded-xl bg-accent px-6 py-3 text-sm font-bold text-accent-ink shadow-sm hover:bg-accent-h transition"
            >
              {t({
                fr: `Créer mon compte : essai gratuit de ${TRIAL_DAYS} jours`,
                ht: `Kreye kont mwen : esè gratis ${TRIAL_DAYS} jou`,
              })}
            </Link>
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {/* Le métier d'abord : il décide des exemples et des outils montrés. */}
          <div
            role="radiogroup"
            aria-label={t({ fr: 'Votre métier', ht: 'Metye w' })}
            className="inline-flex items-center gap-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-1"
          >
            {([
              { key: 'commerce' as const, label: { fr: 'Je vends des produits', ht: 'Mwen vann machandiz' } },
              { key: 'service'  as const, label: { fr: 'Je vends un service',   ht: 'Mwen bay sèvis' } },
            ]).map((option) => (
              <button
                key={option.key}
                type="button"
                role="radio"
                aria-checked={trade === option.key}
                onClick={() => setTrade(option.key)}
                className={`min-h-touch rounded-lg px-4 py-2 text-sm font-semibold transition-all duration-150 ${
                  trade === option.key
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-[var(--color-muted)] hover:text-primary dark:hover:text-white'
                }`}
              >
                {t(option.label)}
              </button>
            ))}
          </div>

          {/* Currency toggle */}
          <div className="inline-flex items-center gap-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-1">
            {(['HTG', 'USD'] as const).map((cur) => (
              <button
                key={cur}
                type="button"
                onClick={() => setCurrency(cur)}
                className={`min-h-touch rounded-lg px-5 py-2 text-sm font-semibold transition-all duration-150 ${
                  currency === cur
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-[var(--color-muted)] hover:text-primary dark:hover:text-white'
                }`}
              >
                {cur === 'HTG' ? 'Goud' : 'USD'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Plan cards ── */}
      <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-3">
        {plans.map((plan) => (
          <div
            key={plan.key}
            className={[
              'relative flex flex-col rounded-2xl border bg-white dark:bg-dark-surface transition-shadow duration-200',
              // Empilé sur téléphone, l'offre recommandée passe devant : plus bas,
              // elle ne serait jamais vue. Sur trois colonnes, elle reprend sa place.
              plan.popular ? 'order-first lg:order-none' : '',
              plan.popular
                // Un anneau, pas une ombre : une ombre sert la profondeur, pas la
                // sélection. Si un élément a besoin d'une ombre dure pour se
                // détacher, le vrai manque est un contraste (§3.2).
                ? 'border-primary ring-2 ring-primary dark:border-accent dark:ring-accent'
                : 'border-[var(--color-border)] shadow-card hover:shadow-card-hover',
            ].join(' ')}
          >
            {/* Popular badge */}
            {plan.popular && (
              <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-primary px-3 py-1 text-note font-bold uppercase tracking-widest text-white dark:bg-accent dark:text-primary">
                  {t(plan.highlight)}
                </span>
              </div>
            )}

            <div className="flex flex-1 flex-col p-6">
              {/* La phrase avant le nom : le marchand doit se reconnaître dans
                  « Mwen vle KONNEN » avant de lire « Esansyel ». */}
              <div>
                <p className="text-lg font-bold text-primary dark:text-white">
                  « {plan.stage.kreyol} »
                </p>
                <p className="mt-0.5 text-sm font-semibold text-accent">
                  {plan.label}
                </p>
                <p className="mt-2 text-sm text-[var(--color-text)]">
                  {t(plan.description)}
                </p>
              </div>

              {/* Price */}
              <div className="mt-6 border-t border-[var(--color-border)] dark:border-slate-800 pt-6">
                <div className="flex items-end gap-1.5">
                  <span className="amount text-3xl font-bold leading-none text-primary dark:text-white">
                    {currency === 'HTG'
                      ? `G ${plan.displayPrice.toLocaleString('fr-FR')}`
                      : formatUsd(plan.displayPrice)}
                  </span>
                  <span className="mb-0.5 text-xs text-[var(--color-muted)]">{t({ fr: 'par mois', ht: 'pa mwa' })}</span>
                </div>
                <p className="mt-1 text-sm font-semibold text-accent">
                  {currency === 'HTG'
                    ? t({ fr: `≈ ${plan.perDay} HTG par jour`, ht: `≈ ${plan.perDay} goud pa jou` })
                    : t({ fr: `≈ ${formatUsd(plan.perDay)} par jour`, ht: `≈ ${formatUsd(plan.perDay)} pa jou` })}
                </p>
              </div>

              {/* Pour qui, dans le métier choisi */}
              <div className="mt-6 rounded-xl bg-[var(--color-surface)] p-3">
                <p className="text-note font-semibold uppercase tracking-wider text-[var(--color-muted)]">
                  {t({ fr: 'Pour qui', ht: 'Pou kiyès' })}
                </p>
                <p className="mt-1 text-sm text-[var(--color-text)]">{t(plan.forWhom[trade])}</p>
              </div>

              {/* Features */}
              <ul className="mt-6 space-y-3">
                {plan.features.map((feature) => (
                  <li key={feature.fr} className="flex items-start gap-2.5 text-sm text-[var(--color-text)]">
                    <span className="mt-0.5"><CheckIcon /></span>
                    <span>{t(feature)}</span>
                  </li>
                ))}
              </ul>

              {plan.extras[trade].length > 0 && (
                <div className="mt-5">
                  <p className="text-note font-semibold uppercase tracking-wider text-[var(--color-muted)]">
                    {trade === 'commerce'
                      ? t({ fr: 'En plus, pour un commerce', ht: 'Anplis, pou yon komès' })
                      : t({ fr: 'En plus, pour un service', ht: 'Anplis, pou yon sèvis' })}
                  </p>
                  <ul className="mt-3 space-y-3">
                    {plan.extras[trade].map((extra) => (
                      <li key={extra.fr} className="flex items-start gap-2.5 text-sm text-[var(--color-text)]">
                        <span className="mt-0.5"><CheckIcon /></span>
                        <span>{t(extra)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-6 flex-1 space-y-2 border-t border-[var(--color-border)] pt-4 dark:border-slate-800">
                <p className="text-xs text-[var(--color-muted)]">
                  <span className="font-semibold">{t({ fr: 'Limites : ', ht: 'Limit : ' })}</span>
                  {t(plan.limits)}
                </p>
                <p className="text-xs text-[var(--color-muted)]">{t(plan.nextSignal)}</p>
              </div>

              {/* CTA */}
              <div className="mt-6">
                <Link
                  href={`/checkout?plan=${encodeURIComponent(plan.key)}`}
                  className={[
                    'flex min-h-touch w-full items-center justify-center rounded-xl px-5 py-3 text-sm font-semibold transition-all duration-150 hover:-translate-y-px',
                    plan.popular
                      ? 'bg-primary text-white shadow-sm hover:bg-primary-h dark:bg-accent dark:text-primary dark:hover:bg-accent-h'
                      : 'border border-primary bg-transparent text-primary hover:bg-nav-active dark:border-slate-600 dark:text-slate-200 dark:hover:bg-white/5',
                  ].join(' ')}
                >
                  {t({ fr: `Choisir ${plan.label}`, ht: `Chwazi ${plan.label}` })}
                </Link>
                <p className="mt-3 text-center text-xs text-[var(--color-muted)]">
                  {t(plan.promise)}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Le socle commun ──
          Ce qui désamorce la peur qui empêche de payer : ce qu'il enregistre ne
          sera jamais retenu contre lui. */}
      <div className="mx-auto mt-10 max-w-5xl border-t border-[var(--color-border)] pt-6">
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-[var(--color-muted)]">
          <span className="font-semibold text-primary dark:text-white">
            {t({ fr: 'Dans les trois offres :', ht: 'Nan tou lè twa ofr yo :' })}
          </span>
          {PLAN_COMMON_GROUND.map((item) => (
            <span key={item.fr}>{t(item)}</span>
          ))}
        </div>
      </div>

      {/* ── Le tableau comparatif (§13.4) ──
          Les lignes d'un seul métier suivent le choix du haut de page. */}
      <div className="mx-auto mt-10 max-w-5xl">
        <h2 className="text-center text-lg font-bold text-primary dark:text-white">
          {t({ fr: 'Les trois offres, ligne par ligne', ht: 'Twa ofr yo, liy pa liy' })}
        </h2>
        <div className="mt-4 overflow-x-auto rounded-2xl border border-[var(--color-border)] bg-white dark:bg-dark-surface">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-left">
                <th className="p-3 font-semibold text-[var(--color-muted)]">{t({ fr: 'Ce que vous avez', ht: 'Sa w genyen' })}</th>
                {PLANS.map((plan) => (
                  <th key={plan.key} className="p-3 text-center font-semibold text-primary dark:text-white">{plan.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label.fr} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="p-3 text-[var(--color-text)]">{t(row.label)}</td>
                  {row.cells.map((cell, i) => (
                    <td key={i} className="p-3 text-center">{renderCell(cell)}</td>
                  ))}
                </tr>
              ))}
              <tr>
                <td className="p-3 font-semibold text-[var(--color-text)]">{t({ fr: 'Prix par mois', ht: 'Pri pa mwa' })}</td>
                {plans.map((plan) => (
                  <td key={plan.key} className="amount p-3 text-center font-semibold text-primary dark:text-white">
                    {currency === 'HTG' ? `${plan.priceG.toLocaleString('fr-FR')} HTG` : formatUsd(plan.displayPrice)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Footer note ── */}
      <p className="mt-6 text-center text-xs text-[var(--color-muted)]">
        {t({
          fr: 'Payez par MonCash ou NatCash, au mois ou 6 mois d’avance. Aucun engagement : vous arrêtez quand vous voulez, et vos chiffres restent consultables.',
          ht: 'Peye ak MonCash oswa NatCash, pa mwa oswa 6 mwa davans. San angajman : ou kanpe lè ou vle, e chif ou yo rete la pou w gade yo.',
        })}
      </p>
    </div>
  );
}
