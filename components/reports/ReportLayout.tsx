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
      className={`
        flex items-center gap-2 px-4 py-[7px]
        ${bgClass}
        ${topBorder ? 'border-t border-[#CBD5E1]' : ''}
        ${doubleBorder ? 'border-t-2 border-double border-[#0F172A]' : ''}
      `}
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
}: {
  title: string;
  showPrevious?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-[#0F172A] mt-4 first:mt-0">
      <span className="flex-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#94A3B8]">
        {title}
      </span>
      <span className="w-28 text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-white">
        2025
      </span>
      {showPrevious && (
        <span className="w-28 text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-[#64748B]">
          2024
        </span>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Column Headers (for the data table)
// ─────────────────────────────────────────────────────────────────

export function ColumnHeaders({ showPrevious = true }: { showPrevious?: boolean }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b-2 border-[#0F172A] bg-white">
      <div className="flex-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#64748B]">
        Libellé
      </div>
      <div className="w-28 text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-[#0F172A]">
        2025 (HTG)
      </div>
      {showPrevious && (
        <div className="w-28 text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">
          2024 (HTG)
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
      }}
    >
      {/* ── HEADER ── */}
      <header className="flex items-start justify-between pb-5 border-b-2 border-[#0F172A] mb-6">
        {/* Left: branding + company */}
        <div className="flex flex-col gap-1">
          {/* ProfitPilot badge */}
          <div className="flex items-center gap-2 mb-3">
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

          {/* Currency note */}
          <div className="text-[11px] text-[#64748B] mt-1">
            Exprimé en{' '}
            <span className="font-medium text-[#0F172A]">
              Gourdes Haïtiennes ({currency})
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
      <footer className="mt-8 pt-4 border-t border-[#E2E8F0]">
        {/* Signature row */}
        <div className="grid grid-cols-2 gap-8 mb-5">
          <div>
            <div className="text-[10px] uppercase tracking-[0.12em] text-[#94A3B8] mb-1">
              Préparé par
            </div>
            <div className="h-8 border-b border-[#CBD5E1]" />
            <div className="mt-1 text-[11px] text-[#0F172A] font-medium">
              {meta.preparedBy || '________________________________'}
            </div>
            <div className="text-[10px] text-[#94A3B8]">Signature · Date</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.12em] text-[#94A3B8] mb-1">
              Approuvé par
            </div>
            <div className="h-8 border-b border-[#CBD5E1]" />
            <div className="mt-1 text-[11px] text-[#0F172A] font-medium">
              {meta.approvedBy || '________________________________'}
            </div>
            <div className="text-[10px] text-[#94A3B8]">Signature · Date</div>
          </div>
        </div>

        {/* Meta row */}
        <div className="flex items-center justify-between text-[10px] text-[#94A3B8]">
          <div className="flex items-center gap-1">
            <PPLogo />
            <span className="ml-1 font-medium text-[#64748B]">ProfitPilot</span>
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
