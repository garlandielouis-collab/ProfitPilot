// ─────────────────────────────────────────────────────────────────────────────
// L'échelle des graphiques — ce qui les rend lisibles sur un téléphone
//
// Un graphique à barres se dessine bien en 900 px et se tasse en 320. Deux
// décisions suffisent à le rattraper, et elles doivent être les MÊMES partout,
// sinon deux graphiques du même écran ne se ressemblent plus (§3.4).
//
// ── 1. L'écart entre les barres ────────────────────────────────────────────
//
// Il était écrit en classe fixe (`gap-1.5`, soit 8 px). Sur un mois de trente
// et un jours, dans une carte de 328 px dont 40 partent en axe : trente écarts
// de 8 px mangent 240 px et laissent 1,5 px par barre. Le graphique devient une
// trame grise — « entassé » est exactement le mot.
//
// L'écart doit donc DÉPENDRE du nombre de périodes. Sept jours peuvent
// respirer ; trente et un doivent se serrer. Le minimum est 1 px : en dessous,
// les barres se touchent et on ne compte plus les jours.
//
// ── 2. Les libellés ────────────────────────────────────────────────────────
//
// Trente et une étiquettes sous trente et une barres, c'est trente et un
// nombres de deux chiffres dans 276 px : ils se chevauchent, se tronquent, et
// plus aucun n'est lisible. On en garde six au maximum, à intervalle régulier.
//
// Le calage se fait depuis la FIN : la dernière période — celle qu'on regarde,
// celle qui porte l'accent — est toujours nommée. Un axe calé depuis le début
// laisserait la période en cours anonyme une fois sur deux.
// ─────────────────────────────────────────────────────────────────────────────

/** L'écart entre deux barres, en pixels. Il se resserre quand elles se multiplient. */
export function barGap(count: number): number {
  if (count <= 8)  return 6;
  if (count <= 14) return 3;
  return 1;
}

/** Un libellé toutes les N périodes, pour n'en afficher jamais plus de six. */
export function labelStep(count: number, max = 6): number {
  return Math.max(1, Math.ceil(count / max));
}

/**
 * Cette période porte-t-elle son libellé ?
 *
 * Calé depuis la fin, pour que la dernière barre soit toujours nommée.
 */
export function showsLabel(index: number, count: number, max = 6): boolean {
  // Jusqu'à huit périodes, tout tient : une semaine garde ses sept jours
  // nommés. C'est le cas le plus fréquent du produit, et le plus lu.
  if (count <= 8) return true;

  const step = labelStep(count, max);
  if (step === 1) return true;
  return (count - 1 - index) % step === 0;
}
