'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { ArrowRight, Sparkles, Building2, ChevronRight, Check, Zap } from 'lucide-react';
import { useLanguage } from '../../components/LanguageWrapper';

// ── Types ─────────────────────────────────────────────────────────────────────

type Path = 'split' | 'demo' | 'buyer';
type BuyerStep = 'name' | 'sector' | 'challenge' | 'loading' | 'reveal';

const SECTORS = [
  { id: 'boutique',   emoji: '🛍️', label: { fr: 'Boutique / Mode', ht: 'Boutik / Mòd' },        sub: { fr: 'Vêtements, accessoires', ht: 'Rad, akseswa' } },
  { id: 'cosmetique', emoji: '💄', label: { fr: 'Cosmétiques / Beauté', ht: 'Kosmetik / Bote' },   sub: { fr: 'Soins, maquillage', ht: 'Swen, makiyaj' } },
  { id: 'restaurant', emoji: '🍽️', label: { fr: 'Restaurant / Traiteur', ht: 'Restoran / Traiteur' },  sub: { fr: 'Food, livraison', ht: 'Manje, livrezon' } },
  { id: 'wholesale',  emoji: '📦', label: { fr: 'Commerce en Gros', ht: 'Komès an Gwo' },        sub: { fr: 'Import, distribution', ht: 'Enpòtasyon, distribisyon' } },
  { id: 'service',    emoji: '⚡', label: { fr: 'Services', ht: 'Sèvis' },                sub: { fr: 'Conseil, tech, beauté', ht: 'Konsèy, teknoloji, bote' } },
  { id: 'online',     emoji: '📱', label: { fr: 'Business en Ligne', ht: 'Biznis an Liy' },       sub: { fr: 'WhatsApp, Instagram', ht: 'WhatsApp, Instagram' } },
];

const CHALLENGES = [
  { id: 'profit',    emoji: '💰', label: { fr: 'Connaître mon profit réel', ht: 'Konnen profit reyèl mwen' },   sub: { fr: 'Calculs exacts chaque jour', ht: 'Kalkilasyon egzak chak jou' } },
  { id: 'stock',     emoji: '📦', label: { fr: 'Gérer mon stock', ht: 'Jere stock mwen' },            sub: { fr: 'Éviter ruptures & pertes', ht: 'Evite ruptures & pèt' } },
  { id: 'cashflow',  emoji: '🌊', label: { fr: 'Contrôler mon flux trésorerie', ht: 'Kontwole flus trezoreri' },     sub: { fr: 'Cash disponible chaque jour', ht: 'Cash disponib chak jou' } },
  { id: 'reports',   emoji: '📊', label: { fr: 'Générer des rapports financiers', ht: 'Jenere rapò finansye' },        sub: { fr: 'Bilan, état des résultats', ht: 'Bilan, eta rezilta' } },
];

const LOADING_STEPS = [
  { text: { fr: 'Analyse de votre secteur d\'activité…', ht: 'Analiz sektè aktivite ou…' },      ms: 1200 },
  { text: { fr: 'Configuration du cockpit financier…', ht: 'Konfigirasyon kabin finansye…' },    ms: 1100 },
  { text: { fr: 'Calibration des alertes intelligentes…', ht: 'Kalibrasyon alèt entelijan…' },   ms: 1000 },
  { text: { fr: 'Activation des rapports automatiques…', ht: 'Aktivasyon rapò otomatik…' },      ms: 1100 },
  { text: { fr: 'Préparation de vos insights Pilot AI…', ht: 'Preparasyon insights Pilot AI ou…' }, ms: 1200 },
  { text: { fr: '✓ Cockpit prêt. Bienvenue dans le futur.', ht: '✓ Kabin pare. Byenveni nan fiti a.' }, ms: 800  },
];

