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
  phone?: string;
  address?: string;
  sector?: string;
  taxId?: string;
  preparedBy?: string;
  approvedBy?: string;
  reportDate?: string;
  currentYear?: number;
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

// ─────────────────────────────────────────────────────────────────
// ProfitPilot Logo Mark (SVG inline — no external deps)
// ─────────────────────────────────────────────────────────────────

function PPLogo() {
  return (
    <img src="/profitpilot-logo.png" alt="ProfitPilot" width={36} height={36} className="rounded-lg object-contain" />
  );
}

// ─────────────────────────────────────────────────────────────────
// Divider
// ─────────────────────────────────────────────────────────────────

export function ReportDivider({ className = '' }: { className?: string }) {
  return <div className={`border-t border-[#E2E8F0] ${className}`} />;
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
    highlight === 'green' ? 'bg-[#ECFDF5]' :
    highlight === 'navy'  ? 'bg-[#0F172A] text-white' :
    highlight === 'gray'  ? 'bg-[#F8FAFC]' :
    highlight === 'red'   ? 'bg-[#FEF2F2]' : '';

  const textClass =
    highlight === 'navy' ? 'text-white' :
    highlight === 'green' ? 'text-[#065F46]' :
    highlight === 'red'   ? 'text-[#991B1B]' : 'text-[#0F172A]';

  const numberColor =
    highlight === 'navy'  ? 'text-[#6EE7B7]' :
    highlight === 'green' ? 'text-[#065F46]' :
    highlight === 'red'   ? 'text-[#B91C1C]' :
    current !== null && current < 0 ? 'text-[#B91C1C]' : 'text-[#0F172A]';

  const fontClass = bold ? 'font-semibold' : italic ? 'italic' : 'font-normal';

  function fmt(v: number | null) {
    if (v === null) return '—';
    const abs = Math.abs(v);
    const formatted = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(abs);
    return v < 0 ? `(${formatted})` : formatted;
  }

  return (
    <div
      className={`accounting-row flex items-center gap-2 px-4 py-[6px] ${bgClass} ${topBorder ? 'border-t border-[#CBD5E1]' : ''} ${doubleBorder ? 'border-t-2 border-double border-[#0F172A]' : ''}`}
    >
      {/* Label */}
      <div className={`flex-1 flex items-baseline gap-2 ${indentPx}`}>
        <span className={`text-[13px] leading-5 ${fontClass} ${textClass}`}>{label}</span>
        {note && <span className="text-[11px] text-[#94A3B8] font-normal">{note}</span>}
      </div>

      {/* Current year */}
      <div className={`w-28 text-right tabular-nums text-[13px] ${fontClass} ${numberColor}`}>
        {fmt(current)}
      </div>

      {/* Previous year (optional) */}
      {previous !== undefined && (
        <div className={`w-28 text-right tabular-nums text-[13px] font-normal text-[#94A3B8]`}>
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
  currentYear,
  previousYear,
}: {
  title: string;
  showPrevious?: boolean;
  currentYear?: number;
  previousYear?: number;
}) {
  const cy = currentYear  ?? new Date().getFullYear();
  const py = previousYear ?? cy - 1;
  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-[#0F172A] mt-4 first:mt-0">
      <span className="flex-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#94A3B8]">
        {title}
      </span>
      <span className="w-28 text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-white">
        {cy}
      </span>
      {showPrevious && (
        <span className="w-28 text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-[#64748B]">
          {py}
        </span>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Column Headers (for the data table)
// ─────────────────────────────────────────────────────────────────

export function ColumnHeaders({
  showPrevious = true,
  currency = 'HTG',
  currentYear,
  previousYear,
}: {
  showPrevious?: boolean;
  currency?: string;
  currentYear?: number;
  previousYear?: number;
}) {
  const cy = currentYear  ?? new Date().getFullYear();
  const py = previousYear ?? cy - 1;
  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b-2 border-[#0F172A] bg-white">
      <div className="flex-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#64748B]">
        Libellé
      </div>
      <div className="w-28 text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-[#0F172A]">
        {cy} ({currency})
      </div>
      {showPrevious && (
        <div className="w-28 text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">
          {py} ({currency})
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
        /* Screen only — in print the CSS overrides everything */
        width: '210mm',
        minHeight: '267mm',
        padding: '12mm 14mm',
        fontFamily: '"Inter", "SF Pro Display", system-ui, sans-serif',
        fontSize: '12px',
        color: '#0F172A',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* ── HEADER ── */}
      <header className="flex items-start justify-between pb-3 border-b-2 border-[#0F172A] mb-4">
        {/* Left: branding + company */}
        <div className="flex flex-col gap-0.5">
          {/* ProfitPilot badge */}
          <div className="flex items-center gap-2 mb-2">
            <PPLogo />
            <div>
              <div
                className="text-[11px] font-semibold tracking-[0.14em] uppercase text-[#12B981]"
                style={{ letterSpacing: '0.14em' }}
              >
                ProfitPilot
              </div>
              <div className="text-[9px] text-[#94A3B8] tracking-wider uppercase">
                Business Intelligence
              </div>
            </div>
          </div>

          {/* Company name */}
          <div
            className="text-[22px] font-bold text-[#0F172A] leading-tight tracking-tight"
          >
            {meta.companyName}
          </div>

          {/* Company details */}
          {(meta.sector || meta.address || meta.phone) && (
            <div className="flex flex-col gap-0.5 mt-1">
              {meta.sector  && <span className="text-[11px] text-[#64748B]">{meta.sector}</span>}
              {meta.address && <span className="text-[11px] text-[#64748B]">{meta.address}</span>}
              {meta.phone   && <span className="text-[11px] text-[#64748B]">{meta.phone}</span>}
              {meta.taxId   && <span className="text-[11px] text-[#64748B]">NIF: {meta.taxId}</span>}
            </div>
          )}

          {/* Currency note */}
          <div className="text-[11px] text-[#64748B] mt-1">
            Exprimé en{' '}
            <span className="font-medium text-[#0F172A]">
              {currency === 'USD' ? 'Dollars Américains (USD)' : `Gourdes Haïtiennes (${currency})`}
            </span>
          </div>
        </div>

        {/* Right: report title block */}
        <div className="text-right flex flex-col items-end gap-1">
          <div
            className="text-[16px] font-bold text-[#0F172A] uppercase tracking-[0.06em] leading-tight text-right"
          >
            {meta.reportTitle}
          </div>
          <div className="text-[12px] font-medium text-[#64748B] mt-1 text-right">
            {meta.reportSubtitle}
          </div>
          {/* Emerald accent bar */}
          <div
            className="mt-3 h-[3px] rounded-full bg-[#12B981]"
            style={{ width: '80px' }}
          />
        </div>
      </header>

      {/* ── CONTENT ── */}
      <main className="flex-1">{children}</main>

      {/* ── FOOTER ── */}
      <footer className="mt-4 pt-3 border-t border-[#E2E8F0]">
        {/* Signature row */}
        <div className="grid grid-cols-2 gap-6 mb-3">
          <div>
            <div className="text-[9px] uppercase tracking-[0.12em] text-[#94A3B8] mb-1">Préparé par</div>
            <div className="h-6 border-b border-[#CBD5E1]" />
            <div className="mt-1 text-[10px] text-[#0F172A] font-medium">
              {meta.preparedBy || '________________________________'}
            </div>
            <div className="text-[9px] text-[#94A3B8]">Signature · Date</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-[0.12em] text-[#94A3B8] mb-1">Approuvé par</div>
            <div className="h-6 border-b border-[#CBD5E1]" />
            <div className="mt-1 text-[10px] text-[#0F172A] font-medium">
              {meta.approvedBy || '________________________________'}
            </div>
            <div className="text-[9px] text-[#94A3B8]">Signature · Date</div>
          </div>
        </div>
        {/* Meta row */}
        <div className="flex items-center justify-between text-[9px] text-[#94A3B8]">
          <div className="flex items-center gap-1">
            <span className="font-medium text-[#64748B]">ProfitPilot</span>
            <span>· Rapport généré le {generatedOn}</span>
          </div>
          <div>Page {pageNumber} / {totalPages}</div>
        </div>
      </footer>
    </div>
  );
}
