'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Area, AreaChart, Bar, BarChart,
  CartesianGrid, Cell, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import {
  getDashboardV2Action,
  type CashflowPoint,
  type LedgerRow,
} from '../actions/ai';
import { supabase } from '../../lib/supabaseClient';

// ─────────────────────────────────────────────────────────────────────────────
// PERIOD CONFIG
// ─────────────────────────────────────────────────────────────────────────────

const MONTHS_HT = [
  'Janvye','Fevriye','Mas','Avril','Me','Jen',
  'Jiyè','Out','Septanm','Oktòb','Novanm','Desanm',
] as const;

const MONTHS_SHORT = [
  'Jan','Fev','Mas','Avr','Me','Jen','Jil','Out','Sep','Okt','Nov','Des',
] as const;

const QUARTERS = [
  { label:'T1', name:'Jan–Mas',  months:[0,1,2]   as const },
  { label:'T2', name:'Avr–Jen',  months:[3,4,5]   as const },
  { label:'T3', name:'Jil–Sep',  months:[6,7,8]   as const },
  { label:'T4', name:'Okt–Des',  months:[9,10,11] as const },
] as const;

const SEMESTERS = [
  { label:'S1', name:'Jan–Jen', months:[0,1,2,3,4,5]   as const },
  { label:'S2', name:'Jil–Des', months:[6,7,8,9,10,11] as const },
] as const;

type PeriodMode = 'mois' | 'trimestre' | 'semestre';

// ─────────────────────────────────────────────────────────────────────────────
// COLORS
// ─────────────────────────────────────────────────────────────────────────────

