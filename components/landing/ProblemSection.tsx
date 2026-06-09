'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { X, Check } from 'lucide-react';
import { useLanguage } from '../LanguageWrapper';

const BEFORE = [
  { fr: 'Cahier papier et calculs manuels', ht: 'Kaye papye ak kalkil manyèl' },
  { fr: 'Excel compliqué, formules cassées', ht: 'Excel konplike, fòmil kase' },
  { fr: 'Vous ne savez pas votre vrai profit', ht: 'Ou pa konnen vrè pwofi ou' },
  { fr: 'Stock perdu, vols non détectés', ht: 'Stock pèdi, vòl pa detekte' },
  { fr: 'Panique en fin de mois', ht: 'Panik nan fen mwa' },
  { fr: 'Décisions prises à l\'instinct', ht: 'Desizyon pran sou ensten' },
];

const AFTER = [
  { fr: 'Tableau de bord en temps réel', ht: 'Tablo debò an tan reyèl' },
  { fr: 'Ventes et achats en 3 secondes', ht: 'Vant ak acha an 3 segond' },
  { fr: 'Profit exact à chaque instant', ht: 'Pwofi egzak chak moman' },
  { fr: 'Alertes stock automatiques', ht: 'Alèt stock otomatik' },
  { fr: 'Sérénité et contrôle total', ht: 'Serenite ak kontwòl total' },
  { fr: 'Décisions guidées par l\'IA', ht: 'Desizyon gide pa IA' },
];

const fadeUp = {
  hidden:  { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as any } },
};

export function ProblemSection() {
  const { t } = useLanguage();
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <section ref={ref} className="relative overflow-hidden bg-[#F8FAFC] px-5 py-24 md:px-10">
      <div className="mx-auto max-w-6xl">
        {/* Label */}
        <motion.div
          initial="hidden" animate={inView ? 'visible' : 'hidden'} variants={fadeUp}
          className="mb-4 flex justify-center"
        >
          <span className="rounded-full border border-[#001f3f]/10 bg-white px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-[#001f3f]/50 shadow-sm">
            {t({ fr: 'La réalité', ht: 'Realite a' })}
          </span>
        </motion.div>

        {/* Headline */}
        <motion.h2
          initial="hidden" animate={inView ? 'visible' : 'hidden'}
          variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { delay: 0.1, duration: 0.6, ease: [0.22, 1, 0.36, 1] as any } } }}
          className="mb-4 text-center text-3xl font-extrabold text-[#001f3f] sm:text-4xl"
        >
           {t({ fr: 'Vous travaillez dur.', ht: 'Ou travay di.' })}<br />
           <span style={{ background: 'linear-gradient(135deg,#001f3f,#50c878)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
             {t({ fr: 'Mais savez-vous réellement combien vous gagnez ?', ht: 'Men èske ou reyèlman konnen konbyen ou genyen ?' })}
           </span>
        </motion.h2>

        <motion.p
          initial="hidden" animate={inView ? 'visible' : 'hidden'}
          variants={{ hidden: { opacity: 0 }, visible: { opacity: 1, transition: { delay: 0.2, duration: 0.6 } } }}
          className="mx-auto mb-14 max-w-2xl text-center text-lg text-slate-500"
        >
          {t({ fr: 'La plupart des entrepreneurs haïtiens gèrent leur business dans le flou total. ProfitPilot change ça — définitivement.', ht: 'Pifò antreprenè ayisyen jere biznis yo nan flou total. ProfitPilot chanje sa — definitivman.' })}
        </motion.p>

        {/* Before / After split */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Before */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={inView ? { opacity: 1, x: 0 } : {}}
            transition={{ delay: 0.3, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="rounded-3xl border border-red-100 bg-white p-8 shadow-sm"
          >
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-red-50">
                <span className="text-xl">📒</span>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-red-400">{t({ fr: 'Avant ProfitPilot', ht: 'Anvan ProfitPilot' })}</p>
                <p className="font-bold text-[#001f3f]">{t({ fr: 'Le flou total', ht: 'Flou total la' })}</p>
              </div>
            </div>
            <ul className="space-y-3">
              {BEFORE.map((item, i) => (
                <motion.li
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={inView ? { opacity: 1, x: 0 } : {}}
                  transition={{ delay: 0.4 + i * 0.08, duration: 0.4 }}
                  className="flex items-center gap-3"
                >
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-100">
                    <X size={10} className="text-red-500" strokeWidth={3} />
                  </div>
                  <span className="text-sm text-slate-500">{t(item)}</span>
                </motion.li>
              ))}
            </ul>
            {/* Stress visual */}
            <div className="mt-6 rounded-2xl bg-red-50 p-4">
              <p className="text-center text-2xl mb-1">😰</p>
              <p className="text-center text-xs font-semibold text-red-500">
                {t({ fr: '"Je ne sais pas si je fais des profits ou des pertes..."', ht: '"M pa konnen si m ap fè pwofi oswa pèt..."' })}
              </p>
            </div>
          </motion.div>

          {/* After */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={inView ? { opacity: 1, x: 0 } : {}}
            transition={{ delay: 0.4, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="rounded-3xl border border-[#50c878]/20 bg-white p-8 shadow-sm relative overflow-hidden"
          >
            <div className="pointer-events-none absolute top-0 right-0 h-48 w-48 rounded-full bg-[#50c878]/5 blur-2xl" />
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#50c878]/10">
                <span className="text-xl">🚀</span>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-[#50c878]">{t({ fr: 'Avec ProfitPilot', ht: 'Avèk ProfitPilot' })}</p>
                <p className="font-bold text-[#001f3f]">{t({ fr: 'La clarté totale', ht: 'Klarite total la' })}</p>
              </div>
            </div>
            <ul className="space-y-3">
              {AFTER.map((item, i) => (
                <motion.li
                  key={i}
                  initial={{ opacity: 0, x: 10 }}
                  animate={inView ? { opacity: 1, x: 0 } : {}}
                  transition={{ delay: 0.5 + i * 0.08, duration: 0.4 }}
                  className="flex items-center gap-3"
                >
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#50c878]/15">
                    <Check size={10} className="text-[#50c878]" strokeWidth={3} />
                  </div>
                  <span className="text-sm font-medium text-[#001f3f]">{t(item)}</span>
                </motion.li>
              ))}
            </ul>
            {/* Relief visual */}
            <div className="mt-6 rounded-2xl bg-[#50c878]/8 border border-[#50c878]/15 p-4">
              <p className="text-center text-2xl mb-1">😌</p>
              <p className="text-center text-xs font-semibold text-[#50c878]">
                {t({ fr: '"Je vois enfin où va chaque gourde. Je contrôle mon business."', ht: '"M wè finalman kote chak goud ale. M ap kontwole biznis mwen."' })}
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
