// ─────────────────────────────────────────────────────────────────────────────
// L'idempotence — pourquoi le même SMS envoyé vingt fois ne paie qu'une fois
//
// ── Le problème, tel qu'il se produit ──────────────────────────────────────
//
// Le compagnon Android tourne sur un téléphone haïtien : réseau qui tombe au
// milieu d'une requête, application tuée par le système pour récupérer de la
// mémoire, réinstallation qui relit toute la boîte de réception. Chacune de ces
// trois situations renvoie des SMS déjà envoyés. La troisième en renvoie des
// mois.
//
// Si rien ne les reconnaît, un virement de 4 500 G devient vingt encaissements
// de 4 500 G. Le marchand voit vingt paiements, dix-neuf commandes fantômes sont
// réglées, et le stock de dix-neuf produits est décrémenté.
//
// ── Où la promesse est tenue ───────────────────────────────────────────────
//
// PAS ici. Ce fichier calcule une clé ; c'est l'index unique
// `(business_id, dedupe_key)` de `payment_receipts` qui refuse le doublon.
//
// La distinction est le tout du sujet. Un `SELECT` avant `INSERT` ne protège de
// rien : deux requêtes simultanées lisent toutes les deux « pas encore là » et
// insèrent toutes les deux. Seule la base sait sérialiser. Le code se contente
// donc de produire la clé, et de traiter la violation d'unicité comme un SUCCÈS
// — « cet encaissement est déjà connu » n'est pas une erreur.
//
// ── La clé, et son repli ───────────────────────────────────────────────────
//
// Quand l'opérateur donne un identifiant de transaction, il est la clé : c'est
// lui qui est unique chez l'opérateur, et donc le seul discriminant qui ne
// dépende pas de notre lecture.
//
// Le cahier des charges demandait « ne suppose pas que transaction_reference
// existe toujours » — et il a raison de le demander. Un SMS tronqué, un format
// changé, un analyseur qui ne trouve pas le champ : il faut une clé quand même.
//
// Le repli est : opérateur + montant + expéditeur + MINUTE d'arrivée.
//
// Pourquoi la minute, et pas la seconde : l'heure d'un SMS n'est pas une donnée
// fiable au-delà. Selon le téléphone, elle vient de l'horodatage du centre de
// messagerie, du texte du message, ou de l'horloge locale — laquelle peut avoir
// dérivé. Deux lectures du même SMS peuvent donc différer de quelques secondes,
// et une clé à la seconde les laisserait passer toutes les deux.
//
// Pourquoi pas plus large, comme l'heure : deux clients qui paient le même
// montant au même marchand dans la même heure, cela arrive tous les jours sur un
// catalogue à prix ronds. La deuxième vente serait silencieusement perdue.
//
// La minute est le seul palier où les deux risques sont petits ensemble. Et
// quand le repli sert, la confiance ne peut pas valoir `exact` : sans identifiant
// de transaction, le rapprochement passe par le marchand.
// ─────────────────────────────────────────────────────────────────────────────

import type { ReceiptProvider } from './types';

/**
 * Un identifiant de transaction ramené à sa forme comparable.
 *
 * Majuscules, et rien que des lettres et des chiffres. Les opérateurs ne sont
 * pas constants : le même identifiant apparaît `ABC-123 456`, `abc123456` ou
 * `ABC 123456` selon qu'il vient d'un SMS, d'une capture d'écran recopiée à la
 * main par le client, ou de l'API. Les trois doivent donner la même clé, sinon
 * le même paiement compte deux fois selon la porte par laquelle il est entré.
 *
 * Rend `null` pour tout ce qui ne porte aucun caractère utile : une chaîne vide,
 * des espaces, ou `« - »`. Un identifiant vide ne doit pas devenir la chaîne
 * vide, qui serait la MÊME pour tous les encaissements sans référence — et
 * l'index unique les réduirait à un seul.
 */
export function normalizeTransactionReference(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Un numéro d'expéditeur ramené à ses chiffres.
 *
 * `+509 3712 3456`, `50937123456` et `037123456` désignent le même client. On ne
 * garde que les chiffres, et seulement les HUIT DERNIERS : c'est la partie
 * stable d'un numéro haïtien (huit chiffres après l'indicatif 509). Garder
 * l'indicatif ferait de « avec » et « sans » deux expéditeurs différents.
 */
export function normalizeSender(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 0) return null;
  return digits.length > 8 ? digits.slice(-8) : digits;
}

/** L'instant, arrondi à la minute, en UTC. Voir l'en-tête pour le choix du palier. */
function minuteStamp(receivedAt: Date | string): string {
  const d = receivedAt instanceof Date ? receivedAt : new Date(receivedAt);
  if (Number.isNaN(d.getTime())) return 'invalid-date';
  return d.toISOString().slice(0, 16); // « 2026-09-27T14:07 »
}

export type DedupeInput = {
  provider:              ReceiptProvider;
  amount:                number;
  transactionReference?: string | null;
  senderIdentifier?:     string | null;
  receivedAt:            Date | string;
};

export type DedupeKey = {
  key: string;
  /**
   * `reference` quand l'opérateur a donné un identifiant, `heuristic` quand on a
   * dû se rabattre sur le montant et la minute.
   *
   * Lu par le moteur de rapprochement : une clé heuristique ne peut pas produire
   * une confiance `exact`, et donc ne peut pas déclencher de confirmation
   * automatique. Sans cette distinction, deux clients payant le même montant à
   * la même minute verraient le second paiement disparaître — et le premier
   * régler une commande qui n'est pas la sienne.
   */
  basis: 'reference' | 'heuristic';
};

/**
 * La clé de déduplication d'un encaissement.
 *
 * Calculée côté serveur, TOUJOURS. Rien de ce qu'un téléphone envoie n'est
 * repris tel quel : un appareil compromis qui choisirait ses propres clés
 * contournerait l'unicité en changeant un caractère à chaque envoi.
 *
 * L'entreprise n'entre pas dans la clé : elle est la seconde colonne de l'index
 * unique. Deux commerces peuvent recevoir la même transaction — cela n'arrive
 * pas, mais rien ne l'interdit — et ni l'un ni l'autre ne doit masquer l'autre.
 */
export function dedupeKey(input: DedupeInput): DedupeKey {
  const ref = normalizeTransactionReference(input.transactionReference);

  if (ref) {
    return { key: `${input.provider}:ref:${ref}`, basis: 'reference' };
  }

  // Le montant au centime, en chaîne : `4500` et `4500.00` sont le même montant
  // et doivent donner la même clé.
  const amount = Number.isFinite(input.amount) ? input.amount.toFixed(2) : 'NaN';
  const sender = normalizeSender(input.senderIdentifier) ?? 'anon';

  return {
    key: `${input.provider}:h:${amount}:${sender}:${minuteStamp(input.receivedAt)}`,
    basis: 'heuristic',
  };
}
