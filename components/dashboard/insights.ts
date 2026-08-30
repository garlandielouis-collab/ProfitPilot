// ─────────────────────────────────────────────────────────────────────────────
// Ce qui ressort des chiffres — la règle, pas la mise en forme
//
// Sorti de l'écran pour deux raisons. La première tient à l'audit : « un écran
// = une tâche = un fichier » (§5.6) ; le tableau de bord orchestre, il ne
// calcule pas. La seconde est plus simple : ces seuils — 20 % de marge, une
// dette qui vaut la moitié des ventes — sont des règles de gestion. Elles
// méritent d'être lisibles d'un coup d'œil, au même endroit, sans traverser
// trois cents lignes de JSX.
//
// Chaque recommandation naît d'un chiffre RÉEL de la période. Aucune n'est
// affichée « pour meubler » : quand rien ne ressort, la section disparaît.
// ─────────────────────────────────────────────────────────────────────────────

import type { Insight } from './InsightsCard';

type Translate = (t: { fr: string; ht: string }) => string;

export type InsightInput = {
  marginPct: number;
  cashIn: number;
  debtTotal: number;
  outOfStock: number;
};

/** Quatre au maximum : au-delà, une liste de conseils cesse d'être lue (§3.6). */
const MAX_INSIGHTS = 4;

export function buildInsights(t: Translate, data: InsightInput): Insight[] {
  const { marginPct, cashIn, debtTotal, outOfStock } = data;
  const list: Insight[] = [];
  const margin = marginPct.toFixed(1);

  // ── La marge : le seul chiffre qui dit si le commerce gagne de l'argent ──
  if (marginPct >= 20) {
    list.push({
      tone: 'success',
      text: t({
        fr: `Votre marge est de ${margin} %. Le commerce dégage du profit.`,
        ht: `Maj ou a ${margin} %. Komès la ap fè pwofi.`,
      }),
    });
  } else if (marginPct >= 5) {
    list.push({
      tone: 'info',
      text: t({
        fr: `Votre marge est de ${margin} %. Réduire les dépenses la ferait monter.`,
        ht: `Maj ou a ${margin} %. Redwi depans yo ap fè l monte.`,
      }),
      action: t({ fr: 'Voir les dépenses', ht: 'Wè depans yo' }),
      href: '/expenses',
    });
  } else if (cashIn > 0) {
    // Le rouge, ici, est mérité : les dépenses dépassent les ventes (§4.2).
    list.push({
      tone: 'danger',
      text: t({
        fr: `Vos dépenses dépassent vos ventes : la marge est de ${margin} %.`,
        ht: `Depans yo depase vant yo : maj la se ${margin} %.`,
      }),
      action: t({ fr: 'Voir les dépenses', ht: 'Wè depans yo' }),
      href: '/expenses',
    });
  }

  // ── La charge de dette, rapportée à ce qui rentre ────────────────────────
  if (debtTotal > 0 && debtTotal > cashIn * 0.5) {
    const share = ((debtTotal / Math.max(1, cashIn)) * 100).toFixed(0);
    list.push({
      tone: 'warning',
      text: t({
        fr: `Vos dettes valent ${share} % de vos ventes.`,
        ht: `Dèt ou yo vo ${share} % nan vant ou yo.`,
      }),
      action: t({ fr: 'Gérer les dettes', ht: 'Jere dèt yo' }),
      href: '/dettes',
    });
  }

  // ── La rupture de stock : chaque jour sans stock est une vente perdue ────
  if (outOfStock > 0) {
    list.push({
      tone: 'warning',
      text: t({
        fr: `${outOfStock} produit${outOfStock > 1 ? 's sont' : ' est'} en rupture : chaque jour sans stock est une vente perdue.`,
        ht: `${outOfStock} pwodwi fini nan stòk : chak jou san stòk se yon vant ki pèdi.`,
      }),
      action: t({ fr: 'Réapprovisionner', ht: 'Ranplase stòk la' }),
      href: '/products',
    });
  }

  return list.slice(0, MAX_INSIGHTS);
}
