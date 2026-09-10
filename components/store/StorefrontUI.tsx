'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Ce que deux éléments de vitrine doivent savoir l'un de l'autre
//
// Presque rien, et c'est voulu. Deux choses seulement, parce que sans elles
// deux composants qui ne se connaissent pas se marcheraient dessus à l'écran.
//
// ── 1. Le tiroir des rayons ────────────────────────────────────────────────
//
// Il est dessiné par l'en-tête, mais le socle mobile (§4) doit pouvoir
// l'ouvrir : « Catégories » y est une entrée à part entière. Recopier le
// tiroir dans le socle donnerait deux listes de rayons à maintenir, et la
// deuxième vieillirait à la première correction faite dans la première.
//
// ── 2. Le bas de l'écran, qui n'appartient qu'à un seul ────────────────────
//
// Le socle occupe le bas de toutes les pages. La fiche produit, elle, y fait
// monter sa barre d'achat dès que le bouton principal sort du champ (§18).
// Les deux au même endroit, c'est cent quinze pixels de barres empilées sur un
// téléphone — la moitié de ce qui reste sous le pouce.
//
// La page qui possède une barre d'action le DÉCLARE, et le socle s'efface le
// temps qu'elle est là. C'est le comportement d'une vraie boutique : la barre
// d'achat remplace la navigation, elle ne s'ajoute pas à elle.
//
// Volontairement pas un magasin d'état général. Deux drapeaux, et rien qui
// ressemble à du contenu : celui-là vit dans le thème, et lui seul.
// ─────────────────────────────────────────────────────────────────────────────

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';

type StorefrontUIValue = {
  menuOpen: boolean;
  /**
   * Ouvre le tiroir des rayons.
   *
   * L'élément qui l'ouvre est mémorisé pour que le focus lui revienne à la
   * fermeture : le tiroir s'ouvre depuis l'en-tête ou depuis le socle, et
   * rendre le focus au mauvais des deux fait sauter l'écran d'un lecteur
   * d'écran d'un bout de la page à l'autre.
   */
  openMenu:  (opener?: HTMLElement | null) => void;
  closeMenu: () => void;
  /** L'élément à qui rendre le focus. Lu par l'en-tête, jamais écrit par lui. */
  menuOpener: React.MutableRefObject<HTMLElement | null>;

  /** Vrai quand une page occupe déjà le bas de l'écran avec sa propre barre. */
  bottomBarTaken: boolean;
  setBottomBarTaken: (taken: boolean) => void;
};

const StorefrontUIContext = createContext<StorefrontUIValue | null>(null);

export function StorefrontUIProvider({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [bottomBarTaken, setBottomBarTaken] = useState(false);
  const menuOpener = useRef<HTMLElement | null>(null);

  const openMenu = useCallback((opener?: HTMLElement | null) => {
    menuOpener.current = opener ?? null;
    setMenuOpen(true);
  }, []);

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  const value = useMemo(
    () => ({
      menuOpen, openMenu, closeMenu, menuOpener,
      bottomBarTaken, setBottomBarTaken,
    }),
    [menuOpen, openMenu, closeMenu, bottomBarTaken],
  );

  return (
    <StorefrontUIContext.Provider value={value}>{children}</StorefrontUIContext.Provider>
  );
}

/**
 * Ne lève pas hors du fournisseur.
 *
 * L'en-tête et le socle servent aussi l'aperçu de gabarit du marchand
 * (`app/apercu/[template]`), et un composant rendu hors enveloppe ne doit pas
 * faire tomber la page : il perd seulement ces deux comportements.
 */
export function useStorefrontUI(): StorefrontUIValue {
  const ctx = useContext(StorefrontUIContext);
  const fallbackOpener = useRef<HTMLElement | null>(null);

  return ctx ?? {
    menuOpen: false,
    openMenu: () => {},
    closeMenu: () => {},
    menuOpener: fallbackOpener,
    bottomBarTaken: false,
    setBottomBarTaken: () => {},
  };
}

/**
 * À appeler par une page qui pose sa propre barre d'action en bas d'écran.
 *
 * Le drapeau se relâche au démontage : quitter la fiche produit pendant que sa
 * barre d'achat est visible ne doit pas laisser le socle caché sur toutes les
 * pages suivantes.
 */
export function useOwnsBottomBar(active: boolean): void {
  const { setBottomBarTaken } = useStorefrontUI();

  useEffect(() => {
    setBottomBarTaken(active);
    return () => setBottomBarTaken(false);
  }, [active, setBottomBarTaken]);
}
