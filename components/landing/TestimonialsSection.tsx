'use client';

import { useRef, useState } from 'react';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import { ChevronLeft, ChevronRight, Star } from 'lucide-react';
import { useLanguage } from '../LanguageWrapper';

const TESTIMONIALS = [
  {
    id: 1, avatar: 'JD', bg: '#1d4ed8', name: 'Jean-Pierre Duval',
    role: { fr: 'Marchand, Port-au-Prince', ht: 'Machann, Pòtoprens' },
    quote: { fr: '"ProfitPilot m\'a permis de voir exactement où part mon argent. En 3 mois, j\'ai augmenté mes marges de 22%."', ht: '"ProfitPilot te pèmèt mwen wè egzakteman kote lajan mwen al. Nan 3 mwa, mwen ogmante maj mwen pa 22%."' },
  },
  {
    id: 2, avatar: 'MC', bg: '#7c3aed', name: 'Marie Célestin',
    role: { fr: 'Propriétaire Boutique', ht: 'Pwopriyetè Boutik' },
    quote: { fr: '"Le suivi des dettes et des ventes est devenu simple. Je sais enfin ce que je dois à chaque fournisseur."', ht: '"Swivi dèt ak vant yo vin senp. Mwen konn kounye a sa mwen dwe chak founisè."' },
  },
  {
    id: 3, avatar: 'CJ', bg: '#059669', name: 'Claudel Joseph',
    role: { fr: 'Grossiste, Cap-Haïtien', ht: 'Grosist, Okap' },
    quote: { fr: '"PilotAI m\'a conseillé de réduire 2 produits lents. Ça m\'a libéré du cash que je ne savais pas avoir."', ht: '"PilotAI te konseye mwen pou rédui 2 pwodwi ki pran tan. Sa te libere lajan mwen pa t konnen mwen te genyen."' },
  },
  {
    id: 4, avatar: 'RP', bg: '#b45309', name: 'Roseline Pierre',
    role: { fr: 'Épicerie, Pétionville', ht: 'Epis, Petyonvil' },
    quote: { fr: '"Le scan est révolutionnaire. Ce qui prenait 1 heure de saisie me prend maintenant 5 minutes."', ht: '"Eskan an revolisyonè. Sa ki te pran 1 è antre done pran mwen kounye a 5 minit."' },
  },
];

const glassCard: React.CSSProperties = {
  background: '#FFFFFF',
  border: '1px solid #E2E8F0',
  boxShadow: '0 4px 24px rgba(0,31,63,0.06)',
};

export function TestimonialsSection() {
  const { language, t } = useLanguage();
  const [idx, setIdx] = useState(0);
  const [dir, setDir] = useState(1);
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });

  function go(next: number) {
    setDir(next > idx ? 1 : -1);
    setIdx(next);
  }

  const tm = TESTIMONIALS[idx];

  return (
    <section
      id="testimonials"
      className="px-5 py-20 md:px-10 lg:px-16"
      style={{ background: '#FFFFFF' }}
    >
      <div className="mx-auto max-w-4xl">
        {/* Heading */}
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 24 }}
          animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
          className="mb-14 text-center"
        >
          <p className="text-xs uppercase tracking-[0.3em] text-[#50c878]">
            {t({ fr: 'Témoignages', ht: 'Temwayaj' })}
          </p>
          <h2 className="mt-3 text-3xl font-bold text-[#001f3f] sm:text-4xl">
            {t({ fr: 'Ils ont transformé leur business', ht: 'Yo te transfòme biznis yo' })}
          </h2>
        </motion.div>

        {/* Carousel */}
        <div style={{ minHeight: 280 }} className="overflow-hidden rounded-[28px]">
          <AnimatePresence mode="wait" custom={dir}>
            <motion.div
              key={idx}
              custom={dir}
              initial={{ opacity: 0, x: dir * 60 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: dir * -60 }}
              transition={{ duration: 0.32, ease: 'easeInOut' }}
              className="rounded-[28px] p-8 md:p-10"
              style={glassCard}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.1}
              onDragEnd={(_, info) => {
                if (info.offset.x < -50) go((idx + 1) % TESTIMONIALS.length);
                if (info.offset.x > 50) go((idx - 1 + TESTIMONIALS.length) % TESTIMONIALS.length);
              }}
            >
              <div className="mb-4 flex gap-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} size={14} fill="#f59e0b" className="text-amber-400" />
                ))}
              </div>
              <p className="text-base leading-8 text-slate-600 md:text-lg md:leading-9">
                {language === 'ht' ? tm.quote.ht : tm.quote.fr}
              </p>
              <div className="mt-6 flex items-center gap-4">
                <div
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                  style={{ background: tm.bg }}
                >
                  {tm.avatar}
                </div>
                <div>
                  <p className="font-semibold text-[#001f3f]">{tm.name}</p>
                  <p className="text-sm text-slate-500">
                    {language === 'ht' ? tm.role.ht : tm.role.fr}
                  </p>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Controls */}
        <div className="mt-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {TESTIMONIALS.map((_, i) => (
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
                aria-label={`Témoignage ${i + 1}`}
              />
            ))}
          </div>
          <div className="flex gap-2">
            {([ChevronLeft, ChevronRight] as const).map((Icon, i) => (
              <button
                key={i}
                onClick={() => go(i === 0
                  ? (idx - 1 + TESTIMONIALS.length) % TESTIMONIALS.length
                  : (idx + 1) % TESTIMONIALS.length
                )}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-[#E2E8F0] bg-white text-slate-500 transition hover:bg-slate-50 hover:text-[#001f3f]"
              >
                <Icon size={18} />
              </button>
            ))}
          </div>
        </div>
        <p className="mt-2 text-right text-xs text-white/20">
          {idx + 1} / {TESTIMONIALS.length}
        </p>
      </div>
    </section>
  );
}
