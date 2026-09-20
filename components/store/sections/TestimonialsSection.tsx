// ─────────────────────────────────────────────────────────────────────────────
// La preuve sociale — une source, quatre formes
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
// rien à faire pour ça. La mention « Achat vérifié » suit cette frontière : elle
// ne se pose que sur ce qui est adossé à une commande.
//
// ── Pourquoi quatre formes, et pas une grille pour tout le monde (§12) ─────
//
// C'était le dernier endroit où les vingt-deux gabarits se ressemblaient
// vraiment. Le reste de la vitrine avait sa bannière, sa carte et ses rayons ;
// la preuve, elle, sortait en trois cartes bordées du prestataire au vendeur
// social. Or un avis ne fait pas le même travail selon ce qu'il cautionne :
//
//   editorial  une phrase qu'on LIT. Chez un artisan ou une marque de mode,
//              c'est un texte, il mérite la typographie de titre et de l'air
//              autour. Le premier avis passe en grand, les suivants dessous.
//   band       un VOLUME. Chez un vendeur social ou un traiteur, ce qui
//              convainc n'est pas la phrase mais le nombre : dix vignettes qui
//              défilent au doigt disent « beaucoup de monde » là où trois pavés
//              disent « trois personnes ».
//   ledger     une RÉFÉRENCE. L'acheteur d'un lot de bétail ou d'un téléphone
//              ne lit pas un récit, il vérifie une liste : qui, quoi, quand,
//              combien d'étoiles. Des lignes, donc, pas des cartes.
//   cards      le rendu neutre du commerce, celui qui ne prend pas parti.
//
// ── Le téléphone, qui n'est pas un grand écran réduit (§5) ────────────────
//
// Trois cartes côte à côte sur un écran de 375 pixels deviennent trois cartes
// empilées, soit deux écrans et demi de citations que personne ne fait défiler
// jusqu'au bout. `cards`, `band` et les citations sous la grande d'`editorial`
// glissent donc, avec accrochage — et à TOUTES les largeurs : deux cartes sur
// tablette, trois sur ordinateur, des flèches dès que la bande déborde
// (`ReviewSlider`). `ledger` reste une liste verticale : c'est un relevé
// qu'on parcourt de haut en bas, pas une bande.
// ─────────────────────────────────────────────────────────────────────────────

import { Star, BadgeCheck } from 'lucide-react';
import { FadeIn } from '../blocks/FadeIn';
import { ReviewSlider, SLIDE_ITEM } from '../blocks/ReviewSlider';
import { Section, SectionHeader } from './Shell';
import { sectionTitle } from '../../../lib/storeSections';
import type { SectionProps } from './types';

/**
 * Un avis, quelle que soit sa provenance.
 *
 * Les quatre formes lisent CE type et jamais la source : c'est ce qui garantit
 * qu'un avis réel et une citation de marchand ne se dessinent pas différemment
 * par accident — seule la mention « Achat vérifié » les sépare, et c'est la
 * seule différence qui doit se voir.
 */
type Proof = {
  key:      string;
  rating:   number;
  text:     string;
  author:   string;
  /** Vrai seulement pour un avis adossé à une commande enregistrée. */
  verified: boolean;
  /** Le produit noté, quand l'avis en cite un. */
  subject:  string | null;
  /** ISO, pour les formes qui datent la référence. */
  date:     string | null;
};

