'use client';

// ─────────────────────────────────────────────────────────────────────────────
// La fiche produit
//
// C'est l'écran où la vente se décide. Le §16 en donne la structure :
// galerie à gauche, informations à droite, et un bouton d'achat visuellement
// dominant. Le §17 y ajoute la réassurance, le §18 la barre d'achat collante.
//
// ── Ce qui a été corrigé au passage ────────────────────────────────────────
//
//   L'ajout au panier renvoyait vers /cart. On quittait la fiche, on perdait
//   les produits similaires, et la deuxième vente ne se faisait pas. Le tiroir
//   s'ouvre à la place, la page reste.
//
//   Le prix affiché ne suivait pas la quantité. « Ajouter au panier —
//   1 250 HTG » pour trois unités est un chiffre faux sur l'écran d'un logiciel
//   de gestion. Le bouton porte maintenant le total réel.
//
//   La galerie était une image carrée rognée et quatre vignettes. Pas de zoom,
//   pas de navigation. Sur un objet qu'on ne peut pas toucher, c'est la
//   moitié de l'argument de vente qui manquait.
//
//   Les déclinaisons saisies par le marchand — taille, couleur, capacité —
//   n'apparaissaient nulle part alors qu'elles étaient en base et servaient
//   déjà de filtres au catalogue.
//
// Sur mobile, la barre d'achat colle en bas dès que le bouton principal sort de
// l'écran : sur une fiche longue, l'acheteur convaincu par la description
// devait remonter pour acheter.
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Minus, Plus, MessageCircle, Star, BellRing, Heart, Share2, Check, CalendarCheck } from 'lucide-react';
import { useCart } from '../../../../../components/store/CartContext';
import { useFavorites } from '../../../../../components/store/FavoritesContext';
import { ProductGallery } from '../../../../../components/store/blocks/ProductGallery';
import { AddToCartButton } from '../../../../../components/store/blocks/AddToCartButton';
import { ProductAssurance } from '../../../../../components/store/blocks/ProductAssurance';
import { storeMoney } from '../../../../../components/store/format';
import { trackStoreEvent } from '../../../../../components/store/blocks/TrackView';
import { NotifyWhenAvailable } from '../../../../../components/store/blocks/NotifyWhenAvailable';
import { buildWhatsAppOrderLink, buildBookingLink, resolveOrderPhone } from '../../../../../lib/storeWhatsApp';
import { designFor } from '../../../../../lib/storeDesign';
import { useOwnsBottomBar } from '../../../../../components/store/StorefrontUI';
import { collectionHref } from '../../../../../lib/storeTheme';
import type { ShippingMode } from '../../../../actions/store-public';
import type { StoreProduct, StoreView } from '../../../../../components/store/types';

