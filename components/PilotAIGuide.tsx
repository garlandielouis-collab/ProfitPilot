'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { X, ArrowRight, Sparkles, ChevronRight } from 'lucide-react';

// ── Guide scripts per page ────────────────────────────────────────────────────

type GuideMessage = {
  text: string;
  action?: { label: string; href?: string; onClick?: string };
  inactivityTip?: string;
};

const PAGE_GUIDES: Record<string, GuideMessage> = {
  '/dashboard': {
    text: 'Bienvenü ! Ici c\'est votre cockpit. Ces métriques sont mises à jour automatiquement. J\'ai déjà analysé vos données pour vous alerter sur vos priorités.',
    action: { label: 'Voir mes produits →', href: '/products' },
    inactivityTip: 'Cliquez sur une métrique pour voir le détail. Je suis là si vous avez des questions !',
  },
  '/products': {
    text: 'C\'est ici que je transforme vos produits en actifs rentables. Ajoutez votre premier produit — je calculerai automatiquement votre marge suggérée.',
    action: { label: 'Aller à l\'inventaire →', href: '/inventory' },
    inactivityTip: 'Cliquez sur "+ Nouvo Pwodui" pour commencer. Je m\'occupe du reste !',
  },
  '/inventory': {
    text: 'Voici votre centre de contrôle du stock. Je surveille chaque produit et vous alerte avant les ruptures. Le graphe montre vos produits les plus vendus.',
    action: { label: 'Voir les ventes →', href: '/sales' },
    inactivityTip: 'Cliquez sur "Ajiste" pour corriger un stock manuellement.',
  },
  '/sales': {
    text: 'C\'est votre point de vente intelligent. Sélectionnez vos produits, choisissez le mode de paiement, et la facture se génère automatiquement.',
    action: { label: 'Gérer les dépenses →', href: '/expenses' },
    inactivityTip: 'Ajoutez un produit au panier et cliquez "Anrejistre Vant".',
  },
  '/expenses': {
    text: 'Chaque dépense enregistrée ici alimente automatiquement vos rapports financiers et votre calcul de profit net.',
    action: { label: 'Voir les rapports →', href: '/rapports' },
    inactivityTip: 'Cliquez sur "+ Nouvo Depans" pour enregistrer une charge.',
  },
  '/rapports': {
    text: 'Vos états financiers sont générés automatiquement. Bilan, compte de résultat, flux de trésorerie — tout à jour en temps réel.',
    action: { label: 'Parler à Pilot AI →', href: '/ai-assistant' },
    inactivityTip: 'Cliquez sur un rapport pour le détailler ou l\'exporter en PDF.',
  },
  '/rapports/comptabilite': {
    text: 'Voici le moteur comptable à double entrée. Chaque transaction génère automatiquement des écritures conformes aux normes comptables.',
    action: { label: 'Utiliser l\'IA Comptable', onClick: 'ai' },
    inactivityTip: 'Cliquez sur "IA Comptable" pour saisir une transaction en langage naturel.',
  },
  '/ai-assistant': {
    text: 'Je suis ici ! Posez-moi n\'importe quelle question sur votre business. Je peux analyser vos marges, prédire vos besoins en stock, et vous conseiller sur votre croissance.',
    inactivityTip: 'Essayez : "Ki pwodui ki pi ranntab mwen?" ou "Poukisa profit mwen bese?"',
  },
  '/clients': {
    text: 'Votre CRM clients. Je suis les achats, les crédits, et le comportement de chaque client pour vous aider à fidéliser les meilleurs.',
    action: { label: 'Gérer les fournisseurs →', href: '/suppliers' },
  },
  '/suppliers': {
    text: 'Vos fournisseurs et leurs dettes. Je vous alerte automatiquement sur les paiements en retard et les opportunités de négociation.',
    action: { label: 'Voir les dettes →', href: '/dettes' },
  },
  '/dettes': {
    text: 'Vue complète de vos engagements financiers. Je calcule l\'impact sur votre trésorerie et vous suggère l\'ordre optimal de remboursement.',
  },
};

const DEFAULT_GUIDE: GuideMessage = {
  text: 'Besoin d\'aide ? Je surveille votre business en permanence. Dites-moi ce que vous cherchez !',
  inactivityTip: 'Naviguez dans le menu pour explorer toutes les fonctionnalités.',
};

// ── Typewriter ────────────────────────────────────────────────────────────────

function useTypewriter(text: string, speed = 22) {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);
  const timerRef = useRef<NodeJS.Timeout>();
  useEffect(() => {
    setDisplayed(''); setDone(false);
    let i = 0;
    timerRef.current = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) { clearInterval(timerRef.current); setDone(true); }
    }, speed);
    return () => clearInterval(timerRef.current);
  }, [text, speed]);
  return { displayed, done };
}

// ── Main Guide Component ──────────────────────────────────────────────────────

const GUIDE_KEY = 'pp_guide_dismissed';
const GUIDE_SEEN_KEY = 'pp_guide_seen_pages';

