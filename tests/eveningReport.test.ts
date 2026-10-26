import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildEveningMessage, computeDay, localDay, localHour, nextDay, pickTip, solDueOn, weekStart,
  zonedDayBounds, type EveningReport,
} from '../lib/eveningReport';
import { DEFAULT_KAYE, mergeKaye, readKaye, saleWord, showsServiceTools, showsStock } from '../lib/kaye';

const HT = 'America/Port-au-Prince';
// `fr-FR` sépare les milliers par une espace fine insécable : la comparer à une espace.
const plain = (s: string) => s.replace(/[  ]/g, ' ');
const htg = (amount: number, currency: string | null | undefined) => (currency === 'USD' ? null : amount);

describe('le jour du marchand, pas celui du serveur', () => {
  test('20 h à Port-au-Prince est encore « aujourd’hui », même s’il est 1 h UTC demain', () => {
    // 25 oct. 2026, 20 h à Port-au-Prince (UTC−4 en heure d'été) = 26 oct. 00 h UTC.
    const at = new Date('2026-10-26T00:00:00Z');
    assert.equal(localDay(at, HT), '2026-10-25');
    assert.equal(localHour(at, HT), 20);
  });

  test('les bornes d’une journée locale couvrent ses 24 heures', () => {
    const { start, end } = zonedDayBounds('2026-10-25', HT);
    assert.equal(start, '2026-10-25T04:00:00.000Z');
    assert.equal(end, '2026-10-26T04:00:00.000Z');
  });

  test('en hiver, le décalage passe à cinq heures', () => {
    const { start } = zonedDayBounds('2026-12-15', HT);
    assert.equal(start, '2026-12-15T05:00:00.000Z');
  });

  test('la semaine du salaire commence le lundi', () => {
    assert.equal(weekStart('2026-10-25'), '2026-10-19'); // dimanche → lundi précédent
    assert.equal(weekStart('2026-10-19'), '2026-10-19');
    assert.equal(nextDay('2026-10-31'), '2026-11-01');
  });
});

describe('la caisse attendue (F08)', () => {
  test('fond de caisse + espèces encaissées − espèces sorties ; MonCash n’est pas dans le tiroir', () => {
    const d = computeDay({
      openingCash: 1000,
      convert: htg,
      sales: [
        { total: 500, paidAmount: 500, laterPayments: 0, currency: 'HTG', method: 'Cash', status: 'paid', cost: 300 },
        { total: 800, paidAmount: 800, laterPayments: 0, currency: 'HTG', method: 'MonCash', status: 'paid', cost: 400 },
      ],
      payments: [],
      expenses: [{ amount: 200, currency: 'HTG', method: 'Cash', status: 'paid', scope: 'business', sharePct: 100 }],
      sol: [{ amount: 100, direction: 'out', method: 'Cash' }],
    });
    assert.equal(d.sold, 1300);
    assert.equal(d.profit, 1300 - 700 - 200);
    assert.equal(d.expectedCash, 1000 + 500 - 200 - 100);
  });

  test('une créance soldée le jour même ne compte pas deux fois', () => {
    const d = computeDay({
      openingCash: 0,
      convert: htg,
      // Vendue à crédit (rien payé à la vente), puis soldée en espèces le soir.
      sales: [{ total: 1000, paidAmount: 1000, laterPayments: 1000, currency: 'HTG', method: 'Cash', status: 'paid', cost: 0 }],
      payments: [{ amount: 1000, currency: 'HTG', method: 'Cash' }],
      expenses: [],
      sol: [],
    });
    assert.equal(d.expectedCash, 1000);
  });

  test('l’argent pris pour la maison sort de la caisse, pas du profit', () => {
    const d = computeDay({
      openingCash: 0,
      convert: htg,
      sales: [{ total: 1000, paidAmount: 1000, laterPayments: 0, currency: 'HTG', method: 'Cash', status: 'paid', cost: 0 }],
      payments: [],
      expenses: [
        { amount: 300, currency: 'HTG', method: 'Cash', status: 'paid', scope: 'personal', sharePct: 0 },
        { amount: 100, currency: 'HTG', method: 'Cash', status: 'paid', scope: 'mixed', sharePct: 60 },
      ],
      sol: [],
    });
    assert.equal(d.profit, 1000 - 60);
    assert.equal(d.ownerWithdrawals, 300 + 40);
    assert.equal(d.expectedCash, 1000 - 400);
  });

  test('un montant en dollars sans taux est compté à part, jamais à 1 pour 1', () => {
    const d = computeDay({
      openingCash: 0,
      convert: htg,
      sales: [{ total: 20, paidAmount: 20, laterPayments: 0, currency: 'USD', method: 'Cash', status: 'paid', cost: 0 }],
      payments: [], expenses: [], sol: [],
    });
    assert.equal(d.sold, 0);
    assert.equal(d.unconverted, 1);
  });
});

