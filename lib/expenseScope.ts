// ─────────────────────────────────────────────────────────────────────────────
// Dépenses business vs personnel — Diagnostic 6
//
// « L'argent de la maison et l'argent du business, c'est le même portefeuille. »
// Tant que les deux sont mélangés, personne — ni le marchand, ni une banque —
// ne peut dire si l'entreprise gagne réellement de l'argent.
//
// Pur / sans I/O : utilisable dans une server action comme dans un composant.
// ─────────────────────────────────────────────────────────────────────────────

export type ExpenseScope = 'business' | 'personal' | 'mixed';

export const SCOPE_LABELS: Record<ExpenseScope, { label: string; hint: string }> = {
  business: { label: 'Biznis',  hint: 'Depans ki nan rezilta antrepriz la' },
  personal: { label: 'Pèsonèl', hint: 'Lakay, lekòl, sante — pa nan biznis la' },
  mixed:    { label: 'Melanje', hint: 'Yon pati biznis, yon pati pèsonèl' },
};

/** Borne la part professionnelle d'une dépense mixte à [0, 100]. */
export function normalizeShare(sharePct: number | null | undefined): number {
  const n = Number(sharePct);
  if (!Number.isFinite(n)) return 100;
  return Math.min(Math.max(n, 0), 100);
}

/**
 * Part réellement imputable au business. C'est ce montant — et lui seul — qui
 * doit entrer dans le résultat de l'entreprise.
 */
export function businessShareOf(
  amount: number,
  scope: ExpenseScope = 'business',
  sharePct: number = 100,
): number {
  const amt = Number.isFinite(Number(amount)) ? Number(amount) : 0;
  if (scope === 'personal') return 0;
  if (scope === 'mixed')    return (amt * normalizeShare(sharePct)) / 100;
  return amt;
}

/** Complément : ce qui sort de la poche du foyer, pas de l'entreprise. */
export function personalShareOf(
  amount: number,
  scope: ExpenseScope = 'business',
  sharePct: number = 100,
): number {
  const amt = Number.isFinite(Number(amount)) ? Number(amount) : 0;
  return Math.max(0, amt - businessShareOf(amt, scope, sharePct));
}
