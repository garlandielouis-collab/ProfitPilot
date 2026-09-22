'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Les six colonnes d'achat (§16, §34)
//
// À droite de la galerie, la colonne où la vente se conclut. Elle ne change pas
// de style d'un gabarit à l'autre : elle change de MÉCANIQUE, parce que la
// question qui bloque l'achat n'est pas la même selon ce qu'on vend.
//
//   cart       taille, couleur, quantité, panier — le commerce de détail
//   social     il en reste combien, l'offre finit quand, pourquoi celui-ci
//   craft      qui l'a faite, avec quoi, gravée à quel prénom, livrée quand
//   booking    ce qui est inclus, pour qui, et quel jour on se voit
//   livestock  poids, âge, race, prix à la tête, prix pour trente
//   catering   combien de parts, pour quelle date, livré ou retiré
//
// Les gabarits de marque et les presets de rayon (§33, §35) en ont ajouté
// quatre. Ils vont tous au panier — ce n'est donc pas la mécanique qui les
// distingue, c'est l'ORDRE dans lequel la colonne répond :
//
//   benefit    ce que ça m'apporte, puis ce qu'il y a dedans
//   apparel    quelle taille je fais, et si elle ne va pas
//   spec       les caractéristiques, puis la garantie
//   landing    l'offre, la promesse, le bouton — l'article EST la page
//
// ── Ce qu'aucune ne fait ───────────────────────────────────────────────────
//
// Calculer un prix. Tout ce que l'acheteur renseigne ici — date, message,
// adresse — part dans les NOTES de la commande via `storeOrderExtras`, jamais
// dans le montant : un total qui monterait parce qu'on a coché « livraison »
// serait un total que la caisse ne confirmerait pas (§6).
//
// Inventer une donnée. Un bloc dont la source est vide disparaît ; dans
// l'aperçu de l'éditeur, et là seulement, il laisse un exemple gris qui dit au
// marchand quoi remplir (`MerchantHint`).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState, type RefObject } from 'react';
import { useRouter } from 'next/navigation';
import {
  MessageCircle, CalendarCheck, BellRing, Clock, Truck, Store,
  Sparkles, Heart, Share2, Check, Ruler, ShieldCheck, Leaf, ArrowRight, RefreshCw,
} from 'lucide-react';
import { useCart } from '../CartContext';
import { useFavorites } from '../FavoritesContext';
import { AddToCartButton } from '../blocks/AddToCartButton';
import { NotifyWhenAvailable } from '../blocks/NotifyWhenAvailable';
import { PaymentMarks } from '../blocks/PaymentMarks';
import { Countdown } from '../blocks/Countdown';
import { ProductAssurance } from '../blocks/ProductAssurance';
import { MerchantHint } from './MerchantHint';
import {
  ProductEyebrow, ProductTitle, RatingRow, PriceRow, StockLine, AttributeChips,
  QtyStepper, AssuranceRow, HighlightList, FieldRow, SpecTable,
  INPUT_CLASS, INPUT_STYLE,
} from './BuyPieces';
import { openPdpTab } from './pdpTabs';
import { storeMoney } from '../format';
import { writeOrderExtras } from '../../../lib/storeOrderExtras';
import { trackStoreEvent } from '../blocks/TrackView';
import type { PdpProfile } from '../../../lib/storeProductPage';
import type { DesignProfile } from '../../../lib/storeDesign';
import type { StoreProduct, StoreView } from '../types';
import type { ShippingMode } from '../../../app/actions/store-public';

export type BuyColumnProps = {
  product:  StoreProduct;
  store:    StoreView;
  businessId: string;
  design:   DesignProfile;
  profile:  PdpProfile;
  rating:   { average: number; count: number };
  shippingModes:  ShippingMode[];
  paymentMethods: string[];
  qty:    number;
  setQty: (fn: (q: number) => number) => void;
  /** Le bloc observé par la barre d'achat collante du téléphone. */
  ctaRef: RefObject<HTMLDivElement>;
  onAdd:  () => void;
  whatsappLink: string | null;
  /** La prise de rendez-vous, chez un prestataire joignable. */
  booking: string | null;
};

export function BuyColumn(props: BuyColumnProps) {
  switch (props.profile.buy) {
    case 'social':    return <SocialColumn {...props} />;
    case 'craft':     return <CraftColumn {...props} />;
    case 'booking':   return <BookingColumn {...props} />;
    case 'livestock': return <LivestockColumn {...props} />;
    case 'catering':  return <CateringColumn {...props} />;
    case 'benefit':   return <BenefitColumn {...props} />;
    case 'apparel':   return <ApparelColumn {...props} />;
    case 'spec':      return <SpecColumn {...props} />;
    case 'landing':   return <LandingColumn {...props} />;
    default:          return <CartColumn {...props} />;
  }
}

// ── L'en-tête, commun aux six ───────────────────────────────────────────────

function ColumnHeader({ product, store, design, rating, discount }: BuyColumnProps & { discount: number | null }) {
  const favorites = useFavorites();
  const [copied, setCopied] = useState(false);
  const isFavorite = favorites.hydrated && favorites.has(product.id);

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
      // Partage annulé, ou presse-papier refusé : rien à dire.
    }
  }

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <ProductEyebrow product={product} discount={discount} />
          <ProductTitle name={product.name} upper={design.type.upper} />
          {product.short_description && product.short_description !== product.description && (
            <p className="mt-2 text-[15px] leading-relaxed text-[var(--st-ink-2)]">
              {product.short_description}
            </p>
          )}
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

      <RatingRow average={rating.average} count={rating.count} />
      {!store.showPrices && null}
    </>
  );
}

