'use client';

// ─────────────────────────────────────────────────────────────────────────────
// La parole de PilotAI — §10 (Esansyel), §22 (Kwasans), §39 (Elit)
//
// « Une petite section. Pas un énorme chatbot. » (§10)
//
// La MÊME carte sert aux trois offres ; ce qui change, c'est ce qu'elle
// contient — et cela vient de `narrative.pilotSay()`, pas d'ici. Le §58 le dit
// mieux que n'importe quel commentaire : « Ne pas simplement donner plus de
// texte. Donner plus de profondeur décisionnelle. »
//
//   Esansyel   une phrase
//   Kwasans    une phrase + une recommandation
//   Elit       une phrase + l'écart expliqué + l'action prioritaire
//
// Le bouton mène à l'assistant. Il ne s'ouvre pas dans la carte : un chatbot
// posé au milieu d'un tableau de bord vole l'attention à tout le reste.
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { Button, Card } from '../../ds';
import type { PilotSaying } from '../narrative';

export function InsightCard({
  title,
  saying,
  askLabel,
  askHref = '/ai-assistant',
  recommendedLabel,
  loading = false,
}: {
  /** « PilotAI », ou « PilotAI Executive Advisor » pour Elit (§39). */
  title: string;
  saying: PilotSaying | null;
  /** « Demander à PilotAI » / « Analyser avec PilotAI ». */
  askLabel: string;
  askHref?: string;
  /** « Action recommandée » — l'intitulé du §39. */
  recommendedLabel?: string;
  loading?: boolean;
}) {
  return (
    <Card className="p-4">
      <p className="flex items-center gap-2 text-note font-bold uppercase tracking-wide text-muted dark:text-dark-muted">
        <Sparkles className="h-4 w-4" strokeWidth={1.8} aria-hidden />
        {title}
      </p>

      {loading ? (
        <div className="mt-3 space-y-2" aria-hidden>
          <span className="pp-skeleton block h-5 rounded-control" />
          <span className="pp-skeleton block h-5 w-2/3 rounded-control" />
        </div>
      ) : saying ? (
        <>
          <p className="mt-3 text-body text-primary dark:text-dark-text">{saying.headline}</p>

          {saying.because && (
            <p className="mt-2 text-note text-text2 dark:text-dark-text2">{saying.because}</p>
          )}

          {saying.recommend && (
            <div className="mt-3 rounded-control bg-surface2 px-3 py-2 dark:bg-dark-surface2">
              {recommendedLabel && (
                <p className="text-note font-bold uppercase tracking-wide text-muted dark:text-dark-muted">
                  {recommendedLabel}
                </p>
              )}
              <p className="mt-1 text-note text-text2 dark:text-dark-text2">{saying.recommend}</p>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Link href={askHref}>
              <Button variant="soft" size="sm">{askLabel}</Button>
            </Link>
            {saying.action && (
              <Link
                href={saying.action.href}
                className="pressable inline-flex min-h-touch items-center text-note font-bold text-primary underline underline-offset-4 dark:text-dark-text"
              >
                {saying.action.label}
              </Link>
            )}
          </div>
        </>
      ) : null}
    </Card>
  );
}
