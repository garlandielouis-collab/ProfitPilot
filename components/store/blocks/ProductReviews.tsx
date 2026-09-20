// ─────────────────────────────────────────────────────────────────────────────
// Les avis d'un produit
//
// Section absente quand il n'y a aucun avis. Pas de « Soyez le premier à donner
// votre avis », pas d'étoiles grises : une fiche sans avis se présente comme
// une fiche sans avis, pas comme une fiche qui en attend.
//
// Chaque avis porte « Achat vérifié », et ce n'est pas décoratif : la table
// exige un `order_id`, et RLS n'accorde aucune politique d'INSERT au marchand.
// La mention est vraie par construction.
// ─────────────────────────────────────────────────────────────────────────────

import { Star, BadgeCheck } from 'lucide-react';
import type { StoreReview } from '../sections/types';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

export function ProductReviews({
  reviews, average, embedded = false,
}: {
  reviews: StoreReview[];
  average: number;
  /**
   * Vrai quand les avis sont rendus DANS l'onglet « Avis » de la fiche.
   *
   * L'onglet porte déjà le mot et l'espace : garder ici le titre « Avis
   * clients » et la marge de vingt unités ferait un titre sous un titre, et un
   * trou au-dessus du premier avis.
   */
  embedded?: boolean;
}) {
  if (reviews.length === 0) return null;

  // La répartition des notes : cinq barres qui disent d'un coup d'œil si les
  // « 4,5 » viennent d'un consensus ou d'un mélange d'enthousiasmes et de
  // déceptions. Une moyenne seule cache exactement ce qu'un acheteur cherche.
  const buckets = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: reviews.filter((r) => Math.round(r.rating) === star).length,
  }));

  return (
    <section id="avis" className={embedded ? 'scroll-mt-24' : 'mt-20 scroll-mt-24'}>
      {!embedded && (
        <h2
          className="mb-6 text-[20px] font-semibold text-[var(--st-ink)]"
          style={{ fontFamily: 'var(--st-font-heading)' }}
        >
          Avis clients
        </h2>
      )}

      <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
        {/* ── Le résumé ── */}
        <div>
          <p className="text-[40px] font-semibold leading-none tabular-nums text-[var(--st-ink)]">
            {average.toFixed(1).replace('.', ',')}
          </p>
          <div className="mt-2 flex gap-0.5" aria-label={`${average} sur 5`}>
            {Array.from({ length: 5 }, (_, i) => (
              <Star
                key={i}
                className="h-4 w-4"
                strokeWidth={1.5}
                style={{
                  fill:  i < Math.round(average) ? 'var(--st-accent)' : 'transparent',
                  color: i < Math.round(average) ? 'var(--st-accent)' : 'var(--st-ink-3)',
                }}
                aria-hidden
              />
            ))}
          </div>
          <p className="mt-1 text-[13px] text-[var(--st-ink-3)]">
            {reviews.length} avis vérifié{reviews.length > 1 ? 's' : ''}
          </p>

          <div className="mt-4 flex flex-col gap-1.5">
            {buckets.map(({ star, count }) => (
              <div key={star} className="flex items-center gap-2 text-[12px] text-[var(--st-ink-3)]">
                <span className="w-3 tabular-nums">{star}</span>
                <Star className="h-3 w-3" style={{ color: 'var(--st-ink-3)' }} strokeWidth={2} aria-hidden />
                <span
                  className="h-1.5 flex-1 overflow-hidden rounded-full"
                  style={{ background: 'var(--st-surface-2)' }}
                >
                  <span
                    className="block h-full rounded-full"
                    style={{
                      width: `${(count / reviews.length) * 100}%`,
                      background: 'var(--st-accent)',
                    }}
                  />
                </span>
                <span className="w-5 text-right tabular-nums">{count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Les avis ── */}
        <ul className="flex flex-col divide-y" style={{ borderColor: 'var(--st-border)' }}>
          {reviews.map((review) => (
            <li key={review.id} className="py-5 first:pt-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <div className="flex gap-0.5" aria-label={`${review.rating} sur 5`}>
                  {Array.from({ length: 5 }, (_, i) => (
                    <Star
                      key={i}
                      className="h-3.5 w-3.5"
                      strokeWidth={1.5}
                      style={{
                        fill:  i < review.rating ? 'var(--st-accent)' : 'transparent',
                        color: i < review.rating ? 'var(--st-accent)' : 'var(--st-ink-3)',
                      }}
                      aria-hidden
                    />
                  ))}
                </div>
                <span className="text-[14px] font-semibold text-[var(--st-ink)]">
                  {review.author_name}
                </span>
                <span className="flex items-center gap-1 text-[12px] text-[var(--st-ink-3)]">
                  <BadgeCheck className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                  Achat vérifié
                </span>
                <time className="ml-auto text-[12px] text-[var(--st-ink-3)]" dateTime={review.created_at}>
                  {formatDate(review.created_at)}
                </time>
              </div>

              {review.body && (
                <p className="mt-2 whitespace-pre-line text-[14px] leading-relaxed text-[var(--st-ink-2)]">
                  {review.body}
                </p>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