describe('le sòl', () => {
  const base = { name: 'Sòl mache', contribution: 500, startDate: '2026-10-05', payoutDate: null };
  test('hebdomadaire : tous les sept jours depuis le début', () => {
    assert.equal(solDueOn({ ...base, frequency: 'weekly' }, '2026-10-12'), true);
    assert.equal(solDueOn({ ...base, frequency: 'weekly' }, '2026-10-13'), false);
  });
  test('mensuel : le même quantième, ou le dernier jour d’un mois trop court', () => {
    const g = { ...base, frequency: 'monthly' as const, startDate: '2026-01-31' };
    assert.equal(solDueOn(g, '2026-02-28'), true);
    assert.equal(solDueOn(g, '2026-03-31'), true);
    assert.equal(solDueOn(g, '2026-03-30'), false);
  });
  test('rien avant le début', () => {
    assert.equal(solDueOn({ ...base, frequency: 'daily' }, '2026-10-01'), false);
  });
});

function report(over: Partial<EveningReport> = {}): EveningReport {
  return {
    day: '2026-10-25', currency: 'HTG',
    sold: 20000, cost: 9000, spent: 4400, ownerWithdrawals: 0, profit: 6600,
    expectedCash: 9200, cashIn: 0, cashOut: 0, unconverted: 0,
    owed: 0, debtors: [], weekWithdrawals: 0, ownerWeeklySalary: null,
    solTomorrow: [], lowStock: 0, countedCash: null, showProfit: true,
    ...over,
  };
}

describe('un seul conseil, le plus utile', () => {
  test('la caisse prise pour la maison passe avant tout', () => {
    const tip = pickTip(report({
      weekWithdrawals: 6000, ownerWeeklySalary: 5000,
      debtors: [{ name: 'Jean', balance: 2500, days: 12 }],
    }));
    assert.match(tip.ht, /pou lakay/);
  });
  test('puis l’argent bloqué chez un client depuis une semaine', () => {
    const tip = pickTip(report({ debtors: [{ name: 'Jean', balance: 2500, days: 12 }] }));
    assert.match(plain(tip.ht), /Jean dwe w 2 500 G depi 12 jou/);
  });
  test('un aide ne lit jamais le profit, même dans le conseil', () => {
    const tip = pickTip(report({ showProfit: false, profit: -500 }));
    assert.doesNotMatch(tip.fr, /dépensé plus/);
    const msg = buildEveningMessage(report({ showProfit: false }), 'ht', 'Boutik Mari');
    assert.doesNotMatch(msg, /Pwofi|Kès atandi/);
  });
  test('le message porte les trois chiffres et un conseil', () => {
    const msg = plain(buildEveningMessage(report(), 'ht', 'Boutik Mari'));
    assert.match(msg, /Sa w vann : 20 000 G/);
    assert.match(msg, /Pwofi : 6 600 G/);
    assert.match(msg, /Konsèy :/);
  });
});

describe('le kaye du marchand', () => {
  test('un réglage absent ou abîmé retombe sur sa valeur par défaut', () => {
    assert.deepEqual(readKaye(null), DEFAULT_KAYE);
    assert.deepEqual(readKaye({ kaye: { trade: 'pirate', eveningHour: 40 } }), DEFAULT_KAYE);
  });
  test('modifier le kaye garde les autres réglages du commerce', () => {
    const next = mergeKaye({ theme: 'dark', kaye: { eveningHour: 18 } }, { trade: 'service' });
    assert.equal(next.theme, 'dark');
    assert.equal(readKaye(next).trade, 'service');
    assert.equal(readKaye(next).eveningHour, 18);
  });
  test('un métier, un écran', () => {
    assert.equal(showsStock('service'), false);
    assert.equal(showsStock(null), true);
    assert.equal(showsServiceTools('both'), true);
    assert.equal(showsServiceTools('commerce'), false);
    assert.equal(saleWord('service').ht, 'SÈVIS');
    assert.equal(saleWord('both').ht, 'VANN');
  });
});

import { payFor } from '../lib/helperPay';

describe('la paie des aides (F16)', () => {
  test('à la journée : le montant convenu, par jour travaillé', () => {
    assert.equal(payFor('daily', 500, 12000, 4), 2000);
  });
  test('au pourcentage : la part de ce qu’il a vendu lui-même', () => {
    assert.equal(payFor('percent', 10, 12345, 4), 1234.5);
  });
  test('sans règle convenue, rien n’est dû — jamais un montant deviné', () => {
    assert.equal(payFor(null, 500, 12000, 4), 0);
    assert.equal(payFor('daily', null, 12000, 4), 0);
  });
});
