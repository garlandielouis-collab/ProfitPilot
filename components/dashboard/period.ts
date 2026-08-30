// ─────────────────────────────────────────────────────────────────────────────
// La période — établie UNE FOIS, en tête de l'écran (§2.4)
//
// C'est ce qui autorise chaque carte, plus bas, à n'afficher que « +12 % » sans
// répéter « vs le mois passé ». Une économie de trois mots par carte ; à
// l'échelle de l'écran, c'est une colonne de bruit en moins.
// ─────────────────────────────────────────────────────────────────────────────

export const MONTHS = [
  'Janvye', 'Fevriye', 'Mas', 'Avril', 'Me', 'Jen',
  'Jiyè', 'Out', 'Septanm', 'Oktòb', 'Novanm', 'Desanm',
] as const;

export const MONTHS_SHORT = [
  'Jan', 'Fev', 'Mas', 'Avr', 'Me', 'Jen', 'Jil', 'Out', 'Sep', 'Okt', 'Nov', 'Des',
] as const;

export const QUARTERS = [
  { label: 'T1', name: 'Jan–Mas', months: [0, 1, 2]    as const },
  { label: 'T2', name: 'Avr–Jen', months: [3, 4, 5]    as const },
  { label: 'T3', name: 'Jil–Sep', months: [6, 7, 8]    as const },
  { label: 'T4', name: 'Okt–Des', months: [9, 10, 11]  as const },
] as const;

export const SEMESTERS = [
  { label: 'S1', name: 'Jan–Jen', months: [0, 1, 2, 3, 4, 5]    as const },
  { label: 'S2', name: 'Jil–Des', months: [6, 7, 8, 9, 10, 11]  as const },
] as const;

export type PeriodMode = 'mois' | 'trimestre' | 'semestre';

export type Period = {
  mode: PeriodMode;
  month: number;
  quarter: number;
  semester: number;
};

/** Les deux bornes de mois que la requête doit couvrir. */
export function monthRangeOf(p: Period): [number, number] {
  if (p.mode === 'mois')      return [p.month, p.month];
  if (p.mode === 'trimestre') return [QUARTERS[p.quarter].months[0], QUARTERS[p.quarter].months[2]];
  return [SEMESTERS[p.semester].months[0], SEMESTERS[p.semester].months[5]];
}

/** Le libellé affiché sous le titre de l'écran — et nulle part ailleurs. */
export function labelOf(p: Period, year: number): string {
  if (p.mode === 'mois')      return `${MONTHS[p.month]} ${year}`;
  if (p.mode === 'trimestre') return `${QUARTERS[p.quarter].label} ${year} — ${QUARTERS[p.quarter].name}`;
  return `${SEMESTERS[p.semester].label} ${year} — ${SEMESTERS[p.semester].name}`;
}

/** La période sélectionnée est-elle celle qu'on est en train de vivre ?
 *  C'est elle, et elle seule, qui portera l'accent dans les graphiques (§6.2). */
export function isCurrentPeriod(p: Period, now: Date): boolean {
  const m = now.getMonth();
  if (p.mode === 'mois')      return p.month === m;
  if (p.mode === 'trimestre') return p.quarter === Math.floor(m / 3);
  return p.semester === (m < 6 ? 0 : 1);
}
