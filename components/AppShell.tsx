'use client';

// ─────────────────────────────────────────────────────────────────────────────
// AppShell — l'outil se fait oublier (§6.2)
//
// « Vous êtes designer d'interface, pas designer de marque. »
// L'en-tête ne met plus l'application en scène : plus de grande barre
// décorative, plus d'avatar surdimensionné, plus de mot « Tableau de bord » en
// énorme. Il se réduit à l'essentiel — de quel commerce parle-t-on, quoi de
// neuf — et rend l'espace aux chiffres du marchand.
//
// La navigation passe de 25 entrées à 5 (§5.1) : barre du bas sur mobile,
// barre latérale groupée sur bureau. Les vingt autres vivent dans « /plus ».
// ─────────────────────────────────────────────────────────────────────────────

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Languages, LogOut, Search } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { useLanguage } from './LanguageWrapper';
import { Logo } from './Logo';
import { useSubscriptionCheck, resetTrialTimer } from '../hooks/useSubscription';
import { StoreSwitcher } from './StoreSwitcher';
import { CompanySwitcher } from './CompanySwitcher';
import { NotificationBell } from './NotificationBell';
import { BottomBar } from './BottomBar';
import { Sidebar } from './Sidebar';
import { ScreenTransition } from './ScreenTransition';
import { PlanPreviewSwitcher } from './PlanPreviewSwitcher';
import { RouteFeatureGate } from './PlanLock';
import { BottomSheet, Button } from './ds';
import { cn } from '../lib/utils';

