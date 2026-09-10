// ─────────────────────────────────────────────────────────────────────────────
// Export CSV (§55)
//
// La route de sauvegarde portait déjà un `jsonToCsv()` ; l'audit demandait de
// l'extraire plutôt que de le recopier. Le voici, avec les deux corrections que
// l'original n'avait pas :
//
//   1. **Le point-virgule.** Excel en configuration française lit le CSV avec
//      le séparateur de liste du système — la virgule y produit une seule
//      colonne. Le marchand ouvre alors un fichier illisible et conclut que
//      l'export est cassé. Le séparateur est donc paramétrable, et vaut `;`
//      par défaut ici parce que ces fichiers s'ouvrent dans Excel, pas dans un
//      analyseur.
//   2. **Le BOM.** Sans lui, Excel lit l'UTF-8 comme du Latin-1 : « Patente »
//      passe, « Déclaration » devient « DÃ©claration ».
//
// Le tout reste pur : aucun accès au DOM pour la fabrication, donc testable, et
// utilisable côté serveur comme côté navigateur.
// ─────────────────────────────────────────────────────────────────────────────

export type CsvColumn<T> = {
  header: string;
  value: (row: T) => string | number | null | undefined;
};

/** Le BOM UTF-8, en échappement plutôt qu'en caractère : un caractère invisible
 *  au milieu d'un fichier source est un caractère qu'un outil finit par manger. */
const BOM = '\uFEFF';

/**
 * Une cellule qui ne peut pas casser la grille.
 *
 * Guillemets doublés, et mise entre guillemets dès que la cellule contient le
 * séparateur, un guillemet ou un saut de ligne. Le retour chariot compte : un
 * texte copié depuis Windows en porte, et lui seul suffit à décaler toutes les
 * lignes suivantes.
 */
function escape(value: unknown, separator: string): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return text.includes(separator) || text.includes('"') || text.includes('\n') || text.includes('\r')
    ? `"${text.replace(/"/g, '""')}"`
    : text;
}

export function toCsv<T>(
  rows: T[],
  columns: CsvColumn<T>[],
  { separator = ';', bom = true }: { separator?: string; bom?: boolean } = {},
): string {
  const header = columns.map((c) => escape(c.header, separator)).join(separator);
  const lines  = rows.map((row) =>
    columns.map((c) => escape(c.value(row), separator)).join(separator));

  return (bom ? BOM : '') + [header, ...lines].join('\r\n');
}

/**
 * Un nom de fichier qui survit à un système de fichiers.
 *
 * Les signes diacritiques retirés, les caractères interdits par Windows
 * remplacés, et la date du jour — parce qu'un « documents.csv » téléchargé
 * trois fois donne trois fichiers qu'on ne sait plus distinguer.
 */
export function csvFilename(base: string, date = new Date()): string {
  const slug = base
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 60) || 'export';

  return `${slug}-${date.toISOString().slice(0, 10)}.csv`;
}

/**
 * Provoque le téléchargement dans le navigateur.
 *
 * Un `Blob` et une ancre synthétique : la seule voie qui n'exige ni route
 * serveur ni aller-retour réseau, alors que le fichier est déjà en mémoire.
 * L'URL objet est révoquée aussitôt — sans cela, chaque export garderait son
 * contenu en mémoire jusqu'au rechargement de la page.
 */
export function downloadCsv(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
