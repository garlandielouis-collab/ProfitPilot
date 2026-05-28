'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { useLanguage } from '../LanguageWrapper';

// ── Phone Mockup ──────────────────────────────────────────────────────────────

function PhoneMockup() {
  const bars = [40, 65, 45, 80, 55, 90, 70, 95, 60, 85];
  return (
    <div className="relative flex items-center justify-center">
      {/* Bottom glow */}
      <div
        className="pointer-events-none absolute -bottom-8 left-1/2 h-28 w-72 -translate-x-1/2 rounded-full blur-3xl"
        style={{ background: 'radial-gradient(ellipse,rgba(59,130,246,0.65) 0%,transparent 70%)' }}
      />
      {/* Top accent */}
      <div
        className="pointer-events-none absolute -top-16 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full blur-2xl"
        style={{ background: 'radial-gradient(ellipse,rgba(139,92,246,0.35) 0%,transparent 70%)' }}
      />

      {/* Floating + 3D tilt */}
      <motion.div
        animate={{ y: [0, -14, 0] }}
        transition={{ duration: 4.8, repeat: Infinity, ease: 'easeInOut' }}
      >
        <motion.div
          initial={{ rotateX: 4, rotateY: -10 }}
          whileHover={{ rotateX: 0, rotateY: 0, scale: 1.02 }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
          style={{ perspective: '1200px', transformStyle: 'preserve-3d' }}
        >
          {/* Frame */}
          <div
            className="relative h-[520px] w-[256px] overflow-hidden rounded-[44px] border-[5px]"
            style={{
              borderColor: '#1e293b',
              background: 'linear-gradient(145deg,#1e293b,#0f172a)',
              boxShadow:
                '0 40px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.05), 0 0 48px rgba(59,130,246,0.18)',
            }}
          >
            {/* Dynamic island */}
            <div className="absolute left-1/2 top-3 z-20 h-5 w-20 -translate-x-1/2 rounded-full bg-black" />

            {/* Screen */}
            <div
              className="absolute inset-0 flex flex-col overflow-hidden rounded-[39px]"
              style={{ background: 'linear-gradient(180deg,#0b0f19 0%,#0d1526 100%)' }}
            >
              <div className="flex items-center justify-between px-5 pt-10 pb-1">
                <span className="text-[9px] font-semibold text-slate-400">9:41</span>
                <span className="text-[9px] text-slate-500">▐▐ ●</span>
              </div>

              <div className="flex items-center justify-between px-4 py-1.5">
                <div>
                  <p className="text-[8px] font-bold uppercase tracking-widest text-blue-400">ProfitPilot</p>
                  <p className="text-[11px] font-semibold text-white">Tableau de bord</p>
                </div>
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-500/20">
                  <div className="h-2 w-2 rounded-full bg-blue-400" />
                </div>
              </div>

              <div
                className="mx-3 mt-1 rounded-2xl p-3"
                style={{
                  background: 'linear-gradient(135deg,rgba(59,130,246,0.2),rgba(139,92,246,0.15))',
                  border: '1px solid rgba(59,130,246,0.2)',
                }}
              >
                <p className="mb-1 text-[8px] text-slate-400">Ventes aujourd'hui</p>
                <div className="flex items-end justify-between">
                  <p className="text-[15px] font-bold text-white">
                    45,200 <span className="text-[8px] text-slate-400">HTG</span>
                  </p>
                  <span className="rounded-full bg-emerald-400/10 px-1.5 py-0.5 text-[8px] font-semibold text-emerald-400">
                    +12%
                  </span>
                </div>
              </div>

              <div className="mx-3 mt-2 flex h-10 items-end gap-[3px] px-1">
                {bars.map((h, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-sm"
                    style={{
                      height: `${h}%`,
                      background:
                        i === bars.length - 1
                          ? 'linear-gradient(to top,#3b82f6,#8b5cf6)'
                          : 'rgba(255,255,255,0.07)',
                    }}
                  />
                ))}
              </div>

              <div className="mx-3 mt-2 grid grid-cols-2 gap-1.5">
                {[
                  { l: 'Profit', v: '12 800', c: '#10b981' },
                  { l: 'Dettes', v: '4 200', c: '#f59e0b' },
                ].map(s => (
                  <div
                    key={s.l}
                    className="rounded-xl p-2"
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.07)',
                    }}
                  >
                    <p className="text-[7px] text-slate-500">{s.l}</p>
                    <p className="text-[10px] font-bold" style={{ color: s.c }}>{s.v}</p>
                  </div>
                ))}
              </div>

              <div
                className="mx-3 mt-2 flex items-start gap-2 rounded-xl p-2.5"
                style={{
                  background: 'rgba(139,92,246,0.12)',
                  border: '1px solid rgba(139,92,246,0.2)',
                }}
              >
                <span className="mt-0.5 shrink-0 text-[13px]">🤖</span>
                <p className="text-[7.5px] leading-relaxed text-purple-300">
                  Stock Savon critique (2 unités). Commander 50 unités cette semaine.
                </p>
              </div>

              <div className="mx-3 mt-3 grid grid-cols-3 gap-1.5">
                {['Vendre', 'Acheter', 'Scanner'].map(l => (
                  <div
                    key={l}
                    className="rounded-xl py-2 text-center"
                    style={{
                      background: 'rgba(59,130,246,0.15)',
                      border: '1px solid rgba(59,130,246,0.2)',
                    }}
                  >
                    <p className="text-[7.5px] font-semibold text-blue-300">{l}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Edge shine */}
          <div
            className="pointer-events-none absolute -right-1 bottom-12 top-12 w-0.5 rounded-full opacity-30"
            style={{ background: 'linear-gradient(to bottom,transparent,rgba(59,130,246,0.8),transparent)' }}
          />
        </motion.div>
      </motion.div>
    </div>
  );
}

