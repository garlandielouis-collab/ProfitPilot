// ─────────────────────────────────────────────────────────────────────────────
// Score de santé financière — Bonus 3
//
// Un seul chiffre sur 100, décomposé en 4 piliers lisibles par le marchand :
//   • Marge          (30 pts) — est-ce que ce que je vends rapporte ?
//   • Régularité     (20 pts) — est-ce que je vends tous les jours ?
//   • Trésorerie     (25 pts) — est-ce que mes dépenses laissent du cash ?
//   • Recouvrement   (25 pts) — est-ce que mes créances rentrent ?
//
// Pur : mêmes entrées ⇒ même score, côté serveur comme côté client.
// ─────────────────────────────────────────────────────────────────────────────

export type HealthInput = {
  /** Chiffre d'affaires de la période (devise de base). */
  revenue: number;
  /** Marge brute de la période (CA − coût des marchandises vendues). */
  grossMargin: number;
  /** Dépenses business de la période (part personnelle exclue). */
  businessExpenses: number;
  /** Nombre de jours de la période où au moins une vente a été enregistrée. */
  activeDays: number;
  /** Nombre total de jours de la période. */
  periodDays: number;
  /** Créances encore ouvertes à la fin de la période. */
  openReceivables: number;
  /** Créances en retard à la fin de la période. */
  overdueReceivables: number;
};

export type HealthPillar = {
  key: 'margin' | 'regularity' | 'cash' | 'recovery';
  label: string;
  score: number;
  max: number;
  /** Phrase courte expliquant le résultat, dans les mots du marchand. */
  comment: string;
};

export type HealthResult = {
  score: number;
  /** Lecture immédiate du score. */
  grade: 'critique' | 'fragile' | 'correct' | 'solide' | 'excellent';
  pillars: HealthPillar[];
  breakdown: Record<HealthPillar['key'], number>;
};

const clamp = (n: number, min: number, max: number): number =>
  Math.min(Math.max(Number.isFinite(n) ? n : min, min), max);

const ratio = (num: number, den: number): number => (den > 0 ? num / den : 0);

function gradeFor(score: number): HealthResult['grade'] {
  if (score >= 85) return 'excellent';
  if (score >= 70) return 'solide';
  if (score >= 50) return 'correct';
  if (score >= 30) return 'fragile';
  return 'critique';
}

export function computeHealthScore(input: HealthInput): HealthResult {
  const revenue = Math.max(input.revenue, 0);

  // ── 1. Marge (30) ─────────────────────────────────────────────────────────
  const marginPct = ratio(input.grossMargin, revenue);
  const marginScore =
    marginPct >= 0.30 ? 30 :
    marginPct >= 0.20 ? 24 :
    marginPct >= 0.10 ? 16 :
    marginPct >= 0.05 ? 8  :
    marginPct >  0     ? 4  : 0;

  // ── 2. Régularité des ventes (20) ─────────────────────────────────────────
  const activityPct = ratio(input.activeDays, Math.max(input.periodDays, 1));
  const regularityScore = Math.round(clamp(activityPct / 0.7, 0, 1) * 20);

  // ── 3. Trésorerie / contrôle des dépenses (25) ────────────────────────────
  const expenseRatio = revenue > 0 ? ratio(input.businessExpenses, revenue) : 1;
  const cashScore =
    expenseRatio < 0.50 ? 25 :
    expenseRatio < 0.65 ? 20 :
    expenseRatio < 0.80 ? 13 :
    expenseRatio < 0.95 ? 6  : 0;

  // ── 4. Recouvrement des créances (25) ─────────────────────────────────────
  const openPct    = revenue > 0 ? ratio(input.openReceivables, revenue) : 0;
  const overduePct = ratio(input.overdueReceivables, Math.max(input.openReceivables, 1));
  let recoveryScore = 25;
  if (input.openReceivables > 0) {
    if (openPct    >= 0.40) recoveryScore -= 10;
    else if (openPct >= 0.20) recoveryScore -= 5;
    if (overduePct >= 0.50) recoveryScore -= 10;
    else if (overduePct >= 0.25) recoveryScore -= 5;
  }
  recoveryScore = clamp(recoveryScore, 0, 25);

  const pillars: HealthPillar[] = [
    {
      key: 'margin',
      label: 'Marge',
      score: marginScore,
      max: 30,
      comment:
        marginPct >= 0.20 ? 'Vos prix couvrent bien vos coûts.'
        : marginPct > 0   ? 'Marge faible : vérifiez vos frais et vos prix.'
        :                   'Aucune marge dégagée sur la période.',
    },
    {
      key: 'regularity',
      label: 'Régularité',
      score: regularityScore,
      max: 20,
      comment:
        activityPct >= 0.7 ? 'Vous enregistrez vos ventes presque tous les jours.'
        : activityPct > 0  ? 'Des journées sans vente enregistrée : pensez à saisir chaque vente.'
        :                    'Aucune vente enregistrée sur la période.',
    },
    {
      key: 'cash',
      label: 'Trésorerie',
      score: cashScore,
      max: 25,
      comment:
        expenseRatio < 0.65 ? 'Vos dépenses laissent du cash dans le business.'
        : expenseRatio < 0.95 ? 'Vos dépenses absorbent une grande part du chiffre d’affaires.'
        :                       'Les dépenses dépassent presque tout ce qui rentre.',
    },
    {
      key: 'recovery',
      label: 'Recouvrement',
      score: recoveryScore,
      max: 25,
      comment:
        input.openReceivables === 0 ? 'Aucune créance en attente.'
        : overduePct >= 0.5         ? 'Plus de la moitié de vos créances sont en retard.'
        :                             'Vos créances rentrent correctement.',
    },
  ];

  const score = clamp(
    pillars.reduce((sum, p) => sum + p.score, 0),
    0,
    100,
  );

  return {
    score,
    grade: gradeFor(score),
    pillars,
    breakdown: {
      margin:     marginScore,
      regularity: regularityScore,
      cash:       cashScore,
      recovery:   recoveryScore,
    },
  };
}
