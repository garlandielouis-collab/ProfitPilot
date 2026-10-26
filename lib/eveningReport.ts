// ─────────────────────────────────────────────────────────────────────────────
// Le bilan du soir et la caisse attendue — F06 et F08 de l'étude
//
// « ProfitPilot fait l'inverse : le marchand note en 3 secondes, et c'est
// ProfitPilot qui vient à lui chaque soir avec 3 chiffres et 1 conseil » (§1).
//
// Les trois chiffres : ce qu'il a VENDU, ce qu'il a DÉPENSÉ, ce qu'il a GAGNÉ.
// Puis la caisse attendue, qui doit, et un seul conseil — le plus utile ce
// soir-là, pas une liste.
//
// Ce module est pur : il reçoit des lignes déjà lues et rend des nombres et du
// texte. Il est testé sans base (tests/eveningReport.test.ts). La lecture vit
// dans `app/actions/evening.ts`.
// ─────────────────────────────────────────────────────────────────────────────

export type Text = { fr: string; ht: string };

// ── Le jour du marchand, pas celui du serveur ───────────────────────────────
//
// Le serveur tourne en UTC. À 20 h à Port-au-Prince il est déjà 1 h du matin
// le lendemain en UTC : « aujourd'hui » selon le serveur aurait coupé la
// soirée en deux. Les bornes se calculent dans le fuseau du commerce.

/** La date locale (AAAA-MM-JJ) d'un instant, dans un fuseau. */
export function localDay(at: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** L'heure locale (0–23) d'un instant, dans un fuseau. */
export function localHour(at: Date, timeZone: string): number {
  const h = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hourCycle: 'h23' }).format(at);
  return Number(h) % 24;
}

/** Décalage du fuseau à un instant donné, en minutes (Haïti : −300 ou −240). */
function offsetMinutes(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return Math.round((asUtc - at.getTime()) / 60_000);
}

/** Les bornes UTC [début, fin[ d'une journée locale. */
export function zonedDayBounds(day: string, timeZone: string): { start: string; end: string } {
  const [y, m, d] = day.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, 12);  // midi : loin des changements d'heure
  const off = offsetMinutes(new Date(guess), timeZone);
  const start = Date.UTC(y, m - 1, d) - off * 60_000;
  const end = Date.UTC(y, m - 1, d + 1) - offsetMinutes(new Date(guess + 86_400_000), timeZone) * 60_000;
  return { start: new Date(start).toISOString(), end: new Date(end).toISOString() };
}

/** Le lundi (AAAA-MM-JJ) de la semaine d'un jour : la semaine du salaire du patron. */
export function weekStart(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dow = (date.getUTCDay() + 6) % 7;  // lundi = 0
  date.setUTCDate(date.getUTCDate() - dow);
  return date.toISOString().slice(0, 10);
}

// ── Les lignes lues ─────────────────────────────────────────────────────────

/** Ramène un montant à la devise du commerce, ou `null` sans taux saisi. */
export type Convert = (amount: number, currency: string | null | undefined) => number | null;

export type SaleRow = {
  total: number;
  paidAmount: number;
  /** Ce que les versements ultérieurs ont déjà ajouté à `paidAmount`. */
  laterPayments: number;
  currency: string;
  method: string | null;
  status: string | null;
  /** Coût d'achat des lignes (Σ cost_price × qté), dans la devise de la vente. */
  cost: number;
};

export type PaymentRow = { amount: number; currency: string; method: string | null };

export type ExpenseRow = {
  amount: number;
  currency: string;
  method: string | null;
  status: string | null;
  scope: 'business' | 'personal' | 'mixed' | null;
  /** Part professionnelle d'une dépense mixte, en %. */
  sharePct: number | null;
};

export type SolRow = { amount: number; direction: 'in' | 'out'; method: string | null };

const isCash = (method: string | null | undefined) => !method || method === 'Cash';
const round = (n: number) => Math.round(n * 100) / 100;

export type DayFigures = {
  sold: number;
  cost: number;
  /** Dépenses du COMMERCE : la part professionnelle seulement. */
  spent: number;
  /** Ce qui est sorti pour la maison (F04) : le « Kay » du cahier. */
  ownerWithdrawals: number;
  /** Vendu − coût d'achat − dépenses du commerce. */
  profit: number;
  /** Fond de caisse + entrées en espèces − sorties en espèces. */
  expectedCash: number;
  cashIn: number;
  cashOut: number;
  /** Lignes laissées hors des totaux, faute de taux de change saisi. */
  unconverted: number;
};

/**
 * Les chiffres d'une journée.
 *
 * La caisse ne compte que les ESPÈCES : un paiement MonCash n'est pas dans le
 * tiroir. Une vente compte pour ce qui a été payé à la vente — `paidAmount`
 * moins les versements arrivés depuis, qui sont comptés à leur propre date —
 * pour qu'une créance soldée le jour même ne compte pas deux fois.
 */
