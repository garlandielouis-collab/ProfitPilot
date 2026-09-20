// ─────────────────────────────────────────────────────────────────────────────
// Les images de gabarit
//
// Une vitrine neuve n'a aucune photo : le marchand vient de créer sa boutique,
// il n'a pas encore de bannière, pas d'image pour son histoire, rien derrière sa
// bande d'appel. Jusqu'ici, ces endroits-là tombaient sur un aplat de couleur —
// techniquement correct, et exactement ce qui fait qu'une page « ressemble à un
// gabarit vide » plutôt qu'à une boutique.
//
// Ce fichier donne à chaque gabarit ses images de départ, et dit laquelle va où.
//
// ── Deux natures d'image, et pourquoi ──────────────────────────────────────
//
// Une PHOTOGRAPHIE pour la bannière et pour l'illustration de l'histoire
// (`scripts/gabarits-photos.js`). Une boutique se juge en une seconde sur son
// premier écran, et une seconde ne suffit pas à lire un dégradé : la première
// version de ce fichier ne posait que des compositions abstraites, et une page
// neuve avait beau être propre, elle ne donnait envie de rien.
//
// Une COMPOSITION DESSINÉE pour la bande d'appel et la vignette de rayon
// (`scripts/gabarits-art.js`). Ce n'est pas un pis-aller : une bande porte du
// texte en grand, qu'une photo rend illisible ou éteint ; et une vignette de
// rayon photographique montrerait des produits qui ne sont pas ceux du
// marchand, à l'endroit précis où le visiteur clique pour voir les siens.
//
// ── Ce qu'une photographie de gabarit n'est pas ────────────────────────────
//
// Ce n'est pas la boutique du marchand, et rien ne doit laisser croire qu'elle
// l'est. Elle montre un métier, une matière, un rayon — jamais une devanture
// avec une enseigne, jamais un prix, jamais un logo. C'est une image de DÉPART,
// au sens où tous les créateurs de sites en livrent avec leurs thèmes : le
// marchand la remplace par la sienne, et l'éditeur le lui dit à l'endroit où il
// pose sa photo.
//
// Et JAMAIS de photo de produit, d'aucune sorte : le catalogue est le seul
// endroit de la vitrine où une image engage un achat, et celles-là
// n'appartiennent qu'au marchand.
//
// ── Elles ne passent jamais devant le marchand ─────────────────────────────
//
// Chaque appel est un REPLI. L'ordre est toujours : ce que le marchand a
// téléversé, puis ce qu'il a en réglages, puis l'image du gabarit. Le jour où
// il ajoute sa photo, elle prend la place, sans qu'il ait à retirer quoi que ce
// soit.
// ─────────────────────────────────────────────────────────────────────────────

import { isTemplateId, type TemplateId } from './storeTheme';
import { hasPhoto, hasBandPhoto } from './storeArtManifest';

/**
 * Les quatre emplois d'une image de gabarit.
 *
 *   'hero'   la bannière, en 16/9 — texte clair posé dessus
 *   'story'  l'illustration de « notre histoire », en 4/5
 *   'band'   le fond d'une bande large : appel final, promotion, vidéo
 *   'tile'   la vignette d'un rayon sans photo de produit
 */
export type ArtSlot = 'hero' | 'story' | 'band' | 'tile';

export const ART_SLOTS: readonly ArtSlot[] = ['hero', 'story', 'band', 'tile'] as const;

/** Le gabarit dont l'art sert de repli quand l'identifiant est inconnu. */
const FALLBACK: TemplateId = 'retail';

/**
 * Les deux emplois qui reçoivent une PHOTOGRAPHIE.
 *
 * La bannière et l'illustration de l'histoire sont les deux endroits où une
 * page doit donner envie en une seconde — et une seconde ne suffit pas à lire
 * un dégradé. Ils reçoivent donc une photo de départ, choisie pour le métier du
 * gabarit (`scripts/gabarits-photos.js`).
 *
 * Les deux autres restent dessinés, et c'est délibéré. Une bande d'appel porte
 * du texte en grand : une photo dessous le rend illisible ou l'éteint. Et une
 * vignette de RAYON qui serait photographique montrerait des produits qui ne
 * sont pas ceux du marchand, à l'endroit précis où le visiteur clique pour voir
 * les siens.
 */
const PHOTO_SLOTS: readonly ArtSlot[] = ['hero', 'story'];

/**
 * L'adresse de l'image de gabarit, sous `public/`.
 *
 * Ne lève jamais et ne rend jamais `null` : les 23 gabarits ont leurs images, et
 * un `template_id` écrit à la main en base retombe sur celles de « retail »
 * plutôt que de laisser un trou dans la page d'un marchand. Un gabarit sans
 * photographie retombe sur sa composition dessinée.
 */
export function templateArt(templateId: TemplateId | string, slot: ArtSlot): string {
  const id = isTemplateId(templateId) ? templateId : FALLBACK;
  // L'exception à la règle ci-dessus : un gabarit dont la promotion pose une
  // photo À CÔTÉ du texte (« Style Chic ») — aucun texte ne s'y superpose,
  // donc l'argument qui garde les bandes dessinées ne s'applique pas.
  if (slot === 'band' && hasBandPhoto(id)) return `/gabarits/photo/${id}-band.webp`;
  return PHOTO_SLOTS.includes(slot) && hasPhoto(id)
    ? `/gabarits/photo/${id}-${slot}.webp`
    : `/gabarits/art/${id}-${slot}.webp`;
}

/** Vrai quand l'image affichée est une photographie de gabarit. */
export function isTemplatePhoto(src: string | null | undefined): boolean {
  return typeof src === 'string' && src.startsWith('/gabarits/photo/');
}

/**
 * L'image d'un emplacement : celle du marchand si elle existe, sinon celle du
 * gabarit.
 *
 * Une seule fonction pour que l'ordre de priorité ne se réécrive pas à chaque
 * appel — c'est ainsi qu'une section finit par montrer l'image du gabarit alors
 * que le marchand en avait posé une.
 */
export function artOr(
  own: string | null | undefined,
  templateId: TemplateId | string,
  slot: ArtSlot,
): string {
  return own?.trim() || templateArt(templateId, slot);
}

/**
 * Vrai quand l'image affichée est une composition DESSINÉE du gabarit.
 *
 * Sert aux voiles, et les trois cas sont différents : une photo de marchand
 * demande un assombrissement franc pour que le texte reste lisible ; une photo
 * de gabarit aussi ; une composition dessinée, non — elle est construite autour
 * de son texte, sa lumière est déjà placée et son bas déjà creusé. Les
 * assombrir toutes pareil éteindrait l'une ou rendrait les autres illisibles.
 */
export function isTemplateArt(src: string | null | undefined): boolean {
  return typeof src === 'string' && src.startsWith('/gabarits/art/');
}

/**
 * Le voile à poser sur l'image d'une bannière, en fraction de noir.
 *
 * Une seule fonction, parce que trois bannières sur huit calculaient ce voile
 * chacune à leur façon — et qu'un gabarit dont le texte est illisible n'est pas
 * un défaut visible en revue de code, il est visible chez le client du
 * marchand.
 */
export function heroOverlay(image: string, merchantOverlay: number): number {
  if (isTemplateArt(image))   return 0.12;
  if (isTemplatePhoto(image)) return 0.52;
  return merchantOverlay / 100;
}
