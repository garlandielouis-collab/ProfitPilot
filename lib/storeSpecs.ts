// ─────────────────────────────────────────────────────────────────────────────
// Les caractéristiques, et le pictogramme qui les annonce
//
// La maquette du rayon technique ne pose pas les caractéristiques en liste :
// elle en fait des TUILES, chacune avec son pictogramme — un écran, une puce,
// une batterie. Ce n'est pas une décoration. Sur un appareil, l'acheteur ne lit
// pas la fiche, il la BALAIE en cherchant le chiffre qui le décidera ; le
// pictogramme est ce qui lui permet de sauter au bon carreau sans lire les
// intitulés.
//
// ── Ce que ce fichier décide, et ce qu'il ne décide pas ────────────────────
//
// Il décide du PICTOGRAMME, à partir du mot que le marchand a écrit. Il ne
// décide ni de l'intitulé — c'est le sien —, ni de la valeur, ni de l'ordre :
// les caractéristiques sortent dans l'ordre de saisie, parce que c'est celui
// dans lequel il a pensé son produit.
//
// Un mot inconnu n'est pas approximé : il garde le pictogramme neutre. Une
// tuile « Indice de protection » avec une icône d'appareil photo coûterait plus
// cher que la même tuile sans icône du tout.
// ─────────────────────────────────────────────────────────────────────────────

/** Le pictogramme d'une tuile. Le composant les dessine, ce fichier les nomme. */
export type SpecIcon =
  | 'screen' | 'chip' | 'memory' | 'storage' | 'camera' | 'battery'
  | 'size'   | 'weight' | 'warranty' | 'material' | 'color' | 'port'
  | 'power'  | 'speed' | 'device' | 'date' | 'origin' | 'other';

/**
 * Les mots qui décident, par ordre de priorité.
 *
 * L'ordre compte : « mémoire de stockage » contient les deux, et c'est le
 * stockage qui l'emporte — c'est le mot le plus à droite qui qualifie, en
 * français comme dans la tête de l'acheteur.
 */
const RULES: Array<[RegExp, SpecIcon]> = [
  [/écran|ecran|display|affichage|dalle/i,                      'screen'],
  [/stockage|capacit|disque|ssd|rom\b|go\b.*stock/i,            'storage'],
  [/processeur|puce|cpu|chipset|soc\b/i,                        'chip'],
  [/m[ée]moire|ram\b/i,                                         'memory'],
  [/cam[ée]ra|appareil photo|objectif|capteur photo|mpx|mp\b/i, 'camera'],
  [/batterie|autonomie|mah\b|charge/i,                          'battery'],
  [/garantie|sav\b|service apr/i,                               'warranty'],
  [/poids|masse|\bkg\b|gramme/i,                                'weight'],
  [/dimension|taille|format|pointure|longueur|largeur|hauteur|portion|part/i, 'size'],
  [/mati[èe]re|composition|tissu|cuir|bois|acier|inox|ingr[ée]dient/i, 'material'],
  [/couleur|coloris|teinte|finition/i,                          'color'],
  [/connect|port\b|usb|prise|bluetooth|wifi|wi-fi|r[ée]seau|sim\b/i, 'port'],
  [/puissance|watt|\bw\b|volt|tension|moteur/i,                 'power'],
  [/vitesse|d[ée]bit|fr[ée]quence|hz\b|rapidit/i,               'speed'],
  [/syst[èe]me|\bos\b|android|ios\b|mod[èe]le|r[ée]f[ée]rence|version/i, 'device'],
  [/âge|age\b|ann[ée]e|date|dur[ée]e|dlc\b|p[ée]remption/i,      'date'],
  [/origine|provenance|fabriqu|race|r[ée]gion|pays/i,           'origin'],
];

/** Le pictogramme d'un intitulé. `other` quand aucun mot ne décide. */
export function specIconFor(label: string): SpecIcon {
  const text = String(label ?? '');
  for (const [pattern, icon] of RULES) {
    if (pattern.test(text)) return icon;
  }
  return 'other';
}

export type SpecRow = { label: string; value: string; icon: SpecIcon };

/**
 * Les caractéristiques d'une fiche, prêtes à poser.
 *
 * Rien n'est ajouté : une fiche sans attributs rend une liste vide, et c'est
 * au composant de se taire plutôt que d'inventer six tuiles d'exemple. Une
 * valeur vide disparaît — un intitulé sans réponse est pire qu'un intitulé
 * absent, parce qu'il fait croire à une omission du marchand plutôt qu'à une
 * caractéristique qui ne s'applique pas.
 */
export function specRows(attributes: Record<string, unknown> | null | undefined): SpecRow[] {
  return Object.entries(attributes ?? {})
    .map(([label, raw]) => ({ label: label.trim(), value: String(raw ?? '').trim() }))
    .filter((row) => row.label && row.value)
    .map((row) => ({ ...row, icon: specIconFor(row.label) }));
}
