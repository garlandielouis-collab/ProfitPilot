// ─────────────────────────────────────────────────────────────────────────────
// Les moyens de paiement, dits une seule fois
//
// Quatre fichiers écrivaient chacun leur table de libellés : `CheckoutClient`,
// `ProductAssurance`, `InfoSections` et l'export Netlify. Trois d'entre elles
// contenaient « Carte bancaire », « Carte Visa », « Virement », « Chèque » —
// des moyens qu'aucune passerelle n'encaisse.
//
// Conséquence lisible en production, sur une vraie vitrine : la fiche produit
// promettait « Paiement à la livraison · MonCash · NatCash · Carte bancaire »,
// la page d'accueil affichait une tuile « Carte Visa — Crédit ou débit », et la
// caisse, elle, n'offrait que les trois premiers. L'acheteur choisissait son
// produit sur une promesse, et découvrait à la dernière étape qu'elle n'était
// pas tenue. C'est le §10 : un écran qui annonce ce que le logiciel ne fait pas.
//
// ── Ce que la caisse encaisse vraiment ─────────────────────────────────────
//
// `cash` à la livraison, `moncash` (Digicel) et `natcash` (Natcom). Rien
// d'autre. Une valeur `card` restée dans les réglages d'une boutique — elle a
// été proposée un temps dans l'éditeur — est ignorée partout, et non pas
// affichée là et refusée ici.
//
// Ce fichier n'importe rien : il est lu par des composants serveur, des
// composants client et une route d'API.
// ─────────────────────────────────────────────────────────────────────────────

/** Un moyen de paiement que le tunnel de commande sait réellement traiter. */
export type PaymentMethod = 'cash' | 'moncash' | 'natcash';

/** L'ordre canonique, quand l'affichage n'a pas de raison d'en préférer un autre. */
export const PAYMENT_METHODS: readonly PaymentMethod[] = ['cash', 'moncash', 'natcash'];

export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return typeof value === 'string' && (PAYMENT_METHODS as readonly string[]).includes(value);
}

/**
 * Les moyens réellement offerts par CETTE boutique.
 *
 * L'ordre du marchand est conservé — c'est celui qu'il voit dans son éditeur et
 * celui qu'il retrouve à la caisse — et les doublons comme les valeurs mortes
 * tombent.
 */
export function offeredPayments(methods: readonly unknown[] | null | undefined): PaymentMethod[] {
  if (!Array.isArray(methods)) return [];
  const out: PaymentMethod[] = [];
  for (const m of methods) {
    if (isPaymentMethod(m) && !out.includes(m)) out.push(m);
  }
  return out;
}

/**
 * Le mot que l'acheteur lit, et qui doit être le MÊME du premier écran à la
 * caisse : un visiteur qui a lu « Paiement à la livraison » sur une fiche ne
 * doit pas avoir à se demander si « Payer en recevant » est la même chose.
 */
export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  cash:    'Paiement à la livraison',
  moncash: 'MonCash',
  natcash: 'NatCash',
};

/** La précision qui va dessous, là où la place le permet. */
export const PAYMENT_NOTE: Record<PaymentMethod, string> = {
  cash:    'Vous payez en recevant',
  moncash: 'Paiement mobile Digicel',
  natcash: 'Paiement mobile Natcom',
};

/**
 * La marque, telle qu'elle se dessine dans une rangée de moyens de paiement.
 *
 * `mark` est une graphie, pas un logo officiel : le mot posé dans la couleur de
 * l'opérateur, sur une pastille bordée. Reproduire les logos demanderait des
 * fichiers que nous n'avons pas le droit de redessiner à la main — et une
 * imitation approximative d'une marque connue inspire moins confiance qu'un mot
 * écrit proprement.
 *
 * `short` sert quand la rangée est étroite : « Livraison » tient là où
 * « Paiement à la livraison » déborde.
 */
export const PAYMENT_MARK: Record<PaymentMethod, { short: string; color: string }> = {
  // Le rouge Digicel, et le vert Natcom : les deux opérateurs dont l'acheteur
  // haïtien reconnaît la couleur avant de lire le mot.
  cash:    { short: 'À la livraison', color: '#1F2937' },
  moncash: { short: 'MonCash',        color: '#D6001C' },
  natcash: { short: 'NatCash',        color: '#00833E' },
};
