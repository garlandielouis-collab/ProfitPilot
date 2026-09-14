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
// ── L'échelle est MESURÉE, et le défaut suit l'écran ───────────────────────
//
// Les deux étaient figés, et le marchand sur téléphone n'y survivait pas.
// L'aperçu s'ouvrait sur « Ordinateur » — 1 280 px réduits d'un facteur fixe de
// 0,62, soit un cadre de 794 px — dans une colonne qui en fait 358. Le
// `overflow-hidden` faisait le reste : il voyait le tiers gauche de sa vitrine,
// titre coupé au milieu d'un mot, et concluait que sa page ne s'affichait pas.
// Sur son téléphone, l'écran qui promet « exactement ce que verra votre client »
// était le seul du produit à ne rien montrer.
//
// Deux corrections, et aucune n'enlève de choix au marchand :
//
//   Le DÉFAUT est celui de son écran. Un téléphone ouvre l'aperçu mobile — la
//   taille sur laquelle il va de toute façon juger, puisque ses clients y sont.
//   Les trois boutons restent : depuis son ordinateur il regarde le rendu
//   téléphone, et depuis son téléphone il peut vérifier le rendu bureau.
//
//   L'ÉCHELLE vient de la place réellement disponible, relevée sur le cadre
//   lui-même (`ResizeObserver`) : le gabarit choisi tient TOUJOURS en entier,
//   que la colonne fasse 358 px ou 900. Un facteur fixe ne peut pas tenir cette
//   promesse — il est juste pour une largeur, et faux pour toutes les autres.
//
// L'iframe est en `sandbox` : elle exécute les scripts de la vitrine et rien
// d'autre. Le marchand consulte son propre site, mais un aperçu n'a aucune
// raison de pouvoir naviguer la page qui le contient.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from 'react';
import { Monitor, Tablet, Smartphone, RefreshCw, ExternalLink } from 'lucide-react';

type Device = 'mobile' | 'tablet' | 'desktop';

const DEVICES: Record<Device, { label: string; width: number; height: number; Icon: typeof Monitor }> = {
  mobile:  { label: 'Mobile',  width: 390,  height: 780, Icon: Smartphone },
  tablet:  { label: 'Tablette', width: 820, height: 900, Icon: Tablet },
  desktop: { label: 'Ordinateur', width: 1280, height: 900, Icon: Monitor },
};

/**
 * La taille sur laquelle l'aperçu s'ouvre : celle de l'écran qui le demande.
 *
 * Les seuils sont ceux des DEVICES eux-mêmes, pas ceux de Tailwind : on choisit
 * le plus grand appareil que la fenêtre peut montrer sans le réduire à rien.
 */
function deviceForViewport(width: number): Device {
  if (width < 768)  return 'mobile';
  if (width < 1280) return 'tablet';
  return 'desktop';
}

/**
 * L'échelle utilisée tant que la largeur disponible n'a pas encore été relevée
 * — le temps d'une image. Volontairement prudente : mieux vaut un cadre un peu
 * trop petit pendant 16 ms qu'un cadre qui déborde puis se recadre.
 */
const FALLBACK_SCALE: Record<Device, number> = { mobile: 0.9, tablet: 0.5, desktop: 0.3 };

export function StorePreview({
  slug, path = '', className,
}: {
  slug: string;
  /** Le chemin à afficher dans la vitrine : '', '/products', '/cart'… */
  path?: string;
  className?: string;
}) {
  // L'appareil de départ est celui du marchand. Lu à l'initialisation plutôt
  // que dans un effet : l'aperçu n'est monté qu'après le chargement des
  // réglages, donc côté navigateur — aucun rendu serveur à faire coïncider.
  const [device, setDevice] = useState<Device>(() =>
    typeof window === 'undefined' ? 'desktop' : deviceForViewport(window.innerWidth),
  );
  // Change à chaque rechargement demandé : remonter l'iframe est le seul moyen
  // fiable de la recharger sans toucher à son historique.
  const [nonce, setNonce] = useState(0);
  // La largeur réellement offerte au cadre, relevée sur la page. Zéro tant
  // qu'aucune mesure n'a eu lieu.
  const [avail, setAvail] = useState(0);
  const fitRef  = useRef<HTMLDivElement>(null);

  const src = useMemo(
    () => `/store/${slug}${path}${path.includes('?') ? '&' : '?'}pp_preview=${nonce}`,
    [slug, path, nonce],
  );

  const { width, height, label } = DEVICES[device];

  // La place disponible, suivie tant que le cadre est à l'écran : rotation du
  // téléphone, ouverture de la barre latérale, fenêtre redimensionnée.
  useEffect(() => {
    const el = fitRef.current;
    if (!el) return;

    const measure = () => setAvail(el.clientWidth);
    measure();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Jamais d'agrandissement : un aperçu mobile étiré à 900 px ne serait plus
  // l'écran du client. On réduit pour faire tenir, et c'est tout.
  const scale = avail > 0 ? Math.min(1, avail / width) : FALLBACK_SCALE[device];

  return (
    <div className={className} ref={fitRef}>
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
                // Le libellé disparaît sous 640 px : sans cet attribut, les
                // trois boutons de l'écran le plus visuel du produit n'ont
                // aucun nom pour un lecteur d'écran (§3.5).
                aria-label={deviceLabel}
                title={deviceLabel}
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
          largeur réelle, on ne fait que la réduire pour qu'elle tienne. La
          hauteur suit la même échelle que la largeur, sinon le cadre garderait
          une bande vide sous la page. */}
      <div
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
