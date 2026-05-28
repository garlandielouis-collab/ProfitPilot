'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

type PricingPlan = {
  key:         'Ti Machann' | 'Business Pilot' | 'Expert';
  priceG:      number;
  description: string;
  features:    string[];
  highlight:   string;
  popular?:    boolean;
};

const plans: PricingPlan[] = [
  {
    key:         'Ti Machann',
    priceG:      1000,
    description: 'Démarrage léger avec gestion des ventes et inventaire.',
    features:    ['Ventes en temps réel', 'Suivi des stocks', 'Rapports de base', 'Support standard'],
    highlight:   'Petit commerce',
  },
  {
    key:         'Business Pilot',
    priceG:      2500,
    description: "Pilotez votre business avec rapports avancés et gestion d'équipe.",
    features:    ['Tout Ti Machann', "Dashboard avancé", "Gestion d'équipe", 'Rapports détaillés', 'Analyses IA'],
    highlight:   'Populaire',
    popular:     true,
  },
  {
    key:         'Expert',
    priceG:      7500,
    description: 'La solution complète avec support prioritaire et automatisation.',
    features:    ['Tout Business Pilot', 'Support prioritaire 24/7', 'Analyses avancées', 'Automatisation', 'API Access'],
    highlight:   'Premium',
  },
];

const USD_RATE = 0.012;

function formatUsd(amount: number) {
  return new Intl.NumberFormat('en-US', {
    style:               'currency',
    currency:            'USD',
    maximumFractionDigits: 2,
  }).format(amount);
}

function CheckIcon() {
  return (
    <svg className="h-4 w-4 flex-shrink-0 text-[#50C878]" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

export default function PricingPage() {
  const [currency, setCurrency] = useState<'HTG' | 'USD'>('HTG');

  const convertedRates = useMemo(
    () =>
      plans.map((plan) => ({
        ...plan,
        displayPrice: currency === 'HTG' ? plan.priceG : plan.priceG * USD_RATE,
      })),
    [currency]
  );

  return (
    <div className="min-h-full bg-[var(--color-bg)] px-4 py-8 sm:px-6 lg:px-8">
      {/* ── Header ── */}
      <div className="mb-10 text-center">
        <span className="inline-block rounded-full border border-[#50C878]/30 bg-[#50C878]/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-[#50C878]">
          Pricing
        </span>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-[#001F3F] dark:text-white sm:text-4xl">
          Choisissez votre plan ProfitPilot
        </h1>
        <p className="mt-3 max-w-xl mx-auto text-sm text-[var(--color-muted)]">
          Passez à l'étape suivante avec une offre adaptée à votre activité et votre équipe.
        </p>

        {/* Currency toggle */}
        <div className="mt-6 inline-flex items-center gap-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-1">
          {(['HTG', 'USD'] as const).map((cur) => (
            <button
              key={cur}
              type="button"
              onClick={() => setCurrency(cur)}
              className={`rounded-lg px-5 py-2 text-sm font-semibold transition-all duration-150 ${
                currency === cur
                  ? 'bg-[#001F3F] text-white shadow-sm'
                  : 'text-[var(--color-muted)] hover:text-[#001F3F] dark:hover:text-white'
              }`}
            >
              {cur === 'HTG' ? 'Gourdes' : 'USD'}
            </button>
          ))}
        </div>
      </div>

      {/* ── Plan cards ── */}
      <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-3">
        {convertedRates.map((plan) => (
          <div
            key={plan.key}
            className={[
              'relative flex flex-col rounded-2xl border bg-white dark:bg-[#0F172A] transition-shadow duration-200',
              plan.popular
                ? 'border-[#001F3F] shadow-[0_0_0_2px_#001F3F] dark:border-[#50C878] dark:shadow-[0_0_0_2px_#50C878]'
                : 'border-[var(--color-border)] shadow-card hover:shadow-card-hover',
            ].join(' ')}
          >
            {/* Popular badge */}
            {plan.popular && (
              <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                <span className="inline-flex items-center gap-1 rounded-full bg-[#001F3F] px-3 py-1 text-[0.65rem] font-bold uppercase tracking-widest text-white dark:bg-[#50C878] dark:text-[#001F3F]">
                  ★ Recommandé
                </span>
              </div>
            )}

            <div className="flex flex-1 flex-col p-6">
              {/* Plan name + highlight */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-[#001F3F] dark:text-[#50C878]">
                    {plan.key}
                  </p>
                  <p className="mt-2 text-sm text-[var(--color-muted)]">{plan.description}</p>
                </div>
                <span className="flex-shrink-0 rounded-lg bg-[var(--color-surface)] dark:bg-white/5 px-2.5 py-1 text-xs font-medium text-[var(--color-muted)]">
                  {plan.highlight}
                </span>
              </div>

              {/* Price */}
              <div className="mt-6 border-t border-[var(--color-border)] dark:border-slate-800 pt-6">
                <div className="flex items-end gap-1.5">
                  <span className="text-3xl font-bold leading-none text-[#001F3F] dark:text-white">
                    {currency === 'HTG'
                      ? `G ${plan.displayPrice.toLocaleString('fr-FR')}`
                      : formatUsd(plan.displayPrice)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-[var(--color-muted)]">par mois</p>
              </div>

              {/* Features */}
              <ul className="mt-6 flex-1 space-y-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2.5 text-sm text-[var(--color-text)]">
                    <CheckIcon />
                    <span>{feature}</span>
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
                      ? 'bg-[#001F3F] text-white shadow-sm hover:bg-[#002D5B] dark:bg-[#50C878] dark:text-[#001F3F] dark:hover:bg-[#3daa62]'
                      : 'border border-[#001F3F] bg-transparent text-[#001F3F] hover:bg-[#EAF1F8] dark:border-slate-600 dark:text-slate-200 dark:hover:bg-white/5',
                  ].join(' ')}
                >
                  Choisir ce plan
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Footer note ── */}
      <p className="mt-10 text-center text-xs text-[var(--color-muted)]">
        Tous les prix sont en{' '}
        {currency === 'HTG' ? 'Gourdes haïtiennes (HTG)' : 'USD'}.
        {' '}Annulation possible à tout moment.
      </p>
    </div>
  );
}
