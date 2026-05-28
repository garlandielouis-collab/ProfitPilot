'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, X } from 'lucide-react';

type Msg = { role: 'bot' | 'user'; text: string };

const BOT = [
  { triggers: ['bonjour','hello','salut','bonjou','alo','hi'],
    reply: 'Bonjou! 👋 Mwen se PilotAI. Kijan mwen ka ede ou jodi a?' },
  { triggers: ['prix','coût','tarif','paye','pri','combien','konbe','abonnement'],
    reply: 'ProfitPilot ofri yon essai gratis 14 jou — san kat kredi. Klike sou "Tarifs" pou wè detay yo! 💰' },
  { triggers: ['feature','fonction','fonksyon','kisa','kapab','offre'],
    reply: 'ProfitPilot ofri:\n✅ Suivi ventes & achats\n✅ Scan produit instantané\n✅ Rapports HTG/USD\n✅ Gestion dettes fournisseurs\n✅ PilotAI — conseils IA\n✅ Mode hors-ligne' },
  { triggers: ['commencer','démarrer','inscrire','kòmanse','enskri','essai','gratis'],
    reply: 'Klike sou "Démarrer mon essai gratuit" — enskripsyon pran mwens pase 2 minit. Pa gen kat kredi ki nesesè! 🚀' },
  { triggers: ['ai','intelligence','pilotai','conseil','entèlijan'],
    reply: 'PilotAI analize done biznis ou epi ba ou rekòmandasyon pou:\n🎯 Optimize maj ou yo\n📦 Jere estòk pi byen\n💵 Amelyore cash flow\n⚠️ Alète sou dèt an reta' },
  { triggers: ['contact','whatsapp','email','support','ede','aide'],
    reply: 'Ekip nou disponib:\n📱 WhatsApp: +509 XXXX-XXXX\n📧 Email: support@profitpilot.app\n\nNou reponn nan mwens pase 2 è! 🙌' },
];

function getReply(msg: string) {
  const lower = msg.toLowerCase();
  for (const e of BOT) if (e.triggers.some(t => lower.includes(t))) return e.reply;
  return "Mwen pa konprann. Eseye: 'Kisa ProfitPilot ofri?' oswa 'Ki pri yo?'. Oswa kontakte ekip nou sou WhatsApp! 💬";
}

export function PilotAIChatbot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([
    { role: 'bot', text: 'Bonjou! 👋 Mwen se PilotAI. Kijan mwen ka ede ou jodi a?' },
  ]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typing]);

  function send() {
    const text = input.trim();
    if (!text) return;
    setMessages(m => [...m, { role: 'user', text }]);
    setInput('');
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      setMessages(m => [...m, { role: 'bot', text: getReply(text) }]);
    }, 850 + Math.random() * 600);
  }

  return (
    <>
      {/* FAB */}
      <motion.button
        onClick={() => setOpen(v => !v)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full text-2xl shadow-2xl"
        style={{ background: 'linear-gradient(135deg,#3b82f6 0%,#8b5cf6 100%)' }}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.92 }}
        animate={{
          boxShadow: [
            '0 0 0 0 rgba(59,130,246,0.45)',
            '0 0 0 14px rgba(59,130,246,0)',
            '0 0 0 0 rgba(59,130,246,0)',
          ],
        }}
        transition={{ boxShadow: { duration: 2.4, repeat: Infinity, ease: 'easeOut' } }}
        aria-label="PilotAI Chat"
        aria-expanded={open}
      >
        <AnimatePresence mode="wait">
          {open ? (
            <motion.span
              key="close"
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              <X size={22} color="white" />
            </motion.span>
          ) : (
            <motion.span
              key="robot"
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.6, opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              🤖
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>

      {/* Chat window */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="chat"
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
            className="fixed bottom-24 right-6 z-50 w-[340px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-[24px] shadow-2xl"
            style={{ background: '#0d1526', border: '1px solid rgba(59,130,246,0.22)' }}
          >
            {/* Header */}
            <div
              className="flex items-center gap-3 px-4 py-3"
              style={{
                background: 'linear-gradient(135deg,rgba(59,130,246,0.12),rgba(139,92,246,0.08))',
                borderBottom: '1px solid rgba(255,255,255,0.07)',
              }}
            >
              <span className="animate-pulse text-2xl">🤖</span>
              <div>
                <p className="text-sm font-semibold text-white">PilotAI</p>
                <div className="flex items-center gap-1.5">
                  <div className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  <p className="text-[11px] text-emerald-400">En ligne</p>
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="flex h-60 flex-col gap-3 overflow-y-auto px-4 py-3">
              {messages.map((msg, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.22 }}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className="max-w-[82%] whitespace-pre-line rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed"
                    style={
                      msg.role === 'user'
                        ? { background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)', color: 'white' }
                        : {
                            background: 'rgba(255,255,255,0.06)',
                            color: '#cbd5e1',
                            border: '1px solid rgba(255,255,255,0.07)',
                          }
                    }
                  >
                    {msg.text}
                  </div>
                </motion.div>
              ))}

              {typing && (
                <div className="flex justify-start">
                  <div
                    className="flex items-center gap-1 rounded-2xl px-4 py-3"
                    style={{
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.07)',
                    }}
                  >
                    {[0, 1, 2].map(i => (
                      <motion.div
                        key={i}
                        className="h-1.5 w-1.5 rounded-full bg-slate-400"
                        animate={{ y: [0, -6, 0] }}
                        transition={{ duration: 0.9, delay: i * 0.15, repeat: Infinity }}
                      />
                    ))}
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div
              className="flex gap-2 px-3 py-3"
              style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}
            >
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && send()}
                placeholder="Poze yon kesyon..."
                className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200 outline-none placeholder:text-slate-600 focus:border-blue-500/40"
              />
              <button
                onClick={send}
                disabled={!input.trim()}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition active:scale-90 disabled:opacity-40"
                style={{ background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)' }}
                aria-label="Envoyer"
              >
                <Send size={14} color="white" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
