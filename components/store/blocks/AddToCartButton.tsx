'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Le bouton d'achat
//
// Il y avait quatre boutons « Ajouter au panier » dans la vitrine — la carte,
// la fiche, l'encart vedette, le lot — et quatre façons de gérer le hors stock,
// la confirmation et la vente à découvert. Trois d'entre eux oubliaient au
// moins une des trois.
//
// Celui-ci est le seul, partout où l'achat se déclenche depuis autre chose
// qu'une carte. Il connaît trois états et un seul geste :
//
//   disponible    → ajoute, confirme brièvement, laisse la page en place
//   sur commande  → ajoute quand même (§25), et le dit
//   épuisé        → désactivé, et l'explique
//
// La confirmation dure 1,6 seconde. Assez pour être vue, trop court pour qu'un
// deuxième clic se perde : le libellé revient de lui-même à « Ajouter ».
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { Check, ShoppingBag } from 'lucide-react';
import { useCart } from '../CartContext';
import { storeMoney } from '../format';
import type { StoreProduct, StoreView } from '../types';

export function AddToCartButton({
  product, store, quantity = 1, className, onAdded, showTotal = false, label,
  size = 'hero',
}: {
  product:  StoreProduct;
  store:    StoreView;
  quantity?: number;
  className?: string;
  /** Appelé après l'ajout — pour ouvrir le tiroir, par exemple. */
  onAdded?: () => void;
  /** Vrai sur la fiche produit, où le bouton porte le montant réel. */
  showTotal?: boolean;
  /**
   * Le verbe du métier (§5) : « Commander cette création » chez un artisan,
   * « Commander » chez un traiteur. Il remplace « Ajouter au panier » — le
   * geste, lui, ne change pas, et c'est pour cela que le bouton reste
   * celui-ci : un second bouton d'achat serait un quatrième endroit où oublier
   * la vente à découvert.
   */
  label?: string;
  /**
   * La taille du bouton.
   *
   * `hero` — 56 px, l'action principale d'un écran : la fiche, le lot, la
   * vedette. `compact` — 44 px, le plancher de ce qui se touche (§8), pour
   * un ajout SECONDAIRE posé sur une vignette. Deux boutons héro dans la même
   * page se disputeraient la même décision.
   */
  size?: 'hero' | 'compact';
}) {
  const { addItem } = useCart();
  const [added, setAdded] = useState(false);

  const price      = product.sale_price ?? product.price;
  const outOfStock = product.stock <= 0 && !product.allow_backorders;
  const backorder  = product.stock <= 0 && product.allow_backorders;

  function handleClick() {
    if (outOfStock) return;
    addItem(product, quantity);
    setAdded(true);
    onAdded?.();
    window.setTimeout(() => setAdded(false), 1600);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={outOfStock}
      aria-label={outOfStock ? `${product.name} est épuisé` : `Ajouter ${product.name} au panier`}
      className={[
        'flex w-full items-center justify-center gap-2 font-semibold transition',
        size === 'compact' ? 'min-h-[44px] text-[13.5px]' : 'min-h-[56px] text-[15px]',
        outOfStock ? 'cursor-not-allowed' : 'hover:brightness-95 active:brightness-90',
        className ?? '',
      ].join(' ')}
      style={{
        borderRadius: 'var(--st-radius-btn)',
        background:   outOfStock ? 'var(--st-surface-2)' : 'var(--st-accent)',
        color:        outOfStock ? 'var(--st-ink-3)' : 'var(--st-accent-ink)',
      }}
    >
      {outOfStock ? (
        'Épuisé'
      ) : added ? (
        <><Check className="h-5 w-5" strokeWidth={2.5} aria-hidden /> Ajouté au panier</>
      ) : (
        <>
          <ShoppingBag className={size === 'compact' ? 'h-4 w-4' : 'h-[18px] w-[18px]'} strokeWidth={1.9} aria-hidden />
          {backorder && !label
            ? 'Commander'
            : showTotal && store.showPrices
              ? `${label ?? 'Ajouter'} — ${storeMoney(price * quantity, store.currency)}`
              : label ?? 'Ajouter au panier'}
        </>
      )}
    </button>
  );
}
