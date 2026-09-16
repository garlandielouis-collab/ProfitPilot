'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Le tiroir panier, et les deux voies de commande
//
// Voie 1 — le paiement classique : formulaire, coordonnées, mode de livraison,
// passerelle. Elle existe déjà dans /store/[slug]/checkout, on y renvoie.
//
// Voie 2 — WhatsApp : le panier part en message, la conversation fait le reste.
// Pas de formulaire, pas de compte, pas de passerelle. Pour une bonne part des
// marchands haïtiens, c'est la voie qui convertit — et pour certains, la seule
// qui existe.
//
// Les deux ne pèsent pas le même poids visuel. Quand WhatsApp est activé, c'est
// lui l'action principale et le paiement classique devient un lien en dessous.
// Deux boutons pleins côte à côte forcent l'acheteur à choisir avant de savoir
// ce qu'il choisit : il ne choisit pas, il ferme.
//
// Les trois champs de coordonnées sont optionnels et repliés par défaut. Un
// marchand qui reçoit « 2x Savon karité — 900 HTG » sans adresse demandera
// l'adresse dans la conversation ; un acheteur à qui on impose trois champs
// avant d'ouvrir WhatsApp s'en va.
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { X, Minus, Plus, Trash2, ShoppingBag, MessageCircle, ChevronRight, Layers } from 'lucide-react';
import { useCart } from '../CartContext';
import { storeMoney } from '../format';
import { StoreImage } from './StoreImage';
import { FreeShippingBar } from './FreeShippingBar';
import { IMAGE_SIZES } from '../../../lib/storeImage';
import { buildWhatsAppOrderLink } from '../../../lib/storeWhatsApp';
import type { StoreView } from '../types';

