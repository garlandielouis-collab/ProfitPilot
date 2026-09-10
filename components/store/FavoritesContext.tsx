'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Les favoris d'une vitrine
//
// Le §5 demande un cœur sur la carte du rayon mode. Un cœur qui ne mène nulle
// part est pire que pas de cœur : le visiteur clique, rien ne se passe, et la
// boutique perd la crédibilité que la carte venait de gagner. Il y a donc un
// endroit où les favoris se retrouvent — `/favoris` — et cet état survit au
// rechargement.
//
// ── Pourquoi localStorage et pas la base ───────────────────────────────────
//
// Une vitrine ProfitPilot n'a pas de compte client : on y commande sans
// s'inscrire, et c'est délibéré — le §20 demande le moins d'étapes possible.
// Sans compte, il n'y a pas d'identité à laquelle rattacher un favori côté
// serveur. Le navigateur est donc le bon endroit, et le seul honnête : la liste
// appartient au visiteur, elle ne part sur aucun serveur, elle n'alimente
// aucune mesure.
//
// La conséquence est assumée : les favoris ne suivent pas d'un téléphone à un
// ordinateur. C'est le comportement attendu d'une liste locale, et il vaut
// mieux que la promesse d'une synchronisation qu'aucun compte ne permet.
//
// `hydrated` existe pour la même raison que dans le panier : le serveur ne peut
// pas connaître le contenu de localStorage, et rendre « 0 » puis « 3 » produit
// une erreur d'hydratation. Tant qu'il est faux, rien ne s'affiche.
// ─────────────────────────────────────────────────────────────────────────────

import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
  type ReactNode,
} from 'react';

type FavoritesCtx = {
  ids:      string[];
  has:      (productId: string) => boolean;
  toggle:   (productId: string) => void;
  remove:   (productId: string) => void;
  count:    number;
  hydrated: boolean;
};

const FavoritesContext = createContext<FavoritesCtx | null>(null);

const STORAGE_KEY = (slug: string) => `pp_fav_${slug}`;

/** Cent suffit. Au-delà, ce n'est plus une liste d'envies, c'est le catalogue. */
const MAX = 100;

export function FavoritesProvider({ slug, children }: { slug: string; children: ReactNode }) {
  const [ids, setIds]           = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY(slug));
      const parsed = raw ? JSON.parse(raw) : null;
      if (Array.isArray(parsed)) {
        setIds(parsed.filter((v): v is string => typeof v === 'string').slice(0, MAX));
      }
    } catch {
      // Navigation privée, quota plein, stockage bloqué : la vitrine
      // fonctionne sans favoris, elle ne s'arrête pas pour autant.
    }
    setHydrated(true);
  }, [slug]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY(slug), JSON.stringify(ids));
    } catch {
      /* voir ci-dessus */
    }
  }, [ids, slug, hydrated]);

  const toggle = useCallback((productId: string) => {
    setIds((prev) =>
      prev.includes(productId)
        ? prev.filter((id) => id !== productId)
        : [productId, ...prev].slice(0, MAX),
    );
  }, []);

  const remove = useCallback((productId: string) => {
    setIds((prev) => prev.filter((id) => id !== productId));
  }, []);

  const value = useMemo<FavoritesCtx>(() => ({
    ids,
    has:   (productId: string) => ids.includes(productId),
    toggle,
    remove,
    count: ids.length,
    hydrated,
  }), [ids, toggle, remove, hydrated]);

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

/**
 * Ne lève pas hors du fournisseur.
 *
 * La carte produit est aussi rendue dans l'aperçu de l'éditeur, où le
 * fournisseur n'est pas monté. Une exception y ferait tomber tout l'aperçu pour
 * un cœur.
 */
export function useFavorites(): FavoritesCtx {
  const ctx = useContext(FavoritesContext);
  return ctx ?? {
    ids: [], has: () => false, toggle: () => {}, remove: () => {},
    count: 0, hydrated: false,
  };
}
