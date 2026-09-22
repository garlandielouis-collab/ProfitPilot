'use client';

// ─────────────────────────────────────────────────────────────────────────────
// La fiche produit
//
// C'est l'écran où la vente se décide. Le §16 en donne la structure : galerie à
// gauche, colonne d'achat à droite, bouton dominant ; le §17 la réassurance, le
// §18 la barre collante du téléphone.
//
// ── Ce que ce fichier fait, et ce qu'il ne fait plus ───────────────────────
//
// Il tient le CADRE : le fil d'Ariane, la galerie, les onglets, la barre
// d'achat collante. Il ne dessine plus la colonne de droite — elle existe en
// six versions, une par métier, et vivait ici en une seule (`BuyColumn`).
//
// Ce n'était pas une question de style. Un éleveur doit lire un poids et un âge
// avant un prix, un traiteur doit donner une date avant de payer, un
// prestataire ne met rien au panier. Une colonne unique ne pouvait dire les six
// qu'en les disant mal.
//
// ── Ce qui a été corrigé en chemin ─────────────────────────────────────────
//
//   L'ajout au panier renvoyait vers /cart : on quittait la fiche et la
//   deuxième vente ne se faisait pas. Le tiroir s'ouvre, la page reste.
//
//   Le bouton porte le total réel de la quantité choisie.
//
//   La description longue, les détails, la livraison et les avis s'empilaient
//   en colonne sur quatre écrans. Ils sont en onglets (`ProductTabs`), lisibles
//   sans faire défiler.
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { MessageCircle, CalendarCheck } from 'lucide-react';
import { useCart } from '../../../../../components/store/CartContext';
import { ProductGallery } from '../../../../../components/store/blocks/ProductGallery';
import { BuyColumn } from '../../../../../components/store/product/BuyColumn';
import { ProductTabs } from '../../../../../components/store/product/ProductTabs';
import { ProductBand } from '../../../../../components/store/product/ProductBand';
import { TrustRail } from '../../../../../components/store/product/TrustRail';
import { SpecGrid } from '../../../../../components/store/product/SpecGrid';
import { storeMoney } from '../../../../../components/store/format';
import { trackStoreEvent } from '../../../../../components/store/blocks/TrackView';
import { buildWhatsAppOrderLink, buildBookingLink, resolveOrderPhone } from '../../../../../lib/storeWhatsApp';
import { designFor } from '../../../../../lib/storeDesign';
import { pdpProfileFor } from '../../../../../lib/storeProductPage';
import { pickRailReview } from '../../../../../lib/storeReviewPick';
import { useOwnsBottomBar } from '../../../../../components/store/StorefrontUI';
import { collectionHref } from '../../../../../lib/storeTheme';
import type { ShippingMode } from '../../../../actions/store-public';
import type { StoreReview } from '../../../../../components/store/sections/types';
import type { StoreProduct, StoreView } from '../../../../../components/store/types';

