/**
 * IncomeStatement — État des Résultats (P&L)
 * IFRS-inspired · PCG-HT structure · Comparative two-column layout
 */

'use client';

import React, { memo } from 'react';
import { useLanguage } from '../LanguageWrapper';
import ReportLayout, {
  AccountingRow,
  ColumnHeaders,
  ReportDivider,
  type ReportMeta,
} from './ReportLayout';

// ─────────────────────────────────────────────────────────────────
// Data types
// ─────────────────────────────────────────────────────────────────

export interface IncomeStatementData {
  // Revenue
  ventesMarchandises: number;
  prestationsServices: number;
  autresRevenus: number;
  retoursRabais: number;

  // COGS
  achatsMarchandises: number;
  variationStock: number;
  transportAchat: number;

  // Operating expenses
  loyers: number;
  salaires: number;
  chargesSociales: number;
  marketing: number;
  transport: number;
  electriciteInternet: number;
  fraisBancaires: number;
  autresCharges: number;
  dotationsAmortissements: number;

  // Financial
  produitsFinanciers: number;
  chargesFinancieres: number;

  // Tax
  impotTaxes: number;

  // Previous year (optional, for comparison)
  prev?: Partial<IncomeStatementData>;
}

// ─────────────────────────────────────────────────────────────────
// Calculations
// ─────────────────────────────────────────────────────────────────

function calc(d: Partial<IncomeStatementData>) {
  const ventesMarchandises  = d.ventesMarchandises  ?? 0;
  const prestationsServices = d.prestationsServices ?? 0;
  const autresRevenus       = d.autresRevenus       ?? 0;
  const retoursRabais       = d.retoursRabais       ?? 0;

  const achatsMarchandises   = d.achatsMarchandises  ?? 0;
  const variationStock       = d.variationStock      ?? 0;
  const transportAchat       = d.transportAchat      ?? 0;

  const loyers               = d.loyers               ?? 0;
  const salaires             = d.salaires             ?? 0;
  const chargesSociales      = d.chargesSociales      ?? 0;
  const marketing            = d.marketing            ?? 0;
  const transport            = d.transport            ?? 0;
  const electriciteInternet  = d.electriciteInternet  ?? 0;
  const fraisBancaires       = d.fraisBancaires       ?? 0;
  const autresCharges        = d.autresCharges        ?? 0;
  const dotationsAmortissements = d.dotationsAmortissements ?? 0;

  const produitsFinanciers   = d.produitsFinanciers   ?? 0;
  const chargesFinancieres   = d.chargesFinancieres   ?? 0;
  const impotTaxes           = d.impotTaxes           ?? 0;

  // ── P&L Cascade ──
  const caNet   = ventesMarchandises + prestationsServices + autresRevenus - retoursRabais;
  const cogs    = achatsMarchandises + variationStock + transportAchat;
  const margeBrute = caNet - cogs;
  const chargesOp  = loyers + salaires + chargesSociales + marketing + transport +
                     electriciteInternet + fraisBancaires + autresCharges + dotationsAmortissements;
  const resoOp     = margeBrute - chargesOp;
  const resoAvImpot = resoOp + produitsFinanciers - chargesFinancieres;
  const resoNet    = resoAvImpot - impotTaxes;
  const margeNetPct = caNet > 0 ? (resoNet / caNet) * 100 : 0;

  return {
    ventesMarchandises, prestationsServices, autresRevenus, retoursRabais,
    achatsMarchandises, variationStock, transportAchat,
    loyers, salaires, chargesSociales, marketing, transport,
    electriciteInternet, fraisBancaires, autresCharges, dotationsAmortissements,
    produitsFinanciers, chargesFinancieres, impotTaxes,
    caNet, cogs, margeBrute, chargesOp, resoOp,
    resoAvImpot, resoNet, margeNetPct,
  };
}

// ─────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────

interface Props {
  meta: ReportMeta;
  data: IncomeStatementData;
  showPrevious?: boolean;
}

