// ─────────────────────────────────────────────────────────────────────────────
// Ce qui prouve, sous la bannière de la vitrine
//
// Sous la bannière, la vitrine posait quatre badges en grille : « Livraison
// rapide », « MonCash & NatCash », « Retours acceptés », « WhatsApp ». Sur un
// grand écran, c'est une ligne qui se lit d'un coup d'œil. Sur un téléphone,
// c'est une grille de deux colonnes sur deux rangées qui occupe un demi-écran
// AVANT le premier produit — et qui ne prouve rien : ce sont les promesses du
// marchand sur le marchand.
//
// ── Une promesse n'est pas une preuve ───────────────────────────────────────
//
// « Livraison rapide » est une affirmation que son auteur ne peut pas soutenir.
// Le logo d'une marque qu'il distribue, le nom d'un client qu'on connaît, un
// chiffre qu'il assume — « 1 200 commandes livrées » — sont d'une autre nature :
// ils engagent quelqu'un d'autre que lui, ou ils sont vérifiables. C'est ce
// qu'un visiteur cherche dans les quatre secondes où il décide si la boutique
// est réelle.
//
// D'où l'ordre de ce fichier : les partenaires d'abord, les chiffres ensuite,
// les engagements en dernier. Le plus fort en premier, parce que sur une bande
// qui défile, seuls les deux premiers éléments sont vus par tout le monde.
//
// ── Rien n'est inventé, donc la bande peut être vide ────────────────────────
//
// Les trois sources sont SAISIES par le marchand. Un partenaire inventé
// l'expose personnellement — c'est lui que le client ira voir, pas nous. Une
// vitrine qui n'a rien rempli n'a donc pas de bande, et sa bannière est suivie
// directement de ses produits. C'est la même règle que les pages internes :
// une section vide n'existe pas.
// ─────────────────────────────────────────────────────────────────────────────

import type { ThemeConfig } from './storeTheme';

/** Les icônes que `trust` sait dessiner — reprises telles quelles du thème. */
export type ProofIcon = ThemeConfig['trust']['badges'][number]['icon'];

export type ProofItem = {
  /** Stable pour React, et lisible dans un test. */
  key:   string;
  kind:  'partner' | 'stat' | 'trust';
  /** Le mot qui porte : le nom de la marque, le chiffre, l'engagement. */
  label: string;
  /** La ligne de dessous, quand elle ajoute quelque chose. */
  note?: string;
  /** Le logo d'un partenaire, quand il en a un. */
  logoUrl?: string | null;
  /** L'icône d'un engagement. Les partenaires et les chiffres n'en ont pas. */
  icon?: ProofIcon;
  /**
   * Un moyen de paiement que la bande sait dessiner, pour un partenaire saisi
   * SANS logo. Le préréglage des gabarits met MonCash, NatCash, Visa et
   * Mastercard dans les références avec `logoUrl: null` : sans ce repère, la
   * bande écrirait quatre noms en gras là où l'on attend quatre marques.
   */
  brand?: PaymentBrand;
};

export type PaymentBrand = 'moncash' | 'natcash' | 'visa' | 'mastercard';

const BRANDS: Record<string, PaymentBrand> = {
  moncash: 'moncash', natcash: 'natcash', visa: 'visa', mastercard: 'mastercard',
};

/**
 * La marque de paiement que désigne un nom, s'il n'en désigne qu'une.
 *
 * Sur les mots RECOLLÉS : « Mon Cash », « MONCASH » et « Master-Card » sont la
 * même marque. Le nom entier doit correspondre — « Visa Premium » ou « Boutique
 * Visa » ne sont pas la marque Visa, et on n'y dessine pas son logo.
 */
export function paymentBrand(name: string): PaymentBrand | null {
  return BRANDS[words(name).join('')] ?? null;
}

/**
 * Dix, pas plus.
 *
 * Une bande qui défile sans fin n'est plus une preuve, c'est un mur : au
 * huitième élément, plus personne ne pousse. Le plafond tombe volontairement
 * après les partenaires (8 au maximum dans le thème) et les chiffres (4), de
 * sorte qu'un marchand très fourni perd des ENGAGEMENTS — les plus faibles —
 * et jamais une référence.
 */
