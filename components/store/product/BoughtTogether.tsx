'use client';

// ─────────────────────────────────────────────────────────────────────────────
// « Produits souvent commandés ensemble » (§26)
//
// Ce bloc n'est pas une deuxième bande de suggestions. Les suggestions
// (`RelatedStrip`) disent « il y a autre chose » et se gardent d'un bouton :
// sous une fiche, la décision vient d'être prise, et rouvrir le choix la
// défait. Celui-ci dit l'inverse — « il manque quelque chose » — et c'est
// pourquoi il porte un bouton.
//
// La différence tient à la SOURCE, pas au style :
//
//   les suggestions   le même rayon, faute de mieux : une hypothèse de
//                     ressemblance, qui vaut ce que vaut un rayon
//   ce bloc           `getBoughtTogetherIds` — ce que d'autres clients ont
//                     RÉELLEMENT mis dans la même commande
//
// Un riz et des haricots ne se ressemblent pas ; ils se commandent ensemble.
// C'est la seule liste de la vitrine qui puisse le savoir, et c'est ce qui lui
// donne le droit d'interrompre : elle ne propose pas un autre produit, elle
// complète celui qu'on vient de choisir.
//
// ── Pourquoi l'ajout ne remonte pas le tiroir ──────────────────────────────
//
// Le bouton de la fiche ouvre le panier : on vient de décider, on veut voir où
// l'on en est. Ici, on complète — et ouvrir le tiroir à chaque ajout
// rendrait impossible d'en prendre deux. La confirmation reste dans le bouton
// (1,6 s, `AddToCartButton`), la page ne bouge pas, et le socle du panier
// compte pour deux.
//
// ── Rien n'est inventé ─────────────────────────────────────────────────────
//
// Sans co-achat réel, le bloc n'existe pas — il n'est pas rempli avec le rayon.
// Une boutique qui n'a pas encore vendu ne voit rien ici, et c'est exact : rien
// n'a encore été commandé ensemble.
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link';
import { StoreImage } from '../blocks/StoreImage';
import { AddToCartButton } from '../blocks/AddToCartButton';
import { trackStoreEvent } from '../blocks/TrackView';
import { storeMoney } from '../format';
import { IMAGE_SIZES } from '../../../lib/storeImage';
import type { StoreProduct, StoreView } from '../types';

export function BoughtTogether({ store, businessId, products, title }: {
  store:      StoreView;
  businessId: string;
  /** Les co-achats réels, déjà dédoublonnés et privés du produit affiché. */
  products:   StoreProduct[];
  /** Le mot du gabarit : « Produits souvent commandés ensemble ». */
  title:      string;
}) {
  if (products.length === 0) return null;

  return (
    <section className="mt-16">
      <h2
        className="mb-5 text-[var(--st-ink)]"
        style={{ fontFamily: 'var(--st-font-heading)', fontSize: 'var(--st-h3)', fontWeight: 600 }}
      >
        {title}
      </h2>

      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {products.slice(0, 4).map((p) => {
          const price = p.sale_price ?? p.price;
          return (
            <li
              key={p.id}
              className="flex flex-col overflow-hidden border"
              style={{ borderColor: 'var(--st-border)', borderRadius: 'var(--st-radius-card)' }}
            >
              <Link href={`${store.base}/products/${p.id}`} className="group block">
                <div className="relative aspect-square w-full overflow-hidden" style={{ background: 'var(--st-surface-2)' }}>
                  {p.image_url && (
                    <StoreImage
                      src={p.image_url}
                      alt={p.name}
                      sizes={IMAGE_SIZES.card}
                      className="object-cover transition duration-300 group-hover:scale-[1.03]"
                    />
                  )}
                </div>
                <p className="mt-2.5 line-clamp-2 px-3 text-[13px] leading-snug text-[var(--st-ink-2)] group-hover:text-[var(--st-ink)]">
                  {p.name}
                </p>
              </Link>

              {store.showPrices && (
                <p className="mt-1 px-3 text-[13.5px] font-semibold tabular-nums text-[var(--st-ink)]">
                  {storeMoney(price, store.currency)}
                </p>
              )}

              {/* `mt-auto` : quatre noms de longueurs différentes alignent quand
                  même leurs boutons, sinon la rangée fait des marches. */}
              <div className="mt-auto p-3 pt-3">
                <AddToCartButton
                  product={p}
                  store={store}
                  size="compact"
                  label="Ajouter"
                  onAdded={() => trackStoreEvent({
                    businessId,
                    event:     'add_to_cart',
                    productId: p.id,
                    value:     price,
                  })}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
