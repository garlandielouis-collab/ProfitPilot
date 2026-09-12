'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Vide le panier une fois le paiement en ligne confirmé
//
// Rendu par la page de confirmation seulement quand la commande est RÉELLEMENT
// payée en base — jamais sur la foi de `?paid=1`, que n'importe qui peut taper.
// Et seulement si c'est la commande que ce navigateur a envoyée à la passerelle
// (voir pendingOrder.ts).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect } from 'react';
import { useCart } from '../../../../components/store/CartContext';
import { forgetPendingOrder, readPendingOrder } from './pendingOrder';

export function ClearPaidCart({ slug, orderId }: { slug: string; orderId: string }) {
  const { clear, hydrated } = useCart();

  useEffect(() => {
    // Attendre la relecture du panier : vidé avant, il serait aussitôt
    // rechargé depuis localStorage par le CartProvider.
    if (!hydrated) return;
    if (readPendingOrder(slug) !== orderId) return;
    clear();
    forgetPendingOrder(slug);
  }, [hydrated, slug, orderId, clear]);

  return null;
}