export function ProductDetailClient({
  product,
  store,
  businessId,
  rating,
  shippingModes,
  paymentMethods,
}: {
  product: StoreProduct;
  store:   StoreView;
  businessId: string;
  /** La note moyenne réelle. `count` à zéro : rien ne s'affiche. */
  rating:  { average: number; count: number };
  shippingModes:  ShippingMode[];
  paymentMethods: string[];
}) {
  const router    = useRouter();
  const { addItem, openDrawer } = useCart();
  const favorites = useFavorites();
  const design    = designFor(store.templateId);

  const [qty, setQty]   = useState(1);
  const [copied, setCopied] = useState(false);
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

  const variants = Object.entries(product.attributes ?? {}).filter(
    ([, v]) => typeof v === 'string' && v.trim(),
  );

  const discount = product.compare_at_price !== null && product.compare_at_price > price
    ? Math.round((1 - price / product.compare_at_price) * 100)
    : null;

  const isFavorite = favorites.hydrated && favorites.has(product.id);

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
   * Le partage. `navigator.share` sur les téléphones — c'est par WhatsApp que
   * circulent les liens ici, et le partage natif y mène en un geste. Ailleurs,
   * l'adresse part dans le presse-papier et on le dit.
   */
  async function share() {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    if (!url) return;
    try {
      if (navigator.share) {
        await navigator.share({ title: product.name, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Partage annulé par le visiteur, ou presse-papier refusé : rien à dire.
    }
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

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
        {/* ── Visuels ── */}
        <ProductGallery images={images} alt={product.name} rule={design.mediaPdp} />

        {/* ── Informations ── */}
        <div className="flex flex-col">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              {product.category && (
                <p className="text-[12px] uppercase tracking-wide text-[var(--st-ink-3)]">
                  {product.category}
                </p>
              )}

              <h1
                className="mt-1 text-[var(--st-ink)]"
                style={{
                  fontFamily:    'var(--st-font-heading)',
                  fontSize:      'var(--st-h2)',
                  fontWeight:    design.type.upper ? 500 : 600,
                  lineHeight:    1.15,
                  letterSpacing: 'var(--st-tracking)',
                  textTransform: design.type.upper ? 'uppercase' : undefined,
                }}
              >
                {product.name}
              </h1>
            </div>

            <div className="flex flex-shrink-0 gap-1">
              <button
                type="button"
                onClick={() => favorites.toggle(product.id)}
                aria-label={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                aria-pressed={isFavorite}
                className="flex h-11 w-11 items-center justify-center border transition"
                style={{ borderColor: 'var(--st-border)', borderRadius: 'var(--st-radius-btn)' }}
              >
                <Heart
                  className="h-[18px] w-[18px]"
                  strokeWidth={1.8}
                  style={{
                    fill:  isFavorite ? 'var(--st-accent)' : 'transparent',
                    color: isFavorite ? 'var(--st-accent)' : 'var(--st-ink-2)',
                  }}
                  aria-hidden
                />
              </button>
              <button
                type="button"
                onClick={share}
                aria-label="Partager ce produit"
                className="flex h-11 w-11 items-center justify-center border transition"
                style={{ borderColor: 'var(--st-border)', borderRadius: 'var(--st-radius-btn)' }}
              >
                {copied
                  ? <Check className="h-[18px] w-[18px] text-[var(--st-ink-2)]" strokeWidth={2.2} aria-hidden />
                  : <Share2 className="h-[18px] w-[18px] text-[var(--st-ink-2)]" strokeWidth={1.8} aria-hidden />}
              </button>
            </div>
          </div>

          {rating.count > 0 && (
            <div className="mt-3 flex items-center gap-2">
              <div className="flex gap-0.5" aria-label={`${rating.average} sur 5`}>
                {Array.from({ length: 5 }, (_, i) => (
                  <Star
                    key={i}
                    className="h-4 w-4"
                    strokeWidth={1.5}
                    style={{
                      fill:  i < Math.round(rating.average) ? 'var(--st-accent)' : 'transparent',
                      color: i < Math.round(rating.average) ? 'var(--st-accent)' : 'var(--st-ink-3)',
                    }}
                    aria-hidden
                  />
                ))}
              </div>
              <a href="#avis" className="text-[13px] text-[var(--st-ink-2)] underline underline-offset-4">
                {rating.count} avis
              </a>
            </div>
          )}

          {store.showPrices && (
            <p className="mt-5 flex flex-wrap items-baseline gap-3">
              <span className="text-[32px] font-semibold tabular-nums text-[var(--st-ink)]">
                {storeMoney(price, store.currency)}
              </span>
              {product.compare_at_price !== null && (
                <>
                  <span className="text-[17px] tabular-nums text-[var(--st-ink-3)] line-through">
                    {storeMoney(product.compare_at_price, store.currency)}
                  </span>
                  {discount !== null && (
                    <span
                      className="rounded-[6px] px-2 py-0.5 text-[12px] font-semibold"
                      style={{ background: 'var(--st-accent)', color: 'var(--st-accent-ink)' }}
                    >
                      −{discount} %
                    </span>
                  )}
                </>
              )}
            </p>
          )}

          {store.showStock && (
            <p
              className="mt-2 text-[13px] font-semibold"
              style={{
                color: outOfStock ? '#B23A2F' : soldOut || product.stock <= 5 ? '#B45309' : '#0B7F54',
              }}
            >
              {outOfStock
                ? 'Épuisé'
                : soldOut
                  // Commandable mais pas en rayon : le dire franchement plutôt
                  // que d'afficher « En stock » et de décevoir à la livraison.
                  ? 'Sur commande — délai à confirmer avec le marchand'
                  : product.stock <= 5
                    ? `Plus que ${product.stock} en stock`
                    : 'En stock'}
            </p>
          )}

          {product.description && (
            <p className="mt-6 whitespace-pre-line text-[15px] leading-relaxed text-[var(--st-ink-2)]">
              {product.description}
            </p>
          )}

          {/* Les déclinaisons. Elles décrivent CETTE fiche : ProfitPilot gère un
              produit par variante, une taille est donc un attribut de l'article
              et non un sélecteur. Les afficher comme un choix promettrait une
              bascule qui n'existe pas ; les afficher comme une caractéristique
              dit la vérité et sert quand même à décider. */}
          {variants.length > 0 && (
            <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3">
              {variants.map(([key, value]) => (
                <div key={key} className="min-w-0">
                  <dt className="text-[12px] uppercase tracking-wide text-[var(--st-ink-3)]">{key}</dt>
                  <dd className="truncate text-[14px] font-medium text-[var(--st-ink)]">{value}</dd>
                </div>
              ))}
            </dl>
          )}

          {!outOfStock && !booking && (
            <div className="mt-8 flex items-center gap-4">
              <span className="text-[14px] font-semibold text-[var(--st-ink)]">Quantité</span>
              <div
                className="flex items-center border"
                style={{ borderColor: 'var(--st-border)', borderRadius: 'var(--st-radius-btn)' }}
              >
                <button
                  type="button"
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  aria-label="Diminuer la quantité"
                  className="flex h-11 w-11 items-center justify-center text-[var(--st-ink-2)]"
                >
                  <Minus className="h-4 w-4" strokeWidth={2} aria-hidden />
                </button>
                <span className="min-w-[36px] text-center text-[15px] font-semibold tabular-nums text-[var(--st-ink)]">
                  {qty}
                </span>
                <button
                  type="button"
                  onClick={() => setQty((q) => q + 1)}
                  aria-label="Augmenter la quantité"
                  className="flex h-11 w-11 items-center justify-center text-[var(--st-ink-2)]"
                >
                  <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
                </button>
              </div>
            </div>
          )}

          <div ref={ctaRef} className="mt-6 flex flex-col gap-3">
            {/* La prestation ne va pas au panier : elle se réserve (§34). Le
                bouton n'apparaît que si le prestataire est joignable — sinon
                la fiche retombe sur le panier, qui vaut mieux qu'une impasse. */}
            {booking ? (
              <a
                href={booking}
                target={booking.startsWith('http') ? '_blank' : undefined}
                rel={booking.startsWith('http') ? 'noopener noreferrer' : undefined}
                onClick={() => trackStoreEvent({ businessId, event: 'whatsapp_click', productId: product.id })}
                className="flex min-h-[56px] w-full items-center justify-center gap-2 text-[15px] font-semibold transition hover:brightness-95"
                style={{
                  background:   'var(--st-accent)',
                  color:        'var(--st-accent-ink)',
                  borderRadius: 'var(--st-radius-btn)',
                }}
              >
                <CalendarCheck className="h-4 w-4" strokeWidth={2.2} aria-hidden />
                Réserver cette prestation
              </a>
            ) : (
              <AddToCartButton
                product={product}
                store={store}
                quantity={qty}
                showTotal
                onAdded={trackAdd}
              />
            )}

            {/* ── « Acheter maintenant » (§16) ──────────────────────────────
                Le geste de celui qui a déjà décidé : l'article part au panier et
                la page suivante est le tunnel, sans passer par le tiroir.

                Il n'existe que sur les gabarits où l'achat est un réflexe. Sur
                une prestation ou un lot de bétail, il n'y a rien à acheter en un
                geste — il y a un rendez-vous à prendre, ou un prix à demander —
                et le proposer ferait promettre à la page une caisse qui ne
                conclura pas la vente.

                Volontairement SECONDAIRE à l'écran : deux boutons pleins de la
                couleur d'action se disputent l'œil, et le visiteur qui hésite
                entre deux actions dominantes n'en fait aucune. */}
            {design.checkout.buyNow && !outOfStock && !booking && (
              <button
                type="button"
                onClick={() => {
                  addItem(product, qty);
                  trackAdd();
                  router.push(`${store.base}/checkout`);
                }}
                className="flex min-h-[52px] w-full items-center justify-center gap-2 border text-[15px] font-semibold text-[var(--st-ink)] transition hover:bg-[var(--st-surface-2)]"
                style={{ borderColor: 'var(--st-ink)', borderRadius: 'var(--st-radius-btn)' }}
              >
                Acheter maintenant
              </button>
            )}

            {whatsappLink && !outOfStock && !booking && (
              <a
                href={whatsappLink}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackStoreEvent({ businessId, event: 'whatsapp_click', productId: product.id })}
                className="flex min-h-[52px] w-full items-center justify-center gap-2 border text-[14px] font-semibold text-[var(--st-ink)] transition hover:bg-[var(--st-surface-2)]"
                style={{ borderColor: 'var(--st-border)', borderRadius: 'var(--st-radius-btn)' }}
              >
                <MessageCircle className="h-4 w-4" strokeWidth={2} aria-hidden />
                Commander sur WhatsApp
              </a>
            )}

            {/* Épuisé sans vente à découvert : la fiche cesse d'être une
                impasse. Le visiteur laisse son adresse, le marchand récupère
                une demande au lieu de perdre un client (§25). */}
            {outOfStock && (
              <div
                className="border p-4"
                style={{
                  borderColor: 'var(--st-border)',
                  background: 'var(--st-surface-2)',
                  borderRadius: 'var(--st-radius-card)',
                }}
              >
                <p className="flex items-center gap-2 text-[14px] font-semibold text-[var(--st-ink)]">
                  <BellRing className="h-4 w-4" strokeWidth={2} aria-hidden />
                  Prévenez-moi quand c'est disponible
                </p>
                <NotifyWhenAvailable businessId={businessId} productId={product.id} />
              </div>
            )}
          </div>

          <ProductAssurance
            theme={store.theme}
            shippingModes={shippingModes}
            paymentMethods={paymentMethods}
            contactPhone={store.contactPhone}
            currency={store.currency}
          />
        </div>
      </div>

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
          {/* ── Le verbe du métier (§5) ──────────────────────────────────
              « Ajouter au panier » sur les six gabarits métier en ferait une
              seule boutique. Le libellé vient du gabarit — mais il ne promet
              jamais plus que ce que le bouton fait vraiment : un « Demander ce
              lot » posé sur un ajout au panier serait un mensonge à l'écran, et
              c'est pour cela que le cas se résout AVANT d'être affiché. */}
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
