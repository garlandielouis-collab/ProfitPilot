'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Le panier d'une vitrine
//
// Déplacé depuis app/store/[slug]/StoreCartContext.tsx : les gabarits vivent
// dans components/store et ne peuvent pas remonter chercher leur état dans le
// dossier de route. L'ancien fichier n'était plus qu'un ré-export, et il a été
// retiré quand le tunnel d'achat est passé aux gabarits.
//
// Trois choses ont été ajoutées au passage :
//
//   Le tiroir. Ajouter au panier ne doit pas emmener l'acheteur ailleurs.
//   L'ancien parcours renvoyait vers /cart : on quitte la page produit, on perd
//   le fil, et la deuxième vente ne se fait pas. Le tiroir garde la page.
//
//   `hydrated`. Le compteur du panier vient de localStorage, que le serveur ne
//   connaît pas : rendre « 3 » côté serveur est impossible, et rendre « 0 »
//   puis « 3 » produit une erreur d'hydratation. Tant que `hydrated` est faux,
//   le compteur ne s'affiche pas du tout.
//
//   Le plafond de stock est retiré du panier. Il vivait ici sous la forme
//   `Math.min(qty, product.stock)` : un produit dont le stock affiché était
//   périmé se retrouvait silencieusement à la quantité 0, sans que l'acheteur
//   comprenne pourquoi son panier refusait de grandir. Le stock se vérifie à la
//   commande, contre la base, pas contre une copie chargée il y a dix minutes.
// ─────────────────────────────────────────────────────────────────────────────

import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
  type ReactNode,
} from 'react';
import type { StoreBundle, StoreProduct } from '../../app/actions/store-public';
import { trackStoreEvent } from './blocks/TrackView';

export type CartItem = {
  product:  StoreProduct;
  quantity: number;
};

/**
 * Un lot au panier (§18).
 *
 * Deux listes plutôt qu'une liste de deux formes. Un produit et un lot ne se
 * retirent pas du même bouton, ne s'envoient pas sous la même clé au serveur,
 * et ne s'affichent pas pareil — les mélanger dans un tableau à discriminant
 * aurait obligé chacun des quatre écrans qui lisent `items` à distinguer les
 * deux cas, alors qu'aucun n'a besoin de le faire.
 */
export type CartBundle = {
  bundle:   StoreBundle;
  quantity: number;
};

type CartCtx = {
  items:      CartItem[];
  bundles:    CartBundle[];
  count:      number;
  total:      number;
  /** Faux jusqu'à la lecture de localStorage — voir l'en-tête. */
  hydrated:   boolean;
  drawerOpen: boolean;
  addItem:    (product: StoreProduct, qty?: number) => void;
  removeItem: (productId: string) => void;
  updateQty:  (productId: string, qty: number) => void;
  addBundle:    (bundle: StoreBundle, qty?: number) => void;
  removeBundle: (bundleId: string) => void;
  updateBundleQty: (bundleId: string, qty: number) => void;
  clear:      () => void;
  openDrawer:  () => void;
  closeDrawer: () => void;
};

const CartContext = createContext<CartCtx | null>(null);

const STORAGE_KEY = (slug: string) => `pp_cart_${slug}`;

/** Une quantité reste un entier positif borné : un panier n'est pas un formulaire libre. */
function normalizeQty(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(999, Math.floor(n)));
}