// Non critique : chargé après que le contenu principal soit interactif.
const PilotAIGuide     = dynamic(() => import('./PilotAIGuide').then((m) => ({ default: m.PilotAIGuide })), { ssr: false });
const WelcomeAnimation = dynamic(() => import('./WelcomeAnimation').then((m) => ({ default: m.WelcomeAnimation })), { ssr: false });
// La feuille de vente n'est téléchargée qu'au premier appui sur « + Vente » :
// sur une connexion irrégulière, on ne fait pas payer au marchand le poids
// d'un écran qu'il n'a pas encore ouvert.
const QuickSaleForm    = dynamic(() => import('./sales/QuickSaleForm').then((m) => ({ default: m.QuickSaleForm })), { ssr: false });

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router   = useRouter();
  const { language, setLanguage, t } = useLanguage();
  const { isExpired, isPublic: subPublic, checking: subChecking } = useSubscriptionCheck();

  const [user, setUser]                 = useState<any>(null);
  const [authLoaded, setAuthLoaded]     = useState(false);
  const authLoadedRef                   = useRef(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [saleOpen, setSaleOpen]         = useState(false);
  const userMenuRef                     = useRef<HTMLDivElement>(null);

  const isAuthPage       = pathname?.startsWith('/auth');
  const isLandingPage    = pathname === '/';
  const isOnboardingPage = pathname?.startsWith('/onboarding');
  const isPublicPage     = isLandingPage || isOnboardingPage || isAuthPage;

  useEffect(() => { resetTrialTimer(); }, []);

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
      const sub = supabase.auth.onAuthStateChange((_event: any, session: any) => {
        if (!mounted) return;
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

  useEffect(() => {
    if (!userMenuOpen) return;
    function handle(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setUserMenuOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [userMenuOpen]);

  const handleLogout = useCallback(async () => {
    setUserMenuOpen(false);
    await supabase.auth.signOut();
    router.replace('/auth/login');
  }, [router]);

  const handleInstall = useCallback(async () => {
    setUserMenuOpen(false);
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === 'accepted') setInstallPrompt(null);
  }, [installPrompt]);

  const userInitials = user?.email ? user.email.slice(0, 2).toUpperCase() : 'PP';

  if (isPublicPage) return <>{children}</>;

  // ── Chargement : un squelette, pas une roue seule ──────────────────────────
  if (subChecking || !authLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white dark:bg-dark-bg">
        <span className="h-8 w-8 animate-spin rounded-pill border-2 border-border border-t-primary" aria-label="Chargement" />
      </div>
    );
  }

  // ── Essai terminé ─────────────────────────────────────────────────────────
  if (user && isExpired && !subPublic) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-surface px-4 dark:bg-dark-bg">
        <div className="w-full max-w-sm text-center">
          <h1 className="text-screen font-bold text-primary dark:text-dark-text">
            {t({ fr: "Période d'essai terminée", ht: 'Peryòd esè a fini' })}
          </h1>
          <p className="mt-2 text-body text-text2 dark:text-dark-text2">
            {t({
              fr: 'Vos données sont intactes. Choisissez un abonnement pour y accéder de nouveau.',
              ht: 'Done ou yo la. Chwazi yon abònman pou w jwenn yo ankò.',
            })}
          </p>
          <Link href="/pricing" className="mt-8 block">
            <Button variant="accent" size="lg" block>
              {t({ fr: 'Voir les abonnements', ht: 'Wè abònman yo' })}
            </Button>
          </Link>
        </div>
      </main>
    );
  }

  if (!user) {
    if (typeof window !== 'undefined') window.location.replace('/auth/login');
    return (
      <div className="flex min-h-screen items-center justify-center bg-white dark:bg-dark-bg">
        <span className="h-8 w-8 animate-spin rounded-pill border-2 border-border border-t-primary" aria-label="Chargement" />
      </div>
    );
  }

  return (
    // `pp-app` : la feuille inférieure fait reculer TOUT ce qui est ici
    // dedans (§5.7, moment 6). La feuille, elle, vit dans le corps du document.
    <div id="pp-app" className="min-h-screen bg-bg text-text dark:bg-dark-bg dark:text-dark-text">
      {/* ── En-tête : ce qui est GLOBAL vit ici, et rien d'autre ──────────────
          Les filtres, eux, vivent au contact direct des listes qu'ils
          affectent : la portée de chaque contrôle se devine (§6.2). */}
      <header className="sticky top-0 z-40 border-b border-border bg-white/95 backdrop-blur dark:border-dark-border dark:bg-dark-bg/95">
        <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
          <Link href="/dashboard" className="flex flex-shrink-0 items-center gap-2" aria-label="ProfitPilot">
            <Logo size="h-8 w-8" />
            <span className="hidden text-body font-bold text-primary dark:text-dark-text sm:block">
              ProfitPilot
            </span>
          </Link>

          <div className="hidden min-w-0 lg:block">
            <CompanySwitcher />
          </div>

          <div className="flex-1" />

          <div className="flex items-center gap-1">
            <Link
              href="/products"
              aria-label={t({ fr: 'Rechercher un produit', ht: 'Chèche yon pwodwi' })}
              className="pressable flex h-touch w-touch items-center justify-center rounded-surface text-muted hover:bg-surface dark:hover:bg-white/5"
            >
              <Search className="h-5 w-5" strokeWidth={1.8} aria-hidden />
            </Link>

            <NotificationBell />
            <StoreSwitcher />

            <div className="relative" ref={userMenuRef}>
              <button
                type="button"
                onClick={() => setUserMenuOpen((v) => !v)}
                aria-expanded={userMenuOpen}
                aria-label={t({ fr: 'Votre compte', ht: 'Kont ou' })}
                className="pressable flex h-touch w-touch items-center justify-center"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-pill bg-primary text-note font-bold text-white dark:bg-accent dark:text-primary">
                  {userInitials}
                </span>
              </button>

              {userMenuOpen && (
                <div className="pp-enter absolute right-0 top-12 z-50 w-64 overflow-hidden rounded-surface border border-border bg-white shadow-pop dark:border-dark-border dark:bg-dark-surface">
                  <p className="truncate border-b border-border px-4 py-3 text-note text-muted dark:border-dark-border dark:text-dark-muted">
                    {user.email}
                  </p>

                  <MenuItem
                    icon={<Languages className="h-4 w-4" strokeWidth={1.8} aria-hidden />}
                    onClick={() => { setLanguage(language === 'fr' ? 'ht' : 'fr'); setUserMenuOpen(false); }}
                  >
                    {language === 'fr' ? 'Kreyòl' : 'Français'}
                  </MenuItem>

                  {installPrompt && (
                    <MenuItem icon={<Download className="h-4 w-4" strokeWidth={1.8} aria-hidden />} onClick={handleInstall}>
                      {t({ fr: "Installer l'app", ht: 'Enstale app la' })}
                    </MenuItem>
                  )}

                  {/* La déconnexion n'est PAS rouge : le rouge est réservé à
                      l'erreur et à la suppression. Un bouton de déconnexion
                      rouge vif crie « urgence » sans raison (§4.2). */}
                  <MenuItem
                    icon={<LogOut className="h-4 w-4" strokeWidth={1.8} aria-hidden />}
                    onClick={handleLogout}
                    className="border-t border-border dark:border-dark-border"
                  >
                    {t({ fr: 'Se déconnecter', ht: 'Dekonekte' })}
                  </MenuItem>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="flex min-h-[calc(100vh-3.5rem)]">
        <Sidebar pathname={pathname} onNewSale={() => setSaleOpen(true)} />
        <main className="min-w-0 flex-1">
          {/* Chaque écran entre et sort ; le balayage depuis le bord gauche
              ramène au précédent (§7, moment 6). */}
          {/* Et chaque écran est jugé sur l'offre AVANT d'être rendu : la table
              `ROUTE_FEATURE` décide, ici, pour les vingt destinations à la
              fois. Une garde par fichier d'écran s'oublie ; celle-ci, non. */}
          <ScreenTransition>
            <RouteFeatureGate pathname={pathname}>{children}</RouteFeatureGate>
          </ScreenTransition>
        </main>
      </div>

      <PilotAIGuide />
      <WelcomeAnimation />

      <BottomBar onNewSale={() => setSaleOpen(true)} />

      {/* Trois boutons pour voir le rendu d'Esansyèl, Kwasans ou Elit. Il ne
          donne aucun droit : le serveur juge toujours sur l'offre réelle. */}
      <PlanPreviewSwitcher />

      {/* La vente se saisit PAR-DESSUS l'écran en cours : le marchand ne perd
          pas le fil de ce qu'il regardait (§5.7). */}
      <BottomSheet
        open={saleOpen}
        onClose={() => setSaleOpen(false)}
        title={t({ fr: 'Nouvelle vente', ht: 'Nouvo vant' })}
      >
        {saleOpen && <QuickSaleForm onSaved={() => setSaleOpen(false)} />}
      </BottomSheet>
    </div>
  );
}

function MenuItem({
  icon, children, onClick, className,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'pressable flex min-h-touch w-full items-center gap-3 px-4 text-body text-text2',
        'hover:bg-surface dark:text-dark-text2 dark:hover:bg-white/5',
        className,
      )}
    >
      <span className="text-muted">{icon}</span>
      {children}
    </button>
  );
}