// ── Les boutons ─────────────────────────────────────────────────────────────

/**
 * La pile de boutons, résolue une fois pour les six colonnes.
 *
 * Le libellé vient du gabarit, mais il ne promet jamais plus que ce que le
 * bouton fait : « Demander ce lot » n'apparaît que si une demande peut
 * réellement partir, c'est-à-dire si le marchand a un WhatsApp.
 */
function CtaStack({
  props, primaryLabel, showBuyNow = true, whatsappLabel = 'Commander sur WhatsApp',
}: {
  props: BuyColumnProps;
  primaryLabel?: string;
  showBuyNow?: boolean;
  whatsappLabel?: string;
}) {
  const { product, store, businessId, design, qty, onAdd, whatsappLink, booking, ctaRef } = props;
  const router = useRouter();
  const { addItem } = useCart();

  const outOfStock = product.stock <= 0 && !product.allow_backorders;

  return (
    <div ref={ctaRef} className="mt-6 flex flex-col gap-3">
      {booking ? (
        <a
          href={booking}
          target={booking.startsWith('http') ? '_blank' : undefined}
          rel={booking.startsWith('http') ? 'noopener noreferrer' : undefined}
          onClick={() => trackStoreEvent({ businessId, event: 'whatsapp_click', productId: product.id })}
          className="flex min-h-[56px] w-full items-center justify-center gap-2 text-[15px] font-semibold transition hover:brightness-95"
          style={{ background: 'var(--st-accent)', color: 'var(--st-accent-ink)', borderRadius: 'var(--st-radius-btn)' }}
        >
          <CalendarCheck className="h-4 w-4" strokeWidth={2.2} aria-hidden />
          {primaryLabel ?? 'Réserver cette prestation'}
        </a>
      ) : (
        <AddToCartButton
          product={product}
          store={store}
          quantity={qty}
          showTotal
          label={primaryLabel}
          onAdded={onAdd}
        />
      )}

      {showBuyNow && design.checkout.buyNow && !outOfStock && !booking && (
        <button
          type="button"
          onClick={() => { addItem(product, qty); onAdd(); router.push(`${store.base}/checkout`); }}
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
          {whatsappLabel}
        </a>
      )}

      {outOfStock && (
        <div
          className="border p-4"
          style={{ borderColor: 'var(--st-border)', background: 'var(--st-surface-2)', borderRadius: 'var(--st-radius-card)' }}
        >
          <p className="flex items-center gap-2 text-[14px] font-semibold text-[var(--st-ink)]">
            <BellRing className="h-4 w-4" strokeWidth={2} aria-hidden />
            Prévenez-moi quand c'est disponible
          </p>
          <NotifyWhenAvailable businessId={businessId} productId={product.id} />
        </div>
      )}
    </div>
  );
}

function discountOf(product: StoreProduct): number | null {
  const price = product.sale_price ?? product.price;
  return product.compare_at_price !== null && product.compare_at_price > price
    ? Math.round((1 - price / product.compare_at_price) * 100)
    : null;
}

// ── 1. Le commerce de détail ────────────────────────────────────────────────

function CartColumn(props: BuyColumnProps) {
  const { product, store, qty, setQty, shippingModes, paymentMethods } = props;
  const discount = discountOf(product);
  const price = product.sale_price ?? product.price;
  const outOfStock = product.stock <= 0 && !product.allow_backorders;

  return (
    <div className="flex flex-col">
      <ColumnHeader {...props} discount={discount} />
      {store.showPrices && (
        <PriceRow price={price} compareAt={product.compare_at_price} discount={discount} currency={store.currency} />
      )}
      <StockLine product={product} show={store.showStock} />
      <AttributeChips attributes={product.attributes} />
      <HighlightList items={product.highlights} />
      {!outOfStock && <QtyStepper qty={qty} setQty={setQty} />}
      <CtaStack props={props} />
      <PaymentMarks methods={paymentMethods} className="mt-5" />
      <AssuranceRow theme={store.theme} shippingModes={shippingModes} currency={store.currency} railed={props.profile.rail} />
    </div>
  );
}

// ── 2. Le vendeur social ────────────────────────────────────────────────────
//
// Ce rayon vend par la rareté et par l'enthousiasme, pas par la fiche
// technique. La colonne tient donc dans une carte détachée du fond, avec en
// tête ce qui décide : l'offre qui finit, et ce qu'il en reste. Les deux sont
// vrais ou absents — le compte à rebours suit une date réglée par le marchand,
// et « dernières pièces » compte un stock réel.

