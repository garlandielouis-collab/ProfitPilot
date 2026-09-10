'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Le cadre d'une photo produit
//
// Un seul composant, et c'est délibéré : partout où la vitrine montre un
// produit — carte, galerie, ligne de panier, suggestion de recherche — c'est ce
// cadre qui décide du rapport, de l'ajustement et de l'air. Le jour où le
// cadrage doit changer, il change en un endroit.
//
// ── Ce qu'il règle ─────────────────────────────────────────────────────────
//
// Une boutique reçoit des photos qu'elle n'a pas prises : un flacon détouré sur
// blanc à 3 000 pixels, une capture d'écran de fournisseur en 400 × 260, une
// photo de téléphone en portrait. Rendues telles quelles, elles donnent une
// grille où chaque vignette a sa propre hauteur et son propre cadrage — le
// défaut que le §3 du cahier de refonte décrit comme « le plus gros problème ».
//
// Ici, le cadre est imposé par le gabarit et l'image s'y plie :
//
//   `cover`   — l'image remplit et se fait rogner. Pour une photo de mise en
//               scène, où le sujet occupe déjà toute l'image.
//   `contain` — l'image entière tient dans le cadre, avec de l'air autour. Pour
//               un produit détouré, qui serait sinon coupé en deux.
//
// ── La seconde photo au survol ─────────────────────────────────────────────
//
// Elle n'est ni un gadget ni une animation : sur un vêtement, c'est le dos du
// modèle ; sur un appareil, c'est la connectique. Elle ne se charge qu'en
// paresseux et ne s'active que sur les appareils qui ont un vrai survol —
// `group-hover` sur mobile se déclenche au toucher et masquerait la photo
// principale au moment précis où le visiteur l'a touchée pour l'ouvrir.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { ImageIcon } from 'lucide-react';
import { StoreImage } from './StoreImage';
import {
  fitClass, framePadding, focalPosition,
  type MediaRule, type Focal,
} from '../../../lib/storeImage';

type Props = {
  src:  string | null;
  alt:  string;
  rule: MediaRule;
  sizes: string;
  priority?: boolean;
  focal?: Focal;
  /** La photo montrée au survol, sur grand écran seulement. */
  hoverSrc?: string | null;
  /** Le rayon du cadre. Par défaut celui du gabarit. */
  radius?: string;
  /** Posé sur l'image, pas sur le cadre : zoom au survol, opacité, etc. */
  imageClassName?: string;
  /** Posé sur le cadre : bordure, ombre. */
  className?: string;
  children?: React.ReactNode;
};

export function ProductMedia({
  src, alt, rule, sizes, priority = false, focal = 'center',
  hoverSrc = null, radius, imageClassName, className, children,
}: Props) {
  const pad = framePadding(rule);
  const fit = fitClass(rule.fit);

  // Une photo qui ne charge pas.
  //
  // Ce n'est pas un cas d'école : les marchands collent des adresses d'images
  // hébergées ailleurs, et ces hôtes disparaissent. La boutique de test en avait
  // une, rendue par son CDN en 410 — l'article s'affichait avec l'icône d'image
  // cassée du navigateur, au milieu d'une grille par ailleurs propre.
  //
  // Le cadre reprend alors la main et montre le même repère que pour un produit
  // sans photo. Le visiteur voit un article sans image ; il ne voit pas une
  // page qui a l'air abîmée.
  const [failed, setFailed] = useState(false);
  const usable = src && !failed ? src : null;

  return (
    <div
      className={`relative w-full overflow-hidden ${className ?? ''}`}
      style={{
        // Le rapport est posé sur le CADRE, jamais sur l'image : c'est ce qui
        // réserve la place avant que la photo arrive et supprime le décalage de
        // mise en page (§26 — éviter le CLS).
        aspectRatio:  rule.ratio,
        background:   'var(--st-surface-2)',
        borderRadius: radius ?? 'var(--st-radius-media)',
      }}
    >
      {usable ? (
        <>
          {/* L'air intérieur est un calque, pas une marge du cadre : le fond et
              le rayon restent ceux de la vignette, seul le produit rétrécit. */}
          <div className="absolute inset-0" style={pad ? { padding: pad } : undefined}>
            <div className="relative h-full w-full">
              <StoreImage
                src={usable}
                alt={alt}
                sizes={sizes}
                priority={priority}
                focal={focal}
                onError={() => setFailed(true)}
                className={[
                  fit,
                  hoverSrc ? 'transition-opacity duration-500 sm:group-hover:opacity-0' : '',
                  imageClassName ?? '',
                ].join(' ')}
              />

              {hoverSrc && (
                <img
                  // eslint-disable-next-line @next/next/no-img-element -- calque décoratif, jamais seul porteur de sens
                  src={hoverSrc}
                  alt=""
                  aria-hidden
                  loading="lazy"
                  decoding="async"
                  className={`absolute inset-0 hidden h-full w-full opacity-0 transition-opacity duration-500 sm:block sm:group-hover:opacity-100 ${fit}`}
                  style={{ objectPosition: focalPosition(focal) }}
                />
              )}
            </div>
          </div>
        </>
      ) : (
        // Pas de photo : un cadre tenu, pas un trou. Une grille où deux produits
        // sur douze n'ont pas d'image doit rester une grille.
        <div className="absolute inset-0 flex items-center justify-center text-[var(--st-ink-3)]">
          <ImageIcon className="h-8 w-8" strokeWidth={1.4} aria-hidden />
        </div>
      )}

      {children}
    </div>
  );
}
