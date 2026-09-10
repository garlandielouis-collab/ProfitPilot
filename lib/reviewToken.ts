// ─────────────────────────────────────────────────────────────────────────────
// Le jeton de dépôt d'avis
//
// ── Le problème ─────────────────────────────────────────────────────────────
//
// `submitReview` exige l'adresse de courriel de la commande. C'est la bonne
// garde pour un formulaire ouvert : elle prouve qu'on est le client. Elle ne
// convient à aucune des deux surfaces qu'on ajoute :
//
//   Sur la page de confirmation, le client vient de taper son adresse à la
//   caisse. La lui redemander trente secondes plus tard pour noter ce qu'il
//   vient d'acheter est le genre de frottement qui fait fermer l'onglet.
//
//   Dans un courriel, il n'y a personne pour taper quoi que ce soit. Un lien
//   qui ouvre un formulaire demandant l'adresse à laquelle le lien a été
//   envoyé est une question dont on connaît déjà la réponse.
//
// ── Ce que le jeton prouve, et ce qu'il ne prouve pas ──────────────────────
//
// Il prouve qu'il a été fabriqué par ce serveur pour CETTE commande, et qu'il
// n'a pas expiré. Rien d'autre.
//
// Ce n'est donc pas une élévation de droit : il ne donne accès à rien de plus
// que ce que son porteur avait déjà. On ne l'obtient que de deux façons —
// charger la page de confirmation, ce qui demande l'UUID de la commande, ou
// recevoir le courriel, ce qui demande la boîte du client. Les deux sont
// exactement les preuves que l'adresse de courriel servait à établir.
//
// Il ne remplace pas les vérifications de `submitReview` : la commande doit
// exister, le produit doit y figurer, et l'unicité `(order_id, product_id)`
// reste la barrière contre le second avis. Le jeton remplace UNE question, pas
// le contrôle.
//
// ── Le secret ───────────────────────────────────────────────────────────────
//
// `REVIEW_TOKEN_SECRET` si elle est posée. Sinon la clé de service, qui est
// toujours présente côté serveur et n'en sort jamais. Le repli est délibéré :
// une fonctionnalité qui cesse de marcher parce qu'une variable d'environnement
// manque est une fonctionnalité qu'on découvre cassée en production. Le jour où
// la clé de service tourne, les jetons en vol deviennent invalides — c'est sans
// conséquence, le client recharge sa page ou reçoit la relance suivante.
//
// Ce fichier n'est JAMAIS importable depuis un composant client : il lirait le
// secret. Aucun export ne prend de valeur venue du navigateur sans la vérifier.
// ─────────────────────────────────────────────────────────────────────────────

import { createHmac, timingSafeEqual } from 'node:crypto';

/** Quinze jours. Au-delà, on ne se souvient plus de ce qu'on a acheté. */
const TTL_MS = 15 * 24 * 60 * 60 * 1000;

function secret(): string {
  const s = process.env.REVIEW_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new Error('Aucun secret pour signer le jeton d\'avis.');
  return s;
}

function sign(orderId: string, expiresAt: number): string {
  return createHmac('sha256', secret())
    .update(`${orderId}.${expiresAt}`)
    .digest('base64url');
}

/**
 * Fabrique un jeton pour cette commande.
 *
 * Le format est `<expiration>.<signature>` : l'identifiant de la commande n'y
 * est pas, parce qu'il voyage déjà à côté — dans l'adresse de la page ou du
 * lien. L'y mettre deux fois n'ajouterait rien et allongerait l'URL.
 */
export function mintReviewToken(orderId: string, ttlMs = TTL_MS): string {
  const expiresAt = Date.now() + ttlMs;
  return `${expiresAt}.${sign(orderId, expiresAt)}`;
}

/**
 * Ce jeton vaut-il pour cette commande, maintenant ?
 *
 * Ne lève jamais et ne dit jamais POURQUOI elle refuse : un jeton expiré et un
 * jeton forgé se répondent de la même façon. La comparaison passe par
 * `timingSafeEqual` — une comparaison de chaînes ordinaire s'arrête au premier
 * octet différent, ce qui laisse mesurer la signature attendue octet par octet.
 */
export function verifyReviewToken(orderId: string, token: unknown): boolean {
  if (typeof token !== 'string' || token.length > 256) return false;

  const dot = token.indexOf('.');
  if (dot <= 0) return false;

  const expiresAt = Number(token.slice(0, dot));
  if (!Number.isSafeInteger(expiresAt) || expiresAt < Date.now()) return false;

  const given = Buffer.from(token.slice(dot + 1));

  let expected: Buffer;
  try {
    expected = Buffer.from(sign(orderId, expiresAt));
  } catch {
    return false;
  }

  // `timingSafeEqual` lève si les longueurs diffèrent — c'est déjà une fuite,
  // mais la longueur d'un condensé HMAC est publique et constante. On la teste
  // d'abord pour ne pas lever.
  if (given.length !== expected.length) return false;
  return timingSafeEqual(given, expected);
}
