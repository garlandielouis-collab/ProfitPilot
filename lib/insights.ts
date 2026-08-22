// ─────────────────────────────────────────────────────────────────────────────
// Recommandations automatiques — Diagnostic 9 (les données sans interprétation)
//
// Traduit les chiffres déjà enregistrés en phrases courtes et actionnables.
// Aucune IA, aucun appel réseau : des règles déterministes, explicables au
// téléphone, qui tournent aussi bien dans un cron que dans le dashboard.
// ─────────────────────────────────────────────────────────────────────────────

export type InsightSeverity = 'success' | 'info' | 'warning' | 'critical';

export type Insight = {
  id: string;
  severity: InsightSeverity;
  /** Phrase principale, dans les mots du marchand. */
  message: string;
  /** Action concrète proposée. */
  action?: string;
  /** Lien interne vers l'écran qui règle le problème. */
  href?: string;
};

export type InsightsInput = {
  currency: string;
  /** Période courante. */
  revenue: number;
  grossMargin: number;
  businessExpenses: number;
  salesCount: number;
  /** Même période, mois précédent (pour la comparaison mois/mois). */
  previousRevenue: number;
  previousGrossMargin: number;
  /** Produits classés par marge générée (voir v_product_profitability). */
  products: Array<{
    id: string;
    name: string;
    unitsSold: number;
    grossMargin: number;
    marginPct: number;
    stockQuantity: number;
    reorderPoint: number;
  }>;
  /** Créances ouvertes. */
  receivables: Array<{
    id: string;
    clientName: string;
    balanceDue: number;
    daysOverdue: number;
  }>;
  /** Clients importants sans achat récent. */
  dormantCustomers: Array<{ id: string; name: string; daysSinceLastPurchase: number }>;
  /** Variation du taux de change depuis le dernier relevé, en %. */
  rateVariationPercent?: number;
  /** Part des dépenses marquées personnelles sur la période. */
  personalExpenses?: number;
};

const fmt = (n: number, currency: string): string =>
  `${new Intl.NumberFormat('fr-HT', { maximumFractionDigits: 0 }).format(Math.round(n))} ${currency}`;

const pct = (n: number): string => `${n > 0 ? '+' : ''}${n.toFixed(1)}%`;

/**
 * Génère les recommandations du moment, triées par urgence.
 * `limit` borne l'affichage : au-delà de 5, le marchand décroche.
 */
