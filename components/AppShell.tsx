'use client';

import type { ReactNode } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useLanguage } from './LanguageWrapper';
import { Logo } from './Logo';
import { useSubscriptionCheck, resetTrialTimer } from '../hooks/useSubscription';
import { StoreSwitcher } from './StoreSwitcher';
import { CompanySwitcher } from './CompanySwitcher';
import { NotificationBell } from './NotificationBell';

// Non-critical: load after main content is interactive
const PilotAIGuide    = dynamic(() => import('./PilotAIGuide').then((m) => ({ default: m.PilotAIGuide })), { ssr: false });
const WelcomeAnimation = dynamic(() => import('./WelcomeAnimation').then((m) => ({ default: m.WelcomeAnimation })), { ssr: false });

type NavItem = {
  title: { fr: string; ht: string };
  href: string;
  icon: ReactNode;
};

type NavSection = {
  label?: { fr: string; ht: string };
  items: NavItem[];
  dividerBefore?: boolean;
};

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

// ── Icons ─────────────────────────────────────────────────────────────────────

const IconDashboard = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" />
  </svg>
);
const IconAI = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9.663 17h4.673M12 3v1m6.364 1.636-.707.707M21 12h-1M4 12H3m3.343-5.657-.707-.707m2.828 9.9a5 5 0 1 1 7.072 0l-.548.547A3.374 3.374 0 0 0 14 18.469V19a2 2 0 1 1-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
  </svg>
);
const IconSales = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 7h16M4 12h10M4 17h7" />
  </svg>
);
const IconClients = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);
const IconProducts = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
  </svg>
);
const IconInventory = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
    <rect x="9" y="3" width="6" height="4" rx="1" /><path d="M9 12h6M9 16h4" />
  </svg>
);
const IconSuppliers = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="3" width="15" height="13" rx="1" /><path d="M16 8h4l3 5v3h-7V8z" />
    <circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" />
  </svg>
);
const IconPurchases = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><path d="M3 6h18M16 10a4 4 0 0 1-8 0" />
  </svg>
);
const IconExpenses = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
  </svg>
);
const IconDebts = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
  </svg>
);
const IconAccounting = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
  </svg>
);
const IconReports = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14,2 14,8 20,8" /><path d="M16 13H8M16 17H8M10 9H8" />
  </svg>
);
const IconEmployees = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);
const IconRoles = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="M9 12l2 2 4-4" />
  </svg>
);
const IconBoutique = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path d="M9 22V12h6v10" />
  </svg>
);
const IconCompanies = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 22V4a2 2 0 012-2h8a2 2 0 012 2v18" /><path d="M2 22h20M10 6h.01M14 6h.01M10 10h.01M14 10h.01M10 14h.01M14 14h.01" />
    <rect x="10" y="18" width="4" height="4" />
  </svg>
);
const IconActivity = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
  </svg>
);
const IconNotifications = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);
const IconBackup = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v14a2 2 0 0 1-2 2z" />
    <polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" />
  </svg>
);
const IconSecurity = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="M8 11h8M12 8v6" />
  </svg>
);
const IconSettings = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.05A1.65 1.65 0 0 0 9 4.6V4a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.05a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);
const IconAnalytics = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 20V10M12 20V4M6 20v-6" />
  </svg>
);
const IconAutomation = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
  </svg>
);
const IconAPI = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 9l-3 3 3 3M16 9l3 3-3 3M10 18l4-12" />
  </svg>
);

// ── Nav sections ──────────────────────────────────────────────────────────────

