'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLanguage } from './LanguageWrapper';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle, Package, TrendingDown, TrendingUp, Users, Wallet,
  type LucideIcon,
} from 'lucide-react';

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

function InsightCard({ icon: Icon, stat, label, detail, color, delay }: {
  icon: LucideIcon; stat: string; label: string; detail: string;
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
      <Icon className="mb-2 h-5 w-5" strokeWidth={1.8} aria-hidden />
      <p className={`text-2xl font-bold tabular-nums ${tc}`}>{stat}</p>
      <p className="mt-0.5 text-xs font-semibold text-white/70">{label}</p>
      <p className="mt-1.5 text-note text-white/40 leading-relaxed">{detail}</p>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────

export function CockpitWelcome({ companyName }: { companyName: string }) {
  const router  = useRouter();
  const [phase, setPhase] = useState<Phase>('overlay');
  const { t } = useLanguage();

  // Ce message d'accueil promettait « un aperçu de vos performances simulées »,
  // puis affichait 1 285 400 G de chiffre d'affaires, cinq clients VIP et un
  // « Parfum Prestige » qui pesait 42 % de la marge — à quelqu'un dont le compte
  // était vide depuis trente secondes (audit §1.1). Le mot « simulé » ne sauve
  // rien : ce sont les chiffres qui restent en mémoire, pas l'avertissement.
  // Le cockpit annonce désormais ce qu'il va suivre, et rien de plus.
  const MESSAGES = [
    { text: `${t({ fr: 'Cockpit de', ht: 'Cockpit' })} ${companyName} ${t({ fr: 'activé.', ht: 'aktive.' })}`, delay: 0 },
    { text: t({ fr: "Votre tableau de bord est prêt : il est vide, et il le restera jusqu'à votre première vente.", ht: "Tablo debò ou pare : li vid, e l ap rete konsa jiskaske ou fè premye vant ou." }), delay: 2200 },
    { text: t({ fr: "Voici les quatre choses que je surveillerai pour vous.", ht: "Men kat bagay m ap veye pou ou." }), delay: 4000 },
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
            className="w-full max-w-md rounded-3xl border border-white/10 bg-anthracite p-7 shadow-2xl"
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
                <p className="text-sm font-semibold text-white">{t({ fr: 'Pilot AI', ht: 'Pilot AI' })}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <motion.div
                    className="h-1.5 w-1.5 rounded-full bg-emerald-400"
                    animate={{ opacity: [1, 0.4, 1] }}
                    transition={{ duration: 1.2, repeat: Infinity }}
                  />
                  <span className="text-note text-emerald-400">{t({ fr: 'En ligne · Analyse terminée', ht: 'An liy · Analiz fini' })}</span>
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
              <p className="text-note font-semibold uppercase tracking-widest text-slate-600">{t({ fr: 'Ce que je surveille', ht: 'Sa m ap veye' })}</p>
              <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/8 px-3 py-2.5">
                <TrendingUp className="h-4 w-4" strokeWidth={1.8} aria-hidden />
                <div>
                  <p className="text-xs font-semibold text-emerald-400">{t({ fr: 'Votre marge, mois après mois', ht: 'Mòj ou, mwa apre mwa' })}</p>
                  <p className="text-note text-slate-500">{t({ fr: 'Vendre plus et gagner moins, ça se voit ici', ht: 'Vann plis epi genyen mwens, sa parèt isit la' })}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/8 px-3 py-2.5">
                <AlertTriangle className="h-4 w-4" strokeWidth={1.8} aria-hidden />
                <div>
                  <p className="text-xs font-semibold text-amber-400">{t({ fr: 'Vos ruptures de stock', ht: 'Stock ou ki fini' })}</p>
                  <p className="text-note text-slate-500">{t({ fr: "Je préviens avant que l'étagère ne soit vide", ht: 'M ap avèti w anvan etajè a vid' })}</p>
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
              {t({ fr: 'Voir mon commerce', ht: 'Gade komès mwen' })}
            </motion.button>
          </motion.div>
        )}

        {phase === 'insights' && (
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 180, damping: 22 }}
            className="w-full max-w-lg rounded-3xl border border-white/10 bg-anthracite p-7 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                <p className="text-sm font-semibold text-white">{t({ fr: 'Pilot AI — Ce que je vais suivre', ht: 'Pilot AI — Sa m ap swiv' })}</p>
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

            {/* Ce que Pilot AI fera — au futur, parce que c'est le temps juste. */}
            <div className="mb-5 rounded-2xl border border-emerald-500/20 bg-emerald-500/8 px-4 py-4">
              <p className="text-sm text-emerald-300 font-medium leading-relaxed">
                <AILine
                  text={t({
                    fr: "Dès que vous aurez enregistré quelques ventes, je vous dirai quel produit fait vraiment votre marge — et lequel vous coûte de l'argent sans que ça se voie.",
                    ht: "Depi ou fin anrejistre kèk vant, m ap di w ki pwodui ki fè mòj ou vre — e kilès k ap koute w lajan san ou pa wè l.",
                  })}
                  delay={300}
                  speed={16}
                />
              </p>
            </div>

            {/* Les quatre veilles. Un rôle, pas un chiffre : le premier chiffre
                affiché ici sera le premier chiffre réel du marchand. */}
            <div className="grid grid-cols-2 gap-3">
              <InsightCard
                icon={Wallet}
                stat={t({ fr: 'La marge', ht: 'Mòj la' })}
                label={t({ fr: 'Ce qui vous reste', ht: 'Sa ki rete pou ou' })}
                detail={t({ fr: 'Le chiffre d\'affaires ment, la marge non', ht: 'Chif afè ka bay manti, mòj la non' })}
                color="emerald"
                delay={0.4}
              />
              <InsightCard
                icon={Package}
                stat={t({ fr: 'Le stock', ht: 'Stock la' })}
                label={t({ fr: 'Avant la rupture', ht: 'Anvan l fini' })}
                detail={t({ fr: 'Une alerte quand un produit va manquer', ht: 'Yon alèt lè yon pwodui pral manke' })}
                color="amber"
                delay={0.55}
              />
              <InsightCard
                icon={Users}
                stat={t({ fr: 'Vos clients', ht: 'Kliyan ou yo' })}
                label={t({ fr: 'Ceux qui font vivre', ht: 'Sa ki fè w viv yo' })}
                detail={t({ fr: 'Qui achète le plus, qui ne revient plus', ht: 'Kiyès ki achte plis, kiyès ki pa tounen' })}
                color="blue"
                delay={0.7}
              />
              <InsightCard
                icon={TrendingDown}
                stat={t({ fr: 'Le crédit', ht: 'Kredi a' })}
                label={t({ fr: 'Qui vous doit', ht: 'Kiyès ki dwe w' })}
                detail={t({ fr: 'Combien, depuis quand, et à qui le rappeler', ht: 'Konbyen, depi kilè, e kiyès pou raple' })}
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
                {t({ fr: 'Voir mon commerce', ht: 'Gade komès mwen' })}
              </button>
              <button
                onClick={() => { handleDismiss(); }}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-slate-400 transition hover:bg-white/10"
              >
                {t({ fr: 'Plus tard', ht: 'Pita' })}
              </button>
            </motion.div>
          </motion.div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
