'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { motion, useInView } from 'framer-motion';
import { Mail, MessageSquare, Phone } from 'lucide-react';
import { useLanguage } from '../LanguageWrapper';

const COLS = [
  {
    title: { fr: 'Produit', ht: 'Pwodwi' },
    links: [
      { l: { fr: 'Fonctionnalités', ht: 'Fonksyon' }, h: '#features' },
      { l: { fr: 'Tarifs', ht: 'Pri' }, h: '/pricing' },
      { l: { fr: 'Dashboard', ht: 'Dashboard' }, h: '/dashboard' },
      { l: { fr: 'Pilot AI', ht: 'Pilot AI' }, h: '/ai-assistant' },
    ],
  },
  {
    title: { fr: 'Ressources', ht: 'Resous' },
    links: [
      { l: { fr: 'Guide de démarrage', ht: 'Gid kòmanse' }, h: '/guide' },
      { l: { fr: 'Blog', ht: 'Blog' }, h: '/blog' },
      { l: { fr: 'FAQ', ht: 'FAQ' }, h: '/faq' },
      { l: { fr: 'Mises à jour', ht: 'Mizajou' }, h: '/updates' },
    ],
  },
  {
    title: { fr: 'Légal', ht: 'Legal' },
    links: [
      { l: { fr: "Conditions d'utilisation", ht: 'Kondisyon itilizasyon' }, h: '/legal/terms' },
      { l: { fr: 'Confidentialité', ht: 'Konfidansyalite' }, h: '/legal/privacy' },
      { l: { fr: 'Cookies', ht: 'Cookies' }, h: '/legal/cookies' },
    ],
  },
];

export function Footer() {
  const { t } = useLanguage();
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });

  return (
    <footer className="border-t border-[#E2E8F0] bg-[#001f3f]">
      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: 20 }}
        animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] as any }}
        className="mx-auto max-w-7xl px-5 py-14 md:px-10"
      >
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-5">
          {/* Brand + Service Client */}
          <div className="lg:col-span-2">
            <div className="flex items-center gap-3">
              <img
                src="/profitpilot-logo.png"
                alt="ProfitPilot"
                className="h-9 w-9 rounded-xl object-contain"
              />
              <span className="font-bold text-white text-lg">ProfitPilot</span>
            </div>

            <p className="mt-4 max-w-xs text-sm leading-7 text-white/60">
              {t({
                fr: 'La solution de gestion intelligente pour les entrepreneurs haïtiens modernes.',
                ht: 'Solisyon jèsyon entèlijan pou antreprenè ayisyen modèn yo.',
              })}
            </p>

            {/* Service Client */}
            <div className="mt-6">
              <p className="mb-3 text-xs font-bold uppercase tracking-[0.22em] text-[#50c878]">
                {t({ fr: 'Service Client', ht: 'Sèvis Kliyan' })}
              </p>
              <div className="flex flex-col gap-3">
                <a
                  href="https://wa.me/50935045946"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-white/70 transition hover:text-[#50c878]"
                >
                  <MessageSquare size={14} className="text-[#50c878]" />
                  WhatsApp: +509 3504-5946
                </a>
                <a
                  href="mailto:garlandielouis178@gmail.com"
                  className="inline-flex items-center gap-2 text-sm text-white/70 transition hover:text-[#50c878]"
                >
                  <Mail size={14} className="text-[#50c878]" />
                  garlandielouis178@gmail.com
                </a>
                <a
                  href="tel:+50935045946"
                  className="inline-flex items-center gap-2 text-sm text-white/70 transition hover:text-[#50c878]"
                >
                  <Phone size={14} className="text-[#50c878]" />
                  +509 3504-5946
                </a>
              </div>
            </div>
          </div>

          {/* Link columns */}
          {COLS.map(col => (
            <div key={col.title.fr}>
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.22em] text-[#50c878]">
                {t(col.title)}
              </p>
              <ul className="space-y-3">
                {col.links.map(lk => (
                  <li key={lk.l.fr}>
                    <Link
                      href={lk.h}
                      className="text-sm text-white/60 transition hover:text-white"
                    >
                      {t(lk.l)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-8 sm:flex-row">
          <p className="text-xs text-white/40">
            © {new Date().getFullYear()} ProfitPilot.{' '}
            {t({ fr: 'Tous droits réservés.', ht: 'Tout dwa rezève.' })}
          </p>
          <p className="text-xs font-semibold text-[#50c878]">
            {t({ fr: 'Fait avec ❤️ pour Haïti', ht: 'Fèt ak ❤️ pou Ayiti' })}
          </p>
        </div>
      </motion.div>
    </footer>
  );
}