const C = {
  emerald: '#12B981',
  blue:    '#3B82F6',
  red:     '#EF4444',
  amber:   '#F59E0B',
  purple:  '#8B5CF6',
  cyan:    '#06B6D4',
  pink:    '#EC4899',
  grid:    'rgba(255,255,255,0.04)',
  axis:    'rgba(255,255,255,0.15)',
  tick:    'rgba(255,255,255,0.35)',
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// MOCK DATA (demo fallback)
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_CASHFLOW: CashflowPoint[] = Array.from({ length: 30 }, (_, i) => {
  const cashIn  = Math.round(4200 + Math.sin(i * 0.35) * 7000 + Math.random() * 2500);
  const cashOut = Math.round(2100 + Math.sin(i * 0.22) * 3500 + Math.random() * 1800);
  return { label: String(i + 1).padStart(2, '0'), cashIn, cashOut, profit: cashIn - cashOut };
});

const MOCK_LEDGER: LedgerRow[] = [
  { id:'d1',  date:'2026-05-20', description:'Vant – Marie Joseph',  category:'Marie Joseph',  type:'Vann', payment_method:'Cash',     amount:12500, currency:'HTG', source:'sales'    },
  { id:'d2',  date:'2026-05-19', description:'Achte Stock Boutik',    category:'Stock',         type:'Acha', payment_method:'MonCash',  amount:8200,  currency:'HTG', source:'expenses' },
  { id:'d3',  date:'2026-05-18', description:'Loye Biwo',             category:'Loyer',         type:'Acha', payment_method:'Espèces',  amount:15000, currency:'HTG', source:'expenses' },
  { id:'d4',  date:'2026-05-17', description:'Achte – Founisè ABC',   category:'Acha Stock',    type:'Dèt',  payment_method:'À Crédit', amount:45000, currency:'HTG', source:'purchases'},
  { id:'d5',  date:'2026-05-16', description:'Vant – Jean Pierre',    category:'Jean Pierre',   type:'Vann', payment_method:'Card',     amount:7800,  currency:'HTG', source:'sales'    },
  { id:'d6',  date:'2026-05-15', description:'Salè Anplwaye',         category:'Salaire',       type:'Acha', payment_method:'Cash',     amount:18000, currency:'HTG', source:'expenses' },
  { id:'d7',  date:'2026-05-14', description:'Vant – Claudette R.',   category:'Claudette R.',  type:'Vann', payment_method:'MonCash',  amount:9300,  currency:'HTG', source:'sales'    },
  { id:'d8',  date:'2026-05-13', description:'Electricite',           category:'Services',      type:'Acha', payment_method:'Espèces',  amount:3200,  currency:'HTG', source:'expenses' },
  { id:'d9',  date:'2026-04-12', description:'Vant – Robert A.',      category:'Robert A.',     type:'Vann', payment_method:'Cash',     amount:6400,  currency:'HTG', source:'sales'    },
  { id:'d10', date:'2026-04-10', description:'Achte Ingrédients',     category:'Stock',         type:'Acha', payment_method:'Espèces',  amount:11000, currency:'HTG', source:'expenses' },
];

const MOCK_PRODUCTS = [
  { id:'pr1', name:'Parfum Luxe',        stock_quantity:3,  reorder_point:10, selling_price:2500, category:'Cosmétiques' },
  { id:'pr2', name:'Robe Soirée',        stock_quantity:0,  reorder_point:5,  selling_price:8500, category:'Mode'        },
  { id:'pr3', name:'Crème Hydratante',   stock_quantity:15, reorder_point:20, selling_price:1200, category:'Cosmétiques' },
  { id:'pr4', name:'Sac à Main Luxe',    stock_quantity:8,  reorder_point:5,  selling_price:5500, category:'Accessoires' },
  { id:'pr5', name:'Stiletto Classique', stock_quantity:2,  reorder_point:8,  selling_price:4800, category:'Chaussures'  },
];

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const fmt = (n: number, cur = 'HTG') =>
  new Intl.NumberFormat('fr-HT', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n) + ' ' + cur;

const fmtK = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
  : n >= 1_000   ? `${Math.round(n / 1_000)}k`
  : String(Math.round(n));

const fmtDate = (iso: string) =>
  new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', { day:'2-digit', month:'short' });

function filterByRange(data: LedgerRow[], from: number, to: number): LedgerRow[] {
  return data.filter(r => {
    if (!r?.date) return false;
    const m = new Date(r.date + 'T00:00:00').getMonth();
    return m >= from && m <= to;
  });
}

function safeCF(pts: CashflowPoint[]): CashflowPoint[] {
  return (pts ?? []).map(p => ({
    label:   p.label   ?? '',
    cashIn:  p.cashIn  ?? 0,
    cashOut: p.cashOut ?? 0,
    profit:  p.profit  ?? 0,
  }));
}

function computeHealthScore(cashIn: number, cashOut: number, profit: number, debtTotal: number) {
  const margin = cashIn > 0 ? profit / cashIn : 0;
  const expRatio = cashIn > 0 ? cashOut / cashIn : 1;
  const debtRatio = cashIn > 0 ? debtTotal / cashIn : 1;

  let score = 0;
  // Profit margin (0-30)
  if (margin >= 0.30) score += 30;
  else if (margin >= 0.20) score += 24;
  else if (margin >= 0.10) score += 15;
  else if (margin >= 0.05) score += 8;
  // Revenue exists (0-20)
  if (cashIn > 0) score += 20;
  // Expense control (0-25)
  if (expRatio < 0.60) score += 25;
  else if (expRatio < 0.70) score += 20;
  else if (expRatio < 0.80) score += 12;
  else if (expRatio < 0.90) score += 6;
  // Debt load (0-25)
  if (debtRatio < 0.20) score += 25;
  else if (debtRatio < 0.40) score += 18;
  else if (debtRatio < 0.60) score += 10;
  else if (debtRatio < 0.80) score += 4;

  return Math.min(100, Math.max(0, score));
}

// ─────────────────────────────────────────────────────────────────────────────
// SVG HEALTH GAUGE
// ─────────────────────────────────────────────────────────────────────────────

function HealthGauge({ score }: { score: number }) {
  const r = 72, cx = 100, cy = 108, sw = 11;

  function polar(deg: number) {
    const rad = (deg - 90) * (Math.PI / 180);
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  function arc(from: number, to: number) {
    const s = polar(from), e = polar(to);
    const large = (to - from) > 180 ? 1 : 0;
    return `M ${s.x.toFixed(3)} ${s.y.toFixed(3)} A ${r} ${r} 0 ${large} 1 ${e.x.toFixed(3)} ${e.y.toFixed(3)}`;
  }

  const endAngle = 135 + Math.max(1, (score / 100) * 270);
  const col = score >= 70 ? C.emerald : score >= 40 ? C.amber : C.red;
  const label = score >= 70 ? 'EXCELLENT' : score >= 40 ? 'MOYEN' : 'FAIBLE';

  return (
    <svg viewBox="0 0 200 200" className="h-48 w-48 drop-shadow-2xl">
      {/* Track */}
      <path d={arc(135, 405)} fill="none" stroke="rgba(255,255,255,0.07)"
        strokeWidth={sw} strokeLinecap="round" />
      {/* Progress */}
      <path d={arc(135, Math.min(endAngle, 404.5))} fill="none" stroke={col}
        strokeWidth={sw} strokeLinecap="round"
        style={{ filter: `drop-shadow(0 0 10px ${col}60)` }} />
      {/* Score text */}
      <text x="100" y="100" textAnchor="middle" fill="white"
        fontSize="34" fontWeight="800" style={{ fontFamily: 'Inter, sans-serif' }}>
        {score}
      </text>
      <text x="100" y="122" textAnchor="middle" fill="rgba(255,255,255,0.38)"
        fontSize="12" fontWeight="500">/ 100</text>
      <text x="100" y="142" textAnchor="middle" fill={col}
        fontSize="10" fontWeight="700" letterSpacing="2">
        {label}
      </text>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SPARKLINE (mini chart for KPI cards)
// ─────────────────────────────────────────────────────────────────────────────

function Sparkline({ data, color, id }: { data: number[]; color: string; id: string }) {
  const pts = data.map((v, i) => ({ i, v }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={pts} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
        <defs>
          <linearGradient id={`sp-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={color} stopOpacity={0.35} />
            <stop offset="95%" stopColor={color} stopOpacity={0.01} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.8}
          fill={`url(#sp-${id})`} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI CARD
// ─────────────────────────────────────────────────────────────────────────────

interface KPICardProps {
  label: string;
  value: string;
  sub: string;
  trend: number | null;
  color: string;
  sparkData: number[];
  sparkId: string;
  icon: React.ReactNode;
  loading?: boolean;
  index?: number;
}

function KPICard({ label, value, sub, trend, color, sparkData, sparkId, icon, loading, index = 0 }: KPICardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: index * 0.07, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
      className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-slate-900/55
                 p-5 backdrop-blur-2xl flex flex-col gap-3 group
                 hover:border-white/15 hover:bg-slate-900/70 transition-all duration-300"
    >
      {/* Ambient glow */}
      <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full blur-3xl opacity-20 transition-opacity group-hover:opacity-35"
        style={{ background: color }} />

      {/* Top row */}
      <div className="flex items-start justify-between">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.15em] text-white/40">
          {label}
        </span>
        <span className="flex h-8 w-8 items-center justify-center rounded-xl opacity-80"
          style={{ background: `${color}22`, color }}>
          {icon}
        </span>
      </div>

      {/* Value */}
      {loading ? (
        <div className="h-8 w-32 animate-pulse rounded-xl bg-white/8" />
      ) : (
        <p className="text-[1.55rem] font-extrabold tracking-tight text-white leading-none">
          {value}
        </p>
      )}

      {/* Bottom row */}
      <div className="flex items-end justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          {!loading && trend !== null && (
            <span className={`flex items-center gap-1 text-[11px] font-bold ${trend >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              <span>{trend >= 0 ? '↗' : '↘'}</span>
              {Math.abs(trend).toFixed(1)}% vs mois passé
            </span>
          )}
          {!loading && (
            <span className="text-[10px] text-white/28">{sub}</span>
          )}
        </div>
        {/* Sparkline */}
        <div className="h-10 w-20 flex-shrink-0 opacity-70">
          {!loading && <Sparkline data={sparkData} color={color} id={sparkId} />}
        </div>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CUSTOM TOOLTIPS
// ─────────────────────────────────────────────────────────────────────────────

function GlassTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-[170px] space-y-2 rounded-2xl border border-white/10 bg-[#0d1117]/95
                    p-3.5 text-xs shadow-2xl backdrop-blur-xl">
      <p className="mb-1.5 font-semibold uppercase tracking-wider text-white/35">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-5">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: p.color ?? p.fill }} />
            <span className="text-white/55">{p.name}</span>
          </div>
          <span className="font-bold tabular-nums text-white">{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GLASS CARD WRAPPER
// ─────────────────────────────────────────────────────────────────────────────

function GlassCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-white/[0.08] bg-slate-900/55 backdrop-blur-2xl ${className}`}>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TYPE BADGE
// ─────────────────────────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: LedgerRow['type'] }) {
  const cfg: Record<string, string> = {
    Vann: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
    Acha: 'bg-red-500/15  text-red-400  border-red-500/25',
    Dèt:  'bg-amber-500/15 text-amber-400 border-amber-500/25',
  };
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-bold tracking-wide ${cfg[type] ?? ''}`}>
      {type}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PAYMENT METHOD BADGE
// ─────────────────────────────────────────────────────────────────────────────

function MethodBadge({ method }: { method: string }) {
  const cfg: Record<string, string> = {
    Cash:      'bg-blue-500/10 text-blue-400',
    MonCash:   'bg-purple-500/10 text-purple-400',
    Natcash:   'bg-cyan-500/10 text-cyan-400',
    Card:      'bg-pink-500/10 text-pink-400',
    Espèces:   'bg-blue-500/10 text-blue-400',
    'À Crédit':'bg-amber-500/10 text-amber-400',
  };
  return (
    <span className={`inline-flex items-center rounded-lg px-2 py-0.5 text-[10px] font-semibold
                      ${cfg[method] ?? 'bg-white/5 text-white/40'}`}>
      {method}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LEGEND DOT
// ─────────────────────────────────────────────────────────────────────────────

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-white/40">
      <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: color }} />
      {label}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SKELETON
// ─────────────────────────────────────────────────────────────────────────────

function ChartSkel({ h = 'h-64' }: { h?: string }) {
  return (
    <div className={`${h} flex items-end gap-1.5 px-4 pb-4 pt-8`}>
      {Array.from({ length: 14 }).map((_, i) => (
        <div key={i} className="flex-1 animate-pulse rounded-t-lg bg-white/[0.06]"
          style={{ height: `${20 + ((i * 41 + 13) % 68)}%` }} />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AI INSIGHT CARD
// ─────────────────────────────────────────────────────────────────────────────

interface Insight { type: 'success'|'warning'|'info'|'danger'; icon: string; text: string; action?: string }

function AIInsightCard({ insight, idx }: { insight: Insight; idx: number }) {
  const cfg = {
    success: { bg: 'bg-emerald-500/8', border: 'border-emerald-500/20', dot: 'bg-emerald-400', text: 'text-emerald-300' },
    info:    { bg: 'bg-blue-500/8',    border: 'border-blue-500/20',    dot: 'bg-blue-400',    text: 'text-blue-300'    },
    warning: { bg: 'bg-amber-500/8',   border: 'border-amber-500/20',   dot: 'bg-amber-400',   text: 'text-amber-300'   },
    danger:  { bg: 'bg-red-500/8',     border: 'border-red-500/20',     dot: 'bg-red-400',     text: 'text-red-300'     },
  }[insight.type];

  return (
    <motion.div
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: idx * 0.12 + 0.3, duration: 0.4 }}
      className={`flex gap-3 rounded-xl border ${cfg.border} ${cfg.bg} p-3.5`}
    >
      <span className="text-lg leading-none flex-shrink-0 mt-0.5">{insight.icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-[12.5px] text-white/75 leading-relaxed">{insight.text}</p>
        {insight.action && (
          <span className={`mt-1 inline-block text-[10.5px] font-semibold ${cfg.text}`}>
            {insight.action} →
          </span>
        )}
      </div>
      <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 mt-1.5 ${cfg.dot}`} />
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STOCK STATUS BAR
// ─────────────────────────────────────────────────────────────────────────────

function StockBar({ qty, reorder }: { qty: number; reorder: number }) {
  const pct = reorder > 0 ? Math.min(100, (qty / (reorder * 2)) * 100) : 50;
  const col = qty === 0 ? C.red : qty <= reorder ? C.amber : C.emerald;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-white/8">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: col }} />
      </div>
      <span className="text-[11px] tabular-nums font-semibold" style={{ color: col }}>
        {qty === 0 ? 'Épuisé' : qty <= reorder ? `${qty} (bas)` : qty}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// QUICK ACTION BUTTON
// ─────────────────────────────────────────────────────────────────────────────

function QAButton({ href, icon, label, color }: { href: string; icon: React.ReactNode; label: string; color: string }) {
  return (
    <Link href={href}>
      <motion.div
        whileHover={{ scale: 1.04, y: -2 }}
        whileTap={{ scale: 0.97 }}
        className="flex flex-col items-center gap-2 rounded-2xl border border-white/8
                   bg-slate-900/60 p-4 text-center cursor-pointer group
                   hover:border-white/15 hover:bg-slate-900/80 transition-colors"
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl transition-all duration-200
                         group-hover:scale-110"
          style={{ background: `${color}20`, color }}>
          {icon}
        </span>
        <span className="text-[11px] font-semibold text-white/60 group-hover:text-white/90 transition-colors leading-tight">
          {label}
        </span>
      </motion.div>
    </Link>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// REPORT SHORTCUT CARD
// ─────────────────────────────────────────────────────────────────────────────

function ReportCard({ title, subtitle, icon, color, href }: {
  title: string; subtitle: string; icon: React.ReactNode; color: string; href: string;
}) {
  return (
    <Link href={href}>
      <motion.div
        whileHover={{ y: -3 }}
        className="flex items-center gap-4 rounded-2xl border border-white/8 bg-slate-900/55
                   p-4 cursor-pointer hover:border-white/15 hover:bg-slate-900/70
                   transition-all group backdrop-blur-xl"
      >
        <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl transition-transform group-hover:scale-105"
          style={{ background: `${color}18`, color }}>
          {icon}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white/85 group-hover:text-white transition-colors">{title}</p>
          <p className="text-[11px] text-white/35 mt-0.5">{subtitle}</p>
        </div>
        <svg className="h-4 w-4 flex-shrink-0 text-white/20 group-hover:text-white/50 group-hover:translate-x-0.5 transition-all"
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </motion.div>
    </Link>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION LABEL
// ─────────────────────────────────────────────────────────────────────────────

function SectionLabel({ children, color = C.emerald }: { children: React.ReactNode; color?: string }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <div className="h-5 w-1 rounded-full flex-shrink-0" style={{ background: color }} />
      <h2 className="text-base font-bold text-white">{children}</h2>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORT CSV
// ─────────────────────────────────────────────────────────────────────────────

function exportCSV(headers: string[], rows: (string | number)[][], filename: string) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const csv = [headers.map(esc), ...rows.map(r => r.map(esc))].map(r => r.join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN DASHBOARD COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

function DashboardInner() {
  const now          = new Date();
  const currentYear  = now.getFullYear();
  const currentMonth = now.getMonth();
  const hour         = now.getHours();
  const greeting     = hour < 12 ? 'Bonjou' : hour < 18 ? 'Bonswa' : 'Bonswa';

  // ── Period state ─────────────────────────────────────────────────────────────
  const [periodMode,       setPeriodMode]       = useState<PeriodMode>('mois');
  const [selectedMonth,    setSelectedMonth]    = useState(currentMonth);
  const [selectedQuarter,  setSelectedQuarter]  = useState(Math.floor(currentMonth / 3));
  const [selectedSemester, setSelectedSemester] = useState(currentMonth < 6 ? 0 : 1);

  // ── Data state ───────────────────────────────────────────────────────────────
  const [loading,   setLoading]   = useState(true);
  const [isDemo,    setIsDemo]    = useState(false);
  const [cashflow,  setCashflow]  = useState<CashflowPoint[]>(MOCK_CASHFLOW);
  const [ledger,    setLedger]    = useState<LedgerRow[]>(MOCK_LEDGER);
  const [totals,    setTotals]    = useState({ cashIn: 94400, cashOut: 59400, profit: 35000, debtTotal: 45000 });
  const [userName,  setUserName]  = useState('');
  const [products,  setProducts]  = useState(MOCK_PRODUCTS);
  const [showFullLedger, setShowFullLedger] = useState(false);

  // ── Table filters ─────────────────────────────────────────────────────────
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [ledgerType,   setLedgerType]   = useState('');
  const [ledgerPage,   setLedgerPage]   = useState(1);
  const PAGE_SIZE = 6;

  // ── Month range ──────────────────────────────────────────────────────────────
  const monthRange = useMemo<[number, number]>(() => {
    if (periodMode === 'mois')      return [selectedMonth, selectedMonth];
    if (periodMode === 'trimestre') return [QUARTERS[selectedQuarter].months[0], QUARTERS[selectedQuarter].months[2]];
    return [SEMESTERS[selectedSemester].months[0], SEMESTERS[selectedSemester].months[5]];
  }, [periodMode, selectedMonth, selectedQuarter, selectedSemester]);

  const periodLabel = useMemo(() => {
    if (periodMode === 'mois')
      return `${MONTHS_HT[selectedMonth]} ${currentYear}`;
    if (periodMode === 'trimestre')
      return `${QUARTERS[selectedQuarter].label} ${currentYear} — ${QUARTERS[selectedQuarter].name}`;
    return `${SEMESTERS[selectedSemester].label} ${currentYear} — ${SEMESTERS[selectedSemester].name}`;
  }, [periodMode, selectedMonth, selectedQuarter, selectedSemester, currentYear]);

  // ── Load data ────────────────────────────────────────────────────────────────
  const load = useCallback(async (mode: PeriodMode, mFrom: number, mTo: number) => {
    setLoading(true);
    try {
      const apiMode = mode === 'mois' ? 'month' : 'range';
      const data = await getDashboardV2Action(apiMode, currentYear, mFrom, mTo);
      if (data.ledger.length === 0 && data.totals.cashIn === 0) {
        setIsDemo(true);
        const filtered = filterByRange(MOCK_LEDGER, mFrom, mTo);
        setCashflow(safeCF(MOCK_CASHFLOW));
        setLedger(filtered.length ? filtered : MOCK_LEDGER);
        setTotals({ cashIn: 94400, cashOut: 59400, profit: 35000, debtTotal: 45000 });
      } else {
        setIsDemo(false);
        setCashflow(safeCF(data.cashflow));
        setLedger(data.ledger);
        setTotals(data.totals);
      }
    } catch {
      setIsDemo(true);
      setCashflow(safeCF(MOCK_CASHFLOW));
      setLedger(MOCK_LEDGER);
      setTotals({ cashIn: 94400, cashOut: 59400, profit: 35000, debtTotal: 45000 });
    }
    setLoading(false);
    setLedgerPage(1);
  }, [currentYear]);

  // ── Load user + products ─────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data }: any) => {
      const meta = data?.user?.user_metadata;
      setUserName(meta?.full_name ?? meta?.name ?? data?.user?.email?.split('@')[0] ?? 'Entrepreneur');
    });

    supabase.from('products')
      .select('id, name, stock_quantity, reorder_point, selling_price, category')
      .then(({ data }: any) => {
        if (data && data.length > 0) setProducts(data);
      });
  }, []);

  useEffect(() => {
    load(periodMode, monthRange[0], monthRange[1]);
  }, [periodMode, monthRange, load]);

  // ── Derived data ─────────────────────────────────────────────────────────────
  const marginPct = totals.cashIn > 0 ? (totals.profit / totals.cashIn) * 100 : 0;
  const healthScore = computeHealthScore(totals.cashIn, totals.cashOut, totals.profit, totals.debtTotal);

  const bilanRows = useMemo(() => {
    const map = new Map<string, { idx: number; rev: number; dep: number }>();
    for (const r of ledger) {
      const mIdx   = new Date(r.date + 'T00:00:00').getMonth();
      const mLabel = MONTHS_SHORT[mIdx];
      if (!map.has(mLabel)) map.set(mLabel, { idx: mIdx, rev: 0, dep: 0 });
      const b = map.get(mLabel)!;
      if (r.type === 'Vann') b.rev += r.amount;
      else                   b.dep += r.amount;
    }
    return [...map.entries()]
      .sort((a, b) => a[1].idx - b[1].idx)
      .map(([month, d]) => ({
        month,
        revenue:  +d.rev.toFixed(2),
        expenses: +d.dep.toFixed(2),
        profit:   +(d.rev - d.dep).toFixed(2),
      }));
  }, [ledger]);

  const salesRows     = useMemo(() => ledger.filter(r => r.type === 'Vann').sort((a,b)=>b.date.localeCompare(a.date)), [ledger]);
  const expensesRows  = useMemo(() => ledger.filter(r => r.type === 'Acha').sort((a,b)=>b.date.localeCompare(a.date)), [ledger]);
  const recentLedger  = useMemo(() => [...ledger].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,8), [ledger]);

  const filteredLedger = useMemo(() => {
    let rows = [...ledger];
    if (ledgerSearch) rows = rows.filter(r =>
      r.description.toLowerCase().includes(ledgerSearch.toLowerCase()) ||
      r.category.toLowerCase().includes(ledgerSearch.toLowerCase())
    );
    if (ledgerType)   rows = rows.filter(r => r.type === ledgerType);
    return rows.sort((a,b) => b.date.localeCompare(a.date));
  }, [ledger, ledgerSearch, ledgerType]);

  const ledgerPageCount = Math.max(1, Math.ceil(filteredLedger.length / PAGE_SIZE));
  const paginatedLedger = filteredLedger.slice((ledgerPage - 1) * PAGE_SIZE, ledgerPage * PAGE_SIZE);

  // Sparkline arrays (12 pts)
  const spRevenue  = useMemo(() => cashflow.slice(0, 12).map(p => p.cashIn), [cashflow]);
  const spExpenses = useMemo(() => cashflow.slice(0, 12).map(p => p.cashOut), [cashflow]);
  const spProfit   = useMemo(() => cashflow.slice(0, 12).map(p => Math.max(0, p.profit)), [cashflow]);
  const spCashflow = useMemo(() => {
    let bal = 0;
    return cashflow.slice(0, 12).map(p => { bal += p.profit; return Math.max(0, bal); });
  }, [cashflow]);

  const lowStockCount  = products.filter(p => p.stock_quantity <= (p.reorder_point ?? 0)).length;
  const outOfStockCount = products.filter(p => p.stock_quantity === 0).length;
  const totalStockValue = products.reduce((s, p) => s + (p.stock_quantity * (p.selling_price ?? 0)), 0);

  // AI Insights (computed from real data)
  const aiInsights: Insight[] = useMemo(() => {
    const insights: Insight[] = [];

    if (marginPct >= 20) {
      insights.push({ type:'success', icon:'🚀',
        text: `Maji pwofitabilite w ekselan — ${marginPct.toFixed(1)}% — biznis ou an bòn sante finansyè.`,
        action: 'Wè rapò konplè'
      });
    } else if (marginPct >= 5) {
      insights.push({ type:'info', icon:'📊',
        text: `Maj ou a ${marginPct.toFixed(1)}% — travay sou redwi depans yo pou amelyore pwofi ou.`,
        action: 'Analize depans'
      });
    } else {
      insights.push({ type:'danger', icon:'🔴',
        text: `Alèt : maj ou a ${marginPct.toFixed(1)}%. Depans yo depase reveni yo. Pran aksyon tousuit.`,
        action: 'Wè depans yo'
      });
    }

    if (totals.debtTotal > totals.cashIn * 0.5 && totals.debtTotal > 0) {
      insights.push({ type:'warning', icon:'⚠️',
        text: `Dèt ou yo reprezante ${(totals.debtTotal / totals.cashIn * 100).toFixed(0)}% reveni ou. Panse redwi chaj kredi yo.`,
        action: 'Jere dèt yo'
      });
    }

    const byCategory: Record<string, number> = {};
    for (const r of salesRows) {
      byCategory[r.category] = (byCategory[r.category] ?? 0) + r.amount;
    }
    const top = Object.entries(byCategory).sort(([,a],[,b]) => b - a)[0];
    if (top) {
      insights.push({ type:'info', icon:'⭐',
        text: `Miyò kliyan / kategori ou pou peryòd sa a : "${top[0]}" ak ${fmt(top[1])}.` });
    }

    if (outOfStockCount > 0) {
      insights.push({ type:'warning', icon:'📦',
        text: `${outOfStockCount} pwodwi rive zewo nan stòk. Renouvle yo tousuit pou evite pèdi vant.`,
        action: 'Wè envantè'
      });
    }

    if (totals.cashIn > 0 && totals.profit > 0) {
      insights.push({ type:'success', icon:'💰',
        text: `Pwofi nèt ou pou peryòd sa a : ${fmt(totals.profit)}. Kontinye konsa !`
      });
    }

    return insights.slice(0, 5);
  }, [marginPct, totals, salesRows, outOfStockCount]);

  // Health score breakdown
  const healthFactors = [
    { label: 'Pwofitabilite', score: Math.round(Math.min(30, Math.max(0, marginPct >= 30 ? 30 : marginPct >= 20 ? 24 : marginPct >= 10 ? 15 : marginPct >= 5 ? 8 : 0))), max: 30, color: C.emerald },
    { label: 'Revenu',        score: totals.cashIn > 0 ? 20 : 0, max: 20, color: C.blue },
    { label: 'Kontwòl depans',score: Math.round(totals.cashIn > 0 ? (totals.cashOut / totals.cashIn < 0.60 ? 25 : totals.cashOut / totals.cashIn < 0.70 ? 20 : totals.cashOut / totals.cashIn < 0.80 ? 12 : totals.cashOut / totals.cashIn < 0.90 ? 6 : 0) : 0), max: 25, color: C.purple },
    { label: 'Jestyon dèt',   score: Math.round(totals.cashIn > 0 ? (totals.debtTotal / totals.cashIn < 0.20 ? 25 : totals.debtTotal / totals.cashIn < 0.40 ? 18 : totals.debtTotal / totals.cashIn < 0.60 ? 10 : totals.debtTotal / totals.cashIn < 0.80 ? 4 : 0) : 0), max: 25, color: C.amber },
  ];

  // ── RENDER ───────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#080c14] text-white">
      {/* ──────────────────────────────────────────────────────────────── */}
      {/* 1. HEADER                                                        */}
      {/* ──────────────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden">
        {/* Ambient gradient behind header */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-emerald-950/40 via-transparent to-blue-950/20" />
        <div className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full bg-emerald-500/5 blur-3xl" />
        <div className="pointer-events-none absolute -top-16 right-0 h-80 w-80 rounded-full bg-blue-500/5 blur-3xl" />

        <div className="relative mx-auto max-w-7xl px-4 pb-6 pt-7 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              {/* Greeting */}
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
              >
                <p className="text-[11px] font-bold uppercase tracking-[0.35em] text-emerald-400/70">
                  ProfitPilot · Tableau de bord
                </p>
                <h1 className="mt-2 text-2xl font-extrabold tracking-tight md:text-3xl lg:text-4xl">
                  {greeting},{' '}
                  <span className="bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">
                    {userName || 'Entrepreneur'} 👋
                  </span>
                </h1>
                <p className="mt-1.5 text-sm text-white/40">
                  Voici les performances de votre business — {periodLabel}
                </p>
              </motion.div>
            </div>

            {/* Right side: actions + badges */}
            <div className="flex flex-wrap items-center gap-2">
              {isDemo && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30
                             bg-amber-500/10 px-3 py-1.5 text-[11px] font-semibold text-amber-400"
                >
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
                  Données démo
                </motion.span>
              )}
              <Link href="/ai-assistant"
                className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30
                           bg-emerald-500/10 px-4 py-2 text-[12px] font-semibold text-emerald-400
                           transition hover:bg-emerald-500/20 hover:border-emerald-500/50">
                <span className="text-base leading-none">🤖</span>
                Pilot AI
              </Link>
              <Link href="/settings"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10
                           bg-white/5 text-white/40 transition hover:bg-white/10 hover:text-white">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="mx-auto max-w-7xl space-y-8 px-4 pb-32 sm:px-6 lg:px-8">

        {/* ──────────────────────────────────────────────────────────────── */}
        {/* 2. PERIOD SELECTOR                                               */}
        {/* ──────────────────────────────────────────────────────────────── */}
        <div className="space-y-3">
          <div className="inline-flex rounded-2xl border border-white/8 bg-white/[0.04] p-1 gap-1">
            {(['mois','trimestre','semestre'] as PeriodMode[]).map(m => (
              <button key={m} onClick={() => setPeriodMode(m)}
                className={`rounded-xl px-4 py-2 text-[12px] font-semibold capitalize transition-all duration-200 ${
                  periodMode === m
                    ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30'
                    : 'text-white/45 hover:bg-white/8 hover:text-white'
                }`}>
                {m === 'mois' ? '📅 Mwa' : m === 'trimestre' ? '📊 Trimès' : '📈 Semès'}
              </button>
            ))}
          </div>

          <div className="flex gap-1 overflow-x-auto rounded-2xl border border-white/[0.06]
                          bg-white/[0.02] p-1.5 backdrop-blur-sm scrollbar-none">
            {periodMode === 'mois' && MONTHS_HT.map((m, i) => (
              <button key={i} onClick={() => setSelectedMonth(i)}
                className={`flex-shrink-0 rounded-xl px-3.5 py-2 text-[11.5px] font-semibold transition-all ${
                  selectedMonth === i
                    ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/30'
                    : 'text-white/45 hover:bg-white/8 hover:text-white'
                }`}>
                {m.slice(0, 3)}
              </button>
            ))}
            {periodMode === 'trimestre' && QUARTERS.map((q, i) => (
              <button key={i} onClick={() => setSelectedQuarter(i)}
                className={`flex-shrink-0 rounded-xl px-5 py-2 text-[11.5px] font-semibold transition-all ${
                  selectedQuarter === i
                    ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                    : 'text-white/45 hover:bg-white/8 hover:text-white'
                }`}>
                {q.label} <span className="opacity-55">({q.name})</span>
              </button>
            ))}
            {periodMode === 'semestre' && SEMESTERS.map((s, i) => (
              <button key={i} onClick={() => setSelectedSemester(i)}
                className={`flex-shrink-0 rounded-xl px-8 py-2 text-[11.5px] font-semibold transition-all ${
                  selectedSemester === i
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                    : 'text-white/45 hover:bg-white/8 hover:text-white'
                }`}>
                {s.label} <span className="opacity-55">({s.name})</span>
              </button>
            ))}
          </div>
        </div>

        {/* ──────────────────────────────────────────────────────────────── */}
        {/* 3. KPI CARDS                                                     */}
        {/* ──────────────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KPICard index={0} label="Revenus du mois" value={loading ? '…' : fmt(totals.cashIn)}
            sub="Total des ventes" trend={null} color={C.blue}
            sparkData={spRevenue} sparkId="rev" loading={loading}
            icon={<svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11l5-5m0 0l5 5m-5-5v12"/>
            </svg>}
          />
          <KPICard index={1} label="Profit net" value={loading ? '…' : fmt(totals.profit)}
            sub={loading ? '' : `Marge ${marginPct.toFixed(1)}%`}
            trend={null} color={totals.profit >= 0 ? C.emerald : C.red}
            sparkData={spProfit} sparkId="pft" loading={loading}
            icon={<svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
            </svg>}
          />
          <KPICard index={2} label="Dépenses" value={loading ? '…' : fmt(totals.cashOut)}
            sub="Achats + charges" trend={null} color={C.red}
            sparkData={spExpenses} sparkId="exp" loading={loading}
            icon={<svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 13l-5 5m0 0l-5-5m5 5V6"/>
            </svg>}
          />
          <KPICard index={3} label="Trésorerie" value={loading ? '…' : fmt(Math.max(0, totals.profit))}
            sub="Solde disponible" trend={null}
            color={totals.profit >= 0 ? C.cyan : C.red}
            sparkData={spCashflow} sparkId="cf" loading={loading}
            icon={<svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/>
            </svg>}
          />
          <KPICard index={4} label="Dettes fournisseurs" value={loading ? '…' : fmt(totals.debtTotal)}
            sub="À crédit" trend={null} color={C.amber}
            sparkData={Array.from({length:12},(_,i)=>totals.debtTotal*(0.5+Math.sin(i)*0.3))}
            sparkId="dbt" loading={loading}
            icon={<svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>}
          />
          <KPICard index={5} label="Produits en rupture" value={String(outOfStockCount)}
            sub={`${lowStockCount} en stock bas`} trend={null}
            color={outOfStockCount > 0 ? C.red : C.emerald}
            sparkData={Array.from({length:12},(_,i)=>Math.max(0,outOfStockCount+Math.sin(i)*1.5))}
            sparkId="stk" loading={loading}
            icon={<svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/>
            </svg>}
          />
          <KPICard index={6} label="Transactions" value={loading ? '…' : String(ledger.length)}
            sub={`${salesRows.length} ventes · ${expensesRows.length} dépenses`}
            trend={null} color={C.purple}
            sparkData={Array.from({length:12},(_,i)=>4+Math.sin(i*0.7)*3+Math.random()*2)}
            sparkId="txn" loading={loading}
            icon={<svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/>
            </svg>}
          />
          <KPICard index={7} label="Valeur stock total" value={fmtK(totalStockValue) + ' HTG'}
            sub={`${products.length} produits`} trend={null} color={C.pink}
            sparkData={Array.from({length:12},(_,i)=>totalStockValue*(0.8+Math.sin(i*0.5)*0.2))}
            sparkId="sv" loading={loading}
            icon={<svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"/>
            </svg>}
          />
        </div>

        {/* ──────────────────────────────────────────────────────────────── */}
        {/* 4. CHARTS — CASHFLOW AREA                                        */}
        {/* ──────────────────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <GlassCard className="p-5">
            <div className="mb-5 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-400/70">Cashflow</p>
                <h3 className="mt-0.5 font-bold text-white text-lg">Évolution du flux de trésorerie</h3>
                <p className="text-[11px] text-white/35 mt-0.5">Entrées vs sorties · {periodLabel}</p>
              </div>
              <div className="flex items-center gap-4">
                <LegendDot color={C.blue}    label="Cash In" />
                <LegendDot color={C.red}     label="Cash Out" />
                <LegendDot color={C.emerald} label="Profit" />
              </div>
            </div>

            {loading ? <ChartSkel h="h-64 md:h-72" /> : (
              <div className="h-64 md:h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={cashflow} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gIn"  x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor={C.blue}    stopOpacity={0.5}/>
                        <stop offset="95%" stopColor={C.blue}    stopOpacity={0.02}/>
                      </linearGradient>
                      <linearGradient id="gOut" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor={C.red}     stopOpacity={0.45}/>
                        <stop offset="95%" stopColor={C.red}     stopOpacity={0.02}/>
                      </linearGradient>
                      <linearGradient id="gPft" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor={C.emerald} stopOpacity={0.3}/>
                        <stop offset="95%" stopColor={C.emerald} stopOpacity={0.01}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke={C.grid} strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" stroke={C.axis} tick={{ fill: C.tick, fontSize: 10 }}
                      tickLine={false} axisLine={false}
                      interval={periodMode === 'mois' ? 4 : 0} />
                    <YAxis stroke={C.axis} tick={{ fill: C.tick, fontSize: 10 }}
                      tickLine={false} axisLine={false} width={50} tickFormatter={fmtK} />
                    <Tooltip content={<GlassTooltip />}
                      cursor={{ stroke: 'rgba(255,255,255,0.08)', strokeWidth: 1 }} />
                    <Area type="monotone" dataKey="cashIn"  name="Cash In"
                      stroke={C.blue}    strokeWidth={2}   fill="url(#gIn)"
                      dot={false} activeDot={{ r: 5, fill: C.blue,    stroke:'#fff', strokeWidth:2 }} />
                    <Area type="monotone" dataKey="cashOut" name="Cash Out"
                      stroke={C.red}     strokeWidth={2}   fill="url(#gOut)"
                      dot={false} activeDot={{ r: 5, fill: C.red,     stroke:'#fff', strokeWidth:2 }} />
                    <Area type="monotone" dataKey="profit"  name="Profit"
                      stroke={C.emerald} strokeWidth={1.5} fill="url(#gPft)" strokeDasharray="5 3"
                      dot={false} activeDot={{ r: 4, fill: C.emerald, stroke:'#fff', strokeWidth:2 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </GlassCard>
        </motion.div>

        {/* ──────────────────────────────────────────────────────────────── */}
        {/* 5. CHARTS — PERFORMANCE BAR + SIDE METRICS                      */}
        {/* ──────────────────────────────────────────────────────────────── */}
        <div className="grid gap-4 lg:grid-cols-[1fr_240px]">
          {/* Bar Chart */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.25 }}
          >
            <GlassCard className="p-5 h-full">
              <div className="mb-5">
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-purple-400/70">Performance</p>
                <h3 className="mt-0.5 font-bold text-white text-lg">Revenus vs Dépenses par mois</h3>
                <p className="text-[11px] text-white/35 mt-0.5">{periodLabel}</p>
              </div>

              {loading ? <ChartSkel h="h-56 md:h-64" /> : bilanRows.length === 0 ? (
                <div className="flex h-56 items-center justify-center text-sm text-white/25">
                  Aucune donnée pour cette période.
                </div>
              ) : (
                <div className="h-56 md:h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={bilanRows} margin={{ top:6, right:4, left:0, bottom:0 }}
                      barCategoryGap="28%" barGap={3}>
                      <CartesianGrid stroke={C.grid} strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="month" stroke={C.axis}
                        tick={{ fill: C.tick, fontSize: 11 }} tickLine={false} axisLine={false} />
                      <YAxis stroke={C.axis} tick={{ fill: C.tick, fontSize: 10 }}
                        tickLine={false} axisLine={false} width={50} tickFormatter={fmtK} />
                      <Tooltip content={<GlassTooltip />}
                        cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                      <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" />
                      <Bar dataKey="revenue"  name="Revenu"  fill={C.blue}   radius={[5,5,0,0]} maxBarSize={42} />
                      <Bar dataKey="expenses" name="Dépenses" fill={C.red}   radius={[5,5,0,0]} maxBarSize={42} />
                      <Bar dataKey="profit"   name="Profit"   radius={[5,5,0,0]} maxBarSize={42}>
                        {bilanRows.map((r, i) => (
                          <Cell key={i} fill={r.profit >= 0 ? C.emerald : C.red} fillOpacity={0.85} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {!loading && bilanRows.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-4 justify-end">
                  <LegendDot color={C.blue}    label="Revenu" />
                  <LegendDot color={C.red}     label="Dépenses" />
                  <LegendDot color={C.emerald} label="Profit +" />
                </div>
              )}
            </GlassCard>
          </motion.div>

          {/* Side metrics */}
          <div className="flex flex-col gap-3">
            {/* Margin */}
            <GlassCard className="p-4 flex flex-col gap-3">
              <p className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-white/35">Marge Profit</p>
              {loading ? <div className="h-8 w-20 animate-pulse rounded-xl bg-white/8" /> : (
                <>
                  <p className={`text-3xl font-extrabold tracking-tight ${
                    marginPct >= 20 ? 'text-emerald-400' : marginPct >= 5 ? 'text-amber-400' : 'text-red-400'
                  }`}>
                    {marginPct.toFixed(1)}<span className="text-lg font-medium opacity-60">%</span>
                  </p>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/8">
                    <motion.div className="h-full rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(100, Math.abs(marginPct))}%` }}
                      transition={{ duration: 1, ease: 'easeOut' }}
                      style={{ background: marginPct >= 20 ? C.emerald : marginPct >= 5 ? C.amber : C.red }}
                    />
                  </div>
                  <p className="text-[10px] text-white/28">Profit ÷ Revenu total</p>
                </>
              )}
            </GlassCard>

            {/* Cashflow balance */}
            <GlassCard className="p-4 flex flex-col gap-2">
              <p className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-white/35">Solde Net</p>
              {loading ? <div className="h-8 w-24 animate-pulse rounded-xl bg-white/8" /> : (
                <>
                  <p className={`text-2xl font-extrabold tracking-tight ${totals.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {totals.profit >= 0 ? '+' : ''}{fmtK(totals.profit)}
                    <span className="text-xs font-medium text-white/30 ml-1">HTG</span>
                  </p>
                  <p className="text-[10px] text-white/28">Cash In − Cash Out</p>
                </>
              )}
            </GlassCard>

            {/* Health indicator */}
            {!loading && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
                className={`rounded-2xl border p-4 text-[12px] leading-relaxed ${
                  marginPct >= 20
                    ? 'border-emerald-500/20 bg-emerald-500/8 text-emerald-300'
                    : marginPct >= 5
                    ? 'border-amber-500/20 bg-amber-500/8 text-amber-300'
                    : 'border-red-500/20 bg-red-500/8 text-red-300'
                }`}>
                <span className="font-bold">
                  {marginPct >= 20 ? '✅ Excellent' : marginPct >= 5 ? '⚠️ Moyen' : '🔴 Alerte'}
                </span>
                <p className="mt-1 text-[11px] opacity-80">
                  {marginPct >= 20
                    ? 'Performance financière exceptionnelle.'
                    : marginPct >= 5
                    ? 'Marge acceptable, surveillez vos charges.'
                    : 'Marge critique — réduisez les dépenses.'}
                </p>
              </motion.div>
            )}
          </div>
        </div>

        {/* ──────────────────────────────────────────────────────────────── */}
        {/* 6 + 8. AI INSIGHTS + FINANCIAL HEALTH SCORE                     */}
        {/* ──────────────────────────────────────────────────────────────── */}
        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
          {/* AI Panel */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            <GlassCard className="p-5 h-full">
              {/* AI Header */}
              <div className="mb-5 flex items-center gap-3">
                <div className="relative flex h-11 w-11 flex-shrink-0 items-center justify-center
                                rounded-2xl bg-gradient-to-br from-emerald-500/30 to-blue-500/30
                                border border-white/10">
                  <span className="text-xl">🤖</span>
                  <span className="absolute -right-1 -top-1 h-3.5 w-3.5 rounded-full bg-emerald-400
                                   border-2 border-[#080c14] animate-pulse" />
                </div>
                <div>
                  <h3 className="font-bold text-white">Pilot AI</h3>
                  <p className="text-[11px] text-white/35">Analyse automatique de votre business</p>
                </div>
                <span className="ml-auto inline-flex items-center gap-1.5 rounded-full
                                 border border-emerald-500/20 bg-emerald-500/10
                                 px-2.5 py-1 text-[10px] font-semibold text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  En ligne
                </span>
              </div>

              {/* Insights */}
              <div className="space-y-3">
                {loading
                  ? Array.from({length:3}).map((_,i) => (
                      <div key={i} className="h-16 animate-pulse rounded-xl bg-white/5" />
                    ))
                  : aiInsights.map((ins, i) => <AIInsightCard key={i} insight={ins} idx={i} />)
                }
              </div>

              {/* Link to full AI */}
              <Link href="/ai-assistant"
                className="mt-4 flex items-center justify-center gap-2 rounded-2xl border border-emerald-500/20
                           bg-emerald-500/8 py-3 text-[12px] font-semibold text-emerald-400
                           transition hover:bg-emerald-500/15 hover:border-emerald-500/35">
                <span>💬</span> Ouvrir Pilot AI — posez vos questions
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </GlassCard>
          </motion.div>

          {/* Health Score */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.38 }}
          >
            <GlassCard className="p-5 h-full">
              <div className="mb-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-amber-400/70">Santé Business</p>
                <h3 className="mt-0.5 font-bold text-white text-lg">Score Financier</h3>
              </div>

              {/* Gauge */}
              <div className="flex justify-center my-2">
                {loading
                  ? <div className="h-48 w-48 animate-pulse rounded-full bg-white/5" />
                  : <HealthGauge score={healthScore} />
                }
              </div>

              {/* Factor breakdown */}
              <div className="mt-4 space-y-3">
                {healthFactors.map((f, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="w-32 text-[11px] text-white/50 flex-shrink-0">{f.label}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-white/8 overflow-hidden">
                      <motion.div
                        className="h-full rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${(f.score / f.max) * 100}%` }}
                        transition={{ delay: 0.8 + i * 0.1, duration: 0.7, ease: 'easeOut' }}
                        style={{ background: f.color }}
                      />
                    </div>
                    <span className="text-[11px] font-bold tabular-nums w-12 text-right"
                      style={{ color: f.color }}>
                      {f.score}/{f.max}
                    </span>
                  </div>
                ))}
              </div>

              <p className="mt-4 text-[10.5px] text-white/25 leading-relaxed">
                Score calculé à partir de votre marge, contrôle des dépenses, revenus et gestion des dettes.
              </p>
            </GlassCard>
          </motion.div>
        </div>

        {/* ──────────────────────────────────────────────────────────────── */}
        {/* 7. QUICK ACTIONS                                                 */}
        {/* ──────────────────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.35 }}
        >
          <SectionLabel color={C.cyan}>Actions Rapides</SectionLabel>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            <QAButton href="/sales"     color={C.emerald} label="Nouvelle vente"
              icon={<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>} />
            <QAButton href="/expenses"  color={C.red}     label="Ajouter dépense"
              icon={<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 13l-5 5m0 0l-5-5m5 5V6" />
              </svg>} />
            <QAButton href="/products"  color={C.blue}    label="Ajouter produit"
              icon={<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" />
              </svg>} />
            <QAButton href="/rapports"  color={C.purple}  label="Voir rapports"
              icon={<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>} />
            <QAButton href="/purchases" color={C.amber}   label="Nouvel achat"
              icon={<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>} />
            <QAButton href="/suppliers" color={C.pink}    label="Fournisseur"
              icon={<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0" />
              </svg>} />
          </div>
        </motion.div>

        {/* ──────────────────────────────────────────────────────────────── */}
        {/* 5. INVENTORY HEALTH + ACTIVITY FEED                             */}
        {/* ──────────────────────────────────────────────────────────────── */}
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Inventory Health */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
          >
            <GlassCard className="p-5 h-full">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-orange-400/70">Inventaire</p>
                  <h3 className="mt-0.5 font-bold text-white text-base">Santé du Stock</h3>
                </div>
                <Link href="/inventory"
                  className="text-[11px] font-semibold text-white/35 hover:text-white/70 transition">
                  Tout voir →
                </Link>
              </div>

              {/* Summary chips */}
              <div className="mb-4 flex gap-2 flex-wrap">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold
                                  ${outOfStockCount > 0 ? 'bg-red-500/15 text-red-400 border border-red-500/25'
                                                       : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${outOfStockCount > 0 ? 'bg-red-400 animate-pulse' : 'bg-emerald-400'}`}/>
                  {outOfStockCount} épuisé{outOfStockCount > 1 ? 's' : ''}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/25
                                 bg-amber-500/15 px-3 py-1 text-[11px] font-bold text-amber-400">
                  ⚠ {lowStockCount} stock bas
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/20
                                 bg-blue-500/10 px-3 py-1 text-[11px] font-bold text-blue-400">
                  📦 {products.length} produits
                </span>
              </div>

              {/* Product table */}
              <div className="space-y-2.5">
                {products.slice(0, 5).map((p, i) => (
                  <motion.div
                    key={p.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.5 + i * 0.08 }}
                    className="flex items-center gap-3 rounded-xl border border-white/[0.06]
                               bg-white/[0.025] px-3.5 py-2.5 hover:bg-white/[0.04] transition-colors"
                  >
                    <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-sm
                                     ${p.stock_quantity === 0 ? 'bg-red-500/15' : p.stock_quantity <= (p.reorder_point ?? 0) ? 'bg-amber-500/15' : 'bg-emerald-500/12'}`}>
                      {p.stock_quantity === 0 ? '🚫' : p.stock_quantity <= (p.reorder_point ?? 0) ? '⚠️' : '✅'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12.5px] font-semibold text-white/85 truncate">{p.name}</p>
                      <p className="text-[10px] text-white/35">{p.category ?? 'Produit'}</p>
                    </div>
                    <StockBar qty={p.stock_quantity} reorder={p.reorder_point ?? 0} />
                  </motion.div>
                ))}
              </div>

              {/* Stock value footer */}
              <div className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.025] p-3
                              flex items-center justify-between">
                <p className="text-[11px] text-white/40">Valeur totale stock</p>
                <p className="text-sm font-bold text-white">{fmt(totalStockValue)}</p>
              </div>
            </GlassCard>
          </motion.div>

          {/* Activity Feed */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.45 }}
          >
            <GlassCard className="p-5 h-full">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-blue-400/70">Activité</p>
                  <h3 className="mt-0.5 font-bold text-white text-base">Transactions Récentes</h3>
                </div>
                <button onClick={() => setShowFullLedger(v => !v)}
                  className="text-[11px] font-semibold text-white/35 hover:text-white/70 transition">
                  {showFullLedger ? 'Réduire' : 'Tout voir'} →
                </button>
              </div>

              <div className="space-y-2">
                {loading
                  ? Array.from({length:5}).map((_,i) => (
                      <div key={i} className="h-14 animate-pulse rounded-xl bg-white/5" />
                    ))
                  : recentLedger.slice(0, showFullLedger ? 10 : 6).map((row, i) => (
                      <motion.div
                        key={row.id}
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.5 + i * 0.07 }}
                        className="flex items-center gap-3 rounded-xl border border-white/[0.06]
                                   bg-white/[0.025] px-3.5 py-2.5 hover:bg-white/[0.04] transition-colors"
                      >
                        {/* Icon */}
                        <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-sm
                                         ${row.type === 'Vann' ? 'bg-emerald-500/15' : row.type === 'Dèt' ? 'bg-amber-500/15' : 'bg-red-500/15'}`}>
                          {row.type === 'Vann' ? '💰' : row.type === 'Dèt' ? '📝' : '💸'}
                        </div>
                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-[12.5px] font-semibold text-white/85 truncate">
                            {row.description}
                          </p>
                          <div className="mt-0.5 flex items-center gap-1.5">
                            <span className="text-[10px] text-white/30">{fmtDate(row.date)}</span>
                            <span className="text-white/15">·</span>
                            <MethodBadge method={row.payment_method} />
                          </div>
                        </div>
                        {/* Amount */}
                        <span className={`text-[13px] font-bold tabular-nums flex-shrink-0
                                          ${row.type === 'Vann' ? 'text-emerald-400' : 'text-red-400'}`}>
                          {row.type === 'Vann' ? '+' : '−'}{fmtK(row.amount)}
                        </span>
                      </motion.div>
                    ))
                }
              </div>

              {/* Summary */}
              {!loading && (
                <div className="mt-4 flex justify-between text-[11px] text-white/30 border-t border-white/[0.06] pt-3">
                  <span>Total entrées:
                    <span className="ml-1 font-semibold text-emerald-400">{fmt(salesRows.reduce((s,r) => s+r.amount, 0))}</span>
                  </span>
                  <span>Total sorties:
                    <span className="ml-1 font-semibold text-red-400">{fmt(expensesRows.reduce((s,r) => s+r.amount, 0))}</span>
                  </span>
                </div>
              )}
            </GlassCard>
          </motion.div>
        </div>

        {/* ──────────────────────────────────────────────────────────────── */}
        {/* 10. REPORT SHORTCUTS                                             */}
        {/* ──────────────────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.5 }}
        >
          <SectionLabel color={C.purple}>Rapports Financiers</SectionLabel>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <ReportCard href="/rapports" color={C.blue}
              title="État des résultats"
              subtitle="Profits & pertes du mois"
              icon={<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>} />
            <ReportCard href="/rapports" color={C.emerald}
              title="Bilan comptable"
              subtitle="Actif, passif, capitaux"
              icon={<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
              </svg>} />
            <ReportCard href="/rapports" color={C.cyan}
              title="Flux de trésorerie"
              subtitle="Entrées et sorties de cash"
              icon={<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
              </svg>} />
            <ReportCard href="/rapports" color={C.purple}
              title="Capitaux propres"
              subtitle="Évolution des fonds propres"
              icon={<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>} />
          </div>
        </motion.div>

        {/* ──────────────────────────────────────────────────────────────── */}
        {/* TRANSACTION LEDGER — Full Table                                  */}
        {/* ──────────────────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.55 }}
        >
          <GlassCard>
            {/* Header */}
            <div className="flex flex-col gap-3 border-b border-white/[0.06] px-5 py-4
                            sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="h-6 w-0.5 rounded-full bg-white/20" />
                <div>
                  <h3 className="font-bold text-white">Livre de Transactions</h3>
                  <p className="mt-0.5 text-[11px] text-white/30">
                    {loading ? '…' : `${filteredLedger.length} entrées · ${periodLabel}`}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {/* Search */}
                <div className="relative">
                  <svg className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/25"
                    fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input type="text" placeholder="Rechercher…" value={ledgerSearch}
                    onChange={e => { setLedgerSearch(e.target.value); setLedgerPage(1); }}
                    className="w-36 rounded-xl border border-white/8 bg-white/[0.04] py-2 pl-8 pr-3
                               text-[12px] text-white outline-none placeholder-white/20
                               transition focus:border-emerald-500/50 focus:bg-white/[0.06]"
                  />
                </div>
                <select value={ledgerType} onChange={e => { setLedgerType(e.target.value); setLedgerPage(1); }}
                  className="rounded-xl border border-white/8 bg-white/[0.04] px-3 py-2
                             text-[12px] text-white outline-none transition
                             focus:border-emerald-500/50">
                  <option value="">Tout type</option>
                  {['Vann','Acha','Dèt'].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                {(ledgerSearch || ledgerType) && (
                  <button onClick={() => { setLedgerSearch(''); setLedgerType(''); setLedgerPage(1); }}
                    className="rounded-xl border border-white/8 bg-white/[0.04] px-3 py-2
                               text-[12px] text-white/40 transition hover:text-white">
                    ✕
                  </button>
                )}
                <button
                  onClick={() => exportCSV(
                    ['Date','Description','Catégorie','Type','Méthode','Montant','Monnaie'],
                    filteredLedger.map(r => [r.date, r.description, r.category, r.type, r.payment_method, r.amount, r.currency]),
                    `transactions-${periodLabel.replace(/\s/g,'-')}.csv`
                  )}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-white/8
                             bg-white/[0.04] px-3 py-2 text-[12px] font-semibold text-white/40
                             transition hover:bg-white/[0.08] hover:text-white"
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  CSV
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[580px] text-sm">
                <thead>
                  <tr className="border-b border-white/[0.05]">
                    {['Date','Description','Type','Méthode','Montant'].map(h => (
                      <th key={h} className="px-5 py-3 text-left text-[10px] font-bold uppercase
                                             tracking-[0.12em] text-white/25 whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading
                    ? Array.from({length:5}).map((_,i) => (
                        <tr key={i} className="border-b border-white/[0.04]">
                          {Array.from({length:5}).map((_,j) => (
                            <td key={j} className="px-5 py-3.5">
                              <div className="h-3 animate-pulse rounded-full bg-white/[0.06]"
                                style={{ width: `${40 + ((i*37+j*19) % 45)}%` }} />
                            </td>
                          ))}
                        </tr>
                      ))
                    : paginatedLedger.length === 0
                    ? <tr><td colSpan={5} className="px-5 py-12 text-center text-sm text-white/20">
                        Aucune transaction pour cette période.
                      </td></tr>
                    : paginatedLedger.map((row, i) => (
                        <tr key={row.id}
                          className={`border-b border-white/[0.04] transition-colors
                                      hover:bg-white/[0.03] ${i % 2 === 0 ? '' : 'bg-white/[0.01]'}`}>
                          <td className="px-5 py-3.5 font-mono text-[11px] text-white/35 whitespace-nowrap">
                            {fmtDate(row.date)}
                          </td>
                          <td className="px-5 py-3.5 max-w-[200px] truncate text-[13px] text-white/75"
                            title={row.description}>
                            {row.description}
                          </td>
                          <td className="px-5 py-3.5"><TypeBadge type={row.type} /></td>
                          <td className="px-5 py-3.5"><MethodBadge method={row.payment_method} /></td>
                          <td className={`px-5 py-3.5 text-right font-bold tabular-nums text-[13px] whitespace-nowrap
                                          ${row.type === 'Vann' ? 'text-emerald-400' : 'text-red-400'}`}>
                            {row.type === 'Vann' ? '+' : '−'}{fmt(row.amount, row.currency)}
                          </td>
                        </tr>
                      ))
                  }
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {ledgerPageCount > 1 && (
              <div className="flex items-center justify-between border-t border-white/[0.06] px-5 py-3">
                <span className="text-[11px] text-white/25">
                  {(ledgerPage-1)*PAGE_SIZE+1}–{Math.min(ledgerPage*PAGE_SIZE, filteredLedger.length)} / {filteredLedger.length}
                </span>
                <div className="flex gap-1">
                  <button onClick={() => setLedgerPage(p => Math.max(1, p-1))} disabled={ledgerPage === 1}
                    className="rounded-lg px-3 py-1.5 text-[11px] text-white/40 transition
                               hover:bg-white/8 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed">
                    ← Précédent
                  </button>
                  {Array.from({length: Math.min(ledgerPageCount, 5)}, (_,i) => i+1).map(pg => (
                    <button key={pg} onClick={() => setLedgerPage(pg)}
                      className={`rounded-lg px-3 py-1.5 text-[11px] transition ${
                        ledgerPage === pg
                          ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/25'
                          : 'text-white/40 hover:bg-white/8 hover:text-white'
                      }`}>
                      {pg}
                    </button>
                  ))}
                  <button onClick={() => setLedgerPage(p => Math.min(ledgerPageCount, p+1))} disabled={ledgerPage === ledgerPageCount}
                    className="rounded-lg px-3 py-1.5 text-[11px] text-white/40 transition
                               hover:bg-white/8 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed">
                    Suivant →
                  </button>
                </div>
              </div>
            )}

            {/* Footer totals */}
            <div className="border-t border-white/[0.06] px-5 py-3 flex flex-wrap gap-x-8 gap-y-1 text-[11px] text-white/30">
              <span>Cash In: <span className="font-bold text-blue-400">{fmt(totals.cashIn)}</span></span>
              <span>Cash Out: <span className="font-bold text-red-400">{fmt(totals.cashOut)}</span></span>
              <span>Solde: <span className={`font-bold ${totals.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmt(totals.profit)}</span></span>
              <span>Dettes: <span className="font-bold text-amber-400">{fmt(totals.debtTotal)}</span></span>
            </div>
          </GlassCard>
        </motion.div>

        {/* Bottom padding for mobile nav */}
        <div className="h-4" />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE EXPORT
// ─────────────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <DashboardInner />
    </ProtectedRoute>
  );
}
