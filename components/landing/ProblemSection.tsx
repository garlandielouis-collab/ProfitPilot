'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { X, Check } from 'lucide-react';
import { useLanguage } from '../LanguageWrapper';

// Les six premières douleurs de l'étude de marché inversée (§5), dites avec
// les mots du marchand : c'est le vocabulaire à réutiliser, pas à traduire.
const BEFORE = [
  { fr: '« Je ne sais pas si je gagne de l’argent. »',      ht: '« M pa konn si m ap fè kòb. »' },
  { fr: '« L’argent ne suffit jamais. »',                   ht: '« Kòb la pa janm ase. »' },
  { fr: '« On me doit, je ne me souviens plus combien. »',  ht: '« Moun yo dwe m, m pa sonje konbyen. »' },
  { fr: '« Le dollar monte, je ne peux pas suivre. »',      ht: '« Dola a monte, m pa ka swiv. »' },
  { fr: '« La marchandise disparaît. »',                    ht: '« Machandiz yo ap disparèt. »' },
  { fr: '« Si le cahier se perd, tout est perdu. »',        ht: '« Si kaye a pèdi, tout pèdi. »' },
];

const AFTER = [
  { fr: 'Ce que vous gagnez vraiment, chaque soir',          ht: 'Sa w fè vre, chak swa' },
  { fr: 'Votre salaire à part, l’argent de la maison noté',  ht: 'Salè w apa, lajan lakay la note' },
  { fr: 'Qui vous doit combien, et depuis quand',            ht: 'Kiyès ki dwe w konbyen, e depi kilè' },
  { fr: 'Le taux du jour : vos prix suivent le dollar',      ht: 'To jounen an : pri w yo swiv dola a' },
  { fr: 'Le stock déduit à chaque vente',                    ht: 'Stòk la desann chak vant' },
  { fr: 'Tout est sauvegardé : le kaye ne se mouille plus',  ht: 'Tout bagay sove : kaye a pa ka mouye ankò' },
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
    <section ref={ref} className="relative overflow-hidden bg-surface px-5 py-24 md:px-10">
      <div className="mx-auto max-w-6xl">
        {/* Label */}
        <motion.div
          initial="hidden" animate={inView ? 'visible' : 'hidden'} variants={fadeUp}
          className="mb-4 flex justify-center"
        >
          <span className="rounded-full border border-primary/10 bg-white px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-primary/50">
            {t({ fr: 'La réalité', ht: 'Realite a' })}
          </span>
        </motion.div>

        {/* Headline */}
        <motion.h2
          initial="hidden" animate={inView ? 'visible' : 'hidden'}
          variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { delay: 0.1, duration: 0.6, ease: [0.22, 1, 0.36, 1] as any } } }}
          className="mb-4 text-center text-3xl font-extrabold text-primary sm:text-4xl"
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
          {t({ fr: 'En Haïti, 92 % des petites entreprises ne tiennent aucun registre (FinScope 2023). Le vrai concurrent, c’est le cahier et la mémoire.', ht: 'Ann Ayiti, 92 % ti biznis pa kenbe okenn kaye kont (FinScope 2023). Vrè konkiran an, se kaye a ak memwa a.' })}
        </motion.p>

        {/* Before / After split */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Before */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={inView ? { opacity: 1, x: 0 } : {}}
            transition={{ delay: 0.3, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="rounded-3xl border border-red-100 bg-white p-8"
          >
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-red-50">
                <span className="text-xl">📒</span>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-red-400">{t({ fr: 'Avant ProfitPilot', ht: 'Anvan ProfitPilot' })}</p>
                <p className="font-bold text-primary">{t({ fr: 'Le flou total', ht: 'Flou total la' })}</p>
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
                {t({ fr: '« Je vends beaucoup, mais je ne vois pas l’argent. »', ht: '« M vann anpil, men m pa wè kòb la. »' })}
              </p>
            </div>
          </motion.div>

          {/* After */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={inView ? { opacity: 1, x: 0 } : {}}
            transition={{ delay: 0.4, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="rounded-3xl border border-accent/20 bg-white p-8 relative overflow-hidden"
          >
            <div className="pointer-events-none absolute top-0 right-0 h-48 w-48 rounded-full bg-accent/5 blur-2xl" />
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent/10">
                <span className="text-xl">🚀</span>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-accent">{t({ fr: 'Avec ProfitPilot', ht: 'Avèk ProfitPilot' })}</p>
                <p className="font-bold text-primary">{t({ fr: 'La clarté totale', ht: 'Klarite total la' })}</p>
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
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/15">
                    <Check size={10} className="text-accent" strokeWidth={3} />
                  </div>
                  <span className="text-sm font-medium text-primary">{t(item)}</span>
                </motion.li>
              ))}
            </ul>
            {/* Relief visual */}
            <div className="mt-6 rounded-2xl bg-accent/8 border border-accent/15 p-4">
              <p className="text-center text-2xl mb-1">😌</p>
              <p className="text-center text-xs font-semibold text-accent">
                {t({ fr: '« Je sais enfin ce qui est à moi. »', ht: '« M konnen kounye a sa ki pou mwen. »' })}
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
