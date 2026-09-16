'use client';

// ─────────────────────────────────────────────────────────────────────────────
// L'en-tête de vitrine
//
// C'est la barre de navigation d'une boutique, pas celle d'un tableau de bord —
// le §13 le dit sans détour : « éviter les menus admin-style ». Concrètement,
// elle porte ce qu'une boutique porte : la marque, les rayons, la recherche, les
// favoris, le panier. Et rien d'autre : il n'y a pas de compte client sur une
// vitrine ProfitPilot, donc pas d'icône « Compte » qui mènerait à une page de
// connexion inexistante.
//
// ── Quatre structures, un seul comportement ────────────────────────────────
//
//   centered  La marque au centre, les rayons à gauche, les actions à droite.
//             La grammaire du prêt-à-porter et de la cosmétique.
//   classic   Marque, rayons, recherche large, actions. Le commerce en général,
//             où l'on cherche autant qu'on parcourt.
//   compact   Une barre de 52 pixels. Le visiteur arrive d'un lien TikTok ou
//             WhatsApp sur une connexion mobile : chaque pixel d'en-tête est un
//             produit de moins visible au premier écran.
//   action    Celle du commerce en général, plus un bouton : « Prendre
//             rendez-vous » chez un prestataire, le numéro chez un éleveur.
//             Ces deux métiers ne convertissent pas par le panier, et sur une
//             page qu'on lit longtemps l'action doit rester à portée.
//
// ── L'en-tête sombre ───────────────────────────────────────────────────────
//
// Le gabarit « Vendeur social » porte un aplat de sa couleur de structure. Rien
// n'est réécrit pour autant : l'en-tête redéfinit `--st-ink` et compagnie POUR
// LUI SEUL, et les enfants — marque, rayons, panier, recherche — continuent de
// lire les mêmes variables sans savoir qu'elles ont changé de valeur. Peindre
// chaque enfant à la main aurait laissé le premier composant ajouté demain en
// encre foncée sur fond foncé.
//
// ── Le menu mobile ─────────────────────────────────────────────────────────
//
// C'était une liste déroulante de deux liens sous la barre. C'est maintenant un
// panneau plein écran : recherche en haut, rayons en liste tapable, favoris et
// contact en bas. Le §13 demande « un menu mobile excellent », et sur une
// vitrine, la majorité du trafic est mobile — c'est la navigation principale,
// pas une version dégradée.
//
// Il ferme sur Échap, il bloque le défilement de la page derrière lui, et il
// rend le focus au bouton qui l'a ouvert. Ces trois détails ne se voient pas
// quand ils sont là ; ils se voient tout de suite quand ils manquent.
//
// Le compteur du panier ne se rend pas tant que `hydrated` est faux — il vient
// de localStorage, que le serveur ne peut pas connaître.
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ShoppingBag, Menu, X, Search, Heart, Phone, Mail, CalendarCheck, MessageCircle } from 'lucide-react';
import { useCart } from './CartContext';
import { useFavorites } from './FavoritesContext';
import { useStorefrontUI } from './StorefrontUI';
import { SmartSearch } from './blocks/SmartSearch';
import { designFor } from '../../lib/storeDesign';
import { alreadyBroken } from '../../lib/storeImage';
import { collectionHref } from '../../lib/storeTheme';
import { resolveOrderPhone, buildBookingLink } from '../../lib/storeWhatsApp';
import { buildWhatsAppLink } from '../../lib/whatsappReport';
import type { StoreProduct, StoreCategory, StoreView } from './types';

