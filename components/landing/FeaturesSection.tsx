'use client';

import { useRef, useState } from 'react';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import { BarChart3, ChevronLeft, ChevronRight, Cpu, ScanLine, Shield, TrendingUp, Zap } from 'lucide-react';
import { useLanguage } from '../LanguageWrapper';

const FEATURES = [
  {
    id: 1, Icon: BarChart3, color: '#3b82f6', glow: 'rgba(59,130,246,0.18)',
    title: { fr: 'Double Comptabilité', ht: 'Doub Kontablite' },
    desc: { fr: 'Gérez le cash et le crédit séparément avec une vision 360° de votre trésorerie en temps réel.', ht: 'Jere lajan kach ak kredi separeman ak yon vizyon 360° sou lajan ou an tan reyèl.' },
  },
  {
    id: 2, Icon: ScanLine, color: '#10b981', glow: 'rgba(16,185,129,0.18)',
    title: { fr: 'Scan Produit', ht: 'Eskan Pwodwi' },
    desc: { fr: 'Capturez vos produits en 2 secondes avec le scanner intégré. Inventaire automatique.', ht: 'Kaptire pwodwi ou yo nan 2 segond ak scanner entegre a. Envantè otomatik.' },
  },
  {
    id: 3, Icon: Cpu, color: '#8b5cf6', glow: 'rgba(139,92,246,0.18)',
    title: { fr: 'PilotAI', ht: 'PilotAI' },
    desc: { fr: 'Recommandations intelligentes pour optimiser vos marges, stocks et flux de trésorerie.', ht: 'Rekòmandasyon entèlijan pou optimize maj, estòk ak flus lajan ou.' },
  },
  {
    id: 4, Icon: TrendingUp, color: '#f59e0b', glow: 'rgba(245,158,11,0.18)',
    title: { fr: 'Rapports HTG/USD', ht: 'Rapò HTG/USD' },
    desc: { fr: 'Rapports financiers complets avec conversion automatique Gourdes/Dollar en temps réel.', ht: 'Rapò finansye konplè ak konvèsyon otomatik Goud/Dola an tan reyèl.' },
  },
  {
    id: 5, Icon: Shield, color: '#ef4444', glow: 'rgba(239,68,68,0.18)',
    title: { fr: 'Sécurité Renforcée', ht: 'Sekirite Ranfòse' },
    desc: { fr: 'Vos données sont cryptées et sauvegardées automatiquement. Accès sécurisé 24/7.', ht: 'Done ou yo kriptografye epi sovgade otomatikman. Aksè sekirize 24/7.' },
  },
  {
    id: 6, Icon: Zap, color: '#06b6d4', glow: 'rgba(6,182,212,0.18)',
    title: { fr: 'Mode Hors Ligne', ht: 'Mòd San Entènèt' },
    desc: { fr: 'Continuez à vendre sans connexion internet. Synchronisation automatique dès reconnexion.', ht: 'Kontinye vann san koneksyon entènèt. Sinkronizasyon otomatik depi ou rekonekte.' },
  },
];

const glassCard: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  backdropFilter: 'blur(12px)',
};

// ── Desktop staggered grid ────────────────────────────────────────────────────

function FeatureGrid() {
  const { t } = useLanguage();
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <div ref={ref} className="hidden gap-4 sm:grid sm:grid-cols-2 lg:grid-cols-3">
      {FEATURES.map((f, i) => (
        <motion.div
          key={f.id}
          initial={{ opacity: 0, y: 32 }}
          animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 32 }}
          transition={{ duration: 0.55, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
          whileHover={{ scale: 1.025, y: -4 }}
          className="rounded-2xl p-6"
          style={glassCard}
        >
          <div
            className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl"
            style={{ background: f.glow }}
          >
            <f.Icon size={22} style={{ color: f.color }} />
          </div>
          <h3 className="text-base font-semibold text-white">{t(f.title)}</h3>
          <p className="mt-2 text-sm leading-7 text-slate-400">{t(f.desc)}</p>
        </motion.div>
      ))}
    </div>
  );
}

// ── Mobile swipe carousel ─────────────────────────────────────────────────────

function FeatureCarousel() {
  const { t } = useLanguage();
  const [idx, setIdx] = useState(0);
  const [dir, setDir] = useState(1);

  function go(next: number) {
    setDir(next > idx ? 1 : -1);
    setIdx(next);
  }

  const f = FEATURES[idx];

  return (
    <div className="sm:hidden">
      <div className="overflow-hidden" style={{ minHeight: 240 }}>
        <AnimatePresence mode="wait" custom={dir}>
          <motion.div
            key={idx}
            custom={dir}
            initial={{ opacity: 0, x: dir * 56 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: dir * -56 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="rounded-2xl p-7"
            style={glassCard}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.1}
            onDragEnd={(_, info) => {
              if (info.offset.x < -48) go((idx + 1) % FEATURES.length);
              if (info.offset.x > 48) go((idx - 1 + FEATURES.length) % FEATURES.length);
            }}
          >
            <div
              className="mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl"
              style={{ background: f.glow }}
            >
              <f.Icon size={26} style={{ color: f.color }} />
            </div>
            <h3 className="text-xl font-semibold text-white">{t(f.title)}</h3>
            <p className="mt-3 text-sm leading-7 text-slate-400">{t(f.desc)}</p>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="mt-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {FEATURES.map((_, i) => (
            <motion.button
              key={i}
              onClick={() => go(i)}
              animate={{ width: i === idx ? 24 : 8 }}
              transition={{ duration: 0.3 }}
              style={{
                height: 8,
                borderRadius: 999,
                background: i === idx ? '#3b82f6' : 'rgba(255,255,255,0.15)',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
              }}
              aria-label={`Slide ${i + 1}`}
            />
          ))}
        </div>
        <div className="flex gap-2">
          {([ChevronLeft, ChevronRight] as const).map((Icon, i) => (
            <button
              key={i}
              onClick={() => go(i === 0
                ? (idx - 1 + FEATURES.length) % FEATURES.length
                : (idx + 1) % FEATURES.length
              )}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10 hover:text-white"
            >
              <Icon size={18} />
            </button>
          ))}
        </div>
      </div>
      <p className="mt-2 text-right text-xs text-white/20">{idx + 1} / {FEATURES.length}</p>
    </div>
  );
}

// ── Section ───────────────────────────────────────────────────────────────────

export function FeaturesSection() {
  const { t } = useLanguage();
  const headRef = useRef(null);
  const headInView = useInView(headRef, { once: true, margin: '-80px' });

  return (
    <section id="features" className="px-5 py-20 md:px-10 lg:px-16">
      <div className="mx-auto max-w-7xl">
        <motion.div
          ref={headRef}
          initial={{ opacity: 0, y: 24 }}
          animate={headInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
          className="mb-14 text-center"
        >
          <p className="text-xs uppercase tracking-[0.3em] text-blue-400">
            {t({ fr: 'Fonctionnalités', ht: 'Fonksyon yo' })}
          </p>
          <h2 className="mt-3 text-3xl font-bold text-white sm:text-4xl">
            {t({ fr: 'Des outils qui changent tout', ht: 'Zouti ki chanje tout bagay' })}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base text-slate-400">
            {t({
              fr: 'Chaque fonctionnalité est pensée pour la réalité du commerce haïtien.',
              ht: 'Chak fonksyon se panse pou reyalite komès ayisyen an.',
            })}
          </p>
        </motion.div>

        <FeatureGrid />
        <FeatureCarousel />
      </div>
    </section>
  );
}