export function generateInsights(input: InsightsInput, limit = 5): Insight[] {
  const out: Insight[] = [];
  const cur = input.currency;

  // ── Marge en baisse vs mois dernier ───────────────────────────────────────
  const marginPct     = input.revenue > 0 ? (input.grossMargin / input.revenue) * 100 : 0;
  const prevMarginPct = input.previousRevenue > 0
    ? (input.previousGrossMargin / input.previousRevenue) * 100
    : 0;

  if (prevMarginPct > 0 && marginPct < prevMarginPct - 3) {
    out.push({
      id: 'margin-drop',
      severity: 'warning',
      message: `Votre marge est passée de ${prevMarginPct.toFixed(1)}% à ${marginPct.toFixed(1)}% ce mois-ci.`,
      action: 'Vérifiez vos prix d’achat et vos frais de livraison.',
      href: '/products',
    });
  }

  // ── Vente à perte (marge négative) ────────────────────────────────────────
  if (input.revenue > 0 && input.grossMargin < 0) {
    out.push({
      id: 'negative-margin',
      severity: 'critical',
      message: 'Vous vendez à perte : le coût de vos produits dépasse ce que vous encaissez.',
      action: 'Recalculez vos prix avec le calculateur de marge.',
      href: '/products',
    });
  }

  // ── Chiffre d'affaires en recul ───────────────────────────────────────────
  if (input.previousRevenue > 0) {
    const delta = ((input.revenue - input.previousRevenue) / input.previousRevenue) * 100;
    if (delta <= -15) {
      out.push({
        id: 'revenue-drop',
        severity: 'warning',
        message: `Votre chiffre d’affaires recule de ${pct(delta)} par rapport au mois dernier.`,
        action: 'Regardez quels produits se sont moins vendus.',
        href: '/analytics',
      });
    } else if (delta >= 15) {
      out.push({
        id: 'revenue-up',
        severity: 'success',
        message: `Votre chiffre d’affaires progresse de ${pct(delta)} vs le mois dernier.`,
        action: 'Réinvestissez sur les produits qui portent cette hausse.',
        href: '/analytics',
      });
    }
  }

  // ── Créances en retard ────────────────────────────────────────────────────
  const overdue = input.receivables.filter((r) => r.daysOverdue > 0);
  if (overdue.length > 0) {
    const total = overdue.reduce((s, r) => s + r.balanceDue, 0);
    const worst = overdue.slice().sort((a, b) => b.daysOverdue - a.daysOverdue)[0];
    out.push({
      id: 'receivables-overdue',
      severity: overdue.length >= 3 || total > input.revenue * 0.2 ? 'critical' : 'warning',
      message: `${overdue.length} créance${overdue.length > 1 ? 's' : ''} en retard pour ${fmt(total, cur)} — la plus ancienne : ${worst.clientName} (${worst.daysOverdue} j).`,
      action: 'Envoyez un rappel WhatsApp en un clic.',
      href: '/creances',
    });
  }

  // ── Rupture de stock imminente sur un produit qui marche ──────────────────
  const runningOut = input.products
    .filter((p) => p.unitsSold > 0 && p.stockQuantity <= p.reorderPoint)
    .sort((a, b) => b.grossMargin - a.grossMargin);

  if (runningOut.length > 0) {
    const p = runningOut[0];
    out.push({
      id: `low-stock-${p.id}`,
      severity: p.stockQuantity === 0 ? 'critical' : 'warning',
      message: p.stockQuantity === 0
        ? `« ${p.name} » est en rupture alors qu’il se vend bien.`
        : `« ${p.name} » part vite : il reste ${p.stockQuantity} unité${p.stockQuantity > 1 ? 's' : ''}.`,
      action: 'Réapprovisionnez avant de perdre des ventes.',
      href: '/inventory',
    });
  }

  // ── Produit qui immobilise du capital sans rapporter ──────────────────────
  const deadWeight = input.products
    .filter((p) => p.stockQuantity > 0 && p.unitsSold === 0)
    .sort((a, b) => b.stockQuantity - a.stockQuantity);

  if (deadWeight.length > 0) {
    const p = deadWeight[0];
    out.push({
      id: `dead-stock-${p.id}`,
      severity: 'info',
      message: `« ${p.name} » n’a rien vendu ce mois-ci mais occupe ${p.stockQuantity} unité${p.stockQuantity > 1 ? 's' : ''} de stock.`,
      action: 'Réduisez ce stock pour libérer du capital.',
      href: '/analytics',
    });
  }

  // ── Meilleur produit à pousser ────────────────────────────────────────────
  const best = input.products
    .filter((p) => p.grossMargin > 0)
    .sort((a, b) => b.grossMargin - a.grossMargin)[0];

  if (best) {
    out.push({
      id: `top-product-${best.id}`,
      severity: 'success',
      message: `« ${best.name} » vous a rapporté ${fmt(best.grossMargin, cur)} de marge (${best.marginPct.toFixed(0)}%).`,
      action: 'C’est le produit à mettre en avant ce mois-ci.',
      href: '/analytics',
    });
  }

  // ── Client important devenu silencieux ────────────────────────────────────
  const dormant = input.dormantCustomers
    .filter((c) => c.daysSinceLastPurchase >= 30)
    .sort((a, b) => b.daysSinceLastPurchase - a.daysSinceLastPurchase)[0];

  if (dormant) {
    out.push({
      id: `dormant-${dormant.id}`,
      severity: 'info',
      message: `${dormant.name} n’a rien acheté depuis ${dormant.daysSinceLastPurchase} jours.`,
      action: 'Un message suffit souvent à le faire revenir.',
      href: '/clients',
    });
  }

  // ── Taux de change qui bouge ──────────────────────────────────────────────
  if (input.rateVariationPercent !== undefined && Math.abs(input.rateVariationPercent) >= 3) {
    const up = input.rateVariationPercent > 0;
    out.push({
      id: 'rate-move',
      severity: up ? 'warning' : 'info',
      message: `Le taux USD/HTG a bougé de ${pct(input.rateVariationPercent)}.`,
      action: up
        ? 'Vos produits importés coûtent plus cher : vérifiez vos prix de vente.'
        : 'Vos achats en dollars coûtent moins cher : c’est le moment de réapprovisionner.',
      href: '/settings',
    });
  }

  // ── Argent perso mélangé au business ──────────────────────────────────────
  if ((input.personalExpenses ?? 0) > 0 && input.revenue > 0) {
    const share = ((input.personalExpenses ?? 0) / input.revenue) * 100;
    if (share >= 15) {
      out.push({
        id: 'personal-mix',
        severity: 'info',
        message: `Les dépenses personnelles représentent ${share.toFixed(0)}% de votre chiffre d’affaires.`,
        action: 'Gardez-les bien séparées pour présenter un résultat business propre.',
        href: '/expenses',
      });
    }
  }

  // ── Aucun signal : on rassure plutôt que d'afficher du vide ───────────────
  if (out.length === 0) {
    out.push({
      id: 'all-good',
      severity: 'success',
      message: input.salesCount > 0
        ? 'Rien d’anormal cette période : marge stable, créances sous contrôle.'
        : 'Enregistrez vos premières ventes pour recevoir des recommandations.',
      href: input.salesCount > 0 ? '/dashboard' : '/sales',
    });
  }

  const order: Record<InsightSeverity, number> = { critical: 0, warning: 1, info: 2, success: 3 };
  return out.sort((a, b) => order[a.severity] - order[b.severity]).slice(0, limit);
}
