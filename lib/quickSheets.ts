// ─────────────────────────────────────────────────────────────────────────────
// Les trois gestes du jour — VANN, DEPANS, KREDI (étude de marché inversée, §11)
//
// Les feuilles de saisie vivent dans l'AppShell, par-dessus l'écran en cours.
// N'importe quel écran (l'accueil, la caisse, une notification) peut en ouvrir
// une sans en connaître le composant : il envoie un événement, l'AppShell
// l'écoute. Un seul endroit monte les feuilles ; mille endroits peuvent les
// appeler.
// ─────────────────────────────────────────────────────────────────────────────

export type SalePreset = {
  /** Ouvrir directement en vente à crédit (le bouton KREDI). */
  credit?: boolean;
  /** Ouvrir sur la saisie du montant, sans choisir de produit. */
  amountOnly?: boolean;
  /** Ce qu'a compris la saisie vocale : la feuille le propose, le marchand confirme. */
  amount?: number;
  note?: string;
  customerName?: string;
  /** L'unité où le montant a été dit (« 50 dola » reste 50 dola). */
  unit?: 'HTG' | 'DOLA' | 'USD';
};

export type ExpensePreset = {
  /** Ouvrir sur un retrait pour la maison (« Kay », F04). */
  household?: boolean;
  amount?: number;
  note?: string;
  category?: string;
  unit?: 'HTG' | 'DOLA' | 'USD';
};

export const OPEN_SALE_EVENT = 'pp:open-sale';
export const OPEN_EXPENSE_EVENT = 'pp:open-expense';

export function openSaleSheet(preset: SalePreset = {}): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<SalePreset>(OPEN_SALE_EVENT, { detail: preset }));
}

export function openExpenseSheet(preset: ExpensePreset = {}): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<ExpensePreset>(OPEN_EXPENSE_EVENT, { detail: preset }));
}

/** Une vente ou une dépense vient d'être notée : l'accueil recompte sa journée. */
export const ENTRY_SAVED_EVENT = 'pp:entry-saved';

export function notifyEntrySaved(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(ENTRY_SAVED_EVENT));
}
