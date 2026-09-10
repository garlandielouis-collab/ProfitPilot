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
  product, store, quantity = 1, className, onAdded, showTotal = false,
}: {
  product:  StoreProduct;
  store:    StoreView;
  quantity?: number;
  className?: string;
  /** Appelé après l'ajout — pour ouvrir le tiroir, par exemple. */
  onAdded?: () => void;
  /** Vrai sur la fiche produit, où le bouton porte le montant réel. */
  showTotal?: boolean;
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
        'flex min-h-[56px] w-full items-center justify-center gap-2 text-[15px] font-semibold transition',
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
          <ShoppingBag className="h-[18px] w-[18px]" strokeWidth={1.9} aria-hidden />
          {backorder
            ? 'Commander'
            : showTotal && store.showPrices
              ? `Ajouter — ${storeMoney(price * quantity, store.currency)}`
              : 'Ajouter au panier'}
        </>
      )}
    </button>
  );
}
