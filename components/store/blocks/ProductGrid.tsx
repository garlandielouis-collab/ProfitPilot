'use client';

// ─────────────────────────────────────────────────────────────────────────────
// La grille de produits
//
// Elle existe pour une raison simple : cinq écrans affichaient une grille de
// cartes — l'accueil, le catalogue, la fiche produit, les favoris, la
// collection — et chacun décidait de son nombre de colonnes, de son écart et de
// son attribut `sizes`. Trois d'entre eux se trompaient sur le dernier, et
// livraient des images de 1 920 pixels dans des vignettes de 300 (§26).
//
// Ici, les trois se déduisent du gabarit : la densité, l'espacement et la
// taille livrée au navigateur sortent du même profil, donc ils ne peuvent plus
// se contredire.
//
// Le §4 en dépend directement : « ne jamais avoir 4 produits énormes qui
// remplissent tout l'écran ». La contrainte n'est pas dans une feuille de
// style, elle est dans `lib/storeDesign.ts`, où chaque gabarit déclare combien
// de colonnes il tient sur chaque palier.
// ─────────────────────────────────────────────────────────────────────────────

import { ProductCard, type ProductRating } from './ProductCard';
import { designFor, gridClass, gridSizes, type DesignProfile } from '../../../lib/storeDesign';
import type { StoreProduct, StoreView } from '../types';

export type RatingMap = Record<string, ProductRating>;

export function ProductGrid({
  store, products, ratings, design, priorityCount = 4, className,
}: {
  store:    StoreView;
  products: StoreProduct[];
  /** Les notes réelles, produit par produit. Absentes : aucune étoile. */
  ratings?: RatingMap;
  design?:  DesignProfile;
  /**
   * Combien de cartes se chargent en priorité. Ce sont celles du premier écran,
   * et elles seules : marquer toute la grille « prioritaire » revient à ne rien
   * prioriser, et retarde la plus grande image de la page.
   */
  priorityCount?: number;
  className?: string;
}) {
  const d     = design ?? designFor(store.templateId);
  const sizes = gridSizes(d);

  return (
    <div
      className={`grid ${gridClass(d)} ${className ?? ''}`}
      style={{ gap: 'var(--st-grid-gap)' }}
    >
      {products.map((p, i) => (
        <ProductCard
          key={p.id}
          product={p}
          store={store}
          design={d}
          sizes={sizes}
          rating={ratings?.[p.id]}
          priority={i < priorityCount}
        />
      ))}
    </div>
  );
}