export function computeDay(input: {
  sales: SaleRow[];
  payments: PaymentRow[];
  expenses: ExpenseRow[];
  sol: SolRow[];
  openingCash: number;
  convert: Convert;
}): DayFigures {
  let unconverted = 0;
  const conv = (amount: number, currency: string) => {
    const v = input.convert(amount, currency);
    if (v === null) { unconverted += 1; return null; }
    return v;
  };

  let sold = 0, cost = 0, cashIn = 0, cashOut = 0, spent = 0, ownerWithdrawals = 0;

  for (const s of input.sales) {
    if (s.status === 'cancelled' || s.status === 'refunded') continue;
    const total = conv(s.total, s.currency);
    if (total === null) continue;
    sold += total;
    cost += input.convert(s.cost, s.currency) ?? 0;
    if (isCash(s.method)) {
      const atSale = Math.max(0, s.paidAmount - s.laterPayments);
      cashIn += input.convert(atSale, s.currency) ?? 0;
    }
  }

  for (const p of input.payments) {
    if (!isCash(p.method)) continue;
    cashIn += conv(p.amount, p.currency) ?? 0;
  }

  for (const e of input.expenses) {
    const amount = conv(e.amount, e.currency);
    if (amount === null) continue;
    const share = e.scope === 'personal' ? 0
      : e.scope === 'mixed' ? Math.min(Math.max(Number(e.sharePct ?? 0), 0), 100) / 100
      : 1;
    spent += amount * share;
    ownerWithdrawals += amount * (1 - share);
    // Une dépense « en attente » ou à crédit n'est pas encore sortie du tiroir.
    if (isCash(e.method) && (e.status === null || e.status === 'paid')) cashOut += amount;
  }

  for (const s of input.sol) {
    if (!isCash(s.method)) continue;
    if (s.direction === 'in') cashIn += s.amount; else cashOut += s.amount;
  }

  return {
    sold: round(sold),
    cost: round(cost),
    spent: round(spent),
    ownerWithdrawals: round(ownerWithdrawals),
    profit: round(sold - cost - spent),
    expectedCash: round(input.openingCash + cashIn - cashOut),
    cashIn: round(cashIn),
    cashOut: round(cashOut),
    unconverted,
  };
}

// ── Le sòl : les cotisations à prévoir ──────────────────────────────────────

export type SolGroup = {
  name: string;
  contribution: number;
  frequency: 'daily' | 'weekly' | 'monthly';
  startDate: string;
  payoutDate: string | null;
};

/** Vrai si une cotisation tombe ce jour-là. */
export function solDueOn(group: SolGroup, day: string): boolean {
  if (day < group.startDate) return false;
  if (group.frequency === 'daily') return true;
  const [y1, m1, d1] = group.startDate.split('-').map(Number);
  const [y2, m2, d2] = day.split('-').map(Number);
  if (group.frequency === 'weekly') {
    const diff = Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
    return diff % 7 === 0;
  }
  // Mensuel : le même quantième, ou le dernier jour d'un mois trop court.
  const lastOfMonth = new Date(Date.UTC(y2, m2, 0)).getUTCDate();
  return d2 === Math.min(d1, lastOfMonth);
}

/** Le lendemain d'une date AAAA-MM-JJ. */
export function nextDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

// ── Le conseil du soir ──────────────────────────────────────────────────────

export type Debtor = { name: string; balance: number; days: number };

export type EveningReport = DayFigures & {
  day: string;
  currency: string;
  /** Ce que les clients doivent, au total. */
  owed: number;
  /** Les plus anciens d'abord. */
  debtors: Debtor[];
  /** Retraits « Kay » depuis lundi, et le salaire que le patron s'est fixé. */
  weekWithdrawals: number;
  ownerWeeklySalary: number | null;
  /** Cotisations de sòl qui tombent demain. */
  solTomorrow: { name: string; amount: number }[];
  lowStock: number;
  /** Caisse comptée ce soir, si le marchand l'a fait. */
  countedCash: number | null;
  /** Le marchand voit le profit (le propriétaire ; pas un aide). */
  showProfit: boolean;
};

export function formatMoney(amount: number, currency: string): string {
  const n = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Math.round(amount));
  return currency === 'USD' ? `${n} $` : `${n} G`;
}

/**
 * UN conseil, le plus utile ce soir. L'ordre est celui de ce qui coûte le plus
 * cher au marchand (§5) : la caisse prise pour la maison, l'argent bloqué chez
 * les clients, une journée à perte, la caisse qui ne tombe pas juste, le sòl de
 * demain, la rupture.
 */
