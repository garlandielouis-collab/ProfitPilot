'use client';

// ─────────────────────────────────────────────────────────────────────────────
// L'aperçu des offres — Esansyèl · Kwasans · Elit
//
// Trois boutons pour voir, tout de suite, ce que chaque offre affiche. C'est un
// outil de travail : comparer les trois rendus sans créer trois comptes.
//
// ── Ce qu'il montre, et ce qu'il ne donne pas ───────────────────────────────
//
// Il change ce que l'écran AFFICHE, rien d'autre. Le serveur ne lit pas ce
// réglage : `assertFeature()` et les politiques RLS jugent toujours sur l'offre
// réelle du compte. Basculer sur Elit montre les écrans d'Elit ; une action qui
// écrit vraiment sera refusée exactement comme avant. Un aperçu qui donnerait
// les droits ne serait pas un aperçu, ce serait une porte.
//
// ── Pourquoi il se voit autant ──────────────────────────────────────────────
//
// « Dans un logiciel de gestion, un chiffre affiché est une promesse. » Un
// aperçu discret qu'on oublierait d'éteindre ferait croire à un marchand qu'il
// a Elit. D'où le bandeau ambre en haut de CHAQUE écran tant qu'il est actif —
// ambre et pas rouge : rien n'est cassé, quelque chose est simplement en cours
// (§4.2). Et la sortie est dans le bandeau, pas trois niveaux plus loin.
//
// Il n'apparaît qu'en développement, ou si `NEXT_PUBLIC_PLAN_PREVIEW=1`.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { Eye, X } from 'lucide-react';
import { useCompanyContext } from '../contexts/CompanyContext';
import { getPreviewPlan, isPreviewEnabled, setPreviewPlan, subscribePreview } from '../lib/planPreview';
import { PLANS, getPlanLabel, type PlanKey } from '../lib/plans';
import {
  formatQuota,
  // PLAN_HISTORY_MONTHS n'est plus affiché : aucune limite d'historique
  // n'est appliquée (voir `planHistoryMonths`), l'annoncer serait faux.
  PLAN_AI_QUESTIONS,
  PLAN_MAX_MEMBERS,
  PLAN_MAX_PRODUCTS,
  PLAN_MAX_STORES,
} from '../lib/planFeatures';
import { BottomSheet, Button } from './ds';
import { cn } from '../lib/utils';

export function PlanPreviewSwitcher() {
  const { realPlanKey } = useCompanyContext();
  const [enabled, setEnabled] = useState(false);
  const [preview, setPreview] = useState<PlanKey | null>(null);
  const [open, setOpen]       = useState(false);

  // `isPreviewEnabled()` et le stockage ne sont lus qu'après le montage : le
  // serveur ne connaît pas le localStorage, et un rendu différent des deux
  // côtés ferait crier React.
  useEffect(() => {
    setEnabled(isPreviewEnabled());
    const sync = () => setPreview(getPreviewPlan());
    sync();
    return subscribePreview(sync);
  }, []);

  if (!enabled) return null;

  const realLabel = getPlanLabel(realPlanKey);

  function choose(plan: PlanKey | null) {
    setPreviewPlan(plan);
    setOpen(false);
  }

  return (
    <>
      {/* Le bandeau : tant qu'un aperçu tourne, il le dit et offre la sortie. */}
      {preview && (
        <div className="pp-drop sticky top-14 z-30 flex items-center gap-3 bg-warning px-4 py-2 text-white">
          <Eye className="h-4 w-4 flex-shrink-0" strokeWidth={2} aria-hidden />
          <p className="min-w-0 flex-1 text-note font-bold">
            Aperçu <span className="underline underline-offset-2">{getPlanLabel(preview)}</span>
            {' — '}
            <span className="font-normal">votre offre réelle est {realLabel}.</span>
          </p>
          <button
            type="button"
            onClick={() => choose(null)}
            className="pressable flex min-h-touch flex-shrink-0 items-center rounded-control px-3 text-note font-bold underline underline-offset-4"
          >
            Revenir au réel
          </button>
        </div>
      )}

      {/* Le déclencheur. Au-dessus de la barre du bas sur mobile, pour ne pas
          couvrir « + Vente » — l'action la plus fréquente de la journée. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Aperçu des offres"
        className={cn(
          'pressable fixed right-4 z-40 flex min-h-touch items-center gap-2 rounded-pill px-4 shadow-pop',
          'bottom-[calc(theme(spacing.nav)+1rem)] lg:bottom-4',
          preview
            ? 'bg-warning text-white'
            : 'bg-primary text-white dark:bg-dark-surface2 dark:text-dark-text',
        )}
      >
        <Eye className="h-4 w-4" strokeWidth={2} aria-hidden />
        {/* « Offres » se lisait comme un lien vers la page de prix. Le bouton
            ouvre un aperçu : il le dit, et il nomme l'offre en cours dès qu'un
            aperçu tourne. */}
        <span className="text-note font-bold">
          {preview ? `Aperçu ${getPlanLabel(preview)}` : 'Aperçu des offres'}
        </span>
      </button>

      <BottomSheet open={open} onClose={() => setOpen(false)} title="Voir le rendu d'une offre">
        <p className="mb-5 text-body text-text2 dark:text-dark-text2">
          Change ce que les écrans affichent, pas ce que le compte a le droit de faire :
          le serveur juge toujours sur votre offre réelle.
        </p>

        <div className="space-y-2">
          {PLANS.map((plan) => (
            <PlanRow
              key={plan.key}
              planKey={plan.key}
              selected={(preview ?? realPlanKey) === plan.key}
              isReal={realPlanKey === plan.key}
              onChoose={() => choose(plan.key)}
            />
          ))}
        </div>

        {/* Ce que les trois offres partagent. C'est le socle : on le rappelle
            ici pour qu'un aperçu ne laisse jamais croire qu'enregistrer une
            vente ou exporter ses données dépend de ce qu'on paie. */}
        <p className="mt-4 text-note text-text2 dark:text-dark-text2">
          Dans les trois : ventes, dépenses et créances illimitées, mode hors ligne,
          et export complet de vos données.
        </p>

        {preview && (
          <Button variant="outline" block className="mt-6" onClick={() => choose(null)}
            icon={<X className="h-4 w-4" strokeWidth={2} aria-hidden />}>
            Revenir à mon offre ({realLabel})
          </Button>
        )}
      </BottomSheet>
    </>
  );
}

