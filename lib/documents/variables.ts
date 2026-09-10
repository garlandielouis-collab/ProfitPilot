// ─────────────────────────────────────────────────────────────────────────────
// Les variables d'un modèle — `{{company.name}}` & consorts (§21)
//
// Un modèle de contrat de travail dit « {{company.name}} engage
// {{employee.full_name}} ». À la création du document, ces deux marques sont
// remplacées par les vraies valeurs, lues dans les tables qui les portent déjà.
// Le §21 est explicite : ne rien redemander au marchand de ce que
// l'application sait.
//
// ── Trois règles, et elles se voient toutes à l'écran ───────────────────────
//
//   Variable INCONNUE      elle reste telle quelle, `{{employee.badge}}`.
//                          Un marqueur laissé visible se corrige ; un blanc
//                          silencieux se signe sans qu'on l'ait vu.
//   Variable VIDE          elle devient un trait à remplir, `____________`.
//                          C'est ce qu'un contrat imprimé attend d'une donnée
//                          manquante — pas le mot « null », pas un vide.
//   Valeur qui contient    elle n'est PAS re-substituée. Un client nommé
//   des accolades          « {{company.name}} » ne devient pas le nom du
//                          commerce : une seule passe, jamais de récursion.
//
// ── Ce que ce fichier ne fait pas ───────────────────────────────────────────
//
// Il ne lit aucune table. Il est pur, donc testable sans base : on lui donne un
// dictionnaire, il rend un texte. La lecture des sources vit dans
// `app/actions/documentTemplates.ts`, où le contexte d'entreprise existe.
// ─────────────────────────────────────────────────────────────────────────────

import type { Bilingual } from './types';

/** Le trait qu'on remplit à la main sur le papier imprimé. */
export const BLANK = '____________';

/**
 * `{{ groupe.clé }}` — deux segments, minuscules et tirets bas, espaces tolérés
 * autour. Volontairement strict : accepter n'importe quoi entre accolades
 * ferait passer pour une variable la moindre paire d'accolades d'un texte.
 */
const VARIABLE_RE = /\{\{\s*([a-z][a-z0-9_]*\.[a-z][a-z0-9_]*)\s*\}\}/g;

// ─────────────────────────────────────────────────────────────────────────────
// Le catalogue — ce que l'éditeur propose
// ─────────────────────────────────────────────────────────────────────────────

export type VariableScope = 'company' | 'customer' | 'employee' | 'supplier' | 'date';

export type VariableDefinition = {
  key:   string;
  scope: VariableScope;
  label: Bilingual;
};