export function PilotAIGuide() {
  const pathname = usePathname();
  const [visible,    setVisible]    = useState(false);
  const [minimized,  setMinimized]  = useState(false);
  const [currentMsg, setCurrentMsg] = useState('');
  const [showTip,    setShowTip]    = useState(false);
  const inactivityRef = useRef<NodeJS.Timeout>();
  const { displayed, done } = useTypewriter(currentMsg);

  // Only show in protected app pages
  const isAppPage = pathname !== '/' &&
    !pathname.startsWith('/auth') &&
    !pathname.startsWith('/onboarding') &&
    !pathname.startsWith('/pricing') &&
    !pathname.startsWith('/legal') &&
    !pathname.startsWith('/blog') &&
    !pathname.startsWith('/faq') &&
    !pathname.startsWith('/guide') &&
    !pathname.startsWith('/updates');

  // Get guide for current page
  const guide = PAGE_GUIDES[pathname] ?? DEFAULT_GUIDE;

  // Show on page change
  useEffect(() => {
    if (!isAppPage) { setVisible(false); return; }

    // Check if permanently dismissed
    const dismissed = sessionStorage.getItem(GUIDE_KEY);
    if (dismissed === 'all') return;

    // Update message
    setCurrentMsg(guide.text);
    setShowTip(false);
    setMinimized(false);

    // Show with small delay
    const t = setTimeout(() => setVisible(true), 800);

    // Inactivity detection
    clearTimeout(inactivityRef.current);
    if (guide.inactivityTip) {
      inactivityRef.current = setTimeout(() => {
        setShowTip(true);
        setCurrentMsg(guide.inactivityTip!);
      }, 8000);
    }

    return () => { clearTimeout(t); clearTimeout(inactivityRef.current); };
  }, [pathname, isAppPage]);

  const dismiss = useCallback(() => {
    setVisible(false);
    clearTimeout(inactivityRef.current);
  }, []);

  const dismissAll = useCallback(() => {
    sessionStorage.setItem(GUIDE_KEY, 'all');
    setVisible(false);
  }, []);

  if (!isAppPage || !visible) return null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          transition={{ type: 'spring', damping: 20, stiffness: 300 }}
          className="fixed bottom-20 right-4 z-40 w-full max-w-[340px] lg:bottom-6 lg:right-6"
        >
          {minimized ? (
            /* Minimized pill */
            <button onClick={() => { setMinimized(false); setCurrentMsg(guide.text); setShowTip(false); }}
              className="flex items-center gap-2 rounded-full border border-[#50c878]/30 bg-[#001f3f] px-4 py-2 shadow-xl hover:bg-[#001f3f]/90 transition">
              <motion.span animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 2, repeat: Infinity }} className="text-base">🤖</motion.span>
              <span className="text-xs font-semibold text-[#50c878]">Pilot AI</span>
              <span className="flex h-2 w-2 rounded-full bg-[#50c878] animate-pulse" />
            </button>
          ) : (
            /* Full card */
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#001f3f] shadow-2xl">
              {/* Header */}
              <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
                <motion.div animate={{ scale: [1, 1.05, 1] }} transition={{ duration: 2.5, repeat: Infinity }}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#0d3566] to-[#001f3f] text-base border border-[#50c878]/20">
                  🤖
                </motion.div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-[#50c878]">Pilot AI</p>
                  <div className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#50c878] animate-pulse" />
                    <p className="text-[10px] text-white/40">Guide actif</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => setMinimized(true)} title="Minimiser"
                    className="rounded-lg p-1.5 text-white/30 hover:text-white/60 hover:bg-white/5 transition">
                    <span className="text-xs">—</span>
                  </button>
                  <button onClick={dismiss} title="Fermer"
                    className="rounded-lg p-1.5 text-white/30 hover:text-white/60 hover:bg-white/5 transition">
                    <X size={12} />
                  </button>
                </div>
              </div>

              {/* Message */}
              <div className="px-4 py-4">
                <AnimatePresence mode="wait">
                  <motion.p key={currentMsg} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="text-sm leading-6 text-white/85 min-h-[3.5rem]">
                    {displayed}
                    {!done && (
                      <motion.span animate={{ opacity: [1, 0] }} transition={{ duration: 0.5, repeat: Infinity }}
                        className="inline-block ml-0.5 h-[0.9em] w-[1.5px] bg-[#50c878] align-middle" />
                    )}
                  </motion.p>
                </AnimatePresence>

                {/* Tip badge */}
                {showTip && done && (
                  <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                    className="mt-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2">
                    <p className="text-xs text-amber-400 flex items-center gap-1.5">
                      <Sparkles size={10} /> Astuce
                    </p>
                  </motion.div>
                )}
              </div>

              {/* Actions */}
              {done && guide.action && (
                <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                  className="border-t border-white/10 px-4 py-3">
                  {guide.action.href ? (
                    <Link href={guide.action.href}
                      className="flex items-center justify-between rounded-xl bg-[#50c878]/15 px-4 py-2.5 text-sm font-semibold text-[#50c878] hover:bg-[#50c878]/25 transition">
                      {guide.action.label}
                      <ArrowRight size={13} />
                    </Link>
                  ) : (
                    <button onClick={dismiss}
                      className="flex w-full items-center justify-between rounded-xl bg-[#50c878]/15 px-4 py-2.5 text-sm font-semibold text-[#50c878] hover:bg-[#50c878]/25 transition">
                      {guide.action.label}
                      <ArrowRight size={13} />
                    </button>
                  )}
                </motion.div>
              )}

              {/* Footer */}
              <div className="border-t border-white/5 px-4 py-2 flex items-center justify-between">
                <Link href="/ai-assistant" className="text-[10px] text-white/30 hover:text-[#50c878] transition flex items-center gap-1">
                  <Sparkles size={9} /> Poze mwen yon kesyon
                </Link>
                <button onClick={dismissAll} className="text-[10px] text-white/20 hover:text-white/40 transition">
                  Pa montre ankò
                </button>
              </div>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
