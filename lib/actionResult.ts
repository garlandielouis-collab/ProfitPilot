// ─────────────────────────────────────────────────────────────────────────────
// Le résultat d'une action serveur
//
// ── Le problème ─────────────────────────────────────────────────────────────
//
// En production, Next efface le message de toute erreur LEVÉE par une action
// serveur et le remplace par :
//
//   « An error occurred in the Server Components render. The specific message
//     is omitted in production builds to avoid leaking sensitive details. »
//
// C'est la bonne politique par défaut : un message d'erreur Postgres porte des
// noms de tables, de colonnes et de contraintes. Mais 114 de nos `throw`
// portaient un message écrit POUR le marchand — « Vous avez atteint 50
// produits », « Seul le propriétaire peut modifier les rôles », « L'offre
// Esansyel est mono-utilisateur ». Ces messages-là étaient effacés aussi, et
// l'écran affichait la phrase anglaise à leur place.
//
// Le bouton avait pourtant fonctionné : la règle métier s'était appliquée. Mais
// le marchand lisait un message technique en anglais, ne comprenait pas ce
// qu'on lui refusait, et réessayait. L'écran mentait sur ce qui venait de se
// passer.
//
// ── La règle ────────────────────────────────────────────────────────────────
//
// Une action serveur ne LÈVE jamais un message destiné au marchand : elle le
// RENVOIE. Une valeur de retour traverse la frontière serveur/client intacte,
// en production comme en développement.
//
//   export async function faireQuelqueChose(x: string) {
//     return attempt(async () => {
//       if (interdit) throw new UserFacingError('Seul le propriétaire peut…');
//       await db.…                       // une erreur Postgres remonte ici
//       return { id };                   // le succès
//     });
//   }
//
// Et côté écran :
//
//   const res = await faireQuelqueChose(x);
//   if (!res.ok) { setError(res.message); return; }
//   res.data.id
//
// ── Ce qui passe, et ce qui ne passe pas ────────────────────────────────────
//
// `attempt` trie. Passent au marchand : `UserFacingError`, et les erreurs de
// garde qui portent déjà une phrase écrite pour lui (`FeatureLockedError`,
// `PlanLimitError`). Tout le reste — erreur Postgres, panne réseau, bogue —
// devient une phrase générique, et l'original part dans les journaux du
// serveur, où il est utile et où il ne fuit pas.
//
// C'est la même politique que celle de Next. La différence est qu'ici, on
// décide quels messages sont écrits pour un humain, au lieu de tous les perdre.
// ─────────────────────────────────────────────────────────────────────────────

// Ce fichier n'importe RIEN. C'est délibéré : il est chargé par les actions
// serveur ET par les écrans qui les appellent. Une seule ligne d'import vers
// `entitlements` y ferait entrer `next/headers` dans le paquet du navigateur,
// et la compilation s'arrêterait. Les classes d'erreur se reconnaissent donc
// par leur `name`, que chacune pose dans son constructeur.

/**
 * Une erreur dont le message est écrit POUR le marchand, en français ou en
 * kreyòl, et qui doit lui parvenir tel quel.
 *
 * À ne jamais utiliser pour relayer le message d'une base de données.
 */
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserFacingError';
  }
}

export type ActionResult<T = void> =
  | { ok: true;  data: T }
  | { ok: false; message: string };

/** Le repli quand l'erreur n'était pas écrite pour le marchand. */
const GENERIC =
  "L'opération n'a pas abouti. Réessayez ; si cela persiste, prévenez-nous.";

/**
 * Vrai si le message de cette erreur a été écrit pour être lu par le marchand.
 *
 * `assertPermission` lève une `Error` nue dont le message l'est aussi
 * (« Action non autorisée pour le rôle "caissier". ») : on la reconnaît à son
 * texte, faute de classe. Le jour où elle en aura une, cette ligne disparaît.
 */
const USER_FACING_NAMES = new Set([
  'UserFacingError',
  'FeatureLockedError',   // « Fonctionnalité disponible à partir de l'offre… »
  'PlanLimitError',       // « Limite atteinte : l'offre Kwasans couvre 3 membres… »
]);

function isUserFacing(e: unknown): e is Error {
  if (!(e instanceof Error)) return false;
  if (USER_FACING_NAMES.has(e.name)) return true;
  return e.message.startsWith('Action non autorisée');
}

/**
 * Exécute le corps d'une action et renvoie son résultat au lieu de le lever.
 *
 * Le `console.error` n'est pas du bruit : c'est la seule trace qui reste d'une
 * erreur technique, puisqu'elle ne remonte plus à l'écran.
 */
export async function attempt<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    // Next signale certaines choses PAR une exception, qui n'est pas une
    // erreur : `redirect()`, `notFound()`, et surtout la sortie de rendu
    // statique (`DYNAMIC_SERVER_USAGE`) — celle qui dit « cette route lit les
    // cookies, elle doit être dynamique ». Les attraper les annule en silence :
    // la redirection n'a pas lieu, ou la page se fige en statique avec des
    // données vides. Toutes portent un `digest` ; une erreur applicative, non.
    if (isFrameworkSignal(e)) throw e;

    if (isUserFacing(e)) return { ok: false, message: (e as Error).message };
    console.error('[action]', e);
    return { ok: false, message: GENERIC };
  }
}

function isFrameworkSignal(e: unknown): boolean {
  const digest = (e as { digest?: unknown } | null)?.digest;
  return typeof digest === 'string' && digest.length > 0;
}

/**
 * Ouvre un résultat côté ÉCRAN : rend la valeur, ou lève avec le vrai message.
 *
 * C'est ce qui rend la conversion tenable. Un écran écrit déjà :
 *
 *   try { await créerProduit(f); } catch (e) { setError(e.message); }
 *
 * et devient :
 *
 *   try { unwrap(await créerProduit(f)); } catch (e) { setError(e.message); }
 *
 * Le `throw` a lieu dans le navigateur, sur un message qui a traversé la
 * frontière comme une valeur : Next n'a rien à effacer. Un seul mot ajouté par
 * appel, et la gestion d'erreur de l'écran continue de fonctionner telle
 * quelle — y compris ses `finally`, ses états de chargement et ses toasts.
 */
export function unwrap<T>(res: ActionResult<T>): T {
  if (res.ok) return res.data;
  throw new UserFacingError(res.message);
}

/**
 * Le message à montrer pour une erreur attrapée dans un écran, quand l'action
 * appelée LÈVE encore au lieu de renvoyer (le reste du parc).
 *
 * En production, Next a déjà remplacé le message par sa phrase anglaise : on la
 * reconnaît et on rend `fallback`, une phrase écrite pour cet écran-là. En
 * développement le message d'origine passe, parce qu'il est utile à qui code.
 */
const NEXT_STRIPPED =
  /server components render|omitted in production|digest/i;

export function screenMessage(e: unknown, fallback: string): string {
  const raw = e instanceof Error ? e.message : typeof e === 'string' ? e : '';
  if (!raw) return fallback;
  if (isUserFacing(e)) return raw;
  if (NEXT_STRIPPED.test(raw)) return fallback;
  // Un message de base de données ne se montre pas non plus : il nomme des
  // tables et des contraintes, et ne dit rien au marchand.
  if (/PGRST\d+|duplicate key|violates |does not exist|null value in column/i.test(raw)) {
    return fallback;
  }
  return raw;
}
