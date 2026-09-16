'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Le formulaire de commande
//
// « Le checkout doit être extrêmement simple. Éviter les formulaires inutiles. »
// Six champs, dont trois obligatoires. Le pays est fixé à Haïti tant que le
// marchand n'a pas déclaré de mode de livraison ailleurs — un sélecteur de pays
// à quatre entrées sur un tunnel haïtien coûte un geste et ne sert personne.
//
// Le récapitulatif affiche le total du PANIER. Le total qui sera réellement
// débité est calculé par le serveur à partir des prix en base : si un prix a
// changé depuis que l'article a été mis au panier, c'est celui de la base qui
// s'applique, et la page de confirmation le montre. Mieux vaut un écart visible
// à la confirmation qu'un prix périmé encaissé en silence.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CalendarClock, Layers, Lock, MessageCircle, ShoppingBag, Sparkles } from 'lucide-react';
import { useCart } from '../../../../components/store/CartContext';
import { storeSessionId, trackStoreEvent } from '../../../../components/store/blocks/TrackView';
import { StoreImage } from '../../../../components/store/blocks/StoreImage';
import { storeMoney } from '../../../../components/store/format';
import { createStoreOrder, getStoreOrder } from '../../../actions/store-public';
import { checkCoupon, type CouponCheck } from '../../../actions/store-content';
import type { ShippingMode } from '../../../actions/store-public';
import type { StoreView } from '../../../../components/store/types';
import { designFor } from '../../../../lib/storeDesign';
import { buildWhatsAppOrderLink, resolveOrderPhone } from '../../../../lib/storeWhatsApp';
import { forgetPendingOrder, readPendingOrder, rememberPendingOrder } from '../confirmation/pendingOrder';
import { unwrap, screenMessage  } from '../../../../lib/actionResult';
import { offeredPayments, PAYMENT_LABEL } from '../../../../lib/storePayments';

/**
 * Ce que l'acheteur lit quand une passerelle le renvoie ici en échec
 * (`?error=…`, posé par les rappels MonCash et NatCash).
 *
 * Chaque message dit s'il peut réessayer. Quand on ne sait pas si l'argent est
 * parti, il le dit aussi : repayer une commande déjà débitée coûte plus cher à
 * l'acheteur qu'un appel à la boutique.
 */
const RETURN_ERRORS: Record<string, string> = {
  payment_failed:
    "Le paiement n'a pas abouti. Votre panier est intact : vous pouvez réessayer.",
  payment_unverified:
    "Ce paiement n'a pas pu être rattaché à votre commande. Si votre compte a été débité, contactez la boutique avant de payer à nouveau.",
  payment_unavailable:
    "Le paiement en ligne n'est pas disponible pour le moment dans cette boutique. Choisissez un autre moyen de paiement.",
  payment_error:
    "Le paiement n'a pas pu être vérifié. Si votre compte a été débité, contactez la boutique avant de payer à nouveau ; sinon, vous pouvez réessayer.",
};

function returnErrorMessage(code: string | null): string {
  if (!code) return '';
  return Object.prototype.hasOwnProperty.call(RETURN_ERRORS, code)
    ? RETURN_ERRORS[code]
    : RETURN_ERRORS.payment_error;
}

type Props = {
  store:          StoreView;
  businessId:     string;
  paymentMethods: string[];
  shippingModes:  ShippingMode[];
  paymentFailed:  boolean;
};

