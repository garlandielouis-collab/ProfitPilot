'use client';

import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { TRIAL_DAYS } from '../lib/plans';

export const LOGIN_TIME_KEY = 'pp_login_time';
export const SUBSCRIPTION_ACTIVE_KEY = 'pp_subscription_active';
// La durée de l'essai a une seule source : `TRIAL_DAYS` (lib/plans.ts), celle
// que `lib/trial.ts` écrit dans `subscriptions` et que la page de prix annonce.
// Ce garde-fou de navigateur ne peut pas en tenir une autre, sinon il ferme
// l'application avant l'échéance que le marchand a lue.
const TRIAL_HOURS = TRIAL_DAYS * 24;

const PUBLIC_PATHS = ['/', '/pricing', '/checkout', '/auth/login', '/auth/register', '/onboarding',
  '/blog', '/faq', '/guide', '/legal', '/updates'];

// Pages toujours accessibles même si l'essai est expiré
// (l'utilisateur doit pouvoir se déconnecter, accéder aux paramètres et à l'AI)
const ALWAYS_ACCESSIBLE_PATHS = ['/settings', '/ai-assistant', '/parametres'];

function safeGetItem(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function isValidTimestamp(val: string | null): boolean {
  if (!val) return false;
  const n = Number(val);
  return !isNaN(n) && n > 0 && n < Date.now() + 86400000;
}

export function checkSubscriptionExpired(): boolean {
  const loginTime = safeGetItem(LOGIN_TIME_KEY);
  const isSubscribed = safeGetItem(SUBSCRIPTION_ACTIVE_KEY) === 'true';
  if (isValidTimestamp(loginTime) && !isSubscribed) {
    return Date.now() - Number(loginTime) > TRIAL_HOURS * 60 * 60 * 1000;
  }
  return false;
}

export function isUserSubscribed(): boolean {
  return safeGetItem(SUBSCRIPTION_ACTIVE_KEY) === 'true';
}

export function useSubscriptionCheck() {
  const pathname = usePathname();
  const [checking, setChecking] = useState(true);
  const [isExpired, setIsExpired] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);

  useEffect(() => {
    // Reset trial timer on every auth event so active users are never blocked
    const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange((event: string) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        if (typeof window !== 'undefined') {
          localStorage.setItem(LOGIN_TIME_KEY, String(Date.now()));
        }
      }
    });

    async function check() {
      // 1. Fast local check first
      const localExpired    = checkSubscriptionExpired();
      const localSubscribed = isUserSubscribed();
      setIsExpired(localExpired);
      setIsSubscribed(localSubscribed);

      // L'écran n'est retenu que si l'état local dit « expiré » : dans ce cas
      // seulement, il faut l'avis du serveur avant de dresser un mur payant, au
      // risque sinon de bloquer un client à jour. Dans tous les autres cas
      // l'application s'affiche tout de suite et la vérification se poursuit
      // derrière — elle ne peut que débloquer, jamais bloquer.
      if (!localExpired) setChecking(false);

      // 2. If not subscribed locally, verify against Supabase (server source of truth)
      if (!localSubscribed) {
        try {
          // `getSession()` lit le jeton déjà en mémoire ; `getUser()` appelait
          // l'API Auth par le réseau à chaque chargement de page, avant même
          // que le moindre écran ne s'affiche.
          const { data: { session } } = await supabase.auth.getSession();
          const user = session?.user ?? null;
          if (user) {
            const now = new Date().toISOString();
            const { data: sub } = await supabase
              .from('subscriptions')
              .select('id, status, expires_at')
              .eq('user_id', user.id)
              .eq('status', 'active')
              .gte('expires_at', now)
              .maybeSingle();

            if (sub) {
              markSubscriptionActive();
              setIsSubscribed(true);
              setIsExpired(false);
            }
          }
        } catch { /* non-blocking — local state stays */ }
      }

      setChecking(false);
    }
    check();
    return () => authSub.unsubscribe();
  }, []);

  const isPublic = PUBLIC_PATHS.some(p => pathname === p || pathname?.startsWith(p));
  const isAlwaysAccessible = ALWAYS_ACCESSIBLE_PATHS.some(p => pathname === p || pathname?.startsWith(p));

  return { isExpired, checking, isPublic: isPublic || isAlwaysAccessible, isSubscribed };
}

export function recordLogin() {
  if (typeof window !== 'undefined') {
    const alreadySubscribed = safeGetItem(SUBSCRIPTION_ACTIVE_KEY) === 'true';
    localStorage.setItem(LOGIN_TIME_KEY, String(Date.now()));
    if (!alreadySubscribed) {
      localStorage.removeItem(SUBSCRIPTION_ACTIVE_KEY);
    }
  }
}

/** Réinitialise le timer d'essai (utile si l'utilisateur est bloqué) */
export function resetTrialTimer() {
  if (typeof window !== 'undefined') {
    localStorage.setItem(LOGIN_TIME_KEY, String(Date.now()));
  }
}

export function markSubscriptionActive() {
  if (typeof window !== 'undefined') {
    localStorage.setItem(SUBSCRIPTION_ACTIVE_KEY, 'true');
  }
}
