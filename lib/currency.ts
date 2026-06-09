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
