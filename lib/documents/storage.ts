// ─────────────────────────────────────────────────────────────────────────────
// Le stockage des documents — chemins, noms de fichiers, et surtout : ce que le
// fichier EST vraiment.
//
// Module pur. Aucun client Supabase, aucun accès réseau, aucun `use server` :
// il se teste sans base de données, et c'est délibéré — c'est le module dont
// une faille coûte le plus cher.
//
// ── Le §10, mot pour mot ────────────────────────────────────────────────────
//
//   « Valider les types MIME côté serveur. Ne jamais faire confiance à
//     l'extension du fichier. »
//
// Ni à l'extension, ni au `Content-Type` que le navigateur déclare : les deux
// sont écrits par le client, donc les deux se falsifient. La seule chose qui ne
// se falsifie pas sans effort, ce sont les premiers octets du fichier. On les
// lit, et c'est eux qui décident.
// ─────────────────────────────────────────────────────────────────────────────

/** Les types acceptés. Doit rester identique à `allowed_mime_types` du bucket. */
export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',   // .docx
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',         // .xlsx
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
  'application/msword',      // .doc
  'application/vnd.ms-excel',// .xls
  'text/csv',
  'text/plain',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
] as const;

export type AllowedMime = (typeof ALLOWED_MIME_TYPES)[number];

const OOXML: readonly string[] = [
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
];

const OLE2: readonly string[] = ['application/msword', 'application/vnd.ms-excel'];

const PLAIN_TEXT: readonly string[] = ['text/csv', 'text/plain'];

/** Extension canonique par type — sert à nommer, jamais à décider. */
export const EXTENSION_BY_MIME: Record<AllowedMime, string> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/msword': 'doc',
  'application/vnd.ms-excel': 'xls',
  'text/csv': 'csv',
  'text/plain': 'txt',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
};

// ─────────────────────────────────────────────────────────────────────────────
// Reconnaissance du conteneur
// ─────────────────────────────────────────────────────────────────────────────

/**
 * La famille de conteneur, lue dans les octets.
 *
 * `ooxml` et `ole2` ne disent pas encore SI c'est un document ou un tableur :
 * les deux formats partagent leur enveloppe. C'est le seul endroit où la
 * déclaration du client est consultée — et seulement pour choisir parmi les
 * trois ou deux types que l'enveloppe autorise, jamais pour en sortir.
 */
export type Container =
  | 'pdf' | 'png' | 'jpeg' | 'webp' | 'heic'
  | 'ooxml' | 'ole2' | 'zip' | 'text' | null;

const startsWith = (b: Uint8Array, sig: readonly number[], offset = 0): boolean => {
  if (b.length < offset + sig.length) return false;
  for (let i = 0; i < sig.length; i++) if (b[offset + i] !== sig[i]) return false;
  return true;
};

const ascii = (b: Uint8Array, offset: number, length: number): string => {
  if (b.length < offset + length) return '';
  let s = '';
  for (let i = 0; i < length; i++) s += String.fromCharCode(b[offset + i]);
  return s;
};

/**
 * Un flux ZIP est-il un fichier Office ?
 *
 * Les OOXML sont des ZIP dont la première entrée est `[Content_Types].xml`. On
 * lit le nom de cette première entrée dans l'en-tête local : longueur sur deux
 * octets à l'offset 26 (petit-boutiste), nom à partir de l'offset 30.
 *
 * Sans cette vérification, n'importe quelle archive renommée `.docx` passerait —
 * et « c'est un ZIP » n'est pas une réponse suffisante quand on s'apprête à
 * ranger le fichier parmi les contrats d'une entreprise.
 */
function isOoxml(b: Uint8Array): boolean {
  if (b.length < 32) return false;
  const nameLength = b[26] | (b[27] << 8);
  if (nameLength <= 0 || nameLength > 256) return false;
  const name = ascii(b, 30, nameLength);
  return name === '[Content_Types].xml'
      || name.startsWith('word/') || name.startsWith('xl/') || name.startsWith('ppt/')
      || name.startsWith('_rels/');
}

