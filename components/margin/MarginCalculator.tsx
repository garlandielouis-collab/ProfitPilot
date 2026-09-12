'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Calculateur de marge en temps réel — Diagnostic 1 + Diagnostic 4
//
// Le marchand tape un prix d'achat (souvent en USD) et un prix de vente (en
// HTG) : la marge NETTE se recalcule à chaque frappe, frais annexes et
// commission inclus. Aucun appel réseau — tout passe par lib/margin.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react';
import { AlertTriangle, TrendingUp, Wallet, Sparkles } from 'lucide-react';
import { computeMargin, suggestSalePrice } from '../../lib/margin';
import type { CurrencyCode } from '../../lib/currency';

type Props = {
  /**
   * Taux SAISI par le marchand : 1 USD = exchangeRate HTG. `null` quand il ne
   * l'a jamais renseigné — aucune conversion USD ↔ HTG n'est alors calculée.
   */
  exchangeRate: number | null;
  /** Devise d'affichage du résultat (devise de base de l'entreprise). */
  displayCurrency?: CurrencyCode;
  /** Valeurs de départ, ex. depuis une fiche produit. */
  initial?: Partial<{
    purchasePrice: number;
    costCurrency: CurrencyCode;
    salePrice: number;
    saleCurrency: CurrencyCode;
    deliveryCost: number;
    packagingCost: number;
    otherCost: number;
    commissionPercent: number;
    targetMarginPercent: number;
  }>;
  /** Remonte le prix conseillé quand l'utilisateur l'applique. */
  onApplyPrice?: (price: number) => void;
};

const fmt = (n: number, currency: string): string =>
  `${new Intl.NumberFormat('fr-HT', { maximumFractionDigits: 2 }).format(n)} ${currency}`;

// ─── Champ numérique compact ─────────────────────────────────────────────────

function NumberField({
  label,
  value,
  onChange,
  suffix,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
  step?: number;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
        {label}
      </span>
      <div className="relative">
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step={step}
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-primary outline-none transition
                     focus:border-accent focus:ring-2 focus:ring-accent/20
                     dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
        {suffix && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400">
            {suffix}
          </span>
        )}
      </div>
    </label>
  );
}

// ─── Composant principal ─────────────────────────────────────────────────────

