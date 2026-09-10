// ─────────────────────────────────────────────────────────────────────────────
// La période — établie une fois, en tête d'écran (§4, §13, §26)
//
// Le document demande trois choses différentes selon l'offre :
//
//   §4  Esansyel  « Aujourd'hui · Cette semaine · Ce mois »
//   §13 Kwasans   + « Comparer avec : période précédente | année précédente »
//   §26 Elit      + entreprise (déjà porté par le sélecteur d'entreprise)
//
// Un seul type couvre les trois : une clé de période, résolue en deux dates, et
// une clé de comparaison, résolue en deux autres dates. Tout le reste de
// l'écran ne connaît que des dates — c'est ce qui permet à `KpiCard` de
// n'afficher que « +12 % » sans répéter « vs le mois précédent » : la
// comparaison est annoncée une fois, en tête (§2.4 de la constitution).
//
// Pur, sans dépendance : le serveur s'en sert aussi.
// ─────────────────────────────────────────────────────────────────────────────

export type RangeKey = 'today' | 'week' | 'month' | 'quarter' | 'year';

export type CompareKey = 'previous' | 'lastYear' | 'none';

export type DateRange = {
  /** Bornes incluses, en YYYY-MM-DD, dans le fuseau local du marchand. */
  from: string;
  to: string;
  /** Nombre de jours couverts, bornes incluses. Sert aux moyennes par jour. */
  days: number;
};

export type ResolvedRange = {
  key: RangeKey;
  compare: CompareKey;
  current: DateRange;
  /** La période de comparaison, ou `null` quand on ne compare pas. */
  baseline: DateRange | null;
};

// ── Fabrique de dates ────────────────────────────────────────────────────────
// Tout passe par des dates locales : un marchand qui ouvre son écran à 23 h à
// Port-au-Prince doit voir SA journée, pas celle d'UTC. Les colonnes de la base
// sont des `date` pour les dépenses et les achats, des `timestamptz` pour les
// ventes ; la requête borne donc en `YYYY-MM-DDT00:00:00` / `T23:59:59`.

const iso = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const addDays = (d: Date, n: number): Date => {
  const next = new Date(d);
  next.setDate(next.getDate() + n);
  return next;
};

const dayCount = (from: string, to: string): number => {
  const a = new Date(`${from}T00:00:00`);
  const b = new Date(`${to}T00:00:00`);
  return Math.max(1, Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1);
};

const range = (from: Date, to: Date): DateRange => {
  const f = iso(from);
  const t = iso(to);
  return { from: f, to: t, days: dayCount(f, t) };
};

/**
 * La semaine commence le lundi. Ce n'est pas un détail de développeur : le
 * marchand haïtien compte sa semaine de travail du lundi au samedi, et voir
 * « cette semaine » basculer le dimanche soir lui ferait perdre son samedi.
 */
function startOfWeek(d: Date): Date {
  const day = d.getDay();               // 0 = dimanche
  const back = day === 0 ? 6 : day - 1;
  return addDays(d, -back);
}

/** Les deux bornes de la période demandée. */
export function resolveRange(key: RangeKey, now = new Date()): DateRange {
  switch (key) {
    case 'today':
      return range(now, now);
    case 'week':
      return range(startOfWeek(now), now);
    case 'quarter': {
      const q = Math.floor(now.getMonth() / 3);
      return range(new Date(now.getFullYear(), q * 3, 1), now);
    }
    case 'year':
      return range(new Date(now.getFullYear(), 0, 1), now);
    case 'month':
    default:
      return range(new Date(now.getFullYear(), now.getMonth(), 1), now);
  }
}

/**
 * La période de comparaison.
 *
 * « Période précédente » est décalée de la MÊME durée, pas d'un mois calendaire :
 * comparer 12 jours de janvier à 31 jours de décembre donnerait une chute de
 * 60 % là où il n'y a rien. Le §2 du document veut que le tableau de bord
 * raconte une histoire — une histoire fausse ne vaut pas mieux que pas
 * d'histoire.
 */
export function resolveBaseline(
  current: DateRange,
  compare: CompareKey,
): DateRange | null {
  if (compare === 'none') return null;

  const from = new Date(`${current.from}T00:00:00`);
  const to   = new Date(`${current.to}T00:00:00`);

  if (compare === 'lastYear') {
    const f = new Date(from); f.setFullYear(f.getFullYear() - 1);
    const t = new Date(to);   t.setFullYear(t.getFullYear() - 1);
    return range(f, t);
  }

  // « previous » : la même durée, juste avant.
  return range(addDays(from, -current.days), addDays(from, -1));
}

export function resolve(
  key: RangeKey,
  compare: CompareKey = 'previous',
  now = new Date(),
): ResolvedRange {
  const current = resolveRange(key, now);
  return { key, compare, current, baseline: resolveBaseline(current, compare) };
}

/**
 * Le pas des points du graphique. Une journée se lit par heures, un mois par
 * jours, une année par mois — jamais 365 barres sur un téléphone (§47).
 */
export function bucketOf(key: RangeKey): 'hour' | 'day' | 'week' | 'month' {
  if (key === 'today') return 'hour';
  if (key === 'week')  return 'day';
  if (key === 'month') return 'day';
  if (key === 'quarter') return 'week';
  return 'month';
}

/** La variation en %, ou `null` quand la base est nulle — jamais « +100 % ». */
export function deltaPercent(now: number, before: number): number | null {
  if (!Number.isFinite(now) || !Number.isFinite(before)) return null;
  if (before === 0) return null;
  return Math.round(((now - before) / Math.abs(before)) * 1000) / 10;
}