export function CheckoutClient({
  store, businessId, paymentMethods, shippingModes, paymentFailed,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { items, bundles, total, clear, hydrated } = useCart();

  // Un panier qui ne contient QUE des lots n'est pas un panier vide.
  const empty = items.length === 0 && bundles.length === 0;

  // Les réglages de la boutique, réduits à ce qui s'encaisse vraiment : pas de
  // carte, aucune passerelle carte n'existe. Proposée, elle faisait partir la
  // commande comme un paiement à la livraison sans jamais demander de carte —
  // l'acheteur croyait avoir payé. La liste est celle de `lib/storePayments.ts`,
  // que la fiche produit et la page d'accueil lisent aussi.
  const offered = offeredPayments(paymentMethods);

  const [form, setForm] = useState({
    name: '', email: '', phone: '',
    line1: '', line2: '', city: '',
    shipping_mode: shippingModes[0]?.id ?? '',
    payment:       offered[0] ?? '',
    notes: '',
    // Les trois champs du §6, demandés selon le métier. Vides sur un panier
    // classique : le gabarit ne les affiche même pas.
    wantedDate: '',
    wantedTime: '',
    customisation: '',
    quoteQuantity: '',
  });
  // Ce que ce métier demande en plus (§6). Le tunnel reste le même pour tous ;
  // ce sont les questions posées avant de payer qui changent.
  const design = designFor(store.templateId);
  const extras = design.checkout;

  const [submitting, setSubmitting] = useState(false);
  // Tous les codes de retour, pas seulement `payment_failed` : un code inconnu
  // affiche le message prudent plutôt que rien.
  const [error, setError] = useState(() =>
    returnErrorMessage(searchParams.get('error') ?? (paymentFailed ? 'payment_failed' : null)),
  );
  /** Le numéro d'une commande payée ailleurs, dont ce panier vient d'être vidé. */
  const [paidOrderNumber, setPaidOrderNumber] = useState<string | null>(null);

  // ── Le code promo (§28) ───────────────────────────────────────────────────
  //
  // Ce que le navigateur affiche ici est INDICATIF. Le code part avec la
  // commande, et c'est `create_store_order` qui décide de la remise réellement
  // appliquée : validité, date, plafond d'utilisation, montant minimum. Un
  // acheteur qui trafiquerait cette page verrait un total flatteur et paierait
  // le vrai.
  //
  // Un code refusé ne bloque donc rien : il ne s'applique pas, et l'écran le
  // dit avec la raison venue du serveur.
  const [couponCode, setCouponCode] = useState('');
  const [coupon, setCoupon] = useState<CouponCheck | null>(null);
  const [checkingCoupon, setCheckingCoupon] = useState(false);

  const shippingPrice = useMemo(
    () => shippingModes.find((m) => m.id === form.shipping_mode)?.price ?? 0,
    [shippingModes, form.shipping_mode],
  );
  const discount = coupon?.valid ? coupon.discount : 0;
  const freeShipping = coupon?.valid === true && coupon.freeShipping;
  const orderTotal = Math.max(0, total - discount) + (freeShipping ? 0 : shippingPrice);

  async function applyCoupon() {
    const code = couponCode.trim();
    if (!code) return;
    setCheckingCoupon(true);
    try {
      setCoupon(await checkCoupon(businessId, code, total));
    } catch {
      setCoupon({ valid: false, reason: 'Vérification impossible.', discount: 0, freeShipping: false });
    } finally {
      setCheckingCoupon(false);
    }
  }

  // ── L'avant-dernière étape de l'entonnoir (§30) ───────────────────────────
  //
  // Compté à l'arrivée sur la page, une seule fois par montage : c'est le
  // moment où l'acheteur a décidé de payer. Le compter au clic sur « Commander »
  // le confondrait avec l'achat lui-même et ferait disparaître l'écart entre
  // les deux — l'écart étant précisément ce que le marchand doit voir.
  //
  // Le panier vide ne compte pas : on n'entame pas un paiement sans articles,
  // et un retour arrière sur un panier vidé gonflerait l'étape pour rien.
  const startTracked = useRef(false);
  useEffect(() => {
    if (startTracked.current || !hydrated || empty) return;
    startTracked.current = true;
    trackStoreEvent({
      businessId,
      event: 'checkout_started',
      value: total,
    });
  }, [businessId, hydrated, empty, total]);

  // ── Une commande payée sur une autre origine ──────────────────────────────
  //
  // Le panier se vide à la confirmation du paiement (confirmation/ClearPaidCart).
  // Mais MonCash et NatCash ramènent l'acheteur sur le domaine de l'application :
  // parti du sous-domaine de la boutique, il y a laissé un panier plein que la
  // confirmation ne voit pas. On demande donc au serveur, au passage suivant, si
  // la commande en attente a été payée — et seulement alors on vide. Une
  // commande impayée garde son panier : c'est tout le but.
  useEffect(() => {
    if (!hydrated) return;
    const pending = readPendingOrder(store.slug);
    if (!pending) return;

    let cancelled = false;
    getStoreOrder(pending)
      .then((order) => {
        if (cancelled) return;
        if (!order) {
          forgetPendingOrder(store.slug);
        } else if (order.payment_status === 'paid') {
          clear();
          forgetPendingOrder(store.slug);
          setPaidOrderNumber(order.order_number);
        }
      })
      .catch(() => {
        // Réseau : on retentera au prochain passage, le panier reste.
      });

    return () => { cancelled = true; };
  }, [hydrated, store.slug, clear]);


  /**
   * Les notes de la commande : ce que l'acheteur a écrit, et ce que le métier
   * lui a demandé en plus.
   *
   * Tout arrive dans le même champ parce que c'est le seul que le marchand lit
   * sur sa fiche de commande — et une date de livraison rangée dans une colonne
   * qu'aucun écran n'affiche est une date perdue. Les lignes ajoutées sont
   * préfixées pour qu'il les distingue de la phrase de l'acheteur.
   *
   * La date part telle qu'elle se lit, pas en ISO : « 2026-09-14 » sur une fiche
   * de commande se relit mal, et une commande mal relue se rate.
   */
  function composedNotes(): string | undefined {
    const lines: string[] = [];

    if (extras.schedule !== 'none' && form.wantedDate) {
      const readable = new Date(form.wantedDate + 'T00:00:00').toLocaleDateString('fr-HT', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      });
      const when = form.wantedTime ? readable + ' à ' + form.wantedTime : readable;
      lines.push(
        extras.schedule === 'appointment'
          ? 'Créneau souhaité : ' + when
          : 'À livrer le : ' + when,
      );
    }

    if (extras.customisation && form.customisation.trim()) {
      lines.push('Personnalisation : ' + form.customisation.trim());
    }

    if (extras.quote && form.quoteQuantity.trim()) {
      lines.push('Demande de prix pour une quantité : ' + form.quoteQuantity.trim());
    }

    const own = form.notes.trim();
    if (own) lines.push(own);

    return lines.length > 0 ? lines.join('\n') : undefined;
  }


  /**
   * La commande, portée sur WhatsApp (§6, gabarit Vendeur social).
   *
   * Le trafic d'un vendeur social arrive d'une conversation et veut y retourner :
   * lui imposer six champs pour un article qu'il a déjà choisi coûte des ventes
   * que le marchand ne voit jamais partir. Le message part avec les articles,
   * les quantités et le total réels — le même calcul que le récapitulatif.
   *
   * Ce n'est PAS une commande enregistrée, et l'écran le dit : le marchand la
   * saisira depuis la conversation. Prétendre le contraire ferait attendre une
   * confirmation qui ne viendrait pas.
   *
   * Sans numéro, le bloc disparaît au lieu d'annoncer un canal qui n'existe
   * pas chez ce marchand.
   */
  const whatsappOrder = useMemo(() => {
    const phone = resolveOrderPhone(
      store.theme.whatsapp.number, store.whatsappPhone, store.contactPhone,
    );
    if (!phone) return null;

    return buildWhatsAppOrderLink(phone, {
      storeName: store.name,
      currency:  store.currency,
      items: [
        ...items.map((i) => ({
          name: i.product.name,
          quantity: i.quantity,
          price: i.product.sale_price ?? i.product.price,
        })),
        ...bundles.map((b) => ({
          name: b.bundle.name,
          quantity: b.quantity,
          price: b.bundle.price,
        })),
      ],
      total,
      storeUrl: store.origin ? store.origin + store.base : null,
      greeting: store.theme.whatsapp.greeting || null,
    });
  }, [store, items, bundles, total]);

  const inputClass =
    'min-h-[48px] w-full rounded-[var(--st-radius-input)] border bg-[var(--st-surface)] px-4 text-[15px] ' +
    'text-[var(--st-ink)] outline-none transition focus:border-[var(--st-accent)]';

  if (hydrated && empty) {
    return (
      <div className="mx-auto flex min-h-[50vh] max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <ShoppingBag className="h-10 w-10 text-[var(--st-ink-3)]" strokeWidth={1.3} aria-hidden />
        {paidOrderNumber ? (
          <p className="text-[16px] font-semibold text-[var(--st-ink)]">
            Votre commande {paidOrderNumber} est payée
          </p>
        ) : (
          <p className="text-[16px] font-semibold text-[var(--st-ink)]">Votre panier est vide</p>
        )}
        {/* Un retour de passerelle en échec sur un panier vide (autre origine,
            panier déjà vidé) : l'erreur reste lisible au lieu d'être avalée par
            l'écran vide. */}
        {error && !paidOrderNumber && (
          <p
            role="alert"
            className="rounded-[8px] border px-4 py-3 text-[13px]"
            style={{ borderColor: '#E3BDB8', background: '#FDF3F2', color: '#8C2F26' }}
          >
            {error}
          </p>
        )}
        <Link
          href={`${store.base}/products`}
          className="text-[14px] font-semibold text-[var(--st-ink-2)] underline underline-offset-4"
        >
          Voir les produits
        </Link>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!form.name.trim() || !form.phone.trim() || !form.line1.trim() || !form.city.trim()) {
      setError('Nom, téléphone, adresse et ville sont nécessaires pour livrer.');
      return;
    }

    if (!form.payment) {
      setError("Cette boutique ne propose pas encore de moyen de paiement. Contactez-la pour commander.");
      return;
    }

    setSubmitting(true);

    // Ce que le serveur reçoit : des identifiants et des quantités. Rien
    // d'autre — surtout pas un prix.
    const orderData = {
      business_id:    businessId,
      customer_name:  form.name.trim(),
      customer_email: form.email.trim(),
      customer_phone: form.phone.trim(),
      shipping_address: {
        line1:   form.line1.trim(),
        line2:   form.line2.trim() || undefined,
        city:    form.city.trim(),
        country: 'HT',
      },
      shipping_mode:  form.shipping_mode,
      payment_method: form.payment,
      notes:          composedNotes(),
      items: [
        ...items.map((i) => ({ product_id: i.product.id, quantity: i.quantity })),
        ...bundles.map((b) => ({ bundle_id: b.bundle.id, quantity: b.quantity })),
      ],
      // Le CODE, jamais le montant : la remise se recalcule en base.
      coupon_code: couponCode.trim() || undefined,
      // Boucle l'entonnoir (§30). L'événement d'achat est écrit par
      // `create_store_order`, à l'endroit où l'achat est certain — une route
      // publique de mesure pourrait déclarer des ventes qui n'existent pas.
      session_id: storeSessionId(),
    };

    try {
      if (form.payment === 'moncash' || form.payment === 'natcash') {
        const res = await fetch(`/api/store/payment/${form.payment}`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ businessId, orderData }),
        });
        const json = await res.json();
        if (!res.ok || json.error) {
          // Un `code` de retour connu (`payment_unavailable` : commande en USD
          // sans taux utilisable) affiche le même message qu'au retour d'une
          // passerelle, sans recharger la page ni vider le formulaire.
          setError(
            json.code
              ? returnErrorMessage(json.code)
              : (json.error ?? 'Le paiement n\'a pas pu démarrer.'),
          );
          setSubmitting(false);
          return;
        }
        // Le panier NE part PAS ici. La commande est enregistrée, pas payée :
        // annulé ou refusé chez la passerelle, l'acheteur revient avec
        // `?error=…` et trouvait « Votre panier est vide » au lieu de l'erreur.
        // Il se vide quand la base dit payée (confirmation/ClearPaidCart, ou le
        // rapprochement ci-dessus) ; on note quelle commande l'engage.
        rememberPendingOrder(store.slug, json.orderId);
        window.location.href = json.redirectUrl;
        return;
      }

      // Paiement à la livraison : la commande est ferme dès sa création, le
      // panier peut partir tout de suite.
      const { orderId } = unwrap(await createStoreOrder(orderData));
      forgetPendingOrder(store.slug);
      clear();
      router.push(`${store.base}/confirmation?id=${orderId}`);
    } catch (err) {
      // Les messages du serveur sont écrits pour l'acheteur (« Stock
      // insuffisant pour « Savon karité » : il en reste 2. ») : on les montre.
      setError(screenMessage(err, 'La commande n\'a pas pu être enregistrée.'));
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <h1 className="mb-6 text-[22px] font-semibold text-[var(--st-ink)]">Passer la commande</h1>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* ── Les champs ── */}
        <div className="flex flex-col gap-4 lg:col-span-3">
          {/* La voie WhatsApp, proposée AVANT le formulaire sur les gabarits dont
              le trafic arrive d'une conversation (§6). Elle ne remplace pas le
              tunnel — elle est offerte à côté, et le formulaire reste dessous
              pour qui préfère payer en ligne. */}
          {extras.whatsappFirst && whatsappOrder && (
            <div
              className="rounded-[var(--st-radius-card)] border p-4"
              style={{ borderColor: 'var(--st-border)', background: 'var(--st-surface-2)' }}
            >
              <p className="text-[15px] font-semibold text-[var(--st-ink)]">
                Vous préférez commander en discutant ?
              </p>
              <p className="mt-1 text-[13px] leading-relaxed text-[var(--st-ink-2)]">
                Votre panier part sur WhatsApp avec les articles et le total. La
                boutique vous répond pour confirmer et convenir du paiement.
              </p>
              <a
                href={whatsappOrder}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackStoreEvent({ businessId, event: 'whatsapp_click' })}
                className="mt-3 flex min-h-[48px] w-full items-center justify-center gap-2 text-[15px] font-semibold transition hover:brightness-95"
                style={{
                  background:   'var(--st-accent)',
                  color:        'var(--st-accent-ink)',
                  borderRadius: 'var(--st-radius-btn)',
                }}
              >
                <MessageCircle className="h-4 w-4" strokeWidth={2.1} aria-hidden />
                Commander sur WhatsApp
              </a>
              <p className="mt-2.5 text-[12px] text-[var(--st-ink-3)]">
                Cela n'enregistre pas encore la commande : c'est une conversation.
                Pour payer maintenant en ligne, remplissez le formulaire ci-dessous.
              </p>
            </div>
          )}

          <Section title="Vos coordonnées">
            <input
              className={inputClass} style={{ borderColor: 'var(--st-border)' }}
              placeholder="Nom complet *" autoComplete="name" required
              value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <input
              className={inputClass} style={{ borderColor: 'var(--st-border)' }}
              type="tel" placeholder="Téléphone *" autoComplete="tel" required
              value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
            <input
              className={inputClass} style={{ borderColor: 'var(--st-border)' }}
              type="email" placeholder="Email (facultatif)" autoComplete="email"
              value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Section>

          <Section title="Livraison">
            <input
              className={inputClass} style={{ borderColor: 'var(--st-border)' }}
              placeholder="Adresse *" autoComplete="street-address" required
              value={form.line1} onChange={(e) => setForm({ ...form, line1: e.target.value })}
            />
            <input
              className={inputClass} style={{ borderColor: 'var(--st-border)' }}
              placeholder="Complément (facultatif)"
              value={form.line2} onChange={(e) => setForm({ ...form, line2: e.target.value })}
            />
            <input
              className={inputClass} style={{ borderColor: 'var(--st-border)' }}
              placeholder="Ville *" autoComplete="address-level2" required
              value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })}
            />
          </Section>

          {shippingModes.length > 0 && (
            <Section title="Mode de livraison">
              {shippingModes.map((mode) => (
                <Choice
                  key={mode.id}
                  name="shipping"
                  checked={form.shipping_mode === mode.id}
                  onSelect={() => setForm({ ...form, shipping_mode: mode.id })}
                  label={mode.label}
                  note={mode.days}
                  trailing={
                    store.showPrices
                      ? mode.price === 0 ? 'Gratuit' : storeMoney(mode.price, store.currency)
                      : undefined
                  }
                />
              ))}
            </Section>
          )}

          <Section title="Paiement">
            {offered.map((method) => (
              <Choice
                key={method}
                name="payment"
                checked={form.payment === method}
                onSelect={() => setForm({ ...form, payment: method })}
                label={PAYMENT_LABEL[method]}
              />
            ))}
            {/* Une boutique qui n'a coché que la carte n'a, en vérité, aucun
                moyen de paiement : le dire plutôt que d'afficher un titre vide. */}
            {offered.length === 0 && (
              <p className="text-[13px] text-[var(--st-ink-2)]">
                Cette boutique ne propose pas encore de moyen de paiement.
                Contactez-la pour commander.
              </p>
            )}
          </Section>

          {/* ── Ce que ce métier demande en plus (§6) ────────────────────
              Un panier classique suffit à un commerçant. Il ne suffit pas à un
              pâtissier, dont la commande vaut une date, ni à un artisan, dont
              la pièce se personnalise. */}
          {extras.schedule !== 'none' && (
            <Section
              title={
                extras.schedule === 'appointment'
                  ? 'Votre créneau'
                  : 'Pour quand ?'
              }
            >
              <p className="mb-3 flex items-start gap-2 text-[13px] text-[var(--st-ink-2)]">
                <CalendarClock className="mt-0.5 h-4 w-4 flex-shrink-0" strokeWidth={1.7} aria-hidden />
                {extras.schedule === 'appointment'
                  ? 'Indiquez le moment qui vous arrange. La boutique vous confirmera le rendez-vous.'
                  : 'Indiquez quand vous souhaitez recevoir votre commande. La boutique vous confirmera.'}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-medium text-[var(--st-ink-2)]">Date</span>
                  <input
                    type="date"
                    className={inputClass}
                    style={{ borderColor: 'var(--st-border)' }}
                    // Une date passée n'est pas une commande : c'est une erreur de
                    // saisie que le marchand découvrirait après l'encaissement.
                    min={new Date().toISOString().slice(0, 10)}
                    value={form.wantedDate}
                    onChange={(e) => setForm({ ...form, wantedDate: e.target.value })}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-medium text-[var(--st-ink-2)]">Heure</span>
                  <input
                    type="time"
                    className={inputClass}
                    style={{ borderColor: 'var(--st-border)' }}
                    value={form.wantedTime}
                    onChange={(e) => setForm({ ...form, wantedTime: e.target.value })}
                  />
                </label>
              </div>
            </Section>
          )}

          {extras.customisation && (
            <Section title="Votre personnalisation (facultatif)">
              <p className="mb-3 flex items-start gap-2 text-[13px] text-[var(--st-ink-2)]">
                <Sparkles className="mt-0.5 h-4 w-4 flex-shrink-0" strokeWidth={1.7} aria-hidden />
                Un message à écrire, une couleur, une taille, une gravure. La
                boutique vous répondra si quelque chose n'est pas possible.
              </p>
              <textarea
                className={inputClass + ' min-h-[96px] py-3'}
                style={{ borderColor: 'var(--st-border)' }}
                rows={3}
                placeholder="« Joyeux anniversaire Marie », coloris bleu, 18 cm…"
                maxLength={400}
                value={form.customisation}
                onChange={(e) => setForm({ ...form, customisation: e.target.value })}
              />
            </Section>
          )}

          {extras.quote && (
            <Section title="Vous en voulez plus ? (facultatif)">
              <p className="mb-3 text-[13px] text-[var(--st-ink-2)]">
                Indiquez la quantité qui vous intéresse : la boutique vous
                répondra avec son prix pour ce volume. Votre commande ci-dessous
                part normalement, elle n'attend pas ce prix.
              </p>
              <input
                className={inputClass}
                style={{ borderColor: 'var(--st-border)' }}
                placeholder="« 50 têtes », « 3 sacs de 50 kg »"
                maxLength={80}
                value={form.quoteQuantity}
                onChange={(e) => setForm({ ...form, quoteQuantity: e.target.value })}
              />
            </Section>
          )}

          <Section title="Note pour le marchand (facultatif)">
            <textarea
              className={`${inputClass} min-h-[96px] py-3`}
              style={{ borderColor: 'var(--st-border)' }}
              rows={3} placeholder="Point de repère, heure de livraison…"
              value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </Section>
        </div>

        {/* ── Le récapitulatif ── */}
        <aside className="lg:col-span-2">
          <div
            className="rounded-[var(--st-radius-card)] border p-5 lg:sticky lg:top-24"
            style={{ borderColor: 'var(--st-border)', background: 'var(--st-surface)' }}
          >
            <h2 className="mb-4 text-[16px] font-semibold text-[var(--st-ink)]">Votre commande</h2>

            <ul className="flex flex-col gap-3">
              {items.map(({ product, quantity }) => {
                const price = product.sale_price ?? product.price;
                return (
                  <li key={product.id} className="flex items-center gap-3">
                    <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-[var(--st-radius-media)] bg-[var(--st-surface-2)]">
                      {product.image_url && (
                        <StoreImage
                          src={product.image_url} alt={product.name}
                          sizes="64px" className="object-cover"
                        />
                      )}
                      <span
                        className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[11px] font-semibold tabular-nums"
                        style={{ background: 'var(--st-primary)', color: 'var(--st-primary-ink)' }}
                      >
                        {quantity}
                      </span>
                    </div>
                    <p className="line-clamp-2 flex-1 text-[13px] text-[var(--st-ink-2)]">
                      {product.name}
                    </p>
                    {store.showPrices && (
                      <p className="text-[13px] font-semibold tabular-nums text-[var(--st-ink)]">
                        {storeMoney(price * quantity, store.currency)}
                      </p>
                    )}
                  </li>
                );
              })}

              {/* Les lots, une ligne chacun — voir CartDrawer pour le pourquoi. */}
              {bundles.map(({ bundle, quantity }) => (
                <li key={bundle.id} className="flex items-center gap-3">
                  <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-[var(--st-radius-media)] bg-[var(--st-surface-2)]">
                    {bundle.imageUrl ? (
                      <StoreImage
                        src={bundle.imageUrl} alt={bundle.name}
                        sizes="64px" className="object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[var(--st-ink-3)]">
                        <Layers className="h-4 w-4" strokeWidth={1.6} aria-hidden />
                      </div>
                    )}
                    <span
                      className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[11px] font-semibold tabular-nums"
                      style={{ background: 'var(--st-primary)', color: 'var(--st-primary-ink)' }}
                    >
                      {quantity}
                    </span>
                  </div>
                  <p className="line-clamp-2 flex-1 text-[13px] text-[var(--st-ink-2)]">
                    {bundle.name}
                  </p>
                  {store.showPrices && (
                    <p className="text-[13px] font-semibold tabular-nums text-[var(--st-ink)]">
                      {storeMoney(bundle.price * quantity, store.currency)}
                    </p>
                  )}
                </li>
              ))}
            </ul>

            {store.showPrices && (
              <div
                className="mt-4 flex flex-col gap-2 border-t pt-4 text-[14px]"
                style={{ borderColor: 'var(--st-border)' }}
              >
                <div className="flex justify-between text-[var(--st-ink-2)]">
                  <span>Sous-total</span>
                  <span className="tabular-nums">{storeMoney(total, store.currency)}</span>
                </div>

                {/* ── Le code promo ── */}
                <div className="flex gap-2 py-1">
                  <input
                    className={inputClass}
                    style={{ borderColor: 'var(--st-border)' }}
                    placeholder="Code promo"
                    autoCapitalize="characters"
                    value={couponCode}
                    onChange={(e) => { setCouponCode(e.target.value); setCoupon(null); }}
                    onKeyDown={(e) => {
                      // Entrée dans ce champ applique le code ; sans ce garde,
                      // elle enverrait le formulaire entier et commanderait.
                      if (e.key === 'Enter') { e.preventDefault(); void applyCoupon(); }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => void applyCoupon()}
                    disabled={checkingCoupon || !couponCode.trim()}
                    className="min-h-[48px] flex-shrink-0 rounded-[var(--st-radius-btn)] border px-4 text-[14px] font-semibold text-[var(--st-ink)] transition disabled:opacity-45"
                    style={{ borderColor: 'var(--st-border)' }}
                  >
                    {checkingCoupon ? '…' : 'Appliquer'}
                  </button>
                </div>

                {coupon && !coupon.valid && (
                  <p className="text-[13px] text-[var(--st-ink-3)]">
                    {coupon.reason ?? "Ce code n'est pas valable."}
                  </p>
                )}

                {coupon?.valid && (discount > 0 || freeShipping) && (
                  <div className="flex justify-between text-[var(--st-ink-2)]">
                    <span>Code {couponCode.trim().toUpperCase()}</span>
                    <span className="tabular-nums">
                      {freeShipping ? 'Livraison offerte' : `− ${storeMoney(discount, store.currency)}`}
                    </span>
                  </div>
                )}

                <div className="flex justify-between text-[var(--st-ink-2)]">
                  <span>Livraison</span>
                  <span className="tabular-nums">
                    {freeShipping || shippingPrice === 0
                      ? 'Gratuit'
                      : storeMoney(shippingPrice, store.currency)}
                  </span>
                </div>
                <div
                  className="flex items-baseline justify-between border-t pt-3"
                  style={{ borderColor: 'var(--st-border)' }}
                >
                  <span className="text-[14px] text-[var(--st-ink-2)]">Total</span>
                  <span className="text-[22px] font-semibold tabular-nums text-[var(--st-ink)]">
                    {storeMoney(orderTotal, store.currency)}
                  </span>
                </div>
              </div>
            )}

            {error && (
              <p
                role="alert"
                className="mt-4 rounded-[8px] border px-4 py-3 text-[13px]"
                style={{ borderColor: '#E3BDB8', background: '#FDF3F2', color: '#8C2F26' }}
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="mt-4 flex min-h-[56px] w-full items-center justify-center gap-2 rounded-[var(--st-radius-btn)] text-[15px] font-semibold transition hover:brightness-95 disabled:opacity-60"
              style={{ background: 'var(--st-accent)', color: 'var(--st-accent-ink)' }}
            >
              {submitting ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Traitement…
                </>
              ) : (
                'Confirmer la commande'
              )}
            </button>

            <p className="mt-3 flex items-center justify-center gap-1.5 text-[12px] text-[var(--st-ink-3)]">
              <Lock className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              Vos informations restent chez le marchand.
            </p>
          </div>
        </aside>
      </form>
    </div>
  );
}

