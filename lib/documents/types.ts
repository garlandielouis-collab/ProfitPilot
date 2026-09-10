// ─────────────────────────────────────────────────────────────────────────────
// Le vocabulaire du centre documentaire
//
// Module pur : aucun accès réseau, aucun client Supabase, aucun `use server`.
// Il se lit depuis un composant client comme depuis une action serveur, et il
// se teste sans base de données.
//
// ── Ce que ce fichier N'EST PAS ─────────────────────────────────────────────
//
// Ce n'est pas le catalogue des types de documents. Celui-là vit en base
// (`document_types`), parce qu'il est bilingue, qu'il s'étend, et qu'une faute
// de frappe dans un libellé ne doit pas demander un redéploiement. Ici ne
// vivent que les AXES : les six catégories, les sept statuts, les trois
// visibilités, les quatre sensibilités. Des choses qui changent une fois par an,
// pas une fois par semaine.
// ─────────────────────────────────────────────────────────────────────────────

import type { Permission, Role } from '../rbac';

/** Un texte affiché au marchand, dans ses deux langues — `t({ fr, ht })`. */
export type Bilingual = { fr: string; ht: string };

/** Le bucket privé du centre documentaire. Jamais public, jamais en lecture directe. */
export const DOCUMENTS_BUCKET = 'business-documents' as const;

/** Plafond de taille par fichier, aligné sur `storage.buckets.file_size_limit`. */
export const DOCUMENT_MAX_BYTES = 25 * 1024 * 1024;

// ─────────────────────────────────────────────────────────────────────────────
// Catégorie — le rangement dans l'interface (§3)
// ─────────────────────────────────────────────────────────────────────────────

export type DocumentCategory =
  | 'strategy' | 'finance' | 'operations' | 'sales_legal' | 'hr' | 'compliance';

/** L'ordre d'affichage. Il n'est pas alphabétique, il est narratif : où va
 *  l'entreprise, ce qu'elle gagne, comment elle tourne, ce qu'elle signe, qui
 *  la fait tourner, ce que la loi lui demande. */
export const CATEGORY_ORDER: DocumentCategory[] = [
  'strategy', 'finance', 'operations', 'sales_legal', 'hr', 'compliance',
];

export const CATEGORY_LABELS: Record<DocumentCategory, Bilingual> = {
  strategy:    { fr: 'Stratégie',        ht: 'Estrateji' },
  finance:     { fr: 'Finance',          ht: 'Finans' },
  operations:  { fr: 'Opérations',       ht: 'Operasyon' },
  sales_legal: { fr: 'Ventes et contrats', ht: 'Vant ak kontra' },
  hr:          { fr: 'Personnel',        ht: 'Pèsonèl' },
  compliance:  { fr: 'Conformité',       ht: 'Konfòmite' },
};

// ─────────────────────────────────────────────────────────────────────────────
// Statut — le cycle de vie (§9)
// ─────────────────────────────────────────────────────────────────────────────

export type DocumentStatus =
  | 'draft' | 'active' | 'pending_review' | 'approved'
  | 'expired' | 'archived' | 'needs_update';

export const STATUS_LABELS: Record<DocumentStatus, Bilingual> = {
  draft:          { fr: 'Brouillon',      ht: 'Bouyon' },
  active:         { fr: 'Actif',          ht: 'Aktif' },
  pending_review: { fr: 'À relire',       ht: 'Pou reli' },
  approved:       { fr: 'Approuvé',       ht: 'Apwouve' },
  expired:        { fr: 'Expiré',         ht: 'Ekspire' },
  archived:       { fr: 'Archivé',        ht: 'Achive' },
  needs_update:   { fr: 'À mettre à jour', ht: 'Pou mete ajou' },
};

/** La tonalité du badge — les tons du design system, pas des couleurs libres. */
export const STATUS_TONE: Record<DocumentStatus, 'neutral' | 'positive' | 'warning' | 'danger'> = {
  draft:          'neutral',
  active:         'positive',
  pending_review: 'warning',
  approved:       'positive',
  expired:        'danger',
  archived:       'neutral',
  needs_update:   'warning',
};

