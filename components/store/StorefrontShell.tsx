// ─────────────────────────────────────────────────────────────────────────────
// L'enveloppe d'une vitrine
//
// Les variables CSS, les polices, le panier, l'en-tête, le pied et le tiroir.
// Tout ce qui entoure le contenu d'une boutique — et rien de ce qu'il y a
// dedans.
//
// Elle sert DEUX écrans : la vitrine publique (`app/store/[slug]/layout.tsx`) et
// l'aperçu de gabarit du marchand (`app/apercu/[template]`). C'est ce qui
// garantit qu'un aperçu ne dérive pas du rendu réel : un en-tête ou un jeu de
// variables recopié dans l'aperçu vieillirait à la première correction faite
// dans l'autre, et le marchand choisirait son gabarit sur une image périmée.
//
// Les deux polices sont déclarées au niveau du module — `next/font` l'exige — et
// seule celle que le marchand a choisie est réellement appliquée. Playfair porte
// `preload: false` : elle ne se télécharge que sur les vitrines qui s'en
// servent, pas sur toutes.
// ─────────────────────────────────────────────────────────────────────────────

import { Inter, Playfair_Display } from 'next/font/google';
import { themeCssVars } from '../../lib/storeTheme';
import { designFor, designCssVars } from '../../lib/storeDesign';
import { CartProvider } from './CartContext';
import { FavoritesProvider } from './FavoritesContext';
import { StorefrontHeader } from './StorefrontHeader';
import { StorefrontFooter } from './StorefrontFooter';
import { StorefrontDock } from './StorefrontDock';
import { StorefrontUIProvider } from './StorefrontUI';
import { CartDrawer } from './blocks/CartDrawer';
import type { StoreView, StoreProduct, StoreCategory } from './types';

const inter = Inter({
  subsets:  ['latin'],
  variable: '--font-inter',
  display:  'swap',
  preload:  false,
  fallback: ['system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
});

const playfair = Playfair_Display({
  subsets:  ['latin'],
  variable: '--font-playfair',
  display:  'swap',
  preload:  false,
  fallback: ['Georgia', 'Times New Roman', 'serif'],
});

export function StorefrontShell({
  view, businessId, searchIndex, categories, children, dockMode,
}: {
  view:        StoreView;
  businessId:  string;
  /** Le catalogue réduit aux champs de la recherche instantanée. */
  searchIndex: StoreProduct[];
  categories:  StoreCategory[];
  children:    React.ReactNode;
  /**
   * `static` pour l'aperçu de gabarit, dont la barre occupe déjà le bas de
   * l'écran. Voir `StorefrontDock`.
   */
  dockMode?:   'fixed' | 'static';
}) {
  const design = designFor(view.templateId);

  return (
    <CartProvider slug={view.slug} businessId={businessId}>
      <FavoritesProvider slug={view.slug}>
       <StorefrontUIProvider>
        {/* Les jetons responsives.
            Une variable CSS ne se déclare pas dans un attribut `style` sous
            condition de largeur d'écran : `style` ne connaît pas les media
            queries. Sans ces six lignes, un titre de bannière garderait sa
            taille mobile sur un écran de 27 pouces, et le rythme vertical d'une
            boutique éditoriale resterait celui d'un téléphone.

            Les valeurs, elles, restent dans `lib/storeDesign.ts` : cette règle
            ne fait que promouvoir la variante large au-dessus de 768 pixels. */}
        <style dangerouslySetInnerHTML={{ __html: `
          @media (min-width: 768px) {
            .st-root {
              --st-h1: var(--st-h1-lg);
              --st-h2: var(--st-h2-lg);
              --st-section-y: var(--st-section-y-lg);
            }
          }
          @media (prefers-reduced-motion: reduce) {
            .st-root *, .st-root *::before, .st-root *::after {
              animation-duration: 0.01ms !important;
              transition-duration: 0.01ms !important;
            }
          }
        ` }} />

        <div
          className={`st-root ${inter.variable} ${playfair.variable} flex min-h-screen flex-col`}
          style={{
            ...themeCssVars(view.theme),
            ...designCssVars(design),
            background: 'var(--st-surface)',
            color: 'var(--st-ink)',
            fontFamily: 'var(--st-font-body)',
          }}
        >
          <StorefrontHeader store={view} searchIndex={searchIndex} categories={categories} />
          <main className="flex-1">{children}</main>
          <StorefrontFooter store={view} categories={categories} />
          <CartDrawer store={view} />

          {/* Le socle mobile (§4). Il vient APRÈS le pied de page : la cale
              qu'il pose pour ne rien recouvrir doit tomber en fin de document,
              pas au milieu. */}
          <StorefrontDock store={view} categories={categories} mode={dockMode} />
        </div>
       </StorefrontUIProvider>
      </FavoritesProvider>
    </CartProvider>
  );
}
