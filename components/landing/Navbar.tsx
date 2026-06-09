'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X } from 'lucide-react';
import { useLanguage } from '../LanguageWrapper';
import { supabase } from '../../lib/supabaseClient';

const LINKS = [
  { label: { fr: 'Fonctionnalités', ht: 'Fonksyon' }, href: '#features' },
  { label: { fr: 'Témoignages', ht: 'Temwayaj' }, href: '#testimonials' },
  { label: { fr: 'Tarifs', ht: 'Pri' }, href: '/pricing' },
];

const gradBtn: React.CSSProperties = {
  background: '#001f3f',
};

export function Navbar() {
  const { language, setLanguage, t } = useLanguage();
  const [user, setUser] = useState<any>(null);
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then((res: any) => {
      if (active) setUser(res.data?.user ?? null);
    });
    const { data: l } = supabase.auth.onAuthStateChange((_: any, s: any) => {
      setUser(s?.user ?? null);
    });
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      active = false;
      l?.subscription.unsubscribe();
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  return (
    <>
      <motion.nav
        initial={{ y: -80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
        className="sticky top-0 z-40 flex items-center justify-between gap-4 px-5 py-4 md:px-10"
        style={{
          background: scrolled ? 'rgba(255,255,255,0.96)' : 'rgba(255,255,255,0.85)',
          backdropFilter: 'blur(16px)',
          borderBottom: '1px solid #E2E8F0',
          transition: 'background 0.3s ease',
        }}
      >
        {/* Brand */}
        <div className="flex items-center gap-3">
          <img
            src="/profitpilot-logo.png"
            alt="ProfitPilot"
            className="h-9 w-9 rounded-xl object-contain"
          />
          <span className="text-sm font-semibold text-[#001f3f]">ProfitPilot</span>
        </div>

        {/* Desktop links */}
        <div className="hidden items-center gap-7 md:flex">
          {LINKS.map(lk => (
            <a
              key={lk.href}
              href={lk.href}
              className="text-sm text-slate-500 transition hover:text-[#001f3f]"
            >
              {t(lk.label)}
            </a>
          ))}
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-2">
          {/* Language switcher */}
          <div className="hidden items-center rounded-full border border-white/10 bg-white/5 p-1 sm:flex">
            {(['fr', 'ht'] as const).map(lang => (
              <button
                key={lang}
                onClick={() => setLanguage(lang)}
                className="rounded-full px-3 py-1.5 text-xs font-semibold transition"
                style={
                  language === lang
                    ? { ...gradBtn, color: 'white' }
                    : { color: 'rgba(255,255,255,0.45)' }
                }
              >
                {lang.toUpperCase()}
              </button>
            ))}
          </div>

          {!user ? (
            <>
              <Link
                href="/auth/login"
                className="hidden rounded-xl border border-[#E2E8F0] px-4 py-2 text-sm text-slate-600 transition hover:border-[#001f3f]/20 hover:text-[#001f3f] sm:block"
              >
                {t({ fr: 'Se connecter', ht: 'Konekte' })}
              </Link>
              <Link
                href="/auth/register"
                className="rounded-xl px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
                style={gradBtn}
              >
                {t({ fr: 'Essai gratuit', ht: 'Eseye gratis' })}
              </Link>
            </>
          ) : (
            <Link
              href="/dashboard"
              className="rounded-xl px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
              style={gradBtn}
            >
              {t({ fr: 'Mon Dashboard', ht: 'Dashboard mwen' })}
            </Link>
          )}

          <button
            onClick={() => setOpen(v => !v)}
            aria-label="Menu"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#E2E8F0] bg-white text-slate-500 transition hover:bg-slate-50 md:hidden"
          >
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </motion.nav>

      {/* Mobile drawer */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="mobile-menu"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
            style={{
              background: 'rgba(255,255,255,0.98)',
              borderBottom: '1px solid #E2E8F0',
            }}
          >
            <div className="flex flex-col gap-2 px-5 py-4">
              {LINKS.map(lk => (
                <a
                  key={lk.href}
                  href={lk.href}
                  onClick={() => setOpen(false)}
                  className="py-2 text-sm text-slate-600 transition hover:text-[#001f3f]"
                >
                  {t(lk.label)}
                </a>
              ))}
              <div className="my-1 border-t border-white/[0.06]" />
              <div className="flex gap-2">
                {(['fr', 'ht'] as const).map(lang => (
                  <button
                    key={lang}
                    onClick={() => { setLanguage(lang); setOpen(false); }}
                    className="rounded-xl border px-4 py-2 text-xs font-semibold"
                    style={
                      language === lang
                        ? { ...gradBtn, color: 'white', borderColor: 'transparent' }
                        : { borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.45)' }
                    }
                  >
                    {lang.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
