/**
 * CashFlowStatement — Tableau des Flux de Trésorerie
 * Direct method · Three sections: Exploitation / Investissement / Financement
 */

'use client';

import React from 'react';
import ReportLayout, {
  AccountingRow,
  ColumnHeaders,
  type ReportMeta,
} from './ReportLayout';

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

export interface CashFlowData {
  // ── I. FLUX D'EXPLOITATION ──
  encaissementsVentes: number;
  encaissementsServices: number;
  autresEncaissements: number;
  decaissementsAchats: number;
  decaissementsSalaires: number;
  decaissementsChargesSociales: number;
  decaissementsLoyers: number;
  decaissementsMarketing: number;
  decaissementsAutres: number;
  impotsPaies: number;

  // ── II. FLUX D'INVESTISSEMENT ──
  acquisitionsImmobilisations: number;
  cedImmobilisations: number;      // Cessions (positive = cash in)
  autresInvestissements: number;

  // ── III. FLUX DE FINANCEMENT ──
  empruntContractes: number;       // Nouveaux prêts reçus
  remboursementsPrets: number;     // Remboursements capital
  apportsProprio: number;          // Apports propriétaire
  prelevementsProprio: number;     // Retraits propriétaire

  // Opening balance
  tresorerieDebutExercice: number;

  // Previous year
  prev?: Partial<CashFlowData>;
}

// ─────────────────────────────────────────────────────────────────
// Computations
// ─────────────────────────────────────────────────────────────────

function calc(d: Partial<CashFlowData>) {
  const encaissementsVentes             = d.encaissementsVentes             ?? 0;
  const encaissementsServices           = d.encaissementsServices           ?? 0;
  const autresEncaissements             = d.autresEncaissements             ?? 0;
  const decaissementsAchats             = d.decaissementsAchats             ?? 0;
  const decaissementsSalaires           = d.decaissementsSalaires           ?? 0;
  const decaissementsChargesSociales    = d.decaissementsChargesSociales    ?? 0;
  const decaissementsLoyers             = d.decaissementsLoyers             ?? 0;
  const decaissementsMarketing          = d.decaissementsMarketing          ?? 0;
  const decaissementsAutres             = d.decaissementsAutres             ?? 0;
  const impotsPaies                     = d.impotsPaies                     ?? 0;

  const acquisitionsImmobilisations     = d.acquisitionsImmobilisations     ?? 0;
  const cedImmobilisations              = d.cedImmobilisations              ?? 0;
  const autresInvestissements           = d.autresInvestissements           ?? 0;

  const empruntContractes               = d.empruntContractes               ?? 0;
  const remboursementsPrets             = d.remboursementsPrets             ?? 0;
  const apportsProprio                  = d.apportsProprio                  ?? 0;
  const prelevementsProprio             = d.prelevementsProprio             ?? 0;

  const tresorerieDebutExercice         = d.tresorerieDebutExercice         ?? 0;

  // Section totals
  const totalEntrees         = encaissementsVentes + encaissementsServices + autresEncaissements;
  const totalSorties         = decaissementsAchats + decaissementsSalaires + decaissementsChargesSociales +
                               decaissementsLoyers + decaissementsMarketing + decaissementsAutres + impotsPaies;
  const fluxExploitation     = totalEntrees - totalSorties;

  const fluxInvestissement   = cedImmobilisations - acquisitionsImmobilisations - autresInvestissements;

  const fluxFinancement      = empruntContractes + apportsProprio - remboursementsPrets - prelevementsProprio;

  const variationNette       = fluxExploitation + fluxInvestissement + fluxFinancement;
  const tresorerieFinExercice = tresorerieDebutExercice + variationNette;

  return {
    encaissementsVentes, encaissementsServices, autresEncaissements,
    decaissementsAchats, decaissementsSalaires, decaissementsChargesSociales,
    decaissementsLoyers, decaissementsMarketing, decaissementsAutres, impotsPaies,
    acquisitionsImmobilisations, cedImmobilisations, autresInvestissements,
    empruntContractes, remboursementsPrets, apportsProprio, prelevementsProprio,
    tresorerieDebutExercice,
    totalEntrees, totalSorties, fluxExploitation,
    fluxInvestissement, fluxFinancement,
    variationNette, tresorerieFinExercice,
  };
}

// ─────────────────────────────────────────────────────────────────
// Section header with colored left border
// ─────────────────────────────────────────────────────────────────

