// ─────────────────────────────────────────────────────────────────────────────
// Les suggestions, en bande
//
// ── Pourquoi pas la grille ─────────────────────────────────────────────────
//
// Sous une fiche, `ProductGrid` rend quatre cartes pleines — photo haute,
// étiquette de remise, note, prix barré, bouton « Ajouter au panier ». C'est la
// grille de la page d'accueil, et elle y a sa place : là-bas, on CHOISIT.
//
// Ici, on a déjà choisi. Quatre boutons d'achat sous le bouton d'achat font
// quatre fois la même proposition et rouvrent une décision qui venait d'être
// prise. Mesuré le 19/09/2026 : la grille occupait à elle seule plus de place
// que la fiche entière, et sur les gabarits à trois colonnes une quatrième
// carte tombait seule sur une deuxième ligne.
//
// La bande dit « il y a autre chose » et rien de plus : une photo, un nom, un
// prix, un lien. Le geste d'achat reste au-dessus, là où il a été préparé.
//
// ── Ce qu'elle n'invente pas ───────────────────────────────────────────────
//
// Rien. Les produits viennent de `getBoughtTogetherIds` — ce que d'autres ont
// RÉELLEMENT acheté avec celui-ci — puis de la même catégorie pour compléter.
// Pas de note affichée : la bande est trop petite pour qu'une étoile s'y lise,
// et une moyenne tronquée vaut moins que pas de moyenne.
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link';
import { StoreImage } from '../blocks/StoreImage';
import { storeMoney } from '../format';
import { IMAGE_SIZES } from '../../../lib/storeImage';
import type { StoreProduct, StoreView } from '../types';

export function RelatedStrip({ store, products, title }: {
  store:    StoreView;
  products: StoreProduct[];
  title:    string;
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

      {/* Défilement horizontal sous `sm` : cinq vignettes à 90 px seraient
          illisibles sur un téléphone, et les empiler ferait une deuxième page.
          `snap` pour que le doigt s'arrête sur une vignette, pas entre deux. */}
      <ul className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-4 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-5">
        {products.slice(0, 5).map((p) => {
          const price = p.sale_price ?? p.price;
          return (
            <li key={p.id} className="w-[43%] flex-shrink-0 snap-start sm:w-auto">
              <Link href={`${store.base}/products/${p.id}`} className="group block">
                <div
                  className="relative aspect-square w-full overflow-hidden"
                  style={{ background: 'var(--st-surface-2)', borderRadius: 'var(--st-radius-card)' }}
                >
                  {p.image_url && (
                    <StoreImage
                      src={p.image_url}
                      alt={p.name}
                      sizes={IMAGE_SIZES.card}
                      className="object-cover transition duration-300 group-hover:scale-[1.03]"
                    />
                  )}
                </div>
                <p className="mt-2.5 line-clamp-2 text-[13px] leading-snug text-[var(--st-ink-2)] group-hover:text-[var(--st-ink)]">
                  {p.name}
                </p>
                {store.showPrices && (
                  <p className="mt-1 text-[13.5px] font-semibold tabular-nums text-[var(--st-ink)]">
                    {storeMoney(price, store.currency)}
                  </p>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