const navSections: NavSection[] = [
  {
    label: { fr: 'Accueil', ht: 'Akèy' },
    items: [
      { title: { fr: 'Dashboard', ht: 'Dashboard' }, href: '/dashboard', icon: <IconDashboard /> },
      { title: { fr: 'Pilot AI', ht: 'Pilot AI' }, href: '/ai-assistant', icon: <IconAI /> },
    ],
  },
  {
    label: { fr: 'Commerce', ht: 'Komès' },
    items: [
      { title: { fr: 'Ventes', ht: 'Vant' }, href: '/sales', icon: <IconSales /> },
      { title: { fr: 'Clients', ht: 'Kliyan' }, href: '/customers', icon: <IconClients /> },
      { title: { fr: 'Produits', ht: 'Pwodwi' }, href: '/products', icon: <IconProducts /> },
      { title: { fr: 'Inventaire', ht: 'Envantè' }, href: '/inventory', icon: <IconInventory /> },
      { title: { fr: 'Achats', ht: 'Acha' }, href: '/purchases', icon: <IconPurchases /> },
      { title: { fr: 'Fournisseurs', ht: 'Founisè' }, href: '/suppliers', icon: <IconSuppliers /> },
    ],
  },
  {
    label: { fr: 'Finances', ht: 'Finans' },
    items: [
      { title: { fr: 'Dépenses', ht: 'Depans' }, href: '/expenses', icon: <IconExpenses /> },
      { title: { fr: 'Dettes', ht: 'Dèt' }, href: '/dettes', icon: <IconDebts /> },
      { title: { fr: 'Créances', ht: 'Kredi kliyan' }, href: '/creances', icon: <IconDebts /> },
      { title: { fr: 'Comptabilité', ht: 'Kontablite' }, href: '/rapports/comptabilite', icon: <IconAccounting /> },
      { title: { fr: 'Rapports', ht: 'Rapò' }, href: '/rapports', icon: <IconReports /> },
    ],
  },
  {
    label: { fr: 'Équipe', ht: 'Ekip' },
    items: [
      { title: { fr: 'Employés', ht: 'Anplwaye' }, href: '/employes', icon: <IconEmployees /> },
      { title: { fr: 'Rôles & Permissions', ht: 'Wòl & Pèmisyon' }, href: '/roles', icon: <IconRoles /> },
    ],
  },
  {
    dividerBefore: true,
    items: [
      { title: { fr: 'Boutique', ht: 'Boutik' }, href: '/boutique', icon: <IconBoutique /> },
      { title: { fr: 'Analyses avancées', ht: 'Analiz avanse' }, href: '/analytics', icon: <IconAnalytics /> },
      { title: { fr: 'Automatisation', ht: 'Otomatizasyon' }, href: '/automation', icon: <IconAutomation /> },
      { title: { fr: 'API Access', ht: 'API Access' }, href: '/api-access', icon: <IconAPI /> },
      { title: { fr: 'Entreprises', ht: 'Antrepriz' }, href: '/entreprises', icon: <IconCompanies /> },
      { title: { fr: 'Activité', ht: 'Aktivite' }, href: '/activity', icon: <IconActivity /> },
      { title: { fr: 'Notifications', ht: 'Notifikasyon' }, href: '/notifications', icon: <IconNotifications /> },
      { title: { fr: 'Sauvegardes', ht: 'Sovgad' }, href: '/backup', icon: <IconBackup /> },
      { title: { fr: 'Sécurité', ht: 'Sekirite' }, href: '/security', icon: <IconSecurity /> },
      { title: { fr: 'Paramètres', ht: 'Paramèt' }, href: '/settings', icon: <IconSettings /> },
    ],
  },
];

const allNavItems = navSections.flatMap((s) => s.items);

const mobileNavKeys = ['/dashboard', '/sales', '/products', '/ai-assistant', '/settings'];
const mobileNavItems = allNavItems.filter((item) => mobileNavKeys.includes(item.href));

// ── NavLink ───────────────────────────────────────────────────────────────────

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
            ? 'font-semibold text-[#001F3F] dark:text-[#50C878]'
            : 'text-slate-500 hover:bg-slate-50 hover:text-[#001F3F] dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-200',
        ].join(' ')}
      >
        <span className={active ? 'text-[#50C878]' : 'text-slate-400 dark:text-slate-500'}>
          {item.icon}
        </span>
        <span>{t(item.title)}</span>
      </Link>
    </div>
  );
}

// ── SidebarNav ────────────────────────────────────────────────────────────────