const MAX_ITEMS = 10;

/**
 * Les MOTS d'un libellé : minuscules, sans accents, sans ponctuation.
 *
 * Sert uniquement à comparer une marque et un engagement — « MonCash » doit
 * reconnaître « Moncash », « MONCASH » et « Mon-Cash ». Rien de ce qui sort
 * d'ici n'est affiché.
 *
 * Des mots, et non une chaîne recollée : sur « devisalademande », une marque
 * nommée « Visa » se serait reconnue au milieu de « Devis à la demande », et
 * l'engagement aurait disparu de la bande sans que personne ne comprenne
 * pourquoi.
 */
function words(value: string): string[] {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * La bande de preuves d'une vitrine, dans l'ordre où elle se lit.
 *
 * Aucun tri par pertinence : l'ordre de saisie du marchand est respecté à
 * l'intérieur de chaque famille. Il connaît ses clients mieux que nous, et un
 * classement automatique le priverait du seul levier qu'il a sur cette bande.
 */
export function proofStripItems(theme: ThemeConfig): ProofItem[] {
  const items: ProofItem[] = [];

  // ── Les marques et les gros clients ──────────────────────────────────────
  //
  // `partners.enabled` est faux par défaut dans le thème : seul un marchand qui
  // a saisi ses références les montre. Un logo manquant n'écarte pas la
  // référence — le nom écrit en toutes lettres prouve autant, et le demander
  // en image aurait exclu ceux qui n'en ont pas.
  const partners = theme.partners;
  if (partners.enabled) {
    for (const [i, item] of partners.items.entries()) {
      const name = item.name.trim();
      if (!name) continue;
      items.push({
        key:     `partner-${i}-${name}`,
        kind:    'partner',
        label:   name,
        logoUrl: item.logoUrl,
        brand:   item.logoUrl ? undefined : paymentBrand(name) ?? undefined,
      });
    }
  }

  // ── Les chiffres que le marchand assume ──────────────────────────────────
  //
  // La valeur porte, le libellé explique : « 1 200 » puis « commandes livrées ».
  // L'inverse — le libellé en gras et le chiffre en dessous — enterre la seule
  // chose qui se retient.
  const stats = theme.stats;
  if (stats.enabled) {
    for (const [i, item] of stats.items.entries()) {
      const value = item.value.trim();
      const label = item.label.trim();
      if (!value || !label) continue;
      items.push({
        key:   `stat-${i}-${value}`,
        kind:  'stat',
        label: value,
        note:  label,
      });
    }
  }

  // ── Les engagements ──────────────────────────────────────────────────────
  //
  // Ils restent, en fin de bande : ce sont des promesses, mais ce sont les
  // réponses aux trois questions qui bloquent un achat en ligne en Haïti —
  // est-ce que je serai livré, est-ce que je peux payer comme d'habitude,
  // est-ce que je peux joindre quelqu'un si ça se passe mal.
  //
  // Sauf ceux qui répètent une marque déjà montrée. Le préréglage des gabarits
  // met « MonCash » et « NatCash » dans les références ET un badge « MonCash &
  // NatCash » dans les engagements : sans cette règle, la bande dirait trois
  // fois MonCash en six pastilles, ce qui est exactement l'impression de
  // remplissage que la grille donnait déjà.
  const shown = items
    .filter((i) => i.kind === 'partner')
    .map((i) => words(i.label))
    .filter((w) => w.length > 0);

  const trust = theme.trust;
  if (trust.enabled) {
    for (const [i, badge] of trust.badges.entries()) {
      const label = badge.label.trim();
      if (!label) continue;

      // Une marque « répète » un engagement quand TOUS ses mots s'y retrouvent :
      // « Caribbean Supply » ne se reconnaît pas dans « Livraison Caribbean »,
      // qui parle d'autre chose.
      const inBadge = new Set(words(label));
      const repeats = shown.some((name) => name.every((w) => inBadge.has(w)));
      if (repeats) continue;

      items.push({
        key:   `trust-${i}-${label}`,
        kind:  'trust',
        label,
        note:  badge.note.trim() || undefined,
        icon:  badge.icon,
      });
    }
  }

  return items.slice(0, MAX_ITEMS);
}
