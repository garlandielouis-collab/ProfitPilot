// ─────────────────────────────────────────────────────────────────────────────
// La normalisation des images produits
//
// C'était le premier défaut de la vitrine, et le plus visible : une boutique
// dont un produit est photographié de près et le suivant de loin donnait deux
// vignettes sans rapport, l'une remplie jusqu'aux bords, l'autre perdue au
// milieu. Le catalogue paraissait bricolé alors que les produits ne l'étaient
// pas.
//
// La règle, en une phrase : **ce n'est pas l'image qui décide de la mise en
// page, c'est la mise en page qui décide du cadre de l'image.**
//
//   Photo d'origine  →  Cadre normalisé  →  Ajustement (cover / contain)
//                    →  Air intérieur    →  Taille livrée au navigateur
//
// Quatre étapes, aucune facultative :
//
//   Le CADRE vient du gabarit (`lib/storeDesign.ts`), pas de l'image. Toutes
//   les vignettes d'une grille ont le même rapport : c'est ce qui fait qu'une
//   ligne de produits se lit comme une ligne, et non comme une pile.
//
//   L'AJUSTEMENT dit quoi faire quand l'image ne remplit pas le cadre.
//   `cover` rogne — bon pour une photo de mise en scène. `contain` réduit et
//   laisse de l'air — bon pour un produit détouré, qui serait sinon coupé.
//
//   L'AIR INTÉRIEUR empêche le produit de toucher les bords. Un flacon collé au
//   cadre paraît à l'étroit ; à 14 % d'air, il paraît présenté.
//
//   La TAILLE LIVRÉE est l'attribut `sizes`. Sans lui, le navigateur télécharge
//   la plus grande variante d'une image affichée à 300 pixels (§26). C'est la
//   règle « ne jamais charger une image 3000px pour un composant de 400px »,
//   et elle ne se respecte pas toute seule : elle s'écrit.
// ─────────────────────────────────────────────────────────────────────────────

import type { MediaFit, MediaRule } from './storeDesign';

export type { MediaFit, MediaRule };

/**
 * Le point de l'image qui reste visible quand `cover` rogne.
 *
 * Les photos de produits sont cadrées au centre neuf fois sur dix ; les photos
 * de mode le sont sur le haut du corps. Le jour où le marchand pourra désigner
 * ce point lui-même (§32 — traitement d'image), c'est cette valeur qui viendra
 * de la fiche produit. En attendant, le gabarit choisit, et il choisit mieux
 * qu'un défaut unique.
 */
export type Focal = 'center' | 'top' | 'bottom' | 'left' | 'right';

const FOCAL_CSS: Record<Focal, string> = {
  center: '50% 50%',
  top:    '50% 20%',
  bottom: '50% 80%',
  left:   '20% 50%',
  right:  '80% 50%',
};

export function focalPosition(focal: Focal = 'center'): string {
  return FOCAL_CSS[focal] ?? FOCAL_CSS.center;
}

// ── Les contextes d'affichage ───────────────────────────────────────────────
//
// Chacun connaît la largeur à laquelle son image sera RÉELLEMENT rendue. C'est
// la seule information qui manque au navigateur, et c'est celle qui décide du
// poids téléchargé.

export const IMAGE_SIZES = {
  /** Une carte dans une grille de deux colonnes sur mobile. */
  card:      '(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw',
  /** Une carte dans une grille large — une seule colonne sur mobile. */
  cardWide:  '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw',
  /** L'image principale d'une fiche produit. */
  gallery:   '(max-width: 1024px) 100vw, 46vw',
  /** Une vignette de galerie. */
  thumb:     '80px',
  /** Une bannière pleine largeur. */
  hero:      '100vw',
  /** La moitié d'une bannière en deux colonnes. */
  heroSplit: '(max-width: 768px) 100vw, 50vw',
  /** Une ligne de panier ou une suggestion de recherche. */
  row:       '96px',
  /** Une bande large posée dans la page : promotion, appel final, vidéo. */
  band:      '(max-width: 1200px) 100vw, 1200px',
  /** Un encart de contenu à mi-largeur. */
  editorial: '(max-width: 768px) 100vw, 50vw',
} as const;