const DEMO_STEPS = [
  {
    title: { fr: 'Votre Cockpit Financial', ht: 'Kabin Finansye Ou' },
    text: { fr: 'Voici votre tableau de bord. J\'ai détecté une hausse de marge de 15% sur vos produits phares. Zéro calculs manuels — c\'est mon travail.', ht: 'Men tablo debò ou. Mwen detekte yon ogmantasyon marge 15% sou pwodui prensipal ou yo. Zewo kalkil manyèl — se travay mwen.' },
    icon: '📊',
    action: null,
  },
  {
    title: { fr: 'Alerte Stock Critique', ht: 'Alèt Stock Kritik' },
    text: { fr: 'Voyez cette alerte rouge ? Je préviens vos ruptures de stock AVANT qu\'elles n\'arrivent. Vous économisez des ventes perdues chaque semaine.', ht: 'Wè alèt wouj sa a ? Mwen anpeche ruptures stock ou ANVAN yo rive. Ou ekonomize vant pedi chak semèn.' },
    icon: '📦',
    action: null,
  },
  {
    title: { fr: 'Intelligence Financière', ht: 'Entèlijans Finansye' },
    text: { fr: 'En 10 secondes, vous venez de voir ce qui prend 2h à calculer manuellement. Imaginez cela avec VOS chiffres, VOS produits, VOTRE business.', ht: 'An 10 segond, ou fèk wè sa ta pran 2 èdtan pou kalkile manyèlman. Imajine sa ak CHIFF ou, PWODUI ou, BIZNIS ou.' },
    icon: '🤖',
    action: 'convert',
  },
];

// ── Particles Background ──────────────────────────────────────────────────────

function ParticleField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let animId: number;
    const particles: any[] = [];
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener('resize', resize);
    const colors = ['#50c878', '#001f3f', '#34d399', '#10b981'];
    for (let i = 0; i < 60; i++) {
      particles.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3,
        size: Math.random() * 1.5 + 0.3, opacity: Math.random() * 0.4 + 0.05,
        color: colors[Math.floor(Math.random() * colors.length)] });
    }
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color; ctx.globalAlpha = p.opacity; ctx.fill();
        particles.forEach(p2 => {
          const dist = Math.hypot(p.x - p2.x, p.y - p2.y);
          if (dist < 90) {
            ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = '#50c878'; ctx.globalAlpha = (1 - dist / 90) * 0.06;
            ctx.lineWidth = 0.5; ctx.stroke();
          }
        });
        ctx.globalAlpha = 1;
      });
      animId = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', resize); };
  }, []);
  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 z-0" />;
}

// ── Typewriter ────────────────────────────────────────────────────────────────

function useTypewriter(text: string, speed = 25) {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);
  useEffect(() => {
    setDisplayed(''); setDone(false);
    let i = 0;
    const id = setInterval(() => { i++; setDisplayed(text.slice(0, i)); if (i >= text.length) { clearInterval(id); setDone(true); } }, speed);
    return () => clearInterval(id);
  }, [text, speed]);
  return { displayed, done };
}

function Cursor() {
  return (
    <motion.span animate={{ opacity: [1, 0] }} transition={{ duration: 0.6, repeat: Infinity, repeatType: 'reverse' }}
      className="inline-block ml-0.5 h-[1em] w-[2px] bg-[#50c878] align-middle" />
  );
}

// ── AI Avatar ─────────────────────────────────────────────────────────────────

