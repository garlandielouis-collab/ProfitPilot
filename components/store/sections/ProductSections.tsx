// ─────────────────────────────────────────────────────────────────────────────
// Les sections qui montrent des produits
//
// Quatre sections, un seul composant : « en vedette », « meilleures ventes »,
// « nouveautés » et « catalogue » ne diffèrent que par la liste qu'elles
// reçoivent et par leur titre. Les écrire séparément, c'est corriger quatre
// fois la même grille.
//
// Une section vide ne s'affiche pas. Elle n'affiche pas non plus « aucun
// produit » : un visiteur n'a pas à savoir qu'il existe une rubrique
// « meilleures ventes » que ce marchand ne remplit pas encore.
//
// ── Le produit en vedette (§9) ─────────────────────────────────────────────
//
// Le rayon électronique ne se parcourt pas comme un rayon de mode : le visiteur
// vient pour UN appareil, et la page doit lui en montrer un, en grand, avec ses
// caractéristiques et son prix. `FeaturedProductSection` fait cela — une seule
// fiche, mise en scène, avec l'achat à portée de pouce.
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link';
import { Check } from 'lucide-react';
import { ProductGrid } from '../blocks/ProductGrid';
import { ProductMedia } from '../blocks/ProductMedia';
import { AddToCartButton } from '../blocks/AddToCartButton';
import { FadeIn } from '../blocks/FadeIn';
import { Section, SectionHeader } from './Shell';
import { storeMoney } from '../format';
import { sectionTitle } from '../../../lib/storeSections';
import { IMAGE_SIZES } from '../../../lib/storeImage';
import type { SectionProps } from './types';
import type { DesignProfile } from '../../../lib/storeDesign';
import type { StoreProduct, StoreView } from '../types';
import type { RatingMap } from './types';

/** Le sur-titre d'une rangée : il annonce l'intention, pas le contenu. */
const EYEBROWS: Record<string, string> = {
  featured:     'Sélection',
  bestsellers:  'Les plus choisis',
  new_arrivals: 'Cette saison',
  catalog:      'La boutique',
};

function ProductRow({
  store, design, title, eyebrow, products, limit, ratings, showAll, tone, bestsellers,
}: {
  store:    StoreView;
  design:   DesignProfile;
  title:    string;
  eyebrow?: string;
  products: StoreProduct[];
  limit:    number;
  ratings:  RatingMap;
  showAll:  boolean;
  tone?:    'surface' | 'surface-2';
  bestsellers?: boolean;
}) {
  if (products.length === 0) return null;

  const visible = products.slice(0, limit);

  const body = (
    <Section design={design} tone={tone ?? 'surface'} label={title}>
      <SectionHeader
        design={design}
        title={title}
        eyebrow={eyebrow}
        href={showAll ? `${store.base}/products` : undefined}
        align={design.hero === 'editorial' ? 'center' : 'left'}
      />
      <ProductGrid store={store} products={visible} ratings={ratings} design={design} bestsellers={bestsellers} />
    </Section>
  );

  // Les gabarits éditoriaux respirent au défilement ; les autres chargent d'un
  // bloc — sur une connexion lente, une apparition différée sur un catalogue
  // dense donne l'impression d'une page qui se construit mal.
  return design.reveal ? <FadeIn>{body}</FadeIn> : body;
}

export function FeaturedSection({ store, section, data, design }: SectionProps) {
  return (
    <ProductRow
      store={store} design={design}
      title={sectionTitle(section, store.templateId)} eyebrow={EYEBROWS.featured}
      products={data.featured} limit={section.config.limit}
      ratings={data.ratings} showAll
    />
  );
}

export function BestsellersSection({ store, section, data, design }: SectionProps) {
  return (
    <ProductRow
      store={store} design={design}
      title={sectionTitle(section, store.templateId)} eyebrow={EYEBROWS.bestsellers}
      products={data.bestsellers} limit={section.config.limit}
      ratings={data.ratings} showAll tone="surface-2" bestsellers
    />
  );
}

export function NewArrivalsSection({ store, section, data, design }: SectionProps) {
  return (
    <ProductRow
      store={store} design={design}
      title={sectionTitle(section, store.templateId)} eyebrow={EYEBROWS.new_arrivals}
      products={data.newArrivals} limit={section.config.limit}
      ratings={data.ratings} showAll
    />
  );
}

/**
 * Le catalogue.
 *
 * Seule section qui affiche quelque chose quand elle est vide — parce qu'une
 * boutique sans aucun produit visible doit le dire, sinon le visiteur croit que
 * la page est cassée.
 */