// ── Deux petites briques, locales à cet écran ───────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      className="rounded-[var(--st-radius-card)] border p-5"
      style={{ borderColor: 'var(--st-border)', background: 'var(--st-surface)' }}
    >
      <h2 className="mb-3 text-[15px] font-semibold text-[var(--st-ink)]">{title}</h2>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

function Choice({
  name, checked, onSelect, label, note, trailing,
}: {
  name:      string;
  checked:   boolean;
  onSelect:  () => void;
  label:     string;
  note?:     string;
  trailing?: string;
}) {
  return (
    <label
      className="flex min-h-[56px] cursor-pointer items-center justify-between gap-3 rounded-[var(--st-radius-input)] border px-4 transition"
      style={{
        borderColor: checked ? 'var(--st-accent)' : 'var(--st-border)',
        background:  checked ? 'var(--st-surface-2)' : 'transparent',
      }}
    >
      <span className="flex items-center gap-3">
        <input
          type="radio" name={name} checked={checked} onChange={onSelect}
          className="h-4 w-4"
          style={{ accentColor: 'var(--st-accent)' }}
        />
        <span>
          <span className="block text-[14px] font-semibold text-[var(--st-ink)]">{label}</span>
          {note && <span className="block text-[12px] text-[var(--st-ink-3)]">{note}</span>}
        </span>
      </span>
      {trailing && (
        <span className="text-[14px] font-semibold tabular-nums text-[var(--st-ink)]">{trailing}</span>
      )}
    </label>
  );
}
