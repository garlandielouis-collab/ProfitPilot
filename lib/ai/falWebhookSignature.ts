// ─────────────────────────────────────────────────────────────────────────────
// Signature des rappels fal.ai
//
// fal signe chaque rappel en ED25519 (documentation « Webhooks », section
// « Verifying webhook signatures ») :
//
//   - en-têtes `X-Fal-Webhook-Request-Id`, `X-Fal-Webhook-User-Id`,
//     `X-Fal-Webhook-Timestamp` (secondes epoch) et `X-Fal-Webhook-Signature`
//     (hexadécimal) ;
//   - message signé : request_id, user_id, timestamp et le SHA-256
//     hexadécimal du corps brut, joints par "\n", en UTF-8 ;
//   - clés publiques publiées en JWKS (`x` en base64url) ; la signature est
//     valide si l'UNE des clés la vérifie ;
//   - horodatage toléré à ± 5 minutes.
//
// ── Trois réponses, pas deux ────────────────────────────────────────────────
//
//   'valid'    une clé publiée par fal vérifie la signature.
//   'invalid'  vérification active, et le rappel ne passe pas : en-têtes
//              absents, horodatage hors tolérance, signature illisible, ou
//              aucune clé ne la vérifie. Le webhook l'ignore.
//   'disabled' non vérifiable : désactivée par configuration, ou clés JWKS
//              injoignables. On ne prend PAS un vrai rappel pour un faux parce
//              que fal ou le réseau a un raté — le jeton de l'URL,
//              l'identifiant et la réinterrogation du fournisseur continuent
//              de protéger, et un succès non vérifié n'est jamais livré sur la
//              foi du corps.
//
// ── Activation ──────────────────────────────────────────────────────────────
//
// `FAL_WEBHOOK_VERIFY=1`. Désactivée par défaut : si un détail du format
// diffère de la documentation, l'activer d'office ferait ignorer tous les
// rappels fal le jour du déploiement. On l'active après avoir vu passer, dans
// les journaux, un rappel réel accepté.
// ─────────────────────────────────────────────────────────────────────────────

import { createHash, createPublicKey, verify, type KeyObject } from 'node:crypto';

export type FalSignatureCheck = 'valid' | 'invalid' | 'disabled';

const JWKS_URL = 'https://rest.fal.ai/.well-known/jwks.json';

/** Durée de vie des clés en mémoire (recommandation de fal : 24 h au plus). */
const JWKS_TTL_MS = 24 * 60 * 60 * 1000;
/** Délai de récupération : le rappel attend, fal coupe à 15 s. */
const JWKS_FETCH_TIMEOUT_MS = 5_000;
/** Après un échec de récupération, on ne réessaie pas avant ce délai. */
const JWKS_RETRY_AFTER_FAILURE_MS = 60 * 1000;
/** Relecture forcée (rotation des clés) au plus une fois par intervalle. */
const JWKS_MIN_REFRESH_MS = 5 * 60 * 1000;

/** Écart toléré entre l'horodatage signé et notre horloge. Au-delà : rejeu. */
const SIGNATURE_TOLERANCE_S = 5 * 60;

/** Une signature ED25519 fait 64 octets, soit 128 caractères hexadécimaux. */
const SIGNATURE_HEX = /^[0-9a-fA-F]{128}$/;

type KeySet = { keys: KeyObject[]; fetchedAt: number };

let keySet: KeySet | null = null;
let lastFailureAt = 0;
let pending: Promise<KeySet | null> | null = null;

/** Un avertissement par instance, pas un par rappel. */
let warnedDisabled = false;

function verificationEnabled(): boolean {
  const flag = process.env.FAL_WEBHOOK_VERIFY?.trim().toLowerCase();
  return flag === '1' || flag === 'true';
}

/** Les clés ED25519 d'un JWKS. Une clé illisible est sautée, pas fatale. */
function parseJwks(body: unknown): KeyObject[] {
  const entries = (body as any)?.keys;
  if (!Array.isArray(entries)) return [];

  const keys: KeyObject[] = [];
  for (const entry of entries) {
    if (typeof entry?.x !== 'string') continue;
    if (entry.crv !== undefined && entry.crv !== 'Ed25519') continue;

    // fal publie `x` en base64url AVEC remplissage (« …zuY= »). Le décodeur
    // base64 de Node accepte les deux alphabets et le remplissage ; on
    // réencode en base64url strict pour l'import JWK.
    const raw = Buffer.from(entry.x, 'base64');
    if (raw.length !== 32) continue;

    try {
      keys.push(createPublicKey({
        key: { kty: 'OKP', crv: 'Ed25519', x: raw.toString('base64url') },
        format: 'jwk',
      }));
    } catch {
      // Clé refusée par OpenSSL : on passe à la suivante.
    }
  }
  return keys;
}

