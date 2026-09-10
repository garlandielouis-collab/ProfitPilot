// ─────────────────────────────────────────────────────────────────────────────
// Le corps d'un document écrit dans l'application (§20)
//
// ── Pourquoi une liste de blocs et pas du HTML ──────────────────────────────
//
// Le §20 demande un éditeur de documents, pas un traitement de texte. Trois
// raisons, dans l'ordre où elles comptent :
//
//   1. Sécurité — du HTML libre stocké en base, c'est tout ce qu'un navigateur
//      accepte qui entre dans la base, balises de script comprises. Un bloc
//      typé ne porte que du texte, et le rendu décide seul de ses balises.
//   2. Rendu — le même document doit sortir à l'écran, à l'impression, en
//      texte brut pour la recherche. Un arbre de blocs se rend trois fois ;
//      du HTML collé depuis Word ne se rend bien nulle part.
//   3. Relecture — dans six mois, `{"type":"signature"}` dit ce que l'auteur
//      voulait. `<div class="sig">` ne dit rien.
//
// ── Deux formes du même bloc ────────────────────────────────────────────────
//
//   `Block`       les textes sont bilingues — c'est la forme des MODÈLES.
//   `PlainBlock`  les textes sont résolus — c'est la forme d'un DOCUMENT.
//
// Un document réel est écrit dans UNE langue : un contrat de travail n'est pas
// bilingue, il est en français ou en créole. Le choix se fait une fois, à la
// création depuis le modèle, et `localizeBlocks()` est le passage de l'un à
// l'autre. C'est aussi ce qui évite un éditeur à deux colonnes où le marchand
// devrait tout écrire deux fois.
// ─────────────────────────────────────────────────────────────────────────────

import type { Bilingual } from './types';

export type BlockLanguage = 'fr' | 'ht';

/** Un texte de bloc : bilingue dans un modèle, résolu dans un document. */
export type BlockText = string | Bilingual;

/**
 * Les huit blocs. La liste est volontairement courte : chaque bloc ajouté est
 * un bloc à rendre à l'écran, à l'impression, en texte, et à éditer. Un
 * document de commerce se dit avec ceux-ci.
 */
export type BlockOf<T> =
  | { type: 'heading';   level?: 1 | 2 | 3; text: T }
  | { type: 'paragraph'; text: T }
  | { type: 'list';      ordered?: boolean; items: T[] }
  | { type: 'fields';    items: Array<{ label: T; value: T }> }
  | { type: 'table';     columns: T[]; rows: T[][] }
  | { type: 'notice';    text: T }
  | { type: 'signature'; parties: T[] }
  | { type: 'spacer' };

export type Block      = BlockOf<BlockText>;
export type PlainBlock = BlockOf<string>;

export type BlockType = Block['type'];

export const BLOCK_TYPES: BlockType[] = [
  'heading', 'paragraph', 'list', 'fields', 'table', 'notice', 'signature', 'spacer',
];

export const BLOCK_LABELS: Record<BlockType, Bilingual> = {
  heading:   { fr: 'Titre',        ht: 'Tit' },
  paragraph: { fr: 'Paragraphe',   ht: 'Paragraf' },
  list:      { fr: 'Liste',        ht: 'Lis' },
  fields:    { fr: 'Informations', ht: 'Enfòmasyon' },
  table:     { fr: 'Tableau',      ht: 'Tablo' },
  notice:    { fr: 'Encadré',      ht: 'Nòt enpòtan' },
  signature: { fr: 'Signatures',   ht: 'Siyati' },
  spacer:    { fr: 'Espace',       ht: 'Espas' },
};

// ─────────────────────────────────────────────────────────────────────────────
// Lecture — ce qui vient de la base n'est pas de confiance
// ─────────────────────────────────────────────────────────────────────────────

function isBilingual(value: unknown): value is Bilingual {
  return typeof value === 'object' && value !== null
    && typeof (value as Bilingual).fr === 'string'
    && typeof (value as Bilingual).ht === 'string';
}

function asText(value: unknown): BlockText | null {
  if (typeof value === 'string') return value;
  if (isBilingual(value)) return value;
  return null;
}

function asTextList(value: unknown): BlockText[] {
  if (!Array.isArray(value)) return [];
  return value.map(asText).filter((t): t is BlockText => t !== null);
}

/**
 * Valide une colonne JSONB et rend des blocs sûrs.
 *
 * Tout ce qui ne se comprend pas est **écarté**, pas corrigé : un bloc à moitié
 * lu s'afficherait à moitié, et un document à moitié affiché est pire qu'un
 * document dont il manque un paragraphe visiblement. La validation vit ici, et
 * pas dans une contrainte SQL, parce qu'ajouter un type de bloc ne doit pas
 * demander une migration.
 */
export function parseBlocks(value: unknown): Block[] {
  if (!Array.isArray(value)) return [];

  const blocks: Block[] = [];

  for (const raw of value) {
    if (typeof raw !== 'object' || raw === null) continue;
    const b = raw as Record<string, unknown>;

    switch (b.type) {
      case 'heading': {
        const text = asText(b.text);
        if (!text) break;
        const level = b.level === 1 || b.level === 2 || b.level === 3 ? b.level : 2;
        blocks.push({ type: 'heading', level, text });
        break;
      }
      case 'paragraph':
      case 'notice': {
        const text = asText(b.text);
        if (!text) break;
        blocks.push({ type: b.type, text });
        break;
      }
      case 'list': {
        const items = asTextList(b.items);
        if (items.length === 0) break;
        blocks.push({ type: 'list', ordered: b.ordered === true, items });
        break;
      }
      case 'signature': {
        const parties = asTextList(b.parties);
        if (parties.length === 0) break;
        blocks.push({ type: 'signature', parties });
        break;
      }
      case 'fields': {
        if (!Array.isArray(b.items)) break;
        const items = b.items
          .map((entry) => {
            if (typeof entry !== 'object' || entry === null) return null;
            const label = asText((entry as Record<string, unknown>).label);
            const value = asText((entry as Record<string, unknown>).value);
            return label && value !== null ? { label, value } : null;
          })
          .filter((e): e is { label: BlockText; value: BlockText } => e !== null);
        if (items.length === 0) break;
        blocks.push({ type: 'fields', items });
        break;
      }
      case 'table': {
        const columns = asTextList(b.columns);
        if (columns.length === 0) break;
        const rows = Array.isArray(b.rows)
          ? b.rows.map((row) => asTextList(row)).filter((row) => row.length > 0)
          : [];
        blocks.push({ type: 'table', columns, rows });
        break;
      }
      case 'spacer':
        blocks.push({ type: 'spacer' });
        break;
      default:
        break;
    }
  }

  return blocks;
}

