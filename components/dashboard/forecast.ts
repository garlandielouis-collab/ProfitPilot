// ─────────────────────────────────────────────────────────────────────────────
// La prévision — §31 « Ne jamais présenter une prédiction comme une certitude »
//
// Une régression linéaire sur l'historique mensuel réel, avec deux garde-fous
// que le document impose explicitement :
//
//   1. sous quatre mois observés, il n'y a PAS de prévision. Rien. L'écran
//      affiche « pas encore assez de données » (§42). Une droite tirée sur
//      deux points n'est pas une prévision, c'est un trait.
//   2. la confiance accompagne toujours le chiffre. Elle vient du R² — la part
//      de la variation que la droite explique vraiment — corrigée par le
//      nombre de points. Peu de points ⇒ confiance plafonnée, même si les
//      points sont parfaitement alignés : trois mois alignés, c'est une
//      coïncidence avant d'être une tendance.
//
// Pur, testable, sans dépendance : mêmes entrées ⇒ même prévision, côté
// serveur comme côté client. C'est la règle déjà tenue par `lib/healthScore.ts`.
// ─────────────────────────────────────────────────────────────────────────────

/** Nombre de mois observés en dessous duquel on ne prévoit rien. */
export const MIN_MONTHS = 4;

export type ForecastPoint = {
  /** Le mois observé, en YYYY-MM-DD (premier du mois). */
  periodStart: string;
  value: number;
};

export type Forecast = {
  /** La valeur prévue pour la période suivante. */
  next: number;
  /** Fourchette basse et haute — l'incertitude, montrée, pas cachée. */
  low: number;
  high: number;
  /** 0 → 100. Ce qui se lit « confiance de la prévision ». */
  confidence: number;
  /** Combien de mois ont servi au calcul. Le §31 veut qu'on le dise. */
  monthsObserved: number;
  /** La pente mensuelle, dans l'unité de la série. */
  slope: number;
  /** La droite reconstruite sur les mois observés — pour la tracer. */
  fitted: number[];
};

/**
 * Prévision de la période suivante, ou `null` quand l'historique ne permet pas
 * de se prononcer. Renvoyer `null` est un résultat, pas un échec.
 */
export function forecastNext(points: ForecastPoint[]): Forecast | null {
  const values = points.map((p) => p.value).filter((v) => Number.isFinite(v));
  const n = values.length;
  if (n < MIN_MONTHS) return null;

  // Une série entièrement nulle ne se projette pas : elle n'a pas de tendance,
  // elle a une absence d'activité.
  if (values.every((v) => v === 0)) return null;

  // ── Moindres carrés sur x = 0…n-1 ─────────────────────────────────────────
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((s, v) => s + v, 0) / n;

  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (i - meanX) * (values[i] - meanY);
    sxx += (i - meanX) ** 2;
  }

  const slope = sxx === 0 ? 0 : sxy / sxx;
  const intercept = meanY - slope * meanX;
  const fitted = values.map((_, i) => intercept + slope * i);

  // ── R² : la part de la variation que la droite explique ───────────────────
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    ssRes += (values[i] - fitted[i]) ** 2;
    ssTot += (values[i] - meanY) ** 2;
  }
  const r2 = ssTot === 0 ? 0 : Math.max(0, 1 - ssRes / ssTot);

  // ── La confiance ──────────────────────────────────────────────────────────
  // Le R² dit la qualité de l'ajustement ; le nombre de points dit le droit
  // qu'on a d'y croire. Douze mois observés lèvent le plafond ; quatre le
  // maintiennent bas, quelle que soit la beauté de la droite.
  const depth = Math.min(1, (n - MIN_MONTHS + 1) / (12 - MIN_MONTHS + 1));
  const confidence = Math.round(Math.min(90, r2 * 100 * (0.5 + 0.5 * depth)));

  const next = Math.max(0, intercept + slope * n);

  // La fourchette vient de l'erreur type observée, pas d'un pourcentage
  // décoratif : elle rétrécit quand les mois se ressemblent.
  const rmse = Math.sqrt(ssRes / Math.max(1, n - 2));
  const margin = rmse * 1.28;   // ≈ 80 % des observations passées

  return {
    next,
    low: Math.max(0, next - margin),
    high: next + margin,
    confidence,
    monthsObserved: n,
    slope,
    fitted,
  };
}

/** Trois paliers, pour dire la confiance en un mot plutôt qu'en un nombre. */
export function confidenceBand(confidence: number): 'low' | 'medium' | 'high' {
  if (confidence >= 65) return 'high';
  if (confidence >= 35) return 'medium';
  return 'low';
}

/**
 * Combien de jours avant la rupture, au rythme observé — le §29 en a besoin
 * pour « Product X pourrait être en rupture dans environ 6 jours ».
 *
 * `null` quand le produit ne se vend pas : sans écoulement, il n'y a pas de
 * rupture à annoncer. « Environ » est ici une honnêteté, pas une précaution :
 * le résultat est arrondi au jour, jamais à la décimale.
 */
export function daysUntilStockout(
  stock: number,
  unitsSold: number,
  windowDays: number,
): number | null {
  if (stock <= 0) return 0;
  if (unitsSold <= 0 || windowDays <= 0) return null;
  const perDay = unitsSold / windowDays;
  if (perDay <= 0) return null;
  return Math.round(stock / perDay);
}
