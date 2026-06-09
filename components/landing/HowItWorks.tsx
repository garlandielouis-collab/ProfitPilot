'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useLanguage } from '../LanguageWrapper';

const STEPS = [
  { n: '01', icon: '🏪', title: { fr: 'Créez votre compte', ht: 'Kreye kont ou' }, desc: { fr: 'En 2 minutes, sans carte bancaire. Votre business est configuré instantanément.', ht: 'An 2 minit, san kat bank. Biznis ou konfigire imedyatman.' } },
  { n: '02', icon: '📦', title: { fr: 'Ajoutez vos produits', ht: 'Ajoute pwodui ou yo' }, desc: { fr: 'Scannez vos codes-barres ou importez votre catalogue. Stock et prix configurés automatiquement.', ht: 'Skane kòd ba ou yo oswa enpòte katalòg ou. Stock ak pri konfigire otomatikman.' } },
  { n: '03', icon: '💰', title: { fr: 'Enregistrez vos ventes', ht: 'Anrejistre vant ou yo' }, desc: { fr: 'Point de vente ultra-rapide. Chaque vente met à jour votre stock et profit en temps réel.', ht: 'Pwen vant ultra-rapid. Chak vant mete ajou stock ak pwofi ou an tan reyèl.' } },
  { n: '04', icon: '🤖', title: { fr: 'Pilot AI analyse tout', ht: 'Pilot AI analize tout' }, desc: { fr: 'L\'intelligence artificielle détecte vos opportunités, vos risques et vous guide vers la croissance.', ht: 'Entèlijans atifisyèl detekte opòtinite ou yo, risk ou yo epi gide w nan kwasans lan.' } },
  { n: '05', icon: '📈', title: { fr: 'Développez votre business', ht: 'Devlope biznis ou' }, desc: { fr: 'Rapports, bilans, prévisions. Prenez des décisions éclairées et regardez votre business grandir.', ht: 'Rapò, bilans, prévisions. Pran desizyon éklere epi gade biznis ou grandi.' } },
];

export function HowItWorks() {
  const { t } = useLanguage();
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });

  return (
    <section ref={ref} className="relative overflow-hidden bg-[#F8FAFC] px-5 py-24 md:px-10">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="mb-16 text-center"
        >
          <span className="mb-4 inline-block rounded-full border border-[#001f3f]/10 bg-white px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-[#001f3f]/50 shadow-sm">
            {t({ fr: 'Comment ça marche', ht: 'Kijan li fonksyone' })}
          </span>
          <h2 className="mt-4 text-3xl font-extrabold text-[#001f3f] sm:text-4xl">
            {t({ fr: 'De', ht: 'Soti' })} <span style={{ background: 'linear-gradient(135deg,#001f3f,#50c878)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{t({ fr: 'zéro à maître', ht: 'zewo a mèt' })}</span> {t({ fr: 'de votre business', ht: 'de biznis ou' })}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-slate-500">
            {t({ fr: 'En moins de 10 minutes, vous avez une visibilité complète sur votre activité.', ht: 'An mwens pase 10 minit, ou gen yon vizibilite konplè sou aktivite ou.' })}
          </p>
        </motion.div>

        {/* Steps */}
        <div className="relative">
          {/* Connecting line */}
          <div className="absolute left-[28px] top-8 bottom-8 w-px bg-gradient-to-b from-[#50c878]/20 via-[#50c878]/40 to-[#50c878]/20 hidden sm:block" />

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
                    className="flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-[#50c878]/20 bg-white shadow-md text-2xl"
                  >
                    {step.icon}
                  </motion.div>
                </div>

                {/* Content */}
                <div className="flex-1 rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm transition-all hover:border-[#50c878]/20 hover:shadow-md">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-[#50c878]">
                        {t({ fr: 'Étape', ht: 'Etap' })} {step.n}
                      </span>
                      <h3 className="mt-1 text-lg font-bold text-[#001f3f]">{t(step.title)}</h3>
                      <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{t(step.desc)}</p>
                    </div>
                    <div className="hidden shrink-0 rounded-xl bg-[#50c878]/8 px-3 py-1.5 sm:block">
                      <p className="text-2xl font-black text-[#50c878]/30">{step.n}</p>
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
            className="group inline-flex items-center gap-3 rounded-2xl bg-[#001f3f] px-8 py-4 text-base font-bold text-white shadow-xl transition-all hover:scale-[1.02] hover:bg-[#001f3f]/90 active:scale-95"
          >
            {t({ fr: 'Commencer maintenant — c\'est gratuit', ht: 'Kòmanse kounye a — li gratis' })}
            <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
          </Link>
          <p className="mt-3 text-sm text-slate-400">{t({ fr: 'Aucune carte bancaire requise • Configuration en 2 minutes', ht: 'Pa gen kat bank ki nesesè • Konfigirasyon an 2 minit' })}</p>
        </motion.div>
      </div>
    </section>
  );
}
