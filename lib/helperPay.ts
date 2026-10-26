// ─────────────────────────────────────────────────────────────────────────────
// La paie d'un aide (F16 de l'étude de marché inversée) — la règle, seule
//
// À la journée : le montant convenu, par jour où l'aide a noté au moins une
// vente. Au pourcentage : la part convenue de ce qu'il a vendu lui-même.
// Rien d'autre : pas de prime devinée, pas d'arrondi au-delà du centime.
// ─────────────────────────────────────────────────────────────────────────────

export type PayMode = 'daily' | 'percent';

export function payFor(mode: PayMode | null, rate: number | null, sold: number, daysWorked: number): number {
  if (!mode || !rate || rate <= 0) return 0;
  const due = mode === 'daily' ? rate * daysWorked : (sold * Math.min(rate, 100)) / 100;
  return Math.round(due * 100) / 100;
}