function CfSection({
  number,
  title,
  subtitle,
  color,
}: {
  number: string;
  title: string;
  subtitle: string;
  color: string;
}) {
  return (
    <div
      className="flex items-start gap-3 px-4 py-3 mt-4 rounded-t-md"
      style={{ borderLeft: `4px solid ${color}`, background: '#F8FAFC' }}
    >
      <div>
        <div
          className="text-[10px] font-bold uppercase tracking-[0.16em]"
          style={{ color }}
        >
          {number} — {title}
        </div>
        <div className="text-[10px] text-[#94A3B8] mt-[2px]">{subtitle}</div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Waterfall chart strip
// ─────────────────────────────────────────────────────────────────

function WaterfallStrip({
  exploitation,
  investissement,
  financement,
}: {
  exploitation: number;
  investissement: number;
  financement: number;
}) {
  const total = Math.abs(exploitation) + Math.abs(investissement) + Math.abs(financement) || 1;

  function fmt(v: number) {
    if (v === 0) return '0';
    const sign = v > 0 ? '+' : '−';
    return `${sign}${new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 0 }).format(Math.abs(v))}`;
  }

  const bars = [
    { label: 'Exploitation', value: exploitation, color: exploitation >= 0 ? '#12B981' : '#EF4444' },
    { label: 'Investissement', value: investissement, color: investissement >= 0 ? '#3B82F6' : '#F97316' },
    { label: 'Financement', value: financement, color: financement >= 0 ? '#8B5CF6' : '#F59E0B' },
  ];

  return (
    <div className="flex items-end gap-2 mt-3 mb-4 px-2" style={{ height: '52px' }}>
      {bars.map((b) => {
        const h = Math.max(8, (Math.abs(b.value) / total) * 48);
        return (
          <div key={b.label} className="flex flex-col items-center flex-1">
            <div
              className="text-[10px] font-semibold mb-[2px]"
              style={{ color: b.color }}
            >
              {fmt(b.value)}
            </div>
            <div
              className="w-full rounded-t-sm"
              style={{ height: `${h}px`, background: b.color, opacity: 0.85 }}
            />
            <div className="text-[9px] text-[#94A3B8] mt-[3px]">{b.label}</div>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────

interface Props {
  meta: ReportMeta;
  data: CashFlowData;
  showPrevious?: boolean;
}

export default function CashFlowStatement({ meta, data, showPrevious = true }: Props) {
  const c = calc(data);
  const p = data.prev ? calc(data.prev) : null;
  const prev = showPrevious && p ? p : undefined;

  return (
    <ReportLayout meta={{ ...meta, reportTitle: 'TABLEAU DES FLUX DE TRÉSORERIE' }}>
      <div className="text-[13px]">

        {/* Waterfall mini-chart */}
        <WaterfallStrip
          exploitation={c.fluxExploitation}
          investissement={c.fluxInvestissement}
          financement={c.fluxFinancement}
        />

        {/* Column headers */}
        <ColumnHeaders showPrevious={!!prev} />

        {/* ═══════════════════════════════════
            I. FLUX D'EXPLOITATION
        ═══════════════════════════════════ */}
        <CfSection
          number="I"
          title="Flux d'exploitation"
          subtitle="Encaissements et décaissements liés à l'activité courante"
          color="#12B981"
        />

        <div className="px-4 pt-1 pb-[2px]">
          <span className="text-[10px] text-[#94A3B8] font-medium uppercase tracking-wider">
            Encaissements (Entrées de cash)
          </span>
        </div>
        <AccountingRow label="Encaissements sur ventes comptant"      current={c.encaissementsVentes}    previous={prev?.encaissementsVentes}    indent={1} />
        <AccountingRow label="Encaissements services et livraisons"   current={c.encaissementsServices}  previous={prev?.encaissementsServices}  indent={1} />
        <AccountingRow label="Recouvrement créances clients"          current={c.autresEncaissements}    previous={prev?.autresEncaissements}    indent={1} />
        <AccountingRow label="Total encaissements"                    current={c.totalEntrees}           previous={prev?.totalEntrees}           bold highlight="gray" topBorder />

        <div className="px-4 pt-2 pb-[2px]">
          <span className="text-[10px] text-[#94A3B8] font-medium uppercase tracking-wider">
            Décaissements (Sorties de cash)
          </span>
        </div>
        <AccountingRow label="Paiements fournisseurs / achats"        current={-c.decaissementsAchats}           previous={prev ? -prev.decaissementsAchats : undefined}           indent={1} />
        <AccountingRow label="Paiements salaires nets"                current={-c.decaissementsSalaires}         previous={prev ? -prev.decaissementsSalaires : undefined}         indent={1} />
        <AccountingRow label="Cotisations ONA / OFATMA"               current={-c.decaissementsChargesSociales} previous={prev ? -prev.decaissementsChargesSociales : undefined} indent={1} />
        <AccountingRow label="Loyers payés"                           current={-c.decaissementsLoyers}           previous={prev ? -prev.decaissementsLoyers : undefined}           indent={1} />
        <AccountingRow label="Marketing et publicité"                 current={-c.decaissementsMarketing}        previous={prev ? -prev.decaissementsMarketing : undefined}        indent={1} />
        <AccountingRow label="Autres charges décaissées"              current={-c.decaissementsAutres}           previous={prev ? -prev.decaissementsAutres : undefined}           indent={1} />
        <AccountingRow label="Impôts et taxes payés"                  current={-c.impotsPaies}                  previous={prev ? -prev.impotsPaies : undefined}                   indent={1} italic />
        <AccountingRow label="Total décaissements"                    current={-c.totalSorties}                 previous={prev ? -prev.totalSorties : undefined}                  bold highlight="gray" topBorder />

        <AccountingRow
          label="FLUX NET D'EXPLOITATION (A)"
          current={c.fluxExploitation}
          previous={prev?.fluxExploitation}
          bold
          highlight={c.fluxExploitation >= 0 ? 'green' : 'red'}
          topBorder
        />

        {/* ═══════════════════════════════════
            II. FLUX D'INVESTISSEMENT
        ═══════════════════════════════════ */}
        <CfSection
          number="II"
          title="Flux d'investissement"
          subtitle="Acquisitions et cessions d'actifs non courants"
          color="#3B82F6"
        />
        <AccountingRow label="Acquisitions d'immobilisations"          current={-c.acquisitionsImmobilisations}  previous={prev ? -prev.acquisitionsImmobilisations : undefined}  indent={1} />
        <AccountingRow label="Cessions d'immobilisations"              current={c.cedImmobilisations}            previous={prev?.cedImmobilisations}                              indent={1} />
        <AccountingRow label="Autres investissements"                  current={-c.autresInvestissements}        previous={prev ? -prev.autresInvestissements : undefined}         indent={1} italic />
        <AccountingRow
          label="FLUX NET D'INVESTISSEMENT (B)"
          current={c.fluxInvestissement}
          previous={prev?.fluxInvestissement}
          bold
          highlight={c.fluxInvestissement >= 0 ? 'green' : 'red'}
          topBorder
        />

        {/* ═══════════════════════════════════
            III. FLUX DE FINANCEMENT
        ═══════════════════════════════════ */}
        <CfSection
          number="III"
          title="Flux de financement"
          subtitle="Emprunts, remboursements et apports en capital"
          color="#8B5CF6"
        />
        <AccountingRow label="Nouveaux emprunts contractés"            current={c.empruntContractes}       previous={prev?.empruntContractes}      indent={1} />
        <AccountingRow label="Apports en capital du propriétaire"      current={c.apportsProprio}          previous={prev?.apportsProprio}         indent={1} />
        <AccountingRow label="Remboursements d'emprunts (capital)"     current={-c.remboursementsPrets}    previous={prev ? -prev.remboursementsPrets : undefined}    indent={1} />
        <AccountingRow label="Prélèvements du propriétaire"           current={-c.prelevementsProprio}    previous={prev ? -prev.prelevementsProprio : undefined}    indent={1} italic />
        <AccountingRow
          label="FLUX NET DE FINANCEMENT (C)"
          current={c.fluxFinancement}
          previous={prev?.fluxFinancement}
          bold
          highlight={c.fluxFinancement >= 0 ? 'green' : 'red'}
          topBorder
        />

        {/* ═══════════════════════════════════
            SYNTHÈSE
        ═══════════════════════════════════ */}
        <div className="mt-4 border border-[#E2E8F0] rounded-lg overflow-hidden">
          <div className="bg-[#0F172A] px-4 py-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-white">
              Synthèse de trésorerie
            </span>
          </div>

          <AccountingRow
            label="VARIATION NETTE DE TRÉSORERIE  (A+B+C)"
            current={c.variationNette}
            previous={prev?.variationNette}
            bold
            highlight={c.variationNette >= 0 ? 'green' : 'red'}
          />
          <AccountingRow
            label="Trésorerie et équivalents au 1er janvier"
            current={c.tresorerieDebutExercice}
            previous={prev?.tresorerieDebutExercice}
            indent={1}
            italic
          />
          <AccountingRow
            label="TRÉSORERIE AU 31 DÉCEMBRE"
            current={c.tresorerieFinExercice}
            previous={prev?.tresorerieFinExercice}
            bold
            highlight="navy"
            topBorder
          />

          {/* Days of cash metric */}
          <div className="flex gap-3 px-4 py-2 bg-[#F8FAFC] border-t border-[#E2E8F0]">
            <div className="flex-1">
              <span className="text-[10px] uppercase tracking-wider text-[#94A3B8]">Couverture trésorerie</span>
            </div>
            <div>
              {c.totalSorties > 0 ? (
                <span className="text-[12px] font-semibold text-[#12B981]">
                  {Math.round((c.tresorerieFinExercice / (c.totalSorties / 12)))} mois de réserve
                </span>
              ) : (
                <span className="text-[12px] text-[#94A3B8]">—</span>
              )}
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="mt-3 pt-2 border-t border-[#E2E8F0]">
          <p className="text-[10px] text-[#94A3B8] leading-relaxed">
            Méthode directe · La trésorerie inclut caisse, banque, MonCash et Natcash.
            Les flux d'exploitation correspondent aux activités génératrices de revenus.
            Les flux d'investissement incluent les achats d'équipements et matériel.
          </p>
        </div>

      </div>
    </ReportLayout>
  );
}
