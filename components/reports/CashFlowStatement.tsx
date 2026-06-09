/**
 * CashFlowStatement — Tableau des Flux de Trésorerie
 * Direct method · Three sections: Exploitation / Investissement / Financement
 */

'use client';

import React, { memo } from 'react';
import { useLanguage } from '../LanguageWrapper';
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
  const { t } = useLanguage();
  const total = Math.abs(exploitation) + Math.abs(investissement) + Math.abs(financement) || 1;

  function fmt(v: number) {
    if (v === 0) return '0';
    const sign = v > 0 ? '+' : '−';
    return `${sign}${new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 0 }).format(Math.abs(v))}`;
  }

  const bars = [
    { label: 'Exploitation', value: exploitation, color: exploitation >= 0 ? '#12B981' : '#EF4444' },
    { label: 'Investissement', value: investissement, color: investissement >= 0 ? '#3B82F6' : '#F97316' },
    { label: t({ fr: 'Financement', ht: 'Finansman' }), value: financement, color: financement >= 0 ? '#8B5CF6' : '#F59E0B' },
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

function CashFlowStatement({ meta, data, showPrevious = true }: Props) {
  const { t } = useLanguage();
  const c = calc(data);
  const p = data.prev ? calc(data.prev) : null;
  const prev = showPrevious && p ? p : undefined;

  return (
    <ReportLayout meta={{ ...meta, reportTitle: 'TABLEAU DES FLUX DE TRÉSORERIE' }}>
      <div className="text-[13px]">

        {/* Waterfall mini-chart — screen only, hidden in print to save space */}
        <div className="no-print">
          <WaterfallStrip
            exploitation={c.fluxExploitation}
            investissement={c.fluxInvestissement}
            financement={c.fluxFinancement}
          />
        </div>

        {/* Column headers */}
        <ColumnHeaders showPrevious={!!prev} currency={meta.currency ?? 'HTG'} currentYear={meta.currentYear} previousYear={meta.previousYear} />

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
            {t({ fr: 'Encaissements (Entrées de cash)', ht: 'Lajan resevwa (Antre kach)' })}
          </span>
        </div>
        <AccountingRow label={t({ fr: 'Encaissements sur ventes comptant', ht: 'Lajan resevwa sou vant kach' })}      current={c.encaissementsVentes}    previous={prev?.encaissementsVentes}    indent={1} />
        <AccountingRow label={t({ fr: 'Encaissements services et livraisons', ht: 'Lajan resevwa sèvis ak livrezon' })}   current={c.encaissementsServices}  previous={prev?.encaissementsServices}  indent={1} />
        <AccountingRow label={t({ fr: 'Recouvrement créances clients', ht: 'Rekouvreman kreyans kliyan' })}          current={c.autresEncaissements}    previous={prev?.autresEncaissements}    indent={1} />
        <AccountingRow label={t({ fr: 'Total encaissements', ht: 'Total lajan resevwa' })}                    current={c.totalEntrees}           previous={prev?.totalEntrees}           bold highlight="gray" topBorder />

        <div className="px-4 pt-2 pb-[2px]">
          <span className="text-[10px] text-[#94A3B8] font-medium uppercase tracking-wider">
            Décaissements (Sorties de cash)
          </span>
        </div>
        <AccountingRow label="Paiements fournisseurs / achats"        current={-c.decaissementsAchats}           previous={prev ? -prev.decaissementsAchats : undefined}           indent={1} />
        <AccountingRow label={t({ fr: 'Paiements salaires nets', ht: 'Peman salè nèt' })}                current={-c.decaissementsSalaires}         previous={prev ? -prev.decaissementsSalaires : undefined}         indent={1} />
        <AccountingRow label="Cotisations ONA / OFATMA"               current={-c.decaissementsChargesSociales} previous={prev ? -prev.decaissementsChargesSociales : undefined} indent={1} />
        <AccountingRow label={t({ fr: 'Loyers payés', ht: 'Lwaye peye' })}                           current={-c.decaissementsLoyers}           previous={prev ? -prev.decaissementsLoyers : undefined}           indent={1} />
        <AccountingRow label={t({ fr: 'Marketing et publicité', ht: 'Maketing ak piblisite' })}                 current={-c.decaissementsMarketing}        previous={prev ? -prev.decaissementsMarketing : undefined}        indent={1} />
        <AccountingRow label={t({ fr: 'Autres charges décaissées', ht: 'Lòt chaj debouse' })}              current={-c.decaissementsAutres}           previous={prev ? -prev.decaissementsAutres : undefined}           indent={1} />
        <AccountingRow label={t({ fr: 'Impôts et taxes payés', ht: 'Enpo ak taks peye' })}                  current={-c.impotsPaies}                  previous={prev ? -prev.impotsPaies : undefined}                   indent={1} italic />
        <AccountingRow label={t({ fr: 'Total décaissements', ht: 'Total debousman' })}                    current={-c.totalSorties}                 previous={prev ? -prev.totalSorties : undefined}                  bold highlight="gray" topBorder />

        <AccountingRow
          label={t({ fr: "FLUX NET D'EXPLOITATION (A)", ht: 'FLUX NET EKSPLWATASYON (A)' })}
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
          title={t({ fr: "Flux d'investissement", ht: 'Flux envestisman' })}
          subtitle={t({ fr: 'Acquisitions et cessions d\'actifs non courants', ht: 'Akirisyon ak sesyon aktif ki pa kouran' })}
          color="#3B82F6"
        />
        <AccountingRow label={t({ fr: 'Acquisitions d\'immobilisations', ht: 'Akirisyon imobilizasyon' })}          current={-c.acquisitionsImmobilisations}  previous={prev ? -prev.acquisitionsImmobilisations : undefined}  indent={1} />
        <AccountingRow label={t({ fr: 'Cessions d\'immobilisations', ht: 'Sesyon imobilizasyon' })}              current={c.cedImmobilisations}            previous={prev?.cedImmobilisations}                              indent={1} />
        <AccountingRow label="Autres investissements"                  current={-c.autresInvestissements}        previous={prev ? -prev.autresInvestissements : undefined}         indent={1} italic />
        <AccountingRow
          label={t({ fr: "FLUX NET D'INVESTISSEMENT (B)", ht: 'FLUX NET ENVESTISMAN (B)' })}
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
        <AccountingRow label={t({ fr: 'Remboursements d\'emprunts (capital)', ht: 'Ranbousman anprunt (kapital)' })}     current={-c.remboursementsPrets}    previous={prev ? -prev.remboursementsPrets : undefined}    indent={1} />
        <AccountingRow label="Prélèvements du propriétaire"           current={-c.prelevementsProprio}    previous={prev ? -prev.prelevementsProprio : undefined}    indent={1} italic />
        <AccountingRow
          label={t({ fr: 'FLUX NET DE FINANCEMENT (C)', ht: 'FLUX NET FINANSMAN (C)' })}
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
              {t({ fr: 'Synthèse de trésorerie', ht: 'Sentèz trezoreri' })}
            </span>
          </div>

          <AccountingRow
            label={t({ fr: 'VARIATION NETTE DE TRÉSORERIE  (A+B+C)', ht: 'VARYASYON NET TREZORERI (A+B+C)' })}
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
            label={t({ fr: 'TRÉSORERIE AU 31 DÉCEMBRE', ht: 'TREZORERI 31 DESANM' })}
            current={c.tresorerieFinExercice}
            previous={prev?.tresorerieFinExercice}
            bold
            highlight="navy"
            topBorder
          />

          {/* Days of cash metric */}
          <div className="flex gap-3 px-4 py-2 bg-[#F8FAFC] border-t border-[#E2E8F0]">
            <div className="flex-1">
              <span className="text-[10px] uppercase tracking-wider text-[#94A3B8]">{t({ fr: 'Couverture trésorerie', ht: 'Kouvèti trezoreri' })}</span>
            </div>
            <div>
              {c.totalSorties > 0 ? (
                <span className="text-[12px] font-semibold text-[#12B981]">
                  {Math.round((c.tresorerieFinExercice / (c.totalSorties / 12)))} {t({ fr: 'mois de réserve', ht: 'mwa rezèv' })}
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
            {t({ fr: 'Méthode directe · La trésorerie inclut caisse, banque, MonCash et Natcash. Les flux d\'exploitation correspondent aux activités génératrices de revenus. Les flux d\'investissement incluent les achats d\'équipements et matériel.', ht: 'Metòd dirèk · Trezoreri a gen ladan kès, bank, MonCash ak Natcash. Flux eksplwatasyon yo koresponn ak aktivite ki jenere revni. Flux envestisman yo gen ladan acha ekipman ak materyèl.' })}
          </p>
        </div>

      </div>
    </ReportLayout>
  );
}

export default memo(CashFlowStatement);
