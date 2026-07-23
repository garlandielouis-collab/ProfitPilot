'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { StoreProduct } from '../../actions/store-public';

export type CartItem = {
  product:  StoreProduct;
  quantity: number;
};

type CartCtx = {
  items:      CartItem[];
  count:      number;
  total:      number;
  addItem:    (product: StoreProduct, qty?: number) => void;
  removeItem: (productId: string) => void;
  updateQty:  (productId: string, qty: number) => void;
  clear:      () => void;
};

const CartContext = createContext<CartCtx | null>(null);

const STORAGE_KEY = (slug: string) => `pp_cart_${slug}`;

export function CartProvider({ slug, children }: { slug: string; children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [ready, setReady] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY(slug));
      if (raw) setItems(JSON.parse(raw));
    } catch {}
    setReady(true);
  }, [slug]);

  // Persist on change
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(STORAGE_KEY(slug), JSON.stringify(items));
    } catch {}
  }, [items, slug, ready]);

  function addItem(product: StoreProduct, qty = 1) {
    setItems((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) {
        return prev.map((i) =>
          i.product.id === product.id
            ? { ...i, quantity: Math.min(i.quantity + qty, product.stock) }
            : i,
        );
      }
      return [...prev, { product, quantity: Math.min(qty, product.stock) }];
    });
  }

  function removeItem(productId: string) {
    setItems((prev) => prev.filter((i) => i.product.id !== productId));
  }

  function updateQty(productId: string, qty: number) {
    if (qty <= 0) { removeItem(productId); return; }
    setItems((prev) =>
      prev.map((i) =>
        i.product.id === productId
          ? { ...i, quantity: Math.min(qty, i.product.stock) }
          : i,
      ),
    );
  }

  function clear() { setItems([]); }

  const count = items.reduce((s, i) => s + i.quantity, 0);
  const total = items.reduce((s, i) => {
    const price = i.product.sale_price ?? i.product.price;
    return s + price * i.quantity;
  }, 0);

  return (
    <CartContext.Provider value={{ items, count, total, addItem, removeItem, updateQty, clear }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside CartProvider');
  return ctx;
}
