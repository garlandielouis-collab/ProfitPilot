'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const WELCOME_KEY = 'pp_welcome_seen_v2';

const WELCOME_STEPS = [
  { text: { fr: 'Bonjour ! 👋', ht: 'Bonjou ! 👋' }, delay: 600 },
  { text: { fr: 'Je suis Pilot AI — votre assistant financier intelligent.', ht: 'Mwen se Pilot AI — asistans finansye entelijan ou.' }, delay: 1500 },
  { text: { fr: 'Félicitations pour avoir choisi ProfitPilot ! 🚀', ht: 'Felisitasyon pou w chwazi ProfitPilot ! 🚀' }, delay: 1800 },
  { text: { fr: 'Prêt à dominer vos finances ?', ht: 'Pare pou domine finans ou ?' }, delay: 1400 },
];

export function WelcomeAnimation() {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);
  const [displayedText, setDisplayedText] = useState('');
  const [typing, setTyping] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const seen = localStorage.getItem(WELCOME_KEY);
    if (!seen) {
      const timer = setTimeout(() => setVisible(true), 400);
      return () => clearTimeout(timer);
    }
  }, []);

  const dismiss = useCallback(() => {
    setDismissed(true);
    localStorage.setItem(WELCOME_KEY, '1');
    setTimeout(() => setVisible(false), 400);
  }, []);

  useEffect(() => {
    if (!visible || dismissed) return;
    if (step >= WELCOME_STEPS.length) {
      const timer = setTimeout(dismiss, 2500);
      return () => clearTimeout(timer);
    }

    const { text, delay } = WELCOME_STEPS[step];
    const fullText = text.fr + '\n' + text.ht;
    setTyping(true);
    setDisplayedText('');

    let i = 0;
    const typeInterval = setInterval(() => {
      i++;
      setDisplayedText(fullText.slice(0, i));
      if (i >= fullText.length) {
        clearInterval(typeInterval);
        setTyping(false);
      }
    }, 25);

    const stepTimer = setTimeout(() => {
      clearInterval(typeInterval);
      setStep(s => s + 1);
    }, delay + fullText.length * 25);

    return () => {
      clearInterval(typeInterval);
      clearTimeout(stepTimer);
    };
  }, [visible, step, dismissed, dismiss]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center"
          style={{
            background: 'linear-gradient(135deg, rgba(0,31,63,0.97) 0%, rgba(10,42,74,0.97) 60%, rgba(13,61,42,0.97) 100%)',
          }}
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.6, ease: 'easeOut' }}
            className="relative flex flex-col items-center gap-8 px-6 max-w-lg mx-auto text-center"
          >
            {/* Robot Avatar */}
            <motion.div
              animate={{ scale: [1, 1.05, 1], rotate: [0, -3, 3, 0] }}
              transition={{ duration: 3, repeat: Infinity, repeatType: 'reverse' }}
              className="flex h-28 w-28 items-center justify-center rounded-3xl"
              style={{
                background: 'linear-gradient(135deg, #001f3f 0%, #0d3566 100%)',
                border: '2px solid rgba(80,200,120,0.3)',
                boxShadow: '0 0 40px rgba(80,200,120,0.2), 0 10px 40px rgba(0,0,0,0.3)',
              }}
            >
              <motion.span
                animate={{ scale: [1, 1.15, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="text-6xl"
              >
                🤖
              </motion.span>
            </motion.div>

            {/* Speech Bubble */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="relative rounded-2xl rounded-tl-sm px-8 py-6"
              style={{
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(80,200,120,0.2)',
                backdropFilter: 'blur(12px)',
              }}
            >
              <p className="text-base leading-relaxed text-white/90 whitespace-pre-line min-h-[3rem]">
                {displayedText}
                {typing && (
                  <motion.span
                    animate={{ opacity: [1, 0] }}
                    transition={{ duration: 0.6, repeat: Infinity, repeatType: 'reverse' }}
                    className="inline-block ml-0.5 h-4 w-[2px] bg-emerald-400 align-middle"
                  />
                )}
              </p>
            </motion.div>

            {/* Progress dots */}
            <div className="flex gap-2">
              {WELCOME_STEPS.map((_, i) => (
                <motion.div
                  key={i}
                  animate={{
                    scale: i === Math.min(step, WELCOME_STEPS.length - 1) ? 1.3 : 1,
                    background: i <= step ? '#50c878' : 'rgba(255,255,255,0.2)',
                  }}
                  transition={{ duration: 0.3 }}
                  className="h-2 w-2 rounded-full"
                />
              ))}
            </div>

            {/* Skip button */}
            <button
              onClick={dismiss}
              className="absolute top-6 right-6 rounded-xl px-4 py-2 text-xs font-medium text-white/50 hover:text-white/80 transition-colors"
              style={{ background: 'rgba(255,255,255,0.05)' }}
            >
              Passer →
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