export function CatalogSection({ store, section, data, design }: SectionProps) {
  if (data.products.length === 0) {
    return (
      <Section design={design}>
        <div
          className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-[var(--st-radius-card)] border border-dashed px-6 py-16 text-center"
          style={{ borderColor: 'var(--st-border)' }}
        >
          <p className="text-[16px] font-semibold text-[var(--st-ink)]">
            Le catalogue arrive bientôt
          </p>
          <p className="text-[14px] leading-relaxed text-[var(--st-ink-2)]">
            Les premiers articles seront en ligne dans quelques jours. Revenez
            nous voir.
          </p>
        </div>
      </Section>
    );
  }

  return (
    <ProductRow
      store={store} design={design}
      title={sectionTitle(section, store.templateId)} eyebrow={EYEBROWS.catalog}
      products={data.products}
      limit={Math.max(section.config.limit, 12)}
      ratings={data.ratings}
      showAll={data.products.length > Math.max(section.config.limit, 12)}
    />
  );
}

// ── Le produit en vedette ───────────────────────────────────────────────────

/**
 * Une seule fiche, en grand.
 *
 * Le produit retenu est le premier « coup de cœur » du marchand ; à défaut, la
 * meilleure vente réelle. Aucun des deux n'est inventé : si la boutique n'a ni
 * vedette ni historique de ventes, la section ne s'affiche pas.
 */
export function FeaturedProductSection({ store, section, data, design }: SectionProps) {
  const product = data.featured[0] ?? data.bestsellers[0] ?? null;
  if (!product) return null;

  const price    = product.sale_price ?? product.price;
  const specs    = Object.entries(product.attributes ?? {})
    .filter(([, v]) => typeof v === 'string' && v.trim())
    .slice(0, 4);
  const outOfStock = product.stock <= 0 && !product.allow_backorders;
  const title    = sectionTitle(section, store.templateId);

  return (
    <Section design={design} tone="surface-2" label={title || product.name}>
      <div className="grid items-center gap-8 md:grid-cols-2 md:gap-14">
        <ProductMedia
          src={product.image_url}
          alt={product.name}
          rule={design.mediaPdp}
          sizes={IMAGE_SIZES.heroSplit}
          radius="var(--st-radius-card)"
        />

        <div className="flex flex-col">
          {design.type.eyebrow && title && (
            <p
              className="mb-3 text-[11px] font-semibold uppercase text-[var(--st-ink-3)]"
              style={{ letterSpacing: '0.18em' }}
            >
              {title}
            </p>
          )}

          <h2
            className="text-[var(--st-ink)]"
            style={{
              fontFamily:    'var(--st-font-heading)',
              fontSize:      'var(--st-h2)',
              fontWeight:    600,
              lineHeight:    1.15,
              letterSpacing: 'var(--st-tracking)',
            }}
          >
            {product.name}
          </h2>

          {product.description && (
            <p className="mt-4 line-clamp-4 text-[15px] leading-relaxed text-[var(--st-ink-2)]">
              {product.description}
            </p>
          )}

          {specs.length > 0 && (
            <ul className="mt-6 flex flex-col gap-2">
              {specs.map(([key, value]) => (
                <li key={key} className="flex items-center gap-2 text-[14px] text-[var(--st-ink-2)]">
                  <Check className="h-4 w-4 flex-shrink-0" strokeWidth={2} style={{ color: 'var(--st-accent)' }} aria-hidden />
                  <span className="text-[var(--st-ink-3)]">{key} :</span>
                  <span className="font-medium text-[var(--st-ink)]">{value}</span>
                </li>
              ))}
            </ul>
          )}

          {store.showPrices && (
            <p className="mt-6 flex flex-wrap items-baseline gap-3">
              <span className="text-[28px] font-semibold tabular-nums text-[var(--st-ink)]">
                {storeMoney(price, store.currency)}
              </span>
              {product.compare_at_price !== null && (
                <span className="text-[16px] tabular-nums text-[var(--st-ink-3)] line-through">
                  {storeMoney(product.compare_at_price, store.currency)}
                </span>
              )}
            </p>
          )}

          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <AddToCartButton product={product} store={store} className="sm:flex-1" />
            <Link
              href={`${store.base}/products/${product.id}`}
              className="flex min-h-[52px] items-center justify-center border px-6 text-[15px] font-semibold text-[var(--st-ink)] transition hover:bg-[var(--st-surface)]"
              style={{ borderColor: 'var(--st-border)', borderRadius: 'var(--st-radius-btn)' }}
            >
              {outOfStock ? 'Voir la fiche' : 'En savoir plus'}
            </Link>
          </div>
        </div>
      </div>
    </Section>
  );
}