function AIAvatar({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const s = size === 'sm' ? 'h-10 w-10 text-lg' : size === 'lg' ? 'h-20 w-20 text-4xl' : 'h-14 w-14 text-2xl';
  return (
    <motion.div
      animate={{ boxShadow: ['0 0 0 0 rgba(80,200,120,0)', '0 0 0 12px rgba(80,200,120,0.15)', '0 0 0 0 rgba(80,200,120,0)'] }}
      transition={{ duration: 2.5, repeat: Infinity }}
      className={`${s} flex shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#001f3f] to-[#0d3566]`}
    >
      🤖
    </motion.div>
  );
}

// ── AI Speech Bubble ──────────────────────────────────────────────────────────

function AIBubble({ text, onDone, onNext, nextLabel, showNext = true }:
  { text: string; onDone?: () => void; onNext?: () => void; nextLabel?: string; showNext?: boolean }) {
  const { t } = useLanguage();
  const resolvedNextLabel = nextLabel ?? t({ fr: 'Suivant →', ht: 'Apre →' });
  const { displayed, done } = useTypewriter(text);
  useEffect(() => { if (done && onDone) onDone(); }, [done]);

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-start gap-3">
      <AIAvatar size="sm" />
      <div className="flex-1">
        <div className="rounded-2xl rounded-tl-sm border border-[#50c878]/20 bg-white/10 backdrop-blur-sm px-5 py-4 shadow-xl">
          <p className="text-sm leading-7 text-white/90">
            {displayed}{!done && <Cursor />}
          </p>
        </div>
        {done && showNext && onNext && (
          <motion.button
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
            onClick={onNext}
            className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[#50c878] px-5 py-2.5 text-sm font-bold text-[#001f3f] shadow-lg hover:bg-[#4db86e] active:scale-95 transition-all"
          >
            {nextLabel} <ArrowRight size={14} />
          </motion.button>
        )}
      </div>
    </motion.div>
  );
}

// ── Progress Bar ──────────────────────────────────────────────────────────────

function Progress({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <motion.div key={i}
          animate={{ width: i < step ? 32 : 8, background: i < step ? '#50c878' : 'rgba(255,255,255,0.2)' }}
          transition={{ duration: 0.3 }}
          className="h-1.5 rounded-full"
        />
      ))}
    </div>
  );
}

