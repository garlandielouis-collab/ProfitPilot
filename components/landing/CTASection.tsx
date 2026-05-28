'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { motion, useInView } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { useLanguage } from '../LanguageWrapper';

export function CTASection() {
  const { t } = useLanguage();
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <section className="relative overflow-hidden px-5 py-24 md:px-10">
      {/* Animated background orb */}
      <motion.div
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
        animate={{ scale: [1, 1.06, 1] }}
        transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
      >
        <div
          className="h-[400px] w-[600px] rounded-full blur-[100px]"
          style={{
            background:
              'radial-gradient(ellipse,rgba(59,130,246,0.14) 0%,rgba(139,92,246,0.09) 55%,transparent 100%)',
          }}
        />
      </motion.div>

      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: 32 }}
        animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 32 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
        className="relative mx-auto max-w-2xl text-center"
      >
        <h2 className="text-3xl font-bold text-white sm:text-4xl lg:text-5xl">
          {t({ fr: 'Prêt à décupler vos profits ?', ht: 'Prè pou miltipliye pwofi ou yo ?' })}
        </h2>
        <p className="mx-auto mt-5 max-w-lg text-base text-slate-400">
          {t({
            fr: 'Rejoignez 250+ commerçants haïtiens qui pilotent leur business avec précision.',
            ht: 'Rantre nan 250+ machann ayisyen ki pilote biznis yo ak presizyon.',
          })}
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-4">
          {/* Primary — blue/purple gradient */}
          <Link
            href="/auth/register"
            className="group inline-flex items-center gap-2 rounded-2xl px-8 py-4 text-base font-semibold text-white transition hover:opacity-90 active:scale-95"
            style={{ background: 'linear-gradient(135deg,#3b82f6 0%,#8b5cf6 100%)' }}
          >
            {t({ fr: 'Commencer gratuitement', ht: 'Kòmanse gratis' })}
            <ArrowRight size={18} className="transition group-hover:translate-x-1" />
          </Link>

          {/* Secondary — red CTA */}
          <Link
            href="/pricing"
            className="inline-flex items-center rounded-2xl px-8 py-4 text-base font-semibold text-white transition hover:opacity-90 active:scale-95"
            style={{ background: 'linear-gradient(135deg,#ef4444 0%,#dc2626 100%)' }}
          >
            {t({ fr: 'Voir les tarifs', ht: 'Wè pri yo' })}
          </Link>
        </div>

        <p className="mt-5 text-xs text-slate-600">
          {t({
            fr: '✓ Essai 14 jours gratuit  ✓ Sans carte de crédit  ✓ Annulez à tout moment',
            ht: '✓ Esè 14 jou gratis  ✓ San kat kredi  ✓ Anile nenpòt ki lè',
          })}
        </p>
      </motion.div>
    </section>
  );
}
