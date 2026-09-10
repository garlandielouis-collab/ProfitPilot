// ─────────────────────────────────────────────────────────────────────────────
// Commander par WhatsApp
//
// En Haïti, une bonne part des ventes en ligne se conclut dans une conversation,
// pas dans un tunnel de paiement. Le formulaire de livraison en six champs est
// le point où l'acheteur abandonne — pas le prix.
//
// Ce module ne fait qu'une chose : transformer un panier en message lisible et
// en lien `wa.me`. Aucun envoi, aucun compte WhatsApp Business requis. Le
// marchand reçoit la commande dans son fil habituel, l'acheteur n'a rien
// installé de plus.
//
// La normalisation du numéro (« 3712 3456 » → « 50937123456 ») vit déjà dans
// `lib/whatsappReport.ts` pour les relances de créance. On la réutilise :
// deux normalisations de numéros haïtiens dans une même base finiraient par
// diverger, et c'est le genre de divergence qui ne se voit qu'au moment où un
// client n'arrive pas à commander.
// ─────────────────────────────────────────────────────────────────────────────

import { buildWhatsAppLink, toWhatsAppNumber } from './whatsappReport';

export type WhatsAppOrderLine = {
  name:     string;
  quantity: number;
  /** Prix unitaire. Le message affiche le total de la ligne. */
  price:    number;
};

export type WhatsAppOrderInput = {
  storeName: string;
  currency:  string;
  items:     WhatsAppOrderLine[];
  total:     number;
  /** Frais de livraison, quand un mode a été choisi. */
  shipping?: { label: string; price: number } | null;
  /** Les coordonnées, si l'acheteur a bien voulu les donner. Toutes optionnelles. */
  customer?: {
    name?:    string;
    phone?:   string;
    address?: string;
    note?:    string;
  } | null;
  /** L'adresse de la vitrine, pour que le marchand sache d'où vient la commande. */
  storeUrl?: string | null;
  /** Une phrase d'accueil réglée dans l'éditeur, en tête du message. */
  greeting?: string | null;
};

function money(amount: number, currency: string): string {
  return `${new Intl.NumberFormat('fr-HT', { maximumFractionDigits: 0 }).format(Math.round(amount))} ${currency}`;
}

/**
 * Le message que l'acheteur envoie au marchand.
 *
 * Il est écrit pour être lu sur un téléphone, dans une conversation : une ligne
 * par produit, le total détaché, les coordonnées en bloc à la fin. Pas de
 * décoration ASCII — les tableaux en caractères se cassent dès que la police du
 * téléphone n'est pas à chasse fixe, et celle de WhatsApp ne l'est pas.
 */
export function buildWhatsAppOrderMessage(input: WhatsAppOrderInput): string {
  const { storeName, currency, items, total, shipping, customer, storeUrl, greeting } = input;

  const lines: string[] = [];

  lines.push(greeting?.trim() || `Bonjour ${storeName}, je souhaite commander :`);
  lines.push('');

  for (const item of items) {
    lines.push(`• ${item.quantity}x ${item.name} — ${money(item.price * item.quantity, currency)}`);
  }

  if (shipping && shipping.price > 0) {
    lines.push('');
    lines.push(`Livraison (${shipping.label}) : ${money(shipping.price, currency)}`);
  }

  lines.push('');
  lines.push(`*Total : ${money(total, currency)}*`);

  // Le bloc coordonnées n'apparaît que s'il y a quelque chose à y mettre. Un
  // en-tête « Mes informations de livraison » suivi de rien fait croire à
  // l'acheteur qu'il a raté un champ.
  const details: string[] = [];
  if (customer?.name?.trim())    details.push(`Nom : ${customer.name.trim()}`);
  if (customer?.phone?.trim())   details.push(`Téléphone : ${customer.phone.trim()}`);
  if (customer?.address?.trim()) details.push(`Adresse : ${customer.address.trim()}`);
  if (customer?.note?.trim())    details.push(`Note : ${customer.note.trim()}`);

  if (details.length > 0) {
    lines.push('');
    lines.push('Mes informations de livraison :');
    lines.push(...details);
  }

  if (storeUrl) {
    lines.push('');
    lines.push(storeUrl);
  }

  return lines.join('\n');
}

/**
 * Le lien complet. `null` si aucun numéro exploitable : mieux vaut ne pas
 * afficher le bouton que d'ouvrir WhatsApp sur un destinataire vide, où
 * l'acheteur croira avoir commandé.
 */
export function buildWhatsAppOrderLink(
  phone: string | null | undefined,
  input: WhatsAppOrderInput,
): string | null {
  if (!toWhatsAppNumber(phone)) return null;
  return buildWhatsAppLink(phone, buildWhatsAppOrderMessage(input));
}

/**
 * Le lien de prise de rendez-vous d'un prestataire (§34).
 *
 * WhatsApp d'abord — c'est là que la conversation a lieu — le courriel ensuite,
 * et `null` si le marchand n'a renseigné ni l'un ni l'autre. Ce `null` compte :
 * il fait disparaître le bouton au lieu d'en afficher un qui n'aboutit nulle
 * part, ce qui ferait conclure au visiteur que la boutique ne fonctionne pas.
 *
 * Il prend des valeurs simples plutôt qu'une vitrine entière : l'en-tête est un
 * composant client et la bannière un composant serveur, et les deux doivent
 * pouvoir l'appeler sans que ce module connaisse `StoreView`.
 */
export function buildBookingLink(input: {
  storeName: string;
  phone:     string | null;
  email:     string | null;
}): string | null {
  if (input.phone && toWhatsAppNumber(input.phone)) {
    return buildWhatsAppLink(
      input.phone,
      `Bonjour ${input.storeName}, je souhaite prendre rendez-vous.`,
    );
  }
  if (input.email?.trim()) {
    return `mailto:${input.email.trim()}?subject=${encodeURIComponent('Demande de rendez-vous')}`;
  }
  return null;
}

/** Le numéro qui reçoit les commandes : celui du thème, sinon celui de la vitrine. */
export function resolveOrderPhone(
  themeNumber: string | null | undefined,
  storeNumber: string | null | undefined,
  contactPhone: string | null | undefined,
): string | null {
  for (const candidate of [themeNumber, storeNumber, contactPhone]) {
    if (candidate && toWhatsAppNumber(candidate)) return candidate;
  }
  return null;
}

export { toWhatsAppNumber };