function Stars({ rating, size = 4 }: { rating: number; size?: 3.5 | 4 }) {
  if (rating <= 0) return null;
  const px = size === 4 ? 'h-4 w-4' : 'h-3.5 w-3.5';
  return (
    <div className="flex flex-shrink-0 gap-0.5" aria-label={`${rating} sur 5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          className={px}
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

/** « Achat vérifié » — vérifiable, pas décoratif : l'avis vient d'une commande. */
function Verified() {
  return (
    <span className="flex items-center gap-1 whitespace-nowrap text-[var(--st-ink-3)]">
      <BadgeCheck className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={2} aria-hidden />
      Achat vérifié
    </span>
  );
}

/**
 * Le mois et l'année d'un avis, jamais le jour.
 *
 * « 12 mars 2026 » sur une liste de références donne l'impression d'un registre
 * d'huissier, et surtout laisse voir qu'il n'y a eu qu'une commande cette
 * semaine-là. Le mois situe sans exposer.
 */
function monthOf(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('fr-HT', { month: 'long', year: 'numeric' }).format(d);
}

// ── Les quatre formes ───────────────────────────────────────────────────────

const CARD: React.CSSProperties = {
  borderColor:  'var(--st-border)',
  background:   'var(--st-surface)',
  borderRadius: 'var(--st-radius-card)',
};

/**
 * Les cartes, dans une bande qui glisse à toutes les largeurs : une carte et
 * demie sur téléphone, deux sur tablette, trois sur ordinateur, et des flèches
 * dès que la bande déborde (`ReviewSlider`).
 */
function ProofCards({ items, label }: { items: Proof[]; label: string }) {
  return (
    <ReviewSlider label={label}>
      {items.map((p) => (
        <li key={p.key} className={SLIDE_ITEM}>
          <figure className="flex h-full flex-col gap-3 border p-5" style={CARD}>
            <Stars rating={p.rating} />

            {p.text && (
              <blockquote className="text-[14px] leading-relaxed text-[var(--st-ink-2)]">
                « {p.text} »
              </blockquote>
            )}

            <figcaption className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-1 text-[13px]">
              <span className="font-semibold text-[var(--st-ink)]">{p.author}</span>
              {p.verified && <Verified />}
              {p.subject && (
                <span className="w-full text-[12px] text-[var(--st-ink-3)]">{p.subject}</span>
              )}
            </figcaption>
          </figure>
        </li>
      ))}
    </ReviewSlider>
  );
}

/**
 * La première citation en grand, les suivantes dans une bande qui glisse dessous.
 *
 * Aucun cadre, aucune ombre : sur un gabarit éditorial, une citation encadrée
 * se lit comme un encart publicitaire. Ce qui la tient est le filet au-dessus
 * du nom et l'air autour — la même grammaire que `PresentationSection`.
 */
function ProofEditorial({ items, label }: { items: Proof[]; label: string }) {
  const [lead, ...rest] = items;
  if (!lead) return null;

  return (
    <div>
      <figure className="mx-auto max-w-3xl text-center">
        <div className="flex justify-center">
          <Stars rating={lead.rating} />
        </div>

        {lead.text && (
          <blockquote
            className="mt-5 text-[var(--st-ink)]"
            style={{
              fontFamily:    'var(--st-font-heading)',
              // Entre le titre de section et le corps de texte : la citation
              // doit peser plus qu'un paragraphe sans concurrencer le titre.
              fontSize:      'clamp(19px, 2.4vw, 26px)',
              fontWeight:    500,
              lineHeight:    1.45,
              letterSpacing: 'var(--st-tracking)',
            }}
          >
            « {lead.text} »
          </blockquote>
        )}

        <figcaption className="mt-7 flex flex-col items-center gap-2 text-[13px]">
          <span className="h-px w-10" style={{ background: 'var(--st-border)' }} aria-hidden />
          <span className="font-semibold text-[var(--st-ink)]">{lead.author}</span>
          <span className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[var(--st-ink-3)]">
            {lead.verified && <Verified />}
            {lead.subject && <span className="text-[12px]">{lead.subject}</span>}
          </span>
        </figcaption>
      </figure>

      {rest.length > 0 && (
        <div className="mx-auto mt-14 max-w-5xl">
          <ReviewSlider label={label}>
            {rest.map((p) => (
              <li key={p.key} className={SLIDE_ITEM}>
                <Stars rating={p.rating} size={3.5} />
                {p.text && (
                  <blockquote className="mt-3 text-[14px] leading-relaxed text-[var(--st-ink-2)]">
                    « {p.text} »
                  </blockquote>
                )}
                <p className="mt-3 text-[13px] font-semibold text-[var(--st-ink)]">{p.author}</p>
                {p.verified && (
                  <p className="mt-1 flex text-[12px]"><Verified /></p>
                )}
              </li>
            ))}
          </ReviewSlider>
        </div>
      )}
    </div>
  );
}

/**
 * La bande du volume : la même bande que `cards`, mais nourrie de neuf avis
 * au moins (voir `limit` plus bas) — c'est le défilement qui dit « beaucoup
 * de monde ». Sans le produit noté : sur un volume, il alourdirait chaque carte.
 */
function ProofBand({ items, label }: { items: Proof[]; label: string }) {
  return (
    <ReviewSlider label={label}>
      {items.map((p) => (
        <li key={p.key} className={SLIDE_ITEM}>
          <figure className="flex h-full flex-col gap-3 border p-5" style={CARD}>
            <Stars rating={p.rating} />
            {p.text && (
              <blockquote className="text-[14px] leading-relaxed text-[var(--st-ink-2)]">
                « {p.text} »
              </blockquote>
            )}
            <figcaption className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-1 text-[13px]">
              <span className="font-semibold text-[var(--st-ink)]">{p.author}</span>
              {p.verified && <Verified />}
            </figcaption>
          </figure>
        </li>
      ))}
    </ReviewSlider>
  );
}

/**
 * Des lignes, pas des cartes.
 *
 * L'acheteur professionnel — un lot de bétail, un téléphone qu'il compare —
 * vérifie une liste de références avant de lire un récit. Le nom et ce qui a
 * été commandé tiennent à gauche, la note et le mois à droite : c'est la forme
 * d'un relevé, et elle se parcourt en diagonale.
 */
function ProofLedger({ items }: { items: Proof[] }) {
  return (
    <ul
      className="mx-auto max-w-3xl border-y"
      style={{ borderColor: 'var(--st-border)' }}
    >
      {items.map((p, i) => {
        const month = monthOf(p.date);
        return (
          <li
            key={p.key}
            className={i > 0 ? 'border-t' : undefined}
            style={i > 0 ? { borderColor: 'var(--st-border)' } : undefined}
          >
            <figure className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 py-5">
              <div className="min-w-0 flex-1 basis-[60%]">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px]">
                  <span className="font-semibold text-[var(--st-ink)]">{p.author}</span>
                  {p.verified && <span className="text-[12px]"><Verified /></span>}
                </p>
                {p.subject && (
                  <p className="mt-1 text-[13px] text-[var(--st-ink-3)]">{p.subject}</p>
                )}
                {p.text && (
                  <blockquote className="mt-2 text-[14px] leading-relaxed text-[var(--st-ink-2)]">
                    {p.text}
                  </blockquote>
                )}
              </div>

              <figcaption className="flex flex-shrink-0 flex-col items-start gap-1 sm:items-end">
                <Stars rating={p.rating} size={3.5} />
                {month && (
                  <span className="text-[12px] text-[var(--st-ink-3)]">{month}</span>
                )}
              </figcaption>
            </figure>
          </li>
        );
      })}
    </ul>
  );
}

// ── La section ──────────────────────────────────────────────────────────────

export function TestimonialsSection({ store, section, data, design }: SectionProps) {
  // La bande vit du nombre : trois avis y feraient une bande qui ne défile pas.
  // Elle prend donc plus large que la limite réglée par le marchand, sans jamais
  // dépasser ce que la page a réellement.
  const limit = design.proof === 'band'
    ? Math.max(section.config.limit, 9)
    : section.config.limit;

  const real: Proof[] = data.reviews.slice(0, limit).map((review) => ({
    key:      review.id,
    rating:   review.rating,
    text:     review.body?.trim() ?? '',
    author:   review.author_name,
    verified: true,
    subject:  review.product_name,
    date:     review.created_at,
  }));

  // Les citations du marchand ne servent que tant qu'aucun vrai avis n'existe.
  const fallback: Proof[] = real.length === 0 && store.theme.socialProof.enabled
    ? store.theme.socialProof.items.map((quote, i) => ({
        key:      `quote-${i}`,
        rating:   quote.rating,
        text:     quote.text.trim(),
        author:   quote.author,
        verified: false,
        subject:  null,
        date:     null,
      }))
    : [];

  const items = real.length > 0 ? real : fallback;
  if (items.length === 0) return null;

  const title = sectionTitle(section, store.templateId) || store.theme.socialProof.title;

  // Une seule citation ne fait ni une bande ni un relevé : les deux formes
  // supposent une liste à parcourir, et une liste d'un élément se lit comme une
  // page à moitié chargée. Elle passe en éditorial, qui est la forme d'UNE
  // citation.
  const style = items.length === 1 && (design.proof === 'band' || design.proof === 'ledger')
    ? 'editorial'
    : design.proof;

  const body = (
    <Section design={design} label={title}>
      <SectionHeader
        design={design}
        title={title}
        eyebrow="La preuve"
        align={style === 'editorial' || style === 'ledger' ? 'center' : 'left'}
      />

      {style === 'editorial' ? <ProofEditorial items={items} label={title} />
        : style === 'band'   ? <ProofBand items={items} label={title} />
        : style === 'ledger' ? <ProofLedger items={items} />
        : <ProofCards items={items} label={title} />}
    </Section>
  );

  return design.reveal ? <FadeIn>{body}</FadeIn> : body;
}
