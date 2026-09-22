// ─────────────────────────────────────────────────────────────────────────────
// Les analyseurs de SMS — et l'avertissement qui va avec
//
// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  CES MOTIFS SONT DES MAQUETTES. AUCUN N'A ÉTÉ VÉRIFIÉ CONTRE UN VRAI SMS ║
// ║  MONCASH OU NATCASH.                                                     ║
// ╚═══════════════════════════════════════════════════════════════════════════╝
//
// Personne dans ce projet n'a encore lu un SMS d'encaissement MonCash réel. Les
// expressions ci-dessous sont donc construites sur ce qu'un tel message contient
// PLAUSIBLEMENT — un montant, une devise, un expéditeur, un identifiant de
// transaction — et non sur des exemples observés.
//
// Prétendre le contraire serait le pire mensonge possible dans ce module : un
// analyseur qu'on croit juste et qui ne l'est pas ne se tait pas, il se trompe.
// Il lit 4 500 là où il y a 450, ou prend le solde du marchand pour le montant
// reçu. Et ce chiffre-là va régler des commandes.
//
// ── Ce qui rend cette ignorance supportable ────────────────────────────────
//
// Trois choses, par construction :
//
//   `parse()` rend `null` dès qu'un champ obligatoire manque. Un message non
//   reconnu ne devient jamais un encaissement « à peu près lu » : il ne devient
//   rien, et le marchand garde sa saisie manuelle.
//
//   Le MVP n'en dépend pas. La saisie manuelle, la déclaration du client et la
//   confirmation du marchand fonctionnent sans qu'aucun SMS soit lu (§39, §55).
//   Le compagnon Android est un accélérateur, pas un organe vital.
//
//   Chaque analyseur porte une VERSION, écrite dans `payment_receipts.
//   parser_version`. Quand nous aurons de vrais messages, on saura exactement
//   quels encaissements ont été produits par quelle règle, et lesquels relire.
//
// ── Ce qu'il faudra faire le jour où nous aurons de vrais SMS ──────────────
//
//   1. Coller les messages réels dans `tests/paymentBridgeParsers.test.ts`,
//      anonymisés (montants et numéros changés, structure intacte).
//   2. Corriger les motifs jusqu'à ce que les tests passent.
//   3. Monter la version (`moncash-v2`, …) — SANS toucher à `moncash-v1`, qui
//      documente ce qui a produit les anciennes lignes.
//   4. Retirer l'avertissement ci-dessus, et seulement à ce moment-là.
//
// Tant que l'avertissement est là, le compagnon Android ne doit pas être publié
// en confirmation automatique. C'est écrit ici parce que c'est ici qu'on le lira.
// ─────────────────────────────────────────────────────────────────────────────

import type { ReceiptProvider } from './types';

/**
 * Ce qu'un analyseur produit : le format commun, quel que soit l'opérateur.
 *
 * C'est exactement ce que la route d'ingestion accepte — et rien de plus. Le
 * TEXTE du message n'y figure pas : il ne quitte pas le téléphone (voir §5 de la
 * migration, et §47 du cahier des charges).
 */
export type NormalizedReceipt = {
  provider:              ReceiptProvider;
  amount:                number;
  currency:              'HTG' | 'USD';
  transactionReference:  string | null;
  senderIdentifier:      string | null;
  /** ISO 8601. */
  receivedAt:            string;
  parserVersion:         string;
  /**
   * Ce que l'analyseur a compris d'autre, sans le texte. Sert à diagnostiquer
   * une mauvaise lecture sans conserver le message.
   */
  metadata:              Record<string, unknown>;
};

/**
 * L'abstraction demandée au §37 : un analyseur, une version, une fonction.
 *
 * Volontairement minimale. Un analyseur ne décide pas si le paiement est valable,
 * ne cherche pas la commande, n'écrit rien : il lit un message et rend des
 * champs, ou rien.
 */
export type PaymentReceiptParser = {
  readonly provider: ReceiptProvider;
  readonly version:  string;
  /**
   * `null` signifie « je ne reconnais pas ce message », et c'est une réponse
   * parfaitement acceptable. Elle vaut infiniment mieux qu'un montant deviné.
   */
  parse(message: string, opts?: { receivedAt?: string }): NormalizedReceipt | null;
};