export const VARIABLE_CATALOGUE: VariableDefinition[] = [
  { key: 'company.name',        scope: 'company',  label: { fr: 'Nom du commerce',        ht: 'Non komès la' } },
  { key: 'company.legal_name',  scope: 'company',  label: { fr: 'Raison sociale',         ht: 'Non legal' } },
  { key: 'company.address',     scope: 'company',  label: { fr: 'Adresse',                ht: 'Adrès' } },
  { key: 'company.city',        scope: 'company',  label: { fr: 'Ville',                  ht: 'Vil' } },
  { key: 'company.phone',       scope: 'company',  label: { fr: 'Téléphone',              ht: 'Telefòn' } },
  { key: 'company.email',       scope: 'company',  label: { fr: 'Courriel',               ht: 'Imèl' } },
  { key: 'company.tax_id',      scope: 'company',  label: { fr: 'NIF / numéro fiscal',    ht: 'NIF / nimewo taks' } },

  { key: 'customer.name',       scope: 'customer', label: { fr: 'Nom du client',          ht: 'Non kliyan an' } },
  { key: 'customer.phone',      scope: 'customer', label: { fr: 'Téléphone du client',    ht: 'Telefòn kliyan an' } },
  { key: 'customer.email',      scope: 'customer', label: { fr: 'Courriel du client',     ht: 'Imèl kliyan an' } },
  { key: 'customer.balance',    scope: 'customer', label: { fr: 'Solde dû par le client', ht: 'Kòb kliyan an dwe' } },

  { key: 'employee.full_name',  scope: 'employee', label: { fr: 'Nom de l’employé',       ht: 'Non anplwaye a' } },
  { key: 'employee.position',   scope: 'employee', label: { fr: 'Poste',                  ht: 'Pòs' } },
  { key: 'employee.phone',      scope: 'employee', label: { fr: 'Téléphone de l’employé', ht: 'Telefòn anplwaye a' } },
  { key: 'employee.hire_date',  scope: 'employee', label: { fr: 'Date d’embauche',        ht: 'Dat anbochaj' } },
  { key: 'employee.salary',     scope: 'employee', label: { fr: 'Salaire',                ht: 'Salè' } },

  { key: 'supplier.name',       scope: 'supplier', label: { fr: 'Nom du fournisseur',     ht: 'Non founisè a' } },
  { key: 'supplier.phone',      scope: 'supplier', label: { fr: 'Téléphone du fournisseur', ht: 'Telefòn founisè a' } },
  { key: 'supplier.email',      scope: 'supplier', label: { fr: 'Courriel du fournisseur', ht: 'Imèl founisè a' } },

  { key: 'date.today',          scope: 'date',     label: { fr: 'Date du jour',           ht: 'Dat jodi a' } },
  { key: 'date.year',           scope: 'date',     label: { fr: 'Année en cours',         ht: 'Ane a' } },
];

const CATALOGUE_KEYS = new Set(VARIABLE_CATALOGUE.map((v) => v.key));

/** Les portées qu'un modèle réclame — l'écran de création sait alors qu'il doit
 *  demander un employé, ou un client, avant de proposer « Créer ». */
export function scopesRequired(variables: string[]): VariableScope[] {
  const scopes = new Set<VariableScope>();
  for (const key of variables) {
    const definition = VARIABLE_CATALOGUE.find((v) => v.key === key);
    // `date` et `company` se résolvent seuls : ils ne demandent aucun choix.
    if (definition && definition.scope !== 'date' && definition.scope !== 'company') {
      scopes.add(definition.scope);
    }
  }
  return [...scopes];
}

export function isKnownVariable(key: string): boolean {
  return CATALOGUE_KEYS.has(key);
}

// ─────────────────────────────────────────────────────────────────────────────
// Substitution
// ─────────────────────────────────────────────────────────────────────────────

export type SubstitutionResult = {
  text: string;
  /** Les clés connues du catalogue mais sans valeur — devenues un trait. */
  blank: string[];
  /** Les clés que le catalogue ne connaît pas — laissées telles quelles. */
  unknown: string[];
};

/**
 * Une seule passe, par fonction de remplacement.
 *
 * `String.replace` avec une fonction n'interprète NI `$&` NI `$1` dans la
 * valeur rendue, et ne repasse pas sur ce qu'elle vient d'écrire. C'est ce qui
 * ferme les deux portes d'un coup : l'injection par motif de remplacement, et
 * la substitution en chaîne d'une valeur qui contiendrait elle-même `{{ }}`.
 */
export function substituteText(
  text: string,
  values: Record<string, string | null | undefined>,
): SubstitutionResult {
  const blank:   string[] = [];
  const unknown: string[] = [];

  const out = text.replace(VARIABLE_RE, (match, key: string) => {
    if (!CATALOGUE_KEYS.has(key)) {
      if (!unknown.includes(key)) unknown.push(key);
      return match;
    }
    const value = values[key];
    if (value === undefined || value === null || value.trim() === '') {
      if (!blank.includes(key)) blank.push(key);
      return BLANK;
    }
    return value;
  });

  return { text: out, blank, unknown };
}

/** Les variables présentes dans un texte, qu'elles soient connues ou non. */
export function collectVariables(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(VARIABLE_RE)) {
    const key = match[1];
    if (!found.includes(key)) found.push(key);
  }
  return found;
}