export function MarginCalculator({
  exchangeRate,
  displayCurrency = 'HTG',
  initial,
  onApplyPrice,
}: Props) {
  const [purchasePrice,     setPurchasePrice]     = useState(initial?.purchasePrice ?? 0);
  const [costCurrency,      setCostCurrency]      = useState<CurrencyCode>(initial?.costCurrency ?? 'USD');
  const [salePrice,         setSalePrice]         = useState(initial?.salePrice ?? 0);
  const [deliveryCost,      setDeliveryCost]      = useState(initial?.deliveryCost ?? 0);
  const [packagingCost,     setPackagingCost]     = useState(initial?.packagingCost ?? 0);
  const [otherCost,         setOtherCost]         = useState(initial?.otherCost ?? 0);
  const [commissionPercent, setCommissionPercent] = useState(initial?.commissionPercent ?? 0);
  const [targetMargin,      setTargetMargin]      = useState(initial?.targetMarginPercent ?? 30);
  const [showExtras,        setShowExtras]        = useState(
    Boolean(initial?.deliveryCost || initial?.packagingCost || initial?.otherCost || initial?.commissionPercent),
  );

  // Un coût dans une autre devise que le résultat ne se convertit qu'au taux
  // saisi. Sans lui, la marge n'est PAS calculée : ni à 1, ni à 130.
  const rateMissing = costCurrency !== displayCurrency && exchangeRate === null;
  // Utilisé seulement si `!rateMissing` : taux saisi, ou même devise (où
  // convertCurrency rend le montant tel quel, sans lire le taux).
  const rate = exchangeRate ?? 1;

  const costInput = {
    purchasePrice,
    costCurrency,
    deliveryCost,
    packagingCost,
    otherCost,
    commissionPercent,
  };

  const result = useMemo(
    () =>
      rateMissing
        ? null
        : computeMargin({
            ...costInput,
            salePrice,
            saleCurrency: displayCurrency,
            exchangeRate: rate,
            displayCurrency,
          }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [purchasePrice, costCurrency, salePrice, deliveryCost, packagingCost, otherCost, commissionPercent, rate, rateMissing, displayCurrency],
  );

  const suggested = useMemo(
    () =>
      rateMissing
        ? 0
        : suggestSalePrice(costInput, {
            exchangeRate: rate,
            displayCurrency,
            targetMarginPercent: targetMargin,
          }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [purchasePrice, costCurrency, deliveryCost, packagingCost, otherCost, commissionPercent, targetMargin, rate, rateMissing, displayCurrency],
  );

  const tone = !result
    ? { bg: 'bg-slate-50 dark:bg-slate-900', border: 'border-slate-200 dark:border-slate-800', text: 'text-slate-500 dark:text-slate-400' }
    : result.isLoss
      ? { bg: 'bg-red-50 dark:bg-red-950/30', border: 'border-red-200 dark:border-red-900', text: 'text-red-600 dark:text-red-400' }
      : result.marginPercent < 10
        ? { bg: 'bg-amber-50 dark:bg-amber-950/30', border: 'border-amber-200 dark:border-amber-900', text: 'text-amber-600 dark:text-amber-400' }
        : { bg: 'bg-emerald-50 dark:bg-emerald-950/30', border: 'border-emerald-200 dark:border-emerald-900', text: 'text-emerald-600 dark:text-emerald-400' };

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
      {/* En-tête navy */}
      <div className="flex items-center gap-3 bg-primary px-5 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/20">
          <TrendingUp className="h-5 w-5 text-accent" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-white">Calculateur de marge</h3>
          <p className="text-xs text-slate-300">
            {exchangeRate !== null
              ? `Taux de l'entreprise : 1 USD = ${exchangeRate.toFixed(2)} HTG`
              : 'Taux USD → HTG non renseigné'}
          </p>
        </div>
      </div>

      <div className="space-y-4 p-5">
        {/* Saisie principale */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <NumberField
              label="Prix d'achat"
              value={purchasePrice}
              onChange={setPurchasePrice}
              suffix={costCurrency}
              step={0.01}
            />
            <div className="mt-2 flex gap-1">
              {(['USD', 'HTG'] as CurrencyCode[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCostCurrency(c)}
                  className={`flex-1 rounded-lg px-2 py-1 text-xs font-semibold transition ${
                    costCurrency === c
                      ? 'bg-primary text-white'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <NumberField
            label="Prix de vente"
            value={salePrice}
            onChange={setSalePrice}
            suffix={displayCurrency}
            step={0.01}
          />
        </div>

        {/* Frais annexes — repliés par défaut pour ne pas effrayer */}
        <button
          type="button"
          onClick={() => setShowExtras((v) => !v)}
          className="flex w-full items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300"
        >
          <span>Frais annexes (livraison, emballage, commission)</span>
          <span className="text-accent">{showExtras ? '−' : '+'}</span>
        </button>

        {showExtras && (
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="Livraison"  value={deliveryCost}      onChange={setDeliveryCost}      suffix={costCurrency} step={0.01} />
            <NumberField label="Emballage"  value={packagingCost}     onChange={setPackagingCost}     suffix={costCurrency} step={0.01} />
            <NumberField label="Autres"     value={otherCost}         onChange={setOtherCost}         suffix={costCurrency} step={0.01} />
            <NumberField label="Commission" value={commissionPercent} onChange={setCommissionPercent} suffix="%"           step={0.5}  />
          </div>
        )}

        {/* Résultat */}
        <div className={`rounded-2xl border p-4 ${tone.bg} ${tone.border}`}>
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Marge nette
            </span>
            <span className={`text-2xl font-black tabular-nums ${tone.text}`}>
              {result ? `${result.marginPercent.toFixed(1)}%` : '—'}
            </span>
          </div>

          {!result ? (
            // Coût en USD, résultat en HTG, pas de taux saisi : on le dit plutôt
            // que d'afficher une marge calculée à un taux que personne n'a donné.
            <p className="mt-2 text-xs font-medium text-slate-600 dark:text-slate-300">
              Prix d&apos;achat en {costCurrency} : la marge en {displayCurrency} ne se calcule qu&apos;avec
              le taux de change de l&apos;entreprise.{' '}
              <a href="/settings" className="font-semibold text-primary underline underline-offset-2 dark:text-slate-100">
                Renseigner le taux
              </a>
            </p>
          ) : (
            <>
              <p className={`mt-1 text-lg font-bold tabular-nums ${tone.text}`}>
                {fmt(result.netMargin, result.currency)}
              </p>

              {result.isLoss && (
                <div className="mt-3 flex items-start gap-2 rounded-xl bg-white/70 p-2.5 dark:bg-black/20">
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" />
                  <p className="text-xs font-medium text-red-600 dark:text-red-400">
                    Vous vendez à perte. Prix plancher : {fmt(result.breakEvenPrice, result.currency)}.
                  </p>
                </div>
              )}

              <dl className="mt-3 space-y-1 border-t border-black/5 pt-3 text-xs dark:border-white/10">
                <div className="flex justify-between">
                  <dt className="text-slate-500 dark:text-slate-400">Coût d&apos;achat converti</dt>
                  <dd className="font-semibold tabular-nums text-slate-700 dark:text-slate-200">
                    {fmt(result.baseCost, result.currency)}
                  </dd>
                </div>
                {result.extraCosts > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-slate-500 dark:text-slate-400">Frais annexes</dt>
                    <dd className="font-semibold tabular-nums text-slate-700 dark:text-slate-200">
                      {fmt(result.extraCosts, result.currency)}
                    </dd>
                  </div>
                )}
                {result.commission > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-slate-500 dark:text-slate-400">Commission</dt>
                    <dd className="font-semibold tabular-nums text-slate-700 dark:text-slate-200">
                      {fmt(result.commission, result.currency)}
                    </dd>
                  </div>
                )}
                <div className="flex justify-between border-t border-black/5 pt-1 dark:border-white/10">
                  <dt className="font-semibold text-slate-600 dark:text-slate-300">Coût réel complet</dt>
                  <dd className="font-bold tabular-nums text-primary dark:text-slate-100">
                    {fmt(result.landedCost, result.currency)}
                  </dd>
                </div>
              </dl>
            </>
          )}
        </div>

        {/* Prix conseillé */}
        <div className="rounded-surface bg-primary p-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-accent" />
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-300">
              Prix conseillé
            </span>
          </div>

          <div className="mt-2 flex items-end justify-between gap-3">
            <p className="text-2xl font-black tabular-nums text-white">
              {suggested > 0 ? fmt(suggested, displayCurrency) : '—'}
            </p>
            {onApplyPrice && suggested > 0 && (
              <button
                type="button"
                onClick={() => {
                  setSalePrice(suggested);
                  onApplyPrice(suggested);
                }}
                className="rounded-xl bg-accent px-3 py-2 text-xs font-bold text-accent-ink transition hover:bg-accent-h active:scale-95"
              >
                Appliquer
              </button>
            )}
          </div>

          <div className="mt-3 flex items-center gap-2">
            <Wallet className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-xs text-slate-300">Marge cible</span>
            <div className="flex gap-1">
              {[20, 30, 40, 50].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setTargetMargin(m)}
                  className={`rounded-lg px-2 py-1 text-xs font-semibold transition ${
                    targetMargin === m
                      ? 'bg-accent text-accent-ink'
                      : 'bg-white/10 text-slate-300 hover:bg-white/20'
                  }`}
                >
                  {m}%
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
