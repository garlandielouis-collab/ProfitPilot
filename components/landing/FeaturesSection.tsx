'use client';

import { useRef, useState } from 'react';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import { ChevronLeft, ChevronRight, Coins, HandCoins, MessageCircle, Mic, WifiOff, Zap } from 'lucide-react';
import { useLanguage } from '../LanguageWrapper';

// Les six fonctions qui répondent aux six premières douleurs (étude de marché
// inversée, §5 et §12). « Double Comptabilité » est partie avec la
// comptabilité elle-même (§12.1) : on remplace le cahier, pas le comptable.
const FEATURES = [
  {
    id: 1, Icon: Zap, color: '#1d4ed8', glow: 'rgba(59,130,246,0.18)',
    title: { fr: 'Une vente en 3 secondes', ht: 'Yon vant an 3 segonn' },
    desc: { fr: 'Un tap sur un favori, ou juste le montant. Plus rapide que d’écrire dans le cahier.', ht: 'Yon tap sou yon favori, oswa montan an sèlman. Pi vit pase ekri nan kaye a.' },
  },
  {
    id: 2, Icon: Mic, color: '#50c878', glow: 'rgba(16,185,129,0.18)',
    title: { fr: 'Parlez au kaye', ht: 'Pale ak kaye a' },
    desc: { fr: '« M vann 2 kola 150 goud » : vous le dites, ProfitPilot le note, vous confirmez d’un tap.', ht: '« M vann 2 kola 150 goud » : ou di l, ProfitPilot note l, ou konfime an yon tap.' },
  },
  {
    id: 3, Icon: HandCoins, color: '#64748b', glow: 'rgba(139,92,246,0.18)',
    title: { fr: 'Le cahier de crédit', ht: 'Kaye kredi a' },
    desc: { fr: 'Qui vous doit combien, depuis quand, et un rappel WhatsApp poli, envoyé par vous.', ht: 'Kiyès ki dwe w konbyen, depi kilè, ak yon rapèl WhatsApp poli, se ou ki voye l.' },
  },
  {
    id: 4, Icon: MessageCircle, color: '#b45309', glow: 'rgba(245,158,11,0.18)',
    title: { fr: 'Le bilan du soir', ht: 'Rapò chak swa' },
    desc: { fr: 'Vendu, dépensé, gagné, caisse attendue, qui doit quoi, et un conseil : il vient à vous.', ht: 'Sa w vann, sa w depanse, sa w fè, kès atandi, kiyès ki dwe w, ak yon konsèy : li vin jwenn ou.' },
  },
  {
    id: 5, Icon: Coins, color: '#dc2626', glow: 'rgba(239,68,68,0.18)',
    title: { fr: 'Goud, dola, dollar', ht: 'Goud, dola, dola ameriken' },
    desc: { fr: 'Notez dans l’unité de votre choix ; le taux du jour fait le calcul et vos prix suivent le dollar.', ht: 'Note nan sa w vle ; to jounen an fè kalkil la, epi pri w yo swiv dola a.' },
  },
  {
    id: 6, Icon: WifiOff, color: '#64748b', glow: 'rgba(6,182,212,0.18)',
    title: { fr: 'Sans internet, sans rien perdre', ht: 'San entènèt, san pèdi anyen' },
    desc: { fr: 'La vente rapide marche sans réseau et part au retour du réseau. Tout est sauvegardé.', ht: 'Vann rapid la mache san rezo, li pati lè rezo a tounen. Tout bagay sove.' },
  },
];

const glassCard: React.CSSProperties = {
  background: '#FFFFFF',
  border: '1px solid #E2E8F0',
  boxShadow: '0 2px 12px rgba(0,31,63,0.05)',
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
          <h3 className="text-base font-semibold text-primary">{t(f.title)}</h3>
          <p className="mt-2 text-sm leading-7 text-slate-500">{t(f.desc)}</p>
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
            <h3 className="text-xl font-semibold text-primary">{t(f.title)}</h3>
            <p className="mt-3 text-sm leading-7 text-slate-500">{t(f.desc)}</p>
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
                background: i === idx ? '#001f3f' : '#E2E8F0',
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
              className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-white text-slate-500 transition hover:bg-slate-50 hover:text-primary"
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
    <section id="features" className="bg-surface px-5 py-20 md:px-10 lg:px-16">
      <div className="mx-auto max-w-7xl">
        <motion.div
          ref={headRef}
          initial={{ opacity: 0, y: 24 }}
          animate={headInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
          className="mb-14 text-center"
        >
          <p className="text-xs uppercase tracking-[0.3em] text-accent">
            {t({ fr: 'Fonctionnalités', ht: 'Fonksyon yo' })}
          </p>
          <h2 className="mt-3 text-3xl font-bold text-primary sm:text-4xl">
            {t({ fr: 'Des outils qui changent tout', ht: 'Zouti ki chanje tout bagay' })}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base text-slate-500">
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
