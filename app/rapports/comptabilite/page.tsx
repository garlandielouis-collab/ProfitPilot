'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLanguage } from '../../../components/LanguageWrapper';
import { ProtectedRoute } from '../../../components/ProtectedRoute';
import {
  getJournalEntries,
  getTrialBalance,
  getBalanceSheet,
  getIncomeStatement,
  createJournalEntry,
  backfillAllJournalEntries,
  type BackfillResult,
} from '../../actions/accounting';
import { classifyTransaction, CHART_OF_ACCOUNTS } from '../../../lib/accountingEngine';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen, Scale, RefreshCw, Sparkles, AlertTriangle,
  Check, ChevronDown, ChevronUp, Plus, Trash2, ArrowUpRight,
  ArrowDownRight, History, RotateCcw,
} from 'lucide-react';

// ── Account names (from unified chart of accounts) ──────────────────────────

const ACCOUNT_NAMES: Record<string, string> = Object.fromEntries(
  Object.values(CHART_OF_ACCOUNTS).map(a => [a.code, a.name])
);

const ACCOUNT_HT: Record<string, string> = Object.fromEntries(
  Object.values(CHART_OF_ACCOUNTS).map(a => [a.code, a.name_ht])
);

const CLASS_COLOR: Record<string, string> = {
  Asset:   'text-blue-600 bg-blue-50',
  Liability: 'text-red-600 bg-red-50',
  Equity:  'text-purple-600 bg-purple-50',
  Revenue: 'text-emerald-600 bg-emerald-50',
  Expense: 'text-amber-600 bg-amber-50',
};

// ── AI Classifier (unified engine) ────────────────────────────────────────────