// ── Main Onboarding ───────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const { t } = useLanguage();
  const router = useRouter();

  // State
  const [path,         setPath]         = useState<Path>('split');
  const [buyerStep,    setBuyerStep]    = useState<BuyerStep>('name');
  const [demoStep,     setDemoStep]     = useState(0);
  const [name,         setName]         = useState('');
  const [sector,       setSector]       = useState('');
  const [challenge,    setChallenge]    = useState('');
  const [loadingIdx,   setLoadingIdx]   = useState(0);
  const [loadingDone,  setLoadingDone]  = useState(false);
  const [inputFocused, setInputFocused] = useState(false);

  // Loading animation
  useEffect(() => {
    if (buyerStep !== 'loading') return;
    let idx = 0;
    const tick = () => {
      idx++;
      setLoadingIdx(idx);
      if (idx >= LOADING_STEPS.length - 1) {
        setTimeout(() => { setLoadingDone(true); setTimeout(() => setBuyerStep('reveal'), 600); }, LOADING_STEPS[idx].ms);
      } else {
        setTimeout(tick, LOADING_STEPS[idx].ms);
      }
    };
    setTimeout(tick, LOADING_STEPS[0].ms);
  }, [buyerStep]);

  const startLoading = () => {
    if (!name.trim()) return;
    setBuyerStep('loading');
    setLoadingIdx(0);
    setLoadingDone(false);
  };

  // ── SPLIT SCREEN ─────────────────────────────────────────────────────────────
  if (path === 'split') {
    return (
      <div className="relative min-h-screen overflow-hidden" style={{ background: 'linear-gradient(135deg, #001f3f 0%, #0a2a4a 60%, #0d3d2a 100%)' }}>
        <ParticleField />
        <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-5 py-12">
          {/* Header */}
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-12 text-center">
            <div className="mb-4 flex justify-center">
              <motion.div animate={{ scale: [1, 1.05, 1] }} transition={{ duration: 3, repeat: Infinity }}
                className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#001f3f] to-[#0d3566] text-3xl shadow-2xl border border-[#50c878]/20">
                🤖
              </motion.div>
            </div>
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#50c878] mb-2">Pilot AI</p>
              <h1 className="text-3xl font-extrabold text-white sm:text-4xl">
                {t({ fr: 'Bienvenue sur ProfitPilot', ht: 'Byenveni sou ProfitPilot' })}
              </h1>
              <p className="mt-3 text-sm text-white/60 max-w-md mx-auto">
                {t({ fr: '🔔 72 heures d\'essai gratuit — Après cela, abonnement obligatoire pour continuer.', ht: '🔔 72 èdtan esè gratis — Apre sa, abònman obligatwa pou kontinye.' })}
              </p>
          </motion.div>

          {/* AI Speech */}
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3 }}
            className="w-full max-w-xl mb-10">
            <AIBubble
              text={t({ fr: 'Bonjour ! Je suis Pilot AI — votre guide intelligent ProfitPilot. Souhaitez-vous voir une démonstration rapide de ma puissance, ou commencer à configurer votre propre business dès maintenant ?\n\n🔔 **Rappel** : Vous avez **72 heures** d\'essai gratuit après votre inscription. Après cela, un abonnement sera nécessaire pour continuer à utiliser ProfitPilot.', ht: 'Bonjou ! Mwen se Pilot AI — ou gid entèlijan ProfitPilot. Souhaitez-vous voir une démonstration rapide de ma puissance, ou commencer à configurer votre propre business dès maintenant ?\n\n🔔 **Rapèl** : Ou gen **72 èdtan** esè gratis apre enskripsyon ou. Apre sa, yon abònman pral nesesè pou kontinye itilize ProfitPilot.' })}
              showNext={false}
            />
          </motion.div>

          {/* Choice buttons */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }}
            className="flex w-full max-w-xl flex-col gap-4 sm:flex-row">
            <button onClick={() => setPath('demo')}
              className="group flex-1 rounded-2xl border border-white/10 bg-white/5 px-6 py-5 text-left backdrop-blur-sm transition hover:border-[#50c878]/40 hover:bg-white/10 active:scale-95">
              <div className="text-2xl mb-2">🔍</div>
              <p className="font-bold text-white">{t({ fr: 'Explorer la démo', ht: 'Eksplore demo a' })}</p>
              <p className="mt-1 text-sm text-white/50">{t({ fr: 'Voir ProfitPilot en action avec des données fictives', ht: 'Wè ProfitPilot an aksyon ak done fiktif' })}</p>
            </button>
            <button onClick={() => setPath('buyer')}
              className="group flex-1 rounded-2xl border border-[#50c878]/40 bg-[#50c878]/10 px-6 py-5 text-left backdrop-blur-sm transition hover:bg-[#50c878]/20 active:scale-95 relative overflow-hidden">
              <span className="absolute top-3 right-3 rounded-full bg-[#50c878] px-2 py-0.5 text-[10px] font-bold text-[#001f3f]">RECOMMANDÉ</span>
              <div className="text-2xl mb-2">🚀</div>
              <p className="font-bold text-white">{t({ fr: 'Démarrer mon business', ht: 'Kòmanse biznis mwen' })}</p>
              <p className="mt-1 text-sm text-white/50">{t({ fr: 'Configurer mon espace personnalisé en 2 minutes', ht: 'Konfigire espas pèsonalize mwen an 2 minit' })}</p>
            </button>
          </motion.div>

          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2 }}
            className="mt-8 text-xs text-white/30">
            {t({ fr: 'Déjà inscrit ?', ht: 'Deja enskri ?' })} {' '}
            <Link href="/auth/login" className="text-[#50c878] hover:underline">{t({ fr: 'Se connecter', ht: 'Konekte' })}</Link>
          </motion.p>
        </div>
      </div>
    );
  }

  // ── DEMO PARCOURS ─────────────────────────────────────────────────────────────
  if (path === 'demo') {
    const step = DEMO_STEPS[demoStep];
    return (
      <div className="relative min-h-screen overflow-hidden" style={{ background: 'linear-gradient(135deg, #001f3f 0%, #0a2a4a 60%, #0d3d2a 100%)' }}>
        <ParticleField />
        <div className="relative z-10 flex min-h-screen flex-col px-5 py-8 md:px-10">
          {/* Top bar */}
          <div className="flex items-center justify-between mb-8">
            <button onClick={() => setPath('split')} className="text-xs text-white/40 hover:text-white/70 transition">{t({ fr: '← Retour', ht: '← Retounen' })}</button>
            <div className="flex items-center gap-3">
              <span className="text-xs text-white/40">{t({ fr: 'Démonstration', ht: 'Demostrasyon' })}</span>
              <Progress step={demoStep + 1} total={DEMO_STEPS.length} />
            </div>
          </div>

          <div className="mx-auto w-full max-w-2xl flex-1 flex flex-col justify-center">
            {/* Demo card mockup */}
            <AnimatePresence mode="wait">
              <motion.div key={demoStep}
                initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}
                className="mb-8 overflow-hidden rounded-3xl border border-white/10 bg-white/5 backdrop-blur-sm">
                {/* Mock content */}
                <div className="p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <span className="text-3xl">{step.icon}</span>
                    <h2 className="text-xl font-bold text-white">{t(step.title)}</h2>
                  </div>
                  {/* Mock dashboard elements */}
                  {demoStep === 0 && (
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { l: t({ fr: 'Ventes Auj.', ht: 'Vant Jodi a' }), v: '48 500 HTG', c: '#50c878', t: '+14%' },
                        { l: t({ fr: 'Profit Net', ht: 'Pwofi Nèt' }),  v: '12 800 HTG', c: '#3b82f6', t: '+8%'  },
                        { l: t({ fr: 'Marge Moy.', ht: 'Marge Mway.' }),  v: '34.2%',      c: '#a855f7', t: '+15%' },
                      ].map(k => (
                        <div key={k.l} className="rounded-2xl border border-white/10 bg-white/5 p-3">
                          <p className="text-[10px] text-white/50 mb-1">{k.l}</p>
                          <p className="font-bold text-sm" style={{ color: k.c }}>{k.v}</p>
                          <span className="text-[10px] text-[#50c878]">▲ {k.t}</span>
                        </div>
                      ))}
                      <div className="col-span-3 rounded-2xl border border-white/10 bg-white/5 p-3">
                        <p className="text-[10px] text-white/50 mb-2">{t({ fr: 'Cashflow — 7 derniers jours', ht: 'Cashflow — 7 dènye jou' })}</p>
                        <div className="flex items-end gap-1 h-12">
                          {[40, 65, 48, 82, 55, 91, 72].map((h, i) => (
                            <div key={i} className="flex-1 rounded-t-sm transition-all"
                              style={{ height: `${h}%`, background: i === 6 ? 'linear-gradient(to top,#001f3f,#50c878)' : 'rgba(255,255,255,0.1)' }} />
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                  {demoStep === 1 && (
                    <div className="space-y-3">
                      {[
                        { name: 'Savon Karité', stock: 2,  status: 'critical', alert: 'Commander 50 unités cette semaine' },
                        { name: 'Crème Hydra',  stock: 5,  status: 'warning',  alert: 'Stock faible — reorder suggéré' },
                        { name: 'Parfum Luxe',  stock: 28, status: 'good',     alert: 'Stock optimal' },
                      ].map(p => (
                        <div key={p.name} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-3">
                          <div className={`h-3 w-3 rounded-full shrink-0 ${p.status === 'critical' ? 'bg-red-500 animate-pulse' : p.status === 'warning' ? 'bg-amber-500' : 'bg-[#50c878]'}`} />
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-white">{p.name}</p>
                            <p className="text-xs text-white/50">{p.alert}</p>
                          </div>
                          <span className={`text-sm font-bold ${p.status === 'critical' ? 'text-red-400' : p.status === 'warning' ? 'text-amber-400' : 'text-[#50c878]'}`}>{p.stock}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {demoStep === 2 && (
                    <div className="text-center py-4">
                      <motion.div animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 2, repeat: Infinity }}
                        className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-[#001f3f] to-[#0d3566] text-4xl border border-[#50c878]/30">
                        🤖
                      </motion.div>
                      <p className="text-white/70 text-sm max-w-sm mx-auto">{t({ fr: 'ProfitPilot analyse vos données en continu et prend les décisions avant même que vous ne le sachiez.', ht: 'ProfitPilot analize done ou kontinyèlman epi pran desizyon anvan menm ou pa konnen.' })}</p>
                    </div>
                  )}
                </div>
              </motion.div>
            </AnimatePresence>

            {/* AI Bubble */}
            <AnimatePresence mode="wait">
              <motion.div key={`bubble-${demoStep}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <AIBubble
                  text={t(step.text)}
                  onNext={step.action === 'convert'
                    ? () => setPath('buyer')
                    : () => setDemoStep(s => Math.min(s + 1, DEMO_STEPS.length - 1))
                  }
                  nextLabel={step.action === 'convert' ? t({ fr: '🚀 Créer mon compte gratuit', ht: '🚀 Kreye kont gratis mwen' }) : t({ fr: 'Suivant →', ht: 'Apre →' })}
                />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    );
  }

  // ── BUYER PARCOURS ────────────────────────────────────────────────────────────
  return (
    <div className="relative min-h-screen overflow-hidden" style={{ background: 'linear-gradient(135deg, #001f3f 0%, #0a2a4a 60%, #0d3d2a 100%)' }}>
      <ParticleField />
      <div className="relative z-10 flex min-h-screen flex-col px-5 py-8 md:px-10">
        {/* Top bar */}
        <div className="flex items-center justify-between mb-8">
          <button onClick={() => setPath('split')} className="text-xs text-white/40 hover:text-white/70 transition">{t({ fr: '← Retour', ht: '← Retounen' })}</button>
          <div className="flex items-center gap-3">
            <span className="text-xs text-white/40">{t({ fr: 'Configuration', ht: 'Konfigirasyon' })}</span>
            <Progress step={['name','sector','challenge','loading','reveal'].indexOf(buyerStep) + 1} total={5} />
          </div>
        </div>

        <div className="mx-auto w-full max-w-xl flex-1 flex flex-col justify-center space-y-8">

          {/* ── STEP: NAME ── */}
          {buyerStep === 'name' && (
            <AnimatePresence mode="wait">
              <motion.div key="name" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                <AIBubble
                  text={t({ fr: 'Parfait ! Je vais configurer votre espace personnalisé. Commençons. Quel est le nom de votre entreprise ?', ht: 'Pafè ! Mwen pral konfigire espas pèsonalize ou. Ann kòmanse. Ki non biznis ou ?' })}
                  showNext={false}
                />
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 2 }} className="mt-4 ml-13 space-y-3">
                  <input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && name.trim() && setBuyerStep('sector')}
                    placeholder={t({ fr: 'ex: Boutique Marie, Épicerie Bon Goût…', ht: 'eg: Boutik Marie, Episeri Bon Gou…' })}
                    className="w-full rounded-2xl border border-white/20 bg-white/10 px-5 py-4 text-white placeholder-white/30 backdrop-blur-sm outline-none focus:border-[#50c878]/60 focus:bg-white/15 transition text-sm"
                    autoFocus
                  />
                  <button onClick={() => name.trim() && setBuyerStep('sector')} disabled={!name.trim()}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#50c878] px-6 py-3 text-sm font-bold text-[#001f3f] disabled:opacity-30 hover:bg-[#4db86e] active:scale-95 transition-all">
                    {t({ fr: 'Continuer', ht: 'Kontinye' })} <ArrowRight size={14} />
                  </button>
                </motion.div>
              </motion.div>
            </AnimatePresence>
          )}

          {/* ── STEP: SECTOR ── */}
          {buyerStep === 'sector' && (
            <AnimatePresence mode="wait">
              <motion.div key="sector" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                <AIBubble
                  text={t({ fr: `Excellent ! "${name}" — c'est un beau nom. Quel est votre secteur d'activité ?`, ht: `Ekselan ! "${name}" — se yon bèl non. Ki sektè aktivite ou ?` })}
                  showNext={false}
                />
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.5 }} className="mt-4 grid grid-cols-2 gap-3">
                  {SECTORS.map(s => (
                    <button key={s.id} onClick={() => { setSector(s.id); setBuyerStep('challenge'); }}
                      className="rounded-2xl border border-white/10 bg-white/5 p-4 text-left backdrop-blur-sm transition hover:border-[#50c878]/40 hover:bg-white/10 active:scale-95">
                      <span className="text-xl">{s.emoji}</span>
                      <p className="mt-2 font-semibold text-white text-sm">{t(s.label)}</p>
                      <p className="text-xs text-white/40">{t(s.sub)}</p>
                    </button>
                  ))}
                </motion.div>
              </motion.div>
            </AnimatePresence>
          )}

          {/* ── STEP: CHALLENGE ── */}
          {buyerStep === 'challenge' && (
            <AnimatePresence mode="wait">
              <motion.div key="challenge" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                <AIBubble
                  text={t({ fr: 'Dernière question. Quel est votre défi prioritaire en ce moment ?', ht: 'Dènye kesyon. Ki defi prioritè ou kounye a ?' })}
                  showNext={false}
                />
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.5 }} className="mt-4 space-y-3">
                  {CHALLENGES.map(c => (
                    <button key={c.id} onClick={() => { setChallenge(c.id); startLoading(); }}
                      className="flex w-full items-center gap-4 rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-left backdrop-blur-sm transition hover:border-[#50c878]/40 hover:bg-white/10 active:scale-95">
                      <span className="text-2xl">{c.emoji}</span>
                      <div>
                        <p className="font-semibold text-white">{t(c.label)}</p>
                        <p className="text-xs text-white/40">{t(c.sub)}</p>
                      </div>
                      <ChevronRight size={16} className="ml-auto text-white/30" />
                    </button>
                  ))}
                </motion.div>
              </motion.div>
            </AnimatePresence>
          )}

          {/* ── STEP: LOADING ── */}
          {buyerStep === 'loading' && (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center space-y-8">
              <motion.div animate={{ scale: [1, 1.08, 1], rotate: [0, 5, -5, 0] }} transition={{ duration: 2.5, repeat: Infinity }}
                className="mx-auto flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-br from-[#001f3f] to-[#0d3566] text-5xl border border-[#50c878]/30 shadow-2xl">
                🤖
              </motion.div>
              <div className="space-y-3">
                {LOADING_STEPS.slice(0, loadingIdx + 1).map((s, i) => (
                  <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                    className="flex items-center justify-center gap-2 text-sm">
                    <span className="text-[#50c878]">{i <= loadingIdx - 1 ? '✓' : '⟳'}</span>
                    <span className={i <= loadingIdx - 1 ? 'text-white/60' : 'text-white'}>{t(s.text)}</span>
                  </motion.div>
                ))}
              </div>
              <div className="h-1.5 w-full max-w-xs mx-auto rounded-full bg-white/10 overflow-hidden">
                <motion.div className="h-full rounded-full bg-[#50c878]"
                  animate={{ width: `${(loadingIdx / (LOADING_STEPS.length - 1)) * 100}%` }}
                  transition={{ duration: 0.5 }} />
              </div>
            </motion.div>
          )}

          {/* ── STEP: REVEAL ── */}
          {buyerStep === 'reveal' && (
            <AnimatePresence>
              <motion.div key="reveal" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="space-y-6">
                <div className="text-center">
                  <motion.div animate={{ scale: [1, 1.05, 1] }} transition={{ duration: 2, repeat: Infinity }}
                    className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-[#001f3f] to-[#0d3566] text-4xl border border-[#50c878]/30 shadow-2xl">
                    🤖
                  </motion.div>
                  <motion.div animate={{ boxShadow: ['0 0 0 0 rgba(80,200,120,0)', '0 0 40px rgba(80,200,120,0.3)', '0 0 0 0 rgba(80,200,120,0)'] }}
                    transition={{ duration: 2, repeat: 3 }}
                    className="inline-block rounded-2xl border border-[#50c878]/30 bg-[#50c878]/10 px-6 py-2 mb-4">
                    <p className="font-black text-[#50c878] text-lg">{t({ fr: '✓ Cockpit Prêt !', ht: '✓ Kabin Pare !' })}</p>
                  </motion.div>
                  <h2 className="text-2xl font-extrabold text-white">{t({ fr: 'Bienvenue', ht: 'Byenveni' })}, {name} !</h2>
                  <p className="text-white/60 mt-2 text-sm max-w-sm mx-auto">
                    {t({ fr: 'Votre espace ProfitPilot est configuré et optimisé pour votre secteur. Je surveille tout pour vous.', ht: 'Espas ProfitPilot ou konfigure epi optimize pou sektè ou. Mwen siveye tout bagay pou ou.' })}
                  </p>
                </div>

                {/* Features unlocked */}
                <div className="rounded-2xl border border-[#50c878]/20 bg-[#50c878]/5 p-5 space-y-3">
                  <p className="text-xs font-bold uppercase tracking-widest text-[#50c878] mb-3">{t({ fr: 'Fonctionnalités Activées', ht: 'Fonksyonalite Aktive' })}</p>
                  {[
                    t({ fr: '📊 Dashboard intelligent avec alertes IA', ht: '📊 Dashboard entelijan ak alèt IA' }),
                    t({ fr: '📦 Gestion stock avec prévisions ruptures', ht: '📦 Jesyon stock ak previzyon ruptures' }),
                    t({ fr: '💰 Calcul profit automatique HTG/USD', ht: '💰 Kalkil pwofi otomatik HTG/USD' }),
                    t({ fr: '🤖 Pilot AI — conseiller financier personnel', ht: '🤖 Pilot AI — konseye finansye pèsonèl' }),
                    t({ fr: '📋 Rapports financiers automatiques', ht: '📋 Rapò finansye otomatik' }),
                  ].map((f, i) => (
                    <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }}
                      className="flex items-center gap-2 text-sm text-white/80">
                      <Check size={12} className="text-[#50c878] shrink-0" />
                      {f}
                    </motion.div>
                  ))}
                </div>

                {/* Moment magique */}
                <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-white/70">
                  <p className="font-semibold text-white mb-1">🎯 {t({ fr: 'Premier objectif :', ht: 'Premye objektif :' })}</p>
                  <p>Klike sou <strong className="text-[#50c878]">"+ Nouvo Pwodui"</strong> nan paj Produits la — Pilot AI pral kalkile mòj ou otomatikman.</p>
                </div>

                {/* CTA */}
                <div className="flex flex-col gap-3">
                  <Link href={`/auth/register${name ? `?business_name=${encodeURIComponent(name.trim())}` : ''}`}
                    className="group flex items-center justify-center gap-3 rounded-2xl bg-[#50c878] px-6 py-4 text-base font-black text-[#001f3f] shadow-2xl hover:bg-[#4db86e] active:scale-95 transition-all">
                    <Sparkles size={16} />
                    {t({ fr: 'Créer mon compte gratuit', ht: 'Kreye kont gratis mwen' })}
                    <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
                  </Link>
                  <Link href="/dashboard"
                    className="text-center text-sm text-white/40 hover:text-white/70 transition py-2">
                    {t({ fr: 'Explorer sans compte →', ht: 'Eksplore san kont →' })}
                  </Link>
                </div>

                <p className="text-center text-xs text-white/30">{t({ fr: 'Aucune carte bancaire • 3 jours Premium gratuits inclus', ht: 'Pa gen kat bankè • 3 jou Premium gratis enkli' })}</p>
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </div>
    </div>
  );
}
