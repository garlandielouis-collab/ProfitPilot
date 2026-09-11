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
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link';
import { useMemo, useState, useEffect } from 'react';
import { useLanguage } from '../../components/LanguageWrapper';
import { checkSubscriptionExpired } from '../../hooks/useSubscription';
import { supabase } from '../../lib/supabaseClient';
import { PLANS, PLAN_COMMON_GROUND, TRIAL_DAYS, USD_RATE } from '../../lib/plans';

function formatUsd(amount: number) {
  return new Intl.NumberFormat('en-US', {
    style:               'currency',
    currency:            'USD',
    maximumFractionDigits: 2,
  }).format(amount);
}

function CheckIcon() {
  return (
    <svg className="h-4 w-4 flex-shrink-0 text-accent" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

export default function PricingPage() {
  const [currency, setCurrency] = useState<'HTG' | 'USD'>('HTG');
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
      })),
    [currency]
  );

  return (
    <div className="min-h-full bg-[var(--color-bg)] px-4 py-8 sm:px-6 lg:px-8">
      {/* ── Header ── */}
      <div className="mb-10 text-center">
        <span className="inline-block rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-accent">
          {t({ fr: 'Nos offres', ht: 'Ofr nou yo' })}
        </span>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-primary dark:text-white sm:text-4xl">
          {t({ fr: 'Choisissez votre offre', ht: 'Chwazi ofr ou' })}
        </h1>
        <p className="mt-3 max-w-xl mx-auto text-sm text-[var(--color-muted)]">
          {t({
            fr: 'Vous changez d’offre quand vous voulez. Vos chiffres restent les vôtres, dans tous les cas.',
            ht: 'Ou chanje ofr lè ou vle. Chif ou yo rete pou ou, nan tout ka.',
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

        {/* Currency toggle */}
        <div className="mt-6 inline-flex items-center gap-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-1">
          {(['HTG', 'USD'] as const).map((cur) => (
            <button
              key={cur}
              type="button"
              onClick={() => setCurrency(cur)}
              className={`rounded-lg px-5 py-2 text-sm font-semibold transition-all duration-150 ${
                currency === cur
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-[var(--color-muted)] hover:text-primary dark:hover:text-white'
              }`}
            >
              {cur === 'HTG' ? 'Gourdes' : 'USD'}
            </button>
          ))}
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
              {/* Nom commercial + stade de vie. Le marchand doit se reconnaître
                  dans le sous-titre, pas s'y classer. */}
              <div>
                <p className="text-lg font-bold text-primary dark:text-white">
                  {plan.label}
                </p>
                <p className="mt-0.5 text-sm font-semibold italic text-accent">
                  {plan.stage.kreyol}
                </p>
                <p className="mt-1 text-xs text-[var(--color-muted)]">
                  {t(plan.stage.fr)}
                </p>
              </div>

              {/* Price */}
              <div className="mt-6 border-t border-[var(--color-border)] dark:border-slate-800 pt-6">
                <div className="flex items-end gap-1.5">
                  <span className="text-3xl font-bold leading-none text-primary dark:text-white">
                    {currency === 'HTG'
                      ? `G ${plan.displayPrice.toLocaleString('fr-FR')}`
                      : formatUsd(plan.displayPrice)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-[var(--color-muted)]">{t({ fr: 'par mois', ht: 'pa mwa' })}</p>
              </div>

              {/* Features */}
              <ul className="mt-6 flex-1 space-y-3">
                {plan.features.map((feature) => (
                  <li key={feature.fr} className="flex items-start gap-2.5 text-sm text-[var(--color-text)]">
                    <span className="mt-0.5"><CheckIcon /></span>
                    <span>{t(feature)}</span>
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <div className="mt-8">
                <Link
                  href={`/checkout?plan=${encodeURIComponent(plan.key)}`}
                  className={[
                    'flex w-full items-center justify-center rounded-xl px-5 py-3 text-sm font-semibold transition-all duration-150 hover:-translate-y-px',
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

      {/* ── Footer note ── */}
      <p className="mt-6 text-center text-xs text-[var(--color-muted)]">
        {t({
          fr: 'Payez par MonCash, NatCash ou carte. Aucun engagement : vous arrêtez quand vous voulez, et vos chiffres restent consultables.',
          ht: 'Peye ak MonCash, NatCash oswa kat. San angajman : ou kanpe lè ou vle, e chif ou yo rete la pou w gade yo.',
        })}
      </p>
    </div>
  );
}