export function StorefrontHeader({
  store,
  searchIndex = [],
  categories = [],
}: {
  store: StoreView;
  /** Le catalogue déjà chargé, pour la recherche instantanée. */
  searchIndex?: StoreProduct[];
  /** Les rayons, pour la navigation. */
  categories?: StoreCategory[];
}) {
  const { count, hydrated, openDrawer } = useCart();
  const favorites = useFavorites();
  // Le tiroir est dessiné ici mais son état est partagé : le socle mobile
  // l'ouvre par son entrée « Catégories » (§4). Voir `StorefrontUI`.
  const { menuOpen, openMenu, closeMenu, menuOpener } = useStorefrontUI();
  const [logoFailed, setLogoFailed] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  const design     = designFor(store.templateId);
  const variant    = design.nav;
  const showSearch = store.theme.catalog.showSearch && searchIndex.length > 0;

  // Les rayons mis en avant dans la barre. Au-delà de cinq, ils débordent et
  // repoussent la recherche : le reste vit dans « Tout voir » et dans le menu.
  const topCategories = categories.slice(0, 5);

  // Échap ferme, le corps ne défile plus derrière, et le focus revient au
  // bouton. Un panneau plein écran qu'on ne peut fermer qu'en visant une croix
  // de 40 pixels est une impasse sur un téléphone tenu d'une main.
  useEffect(() => {
    if (!menuOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeMenu();
    }
    document.addEventListener('keydown', onKey);

    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', onKey);
      // Le focus revient à ce qui a ouvert le tiroir — le bouton de l'en-tête
      // ou l'entrée « Catégories » du socle. Le rendre systématiquement à
      // l'en-tête ferait remonter un lecteur d'écran en haut de page alors que
      // la main était en bas.
      (menuOpener.current ?? menuButtonRef.current)?.focus();
    };
  }, [menuOpen, closeMenu, menuOpener]);

  const CartButton = (
    <button
      type="button"
      onClick={openDrawer}
      aria-label={hydrated && count > 0 ? `Panier, ${count} article${count > 1 ? 's' : ''}` : 'Panier'}
      className="relative flex h-11 w-11 items-center justify-center text-[var(--st-ink)] transition hover:bg-[var(--st-surface-2)]"
      style={{ borderRadius: 'var(--st-radius-btn)' }}
    >
      <ShoppingBag className="h-5 w-5" strokeWidth={1.7} aria-hidden />
      {hydrated && count > 0 && (
        <span
          className="absolute right-0.5 top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[11px] font-semibold tabular-nums"
          style={{ background: 'var(--st-accent)', color: 'var(--st-accent-ink)' }}
        >
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  );

  // Les favoris n'apparaissent que lorsqu'il y en a. Une icône vide sur toutes
  // les boutiques ajoute une action à une barre qui doit en compter peu.
  const FavoritesButton = favorites.hydrated && favorites.count > 0 ? (
    <Link
      href={`${store.base}/favoris`}
      aria-label={`Favoris, ${favorites.count} article${favorites.count > 1 ? 's' : ''}`}
      className="relative hidden h-11 w-11 items-center justify-center text-[var(--st-ink)] transition hover:bg-[var(--st-surface-2)] sm:flex"
      style={{ borderRadius: 'var(--st-radius-btn)' }}
    >
      <Heart className="h-5 w-5" strokeWidth={1.7} aria-hidden />
      <span
        className="absolute right-0.5 top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[11px] font-semibold tabular-nums"
        style={{ background: 'var(--st-ink)', color: 'var(--st-surface)' }}
      >
        {favorites.count}
      </span>
    </Link>
  ) : null;

  /**
   * WhatsApp, dans l'en-tête.
   *
   * Les maquettes le posent entre la recherche et le panier, et elles ont
   * raison pour ici : en Haïti, la question qui précède l'achat — une taille,
   * une couleur, « vous livrez à Delmas ? » — ne part pas par courriel. Elle
   * part par WhatsApp, et si le bouton n'est pas là au moment où elle se pose,
   * elle ne part pas du tout : le visiteur ferme la page.
   *
   * Il n'apparaît qu'à deux conditions, toutes deux vérifiables :
   *
   *   — le marchand a un numéro (celui du thème, de la boutique, ou son
   *     numéro de contact) ; sinon le bouton ouvrirait une conversation avec
   *     personne ;
   *   — le créneau est libre, c'est-à-dire `navCta: 'none'`. Chez un
   *     prestataire, « Prendre rendez-vous » occupe déjà cette place et vaut
   *     mieux : c'est la conversion du métier, pas une conversation.
   *
   * Le vert est celui de WhatsApp, pas celui du gabarit. C'est la seule
   * couleur de la vitrine qui n'obéit pas au thème, et c'est volontaire : ce
   * bouton n'est reconnu que par sa couleur — repeint en bordeaux sur un
   * gabarit Luxe, il devient une icône de plus que personne ne lit.
   */
  const waNumber = resolveOrderPhone(
    store.theme.whatsapp.number,
    store.whatsappPhone,
    store.contactPhone,
  );

  const WhatsAppButton = design.navCta === 'none' && waNumber ? (
    <a
      // Le même message que l'entrée WhatsApp du socle mobile : le marchand
      // reçoit la même phrase, quel que soit le bouton pressé.
      href={buildWhatsAppLink(
        waNumber,
        store.theme.whatsapp.greeting
          || `Bonjour ${store.name}, j'ai une question sur un produit.`,
      )}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Écrire à la boutique sur WhatsApp"
      className="flex h-11 w-11 items-center justify-center transition hover:brightness-95"
      style={{ borderRadius: 'var(--st-radius-btn)', background: '#25D366', color: '#FFFFFF' }}
    >
      <MessageCircle className="h-5 w-5" strokeWidth={2} aria-hidden />
    </a>
  ) : null;

  // ── Le bouton de l'en-tête (§34) ────────────────────────────────────────
  //
  // Il n'existe que sur les deux métiers dont la vente ne commence pas par un
  // panier, et il pointe vers un moyen de contact qui existe VRAIMENT : le
  // WhatsApp du marchand, son courriel, son numéro. Aucun des trois n'est
  // renseigné ? Pas de bouton. Un « Prendre rendez-vous » qui n'aboutit nulle
  // part coûte plus cher au marchand que l'absence de bouton : le visiteur
  // conclut que la boutique ne fonctionne pas.
  const ctaPhone = resolveOrderPhone(
    store.theme.whatsapp.number,
    store.whatsappPhone,
    store.contactPhone,
  );

  const ctaHref =
    design.navCta === 'phone'
      ? (store.contactPhone ? `tel:${store.contactPhone.replace(/\s/g, '')}` : null)
      : design.navCta === 'booking'
        ? buildBookingLink({ storeName: store.name, phone: ctaPhone, email: store.contactEmail })
        : null;

  const CtaIcon   = design.navCta === 'phone' ? Phone : CalendarCheck;
  const ctaLabel  = design.navCta === 'phone' ? (store.contactPhone ?? '') : 'Prendre rendez-vous';
  const ctaIsHttp = ctaHref?.startsWith('http') ?? false;

  const NavCta = ctaHref ? (
    <a
      href={ctaHref}
      target={ctaIsHttp ? '_blank' : undefined}
      rel={ctaIsHttp ? 'noopener noreferrer' : undefined}
      // Sur téléphone, l'icône seule : le libellé complet mangerait la barre et
      // repousserait le panier hors de portée du pouce. La cible reste à 44.
      className="flex h-11 min-w-[44px] items-center justify-center gap-2 px-3 text-[14px] font-semibold transition hover:brightness-95 sm:px-4"
      style={{
        background:   'var(--st-accent)',
        color:        'var(--st-accent-ink)',
        borderRadius: 'var(--st-radius-btn)',
      }}
    >
      <CtaIcon className="h-4 w-4 flex-shrink-0" strokeWidth={2} aria-hidden />
      <span className="hidden whitespace-nowrap sm:inline">{ctaLabel}</span>
      <span className="sr-only sm:hidden">{ctaLabel}</span>
    </a>
  ) : null;

  const MenuButton = (
    <button
      ref={menuButtonRef}
      type="button"
      onClick={() => openMenu(menuButtonRef.current)}
      aria-label="Ouvrir le menu"
      aria-expanded={menuOpen}
      aria-controls="store-mobile-menu"
      className="flex h-11 w-11 items-center justify-center text-[var(--st-ink)] lg:hidden"
      style={{ borderRadius: 'var(--st-radius-btn)' }}
    >
      <Menu className="h-5 w-5" strokeWidth={1.8} aria-hidden />
    </button>
  );

  const Brand = (
    <Link
      href={store.base || '/'}
      className="flex min-h-[44px] min-w-0 items-center gap-2"
      aria-label={store.name}
    >
      {/* Le logo, s'il charge. Sinon le nom.
          Ce n'est pas un cas d'école : le logo de la boutique de test est
          hébergé sur un CDN qui répond 410, et l'en-tête affichait la vignette
          cassée du navigateur avec le texte alternatif à côté — à l'endroit
          exact où la boutique se présente. Un nom bien composé vaut mieux
          qu'une image absente. */}
      {store.logoUrl && !logoFailed ? (
        // eslint-disable-next-line @next/next/no-img-element -- logo marchand, hôte libre
        <img
          // Le logo est téléchargé pendant le rendu serveur, donc avant
          // qu'`onError` existe : à l'hydratation, on lui demande son état
          // plutôt que d'attendre un évènement déjà passé.
          ref={(el) => { if (alreadyBroken(el)) setLogoFailed(true); }}
          src={store.logoUrl}
          alt={store.name}
          onError={() => setLogoFailed(true)}
          className={variant === 'compact' ? 'h-7 w-auto object-contain' : 'h-9 w-auto object-contain'}
        />
      ) : (
        <span
          className="truncate text-[var(--st-ink)]"
          style={{
            fontFamily:    'var(--st-font-heading)',
            fontSize:      variant === 'compact' ? '16px' : '18px',
            fontWeight:    design.type.upper ? 500 : 600,
            letterSpacing: design.type.upper ? '0.18em' : undefined,
            textTransform: design.type.upper ? 'uppercase' : undefined,
          }}
        >
          {store.name}
        </span>
      )}
    </Link>
  );

  const CategoryLinks = ({ onNavigate }: { onNavigate?: () => void }) => (
    <>
      {topCategories.map((c) => (
        <Link
          key={c.id}
          href={collectionHref(store.base, c)}
          onClick={onNavigate}
          className="flex min-h-[44px] items-center whitespace-nowrap text-[14px] font-medium text-[var(--st-ink-2)] transition hover:text-[var(--st-ink)]"
        >
          {c.name}
        </Link>
      ))}
      <Link
        href={`${store.base}/products`}
        onClick={onNavigate}
        className="flex min-h-[44px] items-center whitespace-nowrap text-[14px] font-medium text-[var(--st-ink-2)] transition hover:text-[var(--st-ink)]"
      >
        {topCategories.length > 0 ? 'Tout voir' : 'Produits'}
      </Link>
    </>
  );

  return (
    <>
      <header
        className="sticky top-0 z-30 border-b backdrop-blur"
        style={{
          // L'aplat sombre du gabarit social : les variables sont redéfinies
          // ici, donc `--st-surface` ci-dessous vaut déjà la couleur de
          // structure, et tout ce que porte la barre suit sans le savoir.
          ...(design.headerDark
            ? {
                ['--st-surface'   as string]: 'var(--st-primary)',
                ['--st-surface-2' as string]: 'color-mix(in srgb, var(--st-primary-ink) 14%, transparent)',
                ['--st-ink'       as string]: 'var(--st-primary-ink)',
                ['--st-ink-2'     as string]: 'color-mix(in srgb, var(--st-primary-ink) 78%, transparent)',
                ['--st-ink-3'     as string]: 'color-mix(in srgb, var(--st-primary-ink) 58%, transparent)',
                ['--st-border'    as string]: 'color-mix(in srgb, var(--st-primary-ink) 20%, transparent)',
              }
            : null),
          borderColor: 'var(--st-border)',
          background: 'color-mix(in srgb, var(--st-surface) 92%, transparent)',
        }}
      >
        <div
          className={[
            'mx-auto flex max-w-6xl items-center gap-3 px-4 sm:px-6',
            variant === 'compact' ? 'h-[52px]' : 'h-16',
          ].join(' ')}
        >
          {variant === 'centered' ? (
            <>
              {/* Marque au centre, rayons à gauche, actions à droite. */}
              <div className="flex flex-1 items-center gap-5">
                {MenuButton}
                <nav aria-label="Rayons" className="hidden items-center gap-5 lg:flex">
                  <CategoryLinks />
                </nav>
              </div>

              {/* `min-w-0` : sans lui, une marque longue — un nom de boutique
                  affiché parce que le logo manque — pousse les rayons hors du
                  centre au lieu d'être tronquée, et la barre cesse d'être
                  centrée là où le gabarit l'exige. */}
              <div className="flex min-w-0 justify-center">{Brand}</div>

              <div className="flex flex-1 items-center justify-end gap-1">
                {showSearch && (
                  <Link
                    href={`${store.base}/products`}
                    aria-label="Rechercher"
                    className="hidden h-11 w-11 items-center justify-center text-[var(--st-ink)] transition hover:bg-[var(--st-surface-2)] lg:flex"
                    style={{ borderRadius: 'var(--st-radius-btn)' }}
                  >
                    <Search className="h-5 w-5" strokeWidth={1.7} aria-hidden />
                  </Link>
                )}
                {FavoritesButton}
                {WhatsAppButton}
                {CartButton}
                {NavCta}
              </div>
            </>
          ) : (
            <>
              {Brand}

              <nav aria-label="Rayons" className="hidden items-center gap-5 lg:flex">
                <CategoryLinks />
              </nav>

              {/* `action` cherche autant que `classic` : c'est la même barre,
                  augmentée d'un bouton. La priver de recherche ferait d'un
                  catalogue d'éleveur une liste qu'on parcourt au doigt. */}
              {showSearch && (variant === 'classic' || variant === 'action') && (
                <SmartSearch
                  store={store}
                  products={searchIndex}
                  className="ml-auto hidden w-full max-w-xs lg:block"
                />
              )}

              <div className="ml-auto flex items-center gap-1 lg:ml-2">
                {FavoritesButton}
                {WhatsAppButton}
                {CartButton}
                {NavCta}
                {MenuButton}
              </div>
            </>
          )}
        </div>
      </header>

      {/* ── Le menu mobile ────────────────────────────────────────────────── */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Menu de la boutique"
          id="store-mobile-menu"
        >
          <button
            type="button"
            aria-label="Fermer le menu"
            onClick={() => closeMenu()}
            className="absolute inset-0 bg-[#0E1822]/40"
          />

          <div
            className="absolute inset-y-0 right-0 flex w-full max-w-sm flex-col shadow-2xl"
            style={{ background: 'var(--st-surface)' }}
          >
            <div
              className="flex h-16 flex-shrink-0 items-center justify-between border-b px-4"
              style={{ borderColor: 'var(--st-border)' }}
            >
              <span className="text-[15px] font-semibold text-[var(--st-ink)]">Menu</span>
              <button
                type="button"
                onClick={() => closeMenu()}
                aria-label="Fermer le menu"
                className="flex h-11 w-11 items-center justify-center text-[var(--st-ink)]"
                style={{ borderRadius: 'var(--st-radius-btn)' }}
              >
                <X className="h-5 w-5" strokeWidth={1.9} aria-hidden />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4">
              {showSearch && (
                <SmartSearch
                  store={store}
                  products={searchIndex}
                  className="mb-5"
                  onNavigate={() => closeMenu()}
                />
              )}

              {/* La même action que dans la barre, en pleine largeur. Le menu
                  est la navigation principale sur téléphone : y omettre la
                  conversion du métier, c'est la retirer à la majorité du
                  trafic. */}
              {ctaHref && (
                <a
                  href={ctaHref}
                  target={ctaIsHttp ? '_blank' : undefined}
                  rel={ctaIsHttp ? 'noopener noreferrer' : undefined}
                  onClick={() => closeMenu()}
                  className="mb-5 flex min-h-[52px] w-full items-center justify-center gap-2 text-[15px] font-semibold"
                  style={{
                    background:   'var(--st-accent)',
                    color:        'var(--st-accent-ink)',
                    borderRadius: 'var(--st-radius-btn)',
                  }}
                >
                  <CtaIcon className="h-4 w-4" strokeWidth={2} aria-hidden />
                  {ctaLabel}
                </a>
              )}

              <nav aria-label="Rayons">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--st-ink-3)]">
                  Rayons
                </p>
                <ul className="flex flex-col">
                  <li>
                    <Link
                      href={`${store.base}/products`}
                      onClick={() => closeMenu()}
                      className="flex min-h-[52px] items-center border-b text-[16px] font-medium text-[var(--st-ink)]"
                      style={{ borderColor: 'var(--st-border)' }}
                    >
                      Tous les produits
                    </Link>
                  </li>
                  {categories.map((c) => (
                    <li key={c.id}>
                      <Link
                        href={collectionHref(store.base, c)}
                        onClick={() => closeMenu()}
                        className="flex min-h-[52px] items-center justify-between gap-3 border-b text-[16px] font-medium text-[var(--st-ink)]"
                        style={{ borderColor: 'var(--st-border)' }}
                      >
                        <span className="truncate">{c.name}</span>
                        <span className="text-[13px] tabular-nums text-[var(--st-ink-3)]">{c.count}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>

              {favorites.hydrated && favorites.count > 0 && (
                <Link
                  href={`${store.base}/favoris`}
                  onClick={() => closeMenu()}
                  className="mt-5 flex min-h-[52px] items-center gap-3 text-[16px] font-medium text-[var(--st-ink)]"
                >
                  <Heart className="h-5 w-5" strokeWidth={1.7} aria-hidden />
                  Mes favoris
                  <span className="ml-auto text-[13px] tabular-nums text-[var(--st-ink-3)]">
                    {favorites.count}
                  </span>
                </Link>
              )}

              {(store.contactPhone || store.contactEmail) && (
                <div
                  className="mt-6 border-t pt-5"
                  style={{ borderColor: 'var(--st-border)' }}
                >
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--st-ink-3)]">
                    Nous joindre
                  </p>
                  {store.contactPhone && (
                    <a
                      href={`tel:${store.contactPhone.replace(/\s/g, '')}`}
                      className="flex min-h-[48px] items-center gap-3 text-[15px] text-[var(--st-ink-2)]"
                    >
                      <Phone className="h-4 w-4" strokeWidth={1.7} aria-hidden />
                      {store.contactPhone}
                    </a>
                  )}
                  {store.contactEmail && (
                    <a
                      href={`mailto:${store.contactEmail}`}
                      className="flex min-h-[48px] items-center gap-3 text-[15px] text-[var(--st-ink-2)]"
                    >
                      <Mail className="h-4 w-4" strokeWidth={1.7} aria-hidden />
                      {store.contactEmail}
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
