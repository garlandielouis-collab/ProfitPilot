'use client';

// ─────────────────────────────────────────────────────────────────────────────
// L'aperçu de la boutique (§34)
//
// « Le rendu doit être exactement celui du storefront réel. Éviter deux
//   systèmes de rendu différents. »
//
// Ce qu'il y avait avant : un aperçu dessiné à la main dans la page de
// réglages — sa propre bannière, sa propre barre de navigation, sa propre carte
// produit, avec des dégradés et des coins arrondis que la vraie vitrine n'a
// jamais eus. Deux moteurs de rendu, donc deux vérités, et le marchand
// découvrait la seconde après avoir publié.
//
// Ce qu'il y a maintenant : la vitrine elle-même, dans un cadre. Un seul moteur
// de rendu. Ce que l'aperçu montre est, littéralement, ce que le client verra —
// y compris le gabarit, le thème, l'ordre des sections et les états vides.
//
// ── Les trois tailles ──────────────────────────────────────────────────────
//
// 390, 820 et pleine largeur : un iPhone courant, une tablette, un ordinateur.
// Le cadre est mis à l'échelle pour tenir dans la colonne — l'iframe garde donc
// sa VRAIE largeur en pixels CSS, et les points de rupture de la vitrine se
// déclenchent comme sur l'appareil. Réduire la largeur de l'iframe au lieu de
// la mettre à l'échelle donnerait un aperçu mobile... du rendu desktop.
//
// L'iframe est en `sandbox` : elle exécute les scripts de la vitrine et rien
// d'autre. Le marchand consulte son propre site, mais un aperçu n'a aucune
// raison de pouvoir naviguer la page qui le contient.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useRef, useState } from 'react';
import { Monitor, Tablet, Smartphone, RefreshCw, ExternalLink } from 'lucide-react';

type Device = 'mobile' | 'tablet' | 'desktop';

const DEVICES: Record<Device, { label: string; width: number; height: number; Icon: typeof Monitor }> = {
  mobile:  { label: 'Mobile',  width: 390,  height: 780, Icon: Smartphone },
  tablet:  { label: 'Tablette', width: 820, height: 900, Icon: Tablet },
  desktop: { label: 'Ordinateur', width: 1280, height: 900, Icon: Monitor },
};

export function StorePreview({
  slug, path = '', className,
}: {
  slug: string;
  /** Le chemin à afficher dans la vitrine : '', '/products', '/cart'… */
  path?: string;
  className?: string;
}) {
  const [device, setDevice] = useState<Device>('desktop');
  // Change à chaque rechargement demandé : remonter l'iframe est le seul moyen
  // fiable de la recharger sans toucher à son historique.
  const [nonce, setNonce] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  const src = useMemo(
    () => `/store/${slug}${path}${path.includes('?') ? '&' : '?'}pp_preview=${nonce}`,
    [slug, path, nonce],
  );

  const { width, height, label } = DEVICES[device];

  // L'échelle est fixe par appareil, pas mesurée : la page de réglages a une
  // largeur connue, et un aperçu qui change de taille pendant qu'on le regarde
  // est plus déroutant qu'un aperçu légèrement plus petit que la place libre.
  const scale = device === 'desktop' ? 0.62 : device === 'tablet' ? 0.72 : 1;

  return (
    <div className={className}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div
          className="flex items-center gap-1 rounded-surface border border-border p-1 dark:border-dark-border"
          role="group"
          aria-label="Taille d'écran"
        >
          {(Object.keys(DEVICES) as Device[]).map((key) => {
            const { Icon, label: deviceLabel } = DEVICES[key];
            const active = device === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setDevice(key)}
                aria-pressed={active}
                className={[
                  'flex min-h-touch items-center gap-2 rounded-control px-3 text-body font-semibold transition',
                  active
                    ? 'bg-primary text-white'
                    : 'text-text2 hover:bg-surface dark:text-dark-text2 dark:hover:bg-white/5',
                ].join(' ')}
              >
                <Icon className="h-4 w-4" strokeWidth={1.9} aria-hidden />
                <span className="hidden sm:inline">{deviceLabel}</span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => setNonce((n) => n + 1)}
          className="flex min-h-touch items-center gap-2 rounded-control border border-border px-3 text-body font-semibold text-text2 transition hover:bg-surface dark:border-dark-border dark:text-dark-text2 dark:hover:bg-white/5"
        >
          <RefreshCw className="h-4 w-4" strokeWidth={1.9} aria-hidden />
          Actualiser
        </button>

        <a
          href={`/store/${slug}${path}`}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto flex min-h-touch items-center gap-2 rounded-control border border-border px-3 text-body font-semibold text-text2 transition hover:bg-surface dark:border-dark-border dark:text-dark-text2 dark:hover:bg-white/5"
        >
          <ExternalLink className="h-4 w-4" strokeWidth={1.9} aria-hidden />
          Ouvrir
        </a>
      </div>

      {/* Le cadre. `overflow-hidden` + mise à l'échelle : l'iframe garde sa
          largeur réelle, on ne fait que la réduire pour qu'elle tienne. Le
          mobile n'est pas réduit — 390 pixels tiennent déjà, et le réduire
          rendrait le texte illisible juste là où on veut le vérifier. */}
      <div
        ref={wrapRef}
        className="mx-auto overflow-hidden rounded-surface border border-border bg-surface dark:border-dark-border"
        style={{ height: height * scale, width: width * scale, maxWidth: '100%' }}
      >
        <div
          className="origin-top-left"
          style={{ width, height, transform: `scale(${scale})` }}
        >
          <iframe
            key={nonce}
            src={src}
            title={`Aperçu de la boutique — ${label}`}
            sandbox="allow-scripts allow-same-origin allow-popups"
            loading="lazy"
            className="h-full w-full border-0"
          />
        </div>
      </div>

      <p className="mt-2 text-note text-muted dark:text-dark-muted">
        C'est votre vitrine réelle, pas une simulation : ce que vous voyez ici
        est exactement ce que verra votre client.
      </p>
    </div>
  );
}
