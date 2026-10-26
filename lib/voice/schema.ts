// ─────────────────────────────────────────────────────────────────────────────
// La commande vocale — ce que l'extraction a le droit de rendre (§2.2 de la
// spécification « commande vocale et matériel de caisse »)
//
// Deux formes du même contrat :
//   · `RAW_EXTRACTION_JSON_SCHEMA`, envoyé au modèle en sortie structurée :
//     la réponse respecte ce schéma ou n'existe pas ;
//   · `rawExtractionSchema` (Zod), qui le revérifie à l'arrivée — un schéma
//     respecté n'est pas encore un contenu sensé (montant négatif, quantité
//     nulle, confiance hors de 0–1).
//
// Les montants voyagent en ENTIERS, en centimes de l'unité dite (« 250 goud »
// → 25 000) : jamais de nombre à virgule entre le modèle et la base. La
// conversion vers les gourdes et l'écriture en NUMERIC se font plus loin
// (lib/voice/draft.ts).
//
// Pur et sans I/O : lu par le serveur et testé sans réseau.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';

export const VOICE_TX_TYPES = ['sale', 'expense', 'credit', 'credit_payment', 'owner_withdrawal'] as const;
export type VoiceTxType = (typeof VOICE_TX_TYPES)[number];

export const SPOKEN_CURRENCIES = ['HTG', 'HAITIAN_DOLLAR', 'USD'] as const;
export type SpokenCurrency = (typeof SPOKEN_CURRENCIES)[number];

export const VOICE_PAYMENT_METHODS = ['cash', 'moncash', 'natcash', 'credit'] as const;
export type VoicePaymentMethod = (typeof VOICE_PAYMENT_METHODS)[number];

/**
 * Les catégories de dépense que la voix peut choisir — les valeurs de la
 * feuille DEPANS (components/expenses/QuickExpenseForm.tsx), pour que le plan
 * comptable classe la dépense dictée au même endroit que la dépense tapée.
 */
export const VOICE_EXPENSE_CATEGORIES = [
  'Stock', 'Transport', 'Électricité', 'Téléphone', 'Loyer', 'Salaire', 'Fournitures', 'Autre',
] as const;

const nullableString = { type: ['string', 'null'] };

export const RAW_EXTRACTION_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['transcription', 'transactions'],
  properties: {
    transcription: { type: 'string' },
    transactions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'type', 'lines', 'amount_minor', 'currency', 'payment_method', 'customer_id', 'customer_label',
          'expense_category', 'confidence', 'amount_confidence', 'needs_clarification',
        ],
        properties: {
          type: { type: 'string', enum: [...VOICE_TX_TYPES] },
          lines: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['product_id', 'label', 'quantity', 'is_new_product'],
              properties: {
                product_id: nullableString,
                label: { type: 'string' },
                quantity: { type: 'integer' },
                is_new_product: { type: 'boolean' },
              },
            },
          },
          amount_minor: { type: ['integer', 'null'] },
          currency: { type: ['string', 'null'], enum: [...SPOKEN_CURRENCIES, null] },
          payment_method: { type: ['string', 'null'], enum: [...VOICE_PAYMENT_METHODS, null] },
          customer_id: nullableString,
          customer_label: nullableString,
          expense_category: { type: ['string', 'null'], enum: [...VOICE_EXPENSE_CATEGORIES, null] },
          confidence: { type: 'number' },
          amount_confidence: { type: 'number' },
          needs_clarification: nullableString,
        },
      },
    },
  },
};

const rawLine = z.object({
  product_id: z.string().nullable(),
  label: z.string().trim().max(120),
  quantity: z.number().int().min(1).max(10_000),
  is_new_product: z.boolean(),
});

const rawTransaction = z.object({
  type: z.enum(VOICE_TX_TYPES),
  lines: z.array(rawLine).max(30),
  amount_minor: z.number().int().min(0).max(100_000_000_00).nullable(),
  currency: z.enum(SPOKEN_CURRENCIES).nullable(),
  payment_method: z.enum(VOICE_PAYMENT_METHODS).nullable(),
  customer_id: z.string().nullable(),
  customer_label: z.string().trim().max(120).nullable(),
  expense_category: z.enum(VOICE_EXPENSE_CATEGORIES).nullable(),
  confidence: z.number().min(0).max(1),
  amount_confidence: z.number().min(0).max(1),
  needs_clarification: z.string().max(300).nullable(),
});

export const rawExtractionSchema = z.object({
  transcription: z.string(),
  transactions: z.array(rawTransaction).max(20),
});

export type RawExtraction = z.infer<typeof rawExtractionSchema>;
export type RawTransaction = z.infer<typeof rawTransaction>;