function IncomeStatement({ meta, data, showPrevious = true }: Props) {
  const { t } = useLanguage();
  const c = calc(data);
  const p = data.prev ? calc(data.prev) : null;
  const prev = showPrevious && p ? p : undefined;

  return (
    <ReportLayout meta={{ ...meta, reportTitle: t({ fr: 'ÉTAT DES RÉSULTATS', ht: 'KONTE REZILTA' }) }}>
      <div className="text-[13px]">

        {/* ── Column headers ── */}
        <ColumnHeaders showPrevious={!!prev} currency={meta.currency ?? 'HTG'} currentYear={meta.currentYear} previousYear={meta.previousYear} />

        {/* ════════════════════════════════════
            I. REVENUS D'EXPLOITATION
        ════════════════════════════════════ */}
        <div className="mt-3">
          <div className="px-4 py-[5px]">
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#12B981]">
              {t({ fr: 'I — Revenus d\'exploitation', ht: 'I — Revni eksplwatasyon' })}
            </span>
          </div>
          <AccountingRow label="Ventes de marchandises"    note="(1)"  current={c.ventesMarchandises}  previous={prev?.ventesMarchandises}  indent={1} />
          <AccountingRow label="Prestations de services"   note="(2)"  current={c.prestationsServices} previous={prev?.prestationsServices} indent={1} />
          <AccountingRow label={t({ fr: 'Autres revenus', ht: 'Lòt revni' })}            note="(3)"  current={c.autresRevenus}       previous={prev?.autresRevenus}       indent={1} />
          <AccountingRow label="Retours et rabais sur ventes"           current={-c.retoursRabais}      previous={prev ? -prev.retoursRabais : undefined} indent={1} italic />
          <AccountingRow
            label="CHIFFRE D'AFFAIRES NET"
            current={c.caNet}
            previous={prev?.caNet}
            bold
            highlight="gray"
            topBorder
          />
        </div>

        {/* ════════════════════════════════════
            II. COÛT DES MARCHANDISES VENDUES
        ════════════════════════════════════ */}
        <div className="mt-2">
          <div className="px-4 py-[5px]">
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#EF4444]">
              {t({ fr: 'II — Coût des marchandises vendues', ht: 'II — Pri machandiz vann' })}
            </span>
          </div>
          <AccountingRow label={t({ fr: 'Achats de marchandises', ht: 'Acha machandiz' })}       current={c.achatsMarchandises}  previous={prev?.achatsMarchandises}  indent={1} />
          <AccountingRow label={t({ fr: 'Variation de stocks', ht: 'Varyasyon stock yo' })}          current={c.variationStock}       previous={prev?.variationStock}       indent={1} italic />
          <AccountingRow label="Transport sur achats"         current={c.transportAchat}       previous={prev?.transportAchat}       indent={1} />
          <AccountingRow
            label={t({ fr: 'TOTAL COÛT DES VENTES', ht: 'TOTAL PRI VANT YO' })}
            current={c.cogs}
            previous={prev?.cogs}
            bold
            highlight="gray"
            topBorder
          />
        </div>

        {/* ════════════════════════════════════
            MARGE BRUTE
        ════════════════════════════════════ */}
        <div className="mt-1">
          <AccountingRow
            label={t({ fr: 'MARGE BRUTE', ht: 'MAJ BRIT' })}
            current={c.margeBrute}
            previous={prev?.margeBrute}
            bold
            highlight="green"
            topBorder
          />
          {/* Margin % inline note */}
          <div className="flex gap-2 px-4 pb-1">
            <span className="flex-1 pl-0 text-[11px] text-[#64748B] italic">
              {t({ fr: 'Taux de marge brute', ht: 'To maj brit' })}
            </span>
            <span className="w-28 text-right text-[11px] font-semibold text-[#12B981]">
              {c.caNet > 0 ? ((c.margeBrute / c.caNet) * 100).toFixed(1) : '0.0'}%
            </span>
            {prev && (
              <span className="w-28 text-right text-[11px] text-[#94A3B8]">
                {prev.caNet > 0 ? ((prev.margeBrute / prev.caNet) * 100).toFixed(1) : '0.0'}%
              </span>
            )}
          </div>
        </div>

        {/* ════════════════════════════════════
            III. CHARGES D'EXPLOITATION
        ════════════════════════════════════ */}
        <div className="mt-2">
          <div className="px-4 py-[5px]">
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#EF4444]">
              {t({ fr: 'III — Charges d\'exploitation', ht: 'III — Chaj eksplwatasyon' })}
            </span>
          </div>
          <AccountingRow label={t({ fr: 'Loyers et charges locatives', ht: 'Lwaye ak chaj lokatif' })}  current={c.loyers}              previous={prev?.loyers}              indent={1} />
          <AccountingRow label={t({ fr: 'Salaires et traitements', ht: 'Salè ak tretman' })}       current={c.salaires}            previous={prev?.salaires}            indent={1} />
          <AccountingRow label={t({ fr: 'Charges sociales (ONA/OFATMA)', ht: 'Chaj sosyal (ONA/OFATMA)' })} current={c.chargesSociales}     previous={prev?.chargesSociales}     indent={1} />
          <AccountingRow label={t({ fr: 'Marketing et publicité', ht: 'Maketing ak piblisite' })}        current={c.marketing}           previous={prev?.marketing}           indent={1} />
          <AccountingRow label={t({ fr: 'Transport et déplacements', ht: 'Transpò ak deplasman' })}     current={c.transport}           previous={prev?.transport}           indent={1} />
          <AccountingRow label="Électricité et Internet"       current={c.electriciteInternet} previous={prev?.electriciteInternet} indent={1} />
          <AccountingRow label={t({ fr: 'Frais bancaires', ht: 'Frè bankè' })}               current={c.fraisBancaires}      previous={prev?.fraisBancaires}      indent={1} />
          <AccountingRow label={t({ fr: 'Autres charges', ht: 'Lòt chaj' })}                current={c.autresCharges}       previous={prev?.autresCharges}       indent={1} />
          <AccountingRow label="Dotations aux amortissements"  current={c.dotationsAmortissements} previous={prev?.dotationsAmortissements} indent={1} italic />
          <AccountingRow
            label={t({ fr: 'TOTAL CHARGES D\'EXPLOITATION', ht: 'TOTAL CHAJ EKSPLWATASYON' })}
            current={c.chargesOp}
            previous={prev?.chargesOp}
            bold
            highlight="gray"
            topBorder
          />
        </div>

        {/* ════════════════════════════════════
            RÉSULTAT D'EXPLOITATION
        ════════════════════════════════════ */}
        <AccountingRow
          label={t({ fr: 'RÉSULTAT D\'EXPLOITATION', ht: 'REZILTA EKSPLWATASYON' })}
          current={c.resoOp}
          previous={prev?.resoOp}
          bold
          highlight={c.resoOp >= 0 ? 'green' : 'red'}
          topBorder
        />

        {/* ════════════════════════════════════
            IV. PRODUITS & CHARGES FINANCIERS
        ════════════════════════════════════ */}
        <div className="mt-2">
          <div className="px-4 py-[5px]">
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#64748B]">
              {t({ fr: 'IV — Résultat financier', ht: 'IV — Rezilta finansye' })}
            </span>
          </div>
          <AccountingRow label={t({ fr: 'Produits financiers (intérêts reçus)', ht: 'Pwodui finansye (enterè resevwa)' })} current={c.produitsFinanciers}  previous={prev?.produitsFinanciers} indent={1} />
          <AccountingRow label={t({ fr: 'Charges financières (intérêts payés)', ht: 'Chaj finansye (enterè peye)' })}  current={-c.chargesFinancieres} previous={prev ? -prev.chargesFinancieres : undefined} indent={1} italic />
        </div>

        {/* ════════════════════════════════════
            RÉSULTAT AVANT IMPÔT
        ════════════════════════════════════ */}
        <AccountingRow
          label="RÉSULTAT AVANT IMPÔT"
          current={c.resoAvImpot}
          previous={prev?.resoAvImpot}
          bold
          highlight="gray"
          topBorder
        />

        {/* Tax */}
        <AccountingRow
          label={t({ fr: 'Impôt sur le résultat (TCA / IR)', ht: 'Enpo sou rezilta (TCA / IR)' })}
          current={-c.impotTaxes}
          previous={prev ? -prev.impotTaxes : undefined}
          indent={1}
          italic
        />

        {/* ════════════════════════════════════
            RÉSULTAT NET — double border
        ════════════════════════════════════ */}
        <div className="mt-1">
          <AccountingRow
            label={t({ fr: 'RÉSULTAT NET DE L\'EXERCICE', ht: 'REZILTA NET EKSESIS LA' })}
            current={c.resoNet}
            previous={prev?.resoNet}
            bold
            highlight={c.resoNet >= 0 ? 'navy' : 'red'}
            doubleBorder
          />
          {/* Net margin % */}
          <div className="flex gap-2 px-4 pt-1 pb-3">
            <span className="flex-1 text-[11px] text-[#64748B] italic">
              {t({ fr: 'Marge nette', ht: 'Maj net' })}
            </span>
            <span className={`w-28 text-right text-[11px] font-bold ${c.margeNetPct >= 0 ? 'text-[#12B981]' : 'text-[#EF4444]'}`}>
              {c.margeNetPct.toFixed(1)}%
            </span>
            {prev && (
              <span className="w-28 text-right text-[11px] text-[#94A3B8]">
                {prev.margeNetPct.toFixed(1)}%
              </span>
            )}
          </div>
        </div>

        {/* ════════════════════════════════════
            NOTES BLOCK
        ════════════════════════════════════ */}
        <div className="mt-4 pt-3 border-t border-[#E2E8F0]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#64748B] mb-2">
            {t({ fr: 'Notes explicatives', ht: 'Nòt eksplikatif' })}
          </p>
          <p className="text-[10px] text-[#94A3B8] leading-relaxed">
            {t({ fr: '(1) Inclut les ventes en boutique, WhatsApp et Instagram.&nbsp;&nbsp;(2) Services de livraison et commissions.&nbsp;&nbsp;(3) Revenus divers et produits exceptionnels.&nbsp;&nbsp;Les chiffres entre parenthèses représentent des montants négatifs. Les comparatifs 2024 sont présentés à titre indicatif.', ht: '(1) Enkli vant nan boutik, WhatsApp ak Instagram.&nbsp;&nbsp;(2) Sèvis livrezon ak komisyon.&nbsp;&nbsp;(3) Revni divè ak pwodui eksepsyonèl.&nbsp;&nbsp;Chif ant parantèz yo reprezante montan negatif. Konparatif 2024 yo prezante endikatif.' })}
          </p>
        </div>

      </div>
    </ReportLayout>
  );
}

export default memo(IncomeStatement);