export function pickTip(r: EveningReport): Text {
  const m = (n: number) => formatMoney(n, r.currency);

  if (r.ownerWeeklySalary && r.weekWithdrawals > r.ownerWeeklySalary) {
    const over = r.weekWithdrawals - r.ownerWeeklySalary;
    return {
      fr: `Cette semaine, vous avez pris ${m(r.weekWithdrawals)} pour la maison : ${m(over)} de plus que votre salaire. Le reste est pour le commerce.`,
      ht: `Semèn sa a, ou pran ${m(r.weekWithdrawals)} pou lakay : ${m(over)} plis pase salè w. Rès la se pou biznis la.`,
    };
  }

  const oldest = r.debtors.find((d) => d.days >= 7);
  if (oldest) {
    return {
      fr: `${oldest.name} vous doit ${m(oldest.balance)} depuis ${oldest.days} jours. Envoyez-lui un rappel ?`,
      ht: `${oldest.name} dwe w ${m(oldest.balance)} depi ${oldest.days} jou. Ou vle voye yon rapèl ba li ?`,
    };
  }

  if (r.showProfit && r.sold > 0 && r.profit < 0) {
    return {
      fr: `Aujourd'hui, vous avez dépensé plus que vous n'avez gagné (${m(r.profit)}). Regardez vos dépenses.`,
      ht: `Jodi a, ou depanse plis pase sa w fè (${m(r.profit)}). Gade depans ou yo.`,
    };
  }

  if (r.countedCash !== null && Math.abs(r.countedCash - r.expectedCash) >= 1) {
    const gap = r.countedCash - r.expectedCash;
    return gap < 0
      ? { fr: `Il manque ${m(-gap)} dans la caisse. Vérifiez les ventes et les dépenses du jour.`,
          ht: `Kès la manke ${m(-gap)}. Tcheke vant ak depans jounen an.` }
      : { fr: `Il y a ${m(gap)} de trop dans la caisse : une vente ou un versement n'a peut-être pas été noté.`,
          ht: `Gen ${m(gap)} an plis nan kès la : petèt gen yon vant oswa yon peman ki pa t note.` };
  }

  if (r.solTomorrow.length > 0) {
    const total = r.solTomorrow.reduce((s, x) => s + x.amount, 0);
    return {
      fr: `Demain, c'est le jour du sòl : gardez ${m(total)} de côté.`,
      ht: `Demen se jou sòl : kenbe ${m(total)} sou kote.`,
    };
  }

  if (r.lowStock > 0) {
    return {
      fr: `${r.lowStock} produit${r.lowStock > 1 ? 's sont' : ' est'} presque fini${r.lowStock > 1 ? 's' : ''}. Pensez à racheter.`,
      ht: `${r.lowStock} pwodwi prèske fini. Panse achte ankò.`,
    };
  }

  if (r.sold === 0) {
    return {
      fr: 'Aucune vente notée aujourd’hui. Si vous avez vendu, notez-le : trois secondes suffisent.',
      ht: 'Pa gen okenn vant ki note jodi a. Si w te vann, note l : twa segonn ase.',
    };
  }

  return {
    fr: 'Bonne journée. Continuez à tout noter : demain soir, vous saurez encore ce qui est à vous.',
    ht: 'Bon jounen. Kontinye note tout bagay : demen swa, w ap konnen sa ki pou ou ankò.',
  };
}

/**
 * Le message tel qu'il part sur WhatsApp. Court : il se lit debout, d'une main,
 * et il doit tenir sans défiler sur un petit écran.
 */
export function buildEveningMessage(r: EveningReport, lang: 'fr' | 'ht', businessName: string): string {
  const m = (n: number) => formatMoney(n, r.currency);
  const t = (x: Text) => x[lang];
  const lines: string[] = [];

  lines.push(t({ fr: `*${businessName}* — votre journée`, ht: `*${businessName}* — jounen ou` }));
  lines.push('');
  lines.push(t({ fr: `Vendu : ${m(r.sold)}`, ht: `Sa w vann : ${m(r.sold)}` }));
  if (r.showProfit) {
    lines.push(t({ fr: `Dépensé : ${m(r.cost + r.spent)}`, ht: `Sa w depanse : ${m(r.cost + r.spent)}` }));
    lines.push(t({ fr: `*Gagné : ${m(r.profit)}*`, ht: `*Pwofi : ${m(r.profit)}*` }));
    lines.push(t({ fr: `Caisse attendue : ${m(r.expectedCash)}`, ht: `Kès atandi : ${m(r.expectedCash)}` }));
  }
  if (r.ownerWithdrawals > 0) {
    lines.push(t({ fr: `Pris pour la maison : ${m(r.ownerWithdrawals)}`, ht: `Lajan lakay : ${m(r.ownerWithdrawals)}` }));
  }
  if (r.owed > 0) {
    lines.push(t({
      fr: `On vous doit : ${m(r.owed)} (${r.debtors.length} client${r.debtors.length > 1 ? 's' : ''})`,
      ht: `Sa yo dwe w : ${m(r.owed)} (${r.debtors.length} kliyan)`,
    }));
  }
  lines.push('');
  lines.push(t({ fr: `Conseil : ${pickTip(r).fr}`, ht: `Konsèy : ${pickTip(r).ht}` }));
  if (r.unconverted > 0) {
    lines.push(t({
      fr: `(${r.unconverted} montant${r.unconverted > 1 ? 's' : ''} en dollars hors du total : taux du jour non saisi.)`,
      ht: `(${r.unconverted} montan an dola pa nan total la : to jounen an pa antre.)`,
    }));
  }
  return lines.join('\n');
}
