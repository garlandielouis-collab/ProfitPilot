/**
 * ReportLayout — Shared A4 wrapper for all ProfitPilot financial reports
 * Handles: header, footer, print isolation, signature areas
 */

import React from 'react';

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

export interface ReportMeta {
  companyName: string;
  reportTitle: string;
  reportSubtitle: string;  // e.g. "Exercice clos le 31 décembre 2025"
  currency?: string;       // default "HTG"
  preparedBy?: string;
  approvedBy?: string;
  reportDate?: string;
  /** Exercice couvert par l'état — sert aux en-têtes de colonnes. */
  currentYear?: number;
  /** Exercice de comparaison ; par défaut `currentYear - 1`. */
  previousYear?: number;
}

interface ReportLayoutProps {
  meta: ReportMeta;
  children: React.ReactNode;
  pageNumber?: number;
  totalPages?: number;
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function formatDate(iso?: string) {
  const d = iso ? new Date(iso) : new Date();
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

/**
 * Le nom de la devise dans laquelle l'état est RÉELLEMENT exprimé.
 *
 * L'en-tête écrivait « Gourdes Haïtiennes » en dur devant le code : un rapport
 * tenu en dollars s'imprimait « Gourdes Haïtiennes (USD) », une contradiction
 * sur le document même qu'on remet au banquier. Un code inconnu s'affiche seul
 * plutôt que sous un nom deviné.
 */
export function currencyName(code?: string | null, lang: 'fr' | 'ht' = 'fr'): string {
  const c = (code || 'HTG').toUpperCase();
  if (c === 'HTG') return lang === 'ht' ? 'Goud Ayisyen (HTG)' : 'Gourdes Haïtiennes (HTG)';
  if (c === 'USD') return lang === 'ht' ? 'Dola Ameriken (USD)' : 'Dollars Américains (USD)';
  return c;
}

// ─────────────────────────────────────────────────────────────────
// ProfitPilot Logo Mark (SVG inline — no external deps)
// ─────────────────────────────────────────────────────────────────

function PPLogo() {
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="36" height="36" rx="8" fill="#0F172A" />
      <path d="M10 10h8.5c3.3 0 5.5 2 5.5 5s-2.2 5-5.5 5H13v6h-3V10z" fill="#50C878" />
      <path d="M13 13h5c1.5 0 2.5 0.9 2.5 2s-1 2-2.5 2h-5v-4z" fill="#fff" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────
// Divider
// ─────────────────────────────────────────────────────────────────

export function ReportDivider({ className = '' }: { className?: string }) {
  return <div className={`border-t border-border ${className}`} />;
}

// ─────────────────────────────────────────────────────────────────
// Row — standard accounting line
// ─────────────────────────────────────────────────────────────────

interface RowProps {
  label: string;
  note?: string;
  current: number | null;
  previous?: number | null;
  indent?: 0 | 1 | 2;
  bold?: boolean;
  highlight?: 'green' | 'navy' | 'red' | 'gray';
  topBorder?: boolean;
  doubleBorder?: boolean;
  italic?: boolean;
}

export function AccountingRow({
  label,
  note,
  current,
  previous,
  indent = 0,
  bold = false,
  highlight,
  topBorder = false,
  doubleBorder = false,
  italic = false,
}: RowProps) {
  const indentPx = indent === 1 ? 'pl-6' : indent === 2 ? 'pl-12' : 'pl-0';

  const bgClass =
    highlight === 'green' ? 'bg-accent-sub' :
    highlight === 'navy'  ? 'bg-anthracite text-white' :
    highlight === 'gray'  ? 'bg-surface' :
    highlight === 'red'   ? 'bg-danger-sub' : '';

  const textClass =
    highlight === 'navy' ? 'text-white' :
    highlight === 'green' ? 'text-accent-a' :
    highlight === 'red'   ? 'text-danger' : 'text-anthracite';

  const numberColor =
    highlight === 'navy'  ? 'text-emerald-300' :
    highlight === 'green' ? 'text-accent-a' :
    highlight === 'red'   ? 'text-danger' :
    current !== null && current < 0 ? 'text-danger' : 'text-anthracite';

  const fontClass = bold ? 'font-semibold' : italic ? 'italic' : 'font-normal';

  function fmt(v: number | null) {
    if (v === null) return '—';
    const abs = Math.abs(v);
    const formatted = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(abs);
    return v < 0 ? `(${formatted})` : formatted;
  }

  return (
    <div
      className={`
        flex items-center gap-2 px-4 py-2
        ${bgClass}
        ${topBorder ? 'border-t border-slate-300' : ''}
        ${doubleBorder ? 'border-t-2 border-double border-anthracite' : ''}
      `}
    >
      {/* Label */}
      <div className={`flex-1 flex items-baseline gap-2 ${indentPx}`}>
        <span className={`text-note leading-5 ${fontClass} ${textClass}`}>{label}</span>
        {note && <span className="text-note text-slate-400 font-normal">{note}</span>}
      </div>

      {/* Current year */}
      <div className={`w-28 text-right tabular-nums text-note ${fontClass} ${numberColor}`}>
        {fmt(current)}
      </div>

      {/* Previous year (optional) */}
      {previous !== undefined && (
        <div className={`w-28 text-right tabular-nums text-note font-normal text-slate-400`}>
          {fmt(previous)}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Section Header
// ─────────────────────────────────────────────────────────────────

export function SectionHeader({
  title,
  showPrevious = false,
}: {
  title: string;
  showPrevious?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-anthracite mt-4 first:mt-0">
      <span className="flex-1 text-note font-semibold uppercase tracking-[0.12em] text-slate-400">
        {title}
      </span>
      <span className="w-28 text-right text-note font-semibold uppercase tracking-[0.08em] text-white">
        2025
      </span>
      {showPrevious && (
        <span className="w-28 text-right text-note font-semibold uppercase tracking-[0.08em] text-muted">
          2024
        </span>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Column Headers (for the data table)
// ─────────────────────────────────────────────────────────────────

/**
 * En-têtes de colonnes des états financiers.
 *
 * L'exercice et la devise sont des paramètres, pas des constantes : ces états
 * partent chez une banque ou une institution de microfinance (bonus 5), et un
 * état daté 2025 alors qu'il couvre 2026 est un document non recevable.
 */
export function ColumnHeaders({
  showPrevious = true,
  currency = 'HTG',
  currentYear = new Date().getFullYear(),
  previousYear,
}: {
  showPrevious?: boolean;
  currency?: string;
  currentYear?: number;
  previousYear?: number;
}) {
  const prevYear = previousYear ?? currentYear - 1;

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b-2 border-anthracite bg-white">
      <div className="flex-1 text-note font-semibold uppercase tracking-[0.12em] text-muted">
        Libellé
      </div>
      <div className="w-28 text-right text-note font-semibold uppercase tracking-[0.08em] text-anthracite">
        {currentYear} ({currency})
      </div>
      {showPrevious && (
        <div className="w-28 text-right text-note font-semibold uppercase tracking-[0.08em] text-slate-400">
          {prevYear} ({currency})
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Main Layout
// ─────────────────────────────────────────────────────────────────

export default function ReportLayout({
  meta,
  children,
  pageNumber = 1,
  totalPages = 1,
}: ReportLayoutProps) {
  const currency = meta.currency ?? 'HTG';
  const generatedOn = formatDate();

  return (
    <div
      className="report-page bg-white"
      style={{
        /* Screen: show an A4-proportioned card.
           Print: @page margins take over — width/padding are
           overridden by globals.css @media print rules.        */
        width: '210mm',
        minHeight: '267mm',      /* 297mm - 2×15mm top/bottom screen padding */
        padding: '14mm 16mm 14mm 16mm',
        fontFamily: '"Inter", "SF Pro Display", system-ui, sans-serif',
        fontSize: '13px',
        color: '#0F172A',
        position: 'relative',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        pageBreakAfter: 'always',
        pageBreakInside: 'avoid',
      }}
    >
      {/* ── HEADER ── */}
      <header className="flex items-start justify-between pb-5 border-b-2 border-anthracite mb-6">
        {/* Left: branding + company */}
        <div className="flex flex-col gap-1">
          {/* ProfitPilot badge */}
          <div className="flex items-center gap-2 mb-3">
            <PPLogo />
            <div>
              <div
                className="text-note font-semibold tracking-[0.14em] uppercase text-accent"
                style={{ letterSpacing: '0.14em' }}
              >
                ProfitPilot
              </div>
              <div className="text-note text-slate-400 tracking-wider uppercase">
                Business Intelligence
              </div>
            </div>
          </div>

          {/* Company name */}
          <div
            className="text-amount font-bold text-anthracite leading-tight tracking-tight"
          >
            {meta.companyName}
          </div>

          {/* Currency note */}
          <div className="text-note text-muted mt-1">
            Exprimé en{' '}
            <span className="font-medium text-anthracite">
              {currencyName(currency)}
            </span>
          </div>
        </div>

        {/* Right: report title block */}
        <div className="text-right flex flex-col items-end gap-1">
          <div
            className="text-card font-bold text-anthracite uppercase tracking-[0.06em] leading-tight text-right"
          >
            {meta.reportTitle}
          </div>
          <div className="text-note font-medium text-muted mt-1 text-right">
            {meta.reportSubtitle}
          </div>
          {/* Emerald accent bar */}
          <div
            className="mt-3 h-[3px] rounded-full bg-accent"
            style={{ width: '80px' }}
          />
        </div>
      </header>

      {/* ── CONTENT ── */}
      <main className="flex-1">{children}</main>

      {/* ── FOOTER ── */}
      <footer className="mt-8 pt-4 border-t border-border">
        {/* Signature row */}
        <div className="grid grid-cols-2 gap-8 mb-5">
          <div>
            <div className="text-note uppercase tracking-[0.12em] text-slate-400 mb-1">
              Préparé par
            </div>
            <div className="h-8 border-b border-slate-300" />
            <div className="mt-1 text-note text-anthracite font-medium">
              {meta.preparedBy || '________________________________'}
            </div>
            <div className="text-note text-slate-400">Signature · Date</div>
          </div>
          <div>
            <div className="text-note uppercase tracking-[0.12em] text-slate-400 mb-1">
              Approuvé par
            </div>
            <div className="h-8 border-b border-slate-300" />
            <div className="mt-1 text-note text-anthracite font-medium">
              {meta.approvedBy || '________________________________'}
            </div>
            <div className="text-note text-slate-400">Signature · Date</div>
          </div>
        </div>

        {/* Meta row */}
        <div className="flex items-center justify-between text-note text-slate-400">
          <div className="flex items-center gap-1">
            <PPLogo />
            <span className="ml-1 font-medium text-muted">ProfitPilot</span>
            <span>· Rapport généré le {generatedOn}</span>
          </div>
          <div>
            Page {pageNumber} / {totalPages}
          </div>
        </div>
      </footer>
    </div>
  );
}
