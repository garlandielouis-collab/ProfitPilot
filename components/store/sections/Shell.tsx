// ─────────────────────────────────────────────────────────────────────────────
// L'enveloppe d'une section
//
// Le rythme vertical d'une page marchande n'est pas décoratif : c'est lui qui
// dit où une idée s'arrête et où la suivante commence. Une boutique éditoriale
// respire à cent pixels entre deux sections, un catalogue dense à trente-deux.
// Écrire `py-14` dans trente et une sections fige ce rythme pour tous les gabarits — et
// c'était le cas.
//
// Ici, l'espacement vient de `--st-section-y`, posé par le gabarit. Une section
// n'a plus le droit d'avoir un avis sur sa propre hauteur.
//
// Le titre suit la même règle : sa taille, sa casse et son lettrage viennent du
// profil. Un sur-titre — « Sélection », « Nouveautés » — n'apparaît que sur les
// gabarits éditoriaux, où il fait partie de la grammaire ; ailleurs, il
// n'ajoute qu'une ligne.
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link';
import type { DesignProfile } from '../../../lib/storeDesign';

export function Section({
  design, children, className, tone = 'surface', id, label, full = false,
}: {
  design:   DesignProfile;
  children: React.ReactNode;
  className?: string;
  /** `surface2` alterne le fond pour séparer deux blocs sans trait de séparation. */
  tone?: 'surface' | 'surface-2' | 'primary' | 'none';
  id?: string;
  label?: string;
  /** Vrai quand le contenu doit toucher les bords de l'écran. */
  full?: boolean;
}) {
  const background =
    tone === 'surface'    ? 'var(--st-surface)'
    : tone === 'surface-2' ? 'var(--st-surface-2)'
    : tone === 'primary'   ? 'var(--st-primary)'
    : undefined;

  return (
    <section
      id={id}
      aria-label={label}
      style={{
        background,
        paddingTop:    'var(--st-section-y)',
        paddingBottom: 'var(--st-section-y)',
      }}
      className={`st-section ${className ?? ''}`}
    >
      <div className={full ? '' : 'mx-auto max-w-6xl px-4 sm:px-6'}>{children}</div>
    </section>
  );
}

/**
 * L'en-tête d'une section : sur-titre, titre, et le lien « tout voir ».
 *
 * Le lien est aligné sur la ligne de base du titre et non centré verticalement :
 * deux textes de tailles différentes alignés au milieu paraissent toujours
 * décalés, et l'œil le voit sans savoir le nommer.
 */
export function SectionHeader({
  design, title, eyebrow, href, hrefLabel = 'Tout voir', align = 'left', description,
}: {
  design:  DesignProfile;
  title:   string;
  eyebrow?: string;
  href?:   string;
  hrefLabel?: string;
  align?:  'left' | 'center';
  description?: string;
}) {
  if (!title) return null;

  const centered = align === 'center';

  return (
    <div
      className={[
        'mb-8 flex gap-4',
        centered ? 'flex-col items-center text-center' : 'items-baseline justify-between',
      ].join(' ')}
    >
      <div className={centered ? 'max-w-2xl' : 'min-w-0'}>
        {design.type.eyebrow && eyebrow && (
          <p
            className="mb-2 text-[11px] font-semibold uppercase text-[var(--st-ink-3)]"
            style={{ letterSpacing: '0.18em' }}
          >
            {eyebrow}
          </p>
        )}
        <h2
          className="text-[var(--st-ink)]"
          style={{
            fontFamily:     'var(--st-font-heading)',
            fontSize:       'var(--st-h2)',
            fontWeight:     design.type.upper ? 500 : 600,
            letterSpacing:  'var(--st-tracking)',
            textTransform:  design.type.upper ? 'uppercase' : undefined,
            lineHeight:     1.2,
          }}
        >
          {title}
        </h2>
        {description && (
          <p className="mt-2 text-[14px] leading-relaxed text-[var(--st-ink-2)]">{description}</p>
        )}
      </div>

      {href && !centered && (
        <Link
          href={href}
          className="flex min-h-[44px] flex-shrink-0 items-center text-[13px] font-semibold text-[var(--st-ink-2)] underline-offset-4 transition hover:text-[var(--st-ink)] hover:underline"
        >
          {hrefLabel}
        </Link>
      )}
    </div>
  );
}
