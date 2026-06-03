'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

const STEPS = [
  { n: '01', icon: '🏪', title: 'Créez votre compte', desc: 'En 2 minutes, sans carte bancaire. Votre business est configuré instantanément.' },
  { n: '02', icon: '📦', title: 'Ajoutez vos produits', desc: 'Scannez vos codes-barres ou importez votre catalogue. Stock et prix configurés automatiquement.' },
  { n: '03', icon: '💰', title: 'Enregistrez vos ventes', desc: 'Point de vente ultra-rapide. Chaque vente met à jour votre stock et profit en temps réel.' },
  { n: '04', icon: '🤖', title: 'Pilot AI analyse tout', desc: 'L\'intelligence artificielle détecte vos opportunités, vos risques et vous guide vers la croissance.' },
  { n: '05', icon: '📈', title: 'Développez votre business', desc: 'Rapports, bilans, prévisions. Prenez des décisions éclairées et regardez votre business grandir.' },
];

export function HowItWorks() {
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
            Comment ça marche
          </span>
          <h2 className="mt-4 text-3xl font-extrabold text-[#001f3f] sm:text-4xl">
            De <span style={{ background: 'linear-gradient(135deg,#001f3f,#50c878)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>zéro à maître</span> de votre business
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-slate-500">
            En moins de 10 minutes, vous avez une visibilité complète sur votre activité.
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
                        Étape {step.n}
                      </span>
                      <h3 className="mt-1 text-lg font-bold text-[#001f3f]">{step.title}</h3>
                      <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{step.desc}</p>
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
            Commencer maintenant — c'est gratuit
            <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
          </Link>
          <p className="mt-3 text-sm text-slate-400">Aucune carte bancaire requise • Configuration en 2 minutes</p>
        </motion.div>
      </div>
    </section>
  );
}
