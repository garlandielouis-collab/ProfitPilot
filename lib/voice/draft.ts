// ─────────────────────────────────────────────────────────────────────────────
// Du vocal au brouillon — la normalisation (§2.2, « Normalisation et
// validation »)
//
// Ce que le modèle a compris devient un BROUILLON : rien n'est enregistré sans
// le tap « Konfime » (§1, « Rien n'est enregistré sans confirmation »). Ici :
//
//   · les montants restent des entiers (centimes) ; le dola ayisyen devient
//     des gourdes (× 5) ; le dollar reste en dollars, le taux du jour à côté ;
//   · un produit ou un client n'existe que s'il est dans le catalogue ou la
//     liste reçus — un identifiant inventé est effacé, le libellé dit reste ;
//   · un total qui ne colle pas avec les prix du catalogue est SIGNALÉ, jamais
//     corrigé en silence ;
//   · une confiance faible marque le brouillon : champ en rouge, confirmation
//     explicite (§2.2 : `confidence < 0.7` ou `amount_confidence < 0.8`).
//
// Pur et sans I/O.
// ─────────────────────────────────────────────────────────────────────────────

import type { RawExtraction, SpokenCurrency, VoicePaymentMethod, VoiceTxType } from './schema';

export const LOW_CONFIDENCE = 0.7;
export const LOW_AMOUNT_CONFIDENCE = 0.8;
/** 1 dola ayisyen = 5 gourdes (components/sales/AmountInput.tsx). */
export const DOLA_IN_HTG = 5;

export type CatalogProduct = { id: string; name: string; priceMinor: number | null };
export type KnownCustomer = { id: string; name: string };

export type VoiceContext = {
  products: CatalogProduct[];
  customers: KnownCustomer[];
  /** 1 USD = `usdRate` HTG, ou `null` si le marchand n'a pas saisi de taux. */
  usdRate: number | null;
};

export type DraftLine = {
  productId: string | null;
  label: string;
  quantity: number;
  isNewProduct: boolean;
  /** Prix du catalogue, en centimes de gourde, si le produit est reconnu. */
  unitPriceMinor: number | null;
};

export type VoiceDraft = {
  key: string;
  type: VoiceTxType;
  lines: DraftLine[];
  /** Le montant en centimes de `currency` (gourdes après conversion du dola). */
  amountMinor: number | null;
  currency: 'HTG' | 'USD';
  /** L'unité réellement dite, pour l'afficher (« 50 dola = 250 goud »). */
  spokenCurrency: SpokenCurrency | null;
  /** Le taux du jour retenu pour un montant en dollars. */
  usdRate: number | null;
  paymentMethod: VoicePaymentMethod | null;
  customerId: string | null;
  customerLabel: string | null;
  expenseCategory: string | null;
  confidence: number;
  amountConfidence: number;
  /** Confiance faible sur l'opération : confirmation explicite. */
  needsReview: boolean;
  /** Montant absent ou peu sûr : en rouge, « Verifye montan an ». */
  amountNeedsCheck: boolean;
  /** Somme des prix du catalogue des lignes, si toutes sont reconnues. */
  catalogTotalMinor: number | null;
  /** Le total dit ne correspond pas aux prix du catalogue. */
  totalMismatch: boolean;
  clarification: string | null;
};

const clean = (s: string | null | undefined) => (s ?? '').trim();

export function toMinor(amount: number): number {
  return Math.round(amount * 100);
}

export function fromMinor(minor: number): number {
  return Math.round(minor) / 100;
}

/** Les brouillons d'un vocal, prêts à être montrés. */
export function normalizeExtraction(raw: RawExtraction, ctx: VoiceContext): VoiceDraft[] {
  const productById = new Map(ctx.products.map((p) => [p.id, p]));
  const customerById = new Map(ctx.customers.map((c) => [c.id, c]));

  return raw.transactions.map((tx, index) => {
    const lines: DraftLine[] = tx.lines.map((line) => {
      const product = line.product_id ? productById.get(line.product_id) ?? null : null;
      return {
        productId: product?.id ?? null,
        label: clean(product?.name ?? line.label) || clean(line.label),
        quantity: line.quantity,
        // Un identifiant inconnu n'est pas un produit nouveau : c'est une
        // invention du modèle. Seul le drapeau qu'il pose lui-même compte.
        isNewProduct: !product && line.is_new_product,
        unitPriceMinor: product?.priceMinor ?? null,
      };
    });

    let amountMinor = tx.amount_minor;
    let currency: 'HTG' | 'USD' = 'HTG';
    if (amountMinor !== null && tx.currency === 'HAITIAN_DOLLAR') amountMinor *= DOLA_IN_HTG;
    if (tx.currency === 'USD') currency = 'USD';

    const allMatched = lines.length > 0 && lines.every((l) => l.unitPriceMinor !== null);
    const catalogTotalMinor = allMatched
      ? lines.reduce((sum, l) => sum + (l.unitPriceMinor as number) * l.quantity, 0)
      : null;
    // Comparé en gourdes seulement : un total en dollars contre des prix en
    // gourdes demanderait un taux, et un écart de taux n'est pas une erreur.
    const totalMismatch = currency === 'HTG' && catalogTotalMinor !== null && amountMinor !== null
      && amountMinor !== catalogTotalMinor;

    const customer = tx.customer_id ? customerById.get(tx.customer_id) ?? null : null;

    const expenseCategory = tx.type === 'owner_withdrawal'
      ? 'Retrait personnel'
      : tx.type === 'expense' ? (tx.expense_category ?? 'Autre') : null;

    return {
      key: `v${index}`,
      type: tx.type,
      lines,
      amountMinor,
      currency,
      spokenCurrency: tx.currency,
      usdRate: currency === 'USD' ? ctx.usdRate : null,
      // Un crédit est un crédit, quoi qu'ait compris le modèle du moyen de
      // paiement ; un paiement de crédit ne peut pas être « à crédit ».
      paymentMethod: tx.type === 'credit' ? 'credit'
        : tx.type === 'credit_payment' && tx.payment_method === 'credit' ? 'cash'
        : tx.payment_method,
      customerId: customer?.id ?? null,
      customerLabel: clean(customer?.name ?? tx.customer_label) || null,
      expenseCategory,
      confidence: tx.confidence,
      amountConfidence: tx.amount_confidence,
      needsReview: tx.confidence < LOW_CONFIDENCE,
      amountNeedsCheck: amountMinor === null || amountMinor === 0 || tx.amount_confidence < LOW_AMOUNT_CONFIDENCE,
      catalogTotalMinor,
      totalMismatch,
      clarification: clean(tx.needs_clarification) || null,
    };
  });
}

/**
 * Ce qui manque encore pour pouvoir confirmer. Vide = le tap « Konfime » peut
 * enregistrer. Les messages sont ceux que la carte affiche.
 */
export function draftBlockers(d: VoiceDraft): { fr: string; ht: string }[] {
  const out: { fr: string; ht: string }[] = [];
  if (d.amountMinor === null || d.amountMinor <= 0) {
    out.push({ fr: 'Le montant manque.', ht: 'Montan an manke.' });
  }
  if ((d.type === 'credit' || d.type === 'credit_payment') && !d.customerLabel) {
    out.push({ fr: 'Le nom du client manque.', ht: 'Non kliyan an manke.' });
  }
  if (d.currency === 'USD' && !d.usdRate) {
    out.push({ fr: 'Renseignez le taux du jour pour un montant en dollars.', ht: 'Mete to jounen an pou yon montan an dola.' });
  }
  return out;
}
