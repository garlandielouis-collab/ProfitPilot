'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useLanguage } from '../LanguageWrapper';
import { TRIAL_DAYS } from '../../lib/plans';

// L'installation de l'étude de marché inversée (§11.3) : dix minutes, et
// l'étape 4 est la démonstration qui vend le produit.
const STEPS = [
  { n: '01', icon: '🏪', title: { fr: 'Choisissez votre métier', ht: 'Chwazi metye w' }, desc: { fr: 'Machandiz (commerce), Sèvis (service) ou Toulède (les deux). L’écran s’adapte à vous.', ht: 'Machandiz (komès), Sèvis, oswa Toulède. Ekran an adapte l ak ou.' } },
  { n: '02', icon: '📦', title: { fr: 'Vos 10 produits ou services', ht: '10 pwodwi oswa sèvis ou yo' }, desc: { fr: 'Choisis dans un catalogue local déjà rempli ; les prix se modifient.', ht: 'Chwazi nan yon katalòg lokal ki deja plen ; ou ka chanje pri yo.' } },
  { n: '03', icon: '💰', title: { fr: 'L’argent dans la caisse', ht: 'Kòb ki nan kès la' }, desc: { fr: 'Dites combien il y a aujourd’hui : ProfitPilot calcule la caisse attendue chaque soir.', ht: 'Di konbyen ki genyen jodi a : ProfitPilot kalkile kès atandi a chak swa.' } },
  { n: '04', icon: '📷', title: { fr: 'Pran foto kaye ou', ht: 'Pran foto kaye ou' }, desc: { fr: 'Photographiez votre cahier de crédit : la liste « qui me doit combien » apparaît, vous corrigez et validez.', ht: 'Pran foto kaye kredi w : lis « kiyès ki dwe m konbyen » parèt, ou korije epi ou valide.' } },
  { n: '05', icon: '📈', title: { fr: 'L’heure du bilan', ht: 'Lè rapò a' }, desc: { fr: 'Choisissez l’heure du bilan du soir. C’est fini : vous vendez, il compte.', ht: 'Chwazi lè rapò chak swa a. Se tout : ou vann, li konte.' } },
];

export function HowItWorks() {
  const { t } = useLanguage();
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });

  return (
    <section ref={ref} className="relative overflow-hidden bg-surface px-5 py-24 md:px-10">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="mb-16 text-center"
        >
          <span className="mb-4 inline-block rounded-full border border-primary/10 bg-white px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-primary/50">
            {t({ fr: 'Comment ça marche', ht: 'Kijan li fonksyone' })}
          </span>
          <h2 className="mt-4 text-3xl font-extrabold text-primary sm:text-4xl">
            {t({ fr: 'De', ht: 'Soti' })} <span style={{ background: 'linear-gradient(135deg,#001f3f,#50c878)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{t({ fr: 'zéro à maître', ht: 'zewo a mèt' })}</span> {t({ fr: 'de votre business', ht: 'de biznis ou' })}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-slate-500">
            {t({ fr: 'En moins de 10 minutes, vous avez une visibilité complète sur votre activité.', ht: 'An mwens pase 10 minit, ou gen yon vizibilite konplè sou aktivite ou.' })}
          </p>
        </motion.div>

        {/* Steps */}
        <div className="relative">
          {/* Connecting line */}
          <div className="absolute left-[28px] top-8 bottom-8 w-px bg-gradient-to-b from-accent/20 via-accent/40 to-accent/20 hidden sm:block" />

          <div className="flex flex-col gap-6">
            {STEPS.map((step, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -20 }}
                animate={inView ? { opacity: 1, x: 0 } : {}}
                transition={{ delay: 0.1 + i * 0.12, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                className="flex items-start gap-5"
              >
                {/* Step indicator */}
                <div className="relative z-10 flex shrink-0 flex-col items-center">
                  <motion.div
                    whileHover={{ scale: 1.1 }}
                    className="flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-accent/20 bg-white text-2xl"
                  >
                    {step.icon}
                  </motion.div>
                </div>

                {/* Content */}
                <div className="flex-1 rounded-2xl border border-border bg-white p-5 transition-all hover:border-accent/20 hover:shadow-md">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <span className="text-note font-bold uppercase tracking-widest text-accent">
                        {t({ fr: 'Étape', ht: 'Etap' })} {step.n}
                      </span>
                      <h3 className="mt-1 text-lg font-bold text-primary">{t(step.title)}</h3>
                      <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{t(step.desc)}</p>
                    </div>
                    <div className="hidden shrink-0 rounded-xl bg-accent/8 px-3 py-1.5 sm:block">
                      <p className="text-2xl font-black text-accent/30">{step.n}</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.8, duration: 0.6 }}
          className="mt-12 text-center"
        >
          <Link
            href="/onboarding"
            className="group inline-flex items-center gap-3 rounded-2xl bg-primary px-8 py-4 text-base font-bold text-white shadow-xl transition-all hover:scale-[1.02] hover:bg-primary/90 active:scale-95"
          >
            {t({ fr: `Essayer ${TRIAL_DAYS} jours gratuitement`, ht: `Eseye l gratis ${TRIAL_DAYS} jou` })}
            <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
          </Link>
          <p className="mt-3 text-sm text-slate-400">{t({ fr: 'Aucune carte bancaire · Installation en 10 minutes', ht: 'Pa gen kat bank · Enstalasyon an 10 minit' })}</p>
        </motion.div>
      </div>
    </section>
  );
}
