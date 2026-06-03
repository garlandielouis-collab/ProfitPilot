'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { useLanguage } from '../LanguageWrapper';
import { MapPin } from 'lucide-react';

const CITIES = [
  'Port-au-Prince', 'Cap-Haïtien', 'Gonaïves',
  'Les Cayes', 'Jacmel', 'Pétionville',
];

export function TrustBar() {
  const { t } = useLanguage();
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 10 }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
      transition={{ duration: 0.6 }}
      className="border-y border-[#E2E8F0] bg-white px-5 py-8 md:px-10"
    >
      <p className="mb-5 text-center text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
        {t({ fr: 'Approuvé par des entrepreneurs à travers Haïti', ht: 'Apwouve pa antreprenè atravè Ayiti' })}
      </p>
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-4">
        {CITIES.map((c, i) => (
          <motion.span
            key={c}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={inView ? { opacity: 1, scale: 1 } : {}}
            transition={{ delay: 0.05 * i, duration: 0.4 }}
            className="flex items-center gap-1.5 rounded-full border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-2 text-sm font-semibold text-[#001f3f]"
          >
            <MapPin size={11} className="text-[#50c878]" />
            {c}
          </motion.span>
        ))}
      </div>
    </motion.div>
  );
}
