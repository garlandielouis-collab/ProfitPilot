// ─────────────────────────────────────────────────────────────────────────────
// Les avis clients
//
// « Ne jamais inventer de reviews. Les avis doivent provenir de vrais
// clients. » (§27)
//
// Cette section affiche d'abord les avis RÉELS : déposés par une personne qui a
// une commande dans la base, publiés par le marchand. La contrainte est dans le
// schéma — `reviews.order_id` est NOT NULL, et RLS n'accorde aucune politique
// d'INSERT aux membres. Un marchand ne peut pas écrire un avis, même en
// appelant l'API directement.
//
// Les « témoignages » saisis à la main dans l'éditeur (`theme.socialProof`)
// existaient avant les avis. Ils restent affichés QUAND ET SEULEMENT QUAND il
// n'y a encore aucun avis réel, et l'éditeur les nomme désormais pour ce qu'ils
// sont : des citations sous la responsabilité du marchand. Le jour où un vrai
// client dépose un avis, les vrais prennent toute la place — et le marchand n'a
// rien à faire pour ça.
// ─────────────────────────────────────────────────────────────────────────────

import { Star, BadgeCheck } from 'lucide-react';
import { FadeIn } from '../blocks/FadeIn';
import { Section, SectionHeader } from './Shell';
import { sectionTitle } from '../../../lib/storeSections';
import type { SectionProps } from './types';

function Stars({ rating }: { rating: number }) {
  if (rating <= 0) return null;
  return (
    <div className="flex gap-0.5" aria-label={`${rating} sur 5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          className="h-4 w-4"
          strokeWidth={1.5}
          style={{
            fill:  i < Math.round(rating) ? 'var(--st-accent)' : 'transparent',
            color: i < Math.round(rating) ? 'var(--st-accent)' : 'var(--st-ink-3)',
          }}
          aria-hidden
        />
      ))}
    </div>
  );
}

export function TestimonialsSection({ store, section, data, design }: SectionProps) {
  const real = data.reviews.slice(0, section.config.limit);

  // Les citations du marchand ne servent que tant qu'aucun vrai avis n'existe.
  const fallback = real.length === 0 && store.theme.socialProof.enabled
    ? store.theme.socialProof.items
    : [];

  if (real.length === 0 && fallback.length === 0) return null;

  const title = sectionTitle(section, store.templateId) || store.theme.socialProof.title;

  const body = (
    <Section design={design} label={title}>
      <SectionHeader design={design} title={title} eyebrow="La preuve" align="center" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" style={{ gap: 'var(--st-grid-gap)' }}>
        {real.map((review) => (
          <figure
            key={review.id}
            className="flex flex-col gap-3 border p-5"
            style={{ borderColor: 'var(--st-border)', background: 'var(--st-surface)', borderRadius: 'var(--st-radius-card)' }}
          >
            <Stars rating={review.rating} />

            {review.body && (
              <blockquote className="text-[14px] leading-relaxed text-[var(--st-ink-2)]">
                « {review.body} »
              </blockquote>
            )}

            <figcaption className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
              <span className="font-semibold text-[var(--st-ink)]">{review.author_name}</span>
              {/* La mention qui donne sa valeur à l'avis : elle n'est pas
                  décorative, elle est vérifiable — cet avis vient d'une
                  commande enregistrée. */}
              <span className="flex items-center gap-1 text-[var(--st-ink-3)]">
                <BadgeCheck className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                Achat vérifié
              </span>
              {review.product_name && (
                <span className="w-full text-[12px] text-[var(--st-ink-3)]">
                  {review.product_name}
                </span>
              )}
            </figcaption>
          </figure>
        ))}

        {fallback.map((quote, i) => (
          <figure
            key={`quote-${i}`}
            className="flex flex-col gap-3 border p-5"
            style={{ borderColor: 'var(--st-border)', background: 'var(--st-surface)', borderRadius: 'var(--st-radius-card)' }}
          >
            <Stars rating={quote.rating} />
            <blockquote className="text-[14px] leading-relaxed text-[var(--st-ink-2)]">
              « {quote.text} »
            </blockquote>
            <figcaption className="mt-auto text-[13px] font-semibold text-[var(--st-ink)]">
              {quote.author}
            </figcaption>
          </figure>
        ))}
      </div>
    </Section>
  );

  return design.reveal ? <FadeIn>{body}</FadeIn> : body;
}
