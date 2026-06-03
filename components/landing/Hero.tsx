'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight, Sparkles, TrendingUp, ShoppingCart, AlertCircle, DollarSign } from 'lucide-react';
import { useLanguage } from '../LanguageWrapper';

// ── Animated Dashboard Mockup ─────────────────────────────────────────────────

function DashboardMockup() {
  const bars = [45, 62, 38, 78, 55, 88, 67, 92, 71, 95];

  return (
    <div className="relative w-full max-w-[580px]">
      {/* Glow effects */}
      <div className="pointer-events-none absolute -top-12 -right-12 h-48 w-48 rounded-full bg-[#50c878]/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-8 -left-8 h-40 w-40 rounded-full bg-[#001f3f]/10 blur-2xl" />

      <motion.div
        initial={{ opacity: 0, y: 32, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
      >
        {/* Browser frame */}
        <div className="overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white shadow-[0_32px_80px_rgba(0,31,63,0.14),0_0_0_1px_rgba(0,31,63,0.04)]">
          {/* Browser chrome */}
          <div className="flex items-center gap-2 border-b border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3">
            <div className="flex gap-1.5">
              <div className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
              <div className="h-2.5 w-2.5 rounded-full bg-[#FFBD2E]" />
              <div className="h-2.5 w-2.5 rounded-full bg-[#28C840]" />
            </div>
            <div className="mx-auto flex h-6 w-56 items-center gap-2 rounded-md bg-white px-3 shadow-sm border border-[#E2E8F0]">
              <div className="h-2 w-2 rounded-full bg-[#50c878]" />
              <span className="text-[10px] text-slate-400">app.profitpilot.ht/dashboard</span>
            </div>
          </div>

          {/* Dashboard content */}
          <div className="bg-[#F8FAFC] p-4">
            {/* Header */}
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-widest text-[#50c878]">ProfitPilot</p>
                <p className="text-sm font-semibold text-[#001f3f]">Bonjour, Marie 👋</p>
              </div>
              <span className="rounded-full bg-[#50c878]/10 px-2.5 py-1 text-[9px] font-semibold text-[#50c878]">
                ● En direct
              </span>
            </div>

            {/* KPI row */}
            <div className="mb-3 grid grid-cols-3 gap-2">
              {[
                { label: 'Ventes aujourd\'hui', value: '48 500', unit: 'HTG', color: '#50c878', up: '+14%' },
                { label: 'Profit net', value: '12 800', unit: 'HTG', color: '#001f3f', up: '+8%' },
                { label: 'Stock critique', value: '3', unit: 'alertes', color: '#f59e0b', up: null },
              ].map((k, i) => (
                <div key={i} className="rounded-xl bg-white p-2.5 shadow-sm border border-[#E2E8F0]">
                  <p className="text-[7.5px] text-slate-400 mb-1">{k.label}</p>
                  <div className="flex items-end gap-1">
                    <p className="text-sm font-bold" style={{ color: k.color }}>{k.value}</p>
                    <p className="text-[7px] text-slate-400 mb-0.5">{k.unit}</p>
                  </div>
                  {k.up && (
                    <span className="text-[7px] font-semibold text-[#50c878]">↑ {k.up}</span>
                  )}
                </div>
              ))}
            </div>

            {/* Chart */}
            <div className="rounded-xl bg-white p-3 shadow-sm border border-[#E2E8F0] mb-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[9px] font-semibold text-[#001f3f]">Ventes — 10 derniers jours</p>
                <span className="text-[7.5px] text-slate-400">HTG</span>
              </div>
              <div className="flex h-16 items-end gap-[3px]">
                {bars.map((h, i) => (
                  <motion.div
                    key={i}
                    className="flex-1 rounded-t-sm"
                    style={{
                      background: i === bars.length - 1
                        ? 'linear-gradient(to top, #001f3f, #50c878)'
                        : i > 6 ? 'rgba(80,200,120,0.3)' : 'rgba(0,31,63,0.08)',
                    }}
                    initial={{ height: 0 }}
                    animate={{ height: `${h}%` }}
                    transition={{ delay: 0.4 + i * 0.06, duration: 0.5, ease: 'easeOut' }}
                  />
                ))}
              </div>
            </div>

            {/* AI insight */}
            <motion.div
              className="rounded-xl border border-[#50c878]/20 bg-gradient-to-r from-[#001f3f]/5 to-[#50c878]/10 p-3"
              animate={{ borderColor: ['rgba(80,200,120,0.2)', 'rgba(80,200,120,0.4)', 'rgba(80,200,120,0.2)'] }}
              transition={{ duration: 3, repeat: Infinity }}
            >
              <div className="flex items-start gap-2">
                <span className="text-base">🤖</span>
                <div>
                  <p className="text-[8px] font-semibold text-[#001f3f] mb-0.5">Pilot AI</p>
                  <p className="text-[8px] text-slate-600 leading-relaxed">
                    Votre produit <strong>Savon Karité</strong> génère 34% de votre marge.
                    Augmentez votre stock de 50 unités avant dimanche.
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </motion.div>

      {/* Floating KPI cards */}
      <motion.div
        className="absolute -left-10 top-20 rounded-2xl border border-[#E2E8F0] bg-white px-4 py-3 shadow-xl hidden lg:block"
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
        initial={{ opacity: 0, x: -20 }}
        whileInView={{ opacity: 1, x: 0 }}
      >
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#50c878]/10">
            <TrendingUp size={12} className="text-[#50c878]" />
          </div>
          <div>
            <p className="text-[8px] text-slate-400">Profit ce mois</p>
            <p className="text-sm font-bold text-[#001f3f]">+18%</p>
          </div>
        </div>
      </motion.div>

      <motion.div
        className="absolute -right-8 top-32 rounded-2xl border border-[#E2E8F0] bg-white px-4 py-3 shadow-xl hidden lg:block"
        animate={{ y: [0, 8, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
        initial={{ opacity: 0, x: 20 }}
        whileInView={{ opacity: 1, x: 0 }}
      >
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100">
            <AlertCircle size={12} className="text-amber-600" />
          </div>
          <div>
            <p className="text-[8px] text-slate-400">Stock Savon</p>
            <p className="text-sm font-bold text-amber-600">3 restants</p>
          </div>
        </div>
      </motion.div>

      <motion.div
        className="absolute -bottom-4 left-16 rounded-2xl border border-[#E2E8F0] bg-white px-4 py-3 shadow-xl hidden lg:block"
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#001f3f]/10">
            <DollarSign size={12} className="text-[#001f3f]" />
          </div>
          <div>
            <p className="text-[8px] text-slate-400">Vente enregistrée</p>
            <p className="text-sm font-bold text-[#001f3f]">5 200 HTG ✓</p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ── Hero ──────────────────────────────────────────────────────────────────────

const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.1 } } };
const fadeUp = {
  hidden:  { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] as any } },
};

export function Hero() {
  const { t } = useLanguage();

  return (
    <section className="relative overflow-hidden bg-white px-5 pb-24 pt-20 md:px-10 lg:px-16">
      {/* Subtle grid background */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: 'linear-gradient(#001f3f 1px, transparent 1px), linear-gradient(90deg, #001f3f 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />
      {/* Gradient blobs */}
      <div className="pointer-events-none absolute -top-40 right-0 h-[500px] w-[500px] rounded-full bg-[#50c878]/8 blur-[120px]" />
      <div className="pointer-events-none absolute bottom-0 left-0 h-[300px] w-[400px] rounded-full bg-[#001f3f]/5 blur-[80px]" />

      <div className="relative mx-auto grid max-w-7xl items-center gap-16 lg:grid-cols-2">
        {/* Left: copy */}
        <motion.div
          variants={stagger}
          initial="hidden"
          animate="visible"
          className="flex flex-col gap-7"
        >
          {/* Badge */}
          <motion.div variants={fadeUp}>
            <span className="inline-flex items-center gap-2 rounded-full border border-[#50c878]/30 bg-[#50c878]/10 px-4 py-2 text-xs font-semibold text-[#50c878]">
              <Sparkles size={11} />
              {t({ fr: 'Propulsé par Pilot AI — Intelligence artificielle financière', ht: 'Propulse pa Pilot AI — Entèlijans atifisyèl finansye' })}
            </span>
          </motion.div>

          {/* Headline */}
          <motion.h1
            variants={fadeUp}
            className="text-4xl font-extrabold leading-[1.1] tracking-tight text-[#001f3f] sm:text-5xl lg:text-[3.4rem]"
          >
            Pilotez votre
            <br />
            <span className="relative">
              <span className="relative z-10" style={{ background: 'linear-gradient(135deg, #001f3f 0%, #50c878 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                business avec clarté.
              </span>
            </span>
          </motion.h1>

          {/* Subheadline */}
          <motion.p variants={fadeUp} className="max-w-lg text-lg leading-8 text-slate-500">
            {t({
              fr: 'Stock, ventes, dépenses, trésorerie et intelligence artificielle. Tout ce dont vous avez besoin pour développer votre entreprise, enfin réuni au même endroit.',
              ht: 'Estòk, vant, depans, trezoreri ak entèlijans atifisyèl. Tout sa ou bezwen pou devlope antrepriz ou a, finalman nan yon sèl kote.',
            })}
          </motion.p>

          {/* CTAs */}
          <motion.div variants={fadeUp} className="flex flex-wrap gap-3">
            <Link
              href="/onboarding"
              className="group relative inline-flex items-center gap-3 overflow-hidden rounded-2xl px-7 py-4 text-base font-bold text-white shadow-xl transition-all hover:scale-[1.02] hover:shadow-[#50c878]/40 active:scale-95"
              style={{
                background: 'linear-gradient(135deg, #001f3f 0%, #0d3566 100%)',
                boxShadow: '0 0 0 1px rgba(0,31,63,0.2), 0 16px 48px rgba(0,31,63,0.25)',
              }}
            >
              <span className="pointer-events-none absolute inset-0 translate-x-[-120%] skew-x-[-20deg] bg-white/10 transition-transform duration-700 group-hover:translate-x-[120%]" />
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#50c878]/20 text-[#50c878] text-sm">✦</span>
              {t({ fr: 'Commencer gratuitement', ht: 'Kòmanse gratis' })}
              <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-2xl border border-[#E2E8F0] bg-white px-7 py-4 text-base font-semibold text-[#001f3f] transition hover:border-[#50c878]/40 hover:bg-[#50c878]/5 active:scale-95 shadow-sm"
            >
              {t({ fr: 'Voir la démo', ht: 'Wè demo a' })}
            </Link>
          </motion.div>

          {/* Social proof mini */}
          <motion.div variants={fadeUp} className="flex items-center gap-4 pt-2">
            <div className="flex -space-x-2">
              {['#1d4ed8', '#7c3aed', '#059669', '#b45309', '#dc2626'].map((c, i) => (
                <div key={i} className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white text-[10px] font-bold text-white" style={{ background: c }}>
                  {['J', 'M', 'C', 'R', 'A'][i]}
                </div>
              ))}
            </div>
            <div>
              <div className="flex items-center gap-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <span key={i} className="text-[#50c878] text-sm">★</span>
                ))}
              </div>
              <p className="text-xs text-slate-500">
                <span className="font-semibold text-[#001f3f]">250+</span> {t({ fr: 'commerçants haïtiens nous font confiance', ht: 'machann ayisyen fè nou konfyans' })}
              </p>
            </div>
          </motion.div>
        </motion.div>

        {/* Right: dashboard */}
        <motion.div
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 1, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
          className="flex justify-center lg:justify-end"
        >
          <DashboardMockup />
        </motion.div>
      </div>
    </section>
  );
}
