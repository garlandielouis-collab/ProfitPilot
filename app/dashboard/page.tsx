'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { motion } from 'framer-motion';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import { CockpitWelcome } from '../../components/CockpitWelcome';
import { useLanguage } from '../../components/LanguageWrapper';

import {
  Area, AreaChart, Bar, BarChart,
  CartesianGrid, Cell, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
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
  grid:    'rgba(0,0,0,0.06)',
  axis:    'rgba(0,0,0,0.15)',
  tick:    'rgba(0,0,0,0.45)',
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

function HealthGauge({ score, label }: { score: number; label: string }) {
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

  return (
    <svg viewBox="0 0 200 200" className="h-48 w-48 drop-shadow-2xl">
      {/* Track */}
      <path d={arc(135, 405)} fill="none" stroke="rgba(0,0,0,0.08)"
        strokeWidth={sw} strokeLinecap="round" />
      {/* Progress */}
      <path d={arc(135, Math.min(endAngle, 404.5))} fill="none" stroke={col}
        strokeWidth={sw} strokeLinecap="round"
        style={{ filter: `drop-shadow(0 0 10px ${col}60)` }} />
      {/* Score text */}
      <text x="100" y="100" textAnchor="middle" fill="#001F3F"
        fontSize="34" fontWeight="800" style={{ fontFamily: 'Inter, sans-serif' }}>
        {score}
      </text>
      <text x="100" y="122" textAnchor="middle" fill="#64748B"
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
  const { t } = useLanguage();
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: index * 0.07, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
      className="relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]
                 p-5 flex flex-col gap-3 group
                 hover:border-slate-300 hover:bg-slate-50 transition-all duration-300"
    >
      {/* Ambient glow */}
      <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full blur-3xl opacity-20 transition-opacity group-hover:opacity-35"
        style={{ background: color }} />

      {/* Top row */}
      <div className="flex items-start justify-between">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.15em] text-[var(--color-muted)]">
          {label}
        </span>
        <span className="flex h-8 w-8 items-center justify-center rounded-xl opacity-80"
          style={{ background: `${color}22`, color }}>
          {icon}
        </span>
      </div>

      {/* Value */}
      {loading ? (
        <div className="h-8 w-32 animate-pulse rounded-xl bg-slate-100" />
      ) : (
        <p className="text-[1.55rem] font-extrabold tracking-tight text-[#001F3F] leading-none">
          {value}
        </p>
      )}

      {/* Bottom row */}
      <div className="flex items-end justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          {!loading && trend !== null && (
            <span className={`flex items-center gap-1 text-[11px] font-bold ${trend >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              <span>{trend >= 0 ? '↗' : '↘'}</span>
              {Math.abs(trend).toFixed(1)}% {t({ fr: 'vs mois passé', ht: 'vs mwa pase a' })}
            </span>
          )}
          {!loading && (
            <span className="text-[10px] text-[var(--color-muted)]">{sub}</span>
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
    <div className="min-w-[170px] space-y-2 rounded-2xl border border-[var(--color-border)] bg-white
                    p-3.5 text-xs shadow-2xl">
      <p className="mb-1.5 font-semibold uppercase tracking-wider text-[var(--color-muted)]">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-5">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: p.color ?? p.fill }} />
            <span className="text-[var(--color-muted)]">{p.name}</span>
          </div>
          <span className="font-bold tabular-nums text-[var(--color-text)]">{fmt(p.value)}</span>
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
    <div className={`rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] ${className}`}>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TYPE BADGE
// ─────────────────────────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: LedgerRow['type'] }) {
  const cfg: Record<string, string> = {
    Vann: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    Acha: 'bg-red-100    text-red-600    border-red-200',
    Dèt:  'bg-amber-100  text-amber-700  border-amber-200',
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
    Cash:      'bg-blue-100 text-blue-700',
    MonCash:   'bg-purple-100 text-purple-700',
    Natcash:   'bg-cyan-100 text-cyan-700',
    Card:      'bg-pink-100 text-pink-700',
    Espèces:   'bg-blue-100 text-blue-700',
    'À Crédit':'bg-amber-100 text-amber-700',
  };
  return (
    <span className={`inline-flex items-center rounded-lg px-2 py-0.5 text-[10px] font-semibold
                      ${cfg[method] ?? 'bg-slate-100 text-slate-500'}`}>
      {method}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LEGEND DOT
// ─────────────────────────────────────────────────────────────────────────────

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-[var(--color-muted)]">
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
        <div key={i} className="flex-1 animate-pulse rounded-t-lg bg-slate-100"
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
    success: { bg: 'bg-emerald-50', border: 'border-emerald-200', dot: 'bg-emerald-500', text: 'text-emerald-700' },
    info:    { bg: 'bg-blue-50',    border: 'border-blue-200',    dot: 'bg-blue-500',    text: 'text-blue-700'    },
    warning: { bg: 'bg-amber-50',   border: 'border-amber-200',   dot: 'bg-amber-500',   text: 'text-amber-700'   },
    danger:  { bg: 'bg-red-50',     border: 'border-red-200',     dot: 'bg-red-500',     text: 'text-red-600'     },
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
        <p className="text-[12.5px] text-[var(--color-text)] leading-relaxed">{insight.text}</p>
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

function StockBar({ qty, reorder, outOfStockT, lowT }: { qty: number; reorder: number; outOfStockT: string; lowT: string }) {
  const pct = reorder > 0 ? Math.min(100, (qty / (reorder * 2)) * 100) : 50;
  const col = qty === 0 ? C.red : qty <= reorder ? C.amber : C.emerald;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: col }} />
      </div>
      <span className="text-[11px] tabular-nums font-semibold" style={{ color: col }}>
        {qty === 0 ? outOfStockT : qty <= reorder ? `${qty} (${lowT})` : qty}
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
        className="flex flex-col items-center gap-2 rounded-2xl border border-[var(--color-border)]
                   bg-[var(--color-surface)] p-4 text-center cursor-pointer group
                   hover:border-slate-300 hover:bg-slate-100 transition-colors"
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl transition-all duration-200
                         group-hover:scale-110"
          style={{ background: `${color}20`, color }}>
          {icon}
        </span>
        <span className="text-[11px] font-semibold text-[var(--color-muted)] group-hover:text-[var(--color-text)] transition-colors leading-tight">
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
        className="flex items-center gap-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]
                   p-4 cursor-pointer hover:border-slate-300 hover:bg-slate-50
                   transition-all group"
      >
        <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl transition-transform group-hover:scale-105"
          style={{ background: `${color}18`, color }}>
          {icon}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[var(--color-text)] group-hover:text-[#001F3F] transition-colors">{title}</p>
          <p className="text-[11px] text-[var(--color-muted)] mt-0.5">{subtitle}</p>
        </div>
        <svg className="h-4 w-4 flex-shrink-0 text-slate-300 group-hover:text-[var(--color-muted)] group-hover:translate-x-0.5 transition-all"
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
      <h2 className="text-base font-bold text-[#001F3F]">{children}</h2>
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
  const { t } = useLanguage();
  const greeting     = hour < 12 ? t({ fr: 'Bonjour', ht: 'Bonjou' }) : hour < 18 ? t({ fr: 'Bonsoir', ht: 'Bonswa' }) : t({ fr: 'Bonsoir', ht: 'Bonswa' });
  const searchParams  = useSearchParams();
  const showWelcome   = searchParams.get('welcome') === '1';
  const [companyName, setCompanyName] = useState(t({ fr: 'votre entreprise', ht: 'antrepriz ou a' }));
  useEffect(() => {
    const stored = localStorage.getItem('pp_company');
    if (stored) setCompanyName(stored);
  }, []);

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
    // Batch both calls in parallel
    supabase.auth.getUser().then(({ data: userData }: any) => {
      const meta = userData?.user?.user_metadata;
      setUserName(meta?.full_name ?? meta?.name ?? userData?.user?.email?.split('@')[0] ?? 'Entrepreneur');
      const uid = userData?.user?.id;
      if (!uid) return;
      supabase
        .from('products')
        .select('id,name,stock_quantity,sale_price,purchase_price,category')
        .eq('user_id', uid)
        .then(({ data: prodData, error: prodErr }: any) => {
          if (prodErr) console.error('[dashboard] products error:', prodErr.message);
          if (prodData && prodData.length > 0) {
            setProducts(prodData.map((p: any) => ({
              ...p,
              selling_price: p.sale_price,
              reorder_point: 5,
            })));
          }
        });
    });
  }, []);

  useEffect(() => {
    load(periodMode, monthRange[0], monthRange[1]);
  }, [periodMode, monthRange[0], monthRange[1], load]);

  // ── Derived data ─────────────────────────────────────────────────────────────
  const marginPct = totals.cashIn > 0 ? (totals.profit / totals.cashIn) * 100 : 0;
  const healthScore = computeHealthScore(totals.cashIn, totals.cashOut, totals.profit, totals.debtTotal);
  const healthLabel = healthScore >= 70 ? t({ fr: 'EXCELLENT', ht: 'EKSELAN' }) : healthScore >= 40 ? t({ fr: 'MOYEN', ht: 'MOYEN' }) : t({ fr: 'FAIBLE', ht: 'FÈB' });

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

  const { lowStockCount, outOfStockCount, totalStockValue } = useMemo(() => ({
    lowStockCount:   products.filter(p => p.stock_quantity <= (p.reorder_point ?? 0)).length,
    outOfStockCount: products.filter(p => p.stock_quantity === 0).length,
    totalStockValue: products.reduce((s, p) => s + (p.stock_quantity * ((p as any).purchase_price ?? p.selling_price ?? 0)), 0),
  }), [products]);

  // AI Insights (computed from real data)
  const aiInsights: Insight[] = useMemo(() => {
    const insights: Insight[] = [];

    if (marginPct >= 20) {
      insights.push({ type:'success', icon:'🚀',
        text: t({ fr: `Votre marge de profitabilité est excellente — ${marginPct.toFixed(1)}% — votre entreprise est en bonne santé financière.`, ht: `Maji pwofitabilite w ekselan — ${marginPct.toFixed(1)}% — biznis ou an bòn sante finansyè.` }),
        action: t({ fr: 'Voir rapport complet', ht: 'Wè rapò konplè' })
      });
    } else if (marginPct >= 5) {
      insights.push({ type:'info', icon:'📊',
        text: t({ fr: `Votre marge est de ${marginPct.toFixed(1)}% — travaillez sur la réduction des dépenses pour améliorer votre profit.`, ht: `Maj ou a ${marginPct.toFixed(1)}% — travay sou redwi depans yo pou amelyore pwofi ou.` }),
        action: t({ fr: 'Analyser les dépenses', ht: 'Analize depans' })
      });
    } else {
      insights.push({ type:'danger', icon:'🔴',
        text: t({ fr: `Alerte : votre marge est de ${marginPct.toFixed(1)}%. Les dépenses dépassent les revenus. Agissez immédiatement.`, ht: `Alèt : maj ou a ${marginPct.toFixed(1)}%. Depans yo depase reveni yo. Pran aksyon tousuit.` }),
        action: t({ fr: 'Voir les dépenses', ht: 'Wè depans yo' })
      });
    }

    if (totals.debtTotal > totals.cashIn * 0.5 && totals.debtTotal > 0) {
      insights.push({ type:'warning', icon:'⚠️',
        text: t({ fr: `Vos dettes représentent ${(totals.debtTotal / totals.cashIn * 100).toFixed(0)}% de vos revenus. Pensez à réduire vos charges de crédit.`, ht: `Dèt ou yo reprezante ${(totals.debtTotal / totals.cashIn * 100).toFixed(0)}% reveni ou. Panse redwi chaj kredi yo.` }),
        action: t({ fr: 'Gérer les dettes', ht: 'Jere dèt yo' })
      });
    }

    const byCategory: Record<string, number> = {};
    for (const r of salesRows) {
      byCategory[r.category] = (byCategory[r.category] ?? 0) + r.amount;
    }
    const top = Object.entries(byCategory).sort(([,a],[,b]) => b - a)[0];
    if (top) {
      insights.push({ type:'info', icon:'⭐',
        text: t({ fr: `Meilleur client / catégorie pour cette période : "${top[0]}" avec ${fmt(top[1])}.`, ht: `Miyò kliyan / kategori ou pou peryòd sa a : "${top[0]}" ak ${fmt(top[1])}.` }) });
    }

    if (outOfStockCount > 0) {
      insights.push({ type:'warning', icon:'📦',
        text: t({ fr: `${outOfStockCount} produits sont en rupture de stock. Réapprovisionnez-les immédiatement pour éviter de perdre des ventes.`, ht: `${outOfStockCount} pwodwi rive zewo nan stòk. Renouvle yo tousuit pou evite pèdi vant.` }),
        action: t({ fr: "Voir l'inventaire", ht: 'Wè envantè' })
      });
    }

    if (totals.cashIn > 0 && totals.profit > 0) {
      insights.push({ type:'success', icon:'💰',
        text: t({ fr: `Votre profit net pour cette période : ${fmt(totals.profit)}. Continuez comme ça !`, ht: `Pwofi nèt ou pou peryòd sa a : ${fmt(totals.profit)}. Kontinye konsa !` })
      });
    }

    return insights.slice(0, 5);
  }, [marginPct, totals, salesRows, outOfStockCount]);

  // Health score breakdown
  const healthFactors = [
    { label: t({ fr: 'Pwofitabilite', ht: 'Pwofitabilite' }), score: Math.round(Math.min(30, Math.max(0, marginPct >= 30 ? 30 : marginPct >= 20 ? 24 : marginPct >= 10 ? 15 : marginPct >= 5 ? 8 : 0))), max: 30, color: C.emerald },
    { label: t({ fr: 'Revenu', ht: 'Revni' }),        score: totals.cashIn > 0 ? 20 : 0, max: 20, color: C.blue },
    { label: t({ fr: 'Kontrôle des dépenses', ht: 'Kontwòl depans' }),score: Math.round(totals.cashIn > 0 ? (totals.cashOut / totals.cashIn < 0.60 ? 25 : totals.cashOut / totals.cashIn < 0.70 ? 20 : totals.cashOut / totals.cashIn < 0.80 ? 12 : totals.cashOut / totals.cashIn < 0.90 ? 6 : 0) : 0), max: 25, color: C.purple },
    { label: t({ fr: 'Gestion des dettes', ht: 'Jestyon dèt' }),   score: Math.round(totals.cashIn > 0 ? (totals.debtTotal / totals.cashIn < 0.20 ? 25 : totals.debtTotal / totals.cashIn < 0.40 ? 18 : totals.debtTotal / totals.cashIn < 0.60 ? 10 : totals.debtTotal / totals.cashIn < 0.80 ? 4 : 0) : 0), max: 25, color: C.amber },
  ];

  // ── RENDER ───────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
      {/* ── Cinematic welcome overlay (first-run after onboarding) ── */}
      {showWelcome && <CockpitWelcome companyName={companyName} />}
      {/* ──────────────────────────────────────────────────────────────── */}
      {/* 1. HEADER                                                        */}
      {/* ──────────────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden">
        {/* Ambient gradient behind header */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-emerald-50/40 via-transparent to-blue-50/20" />
        <div className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full bg-emerald-100/50 blur-3xl" />
        <div className="pointer-events-none absolute -top-16 right-0 h-80 w-80 rounded-full bg-blue-100/50 blur-3xl" />

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
                  {t({ fr: 'ProfitPilot · Tableau de bord', ht: 'ProfitPilot · Tablo debò' })}
                </p>
                <h1 className="mt-2 text-2xl font-extrabold tracking-tight md:text-3xl lg:text-4xl">
                  {greeting},{' '}
                  <span className="bg-gradient-to-r from-[#001F3F] to-[#001F3F]/60 bg-clip-text text-transparent">
                    {userName || t({ fr: 'Entrepreneur', ht: 'Antreprenè' })} 👋
                  </span>
                </h1>
                <p className="mt-1.5 text-sm text-[var(--color-muted)]">
                   {t({ fr: 'Voici les performances de votre business', ht: 'Men pèfòmans biznis ou a' })} — {periodLabel}
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
                   {t({ fr: 'Données démo', ht: 'Done Demo' })}
                </motion.span>
              )}
              <Link href="/ai-assistant"
                className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30
                           bg-emerald-500/10 px-4 py-2 text-[12px] font-semibold text-emerald-400
                           transition hover:bg-emerald-500/20 hover:border-emerald-500/50">
                <span className="text-base leading-none">🤖</span>
                {t({ fr: 'Pilot AI', ht: 'Pilot AI' })}
              </Link>
              <Link href="/settings"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--color-border)]
                           bg-[var(--color-surface)] text-[var(--color-muted)] transition hover:bg-slate-100 hover:text-[var(--color-text)]">
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
          <div className="inline-flex rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-1 gap-1">
            {(['mois','trimestre','semestre'] as PeriodMode[]).map(m => (
              <button key={m} onClick={() => setPeriodMode(m)}
                className={`rounded-xl px-4 py-2 text-[12px] font-semibold capitalize transition-all duration-200 ${
                  periodMode === m
                    ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30'
                    : 'text-[var(--color-muted)] hover:bg-slate-100 hover:text-[var(--color-text)]'
                }`}>
                {m === 'mois' ? t({ fr: '📅 Mois', ht: '📅 Mwa' }) : m === 'trimestre' ? t({ fr: '📊 Trimestre', ht: '📊 Trimès' }) : t({ fr: '📈 Semestre', ht: '📈 Semès' })}
              </button>
            ))}
          </div>

          <div className="flex gap-1 overflow-x-auto rounded-2xl border border-[var(--color-border)]
                          bg-[var(--color-surface)] p-1.5 scrollbar-none">
            {periodMode === 'mois' && MONTHS_HT.map((m, i) => (
              <button key={i} onClick={() => setSelectedMonth(i)}
                className={`flex-shrink-0 rounded-xl px-3.5 py-2 text-[11.5px] font-semibold transition-all ${
                  selectedMonth === i
                    ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/30'
                    : 'text-[var(--color-muted)] hover:bg-slate-100 hover:text-[var(--color-text)]'
                }`}>
                {m.slice(0, 3)}
              </button>
            ))}
            {periodMode === 'trimestre' && QUARTERS.map((q, i) => (
              <button key={i} onClick={() => setSelectedQuarter(i)}
                className={`flex-shrink-0 rounded-xl px-5 py-2 text-[11.5px] font-semibold transition-all ${
                  selectedQuarter === i
                    ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                    : 'text-[var(--color-muted)] hover:bg-slate-100 hover:text-[var(--color-text)]'
                }`}>
                {q.label} <span className="opacity-55">({q.name})</span>
              </button>
            ))}
            {periodMode === 'semestre' && SEMESTERS.map((s, i) => (
              <button key={i} onClick={() => setSelectedSemester(i)}
                className={`flex-shrink-0 rounded-xl px-8 py-2 text-[11.5px] font-semibold transition-all ${
                  selectedSemester === i
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                    : 'text-[var(--color-muted)] hover:bg-slate-100 hover:text-[var(--color-text)]'
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
          <KPICard index={0} label={t({ fr: 'Revenus du mois', ht: 'Revni mwa a' })} value={loading ? t({ fr: '…', ht: '…' }) : fmt(totals.cashIn)}
            sub={t({ fr: 'Total des ventes', ht: 'Total lavant yo' })} trend={null} color={C.blue}
            sparkData={spRevenue} sparkId="rev" loading={loading}
            icon={<svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11l5-5m0 0l5 5m-5-5v12"/>
            </svg>}
          />
          <KPICard index={1} label={t({ fr: 'Profit net', ht: 'Pwofi nèt' })} value={loading ? '…' : fmt(totals.profit)}
            sub={loading ? '' : `${t({ fr: 'Marge', ht: 'Maj' })} ${marginPct.toFixed(1)}%`}
            trend={null} color={totals.profit >= 0 ? C.emerald : C.red}
            sparkData={spProfit} sparkId="pft" loading={loading}
            icon={<svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
            </svg>}
          />
          <KPICard index={2} label={t({ fr: 'Dépenses', ht: 'Depans' })} value={loading ? '…' : fmt(totals.cashOut)}
            sub={t({ fr: 'Achats + charges', ht: 'Acha + chaj' })} trend={null} color={C.red}
            sparkData={spExpenses} sparkId="exp" loading={loading}
            icon={<svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 13l-5 5m0 0l-5-5m5 5V6"/>
            </svg>}
          />
          <KPICard index={3} label={t({ fr: 'Trésorerie', ht: 'Lajan kach' })} value={loading ? '…' : fmt(Math.max(0, totals.profit))}
            sub={t({ fr: 'Solde disponible', ht: 'Sòd disponib' })} trend={null}
            color={totals.profit >= 0 ? C.cyan : C.red}
            sparkData={spCashflow} sparkId="cf" loading={loading}
            icon={<svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/>
            </svg>}
          />
          <KPICard index={4} label={t({ fr: 'Dettes fournisseurs', ht: 'Dèt founisè' })} value={loading ? '…' : fmt(totals.debtTotal)}
            sub={t({ fr: 'À crédit', ht: 'Ak kredi' })} trend={null} color={C.amber}
            sparkData={Array.from({length:12},(_,i)=>totals.debtTotal*(0.5+Math.sin(i)*0.3))}
            sparkId="dbt" loading={loading}
            icon={<svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>}
          />
          <KPICard index={5} label={t({ fr: 'Produits en rupture', ht: 'Pwodwi fini nan stock' })} value={String(outOfStockCount)}
            sub={t({ fr: `${lowStockCount} en stock bas`, ht: `${lowStockCount} stock ba` })} trend={null}
            color={outOfStockCount > 0 ? C.red : C.emerald}
            sparkData={Array.from({length:12},(_,i)=>Math.max(0,outOfStockCount+Math.sin(i)*1.5))}
            sparkId="stk" loading={loading}
            icon={<svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/>
            </svg>}
          />
          <KPICard index={6} label={t({ fr: 'Transactions', ht: 'Transaksyon' })} value={loading ? '…' : String(ledger.length)}
            sub={t({ fr: `${salesRows.length} ventes · ${expensesRows.length} dépenses`, ht: `${salesRows.length} vant · ${expensesRows.length} depans` })}
            trend={null} color={C.purple}
            sparkData={Array.from({length:12},(_,i)=>4+Math.sin(i*0.7)*3+Math.random()*2)}
            sparkId="txn" loading={loading}
            icon={<svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/>
            </svg>}
          />
          <KPICard index={7} label={t({ fr: 'Valeur stock total', ht: 'Valè stock total' })} value={fmtK(totalStockValue) + ' HTG'}
            sub={t({ fr: `${products.length} produits`, ht: `${products.length} pwodwi` })} trend={null} color={C.pink}
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
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-400/70">{t({ fr: 'Cashflow', ht: 'Flus kach' })}</p>
                <h3 className="mt-0.5 font-bold text-[#001F3F] text-lg">{t({ fr: 'Évolution du flux de trésorerie', ht: 'Evolisyon flus lajan kach la' })}</h3>
                <p className="text-[11px] text-[var(--color-muted)] mt-0.5">{t({ fr: 'Entrées vs sorties', ht: 'Antre vs sòti' })} · {periodLabel}</p>
              </div>
              <div className="flex items-center gap-4">
                <LegendDot color={C.blue}    label={t({ fr: 'Cash In', ht: 'Antre Kach' })} />
                <LegendDot color={C.red}     label={t({ fr: 'Cash Out', ht: 'Sòti Kach' })} />
                <LegendDot color={C.emerald} label={t({ fr: 'Profit', ht: 'Pwofi' })} />
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
                      cursor={{ stroke: 'rgba(0,0,0,0.08)', strokeWidth: 1 }} />
                    <Area type="monotone" dataKey="cashIn"  name={t({ fr: 'Cash In', ht: 'Antre Kach' })}
                      stroke={C.blue}    strokeWidth={2}   fill="url(#gIn)"
                      dot={false} activeDot={{ r: 5, fill: C.blue,    stroke:'#fff', strokeWidth:2 }} />
                    <Area type="monotone" dataKey="cashOut" name={t({ fr: 'Cash Out', ht: 'Sòti Kach' })}
                      stroke={C.red}     strokeWidth={2}   fill="url(#gOut)"
                      dot={false} activeDot={{ r: 5, fill: C.red,     stroke:'#fff', strokeWidth:2 }} />
                    <Area type="monotone" dataKey="profit"  name={t({ fr: 'Profit', ht: 'Pwofi' })}
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
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-purple-400/70">{t({ fr: 'Performance', ht: 'Pèfòmans' })}</p>
                <h3 className="mt-0.5 font-bold text-[#001F3F] text-lg">{t({ fr: 'Revenus vs Dépenses par mois', ht: 'Revni vs Depans pa mwa' })}</h3>
                <p className="text-[11px] text-[var(--color-muted)] mt-0.5">{periodLabel}</p>
              </div>

              {loading ? <ChartSkel h="h-56 md:h-64" /> : bilanRows.length === 0 ? (
                <div className="flex h-56 items-center justify-center text-sm text-[var(--color-muted)]">
                  {t({ fr: 'Aucune donnée pour cette période.', ht: 'Pa gen done pou peryòd sa a.' })}
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
                        cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
                      <ReferenceLine y={0} stroke="rgba(0,0,0,0.1)" />
                      <Bar dataKey="revenue"  name={t({ fr: 'Revenu', ht: 'Revni' })}  fill={C.blue}   radius={[5,5,0,0]} maxBarSize={42} />
                      <Bar dataKey="expenses" name={t({ fr: 'Dépenses', ht: 'Depans' })} fill={C.red}   radius={[5,5,0,0]} maxBarSize={42} />
                      <Bar dataKey="profit"   name={t({ fr: 'Profit', ht: 'Pwofi' })}   radius={[5,5,0,0]} maxBarSize={42}>
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
                  <LegendDot color={C.blue}    label={t({ fr: 'Revenu', ht: 'Revni' })} />
                  <LegendDot color={C.red}     label={t({ fr: 'Dépenses', ht: 'Depans' })} />
                  <LegendDot color={C.emerald} label={t({ fr: 'Profit +', ht: 'Pwofi +' })} />
                </div>
              )}
            </GlassCard>
          </motion.div>

          {/* Side metrics */}
          <div className="flex flex-col gap-3">
            {/* Margin */}
            <GlassCard className="p-4 flex flex-col gap-3">
              <p className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-[var(--color-muted)]">{t({ fr: 'Marge Profit', ht: 'Maj Pwofi' })}</p>
              {loading ? <div className="h-8 w-20 animate-pulse rounded-xl bg-slate-100" /> : (
                <>
                  <p className={`text-3xl font-extrabold tracking-tight ${
                    marginPct >= 20 ? 'text-emerald-400' : marginPct >= 5 ? 'text-amber-400' : 'text-red-400'
                  }`}>
                    {marginPct.toFixed(1)}<span className="text-lg font-medium opacity-60">%</span>
                  </p>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <motion.div className="h-full rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(100, Math.abs(marginPct))}%` }}
                      transition={{ duration: 1, ease: 'easeOut' }}
                      style={{ background: marginPct >= 20 ? C.emerald : marginPct >= 5 ? C.amber : C.red }}
                    />
                  </div>
                  <p className="text-[10px] text-[var(--color-muted)]">{t({ fr: 'Profit ÷ Revenu total', ht: 'Pwofi ÷ Revni total' })}</p>
                </>
              )}
            </GlassCard>

            {/* Cashflow balance */}
            <GlassCard className="p-4 flex flex-col gap-2">
              <p className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-[var(--color-muted)]">{t({ fr: 'Solde Net', ht: 'Sòd Nèt' })}</p>
              {loading ? <div className="h-8 w-24 animate-pulse rounded-xl bg-slate-100" /> : (
                <>
                  <p className={`text-2xl font-extrabold tracking-tight ${totals.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {totals.profit >= 0 ? '+' : ''}{fmtK(totals.profit)}
                    <span className="text-xs font-medium text-[var(--color-muted)] ml-1">HTG</span>
                  </p>
                  <p className="text-[10px] text-[var(--color-muted)]">{t({ fr: 'Cash In − Cash Out', ht: 'Antre Kach − Sòti Kach' })}</p>
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
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : marginPct >= 5
                    ? 'border-amber-200 bg-amber-50 text-amber-700'
                    : 'border-red-200 bg-red-50 text-red-600'
                }`}>
                <span className="font-bold">
                  {marginPct >= 20 ? t({ fr: '✅ Excellent', ht: '✅ Ekselan' }) : marginPct >= 5 ? t({ fr: '⚠️ Moyen', ht: '⚠️ Mwayen' }) : t({ fr: '🔴 Alerte', ht: '🔴 Alèt' })}
                </span>
                <p className="mt-1 text-[11px] opacity-80">
                  {marginPct >= 20
                    ? t({ fr: 'Performance financière exceptionnelle.', ht: 'Pèfòmans finansye eksepsyonèl.' })
                    : marginPct >= 5
                    ? t({ fr: 'Marge acceptable, surveillez vos charges.', ht: 'Maj akseptab, siveye chaj ou yo.' })
                    : t({ fr: 'Marge critique — réduisez les dépenses.', ht: 'Maj kritik — redwi depans yo.' })}
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
                                border border-[var(--color-border)]">
                  <span className="text-xl">🤖</span>
                  <span className="absolute -right-1 -top-1 h-3.5 w-3.5 rounded-full bg-emerald-400
                                   border-2 border-white animate-pulse" />
                </div>
                <div>
                  <h3 className="font-bold text-[#001F3F]">{t({ fr: 'Pilot AI', ht: 'Pilot AI' })}</h3>
                  <p className="text-[11px] text-[var(--color-muted)]">{t({ fr: 'Analyse automatique de votre business', ht: 'Analiz otomatik biznis ou a' })}</p>
                </div>
                <span className="ml-auto inline-flex items-center gap-1.5 rounded-full
                                 border border-emerald-500/20 bg-emerald-500/10
                                 px-2.5 py-1 text-[10px] font-semibold text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {t({ fr: 'En ligne', ht: 'An liy' })}
                </span>
              </div>

              {/* Insights */}
              <div className="space-y-3">
                {loading
                  ? Array.from({length:3}).map((_,i) => (
                      <div key={i} className="h-16 animate-pulse rounded-xl bg-[var(--color-surface)]" />
                    ))
                  : aiInsights.map((ins, i) => <AIInsightCard key={i} insight={ins} idx={i} />)
                }
              </div>

              {/* Link to full AI */}
              <Link href="/ai-assistant"
                className="mt-4 flex items-center justify-center gap-2 rounded-2xl border border-emerald-500/20
                           bg-emerald-500/8 py-3 text-[12px] font-semibold text-emerald-400
                           transition hover:bg-emerald-100 hover:border-emerald-300">
                <span>💬</span> {t({ fr: 'Ouvrir Pilot AI — posez vos questions', ht: 'Louvri Pilot AI — poze kesyon ou yo' })}
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
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-amber-400/70">{t({ fr: 'Santé Business', ht: 'Sante Biznis' })}</p>
                <h3 className="mt-0.5 font-bold text-[#001F3F] text-lg">{t({ fr: 'Score Financier', ht: 'Skò Finansye' })}</h3>
              </div>

              {/* Gauge */}
              <div className="flex justify-center my-2">
                {loading
                  ? <div className="h-48 w-48 animate-pulse rounded-full bg-[var(--color-surface)]" />
                  : <HealthGauge score={healthScore} label={healthLabel} />
                }
              </div>

              {/* Factor breakdown */}
              <div className="mt-4 space-y-3">
                {healthFactors.map((f, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="w-32 text-[11px] text-[var(--color-muted)] flex-shrink-0">{f.label}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
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

              <p className="mt-4 text-[10.5px] text-[var(--color-muted)] leading-relaxed">
                {t({ fr: 'Score calculé à partir de votre marge, contrôle des dépenses, revenus et gestion des dettes.', ht: 'Skò kalkile apati maj ou, kontwòl depans, revni ak jesyon dèt.' })}
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
          <SectionLabel color={C.cyan}>{t({ fr: 'Actions Rapides', ht: 'Aksyon Rapid' })}</SectionLabel>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            <QAButton href="/sales"     color={C.emerald} label={t({ fr: 'Nouvelle vente', ht: 'Nouvo vant' })}
              icon={<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>} />
            <QAButton href="/expenses"  color={C.red}     label={t({ fr: 'Ajouter dépense', ht: 'Ajoute depans' })}
              icon={<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 13l-5 5m0 0l-5-5m5 5V6" />
              </svg>} />
            <QAButton href="/products"  color={C.blue}    label={t({ fr: 'Ajouter produit', ht: 'Ajoute pwodui' })}
              icon={<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" />
              </svg>} />
            <QAButton href="/rapports"  color={C.purple}  label={t({ fr: 'Voir rapports', ht: 'Wè rapò' })}
              icon={<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>} />
            <QAButton href="/purchases" color={C.amber}   label={t({ fr: 'Nouvel achat', ht: 'Nouvo acha' })}
              icon={<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>} />
            <QAButton href="/suppliers" color={C.pink}    label={t({ fr: 'Fournisseur', ht: 'Founisè' })}
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
                  <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-orange-400/70">{t({ fr: 'Inventaire', ht: 'Envantè' })}</p>
                  <h3 className="mt-0.5 font-bold text-[#001F3F] text-base">{t({ fr: 'Santé du Stock', ht: 'Sante Stock' })}</h3>
                </div>
                <Link href="/inventory"
                  className="text-[11px] font-semibold text-[var(--color-muted)] hover:text-[var(--color-text)] transition">
                  {t({ fr: 'Tout voir', ht: 'Wè tout' })} →
                </Link>
              </div>

              {/* Summary chips */}
              <div className="mb-4 flex gap-2 flex-wrap">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold
                                  ${outOfStockCount > 0 ? 'bg-red-100 text-red-600 border border-red-200'
                                                       : 'bg-emerald-100 text-emerald-700 border border-emerald-200'}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${outOfStockCount > 0 ? 'bg-red-400 animate-pulse' : 'bg-emerald-400'}`}/>
                  {outOfStockCount} {t({ fr: outOfStockCount > 1 ? 'épuisés' : 'épuisé', ht: outOfStockCount > 1 ? 'Epuize' : 'Epuize' })}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/25
                                 bg-amber-100 px-3 py-1 text-[11px] font-bold text-amber-700">
                  ⚠ {lowStockCount} {t({ fr: 'stock bas', ht: 'stock ba' })}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/20
                                 bg-blue-100 px-3 py-1 text-[11px] font-bold text-blue-700">
                  📦 {products.length} {t({ fr: 'produits', ht: 'pwodui' })}
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
                    className="flex items-center gap-3 rounded-xl border border-[var(--color-border)]
                               bg-[var(--color-surface)] px-3.5 py-2.5 hover:bg-slate-50 transition-colors"
                  >
                    <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-sm
                                     ${p.stock_quantity === 0 ? 'bg-red-100' : p.stock_quantity <= (p.reorder_point ?? 0) ? 'bg-amber-100' : 'bg-emerald-100'}`}>
                      {p.stock_quantity === 0 ? '🚫' : p.stock_quantity <= (p.reorder_point ?? 0) ? '⚠️' : '✅'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12.5px] font-semibold text-[var(--color-text)] truncate">{p.name}</p>
                      <p className="text-[10px] text-[var(--color-muted)]">{p.category ?? t({ fr: 'Produit', ht: 'Pwodui' })}</p>
                    </div>
                    <StockBar qty={p.stock_quantity} reorder={p.reorder_point ?? 0} outOfStockT={t({ fr: 'Épuisé', ht: 'Epuize' })} lowT={t({ fr: 'bas', ht: 'ba' })} />
                  </motion.div>
                ))}
              </div>

              {/* Stock value footer */}
              <div className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3
                              flex items-center justify-between">
                <p className="text-[11px] text-[var(--color-muted)]">{t({ fr: 'Valeur totale stock', ht: 'Valè stock total' })}</p>
                <p className="text-sm font-bold text-[#001F3F]">{fmt(totalStockValue)}</p>
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
                  <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-blue-400/70">{t({ fr: 'Activité', ht: 'Aktivite' })}</p>
                  <h3 className="mt-0.5 font-bold text-[#001F3F] text-base">{t({ fr: 'Transactions Récentes', ht: 'Transaksyon Resan' })}</h3>
                </div>
                <button onClick={() => setShowFullLedger(v => !v)}
                  className="text-[11px] font-semibold text-[var(--color-muted)] hover:text-[var(--color-text)] transition">
                  {showFullLedger ? t({ fr: 'Réduire', ht: 'Redui' }) : t({ fr: 'Tout voir', ht: 'Wè tout' })} →
                </button>
              </div>

              <div className="space-y-2">
                {loading
                  ? Array.from({length:5}).map((_,i) => (
                      <div key={i} className="h-14 animate-pulse rounded-xl bg-[var(--color-surface)]" />
                    ))
                  : recentLedger.slice(0, showFullLedger ? 10 : 6).map((row, i) => (
                      <motion.div
                        key={row.id}
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.5 + i * 0.07 }}
                        className="flex items-center gap-3 rounded-xl border border-[var(--color-border)]
                                   bg-[var(--color-surface)] px-3.5 py-2.5 hover:bg-slate-50 transition-colors"
                      >
                        {/* Icon */}
                        <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-sm
                                         ${row.type === 'Vann' ? 'bg-emerald-100' : row.type === 'Dèt' ? 'bg-amber-100' : 'bg-red-100'}`}>
                          {row.type === 'Vann' ? '💰' : row.type === 'Dèt' ? '📝' : '💸'}
                        </div>
                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-[12.5px] font-semibold text-[var(--color-text)] truncate">
                            {row.description}
                          </p>
                          <div className="mt-0.5 flex items-center gap-1.5">
                            <span className="text-[10px] text-[var(--color-muted)]">{fmtDate(row.date)}</span>
                            <span className="text-slate-200">·</span>
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
                <div className="mt-4 flex justify-between text-[11px] text-[var(--color-muted)] border-t border-[var(--color-border)] pt-3">
                  <span>{t({ fr: 'Total entrées:', ht: 'Total antre:' })}
                    <span className="ml-1 font-semibold text-emerald-400">{fmt(salesRows.reduce((s,r) => s+r.amount, 0))}</span>
                  </span>
                  <span>{t({ fr: 'Total sorties:', ht: 'Total sòti:' })}
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
          <SectionLabel color={C.purple}>{t({ fr: 'Rapports Financiers', ht: 'Rapò Finansye' })}</SectionLabel>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <ReportCard href="/rapports" color={C.blue}
              title={t({ fr: 'État des résultats', ht: 'Eta rezilta' })}
              subtitle={t({ fr: 'Profits & pertes du mois', ht: 'Pwofi & pèt mwa a' })}
              icon={<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>} />
            <ReportCard href="/rapports" color={C.emerald}
              title={t({ fr: 'Bilan comptable', ht: 'Bilans kontabl' })}
              subtitle={t({ fr: 'Actif, passif, capitaux', ht: 'Aktif, pasif, kapital' })}
              icon={<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
              </svg>} />
            <ReportCard href="/rapports" color={C.cyan}
              title={t({ fr: 'Flux de trésorerie', ht: 'Flux trezoreri' })}
              subtitle={t({ fr: 'Entrées et sorties de cash', ht: 'Antre ak sòti kach' })}
              icon={<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
              </svg>} />
            <ReportCard href="/rapports" color={C.purple}
              title={t({ fr: 'Capitaux propres', ht: 'Kapital pwòp' })}
              subtitle={t({ fr: 'Évolution des fonds propres', ht: 'Evolisyon fon pwòp' })}
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
            <div className="flex flex-col gap-3 border-b border-[var(--color-border)] px-5 py-4
                            sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="h-6 w-0.5 rounded-full bg-[#001F3F]/20" />
                <div>
                  <h3 className="font-bold text-[#001F3F]">{t({ fr: 'Livre de Transactions', ht: 'Livre Transaksyon' })}</h3>
                  <p className="mt-0.5 text-[11px] text-[var(--color-muted)]">
                    {loading ? '…' : `${filteredLedger.length} ${t({ fr: 'entrées', ht: 'antre' })} · ${periodLabel}`}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {/* Search */}
                <div className="relative">
                  <svg className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-muted)]"
                    fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input type="text" placeholder={t({ fr: 'Rechercher…', ht: 'Chèche…' })} value={ledgerSearch}
                    onChange={e => { setLedgerSearch(e.target.value); setLedgerPage(1); }}
                    className="w-36 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] py-2 pl-8 pr-3
                               text-[12px] text-[var(--color-text)] outline-none placeholder-slate-400
                               transition focus:border-emerald-500/50 focus:bg-slate-100"
                  />
                </div>
                <select value={ledgerType} onChange={e => { setLedgerType(e.target.value); setLedgerPage(1); }}
                  className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2
                             text-[12px] text-[var(--color-text)] outline-none transition
                             focus:border-emerald-500/50">
                  <option value="">{t({ fr: 'Tout type', ht: 'Tout tip' })}</option>
                  {['Vann','Acha','Dèt'].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                {(ledgerSearch || ledgerType) && (
                  <button onClick={() => { setLedgerSearch(''); setLedgerType(''); setLedgerPage(1); }}
                    className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2
                               text-[12px] text-[var(--color-muted)] transition hover:text-[var(--color-text)]">
                    ✕
                  </button>
                )}
                <button
                  onClick={() => exportCSV(
                    [t({ fr:'Date', ht:'Dat' }),t({ fr:'Description', ht:'Deskripsyon' }),t({ fr:'Catégorie', ht:'Kategori' }),t({ fr:'Type', ht:'Tip' }),t({ fr:'Méthode', ht:'Metòd' }),t({ fr:'Montant', ht:'Montan' }),t({ fr:'Monnaie', ht:'Lajan' })],
                    filteredLedger.map(r => [r.date, r.description, r.category, r.type, r.payment_method, r.amount, r.currency]),
                    `transactions-${periodLabel.replace(/\s/g,'-')}.csv`
                  )}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--color-border)]
                             bg-[var(--color-surface)] px-3 py-2 text-[12px] font-semibold text-[var(--color-muted)]
                             transition hover:bg-slate-100 hover:text-[var(--color-text)]"
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  {t({ fr: 'CSV', ht: 'CSV' })}
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[580px] text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)]">
                    {['Date','Description','Type','Méthode','Montant'].map(h => {
  const th = t({ fr: h, ht: h === 'Date' ? 'Dat' : h === 'Description' ? 'Deskripsyon' : h === 'Type' ? 'Tip' : h === 'Méthode' ? 'Metòd' : 'Montan' });
  return (
                      <th key={h} className="px-5 py-3 text-left text-[10px] font-bold uppercase
                                             tracking-[0.12em] text-[var(--color-muted)] whitespace-nowrap">
                        {th}
                      </th>
                    );
                  })}
                  </tr>
                </thead>
                <tbody>
                  {loading
                    ? Array.from({length:5}).map((_,i) => (
                        <tr key={i} className="border-b border-[var(--color-border)]">
                          {Array.from({length:5}).map((_,j) => (
                            <td key={j} className="px-5 py-3.5">
                              <div className="h-3 animate-pulse rounded-full bg-slate-100"
                                style={{ width: `${40 + ((i*37+j*19) % 45)}%` }} />
                            </td>
                          ))}
                        </tr>
                      ))
                    : paginatedLedger.length === 0
                    ? <tr><td colSpan={5} className="px-5 py-12 text-center text-sm text-slate-300">
                        {t({ fr: 'Aucune transaction pour cette période.', ht: 'Pa gen transaksyon pou peryòd sa a.' })}
                      </td></tr>
                    : paginatedLedger.map((row, i) => (
                        <tr key={row.id}
                          className={`border-b border-[var(--color-border)] transition-colors
                                      hover:bg-slate-50 ${i % 2 === 0 ? '' : 'bg-[var(--color-surface)]'}`}>
                          <td className="px-5 py-3.5 font-mono text-[11px] text-[var(--color-muted)] whitespace-nowrap">
                            {fmtDate(row.date)}
                          </td>
                          <td className="px-5 py-3.5 max-w-[200px] truncate text-[13px] text-[var(--color-text)]"
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
              <div className="flex items-center justify-between border-t border-[var(--color-border)] px-5 py-3">
                <span className="text-[11px] text-[var(--color-muted)]">
                  {(ledgerPage-1)*PAGE_SIZE+1}–{Math.min(ledgerPage*PAGE_SIZE, filteredLedger.length)} / {filteredLedger.length}
                </span>
                <div className="flex gap-1">
                  <button onClick={() => setLedgerPage(p => Math.max(1, p-1))} disabled={ledgerPage === 1}
                    className="rounded-lg px-3 py-1.5 text-[11px] text-[var(--color-muted)] transition
                               hover:bg-slate-100 hover:text-[var(--color-text)] disabled:opacity-20 disabled:cursor-not-allowed">
                    ← {t({ fr: 'Précédent', ht: 'Anvan' })}
                  </button>
                  {Array.from({length: Math.min(ledgerPageCount, 5)}, (_,i) => i+1).map(pg => (
                    <button key={pg} onClick={() => setLedgerPage(pg)}
                      className={`rounded-lg px-3 py-1.5 text-[11px] transition ${
                        ledgerPage === pg
                          ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/25'
                          : 'text-[var(--color-muted)] hover:bg-slate-100 hover:text-[var(--color-text)]'
                      }`}>
                      {pg}
                    </button>
                  ))}
                  <button onClick={() => setLedgerPage(p => Math.min(ledgerPageCount, p+1))} disabled={ledgerPage === ledgerPageCount}
                    className="rounded-lg px-3 py-1.5 text-[11px] text-[var(--color-muted)] transition
                               hover:bg-slate-100 hover:text-[var(--color-text)] disabled:opacity-20 disabled:cursor-not-allowed">
                    {t({ fr: 'Suivant', ht: 'Apre' })} →
                  </button>
                </div>
              </div>
            )}

            {/* Footer totals */}
            <div className="border-t border-[var(--color-border)] px-5 py-3 flex flex-wrap gap-x-8 gap-y-1 text-[11px] text-[var(--color-muted)]">
              <span>{t({ fr: 'Cash In:', ht: 'Antre Kach:' })} <span className="font-bold text-blue-400">{fmt(totals.cashIn)}</span></span>
              <span>{t({ fr: 'Cash Out:', ht: 'Sòti Kach:' })} <span className="font-bold text-red-400">{fmt(totals.cashOut)}</span></span>
              <span>{t({ fr: 'Solde:', ht: 'Sòd:' })} <span className={`font-bold ${totals.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmt(totals.profit)}</span></span>
              <span>{t({ fr: 'Dettes:', ht: 'Dèt:' })} <span className="font-bold text-amber-400">{fmt(totals.debtTotal)}</span></span>
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
      <Suspense fallback={
        <div className="flex h-screen items-center justify-center bg-[var(--color-bg)]">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[#001F3F]" />
        </div>
      }>
        <DashboardInner />
      </Suspense>
    </ProtectedRoute>
  );
}