function SocialColumn(props: BuyColumnProps) {
  const { product, store, qty, setQty, paymentMethods, shippingModes } = props;
  const discount = discountOf(product);
  const price = product.sale_price ?? product.price;
  const outOfStock = product.stock <= 0 && !product.allow_backorders;
  const low = product.stock > 0 && product.stock <= 5;

  return (
    <div className="flex flex-col">
      <div
        className="p-5 sm:p-6"
        style={{
          background:   'var(--st-surface)',
          border:       '1px solid var(--st-border)',
          borderRadius: 'var(--st-radius-card)',
          boxShadow:    'var(--st-shadow, none)',
        }}
      >
        <Countdown urgency={store.theme.urgency} />

        <ColumnHeader {...props} discount={discount} />

        {store.showPrices && (
          <PriceRow price={price} compareAt={product.compare_at_price} discount={discount} currency={store.currency} className="mt-4" />
        )}

        <AttributeChips attributes={product.attributes} />

        {/* La rareté, comptée sur le stock réel (§25). Aucun « plus que 2 ! »
            décidé ici : le chiffre est celui de l'inventaire, ou rien. */}
        {store.showStock && low && (
          <p
            className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 text-[13px] font-semibold"
            style={{ background: 'var(--st-surface-2)', color: '#B45309', borderRadius: 'var(--st-radius-btn)' }}
          >
            <Sparkles className="h-4 w-4" strokeWidth={2} aria-hidden />
            Dernières pièces — il en reste {product.stock}
          </p>
        )}
        {store.showStock && !low && <StockLine product={product} show />}

        {!outOfStock && <QtyStepper qty={qty} setQty={setQty} />}

        <CtaStack props={props} whatsappLabel="Commander sur WhatsApp" />

        <PaymentMarks methods={paymentMethods} className="mt-5" />
      </div>

      {/* « Pourquoi on l'aime ? » — les points forts que le marchand a écrits
          dans le Studio de rédaction, à l'endroit où la maquette les place. */}
      {product.highlights.length > 0 ? (
        <div
          className="mt-4 p-5"
          style={{ border: '1px solid var(--st-border)', borderRadius: 'var(--st-radius-card)' }}
        >
          <HighlightList items={product.highlights} title="Pourquoi on l'aime ?" />
        </div>
      ) : (
        <MerchantHint title="Pourquoi on l'aime ?" where="Produits → cette fiche → Points forts">
          <p className="text-[14px] text-[var(--st-ink-2)]">Style urbain et tendance · Tissu doux et confortable</p>
        </MerchantHint>
      )}

      <AssuranceRow theme={store.theme} shippingModes={shippingModes} currency={store.currency} railed={props.profile.rail} />
    </div>
  );
}

// ── 3. L'artisan ────────────────────────────────────────────────────────────
//
// Une pièce faite main se vend sur ce qui la rend unique, et se commande
// souvent personnalisée. Le rail de garanties de la maquette — pièce unique,
// fait main, matériaux, livraison — lit les engagements RÉELS du marchand.

function CraftColumn(props: BuyColumnProps) {
  const { product, store, profile, qty, setQty, paymentMethods, shippingModes } = props;
  const discount = discountOf(product);
  const price = product.sale_price ?? product.price;
  const outOfStock = product.stock <= 0 && !product.allow_backorders;
  const custom = props.design.checkout.customisation;

  const [message, setMessage] = useState('');
  useEffect(() => {
    writeOrderExtras(store.slug, { customisation: message });
  }, [message, store.slug]);

  return (
    <div className="flex flex-col">
      <ColumnHeader {...props} discount={discount} />
      {store.showPrices && (
        <PriceRow price={price} compareAt={product.compare_at_price} discount={discount} currency={store.currency} />
      )}
      <StockLine product={product} show={store.showStock} />
      <AttributeChips attributes={product.attributes} />
      <HighlightList items={product.highlights} />

      {/* La personnalisation : un prénom gravé, une longueur, une couleur de
          fil. Elle part dans les notes de la commande — elle ne touche pas au
          prix, que le marchand confirmera. */}
      {custom && (
        <div className="mt-6">
          <FieldRow
            label="Personnalisation (optionnel)"
            hint="Prénom, date, dimensions — l'artisan vous confirmera ce qui est possible."
          >
            <input
              type="text"
              value={message}
              maxLength={200}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Ajouter un message (ex. : Nom, date…)"
              className={INPUT_CLASS}
              style={INPUT_STYLE}
            />
          </FieldRow>
        </div>
      )}

      {!outOfStock && <QtyStepper qty={qty} setQty={setQty} />}

      <CtaStack props={props} primaryLabel={profile.primaryLabel} showBuyNow={false} />

      {/* Le délai de fabrication : celui que le marchand a écrit dans ses modes
          de livraison. Aucun « 5 à 7 jours » décidé ici. */}
      {(() => {
        const made = shippingModes.find((m) => m.days?.trim());
        return made ? (
          <p className="mt-4 flex items-center gap-2 text-[13px] text-[var(--st-ink-3)]">
            <Clock className="h-4 w-4 flex-shrink-0" strokeWidth={1.6} aria-hidden />
            Délai de fabrication et d'envoi : {made.days}
          </p>
        ) : (
          <MerchantHint title="Votre délai de fabrication" where="Réglages → Boutique → Livraison → Délai">
            <p className="text-[14px] text-[var(--st-ink-2)]">Délai de fabrication : 5 à 7 jours</p>
          </MerchantHint>
        );
      })()}

      <PaymentMarks methods={paymentMethods} className="mt-5" />
      <AssuranceRow theme={store.theme} shippingModes={shippingModes} currency={store.currency} railed={props.profile.rail} />
    </div>
  );
}

// ── 4. Le prestataire ───────────────────────────────────────────────────────
//
// On ne met pas une séance au panier : on prend rendez-vous. La colonne donne
// la durée, ce qui est inclus, pour qui c'est — puis demande le jour et
// l'heure. La date part dans les notes de la commande ; elle ne bloque aucun
// créneau, parce qu'aucun agenda ne les porte : un créneau « réservé » qui ne
// l'est pas ferait promettre à la vitrine ce que le marchand ne tient pas.

