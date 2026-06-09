'use client';

import { useAuth } from '../lib/useAuth';
import { useSubscriptionCheck } from '../hooks/useSubscription';
import { useLanguage } from './LanguageWrapper';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { isExpired, isPublic, checking } = useSubscriptionCheck();
  const { t } = useLanguage();

  if (checking || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#001F3F] border-t-transparent" />
      </div>
    );
  }

  if (isExpired && !isPublic) {
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

  return <>{children}</>;
}
