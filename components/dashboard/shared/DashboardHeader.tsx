'use client';

// ─────────────────────────────────────────────────────────────────────────────
// L'en-tête — §4 (Esansyel), §13 (Kwasans), §26 (Elit)
//
// Les trois offres partagent la même structure et changent de contenu :
//
//   §4   « Bonjour, [Prénom] » + « Voici comment se porte votre entreprise
//        aujourd'hui. » + le sélecteur Aujourd'hui / Cette semaine / Ce mois
//   §13  + le sélecteur d'entreprise, + « Comparer avec »
//   §26  + le titre « Business Command Center » et sa phrase d'état
//
// §53 — « Le dashboard doit toujours indiquer clairement : Current company. »
// Le nom de l'entreprise active est donc affiché DÈS qu'il y en a plusieurs.
// Quand il n'y en a qu'une, l'écrire serait du bruit : le marchand sait où il
// est (§3.6 de la constitution).
//
// La période est établie ICI, une fois pour toutes. C'est ce qui autorise
// chaque carte, plus bas, à n'afficher que « +12 % » sans répéter
// « vs la période précédente ».
// ─────────────────────────────────────────────────────────────────────────────

import { ScreenHeader } from '../../ds';
import { cn } from '../../../lib/utils';
import type { CompareKey, RangeKey } from '../range';

export function DashboardHeader({
  title,
  subtitle,
  companyName,
  showCompany,
  live,
  ranges,
  activeRange,
  onRangeChange,
  compares,
  activeCompare,
  onCompareChange,
  compareLabel,
}: {
  title: string;
  subtitle: string;
  companyName: string;
  /** §53 : seulement quand il y a plusieurs entreprises. */
  showCompany: boolean;
  live?: boolean;
  ranges: Array<{ key: RangeKey; label: string }>;
  activeRange: RangeKey;
  onRangeChange: (key: RangeKey) => void;
  /** Absent pour Esansyel : le §4 ne demande pas de comparaison. */
  compares?: Array<{ key: CompareKey; label: string }>;
  activeCompare?: CompareKey;
  onCompareChange?: (key: CompareKey) => void;
  compareLabel?: string;
}) {
  return (
    <div className="space-y-4">
      <ScreenHeader
        title={title}
        subtitle={showCompany ? `${companyName} · ${subtitle}` : subtitle}
        live={live}
      />

      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          options={ranges.map((r) => ({ key: r.key, label: r.label }))}
          active={activeRange}
          onChange={(k) => onRangeChange(k as RangeKey)}
        />

        {compares && onCompareChange && (
          <div className="flex items-center gap-2">
            {compareLabel && (
              <span className="text-note text-muted dark:text-dark-muted">{compareLabel}</span>
            )}
            <Segmented
              options={compares.map((c) => ({ key: c.key, label: c.label }))}
              active={activeCompare ?? 'previous'}
              onChange={(k) => onCompareChange(k as CompareKey)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Le sélecteur segmenté : fond marine sur l'élément choisi, comme partout
 * ailleurs dans le produit. La sélection se marque par le CONTRASTE, jamais
 * par une teinte différente par option (§3.4 de la constitution).
 */
export function Segmented({
  options,
  active,
  onChange,
}: {
  options: Array<{ key: string; label: string }>;
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="inline-flex gap-1 rounded-pill bg-surface2 p-1 dark:bg-dark-surface2">
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          onClick={() => onChange(option.key)}
          aria-pressed={option.key === active}
          className={cn(
            'pressable min-h-touch rounded-pill px-4 text-note font-bold',
            'transition-colors duration-press ease-pp',
            option.key === active
              ? 'bg-primary text-white'
              : 'text-text2 dark:text-dark-text2',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
