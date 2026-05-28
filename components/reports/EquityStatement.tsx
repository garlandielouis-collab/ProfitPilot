/**
 * EquityStatement — État des Capitaux Propres
 * Matrix layout: rows = events, columns = equity components
 */

'use client';

import React from 'react';
import ReportLayout, { type ReportMeta } from './ReportLayout';

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

export interface EquityStatementData {
  // Opening balances (previous year closing = current year opening)
  openCapitalSocial: number;
  openApports: number;
  openReserves: number;
  openReportANouveau: number;
  openPrelevements: number;   // will be shown as negative
  openResultatPrecedent: number;  // prior year net income brought forward

  // Events during the year
  apportsNouveaux: number;         // New capital contributions
  resultatNet: number;             // Current year net income
  affectationReserves: number;     // Transfer to reserves
  dividendesDistribues: number;    // Dividends paid (negative effect)
  prelevementsExercice: number;    // Owner withdrawals this year

  // Previous year comparatives
  prevYear?: {
    resultatNet: number;
    apportsNouveaux: number;
    prelevementsExercice: number;
  };
}

// ─────────────────────────────────────────────────────────────────
// Computations
// ─────────────────────────────────────────────────────────────────

interface EquityMatrix {
  capital: number;
  apports: number;
  reserves: number;
  reportANouveau: number;
  resultat: number;
  prelevements: number;
  total: number;
}

function rowTotal(r: EquityMatrix) {
  return r.capital + r.apports + r.reserves + r.reportANouveau + r.resultat - r.prelevements;
}

function compute(d: EquityStatementData) {
  const opening: EquityMatrix = {
    capital:        d.openCapitalSocial,
    apports:        d.openApports,
    reserves:       d.openReserves,
    reportANouveau: d.openReportANouveau + d.openResultatPrecedent,  // prior result flows in
    resultat:       0,                                                 // reset at year open
    prelevements:   d.openPrelevements,
    total:          0,
  };
  opening.total = rowTotal(opening);

  const afterApports: EquityMatrix = {
    ...opening,
    apports:  opening.apports + d.apportsNouveaux,
    total:    0,
  };
  afterApports.total = rowTotal(afterApports);

  const afterResult: EquityMatrix = {
    ...afterApports,
    resultat: d.resultatNet,
    total:    0,
  };
  afterResult.total = rowTotal(afterResult);

  const afterReserves: EquityMatrix = {
    ...afterResult,
    reserves:       afterResult.reserves + d.affectationReserves,
    reportANouveau: afterResult.reportANouveau - d.affectationReserves,
    total:          0,
  };
  afterReserves.total = rowTotal(afterReserves);

  const afterDiv: EquityMatrix = {
    ...afterReserves,
    reportANouveau: afterReserves.reportANouveau - d.dividendesDistribues,
    total:          0,
  };
  afterDiv.total = rowTotal(afterDiv);

  const closing: EquityMatrix = {
    ...afterDiv,
    prelevements: afterDiv.prelevements + d.prelevementsExercice,
    total:        0,
  };
  closing.total = rowTotal(closing);

  return { opening, afterApports, afterResult, afterReserves, afterDiv, closing };
}

// ─────────────────────────────────────────────────────────────────
// Formatting
// ─────────────────────────────────────────────────────────────────

function fmt(v: number, showZero = false): string {
  if (!showZero && v === 0) return '—';
  const abs = Math.abs(v);
  const s = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0 }).format(abs);
  return v < 0 ? `(${s})` : s;
}

function fmtDelta(v: number): string {
  if (v === 0) return '—';
  const abs = Math.abs(v);
  const s = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0 }).format(abs);
  return v > 0 ? `+${s}` : `(${s})`;
}

// ─────────────────────────────────────────────────────────────────
// Matrix Row Component
// ─────────────────────────────────────────────────────────────────

interface MRowProps {
  label: string;
  data: EquityMatrix;
  highlight?: 'green' | 'navy' | 'gray' | null;
  bold?: boolean;
  isDelta?: boolean;
  italic?: boolean;
}

const COL_W = 'min-w-[70px]';