// ─── Les briques communes ────────────────────────────────────────────────────

/**
 * Un montant écrit à l'haïtienne, ramené en nombre.
 *
 * Le piège est le séparateur : `4,500.00` (anglais), `4 500,00` (français) et
 * `4.500,00` (autre) désignent tous quatre mille cinq cents. Une lecture naïve
 * de `4,500` rend 4,5 — soit mille fois moins. Sur un encaissement, c'est la
 * différence entre une commande réglée et une commande réglée à 0,1 %.
 *
 * La règle : le DERNIER séparateur est décimal s'il est suivi d'exactement deux
 * chiffres ; sinon tous les séparateurs sont des milliers.
 */
export function parseHaitianAmount(raw: string): number | null {
  const cleaned = raw.trim().replace(/\s| /g, '');
  if (!/^[\d.,]+$/.test(cleaned) || cleaned === '') return null;

  const lastComma = cleaned.lastIndexOf(',');
  const lastDot   = cleaned.lastIndexOf('.');
  const lastSep   = Math.max(lastComma, lastDot);

  let normalized: string;
  if (lastSep === -1) {
    normalized = cleaned;
  } else {
    const decimals = cleaned.length - lastSep - 1;
    if (decimals === 2) {
      // Le dernier séparateur est décimal ; les autres sont des milliers.
      normalized = cleaned.slice(0, lastSep).replace(/[.,]/g, '') + '.' + cleaned.slice(lastSep + 1);
    } else {
      normalized = cleaned.replace(/[.,]/g, '');
    }
  }

  const n = Number(normalized);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Un numéro haïtien repéré dans un message, rendu tel quel. */
function findPhone(message: string): string | null {
  const m = message.match(/(?:\+?509[\s.-]?)?(\d{4}[\s.-]?\d{4})\b/);
  return m ? m[0].trim() : null;
}

/**
 * Le motif d'un identifiant de transaction : au moins six caractères
 * alphanumériques, au moins un chiffre.
 *
 * La contrainte « au moins un chiffre » écarte les mots de la phrase. Sans elle,
 * « Transaction » lui-même serait pris pour une référence.
 */
const TX_PATTERN = /\b(?=[A-Z0-9-]*\d)[A-Z0-9][A-Z0-9-]{5,}\b/;

function findTransactionReference(message: string, hints: readonly string[]): string | null {
  // On cherche d'abord APRÈS un mot d'annonce : « Transaction ID: ABC123 » est
  // bien plus sûr que le premier groupe alphanumérique du message, qui peut être
  // n'importe quoi.
  for (const hint of hints) {
    const re = new RegExp(`${hint}\\s*[:#]?\\s*([A-Za-z0-9-]{6,})`, 'i');
    const m = message.match(re);
    if (m?.[1]) return m[1].toUpperCase();
  }
  const loose = message.toUpperCase().match(TX_PATTERN);
  return loose?.[0] ?? null;
}

/**
 * Construit un analyseur pour un opérateur de paiement mobile.
 *
 * Les deux opérateurs se ressemblent assez pour partager la mécanique : un mot
 * qui annonce une réception, un montant, une devise, un expéditeur, une
 * référence. Les différences tiennent dans les listes de mots — donc dans les
 * données, pas dans le code.
 */
function makeMobileParser(config: {
  provider:      ReceiptProvider;
  version:       string;
  /** Les mots qui disent « de l'argent est ARRIVÉ ». Sans l'un d'eux, on refuse. */
  inbound:       readonly RegExp[];
  /** Ce qui annonce une référence de transaction. */
  txHints:       readonly string[];
  /** Ce qui trahit un message qui n'est PAS un encaissement. */
  disqualifiers: readonly RegExp[];
}): PaymentReceiptParser {
  return {
    provider: config.provider,
    version:  config.version,

    parse(message, opts) {
      if (typeof message !== 'string' || message.trim() === '') return null;

      // ── Refuser vite, et souvent ────────────────────────────────────────
      //
      // Un opérateur envoie bien plus de messages que des encaissements :
      // confirmations d'envoi, soldes, publicités, rappels de forfait. Prendre un
      // message de DÉBIT pour un encaissement crediterait une commande avec
      // l'argent que le marchand vient de dépenser.
      if (config.disqualifiers.some((re) => re.test(message))) return null;
      if (!config.inbound.some((re) => re.test(message))) return null;

      // Le montant, obligatoirement accompagné de sa devise : un nombre nu dans
      // un SMS peut être une date, un solde, un numéro de référence.
      const amountMatch = message.match(
        /(?:HTG|G(?:ourdes?)?|USD|\$)\s*([\d.,  ]+\d)|([\d.,  ]+\d)\s*(?:HTG|G(?:ourdes?)?|USD|\$)/i,
      );
      if (!amountMatch) return null;

      const amount = parseHaitianAmount(amountMatch[1] ?? amountMatch[2] ?? '');
      if (amount === null) return null;

      const currency: 'HTG' | 'USD' = /USD|\$/i.test(amountMatch[0]) ? 'USD' : 'HTG';

      return {
        provider:             config.provider,
        amount,
        currency,
        transactionReference: findTransactionReference(message, config.txHints),
        senderIdentifier:     findPhone(message),
        // L'heure du message quand le téléphone la donne ; sinon celle de la
        // lecture. Jamais devinée depuis le texte : un « 14h07 » sans date ne
        // dit pas quel jour.
        receivedAt:           opts?.receivedAt ?? new Date().toISOString(),
        parserVersion:        config.version,
        metadata: {
          // Aucun extrait du message. `matched_currency` suffit à diagnostiquer
          // une lecture de devise erronée sans conserver la phrase.
          matched_currency: currency,
          mock:             true,
        },
      };
    },
  };
}

/**
 * MAQUETTE — motifs non vérifiés contre un vrai SMS MonCash.
 * Voir l'avertissement en tête de fichier.
 */
export const moncashParser: PaymentReceiptParser = makeMobileParser({
  provider: 'moncash',
  version:  'moncash-mock-v1',
  inbound: [
    /\bre[çc]u\b/i,
    /\bresevwa\b/i,
    /\brecei?ved\b/i,
    /\bcredit[eé]\b/i,
  ],
  txHints: ['transaction', 'transaksyon', 'ref', 'r[ée]f[ée]rence', 'id'],
  disqualifiers: [
    // Un envoi n'est pas une réception.
    /\benvoy[ée]\b/i, /\bvoye\b/i, /\bsent\b/i, /\bd[ée]bit/i,
    // Un relevé de solde porte un montant sans qu'un centime ait bougé.
    /\bsolde\b/i, /\bbalans\b/i, /\bbalance\b/i,
    // Et un code à usage unique ne doit jamais devenir un montant.
    /\bcode\b/i, /\bOTP\b/i,
  ],
});

/**
 * MAQUETTE — motifs non vérifiés contre un vrai SMS NatCash.
 * Voir l'avertissement en tête de fichier.
 */
export const natcashParser: PaymentReceiptParser = makeMobileParser({
  provider: 'natcash',
  version:  'natcash-mock-v1',
  inbound: [
    /\bre[çc]u\b/i,
    /\bresevwa\b/i,
    /\brecei?ved\b/i,
    /\bcredit[eé]\b/i,
  ],
  txHints: ['transaction', 'transaksyon', 'ref', 'r[ée]f[ée]rence', 'id'],
  disqualifiers: [
    /\benvoy[ée]\b/i, /\bvoye\b/i, /\bsent\b/i, /\bd[ée]bit/i,
    /\bsolde\b/i, /\bbalans\b/i, /\bbalance\b/i,
    /\bcode\b/i, /\bOTP\b/i,
  ],
});

export const PARSERS: readonly PaymentReceiptParser[] = [moncashParser, natcashParser];

export function parserFor(provider: ReceiptProvider): PaymentReceiptParser | null {
  return PARSERS.find((p) => p.provider === provider) ?? null;
}

/**
 * Vrai tant qu'aucun analyseur n'a été confronté à de vrais messages.
 *
 * Lu par la route d'ingestion : un encaissement d'origine `sms_companion` produit
 * par une maquette ne peut PAS déclencher de confirmation automatique, même si le
 * montant tombe juste. Le marchand le voit, le marchand confirme.
 *
 * C'est l'unique interrupteur à basculer le jour où les motifs seront éprouvés.
 */
export const PARSERS_ARE_MOCK = true;
