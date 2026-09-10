'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Le contenu du panier
//
// Deux règles tiennent l'écran :
//
//   Aucune couleur en dur. Tout passe par `--st-*`, comme les gabarits : la
//   palette du marchand traverse le tunnel d'achat au lieu de s'arrêter à la
//   page d'accueil.
//
//   Tous les liens partent de `store.base`. Il vaut la chaîne vide quand la
//   boutique est servie depuis son propre domaine, et `/store/<slug>` sinon.
//   Les liens écrits en dur sortaient le visiteur de son domaine et faisaient
//   apparaître le chemin interne dans la barre d'adresse.
//
// Les cibles tactiles sont à 44 px au minimum : ce panier se tient à une main,
// souvent debout au marché.
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link';
import { Layers, Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import { useCart } from '../../../../components/store/CartContext';
import { StoreImage } from '../../../../components/store/blocks/StoreImage';
import { storeMoney } from '../../../../components/store/format';
import { FreeShippingBar } from '../../../../components/store/blocks/FreeShippingBar';
import { ProductGrid } from '../../../../components/store/blocks/ProductGrid';
import { IMAGE_SIZES } from '../../../../lib/storeImage';
import type { RatingMap } from '../../../../components/store/blocks/ProductGrid';
import type { StoreProduct, StoreView } from '../../../../components/store/types';

export function CartClient({
  store, suggestions = [], ratings = {},
}: {
  store: StoreView;
  /** Les meilleures ventes réelles, pour la rangée « on y ajoute souvent ». */
  suggestions?: StoreProduct[];
  ratings?: RatingMap;
}) {
  const {
    items, bundles, total, updateQty, removeItem,
    updateBundleQty, removeBundle, hydrated,
  } = useCart();

  const lineCount = items.length + bundles.length;

  const inCart = new Set(items.map((i) => i.product.id));
  const relevant = suggestions.filter((p) => !inCart.has(p.id)).slice(0, 4);

  // Tant que `localStorage` n'est pas lu, on ne sait pas si le panier est vide.
  // Afficher « votre panier est vide » puis le remplir une fraction de seconde
  // plus tard fait douter le visiteur de ce qu'il vient de faire.
  if (!hydrated) {
    return (
      <div className="mx-auto flex min-h-[50vh] max-w-4xl items-center justify-center px-4">
        <div
          className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--st-border)]"
          style={{ borderTopColor: 'var(--st-accent)' }}
          aria-label="Chargement du panier"
        />
      </div>
    );
  }

  if (lineCount === 0) {
    return (
      <div className="mx-auto flex min-h-[50vh] max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <ShoppingBag className="h-10 w-10 text-[var(--st-ink-3)]" strokeWidth={1.3} aria-hidden />
        <h1 className="text-[20px] font-semibold text-[var(--st-ink)]">Votre panier est vide</h1>
        <p className="text-[14px] text-[var(--st-ink-2)]">
          Ajoutez des articles pour commencer.
        </p>
        <Link
          href={`${store.base}/products`}
          className="mt-2 flex min-h-[48px] items-center justify-center rounded-[10px] px-8 text-[15px] font-semibold transition hover:brightness-95"
          style={{ background: 'var(--st-accent)', color: 'var(--st-accent-ink)' }}
        >
          Voir les produits
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      <h1 className="mb-6 text-[22px] font-semibold text-[var(--st-ink)]">
        Mon panier ({lineCount})
      </h1>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* ── Les articles ── */}
        <ul className="flex flex-col gap-3 lg:col-span-2">
          {items.map(({ product, quantity }) => {
            const price = product.sale_price ?? product.price;
            return (
              <li
                key={product.id}
                className="flex gap-4 border p-4"
                style={{ borderColor: 'var(--st-border)', background: 'var(--st-surface)', borderRadius: 'var(--st-radius-card)' }}
              >
                <Link
                  href={`${store.base}/products/${product.id}`}
                  className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-[8px] bg-[var(--st-surface-2)]"
                >
                  {product.image_url && (
                    <StoreImage
                      src={product.image_url}
                      alt={product.name}
                      sizes={IMAGE_SIZES.row}
                      className="object-cover"
                    />
                  )}
                </Link>

                <div className="flex min-w-0 flex-1 flex-col justify-between gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link
                        href={`${store.base}/products/${product.id}`}
                        className="line-clamp-2 text-[14px] font-semibold text-[var(--st-ink)]"
                      >
                        {product.name}
                      </Link>
                      {product.category && (
                        <p className="mt-0.5 text-[12px] text-[var(--st-ink-3)]">{product.category}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(product.id)}
                      aria-label={`Retirer ${product.name}`}
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
                        onClick={() => updateQty(product.id, quantity - 1)}
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
                        onClick={() => updateQty(product.id, quantity + 1)}
                        aria-label="Augmenter la quantité"
                        className="flex h-11 w-11 items-center justify-center text-[var(--st-ink-2)]"
                      >
                        <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
                      </button>
                    </div>

                    {store.showPrices && (
                      <p className="text-[15px] font-semibold tabular-nums text-[var(--st-ink)]">
                        {storeMoney(price * quantity, store.currency)}
                      </p>
                    )}
                  </div>
                </div>
              </li>
            );
          })}

          {/* ── Les lots (§18) ──
              Pas de lien vers une fiche : un lot n'en a pas. Ses pièces sont
              listées sous le nom, ce qui suffit à savoir ce qu'on achète. */}
          {bundles.map(({ bundle, quantity }) => (
            <li
              key={bundle.id}
              className="flex gap-4 rounded-[12px] border p-4"
              style={{ borderColor: 'var(--st-border)', background: 'var(--st-surface)' }}
            >
              <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-[8px] bg-[var(--st-surface-2)]">
                {bundle.imageUrl ? (
                  <StoreImage
                    src={bundle.imageUrl}
                    alt={bundle.name}
                    sizes={IMAGE_SIZES.row}
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[var(--st-ink-3)]">
                    <Layers className="h-5 w-5" strokeWidth={1.6} aria-hidden />
                  </div>
                )}
              </div>

              <div className="flex min-w-0 flex-1 flex-col justify-between gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="line-clamp-2 text-[14px] font-semibold text-[var(--st-ink)]">
                      {bundle.name}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-[12px] text-[var(--st-ink-3)]">
                      {bundle.items
                        .map((i) => (i.quantity > 1 ? `${i.quantity} × ${i.productName}` : i.productName))
                        .join(' + ')}
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

        {/* ── Le récapitulatif ── */}
        <aside
          className="h-fit rounded-[12px] border p-5 lg:sticky lg:top-24"
          style={{ borderColor: 'var(--st-border)', background: 'var(--st-surface)' }}
        >
          <h2 className="mb-4 text-[16px] font-semibold text-[var(--st-ink)]">Récapitulatif</h2>

          {store.showPrices && (
            <FreeShippingBar
              theme={store.theme}
              total={total}
              currency={store.currency}
              className="mb-4"
            />
          )}

          {store.showPrices && (
            <>
              <dl className="flex flex-col gap-2 text-[14px]">
                {items.map(({ product, quantity }) => {
                  const price = product.sale_price ?? product.price;
                  return (
                    <div key={product.id} className="flex justify-between gap-3 text-[var(--st-ink-2)]">
                      <dt className="truncate">{product.name} ×{quantity}</dt>
                      <dd className="tabular-nums">{storeMoney(price * quantity, store.currency)}</dd>
                    </div>
                  );
                })}
                {bundles.map(({ bundle, quantity }) => (
                  <div key={bundle.id} className="flex justify-between gap-3 text-[var(--st-ink-2)]">
                    <dt className="truncate">{bundle.name} ×{quantity}</dt>
                    <dd className="tabular-nums">
                      {storeMoney(bundle.price * quantity, store.currency)}
                    </dd>
                  </div>
                ))}
              </dl>

              <div className="my-4 border-t" style={{ borderColor: 'var(--st-border)' }} />

              <div className="flex items-baseline justify-between">
                <span className="text-[14px] text-[var(--st-ink-2)]">Total</span>
                <span className="text-[22px] font-semibold tabular-nums text-[var(--st-ink)]">
                  {storeMoney(total, store.currency)}
                </span>
              </div>
              <p className="mt-1 text-[12px] text-[var(--st-ink-3)]">
                Livraison calculée à l'étape suivante.
              </p>
            </>
          )}

          <Link
            href={`${store.base}/checkout`}
            className="mt-5 flex min-h-[56px] w-full items-center justify-center rounded-[10px] text-[15px] font-semibold transition hover:brightness-95"
            style={{ background: 'var(--st-accent)', color: 'var(--st-accent-ink)' }}
          >
            Passer la commande
          </Link>
          <Link
            href={`${store.base}/products`}
            className="mt-3 flex min-h-[44px] w-full items-center justify-center text-[13px] font-semibold text-[var(--st-ink-2)] underline underline-offset-4"
          >
            Continuer mes achats
          </Link>
        </aside>
      </div>

      {/* ── « On y ajoute souvent » (§19, §29) ──
          Les meilleures ventes réelles, moins ce qui est déjà dans le panier.
          Une suggestion qui propose l'article qu'on vient d'ajouter donne
          l'impression d'une page qui ne suit pas. */}
      {relevant.length > 0 && (
        <section className="mt-14">
          <h2
            className="mb-6 text-[var(--st-ink)]"
            style={{
              fontFamily: 'var(--st-font-heading)',
              fontSize:   'var(--st-h2)',
              fontWeight: 600,
            }}
          >
            On y ajoute souvent
          </h2>
          <ProductGrid
            store={store}
            products={relevant}
            ratings={ratings}
            priorityCount={0}
          />
        </section>
      )}
    </div>
  );
}