function MatrixRow({ label, data, highlight, bold, isDelta, italic }: MRowProps) {
  const bg   = highlight === 'green' ? 'bg-[#ECFDF5]' :
               highlight === 'navy'  ? 'bg-[#0F172A]' :
               highlight === 'gray'  ? 'bg-[#F8FAFC]' : 'bg-white';
  const tc   = highlight === 'navy' ? 'text-white' :
               highlight === 'green' ? 'text-[#065F46]' : 'text-[#0F172A]';
  const nc   = highlight === 'navy' ? 'text-[#6EE7B7]' :
               highlight === 'green' ? 'text-[#065F46]' : '';

  const f = isDelta ? fmtDelta : fmt;
  const totalColor = data.total >= 0
    ? (highlight === 'navy' ? 'text-[#6EE7B7]' : 'text-[#12B981]')
    : 'text-[#EF4444]';

  return (
    <div className={`flex items-center py-[6px] px-2 ${bg} border-b border-[#F1F5F9]`}>
      <div className={`flex-1 text-[11px] ${bold ? 'font-semibold' : italic ? 'italic' : ''} ${tc} pr-2`}>
        {label}
      </div>
      <div className={`${COL_W} text-right text-[11px] tabular-nums ${bold ? 'font-semibold' : ''} ${nc || (isDelta && data.capital > 0 ? 'text-[#12B981]' : isDelta && data.capital < 0 ? 'text-[#EF4444]' : tc)}`}>
        {f(data.capital)}
      </div>
      <div className={`${COL_W} text-right text-[11px] tabular-nums ${bold ? 'font-semibold' : ''} ${nc || tc}`}>
        {f(data.apports)}
      </div>
      <div className={`${COL_W} text-right text-[11px] tabular-nums ${bold ? 'font-semibold' : ''} ${nc || tc}`}>
        {f(data.reserves)}
      </div>
      <div className={`${COL_W} text-right text-[11px] tabular-nums ${bold ? 'font-semibold' : ''} ${nc || tc}`}>
        {f(data.reportANouveau)}
      </div>
      <div className={`${COL_W} text-right text-[11px] tabular-nums font-semibold ${
        data.resultat > 0 ? 'text-[#12B981]' : data.resultat < 0 ? 'text-[#EF4444]' : (nc || tc)
      }`}>
        {f(data.resultat)}
      </div>
      <div className={`${COL_W} text-right text-[11px] tabular-nums ${bold ? 'font-semibold' : ''} ${data.prelevements > 0 ? 'text-[#EF4444]' : (nc || tc)}`}>
        {data.prelevements !== 0 ? `(${fmt(data.prelevements)})` : '—'}
      </div>
      {/* Total — always prominent */}
      <div className={`min-w-[84px] text-right text-[12px] tabular-nums font-bold ${totalColor} pl-1 border-l border-[#E2E8F0] ml-1`}>
        {fmt(data.total, true)}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────

interface Props {
  meta: ReportMeta;
  data: EquityStatementData;
}

export default function EquityStatement({ meta, data }: Props) {
  const { opening, afterApports, afterResult, afterReserves, afterDiv, closing } = compute(data);

  // Delta row helper
  function delta(a: EquityMatrix, b: EquityMatrix): EquityMatrix {
    return {
      capital:        b.capital        - a.capital,
      apports:        b.apports        - a.apports,
      reserves:       b.reserves       - a.reserves,
      reportANouveau: b.reportANouveau - a.reportANouveau,
      resultat:       b.resultat       - a.resultat,
      prelevements:   b.prelevements   - a.prelevements,
      total:          b.total          - a.total,
    };
  }

  return (
    <ReportLayout meta={{ ...meta, reportTitle: 'ÉTAT DES CAPITAUX PROPRES' }}>
      <div>
        {/* Description */}
        <p className="text-[11px] text-[#64748B] mb-4 leading-relaxed">
          Cet état présente les variations survenues dans les capitaux propres au cours de
          l'exercice clos le 31 décembre 2025, incluant le résultat net, les apports,
          les affectations et les prélèvements du propriétaire.
        </p>

        {/* Matrix table — scrollable on small screens */}
        <div className="overflow-x-auto rounded-lg border border-[#E2E8F0]">

          {/* Column header */}
          <div className="flex items-center bg-[#0F172A] py-2 px-2 min-w-max">
            <div className="flex-1 text-[10px] font-bold uppercase tracking-[0.1em] text-[#94A3B8] pr-2">
              Événement
            </div>
            <div className={`${COL_W} text-right text-[9px] font-bold uppercase tracking-wide text-white`}>Capital</div>
            <div className={`${COL_W} text-right text-[9px] font-bold uppercase tracking-wide text-white`}>Apports</div>
            <div className={`${COL_W} text-right text-[9px] font-bold uppercase tracking-wide text-white`}>Réserves</div>
            <div className={`${COL_W} text-right text-[9px] font-bold uppercase tracking-wide text-white`}>Report RAN</div>
            <div className={`${COL_W} text-right text-[9px] font-bold uppercase tracking-wide text-[#6EE7B7]`}>Résultat</div>
            <div className={`${COL_W} text-right text-[9px] font-bold uppercase tracking-wide text-[#FCA5A5]`}>Prélèvt.</div>
            <div className="min-w-[84px] text-right text-[9px] font-bold uppercase tracking-wide text-[#6EE7B7] pl-1 border-l border-[#334155] ml-1">
              Total CP
            </div>
          </div>

          <div className="min-w-max">
            {/* Opening */}
            <MatrixRow label="Solde d'ouverture au 1er janvier 2025" data={opening} highlight="gray" bold />

            {/* Apports */}
            {data.apportsNouveaux !== 0 && (
              <MatrixRow label="  + Apports en capital de l'exercice" data={delta(opening, afterApports)} isDelta italic />
            )}

            {/* Résultat */}
            <MatrixRow label="  + Résultat net de l'exercice 2025" data={delta(afterApports, afterResult)} isDelta italic />

            {/* Affectation réserves */}
            {data.affectationReserves !== 0 && (
              <MatrixRow label="  → Affectation aux réserves légales" data={delta(afterResult, afterReserves)} isDelta italic />
            )}

            {/* Dividendes */}
            {data.dividendesDistribues !== 0 && (
              <MatrixRow label="  − Dividendes distribués / retraits sur bénéfices" data={delta(afterReserves, afterDiv)} isDelta italic />
            )}

            {/* Prélèvements */}
            {data.prelevementsExercice !== 0 && (
              <MatrixRow label="  − Prélèvements personnels du propriétaire" data={delta(afterDiv, closing)} isDelta italic />
            )}

            {/* Closing */}
            <MatrixRow label="Solde de clôture au 31 décembre 2025" data={closing} highlight="navy" bold />
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-3 mt-5">
          {/* Résultat */}
          <div className={`rounded-xl border-2 p-3 ${data.resultatNet >= 0 ? 'border-[#12B981] bg-[#ECFDF5]' : 'border-[#EF4444] bg-[#FEF2F2]'}`}>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[#64748B]">Résultat net</div>
            <div className={`text-[18px] font-bold mt-1 ${data.resultatNet >= 0 ? 'text-[#065F46]' : 'text-[#991B1B]'}`}>
              {fmt(data.resultatNet, true)}
            </div>
            <div className="text-[9px] text-[#94A3B8] mt-[2px]">Exercice 2025 · HTG</div>
          </div>

          {/* Variation CP */}
          <div className="rounded-xl border-2 border-[#3B82F6] bg-[#EFF6FF] p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[#64748B]">Variation CP</div>
            <div className={`text-[18px] font-bold mt-1 ${closing.total - opening.total >= 0 ? 'text-[#1D4ED8]' : 'text-[#DC2626]'}`}>
              {fmtDelta(closing.total - opening.total)}
            </div>
            <div className="text-[9px] text-[#94A3B8] mt-[2px]">vs. ouverture · HTG</div>
          </div>

          {/* Total capitaux propres */}
          <div className="rounded-xl border-2 border-[#0F172A] bg-[#F8FAFC] p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[#64748B]">Total capitaux</div>
            <div className="text-[18px] font-bold mt-1 text-[#0F172A]">
              {fmt(closing.total, true)}
            </div>
            <div className="text-[9px] text-[#94A3B8] mt-[2px]">Au 31 déc. 2025 · HTG</div>
          </div>
        </div>

        {/* Notes */}
        <div className="mt-4 pt-3 border-t border-[#E2E8F0]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#64748B] mb-1">Notes</p>
          <p className="text-[10px] text-[#94A3B8] leading-relaxed">
            Le capital social représente l'investissement initial de l'entrepreneur.
            Les prélèvements du propriétaire réduisent les capitaux propres (compte 4580).
            Le résultat de l'exercice sera reporté en « Report à nouveau » à l'ouverture 2026.
            Conformément au PCG-HT (Plan Comptable Général Haïti), adapté de SYSCOHADA.
          </p>
        </div>
      </div>
    </ReportLayout>
  );
}
