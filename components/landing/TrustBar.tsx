'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { useLanguage } from '../LanguageWrapper';

const CITIES = ['Port-au-Prince', 'Cap-Haïtien', 'Gonaïves', 'Les Cayes', 'Jacmel', 'Pétionville'];

export function TrustBar() {
  const { t } = useLanguage();
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0 }}
      animate={inView ? { opacity: 1 } : { opacity: 0 }}
      transition={{ duration: 0.7 }}
      className="px-5 py-8 md:px-10"
      style={{
        borderTop: '1px solid rgba(255,255,255,0.06)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <p className="mb-5 text-center text-xs uppercase tracking-[0.3em] text-slate-600">
        {t({ fr: 'Approuvé par des entrepreneurs à travers Haïti', ht: 'Apwouve pa antreprenè atravè Ayiti' })}
      </p>
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-6 opacity-35">
        {CITIES.map(c => (
          <span key={c} className="text-sm font-semibold text-slate-400">
            {c}
          </span>
        ))}
      </div>
    </motion.div>
  );
}