// ── Hero Section ──────────────────────────────────────────────────────────────

const container = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.11 } },
};
const item = {
  hidden: { opacity: 0, y: 28 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] } },
};

const gradBtn: React.CSSProperties = {
  background: 'linear-gradient(135deg,#3b82f6 0%,#8b5cf6 100%)',
};
const glassCard: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
};

export function Hero() {
  const { t } = useLanguage();

  return (
    <section className="relative overflow-hidden px-5 pb-24 pt-16 md:px-10 lg:px-16">
      {/* Background orbs */}
      <div
        className="pointer-events-none absolute -top-32 left-1/4 h-[480px] w-[480px] rounded-full opacity-20 blur-[120px]"
        style={{ background: 'radial-gradient(circle,#3b82f6,transparent 70%)' }}
      />
      <div
        className="pointer-events-none absolute -right-24 top-8 h-[380px] w-[380px] rounded-full opacity-15 blur-[100px]"
        style={{ background: 'radial-gradient(circle,#8b5cf6,transparent 70%)' }}
      />
      <div
        className="pointer-events-none absolute bottom-0 left-0 h-[300px] w-[300px] rounded-full opacity-10 blur-[80px]"
        style={{ background: 'radial-gradient(circle,#10b981,transparent 70%)' }}
      />

      <div className="relative mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-2">
        {/* Left — text */}
        <motion.div
          variants={container}
          initial="hidden"
          animate="visible"
          className="flex flex-col gap-6"
        >
          <motion.span
            variants={item}
            className="inline-flex w-fit items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/10 px-4 py-1.5 text-xs font-semibold text-blue-300"
          >
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-400" />
            {t({ fr: 'Nouveau — PilotAI v2 disponible', ht: 'Nouvo — PilotAI v2 disponib' })}
          </motion.span>

          <motion.h1
            variants={item}
            className="text-4xl font-bold leading-tight tracking-tight text-white sm:text-5xl lg:text-[3.1rem]"
          >
            ProfitPilot:
            <br />
            <span
              style={{
                background: 'linear-gradient(90deg,#3b82f6,#8b5cf6)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              {t({ fr: 'La solution ultime', ht: 'Solisyon definitif' })}
            </span>{' '}
            {t({
              fr: 'pour les entrepreneurs qui veulent enfin dominer leurs finances.',
              ht: 'pou antreprenè ki vle domine finansman yo.',
            })}
          </motion.h1>

          <motion.p variants={item} className="max-w-lg text-base leading-8 text-slate-400">
            {t({
              fr: 'Ventes, stocks, dettes, rapports HTG/USD et intelligence artificielle — tout en une seule application conçue pour le commerçant haïtien moderne.',
              ht: 'Vant, estòk, dèt, rapò HTG/USD ak entèlijans atifisyèl — tout nan yon sèl aplikasyon fèt pou machann ayisyen modèn nan.',
            })}
          </motion.p>

          <motion.div variants={item} className="flex flex-wrap gap-3">
            <Link
              href="/auth/register"
              className="group inline-flex items-center gap-2 rounded-2xl px-6 py-3.5 text-sm font-semibold text-white transition hover:opacity-90 active:scale-95"
              style={gradBtn}
            >
              {t({ fr: 'Démarrer mon essai gratuit', ht: 'Kòmanse esè gratis mwen' })}
              <ArrowRight size={16} className="transition group-hover:translate-x-1" />
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex items-center rounded-2xl border border-white/10 bg-white/5 px-6 py-3.5 text-sm font-semibold text-slate-300 transition hover:bg-white/10 hover:text-white active:scale-95"
            >
              {t({ fr: 'Voir la démo', ht: 'Wè demo a' })}
            </Link>
          </motion.div>

          <motion.div variants={item} className="grid grid-cols-3 gap-3">
            {[
              { v: '250+', l: { fr: 'Commerçants', ht: 'Machann' } },
              { v: '+18%', l: { fr: 'Croissance moy.', ht: 'Kwasi mwayen' } },
              { v: '5K+', l: { fr: 'Ventes / jour', ht: 'Vant / jou' } },
            ].map(s => (
              <div key={s.v} className="rounded-2xl p-4 text-center" style={glassCard}>
                <p className="text-xl font-bold text-white">{s.v}</p>
                <p className="mt-1 text-[11px] text-slate-500">{t(s.l)}</p>
              </div>
            ))}
          </motion.div>
        </motion.div>

        {/* Right — Phone */}
        <motion.div
          initial={{ opacity: 0, x: 48 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.9, delay: 0.25, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
          className="flex justify-center lg:justify-end"
        >
          <PhoneMockup />
        </motion.div>
      </div>
    </section>
  );
}
