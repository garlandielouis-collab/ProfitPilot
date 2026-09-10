'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Le socle de navigation mobile
//
// « Le mobile n'est PAS une version réduite » (§4). Un en-tête de bureau
// compressé donne un bouton de menu et un panier : deux cibles pour parcourir
// une boutique entière, alors que l'essentiel du trafic d'un marchand haïtien
// arrive d'un téléphone.
//
// Le socle donne à ce trafic trois ou quatre gestes, toujours sous le pouce, et
// ces gestes NE SONT PAS LES MÊMES d'un métier à l'autre — c'est là tout le
// sujet :
//
//   Boutique   Accueil · Catégories · Rechercher · Panier
//   Social     Accueil · Boutique · Panier · WhatsApp
//   Artisan    Accueil · Collection · Rechercher · Panier
//   Services   Accueil · Services · Réserver          — aucun panier
//   Élevage    Produits · Disponibilité · WhatsApp    — aucun panier
//   Traiteur   Menu · Rechercher · Panier · Commander
//
// La liste vient de `designFor(templateId).mobile.dock`. Le composant ne
// connaît aucun nom de gabarit : ajouter un vingt-troisième gabarit ne demande
// pas de revenir ici.
//
// ── Une entrée qui ne mène nulle part ne s'affiche pas ─────────────────────
//
// « WhatsApp » sans numéro renseigné, « Réserver » sans aucun moyen de
// contact, « Catégories » sur une boutique qui n'a créé aucun rayon : le socle
// rétrécit à trois entrées, ou à deux. C'est la règle du §29 appliquée à la
// navigation — on ne montre rien qui n'existe pas chez CE marchand. Un socle
// de quatre boutons dont une est morte coûte plus cher au marchand qu'un socle
// de trois.
//
// ── Pourquoi il s'efface sur la fiche produit ──────────────────────────────
//
// Parce que la fiche y fait monter sa barre d'achat, et que deux barres
// empilées mangent la moitié de l'écran utile. Voir `StorefrontUI`.
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRef } from 'react';
import {
  Home, Store, LayoutGrid, Search, ShoppingBag, PackageCheck,
  CalendarCheck, MessageCircle, Phone, CreditCard,
} from 'lucide-react';
import { useCart } from './CartContext';
import { useStorefrontUI } from './StorefrontUI';
import { designFor, DOCK_HEIGHT, type DockItem } from '../../lib/storeDesign';
import { buildBookingLink, resolveOrderPhone } from '../../lib/storeWhatsApp';
import { buildWhatsAppLink } from '../../lib/whatsappReport';
import type { StoreCategory, StoreView } from './types';

/** Ce qu'une entrée devient une fois résolue pour CE marchand. */
type Entry = {
  key:   DockItem;
  label: string;
  Icon:  typeof Home;
  /** Un lien, ou un geste — jamais les deux. */
  href?:    string;
  external?: boolean;
  onClick?: () => void;
  /** Le compteur du panier. Zéro ou absent : pas de pastille. */
  badge?:   number;
  /** Le chemin qui rend cette entrée « courante ». */
  match?:   (pathname: string) => boolean;
};

