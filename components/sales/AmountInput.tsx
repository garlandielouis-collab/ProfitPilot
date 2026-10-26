'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Le montant, dans l'unité où le marchand le pense (F07 de l'étude)
//
// « Il achète en dollars, vend en gourdes, affiche parfois en dola ayisyen
// (5 gourdes) » (§5, douleur n°4). Trois unités, un seul champ : il tape le
// chiffre qu'il a en tête, et l'application fait la conversion. Le dola
// ayisyen n'est pas une devise : c'est une façon de compter les gourdes, par
// cinq. Il est donc converti ici, avant de partir — en base, il n'y a que des
// gourdes et des dollars.
// ─────────────────────────────────────────────────────────────────────────────

import { useLanguage } from '../LanguageWrapper';
import { cn } from '../../lib/utils';

export type AmountUnit = 'HTG' | 'DOLA' | 'USD';

/** 1 dola ayisyen = 5 gourdes. */
export const DOLA_AYISYEN_IN_HTG = 5;

/**
 * Le montant en gourdes pour une saisie en goud ou en dola ayisyen. Un montant
 * en dollars américains reste en dollars : c'est le serveur qui le convertit,
 * au taux du jour saisi par le marchand, jamais à un taux deviné ici.
 */
export function toHtg(value: number, unit: AmountUnit): number {
  if (!Number.isFinite(value)) return 0;
  return unit === 'DOLA' ? value * DOLA_AYISYEN_IN_HTG : value;
}

const UNITS: { key: AmountUnit; label: { fr: string; ht: string } }[] = [
  { key: 'HTG',  label: { fr: 'Gourde', ht: 'Goud' } },
  { key: 'DOLA', label: { fr: 'Dola ayisyen', ht: 'Dola' } },
  { key: 'USD',  label: { fr: 'Dollar US', ht: 'Dola US' } },
];

export function AmountInput({
  value,
  onChange,
  unit,
  onUnitChange,
  autoFocus = false,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  unit: AmountUnit;
  onUnitChange: (u: AmountUnit) => void;
  autoFocus?: boolean;
  label?: string;
}) {
  const { t } = useLanguage();
  const numeric = Number(value.replace(',', '.'));
  const showsConversion = unit === 'DOLA' && numeric > 0;

  return (
    <div className="space-y-2">
      <label htmlFor="pp-amount" className="block text-note font-bold uppercase tracking-wide text-muted dark:text-dark-muted">
        {label ?? t({ fr: 'Montant', ht: 'Montan' })}
      </label>
      <input
        id="pp-amount"
        inputMode="decimal"
        autoComplete="off"
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9.,]/g, ''))}
        placeholder="0"
        className="amount min-h-hero w-full rounded-surface border border-border bg-surface px-4 text-amount-lg font-bold text-primary outline-none placeholder:text-muted focus:border-accent dark:border-dark-border dark:bg-dark-surface2 dark:text-dark-text"
      />
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={t({ fr: 'Unité', ht: 'Inite' })}>
        {UNITS.map((u) => (
          <button
            key={u.key}
            type="button"
            role="radio"
            aria-checked={unit === u.key}
            onClick={() => onUnitChange(u.key)}
            className={cn(
              'pressable min-h-touch rounded-control px-2 text-note font-bold transition-colors duration-press',
              unit === u.key
                ? 'bg-primary text-white'
                : 'bg-surface2 text-primary hover:bg-border dark:bg-dark-surface2 dark:text-dark-text',
            )}
          >
            {t(u.label)}
          </button>
        ))}
      </div>
      {showsConversion && (
        <p className="text-note text-muted dark:text-dark-muted" aria-live="polite">
          = {new Intl.NumberFormat('fr-FR').format(toHtg(numeric, 'DOLA'))} {t({ fr: 'gourdes', ht: 'goud' })}
        </p>
      )}
    </div>
  );
}
