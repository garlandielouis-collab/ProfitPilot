'use client';

import { useEffect, useRef } from 'react';
import { saveExchangeRate } from '../app/actions/exchangeRate';

const STORAGE_KEY  = 'pp_rate_last_refresh';
const CACHE_HOURS  = 24;

async function fetchLiveRateClient(): Promise<number | null> {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD', { cache: 'no-store' });
    if (res.ok) {
      const json = await res.json();
      const rate = Number(json?.rates?.HTG ?? 0);
      if (rate > 0 && !isNaN(rate)) return parseFloat(rate.toFixed(2));
    }
  } catch { /* fallback */ }
  try {
    const res2 = await fetch('https://api.frankfurter.app/latest?from=USD&to=HTG', { cache: 'no-store' });
    if (res2.ok) {
      const json2 = await res2.json();
      const rate2 = Number(json2?.rates?.HTG ?? 0);
      if (rate2 > 0 && !isNaN(rate2)) return parseFloat(rate2.toFixed(2));
    }
  } catch { /* ignore */ }
  return null;
}

/**
 * Auto-refresh exchange rate once per 24h in background.
 * Stores timestamp in localStorage; calls server action to persist in DB.
 */
export function useAutoExchangeRateRefresh(enabled = true) {
  const done = useRef(false);

  useEffect(() => {
    if (!enabled || done.current) return;
    done.current = true;

    const lastRefreshStr = localStorage.getItem(STORAGE_KEY);
    const lastRefresh    = lastRefreshStr ? new Date(lastRefreshStr).getTime() : 0;
    const staleMs        = CACHE_HOURS * 3600 * 1000;

    if (Date.now() - lastRefresh < staleMs) return; // Still fresh

    // Background refresh — don't await, let it run silently
    fetchLiveRateClient().then((rate) => {
      if (!rate) return;
      localStorage.setItem(STORAGE_KEY, new Date().toISOString());
      // Persist to DB via server action (fire and forget)
      saveExchangeRate(rate).catch(() => { /* silent */ });
    }).catch(() => { /* ignore */ });
  }, [enabled]);
}
