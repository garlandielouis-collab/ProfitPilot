'use client';

// ─────────────────────────────────────────────────────────────────────────────
// L'écran d'erreur d'une vitrine (§28)
//
// Ce qu'il remplace : l'écran d'erreur générique de l'application, qui porte le
// nom et les couleurs de ProfitPilot. Le client du marchand n'a jamais entendu
// parler de nous ; il vient de cliquer sur un lien de SA boutique. Lui montrer
// notre marque au moment où quelque chose casse ajoute la confusion à la panne.
//
// Il ne montre pas le message technique. Il dit ce qui s'est passé, propose de
// réessayer — c'est souvent une base en cours de réveil, et le second essai
// aboutit — et laisse une porte de sortie vers l'accueil.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect } from 'react';
import { RefreshCw } from 'lucide-react';

export default function StoreError({
  error, reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Le détail part dans la console du navigateur, pas à l'écran : il sert au
    // marchand qui nous appelle, pas à l'acheteur qui regarde.
    console.error('[storefront]', error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-[20px] font-semibold text-[var(--st-ink)]">
        La page n'a pas pu se charger
      </h1>
      <p className="text-[14px] leading-relaxed text-[var(--st-ink-2)]">
        Cela arrive parfois quand la connexion est irrégulière. Réessayez : c'est
        généralement suffisant.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-1 flex min-h-[52px] items-center gap-2 px-7 text-[15px] font-semibold transition hover:brightness-95"
        style={{
          background: 'var(--st-accent)',
          color: 'var(--st-accent-ink)',
          borderRadius: 'var(--st-radius-btn)',
        }}
      >
        <RefreshCw className="h-4 w-4" strokeWidth={2} aria-hidden />
        Réessayer
      </button>
      <a
        href="./"
        className="min-h-[44px] text-[14px] font-semibold text-[var(--st-ink-2)] underline underline-offset-4"
      >
        Retour à la boutique
      </a>
    </div>
  );
}
