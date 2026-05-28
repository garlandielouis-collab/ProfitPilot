'use client';

import { useRef } from 'react';
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
      { l: { fr: 'PilotAI', ht: 'PilotAI' }, h: '/ai-assistant' },
    ],
  },
  {
    title: { fr: 'Ressources', ht: 'Resous' },
    links: [
      { l: { fr: 'Guide de démarrage', ht: 'Gid kòmanse' }, h: '#' },
      { l: { fr: 'Blog', ht: 'Blog' }, h: '#' },
      { l: { fr: 'FAQ', ht: 'FAQ' }, h: '#' },
      { l: { fr: 'Mises à jour', ht: 'Mizajou' }, h: '#' },
    ],
  },
  {
    title: { fr: 'Légal', ht: 'Legal' },
    links: [
      { l: { fr: "Conditions d'utilisation", ht: 'Kondisyon itilizasyon' }, h: '#' },
      { l: { fr: 'Confidentialité', ht: 'Konfidansyalite' }, h: '#' },
      { l: { fr: 'Cookies', ht: 'Cookies' }, h: '#' },
    ],
  },
];

const gradBtn: React.CSSProperties = {
  background: 'linear-gradient(135deg,#3b82f6 0%,#8b5cf6 100%)',
};

export function Footer() {
  const { t } = useLanguage();
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });

  return (
    <footer style={{ background: '#05070A', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: 20 }}
        animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
        className="mx-auto max-w-7xl px-5 py-14 md:px-10"
      >
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-5">
          {/* Brand + Service Client */}
          <div className="lg:col-span-2">
            <div className="flex items-center gap-3">
              <div
                className="flex h-9 w-9 items-center justify-center rounded-xl text-xs font-bold text-white"
                style={gradBtn}
              >
                PP
              </div>
              <span className="font-semibold text-white">ProfitPilot</span>
            </div>
            <p className="mt-4 max-w-xs text-sm leading-7 text-slate-500">
              {t({
                fr: 'La solution de gestion intelligente pour les entrepreneurs haïtiens modernes.',
                ht: 'Solisyon jèsyon entèlijan pou antreprenè ayisyen modèn yo.',
              })}
            </p>

            {/* Service Client */}
            <div className="mt-6">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                {t({ fr: 'Service Client', ht: 'Sèvis Kliyan' })}
              </p>
              <div className="flex flex-col gap-2.5">
                <a
                  href="https://wa.me/50900000000"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-slate-500 transition hover:text-emerald-400"
                >
                  <MessageSquare size={14} className="text-emerald-500" />
                  WhatsApp: +509 XXXX-XXXX
                </a>
                <a
                  href="mailto:support@profitpilot.app"
                  className="inline-flex items-center gap-2 text-sm text-slate-500 transition hover:text-blue-400"
                >
                  <Mail size={14} className="text-blue-400" />
                  support@profitpilot.app
                </a>
                <a
                  href="tel:+50900000000"
                  className="inline-flex items-center gap-2 text-sm text-slate-500 transition hover:text-slate-200"
                >
                  <Phone size={14} />
                  +509 XXXX-XXXX
                </a>
              </div>
            </div>
          </div>

          {/* Link columns */}
          {COLS.map(col => (
            <div key={col.title.fr}>
              <p className="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                {t(col.title)}
              </p>
              <ul className="space-y-3">
                {col.links.map(lk => (
                  <li key={lk.l.fr}>
                    <a
                      href={lk.h}
                      className="text-sm text-slate-500 transition hover:text-slate-200"
                    >
                      {t(lk.l)}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div
          className="mt-12 flex flex-col items-center justify-between gap-4 pt-8 sm:flex-row"
          style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
        >
          <p className="text-xs text-slate-600">
            © {new Date().getFullYear()} ProfitPilot.{' '}
            {t({ fr: 'Tous droits réservés.', ht: 'Tout dwa rezève.' })}
          </p>
          <p className="text-xs text-slate-700">
            {t({ fr: 'Fait avec ❤️ pour Haïti', ht: 'Fèt ak ❤️ pou Ayiti' })}
          </p>
        </div>
      </motion.div>
    </footer>
  );
}
