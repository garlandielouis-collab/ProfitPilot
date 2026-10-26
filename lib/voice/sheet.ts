// ─────────────────────────────────────────────────────────────────────────────
// Un brouillon vocal, rouvert dans la feuille de saisie (« Korije »)
//
// Le marchand qui corrige retrouve ce qu'il a dit, dans l'unité où il l'a dit :
// « 50 dola » s'ouvre sur 50 dola, pas sur 250 goud. La feuille fait le reste —
// c'est elle qui enregistre, comme pour une saisie tapée.
//
// Pur : utilisé par l'écran comme par le serveur (libellé des lignes).
// ─────────────────────────────────────────────────────────────────────────────

import type { ExpensePreset, SalePreset } from '../quickSheets';
import { DOLA_IN_HTG, type VoiceDraft } from './draft';

export type DraftSheet =
  | { sheet: 'sale'; preset: SalePreset }
  | { sheet: 'expense'; preset: ExpensePreset }
  /** Un paiement de crédit se corrige sur la fiche du client, pas dans une feuille. */
  | { sheet: 'receivables' };

/** « 2 Kola, Pen » — ce qui a été vendu ou acheté, tel que nommé. */
export function draftLabel(d: Pick<VoiceDraft, 'lines'>): string {
  return d.lines.map((l) => (l.quantity > 1 ? `${l.quantity} ${l.label}` : l.label)).join(', ');
}

/** Le montant dans l'unité où il a été dit. */
export function spokenAmount(d: VoiceDraft): { amount?: number; unit: 'HTG' | 'DOLA' | 'USD' } {
  if (d.currency === 'USD') return { amount: d.amountMinor === null ? undefined : d.amountMinor / 100, unit: 'USD' };
  if (d.amountMinor === null) return { unit: d.spokenCurrency === 'HAITIAN_DOLLAR' ? 'DOLA' : 'HTG' };
  if (d.spokenCurrency === 'HAITIAN_DOLLAR') {
    return { amount: Math.round(d.amountMinor / DOLA_IN_HTG) / 100, unit: 'DOLA' };
  }
  return { amount: d.amountMinor / 100, unit: 'HTG' };
}

export function draftToSheet(d: VoiceDraft): DraftSheet {
  const { amount, unit } = spokenAmount(d);
  const note = draftLabel(d) || undefined;
  const customerName = d.customerLabel ?? undefined;
  switch (d.type) {
    case 'sale':
      return { sheet: 'sale', preset: { amountOnly: true, amount, unit, note, customerName } };
    case 'credit':
      return { sheet: 'sale', preset: { credit: true, amount, unit, note, customerName } };
    case 'expense':
      return { sheet: 'expense', preset: { amount, unit, note, category: d.expenseCategory ?? undefined } };
    case 'owner_withdrawal':
      return { sheet: 'expense', preset: { household: true, amount, unit, note } };
    case 'credit_payment':
      return { sheet: 'receivables' };
  }
}