/**
 * Les quotas d'une offre, écrits comme le marchand les vivrait.
 *
 * « 24 fonctionnalités » ne veut rien dire à personne : ce qu'on compare d'une
 * offre à l'autre, ce sont les quatre plafonds qu'on finit par toucher.
 */
function quotaLine(planKey: PlanKey): string {
  const stores   = PLAN_MAX_STORES[planKey];
  const members  = PLAN_MAX_MEMBERS[planKey];
  const products = PLAN_MAX_PRODUCTS[planKey];
  const ai       = PLAN_AI_QUESTIONS[planKey];

  return [
    `${stores} boutique${stores > 1 ? 's' : ''}`,
    Number.isFinite(members)  ? `${members} personne${members > 1 ? 's' : ''}` : 'personnes illimitées',
    Number.isFinite(products) ? `${formatQuota(products)} produits` : 'produits illimités',
    ai === 0 ? 'IA à la découverte' : Number.isFinite(ai) ? `${ai} questions IA / mois` : 'IA illimitée',
  ].join(' · ');
}

/** Une offre : son nom, son stade, ses quotas, son prix. */
function PlanRow({
  planKey, selected, isReal, onChoose,
}: {
  planKey: PlanKey;
  selected: boolean;
  isReal: boolean;
  onChoose: () => void;
}) {
  const plan = PLANS.find((p) => p.key === planKey)!;

  return (
    <button
      type="button"
      onClick={onChoose}
      aria-pressed={selected}
      className={cn(
        // La sélection se marque par le CONTRASTE, pas par une teinte de plus —
        // exactement comme les boutons de paiement (§3.4).
        'pressable flex w-full items-center gap-4 rounded-surface border px-4 py-3 text-left',
        selected
          ? 'border-primary bg-primary text-white dark:border-accent'
          : 'border-border bg-white text-primary hover:bg-surface dark:border-dark-border dark:bg-dark-surface dark:text-dark-text',
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-card font-bold">{plan.label}</span>
          {isReal && (
            <span className={cn(
              'rounded-pill px-2 py-0.5 text-note font-bold',
              selected ? 'bg-white/20 text-white' : 'bg-surface2 text-text2 dark:bg-dark-surface2 dark:text-dark-text2',
            )}>
              votre offre
            </span>
          )}
          {plan.popular && !isReal && (
            <span className={cn(
              'rounded-pill px-2 py-0.5 text-note font-bold',
              selected ? 'bg-white/20 text-white' : 'bg-accent/15 text-accent',
            )}>
              recommandé
            </span>
          )}
        </span>

        {/* Le stade de vie avant les quotas : une offre est un moment du
            commerce, pas un paquet de fonctions. */}
        <span className={cn('mt-0.5 block text-note font-medium', selected ? 'text-white/90' : 'text-text dark:text-dark-text')}>
          {plan.stage.kreyol}
        </span>
        <span className={cn('mt-1 block text-note', selected ? 'text-white/80' : 'text-text2 dark:text-dark-text2')}>
          {quotaLine(planKey)}
        </span>
      </span>

      <span className={cn('amount flex-shrink-0 text-body font-bold', selected ? 'text-white' : 'text-primary dark:text-dark-text')}>
        {plan.priceG.toLocaleString('fr-FR')} G
      </span>
    </button>
  );
}