function aiClassify(text: string): { debit: string; credit: string; label: string; label_ht: string; confidence: 'high' | 'medium' | 'low' } {
  const rule = classifyTransaction(text);
  return {
    debit: rule.debit,
    credit: rule.credit,
    label: rule.label,
    label_ht: rule.label_ht,
    confidence: rule.confidence,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtHTG(n: number) {
  return new Intl.NumberFormat('fr-HT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── Types ─────────────────────────────────────────────────────────────────────

type JLine = { account_code: string; description: string; debit: number; credit: number };

// ═════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═════════════════════════════════════════════════════════════════════════════

function ComptabiliteInner() {
  const { t } = useLanguage();
  const [tab, setTab] = useState<'journal' | 'balance' | 'ledger' | 'bilan' | 'saisie'>('journal');

  // Journal
  const [entries,       setEntries]      = useState<any[]>([]);
  const [entriesLoad,   setEntriesLoad]  = useState(true);
  const [expandedId,    setExpandedId]   = useState<string | null>(null);

  // Balance
  const [trialBalance,  setTrialBalance] = useState<any>(null);
  const [balanceLoad,   setBalanceLoad]  = useState(false);

  // Grand Livre
  const [ledgerData,    setLedgerData]   = useState<any[]>([]);
  const [ledgerLoad,    setLedgerLoad]   = useState(false);
  const [selectedAcct,  setSelectedAcct] = useState<string | null>(null);

  // Bilan + Compte de résultat
  const [balanceSheet,  setBalanceSheet] = useState<any>(null);
  const [incomeStmt,    setIncomeStmt]   = useState<any>(null);
  const [bilanLoad,     setBilanLoad]    = useState(false);

  // Backfill
  const [backfilling,   setBackfilling]  = useState(false);
  const [backfillResult, setBackfillResult] = useState<BackfillResult | null>(null);

  // Manual entry form
  const [entryDesc,    setEntryDesc]    = useState('');
  const [aiSuggestion, setAiSuggestion] = useState<ReturnType<typeof aiClassify> | null>(null);
  const [entryDate,    setEntryDate]    = useState(new Date().toISOString().split('T')[0]);
  const [lines,        setLines]        = useState<JLine[]>([
    { account_code: '', description: '', debit: 0, credit: 0 },
    { account_code: '', description: '', debit: 0, credit: 0 },
  ]);
  const [saving,       setSaving]       = useState(false);
  const [saveMsg,      setSaveMsg]      = useState('');

  // Computed balance
  const totalDebit  = lines.reduce((s, l) => s + (Number(l.debit)  || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const diff        = Math.abs(totalDebit - totalCredit);
  const balanced    = diff < 0.01;

  // ── Load journal ────────────────────────────────────────────────────────────
  const loadJournal = useCallback(async () => {
    setEntriesLoad(true);
    try {
      const data = await getJournalEntries(100);
      setEntries(data);
    } catch { setEntries([]); }
    setEntriesLoad(false);
  }, []);

  // ── Load balance ────────────────────────────────────────────────────────────
  const loadBalance = useCallback(async () => {
    setBalanceLoad(true);
    try {
      const data = await getTrialBalance();
      setTrialBalance(data);
    } catch { setTrialBalance(null); }
    setBalanceLoad(false);
  }, []);

  // ── Load Grand Livre ────────────────────────────────────────────────────────
  const loadLedger = useCallback(async () => {
    setLedgerLoad(true);
    try {
      // Build ledger from journal_entry_lines grouped by account
      const entries = await getJournalEntries(500);
      const accountMap: Record<string, { name: string; class: string; lines: any[] }> = {};
      for (const je of entries) {
        for (const line of je.journal_entry_lines ?? []) {
          const acct = Array.isArray(line.chart_of_accounts) ? line.chart_of_accounts[0] : line.chart_of_accounts;
          if (!acct) continue;
          const key = (acct as any).code;
          if (!accountMap[key]) accountMap[key] = { name: (acct as any).name, class: (acct as any).account_class, lines: [] };
          accountMap[key].lines.push({
            date:        je.entry_date,
            ref:         je.entry_number,
            description: line.description || je.description,
            debit:       Number(line.debit_amount  ?? 0),
            credit:      Number(line.credit_amount ?? 0),
          });
        }
      }
      // Sort lines by date within each account
      Object.values(accountMap).forEach(a => a.lines.sort((x, y) => x.date.localeCompare(y.date)));
      setLedgerData(
        Object.entries(accountMap)
          .map(([code, v]) => ({ code, ...v }))
          .sort((a, b) => a.code.localeCompare(b.code))
      );
      if (Object.keys(accountMap).length > 0 && !selectedAcct) {
        setSelectedAcct(Object.keys(accountMap).sort()[0]);
      }
    } catch { setLedgerData([]); }
    setLedgerLoad(false);
  }, [selectedAcct]);

  // ── Load Bilan ───────────────────────────────────────────────────────────────
  const loadBilan = useCallback(async () => {
    setBilanLoad(true);
    try {
      const year = new Date().getFullYear();
      const [bs, is] = await Promise.all([
        getBalanceSheet(),
        getIncomeStatement(year),
      ]);
      setBalanceSheet(bs);
      setIncomeStmt(is);
    } catch { setBalanceSheet(null); setIncomeStmt(null); }
    setBilanLoad(false);
  }, []);

  useEffect(() => { loadJournal(); }, [loadJournal]);
  useEffect(() => { if (tab === 'balance' && !trialBalance) loadBalance(); }, [tab]);
  useEffect(() => { if (tab === 'ledger' && !ledgerData.length) loadLedger(); }, [tab]);
  useEffect(() => { if (tab === 'bilan' && !balanceSheet) loadBilan(); }, [tab]);

  // ── Backfill ────────────────────────────────────────────────────────────────
  async function handleBackfill() {
    if (!confirm('Kontabilize tout tranzaksyon ki egziste yo? Sa ap kreye ekriti pou chak vant, acha ak depans ki pa gen ekriti kontab.')) return;
    setBackfilling(true);
    setBackfillResult(null);
    try {
      const result = await backfillAllJournalEntries();
      setBackfillResult(result);
      await loadJournal();
      if (trialBalance) await loadBalance();
    } catch (e: any) {
      alert('Erè: ' + e.message);
    }
    setBackfilling(false);
  }

  // ── AI assist ───────────────────────────────────────────────────────────────
  function handleDescChange(v: string) {
    setEntryDesc(v);
    if (v.length > 5) {
      const suggestion = aiClassify(v);
      setAiSuggestion(suggestion);
    } else {
      setAiSuggestion(null);
    }
  }

  function applyAISuggestion() {
    if (!aiSuggestion) return;
    const amount = lines[0]?.debit || lines[0]?.credit || 0;
    setLines([
      { account_code: aiSuggestion.debit,  description: entryDesc, debit: amount, credit: 0 },
      { account_code: aiSuggestion.credit, description: entryDesc, debit: 0,      credit: amount },
    ]);
  }

  // ── Auto-balance ─────────────────────────────────────────────────────────────
  function autoBalance() {
    if (balanced) return;
    const newLines = [...lines];
    if (totalDebit > totalCredit) {
      // Find last credit line and adjust
      const idx = newLines.map(l => l.credit).lastIndexOf(Math.max(...newLines.map(l => l.credit)));
      if (idx >= 0) newLines[idx] = { ...newLines[idx], credit: newLines[idx].credit + (totalDebit - totalCredit) };
    } else {
      const idx = newLines.map(l => l.debit).lastIndexOf(Math.max(...newLines.map(l => l.debit)));
      if (idx >= 0) newLines[idx] = { ...newLines[idx], debit: newLines[idx].debit + (totalCredit - totalDebit) };
    }
    setLines(newLines);
  }

  // ── Save entry ───────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!entryDesc.trim()) { setSaveMsg('Deskripsyon obligatwa.'); return; }
    if (!balanced) { setSaveMsg(`⚠️ Ekriti pa ekilibre! Diferans: ${fmtHTG(diff)} HTG`); return; }
    const validLines = lines.filter(l => l.account_code && (l.debit > 0 || l.credit > 0));
    if (validLines.length < 2) { setSaveMsg('Bezwen omwen 2 liy.'); return; }
    setSaving(true); setSaveMsg('');
    try {
      await createJournalEntry({
        date: entryDate,
        description: entryDesc,
        reference_type: 'manual',
        currency: 'HTG',
        lines: validLines,
      });
      setSaveMsg('✓ Ekriti anrejistre avèk siksè!');
      setEntryDesc(''); setAiSuggestion(null);
      setLines([
        { account_code: '', description: '', debit: 0, credit: 0 },
        { account_code: '', description: '', debit: 0, credit: 0 },
      ]);
      await loadJournal();
    } catch (e: any) {
      setSaveMsg('Erè: ' + e.message);
    }
    setSaving(false);
  }

  // ── RENDER ───────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 space-y-5">

        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#12B981]">{t({ fr: 'Comptabilité', ht: 'Kontabilite' })}</p>
            <h1 className="text-2xl font-bold text-[#0F172A] mt-1">{t({ fr: 'Journal Général & Comptabilité', ht: 'Jeneral Jounal & Kontabilite' })}</h1>
            <p className="text-sm text-slate-500 mt-0.5">{t({ fr: 'Double entrée · Grand Livre · Balance de vérification', ht: 'Doub antre · Gran Liv · Balans verifyasyon' })}</p>
          </div>

          {/* Backfill button */}
          <button
            onClick={handleBackfill}
            disabled={backfilling}
            className="inline-flex items-center gap-2 rounded-2xl border border-[#12B981]/30 bg-[#12B981]/10 px-5 py-2.5 text-sm font-semibold text-[#12B981] hover:bg-[#12B981]/20 transition disabled:opacity-50"
          >
            {backfilling
              ? <><RefreshCw size={14} className="animate-spin" /> Backfill en cours…</>
              : <><RotateCcw size={14} /> Kontabilize tranzaksyon existants</>
            }
          </button>
        </div>

        {/* Backfill result */}
        <AnimatePresence>
          {backfillResult && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="rounded-2xl border border-[#12B981]/20 bg-[#12B981]/5 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Check size={16} className="text-[#12B981]" />
                <p className="font-semibold text-[#0F172A]">Backfill terminé</p>
              </div>
              <div className="flex flex-wrap gap-4 text-sm">
                <span className="text-emerald-700">✓ {backfillResult.sales} ventes kontabilizé</span>
                <span className="text-blue-700">✓ {backfillResult.purchases} achats kontabilizé</span>
                <span className="text-amber-700">✓ {backfillResult.expenses} dépenses kontabilizé</span>
              </div>
              {backfillResult.errors.length > 0 && (
                <div className="mt-3 rounded-xl bg-red-50 border border-red-200 p-3">
                  <p className="text-xs font-semibold text-red-600 mb-1">Erè ({backfillResult.errors.length}):</p>
                  {backfillResult.errors.slice(0, 5).map((e, i) => (
                    <p key={i} className="text-xs text-red-500">{e}</p>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tabs */}
        <div className="flex flex-wrap gap-1 rounded-2xl bg-white border border-[#E2E8F0] p-1.5 shadow-sm">
          {[
            { id: 'journal', label: '📖 Journal' },
            { id: 'ledger',  label: '📒 Grand Livre' },
            { id: 'balance', label: '⚖️ Balance' },
            { id: 'bilan',   label: '🏦 Bilan / Résultat' },
            { id: 'saisie',  label: '✍️ Nouvelle Écriture' },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id as any)}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${tab === t.id ? 'bg-[#0F172A] text-white shadow' : 'text-slate-500 hover:text-[#0F172A]'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── JOURNAL TAB ── */}
        {tab === 'journal' && (
          <div className="rounded-2xl border border-[#E2E8F0] bg-white shadow-sm overflow-hidden">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] px-5 py-4">
              <div>
                <h2 className="font-semibold text-[#0F172A]">Journal Général</h2>
                <p className="text-xs text-slate-400 mt-0.5">{entries.length} écriture(s)</p>
              </div>
              <button onClick={loadJournal} className="rounded-xl border border-[#E2E8F0] p-2 hover:bg-slate-50 transition">
                <RefreshCw size={14} className={`text-slate-400 ${entriesLoad ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {entriesLoad ? (
              <div className="p-8 text-center text-slate-400 text-sm">Chargement…</div>
            ) : entries.length === 0 ? (
              <div className="p-12 text-center">
                <History size={32} className="mx-auto text-slate-200 mb-3" />
                <p className="font-medium text-slate-400">{t({ fr: 'Aucune écriture comptable', ht: 'Pa gen ekriti kontab' })}</p>
                <p className="text-sm text-slate-300 mt-1">Klike "Kontabilize tranzaksyon existants" pou kòmanse</p>
              </div>
            ) : (
              <div className="divide-y divide-[#F1F5F9]">
                {entries.map(entry => {
                  const isVoided = entry.status === 'void';
                  const isReversal = entry.description?.startsWith('ANNULATION');
                  return (
                  <div key={entry.id} className={isVoided ? 'opacity-60' : ''}>
                    <button
                      onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                      className={`w-full flex items-center gap-4 px-5 py-4 text-left transition ${isVoided ? 'hover:bg-red-50' : 'hover:bg-slate-50'}`}
                    >
                      <div className={`shrink-0 rounded-xl px-2 py-1 text-[10px] font-bold ${
                        isVoided ? 'bg-red-100 text-red-500 line-through' :
                        isReversal ? 'bg-red-100 text-red-700' :
                        entry.reference_type === 'sale' ? 'bg-emerald-100 text-emerald-700' :
                        entry.reference_type === 'purchase' ? 'bg-blue-100 text-blue-700' :
                        entry.reference_type === 'expense' ? 'bg-amber-100 text-amber-700' :
                        'bg-slate-100 text-slate-600'
                      }`}>
                        {isVoided ? 'ANILE' :
                         isReversal ? 'ANILASYON' :
                         entry.reference_type === 'sale' ? 'VENTE' :
                         entry.reference_type === 'purchase' ? 'ACHA' :
                         entry.reference_type === 'expense' ? 'DEPANS' : 'MANUEL'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold truncate ${isVoided ? 'text-red-400 line-through' : 'text-[#0F172A]'}`}>
                          {entry.description?.replace('[Backfill] ', '')}
                          {isVoided && <span className="ml-2 text-[10px] font-normal text-red-400 no-underline">(annulée)</span>}
                        </p>
                        <p className="text-xs text-slate-400">{entry.entry_number} · {fmtDate(entry.entry_date)}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-sm font-bold ${isVoided ? 'text-red-300 line-through' : 'text-[#0F172A]'}`}>{fmtHTG(entry.total_debit_base ?? entry.total_debit)} HTG</p>
                        <p className={`text-[10px] font-semibold ${Math.abs(entry.total_debit - entry.total_credit) < 0.01 ? 'text-emerald-500' : 'text-red-500'}`}>
                          {Math.abs(entry.total_debit - entry.total_credit) < 0.01 ? '✓ Équilibré' : '⚠ Déséquilibré'}
                        </p>
                      </div>
                      {expandedId === entry.id ? <ChevronUp size={14} className="text-slate-400 shrink-0" /> : <ChevronDown size={14} className="text-slate-400 shrink-0" />}
                    </button>

                    <AnimatePresence>
                      {expandedId === entry.id && (
                        <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
                          <div className="border-t border-[#F1F5F9] bg-slate-50 px-5 pb-4 pt-3">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-slate-400 uppercase tracking-wider">
                                  <th className="text-left pb-2 font-semibold">Compte</th>
                                  <th className="text-left pb-2 font-semibold">Description</th>
                                  <th className="text-right pb-2 font-semibold">Débit</th>
                                  <th className="text-right pb-2 font-semibold">Crédit</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {(entry.journal_entry_lines ?? []).map((line: any) => (
                                  <tr key={line.id}>
                                    <td className="py-1.5">
                                      <span className="font-mono font-semibold text-[#0F172A]">
                                        {(line.chart_of_accounts as any)?.code ?? '—'}
                                      </span>
                                      <span className="ml-2 text-slate-500">{(line.chart_of_accounts as any)?.name ?? '—'}</span>
                                    </td>
                                    <td className="py-1.5 text-slate-500">{line.description}</td>
                                    <td className="py-1.5 text-right font-semibold text-blue-700">
                                      {Number(line.base_debit ?? line.debit_amount) > 0 ? fmtHTG(Number(line.base_debit ?? line.debit_amount)) : '—'}
                                    </td>
                                    <td className="py-1.5 text-right font-semibold text-emerald-700">
                                      {Number(line.base_credit ?? line.credit_amount) > 0 ? fmtHTG(Number(line.base_credit ?? line.credit_amount)) : '—'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── BALANCE TAB ── */}
        {tab === 'balance' && (
          <div className="rounded-2xl border border-[#E2E8F0] bg-white shadow-sm overflow-hidden">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] px-5 py-4">
              <div>
                <h2 className="font-semibold text-[#0F172A]">Balance de Vérification</h2>
                <p className="text-xs text-slate-400 mt-0.5">Total Débits doit égaler Total Crédits</p>
              </div>
              {trialBalance && (
                <div className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold ${trialBalance.balanced ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                  {trialBalance.balanced ? <><Check size={12} /> Équilibrée</> : <><AlertTriangle size={12} /> Déséquilibrée</>}
                </div>
              )}
            </div>

            {balanceLoad ? (
              <div className="p-8 text-center text-slate-400 text-sm">Calcul en cours…</div>
            ) : !trialBalance ? (
              <div className="p-8 text-center">
                <button onClick={loadBalance} className="rounded-xl bg-[#0F172A] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0F172A]/90 transition">
                  Calculer la Balance
                </button>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="px-5 py-3 text-left">Code</th>
                        <th className="px-5 py-3 text-left">Compte</th>
                        <th className="px-5 py-3 text-left">Classe</th>
                        <th className="px-5 py-3 text-right">Débit</th>
                        <th className="px-5 py-3 text-right">Crédit</th>
                        <th className="px-5 py-3 text-right">Solde</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F1F5F9]">
                      {trialBalance.rows.map((row: any) => (
                        <tr key={row.code} className="hover:bg-slate-50 transition">
                          <td className="px-5 py-3 font-mono text-xs font-semibold text-[#0F172A]">{row.code}</td>
                          <td className="px-5 py-3 text-[#0F172A]">{row.name}</td>
                          <td className="px-5 py-3">
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${CLASS_COLOR[row.class] ?? 'bg-slate-100 text-slate-600'}`}>
                              {row.class}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-right font-semibold text-blue-700">{fmtHTG(row.debit)}</td>
                          <td className="px-5 py-3 text-right font-semibold text-emerald-700">{fmtHTG(row.credit)}</td>
                          <td className={`px-5 py-3 text-right font-bold ${row.debit - row.credit >= 0 ? 'text-[#0F172A]' : 'text-red-600'}`}>
                            {fmtHTG(Math.abs(row.debit - row.credit))}
                            <span className="ml-1 text-[10px] font-normal text-slate-400">{row.debit >= row.credit ? 'D' : 'C'}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t-2 border-[#0F172A] bg-slate-50">
                      <tr>
                        <td colSpan={3} className="px-5 py-3 font-bold text-[#0F172A]">TOTAUX</td>
                        <td className="px-5 py-3 text-right font-bold text-blue-700">{fmtHTG(trialBalance.totalDebit)}</td>
                        <td className="px-5 py-3 text-right font-bold text-emerald-700">{fmtHTG(trialBalance.totalCredit)}</td>
                        <td className={`px-5 py-3 text-right font-bold text-lg ${trialBalance.balanced ? 'text-emerald-600' : 'text-red-600'}`}>
                          {trialBalance.balanced ? '✓ 0.00' : fmtHTG(Math.abs(trialBalance.totalDebit - trialBalance.totalCredit))}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── GRAND LIVRE TAB ── */}
        {tab === 'ledger' && (
          <div className="grid gap-4 lg:grid-cols-4">
            {/* Account list */}
            <div className="lg:col-span-1">
              <div className="rounded-2xl border border-[#E2E8F0] bg-white shadow-sm overflow-hidden">
                <div className="border-b border-[#E2E8F0] px-4 py-3 flex items-center justify-between">
                  <p className="text-sm font-semibold text-[#0F172A]">Comptes</p>
                  <button onClick={loadLedger} className="text-slate-400 hover:text-[#0F172A] transition">
                    <RefreshCw size={13} className={ledgerLoad ? 'animate-spin' : ''} />
                  </button>
                </div>
                {ledgerLoad ? (
                  <div className="p-4 text-center text-xs text-slate-400">Chargement…</div>
                ) : ledgerData.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-400">Aucun compte</div>
                ) : (
                  <div className="max-h-[600px] overflow-y-auto divide-y divide-[#F1F5F9]">
                    {ledgerData.map(acct => {
                      const total = acct.lines.reduce((s: number, l: any) => s + l.debit - l.credit, 0);
                      return (
                        <button key={acct.code} onClick={() => setSelectedAcct(acct.code)}
                          className={`w-full px-3 py-2.5 text-left transition ${selectedAcct === acct.code ? 'bg-[#0F172A] text-white' : 'hover:bg-slate-50'}`}>
                          <div className="flex items-center justify-between gap-2">
                            <span className={`font-mono text-[10px] font-bold ${selectedAcct === acct.code ? 'text-[#12B981]' : 'text-slate-400'}`}>{acct.code}</span>
                            <span className={`text-[10px] font-bold ${total >= 0 ? (selectedAcct === acct.code ? 'text-blue-300' : 'text-blue-600') : (selectedAcct === acct.code ? 'text-red-300' : 'text-red-600')}`}>
                              {fmtHTG(Math.abs(total))}
                            </span>
                          </div>
                          <p className={`text-xs truncate mt-0.5 ${selectedAcct === acct.code ? 'text-white/80' : 'text-slate-600'}`}>{acct.name}</p>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Account detail */}
            <div className="lg:col-span-3">
              <div className="rounded-2xl border border-[#E2E8F0] bg-white shadow-sm overflow-hidden">
                {!selectedAcct ? (
                  <div className="p-12 text-center text-slate-400 text-sm">Chwazi yon kont pou wè Grand Liv li</div>
                ) : (() => {
                  const acct = ledgerData.find(a => a.code === selectedAcct);
                  if (!acct) return null;
                  let running = 0;
                  return (
                    <>
                      <div className="border-b border-[#E2E8F0] px-5 py-4 flex items-center justify-between">
                        <div>
                          <p className="text-xs font-mono text-slate-400">{acct.code}</p>
                          <h3 className="font-bold text-[#0F172A]">{acct.name}</h3>
                        </div>
                        <span className={`rounded-xl px-3 py-1 text-xs font-bold ${CLASS_COLOR[acct.class] ?? 'bg-slate-100 text-slate-600'}`}>{acct.class}</span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
                            <tr>
                              <th className="px-4 py-3 text-left">Date</th>
                              <th className="px-4 py-3 text-left">Référence</th>
                              <th className="px-4 py-3 text-left">Description</th>
                              <th className="px-4 py-3 text-right">Débit</th>
                              <th className="px-4 py-3 text-right">Crédit</th>
                              <th className="px-4 py-3 text-right">Solde</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#F1F5F9]">
                            {acct.lines.map((l: any, i: number) => {
                              running += l.debit - l.credit;
                              return (
                                <tr key={i} className="hover:bg-slate-50 transition">
                                  <td className="px-4 py-2.5 text-slate-500 text-xs whitespace-nowrap">{fmtDate(l.date)}</td>
                                  <td className="px-4 py-2.5 font-mono text-[10px] text-slate-400 whitespace-nowrap">{l.ref}</td>
                                  <td className="px-4 py-2.5 text-[#0F172A] text-xs max-w-[200px] truncate">{l.description}</td>
                                  <td className="px-4 py-2.5 text-right font-semibold text-blue-700 text-xs">{l.debit > 0 ? fmtHTG(l.debit) : '—'}</td>
                                  <td className="px-4 py-2.5 text-right font-semibold text-emerald-700 text-xs">{l.credit > 0 ? fmtHTG(l.credit) : '—'}</td>
                                  <td className={`px-4 py-2.5 text-right font-bold text-xs ${running >= 0 ? 'text-[#0F172A]' : 'text-red-600'}`}>
                                    {fmtHTG(Math.abs(running))} <span className="text-[9px] text-slate-400">{running >= 0 ? 'D' : 'C'}</span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot className="border-t-2 border-[#0F172A] bg-slate-50">
                            <tr>
                              <td colSpan={3} className="px-4 py-3 font-bold text-[#0F172A] text-xs">TOTAL</td>
                              <td className="px-4 py-3 text-right font-bold text-blue-700 text-xs">{fmtHTG(acct.lines.reduce((s: number, l: any) => s + l.debit, 0))}</td>
                              <td className="px-4 py-3 text-right font-bold text-emerald-700 text-xs">{fmtHTG(acct.lines.reduce((s: number, l: any) => s + l.credit, 0))}</td>
                              <td className="px-4 py-3 text-right font-bold text-[#0F172A] text-xs">{fmtHTG(Math.abs(running))} <span className="text-[9px] text-slate-400">{running >= 0 ? 'D' : 'C'}</span></td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        )}

        {/* ── BILAN TAB ── */}
        {tab === 'bilan' && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">Données basées sur les écritures du Journal Général</p>
              <button onClick={loadBilan} className="inline-flex items-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-4 py-2 text-sm text-slate-500 hover:bg-slate-50 transition">
                <RefreshCw size={13} className={bilanLoad ? 'animate-spin' : ''} /> Actualiser
              </button>
            </div>

            {bilanLoad ? (
              <div className="rounded-2xl border border-[#E2E8F0] bg-white p-12 text-center text-slate-400">Calcul en cours…</div>
            ) : !balanceSheet ? (
              <div className="rounded-2xl border border-[#E2E8F0] bg-white p-12 text-center">
                <button onClick={loadBilan} className="rounded-xl bg-[#0F172A] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition">Calculer les états financiers</button>
              </div>
            ) : (
              <div className="grid gap-5 lg:grid-cols-2">
                {/* BILAN */}
                <div className="rounded-2xl border border-[#E2E8F0] bg-white shadow-sm overflow-hidden">
                  <div className="bg-[#0F172A] px-5 py-4">
                    <h3 className="font-bold text-white">Bilan</h3>
                    <p className="text-xs text-white/50 mt-0.5">Au {new Date().toLocaleDateString('fr-FR')}</p>
                  </div>
                  <div className="divide-y divide-[#F1F5F9]">
                    {/* ACTIFS */}
                    <div className="px-5 py-3 bg-blue-50">
                      <p className="text-xs font-bold uppercase tracking-widest text-blue-700">ACTIFS</p>
                    </div>
                    {Object.entries(balanceSheet.assets).map(([name, val]: any) => (
                      <div key={name} className="flex items-center justify-between px-5 py-2.5">
                        <span className="text-sm text-slate-600">{name}</span>
                        <span className="font-semibold text-[#0F172A] text-sm">{fmtHTG(val)} HTG</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between px-5 py-3 bg-blue-50">
                      <span className="font-bold text-blue-700">Total Actifs</span>
                      <span className="font-black text-blue-700">{fmtHTG(balanceSheet.totalAssets)} HTG</span>
                    </div>
                    {/* PASSIFS */}
                    <div className="px-5 py-3 bg-red-50">
                      <p className="text-xs font-bold uppercase tracking-widest text-red-700">PASSIFS</p>
                    </div>
                    {Object.entries(balanceSheet.liabilities).map(([name, val]: any) => (
                      <div key={name} className="flex items-center justify-between px-5 py-2.5">
                        <span className="text-sm text-slate-600">{name}</span>
                        <span className="font-semibold text-[#0F172A] text-sm">{fmtHTG(val)} HTG</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between px-5 py-3 bg-red-50">
                      <span className="font-bold text-red-700">Total Passifs</span>
                      <span className="font-black text-red-700">{fmtHTG(balanceSheet.totalLiabilities)} HTG</span>
                    </div>
                    {/* CAPITAUX */}
                    <div className="px-5 py-3 bg-purple-50">
                      <p className="text-xs font-bold uppercase tracking-widest text-purple-700">CAPITAUX PROPRES</p>
                    </div>
                    {Object.entries(balanceSheet.equity).map(([name, val]: any) => (
                      <div key={name} className="flex items-center justify-between px-5 py-2.5">
                        <span className="text-sm text-slate-600">{name}</span>
                        <span className="font-semibold text-[#0F172A] text-sm">{fmtHTG(val)} HTG</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between px-5 py-3 bg-purple-50">
                      <span className="font-bold text-purple-700">Total Capitaux</span>
                      <span className="font-black text-purple-700">{fmtHTG(balanceSheet.totalEquity)} HTG</span>
                    </div>
                    {/* EQUATION */}
                    <div className={`flex items-center justify-between px-5 py-4 ${balanceSheet.balanced ? 'bg-emerald-50' : 'bg-red-50'}`}>
                      <span className={`text-sm font-bold ${balanceSheet.balanced ? 'text-emerald-700' : 'text-red-700'}`}>
                        {balanceSheet.balanced ? '✓ Bilan équilibré (A = P + CP)' : '⚠ Bilan déséquilibré!'}
                      </span>
                      <span className={`font-black ${balanceSheet.balanced ? 'text-emerald-700' : 'text-red-700'}`}>
                        {fmtHTG(balanceSheet.totalAssets)} = {fmtHTG(balanceSheet.totalLiabilities + balanceSheet.totalEquity)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* COMPTE DE RÉSULTAT */}
                {incomeStmt && (
                  <div className="rounded-2xl border border-[#E2E8F0] bg-white shadow-sm overflow-hidden">
                    <div className="bg-[#0F172A] px-5 py-4">
                      <h3 className="font-bold text-white">Compte de Résultat</h3>
                      <p className="text-xs text-white/50 mt-0.5">Exercice {new Date().getFullYear()}</p>
                    </div>
                    <div className="divide-y divide-[#F1F5F9]">
                      <div className="px-5 py-3 bg-emerald-50">
                        <p className="text-xs font-bold uppercase tracking-widest text-emerald-700">REVENUS</p>
                      </div>
                      {Object.entries(incomeStmt.revenues).map(([name, val]: any) => (
                        <div key={name} className="flex items-center justify-between px-5 py-2.5">
                          <span className="text-sm text-slate-600">{name}</span>
                          <span className="font-semibold text-emerald-700 text-sm">{fmtHTG(val)} HTG</span>
                        </div>
                      ))}
                      <div className="flex items-center justify-between px-5 py-3 bg-emerald-50">
                        <span className="font-bold text-emerald-700">Total Revenus</span>
                        <span className="font-black text-emerald-700">{fmtHTG(incomeStmt.totalRevenue)} HTG</span>
                      </div>
                      <div className="px-5 py-3 bg-amber-50">
                        <p className="text-xs font-bold uppercase tracking-widest text-amber-700">CHARGES</p>
                      </div>
                      {Object.entries(incomeStmt.expenses).map(([name, val]: any) => (
                        <div key={name} className="flex items-center justify-between px-5 py-2.5">
                          <span className="text-sm text-slate-600">{name}</span>
                          <span className="font-semibold text-amber-700 text-sm">{fmtHTG(val)} HTG</span>
                        </div>
                      ))}
                      <div className="flex items-center justify-between px-5 py-3 bg-amber-50">
                        <span className="font-bold text-amber-700">Total Charges</span>
                        <span className="font-black text-amber-700">{fmtHTG(incomeStmt.totalExpense)} HTG</span>
                      </div>
                      <div className={`flex items-center justify-between px-5 py-5 ${incomeStmt.netIncome >= 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
                        <span className={`text-lg font-black ${incomeStmt.netIncome >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                          {incomeStmt.netIncome >= 0 ? '✓ BÉNÉFICE NET' : '✗ PERTE NETTE'}
                        </span>
                        <span className={`text-xl font-black ${incomeStmt.netIncome >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                          {fmtHTG(Math.abs(incomeStmt.netIncome))} HTG
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── SAISIE TAB ── */}
        {tab === 'saisie' && (
          <div className="grid gap-5 lg:grid-cols-3">
            {/* Left: Pilot AI assistant */}
            <div className="lg:col-span-1 space-y-4">
              <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-[#0F172A] to-[#12B981] text-base">🤖</div>
                  <div>
                    <p className="text-sm font-bold text-[#0F172A]">Pilot AI Comptable</p>
                    <p className="text-[10px] text-slate-400">Klasifikasyon otomatik</p>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">Deskripsyon tranzaksyon an</label>
                  <textarea
                    value={entryDesc}
                    onChange={e => handleDescChange(e.target.value)}
                    placeholder="ex: Vente comptant Marie Joseph 5000 HTG&#10;ex: Paiement salaire janvier&#10;ex: Achat stock fournisseur ABC"
                    rows={4}
                    className="w-full rounded-xl border border-[#E2E8F0] bg-slate-50 px-4 py-3 text-sm resize-none outline-none focus:border-[#12B981] focus:bg-white transition"
                  />
                </div>

                <AnimatePresence>
                  {aiSuggestion && (
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                      className={`mt-3 rounded-xl p-4 border ${
                        aiSuggestion.confidence === 'high' ? 'bg-emerald-50 border-emerald-200' :
                        aiSuggestion.confidence === 'medium' ? 'bg-amber-50 border-amber-200' :
                        'bg-red-50 border-red-200'
                      }`}>
                      <div className="flex items-center gap-2 mb-2">
                        <Sparkles size={12} className={aiSuggestion.confidence === 'high' ? 'text-emerald-600' : 'text-amber-600'} />
                        <p className="text-xs font-bold text-[#0F172A]">Suggestion Pilot AI</p>
                        <span className={`ml-auto rounded-full px-2 py-0.5 text-[9px] font-bold ${
                          aiSuggestion.confidence === 'high' ? 'bg-emerald-100 text-emerald-700' :
                          aiSuggestion.confidence === 'medium' ? 'bg-amber-100 text-amber-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {aiSuggestion.confidence === 'high' ? 'SÈR' : aiSuggestion.confidence === 'medium' ? 'PWOBAB' : 'VERIFYE'}
                        </span>
                      </div>
                      <div className="space-y-1.5 mb-3">
                        <div className="flex items-center gap-2">
                          <ArrowUpRight size={11} className="text-blue-600 shrink-0" />
                          <span className="text-xs text-slate-600">
                            <strong>Débit</strong> · {aiSuggestion.debit} — {ACCOUNT_NAMES[aiSuggestion.debit] ?? '?'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <ArrowDownRight size={11} className="text-emerald-600 shrink-0" />
                          <span className="text-xs text-slate-600">
                            <strong>Crédit</strong> · {aiSuggestion.credit} — {ACCOUNT_NAMES[aiSuggestion.credit] ?? '?'}
                          </span>
                        </div>
                      </div>
                      <p className="text-[10px] text-slate-500 mb-3 italic">{t({ fr: aiSuggestion.label, ht: aiSuggestion.label_ht })}</p>
                      <button onClick={applyAISuggestion}
                        className="w-full rounded-lg bg-[#0F172A] py-2 text-xs font-semibold text-white hover:bg-[#0F172A]/90 transition">
                        Aplike sujestyon sa a →
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Balance indicator */}
                <div className={`mt-4 rounded-xl p-3 border ${balanced ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      {balanced
                        ? <><Check size={12} className="text-emerald-600" /><span className="font-bold text-emerald-700">Ekilibre ✓</span></>
                        : <><AlertTriangle size={12} className="text-red-600" /><span className="font-bold text-red-700">Pa ekilibre!</span></>
                      }
                    </div>
                    {!balanced && (
                      <button onClick={autoBalance}
                        className="rounded-lg bg-red-600 px-2 py-1 text-[10px] font-bold text-white hover:bg-red-700 transition">
                        Auto-équilibrer
                      </button>
                    )}
                  </div>
                  <div className="mt-2 flex justify-between text-[10px] text-slate-500">
                    <span>Débit: <strong className="text-blue-700">{fmtHTG(totalDebit)}</strong></span>
                    <span>Crédit: <strong className="text-emerald-700">{fmtHTG(totalCredit)}</strong></span>
                    {!balanced && <span className="text-red-600 font-bold">Diff: {fmtHTG(diff)}</span>}
                  </div>
                </div>
              </div>

              {/* Rules card */}
              <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Règles fondamentales</p>
                <div className="space-y-2 text-xs text-slate-600">
                  {([
                    ['Vente Cash', 'D Caisse / C Ventes'],
                    ['Vente Crédit', 'D Clients / C Ventes'],
                    ['Achat Cash', 'D Achats / C Caisse'],
                    ['Achat Crédit', 'D Achats / C Fournisseurs'],
                    ['Dépense', 'D Charge / C Caisse'],
                    ['Emprunt', 'D Banque / C Emprunts'],
                    ['Salaires', 'D Salaires / C Banque'],
                  ] as [string, string][]).map(([op, rule]) => (
                    <div key={op} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                      <span className="font-semibold">{t({ fr: { 'Vente Cash': 'Vente Cash', 'Vente Crédit': 'Vente Crédit', 'Achat Cash': 'Achat Cash', 'Achat Crédit': 'Achat Crédit', 'Dépense': 'Dépense', 'Emprunt': 'Emprunt', 'Salaires': 'Salaires' }[op] || op, ht: { 'Vente Cash': 'Vant Kach', 'Vente Crédit': 'Vant Kredi', 'Achat Cash': 'Acha Kach', 'Achat Crédit': 'Acha Kredi', 'Dépense': 'Depans', 'Emprunt': 'Prè', 'Salaires': 'Salè' }[op] || op })}</span>
                      <span className="text-slate-400">{rule}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right: Form */}
            <div className="lg:col-span-2">
              <div className="rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between mb-5">
                  <h2 className="font-semibold text-[#0F172A]">Écriture Manuelle</h2>
                  <div>
                    <label className="text-xs text-slate-400 mr-2">Date</label>
                    <input type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)}
                      className="rounded-xl border border-[#E2E8F0] bg-slate-50 px-3 py-1.5 text-sm outline-none focus:border-[#12B981] transition" />
                  </div>
                </div>

                {/* Lines */}
                <div className="space-y-2 mb-4">
                  <div className="grid grid-cols-12 gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 px-1">
                    <div className="col-span-3">Compte</div>
                    <div className="col-span-4">Description</div>
                    <div className="col-span-2 text-right">Débit</div>
                    <div className="col-span-2 text-right">Crédit</div>
                    <div className="col-span-1" />
                  </div>

                  {lines.map((line, i) => (
                    <div key={i} className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-3">
                        <select
                          value={line.account_code}
                          onChange={e => { const nl=[...lines]; nl[i]={...nl[i],account_code:e.target.value}; setLines(nl); }}
                          className="w-full rounded-xl border border-[#E2E8F0] bg-slate-50 px-3 py-2 text-xs outline-none focus:border-[#12B981] focus:bg-white transition"
                        >
                          <option value="">Chwazi...</option>
                          <optgroup label="ACTIFS">
                            {Object.entries(ACCOUNT_NAMES).filter(([k]) => k.startsWith('1')).map(([k,v]) => (
                              <option key={k} value={k}>{k} — {t({ fr: v, ht: ACCOUNT_HT[k] || v })}</option>
                            ))}
                          </optgroup>
                          <optgroup label="PASSIFS">
                            {Object.entries(ACCOUNT_NAMES).filter(([k]) => k.startsWith('2')).map(([k,v]) => (
                              <option key={k} value={k}>{k} — {t({ fr: v, ht: ACCOUNT_HT[k] || v })}</option>
                            ))}
                          </optgroup>
                          <optgroup label="CAPITAUX">
                            {Object.entries(ACCOUNT_NAMES).filter(([k]) => k.startsWith('3')).map(([k,v]) => (
                              <option key={k} value={k}>{k} — {t({ fr: v, ht: ACCOUNT_HT[k] || v })}</option>
                            ))}
                          </optgroup>
                          <optgroup label="REVENUS">
                            {Object.entries(ACCOUNT_NAMES).filter(([k]) => k.startsWith('4')).map(([k,v]) => (
                              <option key={k} value={k}>{k} — {t({ fr: v, ht: ACCOUNT_HT[k] || v })}</option>
                            ))}
                          </optgroup>
                          <optgroup label="CHARGES">
                            {Object.entries(ACCOUNT_NAMES).filter(([k]) => k.startsWith('6')).map(([k,v]) => (
                              <option key={k} value={k}>{k} — {t({ fr: v, ht: ACCOUNT_HT[k] || v })}</option>
                            ))}
                          </optgroup>
                        </select>
                      </div>
                      <div className="col-span-4">
                        <input value={line.description} onChange={e => { const nl=[...lines]; nl[i]={...nl[i],description:e.target.value}; setLines(nl); }}
                          placeholder={t({ fr: 'Description de la ligne...', ht: 'Description liy lan...' })}
                          className="w-full rounded-xl border border-[#E2E8F0] bg-slate-50 px-3 py-2 text-xs outline-none focus:border-[#12B981] focus:bg-white transition" />
                      </div>
                      <div className="col-span-2">
                        <input type="number" min="0" step="0.01" value={line.debit || ''}
                          onChange={e => { const nl=[...lines]; nl[i]={...nl[i],debit:parseFloat(e.target.value)||0,credit:0}; setLines(nl); }}
                          placeholder="0.00"
                          className="w-full rounded-xl border border-[#E2E8F0] bg-blue-50 px-3 py-2 text-xs text-right outline-none focus:border-blue-400 transition" />
                      </div>
                      <div className="col-span-2">
                        <input type="number" min="0" step="0.01" value={line.credit || ''}
                          onChange={e => { const nl=[...lines]; nl[i]={...nl[i],credit:parseFloat(e.target.value)||0,debit:0}; setLines(nl); }}
                          placeholder="0.00"
                          className="w-full rounded-xl border border-[#E2E8F0] bg-emerald-50 px-3 py-2 text-xs text-right outline-none focus:border-emerald-400 transition" />
                      </div>
                      <div className="col-span-1 flex justify-center">
                        {lines.length > 2 && (
                          <button onClick={() => setLines(lines.filter((_, j) => j !== i))}
                            className="rounded-lg p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-500 transition">
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <button onClick={() => setLines([...lines, { account_code:'', description:'', debit:0, credit:0 }])}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#12B981] hover:underline mb-5">
                  <Plus size={12} /> Ajoute yon liy
                </button>

                {/* Totals row */}
                <div className={`grid grid-cols-12 gap-2 rounded-xl border p-3 mb-5 ${balanced ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
                  <div className="col-span-7 flex items-center gap-2">
                    {balanced
                      ? <><Check size={14} className="text-emerald-600" /><span className="text-xs font-bold text-emerald-700">Ekriti ekilibre ✓</span></>
                      : <><AlertTriangle size={14} className="text-red-600" /><span className="text-xs font-bold text-red-700">Pa ekilibre — diferans: {fmtHTG(diff)} HTG</span></>
                    }
                  </div>
                  <div className="col-span-2 text-right text-xs font-bold text-blue-700">{fmtHTG(totalDebit)}</div>
                  <div className="col-span-2 text-right text-xs font-bold text-emerald-700">{fmtHTG(totalCredit)}</div>
                  <div className="col-span-1" />
                </div>

                {saveMsg && (
                  <div className={`mb-4 rounded-xl border px-4 py-3 text-sm font-medium ${saveMsg.startsWith('✓') ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'}`}>
                    {saveMsg}
                  </div>
                )}

                <div className="flex gap-3">
                  <button onClick={handleSave} disabled={saving || !balanced}
                    className="flex-1 rounded-2xl bg-[#0F172A] py-3 text-sm font-bold text-white hover:bg-[#0F172A]/90 transition disabled:opacity-40">
                    {saving ? t({ fr: 'Enregistrement…', ht: 'Anrejistreman…' }) : t({ fr: '✓ Enregistrer Écriture Comptable', ht: '✓ Anrejistre Ekriti Kontab' })}
                  </button>
                  {!balanced && (
                    <button onClick={autoBalance}
                      className="rounded-2xl border border-[#12B981] bg-[#12B981]/10 px-4 py-3 text-sm font-semibold text-[#12B981] hover:bg-[#12B981]/20 transition">
                      ⚖️ Ekilibre
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ComptabilitePage() {
  return (
    <ProtectedRoute>
      <ComptabiliteInner />
    </ProtectedRoute>
  );
}