export function CartProvider({
  slug,
  businessId,
  children,
}: {
  slug: string;
  /**
   * L'entreprise de la vitrine, pour mesurer l'ajout au panier (§30).
   *
   * L'événement est posé ICI et pas dans chaque bouton « Ajouter » : il y en a
   * quatre — la carte produit, la fiche, le lot, le tiroir — et trois d'entre
   * eux auraient fini par l'oublier. Un entonnoir dont une étape n'est comptée
   * qu'à un endroit sur quatre fait prendre de mauvaises décisions au marchand.
   */
  businessId?: string;
  children: ReactNode;
}) {
  const [items, setItems]           = useState<CartItem[]>([]);
  const [bundles, setBundles]       = useState<CartBundle[]>([]);
  const [hydrated, setHydrated]     = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY(slug));
      if (raw) {
        const parsed = JSON.parse(raw);

        // Un panier enregistré avant les lots est un TABLEAU ; depuis, c'est un
        // objet à deux listes. Les deux formes se relisent : un marchand qui
        // déploie cette version ne vide le panier de personne.
        const rawItems   = Array.isArray(parsed) ? parsed : parsed?.items;
        const rawBundles = Array.isArray(parsed) ? []     : parsed?.bundles;

        if (Array.isArray(rawItems)) {
          setItems(
            rawItems.filter(
              (i: unknown): i is CartItem =>
                Boolean(i) && typeof i === 'object' && 'product' in (i as object),
            ),
          );
        }
        if (Array.isArray(rawBundles)) {
          setBundles(
            rawBundles.filter(
              (b: unknown): b is CartBundle =>
                Boolean(b) && typeof b === 'object' && 'bundle' in (b as object),
            ),
          );
        }
      }
    } catch {
      // Panier corrompu, quota dépassé, navigation privée : on repart d'un
      // panier vide plutôt que de casser la boutique.
    }
    setHydrated(true);
  }, [slug]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY(slug), JSON.stringify({ items, bundles }));
    } catch {}
  }, [items, bundles, slug, hydrated]);

  // Le corps ne défile plus derrière le tiroir ouvert : sur mobile, le fond qui
  // bouge sous une feuille est la première chose qui fait « site bricolé ».
  useEffect(() => {
    if (!drawerOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [drawerOpen]);

  const addItem = useCallback((product: StoreProduct, qty = 1) => {
    if (businessId) {
      trackStoreEvent({
        businessId,
        event:     'add_to_cart',
        productId: product.id,
        // Le montant ajouté, pour que l'écran d'analyse puisse donner un ordre
        // de grandeur des paniers perdus. Le prix affiché, pas celui qui fera
        // foi : le seul prix qui fait foi est relu en base à la commande.
        value:     (product.sale_price ?? product.price) * qty,
      });
    }

    setItems((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) {
        return prev.map((i) =>
          i.product.id === product.id
            ? { ...i, quantity: normalizeQty(i.quantity + qty) }
            : i,
        );
      }
      return [...prev, { product, quantity: normalizeQty(qty) }];
    });
    setDrawerOpen(true);
  }, [businessId]);

  const removeItem = useCallback((productId: string) => {
    setItems((prev) => prev.filter((i) => i.product.id !== productId));
  }, []);

  const updateQty = useCallback((productId: string, qty: number) => {
    if (qty <= 0) {
      setItems((prev) => prev.filter((i) => i.product.id !== productId));
      return;
    }
    setItems((prev) =>
      prev.map((i) => (i.product.id === productId ? { ...i, quantity: normalizeQty(qty) } : i)),
    );
  }, []);

  // ── Les lots ──────────────────────────────────────────────────────────────

  const addBundle = useCallback((bundle: StoreBundle, qty = 1) => {
    if (businessId) {
      // Sans `productId` : un lot n'est pas une fiche, et l'attribuer à sa
      // première pièce fausserait les vues-contre-ventes de l'écran d'analyse.
      trackStoreEvent({
        businessId,
        event: 'add_to_cart',
        value: bundle.price * qty,
      });
    }

    setBundles((prev) => {
      const existing = prev.find((b) => b.bundle.id === bundle.id);
      if (existing) {
        return prev.map((b) =>
          b.bundle.id === bundle.id
            ? { ...b, quantity: normalizeQty(b.quantity + qty) }
            : b,
        );
      }
      return [...prev, { bundle, quantity: normalizeQty(qty) }];
    });
    setDrawerOpen(true);
  }, [businessId]);

  const removeBundle = useCallback((bundleId: string) => {
    setBundles((prev) => prev.filter((b) => b.bundle.id !== bundleId));
  }, []);

  const updateBundleQty = useCallback((bundleId: string, qty: number) => {
    if (qty <= 0) {
      setBundles((prev) => prev.filter((b) => b.bundle.id !== bundleId));
      return;
    }
    setBundles((prev) =>
      prev.map((b) => (b.bundle.id === bundleId ? { ...b, quantity: normalizeQty(qty) } : b)),
    );
  }, []);

  const clear = useCallback(() => { setItems([]); setBundles([]); }, []);

  const value = useMemo<CartCtx>(() => {
    const count =
      items.reduce((s, i) => s + i.quantity, 0) +
      bundles.reduce((s, b) => s + b.quantity, 0);

    const total =
      items.reduce((s, i) => s + (i.product.sale_price ?? i.product.price) * i.quantity, 0) +
      bundles.reduce((s, b) => s + b.bundle.price * b.quantity, 0);

    return {
      items, bundles, count, total, hydrated, drawerOpen,
      addItem, removeItem, updateQty,
      addBundle, removeBundle, updateBundleQty,
      clear,
      openDrawer:  () => setDrawerOpen(true),
      closeDrawer: () => setDrawerOpen(false),
    };
  }, [
    items, bundles, hydrated, drawerOpen,
    addItem, removeItem, updateQty,
    addBundle, removeBundle, updateBundleQty, clear,
  ]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart doit être utilisé dans un CartProvider');
  return ctx;
}
