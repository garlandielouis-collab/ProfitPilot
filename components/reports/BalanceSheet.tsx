/**
 * BalanceSheet — Bilan (Balance Sheet)
 * Side-by-side ACTIF ↔ PASSIF · Must balance · A4 landscape optional
 */

'use client';

import React from 'react';
import ReportLayout, { type ReportMeta } from './ReportLayout';

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

export interface BalanceSheetData {
  // ── ACTIF NON COURANT ──
  terrains: number;
  batimentsConstruct: number;
  materielInformatique: number;
  mobilierBureau: number;
  vehicules: number;
  autresImmobilisations: number;
  amortissementsCumules: number;   // deduct (negative)

  // ── ACTIF COURANT ──
  stocksMarchandises: number;
  creancesClients: number;         // AR
  avancesFournisseurs: number;
  tresoreriebanque: number;
  tresorerieMonCash: number;
  tresorerieNatcash: number;
  tresorerieCaisse: number;
  autresActifsCourants: number;

  // ── CAPITAUX PROPRES ──
  capitalSocial: number;
  apportsProprio: number;
  reservesLegales: number;
  reportANouveau: number;
  resultatExercice: number;
  prelevementsProprietaire: number; // deduct

  // ── PASSIF NON COURANT ──
  empruntsBancairesLT: number;
  pretesLT: number;
  dettesImmobilisations: number;

  // ── PASSIF COURANT ──
  detteFournisseurs: number;       // AP
  salairesPayer: number;
  onaPayer: number;
  taxesPayer: number;
  chargesPayer: number;
  avancesClients: number;
  autresPassifsCourants: number;

  // Previous year comparison (optional)
  prev?: Partial<BalanceSheetData>;
}

// ─────────────────────────────────────────────────────────────────
// Computations
// ─────────────────────────────────────────────────────────────────

function compute(d: Partial<BalanceSheetData>) {
  const terrains              = d.terrains              ?? 0;
  const batimentsConstruct    = d.batimentsConstruct    ?? 0;
  const materielInformatique  = d.materielInformatique  ?? 0;
  const mobilierBureau        = d.mobilierBureau        ?? 0;
  const vehicules             = d.vehicules             ?? 0;
  const autresImmobilisations = d.autresImmobilisations ?? 0;
  const amortissementsCumules = d.amortissementsCumules ?? 0;

  const stocksMarchandises    = d.stocksMarchandises    ?? 0;
  const creancesClients       = d.creancesClients       ?? 0;
  const avancesFournisseurs   = d.avancesFournisseurs   ?? 0;
  const tresoreriebanque      = d.tresoreriebanque      ?? 0;
  const tresorerieMonCash     = d.tresorerieMonCash     ?? 0;
  const tresorerieNatcash     = d.tresorerieNatcash     ?? 0;
  const tresorerieCaisse      = d.tresorerieCaisse      ?? 0;
  const autresActifsCourants  = d.autresActifsCourants  ?? 0;

  const capitalSocial                = d.capitalSocial                ?? 0;
  const apportsProprio               = d.apportsProprio               ?? 0;
  const reservesLegales              = d.reservesLegales              ?? 0;
  const reportANouveau               = d.reportANouveau               ?? 0;
  const resultatExercice             = d.resultatExercice             ?? 0;
  const prelevementsProprietaire     = d.prelevementsProprietaire     ?? 0;
  const empruntsBancairesLT          = d.empruntsBancairesLT          ?? 0;
  const pretesLT                     = d.pretesLT                     ?? 0;
  const dettesImmobilisations        = d.dettesImmobilisations        ?? 0;
  const detteFournisseurs            = d.detteFournisseurs            ?? 0;
  const salairesPayer                = d.salairesPayer                ?? 0;
  const onaPayer                     = d.onaPayer                     ?? 0;
  const taxesPayer                   = d.taxesPayer                   ?? 0;
  const chargesPayer                 = d.chargesPayer                 ?? 0;
  const avancesClients               = d.avancesClients               ?? 0;
  const autresPassifsCourants        = d.autresPassifsCourants        ?? 0;

  // Actif non courant
  const immoBrutes    = terrains + batimentsConstruct + materielInformatique + mobilierBureau + vehicules + autresImmobilisations;
  const immoNettes    = immoBrutes - amortissementsCumules;

  // Actif courant
  const tresoTotale   = tresoreriebanque + tresorerieMonCash + tresorerieNatcash + tresorerieCaisse;
  const actifCourant  = stocksMarchandises + creancesClients + avancesFournisseurs + tresoTotale + autresActifsCourants;

  const totalActif    = immoNettes + actifCourant;

  // Capitaux propres
  const capitauxPropres = capitalSocial + apportsProprio + reservesLegales + reportANouveau + resultatExercice - prelevementsProprietaire;

  // Passif non courant
  const passifNC      = empruntsBancairesLT + pretesLT + dettesImmobilisations;

  // Passif courant
  const passifCourant = detteFournisseurs + salairesPayer + onaPayer + taxesPayer + chargesPayer + avancesClients + autresPassifsCourants;

  const totalPassif   = capitauxPropres + passifNC + passifCourant;
  const balanced      = Math.abs(totalActif - totalPassif) < 1;

  return {
    terrains, batimentsConstruct, materielInformatique, mobilierBureau,
    vehicules, autresImmobilisations, amortissementsCumules, immoBrutes, immoNettes,
    stocksMarchandises, creancesClients, avancesFournisseurs,
    tresoreriebanque, tresorerieMonCash, tresorerieNatcash, tresorerieCaisse,
    tresoTotale, autresActifsCourants, actifCourant, totalActif,
    capitalSocial, apportsProprio, reservesLegales, reportANouveau,
    resultatExercice, prelevementsProprietaire, capitauxPropres,
    empruntsBancairesLT, pretesLT, dettesImmobilisations, passifNC,
    detteFournisseurs, salairesPayer, onaPayer, taxesPayer,
    chargesPayer, avancesClients, autresPassifsCourants, passifCourant,
    totalPassif, balanced,
  };
}