function BookingColumn(props: BuyColumnProps) {
  const { product, store, profile, paymentMethods } = props;
  const discount = discountOf(product);
  const price = product.sale_price ?? product.price;
  const duration = findAttribute(product.attributes, /dur[ée]e|temps/i);

  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const today = useToday();
  useEffect(() => {
    writeOrderExtras(store.slug, { wantedDate: date, wantedTime: time });
  }, [date, time, store.slug]);

  return (
    <div className="flex flex-col">
      <ColumnHeader {...props} discount={discount} />

      <div className="mt-5 flex flex-wrap items-center gap-3">
        {store.showPrices && (
          <PriceRow price={price} compareAt={product.compare_at_price} discount={discount} currency={store.currency} className="" />
        )}
        {duration && (
          <span
            className="inline-flex items-center gap-1.5 px-3 py-1 text-[13px] font-semibold text-[var(--st-ink-2)]"
            style={{ border: '1px solid var(--st-border)', borderRadius: 'var(--st-radius-btn)' }}
          >
            <Clock className="h-4 w-4" strokeWidth={1.8} aria-hidden />
            {duration}
          </span>
        )}
      </div>

      {product.highlights.length > 0 ? (
        <HighlightList items={product.highlights} title="Ce qui est inclus" />
      ) : (
        <MerchantHint title="Ce qui est inclus dans la prestation" where="Produits → cette fiche → Points forts">
          <p className="text-[14px] text-[var(--st-ink-2)]">Analyse de votre situation · Plan d'action personnalisé</p>
        </MerchantHint>
      )}

      {/* « Pour qui ? » — les étiquettes de la fiche, que le marchand saisit
          déjà pour son catalogue. */}
      {product.tags.length > 0 ? (
        <div className="mt-6">
          <p className="mb-2 text-[14px] font-semibold text-[var(--st-ink)]">Pour qui ?</p>
          <ul className="flex flex-wrap gap-2">
            {product.tags.slice(0, 6).map((tag) => (
              <li
                key={tag}
                className="px-3 py-1.5 text-[13px] text-[var(--st-ink-2)]"
                style={{ background: 'var(--st-surface-2)', borderRadius: 'var(--st-radius-btn)' }}
              >
                {tag}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <MerchantHint title="À qui s'adresse cette prestation" where="Produits → cette fiche → Étiquettes">
          <p className="text-[14px] text-[var(--st-ink-2)]">Entrepreneurs · Commerçants · Professionnels</p>
        </MerchantHint>
      )}

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <FieldRow label="Jour souhaité">
          <input
            type="date"
            value={date}
            min={today}
            onChange={(e) => setDate(e.target.value)}
            className={INPUT_CLASS}
            style={INPUT_STYLE}
          />
        </FieldRow>
        <FieldRow label="Heure souhaitée">
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className={INPUT_CLASS}
            style={INPUT_STYLE}
          />
        </FieldRow>
      </div>
      <p className="mt-2 text-[12px] leading-relaxed text-[var(--st-ink-3)]">
        Une demande, pas une réservation ferme : {store.name} vous confirme le créneau.
      </p>

      <CtaStack props={props} primaryLabel={profile.primaryLabel} showBuyNow={false} whatsappLabel="Poser une question" />

      <PaymentMarks methods={paymentMethods} className="mt-5" />
    </div>
  );
}

// ── 5. L'éleveur ────────────────────────────────────────────────────────────
//
// L'acheteur veut des chiffres avant un bouton : poids, âge, race, quantité
// disponible. Ils viennent des attributs de la fiche — ceux que le marchand
// saisit déjà et qui servent de filtres au catalogue. La grille de gros vient
// du thème : c'est elle qui décide l'acheteur qui en veut trente.

function LivestockColumn(props: BuyColumnProps) {
  const { product, store, profile, qty, setQty, shippingModes, paymentMethods } = props;
  const discount = discountOf(product);
  const price = product.sale_price ?? product.price;
  const outOfStock = product.stock <= 0 && !product.allow_backorders;
  const specs = Object.entries(product.attributes ?? {}).filter(([, v]) => String(v).trim());
  const wholesale = store.theme.wholesale;

  return (
    <div className="flex flex-col">
      <ColumnHeader {...props} discount={discount} />
      {store.showPrices && (
        <PriceRow
          price={price}
          compareAt={product.compare_at_price}
          discount={discount}
          currency={store.currency}
          unit="Prix par tête"
        />
      )}
      <StockLine product={product} show={store.showStock} />

      {specs.length > 0 ? (
        <SpecTable rows={specs.map(([key, value]) => [key, String(value)])} />
      ) : (
        <MerchantHint title="La fiche technique de l'animal" where="Produits → cette fiche → Attributs">
          <p className="text-[14px] text-[var(--st-ink-2)]">Poids : 450 kg · Âge : 2 ans · Race : Brahman</p>
        </MerchantHint>
      )}

      <HighlightList items={product.highlights} />

      {/* Livraison & retrait, tels que la caisse les appliquera. */}
      {shippingModes.length > 0 && (
        <ul className="mt-6 flex flex-col gap-2">
          {shippingModes.filter((m) => m.label?.trim()).slice(0, 3).map((mode) => (
            <li
              key={mode.id || mode.label}
              className="flex items-center gap-3 px-4 py-3"
              style={{ border: '1px solid var(--st-border)', borderRadius: 'var(--st-radius-card)' }}
            >
              {mode.price > 0
                ? <Truck className="h-[18px] w-[18px] flex-shrink-0 text-[var(--st-ink-3)]" strokeWidth={1.6} aria-hidden />
                : <Store className="h-[18px] w-[18px] flex-shrink-0 text-[var(--st-ink-3)]" strokeWidth={1.6} aria-hidden />}
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold text-[var(--st-ink)]">{mode.label}</span>
                {mode.days?.trim() && <span className="block text-[12px] text-[var(--st-ink-3)]">{mode.days}</span>}
              </span>
              <span className="flex-shrink-0 text-[14px] font-semibold tabular-nums text-[var(--st-ink)]">
                {mode.price > 0 ? storeMoney(mode.price, store.currency) : 'Gratuit'}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* Le prix dégressif : du TEXTE saisi par le marchand — « 3+ têtes »,
          « sur devis » sont des valeurs parfaitement légitimes ici. */}
      {wholesale.enabled && wholesale.tiers.length > 0 ? (
        <div
          className="mt-6 p-4"
          style={{ background: 'var(--st-surface-2)', borderRadius: 'var(--st-radius-card)' }}
        >
          <p className="text-[14px] font-semibold text-[var(--st-ink)]">{wholesale.title}</p>
          <ul className="mt-3 flex flex-col gap-2">
            {wholesale.tiers.map((tier, i) => (
              <li key={`${tier.quantity}-${i}`} className="flex items-baseline justify-between gap-4">
                <span className="text-[13px] text-[var(--st-ink-2)]">{tier.quantity}</span>
                <span className="text-right text-[14px] font-semibold text-[var(--st-ink)]">
                  {tier.price}
                  {tier.note && <span className="ml-1 text-[12px] font-normal text-[var(--st-ink-3)]">{tier.note}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <MerchantHint title="Votre grille de prix par quantité" where="Éditeur → Contenu → Vente en gros">
          <p className="text-[14px] text-[var(--st-ink-2)]">3+ têtes — 90 000 HTG / tête</p>
        </MerchantHint>
      )}

      {!outOfStock && <QtyStepper qty={qty} setQty={setQty} label="Nombre de têtes" />}

      <CtaStack
        props={props}
        primaryLabel={props.whatsappLink ? undefined : profile.primaryLabel}
        showBuyNow={false}
        whatsappLabel={profile.primaryLabel ?? 'Demander ce lot'}
      />

      <PaymentMarks methods={paymentMethods} className="mt-5" />
      <AssuranceRow theme={store.theme} shippingModes={shippingModes} currency={store.currency} railed={props.profile.rail} />
    </div>
  );
}

// ── 6. Le traiteur ──────────────────────────────────────────────────────────
//
// Une commande vaut une date, et c'est la seule information qu'un panier ne
// sait pas prendre. La fiche la demande ici, avec le mode de remise et
// l'adresse ; tout part dans les notes que le marchand lit sur sa commande.

function CateringColumn(props: BuyColumnProps) {
  const { product, store, profile, qty, setQty, shippingModes, paymentMethods } = props;
  const discount = discountOf(product);
  const price = product.sale_price ?? product.price;
  const outOfStock = product.stock <= 0 && !product.allow_backorders;
  const custom = props.design.checkout.customisation;

  const [date, setDate]       = useState('');
  const [time, setTime]       = useState('');
  const today                 = useToday();
  const [mode, setMode]       = useState<string>(shippingModes[0]?.id ?? '');
  const [address, setAddress] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    writeOrderExtras(store.slug, {
      wantedDate: date, wantedTime: time, shippingModeId: mode,
      address, customisation: message,
    });
  }, [date, time, mode, address, message, store.slug]);

  const chosen = shippingModes.find((m) => m.id === mode);
  // « Livraison » au sens du marchand : un mode gratuit est un retrait dans la
  // quasi-totalité des cas, mais c'est SON libellé qui décide de l'affichage.
  const needsAddress = Boolean(chosen && chosen.price > 0);

  return (
    <div className="flex flex-col">
      <ColumnHeader {...props} discount={discount} />
      {store.showPrices && (
        <PriceRow price={price} compareAt={product.compare_at_price} discount={discount} currency={store.currency} />
      )}
      <StockLine product={product} show={store.showStock} />
      <AttributeChips attributes={product.attributes} />
      <HighlightList items={product.highlights} />

      <div className="mt-6 flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <FieldRow label="Date de livraison / retrait">
            <input
              type="date"
              value={date}
              min={today}
              onChange={(e) => setDate(e.target.value)}
              className={INPUT_CLASS}
              style={INPUT_STYLE}
            />
          </FieldRow>
          <FieldRow label="Heure">
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className={INPUT_CLASS}
              style={INPUT_STYLE}
            />
          </FieldRow>
        </div>

        {shippingModes.length > 0 ? (
          <FieldRow label="Livraison ou retrait">
            <div className="flex flex-wrap gap-2">
              {shippingModes.filter((m) => m.label?.trim()).map((m) => {
                const active = m.id === mode;
                return (
                  <button
                    key={m.id || m.label}
                    type="button"
                    onClick={() => setMode(m.id)}
                    aria-pressed={active}
                    className="flex min-h-[44px] items-center gap-2 px-4 text-[14px] font-semibold transition"
                    style={{
                      border:       `1px solid ${active ? 'var(--st-ink)' : 'var(--st-border)'}`,
                      background:   active ? 'var(--st-surface-2)' : 'transparent',
                      color:        'var(--st-ink)',
                      borderRadius: 'var(--st-radius-btn)',
                    }}
                  >
                    {m.price > 0
                      ? <Truck className="h-4 w-4" strokeWidth={1.8} aria-hidden />
                      : <Store className="h-4 w-4" strokeWidth={1.8} aria-hidden />}
                    {m.label}
                    <span className="text-[12px] font-normal text-[var(--st-ink-3)]">
                      {m.price > 0 ? storeMoney(m.price, store.currency) : 'Gratuit'}
                    </span>
                  </button>
                );
              })}
            </div>
          </FieldRow>
        ) : (
          <MerchantHint title="Vos modes de livraison et de retrait" where="Réglages → Boutique → Livraison">
            <p className="text-[14px] text-[var(--st-ink-2)]">Livraison Port-au-Prince — 250 HTG · Retrait — Gratuit</p>
          </MerchantHint>
        )}

        {needsAddress && (
          <FieldRow label="Adresse de livraison" hint="Vous pourrez la compléter au moment de payer.">
            <input
              type="text"
              value={address}
              maxLength={160}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Rue, quartier, point de repère"
              className={INPUT_CLASS}
              style={INPUT_STYLE}
            />
          </FieldRow>
        )}

        {custom && (
          <FieldRow label="Message sur le gâteau (optionnel)">
            <input
              type="text"
              value={message}
              maxLength={120}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Ex. : Joyeux anniversaire Marie"
              className={INPUT_CLASS}
              style={INPUT_STYLE}
            />
          </FieldRow>
        )}
      </div>

      {!outOfStock && <QtyStepper qty={qty} setQty={setQty} />}

      {store.showPrices && (
        <p className="mt-6 flex items-baseline justify-between gap-4 border-t pt-4" style={{ borderColor: 'var(--st-border)' }}>
          <span className="text-[14px] font-semibold text-[var(--st-ink)]">Total</span>
          <span className="text-[20px] font-semibold tabular-nums text-[var(--st-ink)]">
            {storeMoney(price * qty, store.currency)}
          </span>
        </p>
      )}
      {/* Le total ne compte que les articles : la livraison s'ajoute à la
          caisse, qui seule connaît le mode retenu et son tarif. */}
      {needsAddress && chosen && chosen.price > 0 && (
        <p className="mt-1 text-[12px] text-[var(--st-ink-3)]">
          Livraison {storeMoney(chosen.price, store.currency)} ajoutée au paiement.
        </p>
      )}

      <CtaStack props={props} primaryLabel={profile.primaryLabel} />

      <PaymentMarks methods={paymentMethods} className="mt-5" />
      <ProductAssurance
        theme={store.theme}
        shippingModes={shippingModes}
        contactPhone={store.contactPhone}
        currency={store.currency}
        railed={props.profile.rail}
      />
    </div>
  );
}

// ── 7. La marque qui vend une promesse ──────────────────────────────────────
//
// Compléments, soins, sport, naturel, animalerie, cosmétique : on n'y achète
// pas un objet, on achète ce qu'il fait — et on vérifie ensuite ce qu'il y a
// dedans avant de se l'appliquer ou de le donner à son chien.
//
// D'où cet ordre : le prix, le format, CE QUE ÇA APPORTE, le bouton, puis la
// composition en résumé avec le renvoi vers l'onglet complet. Les points forts
// sont ceux de la fiche — le marchand les a écrits une fois — et leur titre
// vient du gabarit, parce qu'une marque de sport et une marque de soin ne les
// annoncent pas du même mot.

function BenefitColumn(props: BuyColumnProps) {
  const { product, store, profile, qty, setQty, paymentMethods, shippingModes } = props;
  const discount = discountOf(product);
  const price = product.sale_price ?? product.price;
  const outOfStock = product.stock <= 0 && !product.allow_backorders;

  return (
    <div className="flex flex-col">
      <ColumnHeader {...props} discount={discount} />
      {store.showPrices && (
        <PriceRow price={price} compareAt={product.compare_at_price} discount={discount} currency={store.currency} />
      )}
      <StockLine product={product} show={store.showStock} />

      {/* Le format, la contenance, la couleur : les attributs de la fiche, tels
          que le marchand les a saisis. */}
      <AttributeChips attributes={product.attributes} />

      {product.highlights.length > 0 ? (
        <HighlightList items={product.highlights} title={profile.highlightsTitle} />
      ) : (
        <MerchantHint
          title={profile.highlightsTitle ?? 'Ce que ce produit apporte'}
          where="Produits → cette fiche → Points forts"
        >
          <p className="text-[14px] text-[var(--st-ink-2)]">
            Trois lignes qui disent ce que le produit fait, pas ce qu'il est.
          </p>
        </MerchantHint>
      )}

      {!outOfStock && <QtyStepper qty={qty} setQty={setQty} />}

      <CtaStack props={props} primaryLabel={profile.primaryLabel} />

      <CompositionSummary store={store} />

      <PaymentMarks methods={paymentMethods} className="mt-5" />
      <AssuranceRow theme={store.theme} shippingModes={shippingModes} currency={store.currency} railed={props.profile.rail} />
    </div>
  );
}

/**
 * La composition, en trois lignes, sous le bouton.
 *
 * Ce n'est pas l'onglet en double : l'onglet porte la liste entière et son
 * texte d'introduction, celui-ci en montre assez pour lever le doute au moment
 * du clic, puis y renvoie. Le bouton n'apparaît que si l'onglet existe —
 * c'est-à-dire si le marchand a saisi quelque chose.
 */
function CompositionSummary({ store }: { store: StoreView }) {
  const composition = store.theme.ingredients;
  const items = composition.items.filter((i) => i.name.trim());

  if (items.length === 0) {
    return (
      <MerchantHint title="Ce qu'il y a dedans" where="Éditeur → Contenu → Composition">
        <p className="text-[14px] text-[var(--st-ink-2)]">
          Ingrédient — ce qu'il fait, en une ligne.
        </p>
      </MerchantHint>
    );
  }

  return (
    <div
      className="mt-6 p-4"
      style={{ background: 'var(--st-surface-2)', borderRadius: 'var(--st-radius-card)' }}
    >
      <p className="flex items-center gap-2 text-[14px] font-semibold text-[var(--st-ink)]">
        <Leaf className="h-4 w-4 flex-shrink-0 text-[var(--st-ink-3)]" strokeWidth={1.8} aria-hidden />
        {composition.title}
      </p>
      <ul className="mt-3 flex flex-col gap-1.5">
        {items.slice(0, 3).map((item) => (
          <li key={item.name} className="text-[13px] leading-snug text-[var(--st-ink-2)]">
            <span className="font-semibold text-[var(--st-ink)]">{item.name}</span>
            {item.role.trim() && <> — {item.role}</>}
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => openPdpTab('ingredients')}
        className="mt-3 inline-flex min-h-[36px] items-center gap-1.5 text-[13px] font-semibold text-[var(--st-ink)] underline underline-offset-4"
      >
        Tout lire
        <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
      </button>
    </div>
  );
}

// ── 8. Le prêt-à-porter ─────────────────────────────────────────────────────
//
// Deux questions arrêtent la main sur un vêtement : « je fais quelle taille
// chez vous ? » et « et si elle ne va pas ? ». La première se répond par le
// guide des tailles que le marchand a saisi — un bouton l'ouvre, à hauteur de
// décision, plutôt que de le faire chercher quatre écrans plus bas. La seconde
// par sa politique de retour, telle qu'il l'a écrite.

function ApparelColumn(props: BuyColumnProps) {
  const { product, store, profile, qty, setQty, paymentMethods, shippingModes } = props;
  const discount = discountOf(product);
  const price = product.sale_price ?? product.price;
  const outOfStock = product.stock <= 0 && !product.allow_backorders;
  const hasSizeGuide = store.theme.sizeGuide.rows.length > 0;
  const returns = store.theme.shipping.returns.trim();

  return (
    <div className="flex flex-col">
      <ColumnHeader {...props} discount={discount} />
      {store.showPrices && (
        <PriceRow price={price} compareAt={product.compare_at_price} discount={discount} currency={store.currency} />
      )}
      <StockLine product={product} show={store.showStock} />
      <AttributeChips attributes={product.attributes} />

      {hasSizeGuide ? (
        <button
          type="button"
          onClick={() => openPdpTab('sizeGuide')}
          className="mt-4 inline-flex min-h-[44px] w-fit items-center gap-2 px-4 text-[13px] font-semibold text-[var(--st-ink)] transition hover:bg-[var(--st-surface-2)]"
          style={{ border: '1px solid var(--st-border)', borderRadius: 'var(--st-radius-btn)' }}
        >
          <Ruler className="h-4 w-4" strokeWidth={1.8} aria-hidden />
          {store.theme.sizeGuide.title}
        </button>
      ) : (
        <MerchantHint title="Votre guide des tailles" where="Éditeur → Contenu → Guide des tailles">
          <p className="text-[14px] text-[var(--st-ink-2)]">
            Taille, poitrine, tour de taille, hanches — une ligne par taille.
          </p>
        </MerchantHint>
      )}

      <HighlightList items={product.highlights} title={profile.highlightsTitle} />

      {!outOfStock && <QtyStepper qty={qty} setQty={setQty} />}

      <CtaStack props={props} primaryLabel={profile.primaryLabel} />

      {/* « Et si elle ne me va pas ? » — la réponse du marchand, à l'endroit
          où la question se pose. */}
      {returns ? (
        <p className="mt-4 flex items-start gap-2 text-[13px] leading-relaxed text-[var(--st-ink-3)]">
          <RefreshCw className="mt-0.5 h-4 w-4 flex-shrink-0" strokeWidth={1.6} aria-hidden />
          <span className="min-w-0">{returns}</span>
        </p>
      ) : (
        <MerchantHint title="Votre politique de retour" where="Éditeur → Contenu → Livraison & retours">
          <p className="text-[14px] text-[var(--st-ink-2)]">
            Échange sous 7 jours, article non porté, avec son emballage.
          </p>
        </MerchantHint>
      )}

      <PaymentMarks methods={paymentMethods} className="mt-5" />
      <AssuranceRow theme={store.theme} shippingModes={shippingModes} currency={store.currency} railed={props.profile.rail} />
    </div>
  );
}

// ── 9. Le rayon technique ───────────────────────────────────────────────────
//
// C'est le seul rayon où l'on COMPARE avant d'acheter : on ouvre deux fiches
// côte à côte et on cherche le chiffre qui les sépare. Les caractéristiques
// montent donc dans la colonne, en tableau — la pastille les noierait — et la
// garantie tient la place que les retours occupent ailleurs, parce que c'est
// elle qu'on cherche sur un appareil.

function SpecColumn(props: BuyColumnProps) {
  const { product, store, profile, qty, setQty, paymentMethods, shippingModes } = props;
  const discount = discountOf(product);
  const price = product.sale_price ?? product.price;
  const outOfStock = product.stock <= 0 && !product.allow_backorders;
  const specs = Object.entries(product.attributes ?? {}).filter(([, v]) => String(v).trim());

  return (
    <div className="flex flex-col">
      <ColumnHeader {...props} discount={discount} />
      {store.showPrices && (
        <PriceRow price={price} compareAt={product.compare_at_price} discount={discount} currency={store.currency} />
      )}
      <StockLine product={product} show={store.showStock} />

      {/* La bande de tuiles, quand le gabarit en pose une, porte les
          caractéristiques à elle seule (`SpecGrid`) : les redire ici serait la
          même donnée deux fois à deux écrans d'intervalle, et ce serait
          justement celle qui sépare le prix du bouton. */}
      {!profile.specGrid && (
        specs.length > 0 ? (
          <SpecTable rows={specs.map(([key, value]) => [key, String(value)])} />
        ) : (
          <MerchantHint title="Les caractéristiques de l'appareil" where="Produits → cette fiche → Attributs">
            <p className="text-[14px] text-[var(--st-ink-2)]">
              Capacité · Autonomie · Connectique · Garantie
            </p>
          </MerchantHint>
        )
      )}

      <HighlightList items={product.highlights} title={profile.highlightsTitle} />

      {!outOfStock && <QtyStepper qty={qty} setQty={setQty} />}

      <CtaStack props={props} primaryLabel={profile.primaryLabel} />

      <GuaranteeNote store={store} />

      <PaymentMarks methods={paymentMethods} className="mt-5" />
      <AssuranceRow theme={store.theme} shippingModes={shippingModes} currency={store.currency} railed={props.profile.rail} />
    </div>
  );
}

/**
 * La garantie : ce que le marchand a écrit dans sa politique de retour.
 *
 * Aucune durée n'est proposée. « Garantie 1 an » écrit à sa place est un
 * engagement qu'un client viendra lui réclamer, et qu'il n'a jamais pris.
 */
function GuaranteeNote({ store }: { store: StoreView }) {
  const text = store.theme.shipping.returns.trim();
  if (!text) {
    return (
      <MerchantHint title="Votre garantie" where="Éditeur → Contenu → Livraison & retours">
        <p className="text-[14px] text-[var(--st-ink-2)]">
          Ce que vous couvrez, pour combien de temps, et ce qu'il faut garder.
        </p>
      </MerchantHint>
    );
  }
  return (
    <p className="mt-4 flex items-start gap-2 text-[13px] leading-relaxed text-[var(--st-ink-3)]">
      <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0" strokeWidth={1.6} aria-hidden />
      <span className="min-w-0">{text}</span>
    </p>
  );
}

// ── 10. Le produit unique ───────────────────────────────────────────────────
//
// Ici la fiche n'est pas une page parmi d'autres : c'est LA page, et souvent
// la seule que le visiteur verra. La colonne porte donc ce qu'une page de
// vente porte — l'offre qui finit si le marchand en a réglé une, la promesse,
// la preuve d'engagement — et l'achat se fait sans détour par le catalogue.
//
// Le compte à rebours suit `theme.urgency` : réglé, il compte ; absent, il
// n'existe pas. Aucune urgence n'est fabriquée pour faire cliquer.

function LandingColumn(props: BuyColumnProps) {
  const { product, store, profile, qty, setQty, paymentMethods, shippingModes } = props;
  const discount = discountOf(product);
  const price = product.sale_price ?? product.price;
  const outOfStock = product.stock <= 0 && !product.allow_backorders;

  return (
    <div className="flex flex-col">
      <Countdown urgency={store.theme.urgency} />

      <ColumnHeader {...props} discount={discount} />
      {store.showPrices && (
        <PriceRow price={price} compareAt={product.compare_at_price} discount={discount} currency={store.currency} />
      )}
      <StockLine product={product} show={store.showStock} />
      <AttributeChips attributes={product.attributes} />

      {product.highlights.length > 0 ? (
        <HighlightList items={product.highlights} title={profile.highlightsTitle} />
      ) : (
        <MerchantHint
          title={profile.highlightsTitle ?? 'Pourquoi vous allez l\'aimer'}
          where="Produits → cette fiche → Points forts"
        >
          <p className="text-[14px] text-[var(--st-ink-2)]">
            Trois promesses courtes — c'est tout ce que cette page a pour convaincre.
          </p>
        </MerchantHint>
      )}

      {!outOfStock && <QtyStepper qty={qty} setQty={setQty} />}

      <CtaStack props={props} primaryLabel={profile.primaryLabel} />

      <GuaranteeNote store={store} />

      <PaymentMarks methods={paymentMethods} className="mt-5" />
      <ProductAssurance
        theme={store.theme}
        shippingModes={shippingModes}
        contactPhone={store.contactPhone}
        currency={store.currency}
        railed={props.profile.rail}
      />
    </div>
  );
}

// ── Menues aides ────────────────────────────────────────────────────────────

function findAttribute(attributes: Record<string, string>, pattern: RegExp): string | null {
  for (const [key, value] of Object.entries(attributes ?? {})) {
    if (pattern.test(key) && String(value).trim()) return String(value);
  }
  return null;
}

/**
 * Aujourd'hui, au format d'un champ date : on ne commande pas pour hier.
 *
 * Le plancher se pose APRÈS le montage, jamais pendant le rendu du serveur.
 * Vercel tourne en UTC et le marchand vit à UTC−5 : passé 19 h à
 * Port-au-Prince, le serveur écrit déjà demain. React ne recolle pas un
 * attribut qui diffère — il garde celui du serveur — et le client se retrouve
 * avec un champ qui refuse la date du jour. Rendre `undefined` des deux côtés
 * du premier rendu laisse l'attribut absent ; l'effet pose ensuite la vraie
 * date, celle du client.
 */
function useToday(): string | undefined {
  const [day, setDay] = useState<string>();
  useEffect(() => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    setDay(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
  }, []);
  return day;
}
