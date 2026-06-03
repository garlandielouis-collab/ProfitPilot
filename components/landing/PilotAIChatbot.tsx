 'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, X } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';

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
  const [flow, setFlow] = useState<null | 'demo' | 'buyer'>(null);
  const [buyerStep, setBuyerStep] = useState(0);
  const [guideStep, setGuideStep] = useState<null | number>(null);
  const [buyerAnswers, setBuyerAnswers] = useState<{ name?: string; sector?: string; challenge?: string }>({});
  const [showSignupForm, setShowSignupForm] = useState(false);
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupStatus, setSignupStatus] = useState<string | null>(null);
  const [signupLoading, setSignupLoading] = useState(false);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typing]);

  async function trackEvent(event: string, payload: Record<string, unknown> = {}) {
    try {
      await fetch('/api/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event, payload }),
      });
    } catch {
      // silent
    }
  }

  async function submitSignup() {
    if (!signupEmail.trim() || !signupPassword.trim()) {
      setSignupStatus('Veuillez renseigner un email et un mot de passe.');
      return;
    }
    setSignupLoading(true);
    setSignupStatus(null);

    const { data, error } = await supabase.auth.signUp({
      email: signupEmail.trim(),
      password: signupPassword,
      options: { data: { full_name: buyerAnswers.name ?? '' } },
    });

    setSignupLoading(false);
    if (error) {
      setSignupStatus(error.message);
      await trackEvent('pilotai_signup_failed', { error: error.message });
      return;
    }

    setSignupStatus('Inscription envoyée ! Vérifiez votre email pour confirmer.');
    await trackEvent('pilotai_signup_submitted', { email: signupEmail.trim() });
  }

  function handlePageNavigation(path: string, label: string) {
    setMessages(m => [...m, { role: 'bot', text: `Je vous emmène vers ${label}...` }]);
    trackEvent('pilotai_page_navigation', { page: label, path });
    window.location.href = path;
  }

  function send() {
    const text = input.trim();
    if (!text) return;
    setMessages(m => [...m, { role: 'user', text }]);
    setInput('');

    // If in buyer onboarding flow, capture answers and drive next question
    if (flow === 'buyer') {
      if (buyerStep === 0) {
        setBuyerAnswers(a => ({ ...a, name: text }));
        setBuyerStep(1);
        setTyping(true);
        setTimeout(() => {
          setTyping(false);
          setMessages(m => [...m, { role: 'bot', text: `Quel est votre secteur ?` }]);
        }, 700);
        return;
      }
      if (buyerStep === 1) {
        setBuyerAnswers(a => ({ ...a, sector: text }));
        setBuyerStep(2);
        setTyping(true);
        setTimeout(() => {
          setTyping(false);
          setMessages(m => [...m, { role: 'bot', text: `Quel est votre défi prioritaire ?` }]);
        }, 700);
        return;
      }
      if (buyerStep === 2) {
        setBuyerAnswers(a => ({ ...a, challenge: text }));
        setBuyerStep(3);
        setGuideStep(0);
        setTyping(true);
        setTimeout(() => {
          setTyping(false);
          setMessages(m => [
            ...m,
            { role: 'bot', text: `Je configure votre espace de travail...` },
            { role: 'bot', text: `Bienvenue ${buyerAnswers.name ?? text ?? 'Pilot'} ! Votre espace est prêt. Cliquez sur Continuer pour découvrir votre Dashboard.` },
          ]);
        }, 900);
        trackEvent('pilotai_onboarding_completed', { name: buyerAnswers.name ?? text, sector: buyerAnswers.sector, challenge: text });
        return;
      }
    }

    // Default behaviour: canned replies
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      setMessages(m => [...m, { role: 'bot', text: getReply(text) }]);
    }, 850 + Math.random() * 600);
  }

  function startDemo() {
    setFlow('demo');
    setGuideStep(null);
    setMessages(m => [...m, { role: 'bot', text: "Excellent choix. Je charge des données fictives pour vous montrer comment je travaille." }]);
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      setMessages(m => [...m, { role: 'bot', text: "C'est votre cockpit. J'ai détecté une hausse de marge de 15% sur vos produits phares." }]);
    }, 900);
    trackEvent('pilotai_flow_started', { flow: 'demo' });
  }

  function startBuyer() {
    setFlow('buyer');
    setBuyerStep(0);
    setGuideStep(null);
    setBuyerAnswers({});
    setMessages(m => [...m, { role: 'bot', text: 'Parfait — commençons. Quel est le nom de votre entreprise ?' }]);
    trackEvent('pilotai_flow_started', { flow: 'buyer' });
  }

  const guideMessages = [
    "Dashboard : Voici votre cockpit. J'ai déjà préparé vos alertes de priorité pour vous éviter les pertes de marge.",
    "Inventaire : Je transforme vos produits en actifs rentables. Ajoutez un produit pour voir ma magie opérer.",
    "Analyse : Je prédis vos tendances. Votre rapport de marge pour le mois prochain est déjà prêt.",
    "Paramètres : C'est ici que vous définissez vos seuils d'alerte et gardez le contrôle."
  ];

  function advanceGuide() {
    if (guideStep === null || guideStep >= guideMessages.length) return;
    const next = guideMessages[guideStep];
    const nextStep = guideStep + 1;
    setGuideStep(nextStep);
    setMessages((m): Msg[] => {
      const nextMessage: Msg = { role: 'bot', text: next };
      const messages: Msg[] = [...m, nextMessage];
      if (nextStep === guideMessages.length) {
        const finalMessage: Msg = {
          role: 'bot',
          text: 'La visite est terminée ! Pour débloquer la puissance totale de mes analyses en temps réel, activez votre essai gratuit.',
        };
        return [...messages, finalMessage];
      }
      return messages;
    });
    trackEvent('pilotai_guide_step', { step: guideStep + 1, label: next });
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
              {/* Buyer progress bar */}
              {flow === 'buyer' && (
                <div className="mb-2 w-full">
                  <div className="h-2 w-full rounded-full bg-white/8">
                    <div
                      className="h-2 rounded-full bg-emerald-400"
                      style={{ width: `${Math.min(100, Math.round((buyerStep / 3) * 100))}%` }}
                    />
                  </div>
                  <div className="mt-1 text-[11px] text-white/80">Progression: {Math.min(100, Math.round((buyerStep / 3) * 100))}%</div>
                </div>
              )}
              {/* Quick choice buttons shown when no flow selected */}
              {flow == null && (
                <div className="flex gap-2">
                  <button onClick={startDemo} className="rounded-full bg-blue-500 px-3 py-1 text-xs text-white">Explorer la démo</button>
                  <button onClick={startBuyer} className="rounded-full bg-emerald-500 px-3 py-1 text-xs text-white">Démarrer mon business</button>
                </div>
              )}
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

              {flow === 'buyer' && buyerStep >= 3 && guideStep !== null && guideStep < guideMessages.length && (
                <div className="mt-2 flex w-full justify-center">
                  <button
                    onClick={advanceGuide}
                    className="rounded-full bg-emerald-500 px-3 py-1 text-xs font-semibold text-white"
                  >
                    Continuer
                  </button>
                </div>
              )}

              {flow === 'buyer' && buyerStep >= 3 && guideStep === guideMessages.length && (
                <div className="mt-2 space-y-2">
                  <div className="flex w-full justify-center gap-2">
                    <button
                      onClick={() => handlePageNavigation('/dashboard', 'Dashboard')}
                      className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-[#001f3f]"
                    >
                      Dashboard
                    </button>
                    <button
                      onClick={() => handlePageNavigation('/inventory', 'Inventaire')}
                      className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-[#001f3f]"
                    >
                      Inventaire
                    </button>
                  </div>
                  <div className="flex w-full justify-center gap-2">
                    <button
                      onClick={() => handlePageNavigation('/rapports', 'Analyse')}
                      className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-[#001f3f]"
                    >
                      Analyse
                    </button>
                    <button
                      onClick={() => handlePageNavigation('/settings', 'Paramètres')}
                      className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-[#001f3f]"
                    >
                      Paramètres
                    </button>
                  </div>
                  <div className="flex w-full justify-center gap-2">
                    <Link href="/auth/register" className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#001f3f]">
                      Créer un compte
                    </Link>
                    <button
                      onClick={() => {
                        setShowSignupForm(true);
                        trackEvent('pilotai_signup_inline_opened');
                      }}
                      className="rounded-full border border-white/20 bg-transparent px-3 py-1 text-xs font-semibold text-white"
                    >
                      Inscription inline
                    </button>
                  </div>
                </div>
              )}

              {showSignupForm && (
                <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-3 text-white">
                  <p className="mb-2 text-[11px] uppercase tracking-[0.3em] text-slate-300">Inscription rapide</p>
                  <input
                    type="email"
                    value={signupEmail}
                    onChange={(e) => setSignupEmail(e.target.value)}
                    placeholder="Email"
                    className="mb-2 w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 text-xs text-white outline-none"
                  />
                  <input
                    type="password"
                    value={signupPassword}
                    onChange={(e) => setSignupPassword(e.target.value)}
                    placeholder="Mot de passe"
                    className="mb-2 w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 text-xs text-white outline-none"
                  />
                  <button
                    onClick={submitSignup}
                    disabled={signupLoading}
                    className="mb-2 w-full rounded-full bg-emerald-500 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                  >
                    {signupLoading ? 'En cours...' : 'S’inscrire'}
                  </button>
                  {signupStatus && <p className="text-[11px] text-slate-300">{signupStatus}</p>}
                </div>
              )}
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