// ─────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────

function fmt(v: number) {
  if (v === 0) return '—';
  const abs = Math.abs(v);
  const s = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0 }).format(abs);
  return v < 0 ? `(${s})` : s;
}

interface BSRowProps {
  label: string;
  val: number;
  prevVal?: number;
  indent?: number;
  bold?: boolean;
  highlight?: 'green' | 'navy' | 'gray' | 'red';
  border?: boolean;
  italic?: boolean;
}

function BSRow({ label, val, prevVal, indent = 0, bold, highlight, border, italic }: BSRowProps) {
  const pl = indent === 1 ? 'pl-5' : indent === 2 ? 'pl-9' : 'pl-2';
  const bg = highlight === 'green' ? 'bg-[#ECFDF5]' :
             highlight === 'navy'  ? 'bg-[#0F172A]' :
             highlight === 'gray'  ? 'bg-[#F8FAFC]' :
             highlight === 'red'   ? 'bg-[#FEF2F2]' : 'bg-white';
  const tc = highlight === 'navy' ? 'text-white' :
             highlight === 'green' ? 'text-[#065F46]' :
             highlight === 'red'   ? 'text-[#991B1B]' : 'text-[#0F172A]';
  const nc = highlight === 'navy'  ? 'text-[#6EE7B7]' :
             highlight === 'green' ? 'text-[#065F46]' :
             highlight === 'red'   ? 'text-[#B91C1C]' :
             val < 0              ? 'text-[#B91C1C]' : 'text-[#0F172A]';

  return (
    <div className={`flex items-center py-[5px] pr-2 ${pl} ${bg} ${border ? 'border-t border-[#CBD5E1]' : ''}`}>
      <span className={`flex-1 text-[12px] leading-4 ${bold ? 'font-semibold' : italic ? 'italic font-normal' : 'font-normal'} ${tc}`}>
        {label}
      </span>
      <span className={`text-[12px] tabular-nums text-right min-w-[80px] ${bold ? 'font-semibold' : 'font-normal'} ${nc}`}>
        {fmt(val)}
      </span>
      {prevVal !== undefined && (
        <span className="text-[11px] tabular-nums text-right min-w-[72px] text-[#94A3B8] ml-1">
          {fmt(prevVal)}
        </span>
      )}
    </div>
  );
}

