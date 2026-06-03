'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { motion, useInView } from 'framer-motion';
import { ArrowRight, Sparkles } from 'lucide-react';
import { useLanguage } from '../LanguageWrapper';

export function CTASection() {
  const { t } = useLanguage();
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <section ref={ref} className="relative overflow-hidden px-5 py-24 md:px-10" style={{ background: '#001f3f' }}>
      {/* Animated orbs */}
      <motion.div
        className="pointer-events-none absolute inset-0"
        animate={{ opacity: [0.3, 0.6, 0.3] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
      >
        <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-[#50c878]/20 blur-3xl" />
        <div className="absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-[#50c878]/15 blur-2xl" />
      </motion.div>

      {/* Grid pattern */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{ backgroundImage: 'linear-gradient(#50c878 1px, transparent 1px), linear-gradient(90deg, #50c878 1px, transparent 1px)', backgroundSize: '48px 48px' }} />

      <div className="relative mx-auto max-w-4xl text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
        >
          <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#50c878]/30 bg-[#50c878]/10 px-4 py-2 text-xs font-semibold text-[#50c878]">
            <Sparkles size={11} />
            {t({ fr: 'Rejoignez 250+ entrepreneurs haïtiens', ht: 'Rejwenn 250+ antreprenè ayisyen' })}
          </span>
        </motion.div>

        <motion.h2
          initial={{ opacity: 0, y: 24 }} animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.1, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="mb-6 text-4xl font-extrabold leading-tight text-white sm:text-5xl"
        >
          {t({
            fr: 'Votre business mérite\nmieux que le flou.',
            ht: 'Biznis ou a merite pi\nbyen pase flou a.',
          })}
        </motion.h2>

        <motion.p
          initial={{ opacity: 0 }} animate={inView ? { opacity: 1 } : {}}
          transition={{ delay: 0.2, duration: 0.6 }}
          className="mx-auto mb-10 max-w-xl text-xl text-white/60"
        >
          {t({
            fr: 'Rejoignez les entrepreneurs qui pilotent leur activité avec confiance, clarté et intelligence artificielle.',
            ht: 'Rejwenn antreprenè ki pilote aktivite yo ak konfyans, klète ak entèlijans atifisyèl.',
          })}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.3, duration: 0.6 }}
          className="flex flex-wrap justify-center gap-4"
        >
          <Link
            href="/onboarding"
            className="group relative inline-flex items-center gap-3 overflow-hidden rounded-2xl bg-[#50c878] px-8 py-4 text-base font-bold text-[#001f3f] shadow-xl transition-all hover:scale-[1.02] hover:bg-[#4db86e] active:scale-95"
            style={{ boxShadow: '0 0 0 1px rgba(80,200,120,0.3), 0 20px 60px rgba(80,200,120,0.3)' }}
          >
            <span className="pointer-events-none absolute inset-0 translate-x-[-120%] skew-x-[-20deg] bg-white/20 transition-transform duration-700 group-hover:translate-x-[120%]" />
            {t({ fr: 'Commencer gratuitement', ht: 'Kòmanse gratis' })}
            <ArrowRight size={16} className="relative transition-transform group-hover:translate-x-1" />
          </Link>

          <Link
            href="/ai-assistant"
            className="inline-flex items-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-8 py-4 text-base font-semibold text-white backdrop-blur-sm transition hover:bg-white/15 active:scale-95"
          >
            <Sparkles size={14} />
            {t({ fr: 'Parler à Pilot AI', ht: 'Pale ak Pilot AI' })}
          </Link>
        </motion.div>

        {/* Trust indicators */}
        <motion.div
          initial={{ opacity: 0 }} animate={inView ? { opacity: 1 } : {}}
          transition={{ delay: 0.5, duration: 0.6 }}
          className="mt-10 flex flex-wrap justify-center gap-6 text-sm text-white/40"
        >
          {[
            '✓ Aucune carte bancaire',
            '✓ Configuration en 2 min',
            '✓ Données sécurisées',
            '✓ Support en français et créole',
          ].map(item => (
            <span key={item} className="font-medium">{item}</span>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