/**
 * Le §9 liste un huitième statut, « Missing ». Il n'est PAS dans cette union,
 * et c'est délibéré : un document manquant n'a pas de ligne dans `documents` —
 * il n'existe pas. Lui donner un statut obligerait à créer des lignes fantômes
 * pour représenter une absence, et le premier écran qui compterait les
 * documents mentirait. Le manque se calcule en comparant le catalogue exigé
 * (`document_requirements`) à ce qui existe. C'est le rôle du score de santé,
 * pas celui d'un statut.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Visibilité — qui, nommément (§42)
// ─────────────────────────────────────────────────────────────────────────────

export type DocumentVisibility = 'company' | 'restricted' | 'private';

export const VISIBILITY_LABELS: Record<DocumentVisibility, Bilingual> = {
  company:    { fr: "Toute l'entreprise", ht: 'Tout antrepriz la' },
  restricted: { fr: 'Personnes choisies', ht: 'Moun ou chwazi' },
  private:    { fr: 'Vous seul',          ht: 'Ou menm sèlman' },
};

// ─────────────────────────────────────────────────────────────────────────────
// Sensibilité — qui, par son rôle (§41)
// ─────────────────────────────────────────────────────────────────────────────

export type DocumentSensitivity = 'general' | 'financial' | 'hr' | 'legal';

export const SENSITIVITY_LABELS: Record<DocumentSensitivity, Bilingual> = {
  general:   { fr: 'Général',    ht: 'Jeneral' },
  financial: { fr: 'Financier',  ht: 'Finansye' },
  hr:        { fr: 'Personnel',  ht: 'Pèsonèl' },
  legal:     { fr: 'Juridique',  ht: 'Jiridik' },
};

/**
 * La permission de lecture qu'exige chaque sensibilité.
 *
 * ⚠️ CE BLOC EST LE JUMEAU DE `can_read_document()` (20260911_document_center_
 * foundation.sql, § 4). Les deux décrivent la même règle dans deux langages :
 * celui-ci masque l'interface, celui-là refuse la ligne. Si l'un change et pas
 * l'autre, l'écran proposera un document que la base refusera — ou pire,
 * l'inverse.
 *
 * Le gating côté client reste cosmétique. C'est la politique RLS qui protège.
 */
export const READ_PERMISSION_BY_SENSITIVITY: Record<DocumentSensitivity, Permission> = {
  general:   'documents:read',
  financial: 'documents:read_financial',
  hr:        'documents:read_hr',
  legal:     'documents:read_legal',
};

/**
 * Les rôles auxquels chaque sensibilité est ouverte, hors partage nominatif.
 * `owner` passe partout et n'est donc listé nulle part — c'est son entreprise.
 *
 * Même avertissement que ci-dessus : miroir de `can_read_document()`.
 */
export const ROLES_BY_SENSITIVITY: Record<DocumentSensitivity, readonly Role[]> = {
  general:   ['admin', 'manager', 'accountant', 'cashier', 'inventory_manager', 'employee', 'viewer'],
  financial: ['admin', 'accountant'],
  hr:        ['admin'],
  legal:     ['admin', 'manager'],
};

// ─────────────────────────────────────────────────────────────────────────────
// Les contrats (§31, §32)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * « Contrat » n'est pas un statut : c'est une famille de types.
 *
 * L'écran des contrats et l'action qui les lit doivent parler de la MÊME
 * liste. Écrite deux fois, elle diverge le jour où l'on ajoute un type — et
 * l'écran affiche alors une liste dont le compte annoncé ailleurs ne tombe
 * plus juste.
 */
export const CONTRACT_TYPE_KEYS = [
  'contract',
  'partnership_agreement',
  'service_agreement',
  'supplier_agreement',
  'employment_agreement',
  'terms_conditions',
] as const;

export type ContractTypeKey = (typeof CONTRACT_TYPE_KEYS)[number];

// ─────────────────────────────────────────────────────────────────────────────
// À quoi un document se rattache (§36, §37)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Le vocabulaire de CE module, pas celui des tables visées.
 *
 * La contrainte `CHECK` de `document_links.entity_type` porte exactement ces
 * onze valeurs. Le module commerce écrit `orders` au pluriel et `sales`
 * capitalise son énumération ; la traduction se fait à l'insertion, une fois,
 * et cette union est ce qui empêche une faute de frappe d'arriver jusqu'à la
 * base — où elle ne serait qu'un `23514` sans nom de colonne.
 */
export const DOCUMENT_ENTITY_TYPES = [
  'business', 'employee', 'customer', 'supplier', 'product',
  'order', 'sale', 'purchase', 'expense', 'contract', 'transaction',
] as const;

export type DocumentEntityType = (typeof DOCUMENT_ENTITY_TYPES)[number];

/**
 * À quel titre le document est rattaché.
 *
 * « attached » couvre la quasi-totalité des cas et reste le défaut. Les quatre
 * autres ne servent que lorsque le rôle du document CHANGE son affichage — un
 * contrat « signé par » l'employé ne se lit pas comme une pièce jointe.
 */
export type DocumentRelation =
  | 'attached' | 'signed_by' | 'issued_to' | 'received_from' | 'concerns';

// ─────────────────────────────────────────────────────────────────────────────
// La ligne du catalogue, telle qu'elle revient de la base
// ─────────────────────────────────────────────────────────────────────────────

export type DocumentType = {
  id:                 string;
  /** NULL côté base : type du catalogue global, livré avec le produit. */
  businessId:         string | null;
  key:                string;
  category:           DocumentCategory;
  labelFr:            string;
  labelHt:            string;
  sensitivity:        DocumentSensitivity;
  requiresExpiration: boolean;
  /** Généré depuis les données ProfitPilot plutôt que téléversé (§28, §29). */
  isDynamic:          boolean;
  defaultVisibility:  DocumentVisibility;
  sortOrder:          number;
};