/**
 * Le contenu ressemble-t-il à du texte ?
 *
 * Deux tests, dans cet ordre : aucun octet nul (le marqueur le plus fiable d'un
 * binaire), puis un décodage UTF-8 strict. Les deux sur les premiers kilo-octets
 * seulement — lire un CSV de vingt mégaoctets en entier pour répondre à cette
 * question serait absurde.
 *
 * Le décodage strict peut échouer à tort si la coupure tombe au milieu d'un
 * caractère multi-octets ; on retire donc jusqu'à trois octets de queue avant
 * de conclure.
 */
function looksLikeText(b: Uint8Array): boolean {
  const head = b.subarray(0, Math.min(b.length, 8192));
  for (let i = 0; i < head.length; i++) if (head[i] === 0x00) return false;

  for (let trim = 0; trim <= 3; trim++) {
    const slice = head.subarray(0, head.length - trim);
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(slice);
      return true;
    } catch {
      // caractère coupé en fin de tranche : on raccourcit et on réessaie
    }
  }
  return false;
}

/** La famille de conteneur, d'après les octets seuls. */
export function sniffContainer(bytes: Uint8Array): Container {
  if (bytes.length === 0) return null;

  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) return 'pdf';                       // %PDF
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return 'webp';

  if (ascii(bytes, 4, 4) === 'ftyp') {
    const brand = ascii(bytes, 8, 4);
    if (['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(brand)) return 'heic';
  }

  // OLE2 — les vieux .doc / .xls
  if (startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return 'ole2';

  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) return isOoxml(bytes) ? 'ooxml' : 'zip';
  // Archive vide ou segmentée : c'est un ZIP, jamais un document.
  if (startsWith(bytes, [0x50, 0x4b, 0x05, 0x06]) || startsWith(bytes, [0x50, 0x4b, 0x07, 0x08])) return 'zip';

  return looksLikeText(bytes) ? 'text' : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// La décision
// ─────────────────────────────────────────────────────────────────────────────

export type MimeVerdict =
  | { ok: true;  mime: AllowedMime; container: Container }
  | { ok: false; reason: string };

/**
 * Le type retenu pour un fichier déposé.
 *
 * Quand les octets tranchent (PDF, images), ils l'emportent sur la déclaration
 * du client — un PDF renommé `.jpg` est rangé comme un PDF, pas rejeté : le
 * marchand n'a pas à payer pour une extension fausse tant que le contenu, lui,
 * est légitime.
 *
 * Quand l'enveloppe est partagée (OOXML, OLE2), la déclaration sert d'arbitre
 * ENTRE les types que cette enveloppe autorise — jamais à en sortir.
 *
 * Quand rien ne tranche, le fichier n'entre pas.
 */
export function resolveUploadMime(input: {
  bytes: Uint8Array;
  declaredMime?: string | null;
}): MimeVerdict {
  const declared = (input.declaredMime ?? '').split(';')[0].trim().toLowerCase();
  const container = sniffContainer(input.bytes);

  switch (container) {
    case 'pdf':  return { ok: true, mime: 'application/pdf', container };
    case 'png':  return { ok: true, mime: 'image/png',  container };
    case 'jpeg': return { ok: true, mime: 'image/jpeg', container };
    case 'webp': return { ok: true, mime: 'image/webp', container };
    case 'heic': return { ok: true, mime: 'image/heic', container };

    case 'ooxml':
      if (OOXML.includes(declared)) return { ok: true, mime: declared as AllowedMime, container };
      return {
        ok: false,
        reason: "Ce fichier est bien un document Office, mais son type annoncé ne correspond pas. Renvoyez-le depuis Word, Excel ou PowerPoint.",
      };

    case 'ole2':
      if (OLE2.includes(declared)) return { ok: true, mime: declared as AllowedMime, container };
      return {
        ok: false,
        reason: "Ce fichier est un ancien document Office non identifiable. Enregistrez-le au format .docx ou .xlsx et réessayez.",
      };

    case 'zip':
      return {
        ok: false,
        reason: "Les archives compressées ne sont pas acceptées. Déposez les documents un par un.",
      };

    case 'text':
      if (PLAIN_TEXT.includes(declared)) return { ok: true, mime: declared as AllowedMime, container };
      // Du texte annoncé autrement : on le range en texte brut plutôt que de le
      // refuser. Le contenu est lisible, c'est ce qui compte.
      return { ok: true, mime: 'text/plain', container };

    default:
      return {
        ok: false,
        reason: "Format non reconnu. Acceptés : PDF, Word, Excel, PowerPoint, CSV, texte, et images (JPG, PNG, WebP, HEIC).",
      };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Noms de fichiers et chemins
// ─────────────────────────────────────────────────────────────────────────────

const MAX_BASENAME = 100;

/**
 * Un nom de fichier sûr, qui reste lisible.
 *
 * On ne remplace pas tout par un identifiant : le marchand qui télécharge
 * « Licence 2027.pdf » doit retrouver ce nom-là, pas `a3f9c1.pdf`. Mais on
 * retire tout ce qui pourrait sortir du dossier ou casser un en-tête HTTP.
 *
 * Les accents sont conservés — Supabase Storage les accepte, et « Déclaration
 * fiscale » sans accents est un nom abîmé.
 */
export function sanitizeFilename(raw: string): string {
  const normalized = (raw ?? '').normalize('NFC');

  // Ne garder que le dernier segment : « ../../etc/passwd » devient « passwd ».
  const lastSegment = normalized.split(/[/\\]/).pop() ?? '';

  const dot = lastSegment.lastIndexOf('.');
  let base = dot > 0 ? lastSegment.slice(0, dot) : lastSegment;
  let ext  = dot > 0 ? lastSegment.slice(dot + 1) : '';

  const clean = (s: string) =>
    Array.from(s)
      // caractères de contrôle, guillemets et réservés d'en-tête HTTP
      .filter((ch) => ch.codePointAt(0)! > 0x1f && !'"\\/:*?<>|'.includes(ch))
      .join('')
      .replace(/\s+/g, ' ')
      .trim();

  base = clean(base).replace(/^\.+/, '').slice(0, MAX_BASENAME).trim();
  ext  = clean(ext).replace(/[^A-Za-z0-9]/g, '').slice(0, 12).toLowerCase();

  if (!base) base = 'document';
  return ext ? `${base}.${ext}` : base;
}

/** Le nom final, avec l'extension du type RÉEL du fichier. */
export function filenameForMime(raw: string, mime: AllowedMime): string {
  const safe = sanitizeFilename(raw);
  const want = EXTENSION_BY_MIME[mime];
  const dot  = safe.lastIndexOf('.');
  const base = dot > 0 ? safe.slice(0, dot) : safe;
  const has  = dot > 0 ? safe.slice(dot + 1).toLowerCase() : '';

  // `.jpg` et `.jpeg` désignent la même chose : ne pas renommer pour rien.
  const equivalent = (a: string, b: string) =>
    a === b || (a === 'jpg' && b === 'jpeg') || (a === 'jpeg' && b === 'jpg');

  return equivalent(has, want) ? safe : `${base}.${want}`;
}

/**
 * Le chemin dans le bucket.
 *
 *   <business_id>/<document_id>/<version>/<nom>
 *
 * Le `business_id` en PREMIER segment n'est pas une convention de rangement :
 * c'est ce que lit `storage.foldername(name)[1]` dans la politique RLS du
 * bucket. Déplacer ce segment ouvrirait le stockage de toutes les entreprises.
 */
export function buildStoragePath(input: {
  businessId: string;
  documentId: string;
  version: number;
  filename: string;
  mime: AllowedMime;
}): string {
  const version = Math.max(1, Math.trunc(input.version));
  return [
    input.businessId,
    input.documentId,
    `v${version}`,
    filenameForMime(input.filename, input.mime),
  ].join('/');
}

/** Taille lisible — « 2,4 Mo ». Sert aux messages d'erreur et aux fiches. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} o`;
  const units = ['Ko', 'Mo', 'Go'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; }
  return `${value.toFixed(value < 10 ? 1 : 0).replace('.', ',')} ${units[unit]}`;
}
