'use client';

// ─────────────────────────────────────────────────────────────────────────────
// L'image d'une vitrine
//
// `next/image` optimise — et refuse de rendre un hôte absent de
// `next.config.mjs → images.remotePatterns`, avec une erreur au RENDU, pas au
// build. Les photos produits des marchands viennent de partout : Supabase
// Storage pour celles qu'ils téléversent et pour les retouches du Studio IA,
// mais aussi d'une URL collée depuis un fournisseur, un Drive, un catalogue.
//
// Ajouter `hostname: '**'` réglerait le refus et ouvrirait notre optimiseur
// d'images à l'internet entier : n'importe qui pourrait faire redimensionner
// ses images par notre serveur, sur notre facture.
//
// Donc : optimisation quand l'image est chez nous, balise simple sinon. Le
// visiteur voit la même chose ; seul le chemin de livraison diffère.
//
// ── Ce que `sizes` change, et pourquoi il n'est plus facultatif ─────────────
//
// Une image en `fill` sans `sizes` vaut `100vw` pour le navigateur : il
// télécharge la variante pleine largeur — 1920 pixels — pour une vignette qui
// s'affiche à 300. Sur une connexion mobile haïtienne, cela se compte en
// secondes d'attente par produit. Le §26 le dit sans détour : « ne jamais
// charger une image 3000px si le composant n'en affiche que 400 ». Le paramètre
// est donc obligatoire ici, et les valeurs vivent dans `lib/storeImage.ts` avec
// les contextes qu'elles servent, pour qu'aucun appelant n'ait à les inventer.
// ─────────────────────────────────────────────────────────────────────────────

import Image from 'next/image';
import { useState } from 'react';
import { isOptimizable, focalPosition, alreadyBroken, type Focal } from '../../../lib/storeImage';

type Props = {
  src:  string;
  alt:  string;
  /** À quoi ressemblera l'image à l'écran. Voir `IMAGE_SIZES`. */
  sizes: string;
  className?: string;
  priority?:  boolean;
  /** Le point conservé quand `object-cover` rogne. */
  focal?: Focal;
  /**
   * Qualité de compression. 72 par défaut sur les vignettes : au-delà, le poids
   * monte plus vite que ce que l'œil distingue sur une carte de 300 pixels.
   */
  quality?: number;
  /** Appelé quand l'image ne se charge pas : le cadre reprend la main. */
  onError?: () => void;
};

/** À poser dans un parent `relative` : l'image remplit son conteneur. */
export function StoreImage({
  src, alt, sizes, className, priority = false, focal = 'center', quality, onError,
}: Props) {
  const objectPosition = focalPosition(focal);

  // Une image qui ne charge pas ne laisse pas son icône cassée à l'écran.
  //
  // Les marchands collent des adresses hébergées ailleurs — un lien de
  // fournisseur, un partage Drive, un CDN gratuit — et ces hôtes disparaissent.
  // La boutique de test en avait deux : son logo et sa bannière rendaient 410,
  // et le visiteur voyait la vignette cassée du navigateur en haut de la page,
  // à l'endroit exact où la boutique se présente.
  //
  // On rend donc `null` : le fond du cadre reprend la main, et le parent — qui
  // reçoit `onError` — peut afficher son propre repère.
  const [failed, setFailed] = useState(false);
  if (failed) return null;

  function handleError() {
    setFailed(true);
    onError?.();
  }

  // La page est rendue sur le serveur : le navigateur télécharge l'image bien
  // avant que React ait posé `onError`. Une image déjà en échec à
  // l'hydratation n'émettra plus rien — on lui demande son état au montage,
  // sinon la vignette cassée reste à l'écran (voir `alreadyBroken`).
  function checkOnMount(el: HTMLImageElement | null) {
    if (alreadyBroken(el)) handleError();
  }

  if (isOptimizable(src)) {
    return (
      <Image
        ref={checkOnMount}
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        quality={quality ?? 72}
        className={className}
        style={{ objectPosition }}
        onError={handleError}
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- hôte non déclaré : voir l'en-tête
    <img
      ref={checkOnMount}
      src={src}
      alt={alt}
      loading={priority ? 'eager' : 'lazy'}
      // `fetchpriority` est le seul levier qui reste sur une image que nous ne
      // servons pas : il ne réduit pas son poids, il décide de son rang dans la
      // file d'attente du navigateur. La bannière passe devant, les vignettes
      // du bas de page attendent.
      fetchPriority={priority ? 'high' : 'auto'}
      decoding="async"
      className={`absolute inset-0 h-full w-full ${className ?? ''}`}
      style={{ objectPosition }}
      onError={handleError}
    />
  );
}