function BSSection({ title, color }: { title: string; color: string }) {
  return (
    <div className={`px-2 py-[5px] mt-2`}>
      <span
        className="text-[10px] font-bold uppercase tracking-[0.14em]"
        style={{ color }}
      >
        {title}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────

interface Props {
  meta: ReportMeta;
  data: BalanceSheetData;
  showPrevious?: boolean;
}

export default function BalanceSheet({ meta, data, showPrevious = true }: Props) {
  const c = compute(data);
  const p = data.prev ? compute(data.prev) : null;
  const pv = (v: number | undefined) => (showPrevious && p ? (v ?? 0) : undefined);

  return (
    <ReportLayout meta={{ ...meta, reportTitle: 'BILAN' }}>
      {/* Balance check banner */}
      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg mb-4 text-[11px] font-semibold
        ${c.balanced ? 'bg-[#ECFDF5] text-[#065F46]' : 'bg-[#FEF2F2] text-[#991B1B]'}`}>
        <span>{c.balanced ? '✓' : '⚠'}</span>
        <span>
          {c.balanced
            ? `Bilan équilibré — Total Actif = Total Passif = ${fmt(c.totalActif)} HTG`
            : `Déséquilibre détecté — Actif ${fmt(c.totalActif)} ≠ Passif ${fmt(c.totalPassif)}`}
        </span>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-2 gap-3 text-[12px]">

        {/* ═══════════════════════════════
            LEFT — ACTIF
        ═══════════════════════════════ */}
        <div className="border border-[#E2E8F0] rounded-lg overflow-hidden">
          {/* Header */}
          <div className="bg-[#0F172A] px-3 py-2 flex justify-between items-center">
            <span className="text-white text-[11px] font-bold uppercase tracking-[0.1em]">ACTIF</span>
            <span className="text-[#6EE7B7] text-[11px] font-semibold">{fmt(c.totalActif)}</span>
          </div>

          {/* ACTIF NON COURANT */}
          <BSSection title="Actif non courant (Immobilisations)" color="#3B82F6" />
          <BSRow label="Terrains"                      val={c.terrains}              prevVal={pv(p?.terrains)}              indent={1} />
          <BSRow label="Bâtiments et constructions"    val={c.batimentsConstruct}    prevVal={pv(p?.batimentsConstruct)}    indent={1} />
          <BSRow label="Matériel informatique"         val={c.materielInformatique}  prevVal={pv(p?.materielInformatique)}  indent={1} />
          <BSRow label="Mobilier de bureau"            val={c.mobilierBureau}        prevVal={pv(p?.mobilierBureau)}        indent={1} />
          <BSRow label="Véhicules"                     val={c.vehicules}             prevVal={pv(p?.vehicules)}             indent={1} />
          <BSRow label="Autres immobilisations"        val={c.autresImmobilisations} prevVal={pv(p?.autresImmobilisations)} indent={1} />
          <BSRow label="(−) Amortissements cumulés"   val={-c.amortissementsCumules} prevVal={pv(p ? -p.amortissementsCumules : undefined)} indent={2} italic />
          <BSRow label="Immobilisations nettes"        val={c.immoNettes}            prevVal={pv(p?.immoNettes)}            bold highlight="gray" border />

          {/* ACTIF COURANT */}
          <BSSection title="Actif courant" color="#8B5CF6" />
          <BSRow label="Stocks de marchandises"        val={c.stocksMarchandises}    prevVal={pv(p?.stocksMarchandises)}    indent={1} />
          <BSRow label="Créances clients (AR)"         val={c.creancesClients}       prevVal={pv(p?.creancesClients)}       indent={1} />
          <BSRow label="Avances versées fournisseurs"  val={c.avancesFournisseurs}   prevVal={pv(p?.avancesFournisseurs)}   indent={1} />
          <BSRow label="Trésorerie — Banque"           val={c.tresoreriebanque}      prevVal={pv(p?.tresoreriebanque)}      indent={2} />
          <BSRow label="Trésorerie — MonCash"          val={c.tresorerieMonCash}     prevVal={pv(p?.tresorerieMonCash)}     indent={2} />
          <BSRow label="Trésorerie — Natcash"          val={c.tresorerieNatcash}     prevVal={pv(p?.tresorerieNatcash)}     indent={2} />
          <BSRow label="Caisse HTG"                    val={c.tresorerieCaisse}      prevVal={pv(p?.tresorerieCaisse)}      indent={2} />
          <BSRow label="Autres actifs courants"        val={c.autresActifsCourants}  prevVal={pv(p?.autresActifsCourants)}  indent={1} />
          <BSRow label="Total Actif courant"           val={c.actifCourant}          prevVal={pv(p?.actifCourant)}          bold highlight="gray" border />

          {/* TOTAL ACTIF */}
          <BSRow label="TOTAL ACTIF"                   val={c.totalActif}            prevVal={pv(p?.totalActif)}            bold highlight="navy" border />
        </div>

        {/* ═══════════════════════════════
            RIGHT — PASSIF
        ═══════════════════════════════ */}
        <div className="border border-[#E2E8F0] rounded-lg overflow-hidden">
          {/* Header */}
          <div className="bg-[#0F172A] px-3 py-2 flex justify-between items-center">
            <span className="text-white text-[11px] font-bold uppercase tracking-[0.1em]">PASSIF & CAPITAUX</span>
            <span className="text-[#6EE7B7] text-[11px] font-semibold">{fmt(c.totalPassif)}</span>
          </div>

          {/* CAPITAUX PROPRES */}
          <BSSection title="Capitaux propres" color="#12B981" />
          <BSRow label="Capital social"                val={c.capitalSocial}              prevVal={pv(p?.capitalSocial)}              indent={1} />
          <BSRow label="Apports propriétaire"          val={c.apportsProprio}             prevVal={pv(p?.apportsProprio)}             indent={1} />
          <BSRow label="Réserves légales"              val={c.reservesLegales}            prevVal={pv(p?.reservesLegales)}            indent={1} />
          <BSRow label="Report à nouveau"              val={c.reportANouveau}             prevVal={pv(p?.reportANouveau)}             indent={1} />
          <BSRow label="Résultat de l'exercice"        val={c.resultatExercice}           prevVal={pv(p?.resultatExercice)}           indent={1} bold />
          <BSRow label="(−) Prélèvements propriétaire" val={-c.prelevementsProprietaire} prevVal={pv(p ? -p.prelevementsProprietaire : undefined)} indent={2} italic />
          <BSRow label="TOTAL CAPITAUX PROPRES"        val={c.capitauxPropres}            prevVal={pv(p?.capitauxPropres)}            bold highlight="green" border />

          {/* PASSIF NON COURANT */}
          <BSSection title="Passif non courant (Dettes LT)" color="#EF4444" />
          <BSRow label="Emprunts bancaires long terme"  val={c.empruntsBancairesLT}  prevVal={pv(p?.empruntsBancairesLT)}  indent={1} />
          <BSRow label="Prêts long terme"               val={c.pretesLT}             prevVal={pv(p?.pretesLT)}             indent={1} />
          <BSRow label="Dettes sur immobilisations"     val={c.dettesImmobilisations} prevVal={pv(p?.dettesImmobilisations)} indent={1} />
          <BSRow label="Total Passif non courant"       val={c.passifNC}             prevVal={pv(p?.passifNC)}             bold highlight="gray" border />

          {/* PASSIF COURANT */}
          <BSSection title="Passif courant (Dettes CT)" color="#F97316" />
          <BSRow label="Fournisseurs — dettes (AP)"    val={c.detteFournisseurs}     prevVal={pv(p?.detteFournisseurs)}     indent={1} />
          <BSRow label="Personnel — salaires à payer"  val={c.salairesPayer}         prevVal={pv(p?.salairesPayer)}         indent={1} />
          <BSRow label="ONA / OFATMA à payer"          val={c.onaPayer}              prevVal={pv(p?.onaPayer)}              indent={1} />
          <BSRow label="Taxes et impôts à payer"       val={c.taxesPayer}            prevVal={pv(p?.taxesPayer)}            indent={1} />
          <BSRow label="Charges à payer"               val={c.chargesPayer}          prevVal={pv(p?.chargesPayer)}          indent={1} />
          <BSRow label="Avances reçues des clients"    val={c.avancesClients}        prevVal={pv(p?.avancesClients)}        indent={1} />
          <BSRow label="Autres dettes courantes"       val={c.autresPassifsCourants} prevVal={pv(p?.autresPassifsCourants)} indent={1} />
          <BSRow label="Total Passif courant"          val={c.passifCourant}         prevVal={pv(p?.passifCourant)}         bold highlight="gray" border />

          {/* TOTAL PASSIF */}
          <BSRow label="TOTAL PASSIF & CAPITAUX"       val={c.totalPassif}           prevVal={pv(p?.totalPassif)}           bold highlight="navy" border />
        </div>
      </div>

      {/* Notes */}
      <div className="mt-4 pt-2 border-t border-[#E2E8F0]">
        <p className="text-[10px] text-[#94A3B8] leading-relaxed">
          Les montants sont exprimés en Gourdes Haïtiennes (HTG) · L'équation fondamentale
          ACTIF = CAPITAUX PROPRES + DETTES est vérifiée à chaque opération par le moteur
          comptable ProfitPilot. Trésorerie mobile: MonCash (Digicel) et Natcash (Natcom).
        </p>
      </div>
    </ReportLayout>
  );
}