export function CartDrawer({ store }: { store: StoreView }) {
  const {
    items, bundles, total, count, drawerOpen, closeDrawer,
    updateQty, removeItem, updateBundleQty, removeBundle,
  } = useCart();

  // Le panier est vide quand il n'a NI produit NI lot. Tester `items` seul
  // affichait « votre panier est vide » sous un lot déjà ajouté.
  const empty = items.length === 0 && bundles.length === 0;
  const [showDetails, setShowDetails] = useState(false);

  // `aria-modal="true"` annonce une boîte modale, et on sort d'une modale par
  // Échap. Le tiroir ne se fermait qu'au clic sur le voile ou sur la croix :
  // au clavier, il fallait traverser tout le panier — chaque quantité, chaque
  // corbeille — pour retrouver de quoi le refermer.
  useEffect(() => {
    if (!drawerOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeDrawer();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawerOpen, closeDrawer]);
  const [customer, setCustomer] = useState({ name: '', phone: '', address: '' });

  const whatsappLink =
    store.whatsappPhone && !empty
      ? buildWhatsAppOrderLink(store.whatsappPhone, {
          storeName: store.name,
          currency:  store.currency,
          // Les lots partent dans le message comme des lignes ordinaires : le
          // marchand qui le lit doit voir CE QUI EST COMMANDÉ, pas la
          // mécanique interne du panier.
          items: [
            ...items.map((i) => ({
              name:     i.product.name,
              quantity: i.quantity,
              price:    i.product.sale_price ?? i.product.price,
            })),
            ...bundles.map((b) => ({
              name:     `${b.bundle.name} (lot)`,
              quantity: b.quantity,
              price:    b.bundle.price,
            })),
          ],
          total,
          customer:  showDetails ? customer : null,
          storeUrl:  store.origin || null,
          greeting:  store.theme.whatsapp.greeting || null,
        })
      : null;

  return (
    <>
      {/* Voile — marine assombri, pas noir pur : le noir pur sur une vitrine
          colorée fait un trou dans la page. */}
      <div
        onClick={closeDrawer}
        aria-hidden
        className={[
          'fixed inset-0 z-50 bg-[#0E1822]/50 transition-opacity duration-200',
          drawerOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        ].join(' ')}
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Votre panier"
        aria-hidden={!drawerOpen}
        className={[
          'fixed right-0 top-0 z-50 flex h-[100dvh] w-full max-w-[420px] flex-col bg-[var(--st-surface)] shadow-[0_8px_32px_-8px_rgba(15,23,42,0.35)] transition-transform duration-300 ease-out',
          drawerOpen ? 'translate-x-0' : 'translate-x-full',
        ].join(' ')}
      >
        {/* ── En-tête ── */}
        <header
          className="flex items-center justify-between border-b px-4 py-4"
          style={{ borderColor: 'var(--st-border)' }}
        >
          <h2 className="text-[16px] font-semibold text-[var(--st-ink)]">
            Votre panier{count > 0 ? ` (${count})` : ''}
          </h2>
          <button
            type="button"
            onClick={closeDrawer}
            aria-label="Fermer le panier"
            className="flex h-11 w-11 items-center justify-center rounded-[8px] text-[var(--st-ink-2)] transition hover:bg-[var(--st-surface-2)]"
          >
            <X className="h-5 w-5" strokeWidth={1.8} aria-hidden />
          </button>
        </header>

        {/* ── Contenu ── */}
        {empty ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
            <ShoppingBag className="h-10 w-10 text-[var(--st-ink-3)]" strokeWidth={1.3} aria-hidden />
            <p className="text-[14px] text-[var(--st-ink-2)]">
              Votre panier est vide.
            </p>
            <Link
              href={`${store.base}/products`}
              onClick={closeDrawer}
              className="flex min-h-[44px] items-center text-[14px] font-semibold text-[var(--st-ink)] underline underline-offset-4"
            >
              Voir les produits
            </Link>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-4 py-4">
            <ul className="flex flex-col gap-4">
              {items.map((item) => {
                const price = item.product.sale_price ?? item.product.price;
                return (
                  <li key={item.product.id} className="flex gap-3">
                    <div className="relative h-[72px] w-[72px] flex-shrink-0 overflow-hidden rounded-[8px] bg-[var(--st-surface-2)]">
                      {item.product.image_url && (
                        <StoreImage
                          src={item.product.image_url}
                          alt={item.product.name}
                          sizes="72px"
                          className="object-cover"
                        />
                      )}
                    </div>

                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <div className="flex items-start justify-between gap-2">
                        <p className="line-clamp-2 text-[14px] font-semibold text-[var(--st-ink)]">
                          {item.product.name}
                        </p>
                        <button
                          type="button"
                          onClick={() => removeItem(item.product.id)}
                          aria-label={`Retirer ${item.product.name}`}
                          className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-[8px] text-[var(--st-ink-3)] transition hover:text-[#B23A2F]"
                        >
                          <Trash2 className="h-4 w-4" strokeWidth={1.8} aria-hidden />
                        </button>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <div
                          className="flex items-center rounded-[8px] border"
                          style={{ borderColor: 'var(--st-border)' }}
                        >
                          <button
                            type="button"
                            onClick={() => updateQty(item.product.id, item.quantity - 1)}
                            aria-label="Diminuer la quantité"
                            className="flex h-11 w-11 items-center justify-center text-[var(--st-ink-2)]"
                          >
                            <Minus className="h-4 w-4" strokeWidth={2} aria-hidden />
                          </button>
                          <span className="min-w-[28px] text-center text-[14px] font-semibold tabular-nums text-[var(--st-ink)]">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateQty(item.product.id, item.quantity + 1)}
                            aria-label="Augmenter la quantité"
                            className="flex h-11 w-11 items-center justify-center text-[var(--st-ink-2)]"
                          >
                            <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
                          </button>
                        </div>

                        {store.showPrices && (
                          <p className="text-[15px] font-semibold tabular-nums text-[var(--st-ink)]">
                            {storeMoney(price * item.quantity, store.currency)}
                          </p>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}

              {/* ── Les lots (§18) ──
                  Une ligne par lot, jamais ses pièces déployées : le client a
                  choisi un prix groupé, et voir apparaître trois lignes à leur
                  prix de catalogue lui ferait croire à une erreur de total. */}
              {bundles.map(({ bundle, quantity }) => (
                <li key={bundle.id} className="flex gap-3">
                  <div className="relative h-[72px] w-[72px] flex-shrink-0 overflow-hidden rounded-[8px] bg-[var(--st-surface-2)]">
                    {bundle.imageUrl ? (
                      <StoreImage
                        src={bundle.imageUrl}
                        alt={bundle.name}
                        sizes="72px"
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[var(--st-ink-3)]">
                        <Layers className="h-5 w-5" strokeWidth={1.6} aria-hidden />
                      </div>
                    )}
                  </div>

                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="line-clamp-2 text-[14px] font-semibold text-[var(--st-ink)]">
                          {bundle.name}
                        </p>
                        <p className="mt-0.5 line-clamp-1 text-[12px] text-[var(--st-ink-3)]">
                          {bundle.items.map((i) => i.productName).join(' + ')}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeBundle(bundle.id)}
                        aria-label={`Retirer ${bundle.name}`}
                        className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-[8px] text-[var(--st-ink-3)] transition hover:text-[#B23A2F]"
                      >
                        <Trash2 className="h-4 w-4" strokeWidth={1.8} aria-hidden />
                      </button>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <div
                        className="flex items-center rounded-[8px] border"
                        style={{ borderColor: 'var(--st-border)' }}
                      >
                        <button
                          type="button"
                          onClick={() => updateBundleQty(bundle.id, quantity - 1)}
                          aria-label="Diminuer la quantité"
                          className="flex h-11 w-11 items-center justify-center text-[var(--st-ink-2)]"
                        >
                          <Minus className="h-4 w-4" strokeWidth={2} aria-hidden />
                        </button>
                        <span className="min-w-[28px] text-center text-[14px] font-semibold tabular-nums text-[var(--st-ink)]">
                          {quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateBundleQty(bundle.id, quantity + 1)}
                          aria-label="Augmenter la quantité"
                          className="flex h-11 w-11 items-center justify-center text-[var(--st-ink-2)]"
                        >
                          <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
                        </button>
                      </div>

                      {store.showPrices && (
                        <p className="text-[15px] font-semibold tabular-nums text-[var(--st-ink)]">
                          {storeMoney(bundle.price * quantity, store.currency)}
                        </p>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            {/* Coordonnées repliées — voir l'en-tête du fichier. */}
            {whatsappLink && (
              <div className="mt-6">
                <button
                  type="button"
                  onClick={() => setShowDetails((v) => !v)}
                  className="flex min-h-[44px] w-full items-center justify-between text-[13px] font-semibold text-[var(--st-ink-2)]"
                >
                  Ajouter mes coordonnées (facultatif)
                  <ChevronRight
                    className={`h-4 w-4 transition-transform ${showDetails ? 'rotate-90' : ''}`}
                    strokeWidth={2}
                    aria-hidden
                  />
                </button>

                {showDetails && (
                  <div className="mt-2 flex flex-col gap-2">
                    {([
                      { key: 'name',    label: 'Nom',            type: 'text',  autoComplete: 'name' },
                      { key: 'phone',   label: 'Téléphone',      type: 'tel',   autoComplete: 'tel' },
                      { key: 'address', label: 'Adresse / ville', type: 'text', autoComplete: 'street-address' },
                    ] as const).map((field) => (
                      <input
                        key={field.key}
                        type={field.type}
                        autoComplete={field.autoComplete}
                        placeholder={field.label}
                        value={customer[field.key]}
                        onChange={(e) => setCustomer((c) => ({ ...c, [field.key]: e.target.value }))}
                        aria-label={field.label}
                        className="min-h-[44px] w-full rounded-[8px] border bg-[var(--st-surface)] px-3 text-[14px] text-[var(--st-ink)] outline-none focus:border-[var(--st-accent)]"
                        style={{ borderColor: 'var(--st-border)' }}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Pied : le total, puis l'action ── */}
        {!empty && (
          <footer
            className="border-t px-4 py-4"
            style={{ borderColor: 'var(--st-border)' }}
          >
            {store.showPrices && (
              <FreeShippingBar
                theme={store.theme}
                total={total}
                currency={store.currency}
                className="mb-4"
              />
            )}

            {store.showPrices && (
              <div className="mb-1 flex items-baseline justify-between">
                <span className="text-[14px] text-[var(--st-ink-2)]">Total</span>
                <span className="text-[22px] font-semibold tabular-nums text-[var(--st-ink)]">
                  {storeMoney(total, store.currency)}
                </span>
              </div>
            )}
            <p className="mb-4 text-[12px] text-[var(--st-ink-3)]">
              Livraison calculée à la commande.
            </p>

            {whatsappLink ? (
              <>
                <a
                  href={whatsappLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-h-[56px] w-full items-center justify-center gap-2 text-[15px] font-semibold transition hover:brightness-95"
                  style={{ background: 'var(--st-accent)', color: 'var(--st-accent-ink)', borderRadius: 'var(--st-radius-btn)' }}
                >
                  <MessageCircle className="h-5 w-5" strokeWidth={2} aria-hidden />
                  Commander sur WhatsApp
                </a>
                <Link
                  href={`${store.base}/checkout`}
                  onClick={closeDrawer}
                  className="mt-3 flex min-h-[44px] w-full items-center justify-center text-[14px] font-semibold text-[var(--st-ink-2)] underline underline-offset-4"
                >
                  Payer en ligne
                </Link>
              </>
            ) : (
              <Link
                href={`${store.base}/checkout`}
                onClick={closeDrawer}
                className="flex min-h-[56px] w-full items-center justify-center text-[15px] font-semibold transition hover:brightness-95"
                style={{ background: 'var(--st-accent)', color: 'var(--st-accent-ink)', borderRadius: 'var(--st-radius-btn)' }}
              >
                Passer la commande
              </Link>
            )}
          </footer>
        )}
      </aside>
    </>
  );
}
