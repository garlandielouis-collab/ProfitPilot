export type CurrencyCode = 'HTG' | 'USD';

export function convertCurrency(
  amount: number,
  from: CurrencyCode,
  to: CurrencyCode,
  exchangeRate: number
): number {
  if (from === to) return amount;
  if (from === 'USD' && to === 'HTG') return amount * exchangeRate;
  if (from === 'HTG' && to === 'USD') return amount / exchangeRate;
  return amount;
}

export function normalizeToBase(
  amount: number,
  currency: CurrencyCode,
  baseCurrency: CurrencyCode,
  exchangeRate: number
): { amountInBase: number; appliedRate: number } {
  return {
    amountInBase: convertCurrency(amount, currency, baseCurrency, exchangeRate),
    appliedRate: exchangeRate,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Conversion de RAPPORT vers la devise de l'entreprise
//
// La seule définition côté code. La même règle existe en SQL :
// `fn_to_business_currency` (supabase/migrations/20260911_views_multidevise.sql),
// derrière `v_monthly_kpis` et `v_product_profitability`. Les deux doivent
// rester d'accord, sinon le même mois affiche deux chiffres selon l'écran.
//
//   même devise   → tel quel
//   USD → HTG     → × taux        (1 USD = taux HTG)
//   HTG → USD     → ÷ taux
//   taux non renseigné, devise inconnue → `null`
//
// `null` : l'appelant EXCLUT le montant du total ET le COMPTE, pour pouvoir
// dire que le total est incomplet. Jamais de taux inventé.
//
// Pourquoi exiger `exchangeRateSet` et pas seulement un nombre : un taux
// « non renseigné » arrive ici sous forme de nombre valide, 1 — la valeur par
// défaut de `businesses.exchange_rate`, et ce que `getBusinessContext()` renvoie
// pour NULL. Il n'existe plus aucun repli à 130 ; 1 n'a pas été saisi par le
// marchand.
//
// Pas de 'use server' dans ce module : il exporte des fonctions synchrones, que
// la directive interdit. Les fichiers 'use server' l'importent sans l'exporter.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Le taux stocké (1 USD = `rate` HTG) a-t-il réellement été renseigné ?
 * Faux pour NULL, une valeur non numérique, ou ≤ 1 (1 = défaut de colonne).
 */
export function isExchangeRateSet(rate: unknown): boolean {
  if (rate === null || rate === undefined || rate === '') return false;
  const n = Number(rate);
  return Number.isFinite(n) && n > 1;
}

/** Ce qu'il faut savoir pour convertir un total ; `BusinessContext` le fournit tel quel. */
export type ReportFx = {
  /** 1 USD = `exchangeRate` HTG. Ignoré si `exchangeRateSet` est faux. */
  exchangeRate:    number;
  /** Vrai seulement si le taux a été saisi (voir `isExchangeRateSet`). */
  exchangeRateSet: boolean;
  /** Devise du rapport : celle de l'entreprise. */
  defaultCurrency: CurrencyCode;
};

/** Montant converti dans la devise du rapport, ou `null` s'il est inconvertible. */
export type ToReport = (amount: number, currency: string | null | undefined) => number | null;

export function makeToReport(fx: ReportFx): ToReport {
  const { exchangeRate, defaultCurrency } = fx;
  const rateOk = fx.exchangeRateSet && Number.isFinite(exchangeRate) && exchangeRate > 1;
  return (amount, currency) => {
    const c = (currency ?? 'HTG').toUpperCase();
    if (c === defaultCurrency) return amount;
    if (!rateOk) return null;
    if (defaultCurrency === 'HTG' && c === 'USD') return amount * exchangeRate;
    if (defaultCurrency === 'USD' && c === 'HTG') return amount / exchangeRate;
    return null;
  };
}

/**
 * La mention qui accompagne un total incomplet : `count` montants dans l'autre
 * devise sont restés hors du total, faute de taux saisi (`makeToReport` a
 * renvoyé `null`). Renvoie `{ fr, ht }` pour `t()` : une phrase figée côté
 * serveur serait intraduisible en créole.
 */
export function unconvertedNotice(
  count: number,
  reportCurrency: string | null | undefined,
): { fr: string; ht: string } {
  const other = (reportCurrency ?? 'HTG').toUpperCase() === 'USD' ? 'HTG' : 'USD';
  const s = count > 1 ? 's' : '';
  return {
    fr: `${count} montant${s} en ${other} non compté${s} : taux de change manquant`,
    ht: `${count} montan an ${other} pa konte : to chanj la manke`,
  };
}

export async function fetchLiveExchangeRate(): Promise<number | null> {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD', { cache: 'no-store' });
    if (!res.ok) throw new Error('API error');
    const json = await res.json();
    const rate = Number(json?.rates?.HTG ?? 0);
    if (rate && !isNaN(rate)) return parseFloat(rate.toFixed(2));
  } catch {
    /* fallback */
  }
  try {
    const res2 = await fetch('https://api.frankfurter.app/latest?from=USD&to=HTG', { cache: 'no-store' });
    const json2 = await res2.json();
    const rate2 = Number(json2?.rates?.HTG ?? 0);
    if (rate2 && !isNaN(rate2)) return parseFloat(rate2.toFixed(2));
  } catch {
    /* ignore */
  }
  return null;
}
