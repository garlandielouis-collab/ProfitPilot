/**
 * ReportActions — Download PDF / Print / Export buttons
 * Premium SaaS action bar for financial reports
 */

'use client';

import React, { useState } from 'react';
import { useLanguage } from '../LanguageWrapper';

interface ReportActionsProps {
  reportTitle: string;
  companyName: string;
  /** Called before window.print() — use to switch to the print-all portal if needed */
  onBeforePrint?: () => void;
  className?: string;
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" />
    </svg>
  );
}

function PrintIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="6 9 6 2 18 2 18 9" />
      <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" />
      <rect x="6" y="14" width="12" height="8" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  );
}

export default function ReportActions({
  reportTitle,
  companyName,
  onBeforePrint,
  className = '',
}: ReportActionsProps) {
  const { t } = useLanguage();
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState(false);

  /**
   * Trigger browser print dialog.
   * The CSS in globals.css handles hiding the screen UI and
   * showing the .print-portal — no JS needed for that.
   */
  function triggerPrint() {
    if (onBeforePrint) onBeforePrint();
    // Small rAF delay so React can re-render if onBeforePrint changed state
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.print();
      });
    });
  }

  async function handleDownloadPDF() {
    setDownloading(true);
    // Give the browser a tick to show the loading state before the dialog
    await new Promise((r) => setTimeout(r, 80));
    setDownloading(false);
    triggerPrint();
  }

  function handlePrint() {
    triggerPrint();
  }

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback silent
    }
  }

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {/* Download PDF */}
      <button
        type="button"
        onClick={handleDownloadPDF}
        disabled={downloading}
        className="
          flex items-center gap-2 px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl
          bg-[#0F172A] text-white text-[12px] sm:text-[13px] font-semibold
          hover:bg-[#1E293B] active:scale-[0.98]
          transition-all duration-150
          disabled:opacity-60 disabled:cursor-not-allowed
          shadow-sm no-print
        "
        title={t({ fr: 'Enregistrer en PDF', ht: 'Anrejistre an PDF' })}
      >
        {downloading ? <Spinner /> : <DownloadIcon />}
        <span className="hidden sm:inline">{downloading ? t({ fr: 'Génération...', ht: 'Jenerasyon...' }) : t({ fr: 'Télécharger PDF', ht: 'Telechaje PDF' })}</span>
        <span className="sm:hidden">{downloading ? '...' : t({ fr: 'PDF', ht: 'PDF' })}</span>
      </button>

      {/* Print */}
      <button
        type="button"
        onClick={handlePrint}
        className="
          flex items-center gap-2 px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl
          bg-white border border-[#E2E8F0] text-[#0F172A] text-[12px] sm:text-[13px] font-semibold
          hover:bg-[#F8FAFC] hover:border-[#CBD5E1] active:scale-[0.98]
          transition-all duration-150
          shadow-sm no-print
        "
      >
        <PrintIcon />
        <span className="hidden sm:inline">{t({ fr: 'Imprimer', ht: 'Enprime' })}</span>
      </button>

      {/* Share / Copy link */}
      <button
        type="button"
        onClick={handleCopyLink}
        className="
          flex items-center gap-2 px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl
          bg-white border border-[#E2E8F0] text-[#64748B] text-[12px] sm:text-[13px] font-medium
          hover:bg-[#F8FAFC] hover:text-[#0F172A] active:scale-[0.98]
          transition-all duration-150
          shadow-sm no-print
        "
      >
        <ShareIcon />
        <span className="hidden sm:inline">{copied ? `${t({ fr: 'Lien copié', ht: 'Lyen kopiye' })} ✓` : t({ fr: 'Partager', ht: 'Pataje' })}</span>
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Report type selector tabs
// ─────────────────────────────────────────────────────────────────

export type ReportType = 'income' | 'balance' | 'cashflow' | 'equity';

const TAB_LABEL_HT: Record<ReportType, string> = {
  income: 'Konte Rezilta',
  balance: 'Bilans',
  cashflow: 'Flux Trezoreri',
  equity: 'Kapital Pwòp',
};

const TAB_SUBLABEL_HT: Record<ReportType, string> = {
  income: 'P&L · Revni & Chaj',
  balance: 'Aktif · Pasif · Kapital',
  cashflow: 'Cash · Lajan likid',
  equity: 'Patrimwàn · Rezilta',
};

const REPORT_TABS: { key: ReportType; label: string; sublabel: string; icon: string }[] = [
  { key: 'income',   label: 'État des Résultats',       sublabel: 'P&L · Revenus & Charges', icon: '📈' },
  { key: 'balance',  label: 'Bilan',                    sublabel: 'Actif · Passif · Capitaux', icon: '⚖️' },
  { key: 'cashflow', label: 'Flux de Trésorerie',        sublabel: 'Cash · Liquidités',         icon: '💸' },
  { key: 'equity',   label: 'Capitaux Propres',          sublabel: 'Patrimoine · Résultats',    icon: '🏛️' },
];

interface ReportSelectorProps {
  active: ReportType;
  onChange: (t: ReportType) => void;
}

export function ReportTypeSelector({ active, onChange }: ReportSelectorProps) {
  const { t } = useLanguage();
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 no-print">
      {REPORT_TABS.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onChange(tab.key)}
          className={`
            flex flex-col items-start gap-1 p-4 rounded-2xl border-2 text-left
            transition-all duration-200 active:scale-[0.98]
            ${active === tab.key
              ? 'border-[#0F172A] bg-[#0F172A] text-white shadow-lg shadow-slate-900/20'
              : 'border-[#E2E8F0] bg-white text-[#0F172A] hover:border-[#CBD5E1] hover:bg-[#F8FAFC]'
            }
          `}
        >
          <span className="text-xl leading-none">{tab.icon}</span>
          <span className="text-[13px] font-semibold leading-tight mt-1">{t({ fr: tab.label, ht: TAB_LABEL_HT[tab.key] })}</span>
          <span className={`text-[11px] leading-tight ${active === tab.key ? 'text-[#94A3B8]' : 'text-[#64748B]'}`}>
            {t({ fr: tab.sublabel, ht: TAB_SUBLABEL_HT[tab.key] })}
          </span>
          {active === tab.key && (
            <span className="mt-1 h-[2px] w-8 rounded-full bg-[#12B981]" />
          )}
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Period picker
// ─────────────────────────────────────────────────────────────────

export type PeriodType = 'Q1' | 'Q2' | 'Q3' | 'Q4' | 'H1' | 'H2' | 'FY';

const PERIODS: { key: PeriodType; label: string }[] = [
  { key: 'Q1', label: 'T1 — Jan/Mar' },
  { key: 'Q2', label: 'T2 — Avr/Jun' },
  { key: 'Q3', label: 'T3 — Jul/Sep' },
  { key: 'Q4', label: 'T4 — Oct/Déc' },
  { key: 'H1', label: 'S1 — 6 mois' },
  { key: 'H2', label: 'S2 — 6 mois' },
  { key: 'FY', label: 'Annuel 2025' },
];

interface PeriodPickerProps {
  active: PeriodType;
  onChange: (p: PeriodType) => void;
}

const PERIOD_LABEL_HT: Record<PeriodType, string> = {
  Q1: 'T1 — Jan/Mas',
  Q2: 'T2 — Avr/Jen',
  Q3: 'T3 — Jiy/Sep',
  Q4: 'T4 — Okt/Des',
  H1: 'S1 — 6 mwa',
  H2: 'S2 — 6 mwa',
  FY: 'Anyèl 2025',
};

export function PeriodPicker({ active, onChange }: PeriodPickerProps) {
  const { t } = useLanguage();
  return (
    <div className="flex flex-wrap gap-2 no-print">
      {PERIODS.map((p) => (
        <button
          key={p.key}
          type="button"
          onClick={() => onChange(p.key)}
          className={`
            px-3.5 py-1.5 rounded-lg text-[12px] font-semibold border
            transition-all duration-150
            ${active === p.key
              ? 'bg-[#12B981] border-[#12B981] text-white shadow-sm'
              : 'bg-white border-[#E2E8F0] text-[#64748B] hover:border-[#12B981] hover:text-[#12B981]'
            }
          `}
        >
          {t({ fr: p.label, ht: PERIOD_LABEL_HT[p.key] })}
        </button>
      ))}
    </div>
  );
}
