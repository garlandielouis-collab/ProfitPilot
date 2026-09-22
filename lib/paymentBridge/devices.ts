// ─────────────────────────────────────────────────────────────────────────────
// Les appareils enrôlés — et le secret qui les authentifie
//
// ── Pourquoi un jeton et pas un `device_id` ────────────────────────────────
//
// Le §36 le dit sans détour : ne pas faire confiance à un simple `device_id`.
// La raison est qu'un identifiant n'est pas un secret. Il voyage dans les
// journaux, il s'affiche dans une interface, il se devine parfois. Si le fait de
// CONNAÎTRE l'identifiant d'un appareil suffit à parler en son nom, alors
// n'importe qui ayant vu cet identifiant peut déclarer des encaissements chez ce
// marchand — et faire passer pour payées des commandes que personne n'a payées.
//
// L'appareil porte donc un jeton : 32 octets tirés au hasard cryptographique.
//
// ── Pourquoi seul le HACHAGE est stocké ────────────────────────────────────
//
// Un secret lisible en base n'est plus un secret. Une sauvegarde exportée, une
// politique RLS mal posée, un `select('*')` dans une route, un accès accordé à un
// prestataire : autant de chemins par lesquels une colonne en clair sort. La base
// ne garde donc que le SHA-256, et le jeton n'existe en clair qu'une seule fois,
// dans la réponse de l'enrôlement.
//
// Conséquence assumée : un jeton perdu ne se retrouve pas. On révoque l'appareil
// et on en enrôle un autre. C'est un geste de dix secondes, et c'est exactement
// ce qu'on veut qu'il se passe quand un téléphone disparaît.
//
// ── Pourquoi SHA-256 et pas bcrypt ou argon2 ───────────────────────────────
//
// Les fonctions lentes existent pour protéger des secrets À FAIBLE ENTROPIE :
// un mot de passe humain se devine par force brute, il faut ralentir l'attaquant.
// Ici le secret fait 256 bits de hasard : il ne se devine pas, quelle que soit la
// vitesse. Ce qu'il faut, c'est un hachage RAPIDE — il est vérifié à chaque reçu
// envoyé, et un argon2 par SMS reçu ferait du compagnon un lanceur de déni de
// service contre notre propre serveur.
//
// La comparaison est en temps constant malgré tout : la différence est mesurable
// sur un serveur partagé, et elle ne coûte rien à supprimer.
// ─────────────────────────────────────────────────────────────────────────────

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Le préfixe des jetons. Lisible, pour qu'un jeton trouvé dans un journal ou un
 * presse-papier soit reconnu pour ce qu'il est — et révoqué.
 */
const TOKEN_PREFIX = 'ppdev_';

export type IssuedToken = {
  /** Le jeton en clair. Il n'est rendu QU'ICI, et jamais relu ensuite. */
  token:  string;
  /** Ce qui va en base. */
  hash:   string;
  /** Les premiers caractères, pour que le marchand reconnaisse l'appareil. */
  prefix: string;
};

/**
 * Un jeton neuf.
 *
 * `base64url` plutôt que `hex` : même entropie en un tiers de caractères en
 * moins, et sans caractère qui casse une URL ou un en-tête HTTP.
 */
export function issueDeviceToken(): IssuedToken {
  const secret = randomBytes(32).toString('base64url');
  const token  = `${TOKEN_PREFIX}${secret}`;
  return {
    token,
    hash:   hashDeviceToken(token),
    // Assez pour distinguer deux appareils dans une liste, très loin d'être assez
    // pour reconstituer le jeton.
    prefix: token.slice(0, TOKEN_PREFIX.length + 6),
  };
}

/** Le SHA-256 hexadécimal d'un jeton. La seule forme qui entre en base. */
export function hashDeviceToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/**
 * Le jeton d'une requête, ou `null`.
 *
 * Accepte `Authorization: Bearer <jeton>` et `x-pp-device-token`, comme
 * `lib/cronAuth.ts` accepte deux formes pour la même raison : un client HTTP
 * contraint n'a pas toujours la main sur l'en-tête `Authorization`.
 *
 * Le format est vérifié ici, avant tout accès à la base : une chaîne qui n'a pas
 * la forme d'un jeton ne mérite pas un aller-retour SQL. C'est aussi ce qui
 * empêche une chaîne vide de devenir une requête `token_hash = <hash de "">`,
 * qui trouverait une ligne si quelqu'un avait un jour enrôlé un jeton vide.
 */
export function deviceTokenFrom(headers: Headers): string | null {
  const bearer = headers.get('authorization');
  const raw =
    (bearer?.startsWith('Bearer ') ? bearer.slice(7) : null)
    ?? headers.get('x-pp-device-token');

  if (typeof raw !== 'string') return null;
  const token = raw.trim();

  if (!token.startsWith(TOKEN_PREFIX)) return null;
  // 32 octets en base64url font 43 caractères.
  if (token.length < TOKEN_PREFIX.length + 40) return null;

  return token;
}

/**
 * Deux hachages sont-ils égaux, sans révéler par le temps de réponse où ils
 * diffèrent ?
 *
 * `timingSafeEqual` lève si les longueurs diffèrent — ce qui serait une fuite en
 * soi. On compare donc les longueurs d'abord, et on rend `false` : deux SHA-256
 * font toujours 64 caractères, donc une longueur différente n'est jamais un
 * hachage légitime.
 */
export function sameHash(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
  } catch {
    return false;
  }
}