// ─────────────────────────────────────────────────────────────────────────────
// Bilingue → une langue
// ─────────────────────────────────────────────────────────────────────────────

function pick(text: BlockText, language: BlockLanguage): string {
  if (typeof text === 'string') return text;
  // Un modèle dont la traduction créole manque rend le français plutôt qu'un
  // vide : un document à trous est inutilisable, un document dans l'autre
  // langue se corrige.
  return (language === 'ht' ? text.ht : text.fr) || text.fr || text.ht || '';
}

export function localizeBlocks(blocks: Block[], language: BlockLanguage): PlainBlock[] {
  return blocks.map((block): PlainBlock => {
    switch (block.type) {
      case 'heading':
        return { type: 'heading', level: block.level, text: pick(block.text, language) };
      case 'paragraph':
      case 'notice':
        return { type: block.type, text: pick(block.text, language) };
      case 'list':
        return { type: 'list', ordered: block.ordered, items: block.items.map((i) => pick(i, language)) };
      case 'signature':
        return { type: 'signature', parties: block.parties.map((p) => pick(p, language)) };
      case 'fields':
        return {
          type: 'fields',
          items: block.items.map((i) => ({ label: pick(i.label, language), value: pick(i.value, language) })),
        };
      case 'table':
        return {
          type: 'table',
          columns: block.columns.map((c) => pick(c, language)),
          rows: block.rows.map((row) => row.map((cell) => pick(cell, language))),
        };
      case 'spacer':
        return { type: 'spacer' };
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Parcours — une seule fonction, trois usages
// ─────────────────────────────────────────────────────────────────────────────

/** Tous les textes d'un bloc, à plat. Sert à chercher, à compter, à substituer. */
export function blockTexts(block: PlainBlock): string[] {
  switch (block.type) {
    case 'heading':
    case 'paragraph':
    case 'notice':    return [block.text];
    case 'list':      return block.items;
    case 'signature': return block.parties;
    case 'fields':    return block.items.flatMap((i) => [i.label, i.value]);
    case 'table':     return [...block.columns, ...block.rows.flat()];
    case 'spacer':    return [];
  }
}

/** Applique une transformation à chaque texte, en gardant la forme du bloc. */
export function mapBlockTexts(block: PlainBlock, fn: (text: string) => string): PlainBlock {
  switch (block.type) {
    case 'heading':   return { ...block, text: fn(block.text) };
    case 'paragraph':
    case 'notice':    return { ...block, text: fn(block.text) };
    case 'list':      return { ...block, items: block.items.map(fn) };
    case 'signature': return { ...block, parties: block.parties.map(fn) };
    case 'fields':    return { ...block, items: block.items.map((i) => ({ label: fn(i.label), value: fn(i.value) })) };
    case 'table':     return { ...block, columns: block.columns.map(fn), rows: block.rows.map((r) => r.map(fn)) };
    case 'spacer':    return block;
  }
}

/**
 * Le document en texte brut.
 *
 * Sert à deux choses : l'aperçu d'une ligne de bibliothèque, et l'indexation
 * pour la recherche (§16) — `documents.search_vector` ne sait pas lire du
 * JSONB, il lui faut du texte.
 */
export function blocksToPlainText(blocks: PlainBlock[]): string {
  return blocks
    .map((block) => {
      if (block.type === 'spacer') return '';
      if (block.type === 'fields') {
        return block.items.map((i) => `${i.label} : ${i.value}`).join('\n');
      }
      if (block.type === 'table') {
        return [block.columns.join(' | '), ...block.rows.map((r) => r.join(' | '))].join('\n');
      }
      return blockTexts(block).join('\n');
    })
    .filter(Boolean)
    .join('\n\n')
    .trim();
}

/** Un bloc neuf, vide, prêt à être rempli par l'éditeur. */
export function emptyBlock(type: BlockType): PlainBlock {
  switch (type) {
    case 'heading':   return { type: 'heading', level: 2, text: '' };
    case 'paragraph': return { type: 'paragraph', text: '' };
    case 'notice':    return { type: 'notice', text: '' };
    case 'list':      return { type: 'list', ordered: false, items: [''] };
    case 'signature': return { type: 'signature', parties: [''] };
    case 'fields':    return { type: 'fields', items: [{ label: '', value: '' }] };
    case 'table':     return { type: 'table', columns: ['', ''], rows: [['', '']] };
    case 'spacer':    return { type: 'spacer' };
  }
}

/**
 * Un bloc est-il vide ?
 *
 * Sert à l'enregistrement : un paragraphe sans texte laissé par mégarde ne
 * doit pas devenir une ligne blanche dans le PDF signé.
 */
export function isBlockEmpty(block: PlainBlock): boolean {
  if (block.type === 'spacer') return false;
  return blockTexts(block).every((text) => text.trim() === '');
}
