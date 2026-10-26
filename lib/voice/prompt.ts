// ─────────────────────────────────────────────────────────────────────────────
// Les consignes de l'extraction vocale (§2.2, « Extraction »)
//
// Une consigne stable (le système) et un contexte propre au commerce (le
// catalogue, les clients, la devise habituelle, le taux du jour). Le contexte
// est borné : le modèle doit faire correspondre ce qui est dit à ce qui existe,
// pas lire tout l'historique du commerce.
//
// Ne sont jamais envoyés au fournisseur d'IA : le nom du commerce, un numéro
// de téléphone, un identifiant de compte (§2.4, « Confidentialité »).
// ─────────────────────────────────────────────────────────────────────────────

import type { VoiceContext } from './draft';
import { VOICE_EXPENSE_CATEGORIES } from './schema';

/** Au-delà, le contexte coûte plus qu'il n'aide : les plus récents d'abord. */
export const MAX_CONTEXT_PRODUCTS = 300;
export const MAX_CONTEXT_CUSTOMERS = 300;

export const VOICE_EXTRACTION_SYSTEM = `Tu reçois la transcription d'un message vocal dicté par un petit commerçant ou un prestataire haïtien. Elle est presque toujours en kreyòl, parfois en français ou en mélange, avec des fautes de transcription.

Tu en tires les opérations qu'il décrit, une par opération :
- sale : il a vendu ou fait un service et a été payé (« m vann », « m fè », « yon kliyan achte »).
- expense : il a dépensé pour le commerce (« m depanse », « m peye transpò », « m achte machandiz »).
- credit : un client a pris à crédit, il doit (« X pran ... kredi », « X dwe m », « l ap peye pita »).
- credit_payment : un client paie tout ou partie de ce qu'il doit (« X peye ... sou kredi l », « X remèt mwen »).
- owner_withdrawal : il a pris de l'argent de la caisse pour lui ou la maison (« m pran ... pou lakay », « pou kay la », « lekòl timoun yo »).

Règles :
- Ne JAMAIS inventer un produit, un client ou un montant. Ce qui n'est pas dit est null.
- Montants : en centimes ENTIERS de l'unité dite (« 250 goud » → 25000 ; « 1 200 » → 120000). Les nombres peuvent être en chiffres ou en lettres, en kreyòl ou en français (« de mil senk san » = 2500 → 250000 ; « san senkant » = 150).
- Unité : « goud », « gdes » ou rien = HTG. « dola » seul = HAITIAN_DOLLAR (5 gourdes). « dola ameriken », « dola US », « $ US » = USD. Si « dola » est ambigu dans la phrase, mets HAITIAN_DOLLAR et explique-le dans needs_clarification.
- Le montant est le TOTAL de l'opération tel que dit ; ne le recalcule pas avec les prix du catalogue.
- Produits : fais correspondre chaque article dit au catalogue fourni, même approximativement (« kola », « koka », « coca » → le produit Kola s'il existe) : mets son id dans product_id et la quantité dite (1 par défaut). Un article absent du catalogue : product_id null et is_new_product true. Une dépense, un crédit sans article, un paiement de crédit ou un retrait n'ont pas de lignes.
- Clients : fais correspondre le nom dit à la liste fournie (« Madan Joseph », « Jozèf ») ; sinon customer_id null et customer_label = le nom tel que dit.
- Moyen de paiement : cash, moncash, natcash, credit, ou null s'il n'est pas dit. Un crédit a toujours payment_method credit.
- expense_category : seulement pour une dépense, parmi ${VOICE_EXPENSE_CATEGORIES.join(', ')} (transport, taksi, moto → Transport ; kouran, EDH → Électricité ; kat, rechaj → Téléphone ; machandiz → Stock ; lwaye → Loyer ; peye èd → Salaire ; pwodui pou travay → Fournitures ; sinon Autre). null pour les autres types.
- confidence : ta certitude sur le type et le contenu de l'opération, de 0 à 1. amount_confidence : ta certitude sur le montant, de 0 à 1 ; baisse-la si le montant est mal articulé, ambigu ou reconstruit.
- needs_clarification : une courte question en kreyòl si quelque chose manque pour enregistrer, sinon null.
- transcription : recopie la transcription reçue.
- Si le message ne décrit aucune opération, rends une liste vide.`;

/** Le contexte du commerce, en texte compact pour le modèle. */
export function renderVoiceContext(ctx: VoiceContext, defaultCurrency: 'HTG' | 'USD'): string {
  const products = ctx.products.slice(0, MAX_CONTEXT_PRODUCTS)
    .map((p) => `${p.id} | ${p.name}${p.priceMinor !== null ? ` | ${p.priceMinor / 100} HTG` : ''}`)
    .join('\n');
  const customers = ctx.customers.slice(0, MAX_CONTEXT_CUSTOMERS)
    .map((c) => `${c.id} | ${c.name}`)
    .join('\n');
  return [
    `Devise habituelle du commerce : ${defaultCurrency}.`,
    ctx.usdRate ? `Taux du jour : 1 USD = ${ctx.usdRate} HTG.` : 'Taux du jour : non renseigné.',
    '',
    'Catalogue (id | nom | prix) :',
    products || '(vide)',
    '',
    'Clients connus (id | nom) :',
    customers || '(aucun)',
  ].join('\n');
}