export type ImageContext = keyof typeof IMAGE_SIZES;

// ── Le style d'un cadre normalisé ───────────────────────────────────────────

/**
 * Le cadre : rapport imposé, fond, et rien d'autre.
 *
 * Le fond compte plus qu'il n'en a l'air. En `contain`, ce qui n'est pas
 * couvert par l'image reste visible ; laisser passer le blanc de la page fait
 * flotter le produit dans le vide, alors qu'un fond de surface secondaire
 * dessine une vignette.
 */
export function frameStyle(rule: MediaRule): React.CSSProperties {
  return {
    aspectRatio: rule.ratio,
    background:  'var(--st-surface-2)',
  };
}

/** L'air intérieur, en `contain` seulement : en `cover` il rognerait davantage. */
export function framePadding(rule: MediaRule): string | undefined {
  if (rule.fit !== 'contain' || rule.pad <= 0) return undefined;
  return `${rule.pad}%`;
}

/** Les classes d'ajustement, écrites en toutes lettres pour Tailwind. */
export function fitClass(fit: MediaFit): string {
  return fit === 'contain' ? 'object-contain' : 'object-cover';
}

// ── L'optimiseur ────────────────────────────────────────────────────────────

const SUPABASE_HOST = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').hostname;
  } catch {
    return null;
  }
})();

/**
 * Vrai quand `next/image` a le droit de servir cette image.
 *
 * `next.config.mjs → images.remotePatterns` n'autorise que notre hôte de
 * stockage. Ouvrir l'optimiseur à l'internet entier ferait redimensionner
 * n'importe quelle image du web sur notre facture — la raison est détaillée
 * dans `components/store/blocks/StoreImage.tsx`.
 */
export function isOptimizable(src: string): boolean {
  if (src.startsWith('/')) return true;
  try {
    return new URL(src).hostname === SUPABASE_HOST;
  } catch {
    return false;
  }
}

/**
 * Vrai quand l'image vient d'ailleurs et sera donc servie telle quelle.
 *
 * Sert au diagnostic de la vitrine : une boutique dont la moitié des photos
 * viennent d'un lien collé se charge lentement sur une connexion haïtienne, et
 * le marchand doit pouvoir l'apprendre autrement qu'en perdant des clients.
 */
export function unoptimizedCount(urls: Array<string | null | undefined>): number {
  return urls.filter((u): u is string => typeof u === 'string' && !isOptimizable(u)).length;
}

// ── Le repli d'une image qui ne charge pas ──────────────────────────────────
//
// `onError` seul ne suffit pas, et c'est contre-intuitif : la vitrine est
// rendue sur le serveur, donc le navigateur commence à télécharger les images
// dès qu'il lit le HTML — bien avant que React ait hydraté la page et posé le
// moindre gestionnaire. Une image qui échoue pendant cette fenêtre a déjà émis
// son évènement `error` quand le gestionnaire arrive : il ne se déclenchera
// jamais, et le repli écrit pour ce cas précis ne s'exécute pas.
//
// C'est exactement ce qui se passait sur la boutique de test, dont le logo et
// la bannière sont hébergés sur un CDN qui répond 410 : les deux vignettes
// cassées du navigateur restaient à l'écran, dans l'en-tête et en haut de la
// page d'accueil, sur tous les gabarits.
//
// À l'hydratation, on ne demande donc pas au navigateur de prévenir : on lui
// demande où il en est.
export function alreadyBroken(el: HTMLImageElement | null): boolean {
  if (!el) return false;
  // Un SVG sans dimensions intrinsèques rend `naturalWidth` nul dans certains
  // navigateurs alors qu'il s'affiche parfaitement. Le tenir pour cassé
  // effacerait un logo valide — l'inverse exact du but poursuivi.
  if (/\.svg(?:[?#]|$)/i.test(el.currentSrc || el.src)) return false;
  return el.complete && el.naturalWidth === 0;
}