/**
 * Lit le JWKS de fal. `null` si la récupération échoue (journalisé), et pas
 * de nouvelle tentative pendant une minute : un JWKS en panne ne doit pas
 * coûter 5 s à chaque rappel. Une seule lecture en vol par instance.
 */
function fetchKeySet(): Promise<KeySet | null> {
  if (Date.now() - lastFailureAt < JWKS_RETRY_AFTER_FAILURE_MS) return Promise.resolve(null);
  if (!pending) {
    // `.finally` chaîné, et non un `finally` dans la fonction : il s'exécute
    // toujours après l'affectation, même si la lecture échoue d'emblée.
    pending = loadKeySet().finally(() => { pending = null; });
  }
  return pending;
}

async function loadKeySet(): Promise<KeySet | null> {
  try {
    const res = await fetch(JWKS_URL, {
      signal: AbortSignal.timeout(JWKS_FETCH_TIMEOUT_MS),
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const keys = parseJwks(await res.json());
    if (keys.length === 0) throw new Error('aucune clé ED25519 lisible');

    keySet = { keys, fetchedAt: Date.now() };
    return keySet;
  } catch (err) {
    lastFailureAt = Date.now();
    console.error(
      '[fal-signature] clés JWKS injoignables, signature non vérifiable :',
      err instanceof Error ? err.message : 'erreur inconnue',
    );
    return null;
  }
}

function matchesAny(keys: KeyObject[], message: Buffer, signature: Buffer): boolean {
  return keys.some((key) => {
    try {
      return verify(null, message, key, signature);
    } catch {
      return false;
    }
  });
}

/** Journal de diagnostic : l'étape seulement, jamais le corps ni les en-têtes. */
function rejected(step: string): 'invalid' {
  console.warn(`[fal-signature] vérification refusée : ${step}`);
  return 'invalid';
}

export async function verifyFalSignature(
  headers: Headers,
  rawBody: string,
): Promise<FalSignatureCheck> {
  if (!verificationEnabled()) {
    if (!warnedDisabled) {
      warnedDisabled = true;
      console.warn(
        '[fal-signature] FAL_WEBHOOK_VERIFY absente : la signature des rappels fal ' +
        "n'est pas vérifiée (restent le jeton, l'identifiant et la réinterrogation).",
      );
    }
    return 'disabled';
  }

  const requestId    = headers.get('x-fal-webhook-request-id');
  const userId       = headers.get('x-fal-webhook-user-id');
  const timestamp    = headers.get('x-fal-webhook-timestamp');
  const signatureHex = headers.get('x-fal-webhook-signature');
  if (!requestId || !userId || !timestamp || !signatureHex) {
    return rejected('en-têtes de signature absents');
  }

  const sentAt = /^\d+$/.test(timestamp) ? Number(timestamp) : NaN;
  if (!Number.isFinite(sentAt) || Math.abs(Date.now() / 1000 - sentAt) > SIGNATURE_TOLERANCE_S) {
    return rejected('horodatage illisible ou hors tolérance');
  }

  // `Buffer.from(…, 'hex')` s'arrête sans erreur au premier caractère non
  // hexadécimal : on valide la forme avant de décoder.
  if (!SIGNATURE_HEX.test(signatureHex)) {
    return rejected('signature illisible (hexadécimal de 64 octets attendu)');
  }
  const signature = Buffer.from(signatureHex, 'hex');

  // Le corps a été lu en texte : réencodé en UTF-8, ce sont les octets reçus
  // (un JSON est de l'UTF-8 valide ; sinon le condensat diffère et on refuse).
  const bodyHash = createHash('sha256').update(rawBody, 'utf8').digest('hex');
  const message  = Buffer.from([requestId, userId, timestamp, bodyHash].join('\n'), 'utf8');

  // Clés en cache, ou lues si absentes ou expirées. Si la relecture échoue,
  // des clés périmées valent mieux que rien : fal en change rarement.
  let current = keySet;
  if (!current || Date.now() - current.fetchedAt > JWKS_TTL_MS) {
    current = (await fetchKeySet()) ?? current;
  }
  if (!current) return 'disabled';

  if (matchesAny(current.keys, message, signature)) return 'valid';

  // Aucune clé ne vérifie. fal a peut-être changé de clés depuis la mise en
  // cache : une relecture, au plus une fois toutes les 5 minutes, pour ne pas
  // refuser un vrai rappel sur des clés d'hier.
  if (Date.now() - current.fetchedAt > JWKS_MIN_REFRESH_MS) {
    const fresh = await fetchKeySet();
    if (!fresh) return 'disabled';
    if (matchesAny(fresh.keys, message, signature)) return 'valid';
  }

  return rejected('aucune clé publiée ne vérifie la signature');
}