function SidebarNav({ pathname, onNavigate }: { pathname: string | null; onNavigate?: () => void }) {
  const { t } = useLanguage();
  return (
    <nav className="flex-1 overflow-y-auto px-3 py-3">
      {navSections.map((section, si) => (
        <div key={si}>
          {section.dividerBefore && (
            <div className="my-2 border-t border-[var(--color-border)] dark:border-slate-800" />
          )}
          {section.label && (
            <p className="mb-1 mt-3 px-2 text-[0.6rem] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-600">
              {t(section.label)}
            </p>
          )}
          <div className="space-y-0.5">
            {section.items.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                active={pathname === item.href}
                onClick={onNavigate}
              />
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

// ── AppShell ──────────────────────────────────────────────────────────────────

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router   = useRouter();
  const { language, setLanguage, t } = useLanguage();
  const { isExpired, isPublic: subPublic, checking: subChecking } = useSubscriptionCheck();
  const [user, setUser] = useState<any>(null);
  const [authLoaded, setAuthLoaded] = useState(false);
  const authLoadedRef = useRef(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const isAuthPage       = pathname?.startsWith('/auth');
  const isLandingPage    = pathname === '/';
  const isOnboardingPage = pathname?.startsWith('/onboarding');
  const isPublicPage     = isLandingPage || isOnboardingPage || isAuthPage;
  const showAside        = !isAuthPage && !isLandingPage && !isOnboardingPage;

  useEffect(() => {
    // Unblock users whose 72h trial timer had expired — reset it to now
    resetTrialTimer();
  }, []);

  useEffect(() => {
    let mounted = true;
    let listener: { subscription: { unsubscribe: () => void } } | null = null;

    supabase.auth.getSession().then(({ data: { session } }: any) => {
      if (!mounted || authLoadedRef.current) return;
      setUser(session?.user ?? null);
      authLoadedRef.current = true;
      setAuthLoaded(true);
    }).catch(() => {
      if (!mounted || authLoadedRef.current) return;
      authLoadedRef.current = true;
      setAuthLoaded(true);
    });

    try {
      const sub = supabase.auth.onAuthStateChange((event: any, session: any) => {
        if (!mounted) return;
        console.log('[AppShell] onAuthStateChange:', event, 'user:', session?.user?.id ?? null);
        setUser(session?.user ?? null);
        authLoadedRef.current = true;
        setAuthLoaded(true);
      });
      listener = sub.data;
    } catch (e) {
      console.warn('[AppShell] onAuthStateChange error:', (e as Error).message);
      authLoadedRef.current = true;
      setAuthLoaded(true);
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

  // Close user menu on outside click
  useEffect(() => {
    if (!userMenuOpen) return;
    function handle(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [userMenuOpen]);

  const handleLogout = async () => {
    setUserMenuOpen(false);
    await supabase.auth.signOut();
    router.replace('/auth/login');
  };

  const handleInstall = async () => {
    setUserMenuOpen(false);
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

  if (subChecking || !authLoaded) {
    console.log(`[APPSHELL] waiting — subChecking=${subChecking} authLoaded=${authLoaded} pathname=${pathname}`);
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#001F3F] border-t-transparent" />
      </div>
    );
  }

  console.log(`[APPSHELL] rendered — user=${user?.id ?? 'null'} isExpired=${isExpired} subPublic=${subPublic} pathname=${pathname}`);

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
    console.log('[REDIRECT] source: AppShell | destination: /auth/login | reason: authLoaded=true but user=null');
    if (typeof window !== 'undefined') {
      window.location.replace('/auth/login');
    }
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#001F3F] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
      {/* ── Top header ───────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-[var(--color-border)] bg-white/95 backdrop-blur-sm dark:bg-[#020617]/95 dark:border-slate-800">
        <div className="mx-auto flex items-center gap-3 px-4 py-3 sm:px-5">
          {/* Hamburger (mobile) */}
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

          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <Logo size="h-9 w-9" />
            <div className="hidden sm:block">
              <p className="text-sm font-semibold leading-tight text-[#001F3F] dark:text-white">ProfitPilot</p>
              <p className="text-[0.65rem] leading-tight text-slate-400 dark:text-slate-500">
                {t({ fr: 'Pilotage intelligent', ht: 'Pilotaj entèlijan' })}
              </p>
            </div>
          </div>

          {/* CompanySwitcher in header */}
          <div className="hidden lg:block">
            <CompanySwitcher />
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Right controls: search + bell + store + avatar */}
          <div className="flex items-center gap-2">
            {/* Search icon (placeholder) */}
            <button
              type="button"
              title={t({ fr: 'Rechercher', ht: 'Chèche' })}
              className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/5 dark:hover:text-slate-200"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              </svg>
            </button>

            <NotificationBell />
            <StoreSwitcher />

            {/* User avatar + dropdown */}
            <div className="relative" ref={userMenuRef}>
              <button
                type="button"
                onClick={() => setUserMenuOpen((v) => !v)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-[#001F3F] text-xs font-bold text-white ring-2 ring-transparent transition hover:ring-[#50C878]/40 dark:bg-[#50C878] dark:text-[#001F3F]"
                aria-label="Menu utilisateur"
              >
                {userInitials}
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 top-10 z-50 w-56 overflow-hidden rounded-2xl border border-[var(--color-border)] bg-white shadow-xl dark:bg-[#0F172A] dark:border-slate-700">
                  {/* User info */}
                  <div className="border-b border-[var(--color-border)] dark:border-slate-700 px-4 py-3">
                    <p className="truncate text-xs font-semibold text-[var(--color-text)]">{user.email}</p>
                    <p className="text-[0.65rem] text-[var(--color-muted)]">ProfitPilot</p>
                  </div>

                  <div className="py-1.5">
                    {/* Language toggle */}
                    <button
                      type="button"
                      onClick={() => { setLanguage(language === 'fr' ? 'ht' : 'fr'); setUserMenuOpen(false); }}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-slate-600 transition hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-white/5"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
                      </svg>
                      {language === 'fr'
                        ? t({ fr: 'Passer en Kreyòl', ht: 'Chanje an Kreyòl' })
                        : t({ fr: 'Passer en Français', ht: 'Pase an Fransè' })}
                    </button>

                    {/* Install PWA */}
                    <button
                      type="button"
                      onClick={handleInstall}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-slate-600 transition hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-white/5"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      {t({ fr: 'Installer l\'app', ht: 'Enstale app la' })}
                    </button>
                  </div>

                  <div className="border-t border-[var(--color-border)] dark:border-slate-700 py-1.5">
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                      </svg>
                      {t({ fr: 'Déconnexion', ht: 'Dekoneksyon' })}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto flex min-h-[calc(100vh-57px)] max-w-full bg-[var(--color-bg)]">
        {/* ── Mobile slide-over nav ─────────────────────────── */}
        {mobileNavOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setMobileNavOpen(false)}
            />
            <aside className="relative flex h-full w-72 flex-col overflow-hidden bg-white dark:bg-[#0F172A]">
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

              <div className="border-b border-[var(--color-border)] dark:border-slate-800 px-3 py-3">
                <CompanySwitcher onNavigate={() => setMobileNavOpen(false)} />
              </div>

              <SidebarNav pathname={pathname} onNavigate={() => setMobileNavOpen(false)} />

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

        {/* ── Desktop sidebar ───────────────────────────────── */}
        {showAside && (
          <aside className="hidden w-60 flex-shrink-0 flex-col border-r border-[var(--color-border)] bg-white dark:bg-[#0F172A] dark:border-slate-800 lg:flex">
            <SidebarNav pathname={pathname} />

            <div className="border-t border-[var(--color-border)] dark:border-slate-800 px-4 py-4 space-y-2">
              {user ? (
                <div className="flex items-center gap-3 rounded-xl bg-[var(--color-surface)] dark:bg-white/5 px-3 py-2.5">
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#001F3F] text-xs font-bold text-white">
                    {userInitials}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-[var(--color-text)]">{user.email}</p>
                    <p className="text-[0.65rem] text-[var(--color-muted)]">ProfitPilot</p>
                  </div>
                </div>
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

        {/* ── Main content ──────────────────────────────────── */}
        <main className="min-w-0 flex-1">
          {children}
        </main>
      </div>

      {/* ── Pilot AI Guide ───────────────────────────────────── */}
      <PilotAIGuide />

      {/* ── Welcome Animation (first visit only) ───────────── */}
      <WelcomeAnimation />

      {/* ── Mobile bottom nav ────────────────────────────────── */}
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
