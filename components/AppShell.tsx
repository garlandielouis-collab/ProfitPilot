'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useLanguage } from './LanguageWrapper';
import { Logo } from './Logo';
import { PilotAIGuide } from './PilotAIGuide';
import { WelcomeAnimation } from './WelcomeAnimation';
import { useSubscriptionCheck } from '../hooks/useSubscription';

type NavItem = {
  title: { fr: string; ht: string };
  href: string;
  icon: ReactNode;
};

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const navItems: NavItem[] = [
  {
    title: { fr: 'Accueil', ht: 'Akèy' },
    href: '/',
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9.5L12 3l9 6.5v9.5a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1V9.5z" />
      </svg>
    ),
  },
  {
    title: { fr: 'Ventes', ht: 'Vant' },
    href: '/sales',
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 7h16M4 12h10M4 17h7" />
      </svg>
    ),
  },
  {
    title: { fr: 'Clients', ht: 'Kliyan' },
    href: '/clients',
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    title: { fr: 'Produits', ht: 'Pwodwi' },
    href: '/products',
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      </svg>
    ),
  },
  {
    title: { fr: 'Inventaire', ht: 'Envantè' },
    href: '/inventory',
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
        <rect x="9" y="3" width="6" height="4" rx="1" />
        <path d="M9 12h6M9 16h4" />
      </svg>
    ),
  },
  {
    title: { fr: 'Fournisseurs', ht: 'Founisè' },
    href: '/suppliers',
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="3" width="15" height="13" rx="1" />
        <path d="M16 8h4l3 5v3h-7V8z" />
        <circle cx="5.5" cy="18.5" r="2.5" />
        <circle cx="18.5" cy="18.5" r="2.5" />
      </svg>
    ),
  },
  {
    title: { fr: 'Achats', ht: 'Acha' },
    href: '/purchases',
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
        <path d="M3 6h18M16 10a4 4 0 0 1-8 0" />
      </svg>
    ),
  },
  {
    title: { fr: 'Dettes', ht: 'Dèt' },
    href: '/dettes',
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
      </svg>
    ),
  },
  {
    title: { fr: 'Dépenses', ht: 'Depans' },
    href: '/expenses',
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
  },
  {
    title: { fr: 'Dashboard', ht: 'Dashboard' },
    href: '/dashboard',
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    title: { fr: 'Comptabilité', ht: 'Kontablite' },
    href: '/rapports/comptabilite',
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
      </svg>
    ),
  },
  {
    title: { fr: 'Rapports', ht: 'Rapò' },
    href: '/rapports',
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14,2 14,8 20,8" />
        <path d="M16 13H8M16 17H8M10 9H8" />
      </svg>
    ),
  },
  {
    title: { fr: 'Pilot AI', ht: 'Pilot AI' },
    href: '/ai-assistant',
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9.663 17h4.673M12 3v1m6.364 1.636-.707.707M21 12h-1M4 12H3m3.343-5.657-.707-.707m2.828 9.9a5 5 0 1 1 7.072 0l-.548.547A3.374 3.374 0 0 0 14 18.469V19a2 2 0 1 1-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    ),
  },
  {
    title: { fr: 'Paramètres', ht: 'Paramèt' },
    href: '/settings',
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.05A1.65 1.65 0 0 0 9 4.6V4a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.05a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
];

const mobileNavKeys = ['/', '/sales', '/dashboard', '/ai-assistant', '/settings'];
const mobileNavItems = navItems.filter((item) => mobileNavKeys.includes(item.href));

