'use client';

import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';

export const LOGIN_TIME_KEY = 'pp_login_time';
export const SUBSCRIPTION_ACTIVE_KEY = 'pp_subscription_active';
const TRIAL_HOURS = 72;

const PUBLIC_PATHS = ['/', '/pricing', '/checkout', '/auth/login', '/auth/register', '/onboarding',
  '/blog', '/faq', '/guide', '/legal', '/updates', '/cookies-debug', '/debug'];

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
    setIsExpired(checkSubscriptionExpired());
    setIsSubscribed(isUserSubscribed());
    setChecking(false);
  }, []);

  const isPublic = PUBLIC_PATHS.some(p => pathname === p || pathname?.startsWith(p));

  return { isExpired, checking, isPublic, isSubscribed };
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

export function markSubscriptionActive() {
  if (typeof window !== 'undefined') {
    localStorage.setItem(SUBSCRIPTION_ACTIVE_KEY, 'true');
  }
}