export function StorefrontDock({
  store, categories = [], mode = 'fixed',
}: {
  store: StoreView;
  categories?: StoreCategory[];
  /**
   * `fixed` sur une vraie vitrine : le socle colle en bas de l'écran.
   *
   * `static` dans l'aperçu de gabarit du marchand, où la barre de l'aperçu
   * occupe déjà ce bas d'écran — et avec une hauteur qui change selon qu'elle
   * porte un avertissement ou non, donc impossible à contourner par un décalage.
   * Le socle se pose alors en fin de page : le marchand voit bien QUELS gestes
   * son gabarit donne au téléphone, ce qui est la raison d'être de l'aperçu,
   * sans que deux barres se recouvrent.
   */
  mode?: 'fixed' | 'static';
}) {
  const { count, hydrated, openDrawer } = useCart();
  const { openMenu, bottomBarTaken } = useStorefrontUI();
  const pathname = usePathname();
  const categoriesButton = useRef<HTMLButtonElement>(null);

  const design = designFor(store.templateId);

  // La fiche produit a pris le bas de l'écran : le socle fixe laisse la place.
  // Dans le flux, il n'y a rien à disputer — il reste.
  if (mode === 'fixed' && bottomBarTaken) return null;

  const home     = store.base || '/';
  const catalog  = `${store.base}/products`;
  const whatsapp = resolveOrderPhone(
    store.theme.whatsapp.number, store.whatsappPhone, store.contactPhone,
  );
  const booking  = buildBookingLink({
    storeName: store.name, phone: whatsapp, email: store.contactEmail,
  });

  function resolve(key: DockItem): Entry | null {
    switch (key) {
      case 'home':
        return {
          key, label: 'Accueil', Icon: Home, href: home,
          match: (p) => p === home || p === `${store.base}` || p === '/',
        };

      case 'catalog':
        // Le mot du métier : « Menu » chez un traiteur, « Produits » chez un
        // éleveur, « Collection » chez un artisan.
        return {
          key, label: design.mobile.catalogLabel, Icon: Store, href: catalog,
          match: (p) => p.startsWith(catalog),
        };

      case 'categories':
        // Le tiroir de l'en-tête, pas une seconde liste de rayons. Aucun rayon
        // créé : l'entrée disparaît plutôt que d'ouvrir un tiroir vide.
        if (categories.length === 0) return null;
        return {
          key, label: 'Catégories', Icon: LayoutGrid,
          onClick: () => openMenu(categoriesButton.current),
        };

      case 'search':
        // Le champ de recherche est en haut de la page catalogue, et le
        // paramètre lui donne le focus : le visiteur qui a touché « Rechercher »
        // veut taper, pas chercher où taper.
        if (!store.theme.catalog.showSearch) return null;
        return {
          key, label: 'Rechercher', Icon: Search, href: `${catalog}?focus=search`,
        };

      case 'cart':
        return {
          key, label: 'Panier', Icon: ShoppingBag,
          onClick: openDrawer,
          badge: hydrated ? count : 0,
        };

      case 'availability': {
        // Ce qui est réellement en stock, pas une page « disponibilités » qui
        // promettrait une liste tenue à jour à la main.
        const href = `${catalog}?stock=1`;
        return { key, label: 'Disponibilité', Icon: PackageCheck, href };
      }

      case 'book':
        if (!booking) return null;
        return {
          key, label: 'Réserver', Icon: CalendarCheck, href: booking,
          external: booking.startsWith('http'),
        };

      case 'whatsapp':
        if (!whatsapp) return null;
        return {
          key, label: 'WhatsApp', Icon: MessageCircle, external: true,
          href: buildWhatsAppLink(
            whatsapp,
            `Bonjour ${store.name}, j'ai une question sur un produit.`,
          ),
        };

      case 'call':
        if (!store.contactPhone) return null;
        return {
          key, label: 'Appeler', Icon: Phone,
          href: `tel:${store.contactPhone.replace(/\s/g, '')}`,
        };

      case 'checkout': {
        // Le panier vide, « Commander » renvoie au catalogue : un tunnel de
        // commande vide est une impasse, et c'est le premier geste du visiteur
        // qui arrive par le socle sans avoir rien choisi.
        const empty = !hydrated || count === 0;
        return {
          key, label: 'Commander', Icon: CreditCard,
          href: empty ? catalog : `${store.base}/checkout`,
        };
      }

      default:
        return null;
    }
  }

  const entries = design.mobile.dock
    .map(resolve)
    .filter((e): e is Entry => e !== null);

  // Une seule entrée survivante ne fait pas une navigation : mieux vaut rendre
  // le bas de l'écran à la page.
  if (entries.length < 2) return null;

  const fixed = mode === 'fixed';

  return (
    <>
      {/* Le socle fixe recouvrirait la fin du pied de page — les mentions, les
          moyens de paiement — sans cette cale. Dans le flux, il n'en a pas
          besoin : il prend sa place lui-même. */}
      {fixed && (
        <div
          aria-hidden
          className="lg:hidden"
          style={{ height: `calc(${DOCK_HEIGHT}px + env(safe-area-inset-bottom))` }}
        />
      )}

      <nav
        aria-label="Navigation de la boutique"
        className={`border-t lg:hidden ${fixed ? 'fixed inset-x-0 bottom-0 z-40' : ''}`}
        style={{
          height:        fixed
            ? `calc(${DOCK_HEIGHT}px + env(safe-area-inset-bottom))`
            : `${DOCK_HEIGHT}px`,
          paddingBottom: fixed ? 'env(safe-area-inset-bottom)' : undefined,
          borderColor:   'var(--st-border)',
          background:    'var(--st-surface)',
          // Le socle passe devant du contenu qui défile : sans ce voile, un
          // titre clair sous lui se devine à travers et le rend sale.
          backdropFilter: fixed ? 'saturate(140%) blur(8px)' : undefined,
        }}
      >
        <ul className="mx-auto flex h-full max-w-lg items-stretch">
          {entries.map((entry) => {
            const current = entry.match?.(pathname) ?? false;
            const ink = current ? 'var(--st-accent)' : 'var(--st-ink-2)';

            const body = (
              <>
                <span className="relative">
                  <entry.Icon
                    className="h-[22px] w-[22px]"
                    strokeWidth={current ? 2.1 : 1.7}
                    aria-hidden
                  />
                  {entry.badge !== undefined && entry.badge > 0 && (
                    <span
                      className="absolute -right-2 -top-1.5 flex h-[17px] min-w-[17px] items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums"
                      style={{ background: 'var(--st-accent)', color: 'var(--st-accent-ink)' }}
                    >
                      {entry.badge > 99 ? '99+' : entry.badge}
                    </span>
                  )}
                </span>
                <span className="text-[10.5px] font-medium leading-none">{entry.label}</span>
              </>
            );

            const shared =
              'flex h-full w-full flex-col items-center justify-center gap-1.5 transition';

            return (
              <li key={entry.key} className="flex-1">
                {entry.href ? (
                  entry.external ? (
                    <a
                      href={entry.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={shared}
                      style={{ color: ink }}
                    >
                      {body}
                    </a>
                  ) : (
                    <Link
                      href={entry.href}
                      aria-current={current ? 'page' : undefined}
                      className={shared}
                      style={{ color: ink }}
                    >
                      {body}
                    </Link>
                  )
                ) : (
                  <button
                    ref={entry.key === 'categories' ? categoriesButton : undefined}
                    type="button"
                    onClick={entry.onClick}
                    className={shared}
                    style={{ color: ink }}
                  >
                    {body}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
