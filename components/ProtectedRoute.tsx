'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../lib/useAuth';
import { useSubscriptionCheck } from '../hooks/useSubscription';
import Link from 'next/link';
import { useLanguage } from './LanguageWrapper';
import { Button } from './ds';
import { TRIAL_DAYS } from '../lib/plans';

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
      console.log('[REDIRECT] source: ProtectedRoute | destination: /auth/login | reason: checking=false, user=null');
      router.replace('/auth/login');
    }
  }, [checking, user, router]);

  // ── Essai terminé ──────────────────────────
  // Le même écran que celui d'`AppShell`, et non plus sa version d'avant la
  // refonte : l'ancienne posait ses couleurs en clair (`bg-slate-50`,
  // `bg-amber-100`, `text-slate-500`) et restait blanche en thème sombre. Une
  // page enveloppée par `ProtectedRoute` seul la servait encore.
  if (!checking && isExpired && !isPublic) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-surface px-4 dark:bg-dark-bg">
        <div className="w-full max-w-sm text-center">
          <h1 className="text-screen font-semibold text-primary dark:text-dark-text">
            {t({ fr: "Période d'essai terminée", ht: 'Peryòd esè a fini' })}
          </h1>
          <p className="mt-2 text-body text-text2 dark:text-dark-text2">
            {t({
              fr: `Votre période d'essai de ${TRIAL_DAYS} jours est terminée. Vos données sont intactes : choisissez un abonnement pour y accéder de nouveau.`,
              ht: `Peryòd esè ${TRIAL_DAYS} jou ou a fini. Done ou yo la : chwazi yon abònman pou w jwenn yo ankò.`,
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

  // Render children immediately — redirect happens in background if needed.
  // If user truly not authenticated, the redirect effect fires before user sees anything.
  return <>{children}</>;
}
