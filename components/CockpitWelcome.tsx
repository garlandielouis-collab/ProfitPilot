'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';

// ─────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────

type Phase = 'hidden' | 'overlay' | 'insights' | 'done';

// ─────────────────────────────────────────────────────────
// AI Typing line
// ─────────────────────────────────────────────────────────

function AILine({ text, delay = 0, speed = 18, className = '' }: {
  text: string; delay?: number; speed?: number; className?: string;
}) {
  const [displayed, setDisplayed] = useState('');
  const [started, setStarted]     = useState(false);
  const [done, setDone]           = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setStarted(true), delay);
    return () => clearTimeout(t);
  }, [delay]);

  useEffect(() => {
    if (!started) return;
    let i = 0;
    setDisplayed('');
    setDone(false);
    const id = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) { clearInterval(id); setDone(true); }
    }, speed);
    return () => clearInterval(id);
  }, [started, text, speed]);

  return (
    <span className={className}>
      {displayed}
      {!done && started && (
        <motion.span
          animate={{ opacity: [1, 0] }}
          transition={{ duration: 0.5, repeat: Infinity, repeatType: 'reverse' }}
          className="inline-block w-0.5 h-[1em] bg-emerald-400 ml-0.5 align-middle"
        />
      )}
    </span>
  );
}

// ─────────────────────────────────────────────────────────
// Insight card
// ─────────────────────────────────────────────────────────

function InsightCard({ icon, stat, label, detail, color, delay }: {
  icon: string; stat: string; label: string; detail: string;
  color: 'emerald' | 'amber' | 'blue' | 'rose';
  delay: number;
}) {
  const bg = {
    emerald: 'from-emerald-500/10 to-emerald-500/5 border-emerald-500/20',
    amber:   'from-amber-500/10 to-amber-500/5 border-amber-500/20',
    blue:    'from-blue-500/10 to-blue-500/5 border-blue-500/20',
    rose:    'from-rose-500/10 to-rose-500/5 border-rose-500/20',
  }[color];

  const tc = {
    emerald: 'text-emerald-400',
    amber:   'text-amber-400',
    blue:    'text-blue-400',
    rose:    'text-rose-400',
  }[color];

  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay, type: 'spring', stiffness: 200, damping: 22 }}
      className={`relative overflow-hidden rounded-2xl border bg-gradient-to-br ${bg} p-4 backdrop-blur-sm`}
    >
      <span className="mb-2 block text-xl">{icon}</span>
      <p className={`text-2xl font-bold tabular-nums ${tc}`}>{stat}</p>
      <p className="mt-0.5 text-xs font-semibold text-white/70">{label}</p>
      <p className="mt-1.5 text-[10px] text-white/40 leading-relaxed">{detail}</p>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────

