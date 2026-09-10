'use client';

// ─────────────────────────────────────────────────────────────────────────────
// La liste d'envies
//
// Trois états, et aucun n'est une page blanche :
//
//   pas encore lu   Le stockage local n'a pas encore été consulté. On ne rend
//                   rien plutôt qu'un « aucun favori » qui clignoterait une
//                   fraction de seconde avant d'afficher six articles.
//   vide            On explique à quoi sert le cœur et on renvoie au catalogue.
//   rempli          La grille du gabarit, plus « tout ajouter au panier ».
//
// Un favori dont le produit a été retiré du catalogue disparaît simplement :
// la liste est intersectée avec le catalogue réel à chaque affichage, elle ne
// peut donc pas montrer un article que le marchand a dépublié.
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link';
import { useMemo } from 'react';
import { Heart, ShoppingBag } from 'lucide-react';
import { ProductGrid } from '../../../../components/store/blocks/ProductGrid';
import { useFavorites } from '../../../../components/store/FavoritesContext';
import { useCart } from '../../../../components/store/CartContext';
import { designFor } from '../../../../lib/storeDesign';
import type { RatingMap } from '../../../../components/store/blocks/ProductGrid';
import type { StoreProduct, StoreView } from '../../../../components/store/types';

export function FavoritesClient({
  store, products, ratings,
}: {
  store:    StoreView;
  products: StoreProduct[];
  ratings:  RatingMap;
}) {
  const favorites = useFavorites();
  const { addItem, openDrawer } = useCart();
  const design = designFor(store.templateId);

  const chosen = useMemo(
    // L'ordre des favoris est celui du visiteur — le plus récent d'abord — et
    // non celui du catalogue.
    () => favorites.ids
      .map((id) => products.find((p) => p.id === id))
      .filter((p): p is StoreProduct => Boolean(p)),
    [favorites.ids, products],
  );

  const buyable = chosen.filter((p) => p.stock > 0 || p.allow_backorders);

  function addAll() {
    for (const p of buyable) addItem(p, 1);
    openDrawer();
  }

  if (!favorites.hydrated) {
    return <div className="mx-auto min-h-[50vh] max-w-6xl px-4 py-12 sm:px-6" aria-busy />;
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="mb-8">
        <h1
          className="text-[var(--st-ink)]"
          style={{
            fontFamily:    'var(--st-font-heading)',
            fontSize:      'var(--st-h2)',
            fontWeight:    design.type.upper ? 500 : 600,
            letterSpacing: 'var(--st-tracking)',
            textTransform: design.type.upper ? 'uppercase' : undefined,
          }}
        >
          Mes favoris
        </h1>
        {chosen.length > 0 && (
          <p className="mt-2 text-[13px] tabular-nums text-[var(--st-ink-3)]">
            {chosen.length} article{chosen.length > 1 ? 's' : ''}
          </p>
        )}
      </header>

      {chosen.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center gap-3 border border-dashed px-6 py-20 text-center"
          style={{ borderColor: 'var(--st-border)', borderRadius: 'var(--st-radius-card)' }}
        >
          <Heart className="h-8 w-8 text-[var(--st-ink-3)]" strokeWidth={1.4} aria-hidden />
          <p className="text-[15px] font-semibold text-[var(--st-ink)]">
            Votre liste est vide
          </p>
          <p className="max-w-sm text-[14px] leading-relaxed text-[var(--st-ink-2)]">
            Touchez le cœur sur un article pour le retrouver ici. La liste reste
            sur cet appareil, elle n'est envoyée nulle part.
          </p>
          <Link
            href={`${store.base}/products`}
            className="mt-1 flex min-h-[48px] items-center px-6 text-[14px] font-semibold"
            style={{
              background: 'var(--st-accent)', color: 'var(--st-accent-ink)',
              borderRadius: 'var(--st-radius-btn)',
            }}
          >
            Parcourir le catalogue
          </Link>
        </div>
      ) : (
        <>
          {buyable.length > 1 && (
            <button
              type="button"
              onClick={addAll}
              className="mb-6 flex min-h-[48px] items-center justify-center gap-2 px-6 text-[15px] font-semibold transition hover:brightness-95"
              style={{
                background: 'var(--st-accent)', color: 'var(--st-accent-ink)',
                borderRadius: 'var(--st-radius-btn)',
              }}
            >
              <ShoppingBag className="h-[18px] w-[18px]" strokeWidth={1.9} aria-hidden />
              Tout ajouter au panier ({buyable.length})
            </button>
          )}

          <ProductGrid store={store} products={chosen} ratings={ratings} design={design} />
        </>
      )}
    </div>
  );
}
