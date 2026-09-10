'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Les lots en vitrine (§18)
//
// « Produit A + Produit B + Produit C → Starter Pack, 45 $ → 39 $. »
//
// Trois décisions se voient ici :
//
//   LE PRIX BARRÉ EST CALCULÉ EN BASE. `regularTotal` vient de
//   `v_product_bundle_totals` ; le navigateur n'additionne rien. Une économie
//   annoncée est un argument de vente, et un argument de vente faux se paie
//   au premier client qui vérifie.
//
//   UN LOT ÉPUISÉ NE S'AFFICHE PAS. Le filtrage se fait à la lecture
//   (`getStoreBundles`), pas ici : montrer un lot pour le refuser à la
//   commande est le pire des trois états possibles.
//
//   « AJOUTER LE LOT » AJOUTE LE LOT, pas ses pièces. Le panier porte une
//   ligne, le serveur relit le prix du lot, et le client voit le même montant
//   du début à la fin. Ajouter les pièces séparément les facturerait au prix
//   du catalogue — c'est-à-dire sans la remise.
// ─────────────────────────────────────────────────────────────────────────────

import { Layers, Check } from 'lucide-react';
import { useCart } from '../CartContext';
import { ProductMedia } from '../blocks/ProductMedia';
import { Section, SectionHeader } from './Shell';
import { storeMoney } from '../format';
import { sectionTitle } from '../../../lib/storeSections';
import type { SectionProps } from './types';

export function BundlesSection({ store, section, data, design }: SectionProps) {
  const { addBundle } = useCart();
  const bundles = data.bundles.slice(0, section.config.limit);

  // Une section vide ne s'affiche pas, et n'annonce pas qu'elle est vide.
  if (bundles.length === 0) return null;

  return (
    <Section design={design} label={sectionTitle(section, store.templateId)}>
      <SectionHeader
        design={design}
        title={sectionTitle(section, store.templateId)}
        eyebrow="Mieux ensemble"
        description="Plusieurs produits, un seul prix."
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3" style={{ gap: 'var(--st-grid-gap)' }}>
        {bundles.map((bundle) => {
          const saving = Math.max(0, bundle.regularTotal - bundle.price);

          return (
            <article
              key={bundle.id}
              className="flex flex-col overflow-hidden border bg-[var(--st-surface)]"
              style={{ borderColor: 'var(--st-border)', borderRadius: 'var(--st-radius-card)', boxShadow: 'var(--st-shadow)' }}
            >
              <ProductMedia
                src={bundle.imageUrl}
                alt={bundle.name}
                rule={{ ratio: '4 / 3', fit: 'cover', pad: 0 }}
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                radius="0px"
              >
                <span
                  className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-[8px] px-2 py-1 text-[12px] font-semibold"
                  style={{ background: 'var(--st-accent)', color: 'var(--st-accent-ink)' }}
                >
                  <Layers className="h-3 w-3" strokeWidth={2} aria-hidden />
                  Lot de {bundle.items.length}
                </span>
              </ProductMedia>

              <div className="flex flex-1 flex-col gap-3 p-4">
                <h3 className="text-[16px] font-semibold text-[var(--st-ink)]">{bundle.name}</h3>

                {bundle.description && (
                  <p className="line-clamp-2 text-[13px] text-[var(--st-ink-2)]">
                    {bundle.description}
                  </p>
                )}

                <ul className="flex flex-col gap-1">
                  {bundle.items.map((item) => (
                    <li
                      key={item.productId}
                      className="flex items-start gap-2 text-[13px] text-[var(--st-ink-2)]"
                    >
                      <Check
                        className="mt-0.5 h-3 w-3 flex-shrink-0 text-[var(--st-accent)]"
                        strokeWidth={2.4}
                        aria-hidden
                      />
                      <span>
                        {item.quantity > 1 && `${item.quantity} × `}
                        {item.productName}
                      </span>
                    </li>
                  ))}
                </ul>

                {store.showPrices && (
                  <div className="mt-auto flex items-baseline gap-2 pt-1">
                    <span className="text-[20px] font-semibold tabular-nums text-[var(--st-ink)]">
                      {storeMoney(bundle.price, store.currency)}
                    </span>
                    {saving > 0 && (
                      <span className="text-[14px] tabular-nums text-[var(--st-ink-3)] line-through">
                        {storeMoney(bundle.regularTotal, store.currency)}
                      </span>
                    )}
                  </div>
                )}

                {saving > 0 && store.showPrices && (
                  <p className="text-[13px] font-semibold text-[var(--st-ink-2)]">
                    Vous économisez {storeMoney(saving, store.currency)}
                  </p>
                )}

                <button
                  type="button"
                  onClick={() => addBundle(bundle)}
                  className="min-h-[48px] w-full text-[15px] font-semibold transition active:scale-[0.99]"
                  style={{ background: 'var(--st-accent)', color: 'var(--st-accent-ink)', borderRadius: 'var(--st-radius-btn)' }}
                >
                  Ajouter le lot
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </Section>
  );
}