export function ProductDetailClient({
  product,
  store,
  businessId,
  rating,
  reviews,
  shippingModes,
  paymentMethods,
}: {
  product: StoreProduct;
  store:   StoreView;
  businessId: string;
  /** La note moyenne réelle. `count` à zéro : rien ne s'affiche. */
  rating:  { average: number; count: number };
  /** Les avis publiés, rendus dans l'onglet « Avis ». */
  reviews: StoreReview[];
  shippingModes:  ShippingMode[];
  paymentMethods: string[];
}) {
  const { addItem, openDrawer } = useCart();
  const design  = designFor(store.templateId);
  const profile = pdpProfileFor(store.templateId);

  const [qty, setQty] = useState(1);
  const [ctaVisible, setCtaVisible] = useState(true);
  const ctaRef = useRef<HTMLDivElement>(null);

  const price      = product.sale_price ?? product.price;
  // La vente à découvert (§25) : à zéro mais commandable si le marchand l'a
  // autorisé sur cette fiche.
  const soldOut    = product.stock <= 0;
  const outOfStock = soldOut && !product.allow_backorders;

  const images = [product.image_url, ...product.images].filter(
    (src, i, arr): src is string => Boolean(src) && arr.indexOf(src) === i,
  );

  // La barre collante n'apparaît que quand le vrai bouton a quitté l'écran.
  // Sinon deux boutons d'achat identiques se superposent.
  useEffect(() => {
    const node = ctaRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => setCtaVisible(entry.isIntersecting),
      { rootMargin: '-80px 0px 0px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  function trackAdd() {
    trackStoreEvent({
      businessId,
      event:     'add_to_cart',
      productId: product.id,
      value:     price * qty,
    });
  }

  /**
   * La prise de rendez-vous, sur le gabarit des prestataires.
   *
   * `null` partout ailleurs — et aussi sur ce gabarit quand le marchand n'a
   * renseigné ni WhatsApp ni courriel : la fiche retombe alors sur le panier,
   * qui vaut mieux qu'un bouton qui n'aboutit nulle part.
   */
  const booking = design.card === 'service'
    ? buildBookingLink({
        storeName: store.name,
        phone:     resolveOrderPhone(store.theme.whatsapp.number, store.whatsappPhone, store.contactPhone),
        email:     store.contactEmail,
      })
    : null;

  // La barre d'achat collante occupe le bas de l'écran ; le socle mobile (§4)
  // s'efface pendant ce temps-là. Deux barres empilées, c'est la moitié de ce
  // qui reste sous le pouce sur un téléphone.
  useOwnsBottomBar(!outOfStock && !ctaVisible);

  const whatsappLink = store.whatsappPhone
    ? buildWhatsAppOrderLink(store.whatsappPhone, {
        storeName: store.name,
        currency:  store.currency,
        items:     [{ name: product.name, quantity: qty, price }],
        total:     price * qty,
        storeUrl:  store.origin ? `${store.origin}${store.base}/products/${product.id}` : null,
        greeting:  store.theme.whatsapp.greeting || null,
      })
    : null;

  /**
   * Le bouton collant de la fiche, résolu une fois (§5).
   *
   * Le gabarit fournit le VERBE — « Réserver » chez un prestataire, « Demander
   * ce lot » chez un éleveur, « Commander » chez un traiteur. Mais un libellé
   * ne crée pas l'action qu'il annonce : « Demander ce lot » ne s'affiche que
   * si une demande peut réellement partir, c'est-à-dire si le marchand a un
   * WhatsApp. Sans lui, la fiche retombe sur le panier ET sur son libellé — un
   * bouton qui promet une demande et remplit un panier serait pire que le
   * libellé générique.
   */
  const stickyCta: { kind: 'link'; href: string; label: string; Icon: typeof CalendarCheck }
                 | { kind: 'cart'; label: string } =
    booking
      ? { kind: 'link', href: booking, label: design.mobile.cta, Icon: CalendarCheck }
      : design.card === 'wholesale' && whatsappLink
        ? { kind: 'link', href: whatsappLink, label: design.mobile.cta, Icon: MessageCircle }
        : {
            kind: 'cart',
            label: design.card === 'wholesale' ? 'Ajouter au panier' : design.mobile.cta,
          };

  return (
    <div>
      <nav aria-label="Fil d'Ariane" className="mb-6 flex flex-wrap items-center gap-2 text-[12px] text-[var(--st-ink-3)]">
        <Link href={store.base || '/'} className="hover:text-[var(--st-ink-2)]">Accueil</Link>
        <span aria-hidden>/</span>
        <Link href={`${store.base}/products`} className="hover:text-[var(--st-ink-2)]">Produits</Link>
        {product.category && (
          <>
            <span aria-hidden>/</span>
            <Link
              href={collectionHref(store.base, {
                id: product.category_id ?? product.category,
                name: product.category,
              })}
              className="hover:text-[var(--st-ink-2)]"
            >
              {product.category}
            </Link>
          </>
        )}
        <span aria-hidden>/</span>
        <span className="truncate text-[var(--st-ink-2)]">{product.name}</span>
      </nav>

      <div
        className={
          profile.rail
            ? 'grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1.02fr)_minmax(0,1fr)_200px] lg:gap-10 xl:gap-12'
            : 'grid grid-cols-1 gap-10 lg:grid-cols-[1.05fr_1fr] lg:gap-16'
        }
      >
        {/* ── La colonne de gauche : ce qu'on regarde ───────────────────────
            La galerie seule. La bande de marque qui la suivait est descendue
            en pleine largeur, là où les vingt-trois maquettes la posent — en
            colonne à 40 %, l'histoire du marchand était une note de bas de page. */}
        <div className="min-w-0">
          <ProductGallery images={images} alt={product.name} rule={design.mediaPdp} />
        </div>

        {/* ── La colonne d'achat de CE métier (§16, §34) ────────────────────
            Six mécaniques, pas six couleurs : on ajoute au panier chez un
            commerçant, on réserve chez un prestataire, on demande un lot chez
            un éleveur, on commande pour une date chez un traiteur. */}
        <BuyColumn
          product={product}
          store={store}
          businessId={businessId}
          design={design}
          profile={profile}
          rating={rating}
          shippingModes={shippingModes}
          paymentMethods={paymentMethods}
          qty={qty}
          setQty={setQty}
          ctaRef={ctaRef}
          onAdd={trackAdd}
          whatsappLink={whatsappLink}
          booking={booking}
        />

        {/* ── Le rail de réassurance (§17) ──────────────────────────────────
            La troisième colonne. Elle ne s'affiche qu'au-dessus de `lg` : sur
            un téléphone, la réassurance reste dans la colonne d'achat, où elle
            suit le bouton au lieu de le précéder de trois écrans. */}
        {profile.rail && (
          <TrustRail
            theme={store.theme}
            shippingModes={shippingModes}
            currency={store.currency}
            review={pickRailReview(reviews)}
            reviewCount={rating.count}
          />
        )}
      </div>

      {/* ── Ce que la fiche sait dire, en onglets (§16) ─────────────────────
          Description, détails, livraison, retours, avis, questions — et chez
          l'artisan : histoire de la pièce, matériaux, fabrication, dimensions.
          Un onglet dont la source est vide ne s'affiche pas. */}
      {/* ── Les caractéristiques en tuiles, quand le rayon compare (§16, §34) ──
          Entre l'achat et les onglets : après la décision de prix, avant le
          détail qu'on va chercher. Le gabarit qui la pose n'a plus d'onglet
          « Caractéristiques » ni de tableau dans sa colonne. */}
      {profile.specGrid && (
        <SpecGrid attributes={product.attributes} title={profile.specGrid} />
      )}

      <ProductTabs
        tabs={profile.tabs}
        product={product}
        store={store}
        shippingModes={shippingModes}
        reviews={reviews}
        average={rating.average}
      />

      {/* ── La bande de marque, en pleine largeur (§16, §34) ──
          Le seul moment de la fiche où la BOUTIQUE parle d'elle-même : après
          le détail, avant les suggestions. Vide chez le marchand, elle n'existe
          pas. */}
      <ProductBand store={store} />

      {/* ── Barre d'achat collante, mobile uniquement (§18) ── */}
      {!outOfStock && !ctaVisible && (
        <div
          className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 border-t px-4 py-3 lg:hidden"
          style={{
            borderColor: 'var(--st-border)',
            background: 'var(--st-surface)',
            paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))',
          }}
        >
          {store.showPrices && (
            <div className="min-w-0">
              <p className="truncate text-[12px] text-[var(--st-ink-3)]">{product.name}</p>
              <p className="text-[16px] font-semibold tabular-nums text-[var(--st-ink)]">
                {storeMoney(price * qty, store.currency)}
              </p>
            </div>
          )}
          {stickyCta.kind === 'link' ? (
            <a
              href={stickyCta.href}
              target={stickyCta.href.startsWith('http') ? '_blank' : undefined}
              rel={stickyCta.href.startsWith('http') ? 'noopener noreferrer' : undefined}
              onClick={() => trackStoreEvent({ businessId, event: 'whatsapp_click', productId: product.id })}
              className="ml-auto flex min-h-[48px] flex-shrink-0 items-center justify-center gap-2 px-6 text-[15px] font-semibold"
              style={{
                background: 'var(--st-accent)',
                color: 'var(--st-accent-ink)',
                borderRadius: 'var(--st-radius-btn)',
              }}
            >
              <stickyCta.Icon className="h-4 w-4" strokeWidth={2.2} aria-hidden />
              {stickyCta.label}
            </a>
          ) : (
            <button
              type="button"
              onClick={() => { addItem(product, qty); trackAdd(); openDrawer(); }}
              className="ml-auto flex min-h-[48px] flex-shrink-0 items-center justify-center px-6 text-[15px] font-semibold"
              style={{
                background: 'var(--st-accent)',
                color: 'var(--st-accent-ink)',
                borderRadius: 'var(--st-radius-btn)',
              }}
            >
              {stickyCta.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