/** Le libellé d'un type, dans la langue courante. */
export function typeLabel(type: DocumentType): Bilingual {
  return { fr: type.labelFr, ht: type.labelHt };
}

// ─────────────────────────────────────────────────────────────────────────────
// Expiration — les seuils du §34
// ─────────────────────────────────────────────────────────────────────────────

/** Les échéances auxquelles le marchand est prévenu, en jours. */
export const REMINDER_OFFSETS_DAYS = [30, 15, 7, 1] as const;

export type ExpirationState = 'none' | 'valid' | 'expiring_soon' | 'expired';

/**
 * Le fuseau du commerce. Il ne sert QU'À une chose : décider quel jour on est.
 *
 * Nommé ici et nulle part ailleurs, parce que la même décision est prise à
 * trois endroits — l'interface, le cron d'expiration, le score de santé — et
 * que trois réponses différentes à « quel jour sommes-nous ? » produiraient
 * trois comptes de jours restants sur le même document.
 *
 * Un nom de fuseau et non un décalage fixe : Haïti observe l'heure d'été, et
 * '-05:00' serait faux la moitié de l'année.
 */
export const BUSINESS_TIME_ZONE = 'America/Port-au-Prince';

/**
 * Le jour courant dans le fuseau du commerce, en `YYYY-MM-DD`.
 *
 * `en-CA` est le seul repère de langue qui formate nativement dans cet ordre ;
 * c'est le moyen le plus court d'obtenir une date calendaire correcte sans
 * dépendre du fuseau de la machine qui exécute le code — un serveur Vercel en
 * UTC et un téléphone à Port-au-Prince doivent tomber d'accord.
 */
export function todayISO(now: Date = new Date(), timeZone: string = BUSINESS_TIME_ZONE): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

/**
 * Une date calendaire `YYYY-MM-DD` → son numéro de jour depuis l'époque.
 *
 * On lit les trois nombres nous-mêmes plutôt que de passer par `new Date(iso)`.
 * `new Date('2027-12-14')` est interprété en UTC, `new Date('2027-12-14
 * 00:00')` en heure locale : deux résultats pour la même chaîne selon
 * l'écriture. En découpant, il n'y a plus d'instant du tout — donc plus de
 * fuseau, donc plus rien à se tromper.
 */
function toEpochDay(isoDate: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.slice(0, 10));
  if (!m) return null;
  const day = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(day) ? null : Math.round(day / 86_400_000);
}

/**
 * Jours restants avant expiration. Négatif si dépassé, `null` si pas de date.
 *
 * Prend `documents.expires_on` (DATE), pas `expires_at` (TIMESTAMPTZ, déprécié).
 * `today` est un paramètre : sans lui, le test dépendrait du jour où on le lance.
 */
export function daysUntilExpiration(
  expiresOn: string | null | undefined,
  today: string = todayISO(),
): number | null {
  if (!expiresOn) return null;
  const due = toEpochDay(expiresOn);
  const ref = toEpochDay(today);
  if (due === null || ref === null) return null;
  return due - ref;
}

/** L'état d'expiration d'un document. Fonction pure, testable sans base. */
export function expirationState(
  expiresOn: string | null | undefined,
  today: string = todayISO(),
): ExpirationState {
  const daysLeft = daysUntilExpiration(expiresOn, today);
  if (daysLeft === null) return 'none';

  // Un permis qui expire aujourd'hui est encore valable aujourd'hui : c'est le
  // lendemain qu'il ne l'est plus.
  if (daysLeft < 0) return 'expired';
  if (daysLeft <= REMINDER_OFFSETS_DAYS[0]) return 'expiring_soon';
  return 'valid';
}

// ─────────────────────────────────────────────────────────────────────────────
// Confiance de l'IA (§61)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * En dessous de ce seuil, une extraction est proposée mais jamais appliquée :
 * elle s'affiche « à vérifier » et attend un clic. Aucun rappel n'est créé,
 * aucune date n'est écrite, aucun document n'est classé automatiquement.
 *
 * 0,85 et non 0,95 : trop haut, tout devient manuel et l'extraction ne sert à
 * rien ; trop bas, une date fausse entre en base et le §83 est violé. Ce seuil
 * se règlera à l'usage, sur des documents haïtiens réels — d'où une constante
 * nommée plutôt qu'un nombre semé dans le code.
 */
export const AI_CONFIDENCE_THRESHOLD = 0.85;

/** `true` si l'extraction peut être appliquée sans confirmation humaine. */
export function isConfident(confidence: number | null | undefined): boolean {
  return typeof confidence === 'number' && confidence >= AI_CONFIDENCE_THRESHOLD;
}
