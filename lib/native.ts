// ─────────────────────────────────────────────────────────────────────────────
// Suis-je dans l'application Android ?
//
// La même application web tourne dans deux contenants : le navigateur, et la
// coque Capacitor (capacitor.config.ts). La coque ajoute `ProfitPilotApp` à la
// fin du user-agent : c'est lisible partout, y compris côté serveur, et ça ne
// dépend pas du chargement du pont JavaScript de Capacitor.
//
// Ce module n'importe rien : il est lu par le serveur et par les écrans.
// ─────────────────────────────────────────────────────────────────────────────

export const NATIVE_UA_MARKER = 'ProfitPilotApp';

export function isNativeUserAgent(userAgent: string | null | undefined): boolean {
  return Boolean(userAgent && userAgent.includes(NATIVE_UA_MARKER));
}

/** Vrai dans la coque Android, faux dans un navigateur ou côté serveur. */
export function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false;
  const capacitor = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  if (capacitor?.isNativePlatform?.()) return true;
  return isNativeUserAgent(window.navigator?.userAgent);
}

/**
 * Vrai si l'adresse sort de l'application (WhatsApp, un site tiers). Dans la
 * coque, une telle adresse s'ouvre dans l'application qui sait la lire — la
 * WebView ne la charge pas à la place de ProfitPilot.
 */
export function isExternalUrl(href: string, currentOrigin: string): boolean {
  try {
    const url = new URL(href, currentOrigin);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return true;
    return url.origin !== currentOrigin;
  } catch {
    return false;
  }
}