export function CockpitWelcome({ companyName }: { companyName: string }) {
  const router  = useRouter();
  const [phase, setPhase] = useState<Phase>('overlay');

  const MESSAGES = [
    { text: `Cockpit de ${companyName} activé.`,                                           delay: 0    },
    { text: "J'ai analysé votre secteur et configuré votre tableau de bord.",               delay: 2200 },
    { text: "Voici un aperçu de vos performances simulées pour ce mois.",                  delay: 4000 },
  ];

  useEffect(() => {
    if (phase !== 'overlay') return;
    const t = setTimeout(() => setPhase('insights'), 5800);
    return () => clearTimeout(t);
  }, [phase]);

  const handleDismiss = () => {
    setPhase('done');
    // Clean URL
    const url = new URL(window.location.href);
    url.searchParams.delete('welcome');
    router.replace(url.pathname);
  };

  if (phase === 'done') return null;

  return (
    <AnimatePresence>
      <motion.div
        key="cockpit-welcome"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: { duration: 0.4 } }}
        className="fixed inset-0 z-[100] flex items-end justify-center p-4 md:items-center"
        style={{ background: 'rgba(5,10,18,0.85)', backdropFilter: 'blur(8px)' }}
        onClick={handleDismiss}
      >
        {phase === 'overlay' && (
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ type: 'spring', stiffness: 200, damping: 22 }}
            className="w-full max-w-md rounded-3xl border border-white/10 bg-[#080f1a] p-7 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Pilot AI header */}
            <div className="mb-6 flex items-center gap-3">
              <div className="relative">
                <motion.div
                  className="absolute inset-0 rounded-full border border-emerald-500/40"
                  animate={{ scale: [1, 1.5], opacity: [0.6, 0] }}
                  transition={{ duration: 1.8, repeat: Infinity }}
                />
                <div className="relative h-10 w-10 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-700 flex items-center justify-center shadow-lg shadow-emerald-500/30">
                  <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1 1 .28 2.716-1.062 2.716H4.86c-1.342 0-2.063-1.716-1.063-2.716L5 14.5" />
                  </svg>
                </div>
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Pilot AI</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <motion.div
                    className="h-1.5 w-1.5 rounded-full bg-emerald-400"
                    animate={{ opacity: [1, 0.4, 1] }}
                    transition={{ duration: 1.2, repeat: Infinity }}
                  />
                  <span className="text-[10px] text-emerald-400">En ligne · Analyse terminée</span>
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="space-y-3">
              {MESSAGES.map((m, i) => (
                <motion.p
                  key={i}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: m.delay / 1000 }}
                  className="text-sm text-slate-300 leading-relaxed"
                >
                  <AILine text={m.text} delay={m.delay} speed={20} />
                </motion.p>
              ))}
            </div>

            {/* Separator */}
            <div className="my-5 h-px bg-white/5" />

            {/* Insight preview */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 4.5 }}
              className="space-y-2"
            >
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-600">Aperçu rapide</p>
              <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/8 px-3 py-2.5">
                <span className="text-base">📈</span>
                <div>
                  <p className="text-xs font-semibold text-emerald-400">+14.6% de croissance</p>
                  <p className="text-[10px] text-slate-500">vs mois précédent · données de démo</p>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/8 px-3 py-2.5">
                <span className="text-base">⚠️</span>
                <div>
                  <p className="text-xs font-semibold text-amber-400">3 produits en rupture prévue</p>
                  <p className="text-[10px] text-slate-500">Stock insuffisant d&apos;ici 5 jours</p>
                </div>
              </div>
            </motion.div>

            {/* CTA */}
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 5.2 }}
              onClick={handleDismiss}
              className="mt-5 w-full rounded-2xl bg-emerald-500 py-3 text-sm font-semibold text-white transition hover:bg-emerald-400 shadow-lg shadow-emerald-500/20"
            >
              Explorer mon Cockpit →
            </motion.button>
          </motion.div>
        )}

        {phase === 'insights' && (
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 180, damping: 22 }}
            className="w-full max-w-lg rounded-3xl border border-white/10 bg-[#080f1a] p-7 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                <p className="text-sm font-semibold text-white">Pilot AI — Premier Insight</p>
              </div>
              <button
                onClick={handleDismiss}
                className="rounded-lg p-1 text-slate-600 hover:text-slate-400 transition"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* AI question */}
            <div className="mb-5 rounded-2xl border border-emerald-500/20 bg-emerald-500/8 px-4 py-4">
              <p className="text-sm text-emerald-300 font-medium leading-relaxed">
                <AILine
                  text={`Votre produit "Parfum Prestige" génère 42% de votre marge brute. Voulez-vous voir comment optimiser votre stock ?`}
                  delay={300}
                  speed={16}
                />
              </p>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-2 gap-3">
              <InsightCard
                icon="💰"
                stat="1,285,400 G"
                label="Chiffre d'affaires"
                detail="Exercice en cours · +14.6% vs N-1"
                color="emerald"
                delay={0.4}
              />
              <InsightCard
                icon="📦"
                stat="3 produits"
                label="Rupture imminente"
                detail="Stock insuffisant d'ici 5 jours"
                color="amber"
                delay={0.55}
              />
              <InsightCard
                icon="👥"
                stat="5 clients VIP"
                label="Clientèle fidèle"
                detail=">50,000 HTG d'achats totaux"
                color="blue"
                delay={0.7}
              />
              <InsightCard
                icon="📉"
                stat="87,500 G"
                label="Dettes clients"
                detail="À recouvrer ce mois"
                color="rose"
                delay={0.85}
              />
            </div>

            {/* Actions */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.2 }}
              className="mt-5 flex gap-2"
            >
              <button
                onClick={handleDismiss}
                className="flex-1 rounded-2xl bg-emerald-500 py-3 text-sm font-semibold text-white transition hover:bg-emerald-400 shadow-lg shadow-emerald-500/20"
              >
                Voir mon Dashboard
              </button>
              <button
                onClick={() => { handleDismiss(); }}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-slate-400 transition hover:bg-white/10"
              >
                Plus tard
              </button>
            </motion.div>
          </motion.div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
