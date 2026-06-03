'use client';

import { useRef, useState } from 'react';
import { motion, useInView, AnimatePresence } from 'framer-motion';
import { Send, Sparkles } from 'lucide-react';
import Link from 'next/link';

const CONVERSATIONS = [
  {
    q: 'Quel est mon produit le plus rentable ?',
    a: '🏆 Votre produit le plus rentable est le **Savon Karité 250g** avec une marge de **68%**. Il représente 34% de votre profit total ce mois. Je recommande d\'augmenter votre stock de 80 unités avant la semaine prochaine.',
    delay: 0,
  },
  {
    q: 'Pourquoi mon profit a diminué ce mois ?',
    a: '📉 Votre profit a baissé de **12%** car vos achats fournisseurs ont augmenté de 18% (prix du Dolar). De plus, 3 produits ont des marges négatives. Voici les ajustements recommandés pour récupérer **45 000 HTG** de profit.',
    delay: 0,
  },
  {
    q: 'Quels produits dois-je réapprovisionner ?',
    a: '⚠️ **3 produits urgents à commander** : Savon Karité (2 unités restantes, rupture dans 2 jours), Crème Hydratante (5 unités, rupture dans 4 jours), Huile Coco (8 unités). Commande suggérée : **85 000 HTG** total.',
    delay: 0,
  },
];

function TypingDots() {
  return (
    <div className="flex gap-1 items-center px-2 py-1">
      {[0, 1, 2].map(i => (
        <motion.div
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-[#50c878]"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
        />
      ))}
    </div>
  );
}

function formatResponse(text: string) {
  return text.split('**').map((part, i) =>
    i % 2 === 1 ? <strong key={i} className="font-semibold text-[#001f3f]">{part}</strong> : part
  );
}

export function PilotAISection() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });
  const [active, setActive] = useState(0);
  const [typing, setTyping] = useState(false);
  const [showAnswer, setShowAnswer] = useState(true);

  function selectConversation(i: number) {
    if (i === active) return;
    setShowAnswer(false);
    setTyping(true);
    setActive(i);
    setTimeout(() => { setTyping(false); setShowAnswer(true); }, 1500);
  }

  return (
    <section ref={ref} className="relative overflow-hidden bg-white px-5 py-24 md:px-10">
      <div className="pointer-events-none absolute inset-0 opacity-[0.02]"
        style={{ backgroundImage: 'radial-gradient(#001f3f 1px, transparent 1px)', backgroundSize: '32px 32px' }} />

      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="mb-14 text-center"
        >
          <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#50c878]/30 bg-[#50c878]/10 px-4 py-1.5 text-xs font-semibold text-[#50c878]">
            <Sparkles size={11} /> Intelligence Artificielle Financière
          </span>
          <h2 className="mt-4 text-3xl font-extrabold text-[#001f3f] sm:text-4xl">
            Rencontrez <span style={{ background: 'linear-gradient(135deg,#001f3f,#50c878)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Pilot AI</span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-500">
            Votre conseiller financier personnel, disponible 24h/24. Il analyse votre business en temps réel et vous guide vers la croissance.
          </p>
        </motion.div>

        <div className="grid items-center gap-10 lg:grid-cols-2">
          {/* Left: Question buttons */}
          <motion.div
            initial={{ opacity: 0, x: -20 }} animate={inView ? { opacity: 1, x: 0 } : {}}
            transition={{ delay: 0.2, duration: 0.7 }}
            className="flex flex-col gap-3"
          >
            <p className="mb-2 text-sm font-semibold text-slate-400 uppercase tracking-widest">Questions fréquentes</p>
            {CONVERSATIONS.map((c, i) => (
              <button
                key={i}
                onClick={() => selectConversation(i)}
                className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition-all duration-200 ${
                  active === i
                    ? 'border-[#50c878]/30 bg-[#50c878]/5 shadow-sm'
                    : 'border-[#E2E8F0] bg-white hover:border-[#50c878]/20 hover:bg-[#50c878]/3'
                }`}
              >
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-colors ${
                  active === i ? 'bg-[#50c878] text-white' : 'bg-slate-100 text-slate-400'
                }`}>
                  <Send size={12} />
                </div>
                <span className={`text-sm font-medium ${active === i ? 'text-[#001f3f]' : 'text-slate-600'}`}>
                  {c.q}
                </span>
              </button>
            ))}

            <Link
              href="/ai-assistant"
              className="mt-3 inline-flex items-center justify-center gap-2 rounded-2xl bg-[#001f3f] px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-[#001f3f]/90 active:scale-95"
            >
              <Sparkles size={14} />
              Parler à Pilot AI maintenant
            </Link>
          </motion.div>

          {/* Right: Chat interface */}
          <motion.div
            initial={{ opacity: 0, x: 20 }} animate={inView ? { opacity: 1, x: 0 } : {}}
            transition={{ delay: 0.3, duration: 0.7 }}
            className="rounded-3xl border border-[#E2E8F0] bg-[#F8FAFC] overflow-hidden shadow-lg"
          >
            {/* Chat header */}
            <div className="flex items-center gap-3 border-b border-[#E2E8F0] bg-white px-5 py-4">
              <motion.div
                className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-[#001f3f] to-[#50c878] text-lg"
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ duration: 2.5, repeat: Infinity }}
              >
                🤖
              </motion.div>
              <div>
                <p className="text-sm font-bold text-[#001f3f]">Pilot AI</p>
                <div className="flex items-center gap-1.5">
                  <div className="h-1.5 w-1.5 rounded-full bg-[#50c878] animate-pulse" />
                  <p className="text-[10px] text-slate-400">En ligne — Analyse votre business</p>
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="flex flex-col gap-4 p-5 min-h-[280px]">
              {/* User message */}
              <div className="flex justify-end">
                <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-[#001f3f] px-4 py-3">
                  <p className="text-sm text-white">{CONVERSATIONS[active].q}</p>
                </div>
              </div>

              {/* AI response */}
              <div className="flex items-start gap-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#001f3f] to-[#50c878] text-sm mt-1">
                  🤖
                </div>
                <div className="max-w-[85%]">
                  <AnimatePresence mode="wait">
                    {typing ? (
                      <motion.div
                        key="typing"
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="rounded-2xl rounded-tl-sm bg-white border border-[#E2E8F0] px-4 py-3"
                      >
                        <TypingDots />
                      </motion.div>
                    ) : showAnswer ? (
                      <motion.div
                        key={`answer-${active}`}
                        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4 }}
                        className="rounded-2xl rounded-tl-sm bg-white border border-[#E2E8F0] px-4 py-3"
                      >
                        <p className="text-sm leading-relaxed text-slate-700">
                          {formatResponse(CONVERSATIONS[active].a)}
                        </p>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
              </div>
            </div>

            {/* Input area */}
            <div className="border-t border-[#E2E8F0] bg-white p-3">
              <div className="flex items-center gap-2 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-2.5">
                <p className="flex-1 text-sm text-slate-400">Posez votre question à Pilot AI...</p>
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#001f3f]">
                  <Send size={11} className="text-white" />
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