function NavLink({
  item,
  active,
  onClick,
  compact = false,
}: {
  item: NavItem;
  active: boolean;
  onClick?: () => void;
  compact?: boolean;
}) {
  const { t } = useLanguage();

  if (compact) {
    return (
      <Link
        href={item.href}
        onClick={onClick}
        className={[
          'group flex flex-col items-center justify-center gap-1 rounded-xl px-3 py-2 text-[0.7rem] font-medium transition-all duration-150',
          active
            ? 'text-[#001F3F] dark:text-[#50C878]'
            : 'text-slate-400 hover:text-[#001F3F] dark:text-slate-500 dark:hover:text-slate-200',
        ].join(' ')}
      >
        <span
          className={[
            'flex h-9 w-9 items-center justify-center rounded-xl transition-all duration-150',
            active
              ? 'bg-[#EAF1F8] text-[#001F3F] dark:bg-[#50C878]/10 dark:text-[#50C878]'
              : 'text-slate-400 group-hover:bg-slate-100 dark:text-slate-500 dark:group-hover:bg-white/5',
          ].join(' ')}
        >
          {item.icon}
        </span>
        <span>{t(item.title)}</span>
      </Link>
    );
  }

  return (
    <div className="relative">
      {active && (
        <span className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-[#50C878]" />
      )}
      <Link
        href={item.href}
        onClick={onClick}
        className={[
          'flex items-center gap-3 rounded-xl py-2.5 pl-5 pr-4 text-sm transition-all duration-150',
          active
            ? 'bg-[#EAF1F8] font-semibold text-[#001F3F] dark:bg-[#50C878]/10 dark:text-[#50C878]'
            : 'text-slate-500 hover:bg-slate-50 hover:text-[#001F3F] dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-200',
        ].join(' ')}
      >
        <span
          className={active ? 'text-[#001F3F] dark:text-[#50C878]' : 'text-slate-400 dark:text-slate-500'}
        >
          {item.icon}
        </span>
        <span>{t(item.title)}</span>
      </Link>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router   = useRouter();
  const { language, setLanguage, t } = useLanguage();
  const { isExpired, isPublic: subPublic, checking: subChecking } = useSubscriptionCheck();
  const [user, setUser] = useState<any>(null);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [mobilePreview, setMobilePreview] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const isAuthPage       = pathname?.startsWith('/auth');
  const isLandingPage    = pathname === '/';
  const isOnboardingPage = pathname?.startsWith('/onboarding');
  const isPublicPage     = isLandingPage || isOnboardingPage || isAuthPage;
  const showAside        = !isAuthPage && !mobilePreview && !isLandingPage && !isOnboardingPage;

  useEffect(() => {
    let mounted = true;
    let listener: { subscription: { unsubscribe: () => void } } | null = null;

    try {
      const sub = supabase.auth.onAuthStateChange((_event: any, session: any) => {
        if (!mounted) return;
        setUser(session?.user ?? null);
      });
      listener = sub.data;
    } catch (e) {
      console.warn('[AppShell] onAuthStateChange error:', (e as Error).message);
    }

    const installHandler = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', installHandler as EventListener);
    return () => {
      mounted = false;
      listener?.subscription.unsubscribe();
      window.removeEventListener('beforeinstallprompt', installHandler as EventListener);
    };
  }, []);

  // If an unauthenticated user lands on a protected route like /dashboard,
  // send them back to the public landing page instead of showing the login UI.
  useEffect(() => {
    if (!user && pathname === '/dashboard') {
      router.replace('/');
    }
  }, [user, pathname, router]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace('/auth/login');
  };

  const handleInstall = async () => {
    if (installPrompt) {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === 'accepted') setInstallPrompt(null);
      return;
    }
    alert("Sur mobile, utilisez le menu du navigateur pour ajouter ProfitPilot à l'écran d'accueil.");
  };

  const userInitials = user?.email
    ? user.email.slice(0, 2).toUpperCase()
    : 'PP';

  if (isPublicPage) return <>{children}</>;

  if (subChecking) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#001F3F] border-t-transparent" />
      </div>
    );
  }

  if (user && isExpired && !subPublic) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-md text-center space-y-6">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100">
            <svg className="h-8 w-8 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-[#001F3F]">
            {t({ fr: 'Période d\'essai terminée', ht: 'Periyòd esè fini' })}
          </h2>
          <p className="text-sm text-slate-500">
            {t({
              fr: 'Votre période d\'essai de 72 heures est expirée. Souscrivez à un abonnement pour continuer à utiliser ProfitPilot.',
              ht: 'Periyòd esè 72 èdtan ou fini. Abonne-w pou kontinye itilize ProfitPilot.',
            })}
          </p>
          <Link href="/pricing" className="inline-flex items-center gap-2 rounded-xl bg-[#001F3F] px-6 py-3 text-sm font-semibold text-white hover:bg-[#002D5B]">
            {t({ fr: 'Voir les abonnements', ht: 'Wè abònman yo' })}
          </Link>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center space-y-4">
           <p className="text-slate-500">{t({ fr: 'Session expirée. Veuillez vous reconnecter.', ht: 'Sesyon ekspire. Tanpri rekonekte.' })}</p>
          <Link
            href="/auth/login"
            className="inline-flex items-center gap-2 rounded-xl bg-[#001F3F] px-6 py-3 text-sm font-semibold text-white hover:bg-[#002D5B]"
          >
            {t({ fr: 'Se connecter', ht: 'Konekte' })}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
      {/* ── Top header ────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-[var(--color-border)] bg-white/95 backdrop-blur-sm dark:bg-[#020617]/95 dark:border-slate-800">
        <div className="mx-auto flex items-center justify-between gap-4 px-4 py-3 sm:px-5">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="inline-flex items-center justify-center rounded-xl border border-[var(--color-border)] p-2 text-slate-500 transition hover:bg-slate-50 dark:hover:bg-white/5 lg:hidden"
              aria-label="Ouvrir le menu"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-5 w-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            <div className="flex items-center gap-2.5">
              <Logo size="h-9 w-9" />
              <div className="hidden sm:block">
                <p className="text-sm font-semibold leading-tight text-[#001F3F] dark:text-white">ProfitPilot</p>
                <p className="text-[0.65rem] leading-tight text-slate-400 dark:text-slate-500">
                  {t({ fr: 'Pilotage intelligent', ht: 'Pilotaj entèlijan' })}
                </p>
              </div>
            </div>
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setLanguage(language === 'fr' ? 'ht' : 'fr')}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5"
            >
              {language === 'fr' ? 'HT' : 'FR'}
            </button>
            <button
              type="button"
              onClick={() => setMobilePreview((v) => !v)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                mobilePreview
                  ? 'border-[#001F3F] bg-[#001F3F] text-white'
                  : 'border-[var(--color-border)] bg-[var(--color-surface)] text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5'
              }`}
            >
              {mobilePreview
                ? t({ fr: 'Vue laptop', ht: 'Gade laptop' })
                : t({ fr: 'Vue mobile', ht: 'Gade mobil' })}
            </button>
            <button
              type="button"
              onClick={handleInstall}
              className="rounded-lg bg-[#001F3F] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#002D5B] dark:bg-[#50C878] dark:text-[#001F3F] dark:hover:bg-[#3daa62]"
            >
              {t({ fr: 'Installer', ht: 'Enstale' })}
            </button>
          </div>
        </div>
      </header>

      <div
        className={`mx-auto flex min-h-[calc(100vh-57px)] ${
          mobilePreview ? 'max-w-[420px] rounded-[24px] border border-[var(--color-border)] shadow-xl' : 'max-w-full'
        } bg-[var(--color-bg)]`}
      >
        {/* ── Mobile slide-over nav ────────────────────────── */}
        {mobileNavOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setMobileNavOpen(false)}
            />
            <aside className="relative flex h-full w-72 flex-col overflow-y-auto bg-white dark:bg-[#0F172A]">
              <div className="flex items-center justify-between border-b border-[var(--color-border)] dark:border-slate-800 px-5 py-4">
                <div className="flex items-center gap-2.5">
                  <Logo size="h-8 w-8" />
                  <p className="text-sm font-semibold text-[#001F3F] dark:text-white">ProfitPilot</p>
                </div>
                <button
                  onClick={() => setMobileNavOpen(false)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>

              <nav className="flex-1 space-y-0.5 px-3 py-4">
                <p className="mb-2 px-2 text-[0.65rem] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-600">
                  {t({ fr: 'Navigation', ht: 'Navigasyon' })}
                </p>
                {navItems.map((item) => (
                  <NavLink
                    key={item.href}
                    item={item}
                    active={pathname === item.href}
                    onClick={() => setMobileNavOpen(false)}
                  />
                ))}
              </nav>

              {user && (
                <div className="border-t border-[var(--color-border)] dark:border-slate-800 px-4 py-4">
                  <div className="flex items-center gap-3 rounded-xl bg-[var(--color-surface)] dark:bg-white/5 px-3 py-2.5">
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#001F3F] text-xs font-bold text-white">
                      {userInitials}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-[var(--color-text)]">{user.email}</p>
                      <p className="text-[0.65rem] text-[var(--color-muted)]">ProfitPilot</p>
                    </div>
                  </div>
                </div>
              )}
            </aside>
          </div>
        )}

        {/* ── Desktop sidebar ──────────────────────────────── */}
        {showAside && (
          <aside className="hidden w-64 flex-shrink-0 flex-col border-r border-[var(--color-border)] bg-white dark:bg-[#0F172A] dark:border-slate-800 lg:flex">
            <nav className="flex-1 space-y-0.5 px-3 py-5">
              <p className="mb-3 px-2 text-[0.62rem] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-600">
                {t({ fr: 'Navigation', ht: 'Navigasyon' })}
              </p>
              {navItems.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  active={pathname === item.href}
                />
              ))}
            </nav>

            <div className="border-t border-[var(--color-border)] dark:border-slate-800 px-4 py-4 space-y-2">
              {user ? (
                <>
                  <div className="flex items-center gap-3 rounded-xl bg-[var(--color-surface)] dark:bg-white/5 px-3 py-2.5">
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#001F3F] text-xs font-bold text-white">
                      {userInitials}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-[var(--color-text)]">{user.email}</p>
                      <p className="text-[0.65rem] text-[var(--color-muted)]">ProfitPilot</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-red-50 hover:border-red-200 hover:text-red-600 dark:bg-white/5 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    {t({ fr: 'Déconnexion', ht: 'Dekoneksyon' })}
                  </button>
                </>
              ) : (
                <>
                  <Link
                    href="/auth/login"
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#001F3F] px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-[#002D5B]"
                  >
                    {t({ fr: 'Se connecter', ht: 'Konekte' })}
                  </Link>
                  <Link
                    href="/auth/register"
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#001F3F] px-3 py-2.5 text-sm font-semibold text-[#001F3F] transition hover:bg-[#EAF1F8] dark:border-slate-500 dark:text-slate-300 dark:hover:bg-white/5"
                  >
                    {t({ fr: 'S\'inscrire', ht: 'Enskri' })}
                  </Link>
                </>
              )}
            </div>
          </aside>
        )}

        {/* ── Main content ─────────────────────────────────── */}
        <main className="min-w-0 flex-1">
          {children}
        </main>
      </div>

      {/* ── Pilot AI Guide ───────────────────────────────── */}
      <PilotAIGuide />

      {/* ── Welcome Animation (first visit only) ──────── */}
      <WelcomeAnimation />

      {/* ── Mobile bottom nav ────────────────────────────── */}
      {!isAuthPage && !isLandingPage && !isOnboardingPage && (
        <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-[var(--color-border)] bg-white/98 dark:bg-[#0F172A]/98 dark:border-slate-800 backdrop-blur-sm px-2 py-2 shadow-[0_-4px_16px_rgba(15,23,42,0.06)] lg:hidden">
          <div className="mx-auto flex max-w-sm items-center justify-around">
            {mobileNavItems.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                active={pathname === item.href}
                compact
              />
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}
