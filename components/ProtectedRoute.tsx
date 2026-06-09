'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../lib/useAuth';
import { useSubscriptionCheck } from '../hooks/useSubscription';
import { useLanguage } from './LanguageWrapper';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { isExpired, isPublic, checking } = useSubscriptionCheck();
  const { t } = useLanguage();
  const router = useRouter();
  const redirected = useRef(false);

  // Redirect to login only after we KNOW user is null (not just "not yet loaded")
  useEffect(() => {
    if (!checking && user === null && !redirected.current) {
      redirected.current = true;
      router.replace('/auth/login');
    }
  }, [checking, user, router]);

  // Show expired screen (quick localStorage check, no delay)
  if (!checking && isExpired && !isPublic) {
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
          <a
            href="/pricing"
            className="inline-flex items-center gap-2 rounded-xl bg-[#001F3F] px-6 py-3 text-sm font-semibold text-white hover:bg-[#002D5B]"
          >
            {t({ fr: 'Voir les abonnements', ht: 'Wè abònman yo' })}
          </a>
        </div>
      </div>
    );
  }

  // Render children immediately — redirect happens in background if needed.
  // If user truly not authenticated, the redirect effect fires before user sees anything.
  return <>{children}</>;
}
