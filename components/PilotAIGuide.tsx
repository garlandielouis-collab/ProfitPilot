'use client';

import { useEffect, useState, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { X, ArrowRight } from 'lucide-react';
import { checkSubscriptionExpired } from '../hooks/useSubscription';

// ── Scripts par page ──────────────────────────────────────────────────────────
//
// Une phrase, une action. Le marchand est là pour travailler, pas pour lire le
// guide : au-delà d'une ligne, la carte se fait fermer avant d'être lue.
// ─────────────────────────────────────────────────────────────────────────────

type GuideMessage = {
  text: string;
  action?: { label: string; href: string };
};

const PAGE_GUIDES: Record<string, GuideMessage> = {
  '/dashboard': {
    text: "Votre cockpit. Tout se met à jour tout seul.",
    action: { label: 'Mes produits', href: '/products' },
  },
  '/products': {
    text: "Ajoutez un produit, je calcule votre marge.",
    action: { label: "L'inventaire", href: '/inventory' },
  },
  '/inventory': {
    text: "Je surveille le stock et vous alerte avant la rupture.",
    action: { label: 'Les ventes', href: '/sales' },
  },
  '/sales': {
    text: "Enregistrez la vente, la facture se génère toute seule.",
    action: { label: 'Les dépenses', href: '/expenses' },
  },
  '/expenses': {
    text: "Chaque dépense entre direct dans vos rapports.",
    action: { label: 'Les rapports', href: '/rapports' },
  },
  '/rapports': {
    text: "Vos états financiers, à jour en temps réel.",
    action: { label: 'Pilot AI', href: '/ai-assistant' },
  },
  '/rapports/comptabilite': {
    text: "Chaque transaction génère ses écritures comptables.",
  },
  '/ai-assistant': {
    text: "Posez-moi une question sur votre business.",
  },
  '/customers': {
    text: "Achats, crédits, fidélité — tout par client.",
    action: { label: 'Les fournisseurs', href: '/suppliers' },
  },
  '/suppliers': {
    text: "Vos dettes fournisseurs et les retards de paiement.",
    action: { label: 'Les dettes', href: '/dettes' },
  },
  '/dettes': {
    text: "Vos engagements et leur impact sur la trésorerie.",
  },
};

const DEFAULT_GUIDE: GuideMessage = {
  text: "Besoin d'aide ? Dites-moi ce que vous cherchez.",
};

const SUBSCRIPTION_EXPIRED_GUIDE: GuideMessage = {
  text: "Essai de 72h terminé. Souscrivez pour continuer.",
  action: { label: 'Les abonnements', href: '/pricing' },
};

// ── Carte ─────────────────────────────────────────────────────────────────────

const GUIDE_KEY = 'pp_guide_dismissed';

export function PilotAIGuide() {
  const pathname = usePathname();
  const [visible,    setVisible]    = useState(false);
  const [subExpired, setSubExpired] = useState(false);

  useEffect(() => { setSubExpired(checkSubscriptionExpired()); }, []);

  // Uniquement dans les pages applicatives protégées
  const isAppPage = pathname !== '/' &&
    !pathname.startsWith('/auth') &&
    !pathname.startsWith('/onboarding') &&
    !pathname.startsWith('/pricing') &&
    !pathname.startsWith('/legal') &&
    !pathname.startsWith('/blog') &&
    !pathname.startsWith('/faq') &&
    !pathname.startsWith('/guide') &&
    !pathname.startsWith('/updates');

  const guide = subExpired ? SUBSCRIPTION_EXPIRED_GUIDE : (PAGE_GUIDES[pathname] ?? DEFAULT_GUIDE);

  useEffect(() => {
    if (!isAppPage) { setVisible(false); return; }
    if (sessionStorage.getItem(GUIDE_KEY) === 'all') return;

    const t = setTimeout(() => setVisible(true), 800);
    return () => clearTimeout(t);
  }, [pathname, isAppPage]);

  const dismiss = useCallback(() => setVisible(false), []);

  const dismissAll = useCallback(() => {
    sessionStorage.setItem(GUIDE_KEY, 'all');
    setVisible(false);
  }, []);

  if (!isAppPage || !visible) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 12 }}
        transition={{ type: 'spring', damping: 22, stiffness: 320 }}
        className="fixed bottom-20 right-4 z-40 w-[230px] lg:bottom-6 lg:right-6"
      >
        <div className="rounded-xl border border-white/10 bg-[#001f3f] p-3 shadow-xl">
          <div className="flex items-start gap-2">
            <span className="text-sm leading-none">🤖</span>
            <p className="flex-1 text-[13px] leading-5 text-white/85">{guide.text}</p>
            <button onClick={dismiss} title="Fermer"
              className="-mr-1 -mt-1 rounded p-1 text-white/30 transition hover:text-white/70">
              <X size={12} />
            </button>
          </div>

          <div className="mt-2 flex items-center justify-between gap-2">
            {guide.action ? (
              <Link href={guide.action.href}
                className="flex items-center gap-1 text-xs font-semibold text-[#50c878] transition hover:text-[#50c878]/80">
                {guide.action.label}
                <ArrowRight size={12} />
              </Link>
            ) : <span />}
            <button onClick={dismissAll}
              className="text-[10px] text-white/25 transition hover:text-white/50">
              Pa montre ankò
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
