'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Le pont avec la coque Android — ce que le navigateur ne fait pas tout seul
//
// Monté partout, actif seulement dans l'application (lib/native.ts). Dans un
// navigateur, il ne charge rien : le code de Capacitor n'est téléchargé que
// par la coque (import dynamique), la version web ne paie pas un octet.
//
// Phase 1 :
//   · le bouton retour d'Android : une feuille ouverte se referme d'abord
//     (lib/backStack.ts) ; sur l'accueil, il faut appuyer deux fois pour
//     sortir ; ailleurs, il revient à l'écran précédent ;
//   · `window.open` vers une adresse externe (le rappel « li pare », un
//     bilan WhatsApp) : la WebView ne gère pas les nouvelles fenêtres, on
//     confie donc l'adresse à la coque, qui l'ouvre dans WhatsApp.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { toast } from 'sonner';
import { useLanguage } from '../LanguageWrapper';
import { isExternalUrl, isNativeApp } from '../../lib/native';
import { isRootPath, runBackHandler, shouldExit } from '../../lib/backStack';

export function NativeBridge() {
  const pathname = usePathname();
  const { t } = useLanguage();
  // Lus dans l'écouteur, monté une seule fois : on garde la dernière valeur.
  const pathRef = useRef(pathname);
  const tRef = useRef(t);
  pathRef.current = pathname;
  tRef.current = t;

  useEffect(() => {
    if (!isNativeApp()) return;
    document.documentElement.classList.add('pp-native');

    let removeBack: (() => void) | null = null;
    let disposed = false;
    let lastBackAt: number | null = null;

    import('@capacitor/app')
      .then(async ({ App }) => {
        const handle = await App.addListener('backButton', ({ canGoBack }) => {
          if (runBackHandler()) return;
          if (isRootPath(pathRef.current) || !canGoBack) {
            const now = Date.now();
            if (shouldExit(lastBackAt, now)) {
              void App.exitApp();
              return;
            }
            lastBackAt = now;
            toast(tRef.current({ fr: 'Appuyez encore sur retour pour quitter', ht: 'Peze retounen ankò pou soti' }));
            return;
          }
          window.history.back();
        });
        if (disposed) void handle.remove();
        else removeBack = () => { void handle.remove(); };
      })
      .catch(() => { /* pont absent : le comportement par défaut de la WebView reste */ });

    // La mesure du démarrage (phase 1 : « moins de 3 s sur un Android d'entrée
    // de gamme »). La coque recopie la console dans les journaux Android :
    // `adb logcat | grep pp-startup` (mobile/README.md). Une ligne, une fois.
    const reportStartup = () => {
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
      const fcp = performance.getEntriesByType('paint').find((p) => p.name === 'first-contentful-paint');
      const js = performance.getEntriesByType('resource')
        .filter((r) => /\.js(\?|$)/.test(r.name))
        .reduce((sum, r) => sum + (r as PerformanceResourceTiming).transferSize, 0);
      console.info('[pp-startup]', JSON.stringify({
        path: window.location.pathname,
        ttfbMs: nav ? Math.round(nav.responseStart) : null,
        fcpMs: fcp ? Math.round(fcp.startTime) : null,
        domReadyMs: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
        loadMs: nav ? Math.round(nav.loadEventEnd) : null,
        jsTransferKB: Math.round(js / 1024),
      }));
    };
    if (document.readyState === 'complete') setTimeout(reportStartup, 0);
    else window.addEventListener('load', () => setTimeout(reportStartup, 0), { once: true });

    const originalOpen = window.open;
    window.open = function open(url?: string | URL, target?: string, features?: string) {
      const href = url === undefined ? '' : String(url);
      if (href && isExternalUrl(href, window.location.origin)) {
        // La coque intercepte la navigation et ouvre l'application concernée.
        window.location.assign(href);
        return null;
      }
      return originalOpen.call(window, url, target, features);
    } as typeof window.open;

    return () => {
      disposed = true;
      removeBack?.();
      window.open = originalOpen;
    };
  }, []);

  return null;
}
