// ─────────────────────────────────────────────────────────────────────────────
// Les squelettes de chargement (§28)
//
// Ils ne servent pas à « faire joli pendant que ça charge ». Ils servent à
// répondre à la question que se pose le visiteur pendant les deux secondes où
// rien n'apparaît : est-ce que la page arrive, ou est-ce qu'elle est cassée ?
//
// C'est une question réelle ici : le projet Supabase du plan gratuit se met en
// veille entre deux pics, et le premier visiteur de la journée attend le réveil
// de la base. Sans squelette, il voit un écran blanc et il part.
//
// Deux règles :
//
//   La forme du squelette est celle du contenu qui arrive. Un rectangle au
//   format d'une carte produit, dans la grille du gabarit — pas trois barres
//   génériques qui n'annoncent rien.
//
//   Pas d'animation qui pulse au-delà du raisonnable. Le layout de la vitrine
//   coupe les animations sous `prefers-reduced-motion`, et un scintillement
//   rapide sur tout un écran fatigue plus qu'il ne rassure.
// ─────────────────────────────────────────────────────────────────────────────

function Block({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`animate-pulse ${className ?? ''}`}
      style={{ background: 'var(--st-surface-2)', ...style }}
      aria-hidden
    />
  );
}

/** Une grille de cartes fantômes, au rapport d'image du gabarit. */
export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div
      className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4"
      style={{ gap: 'var(--st-grid-gap, 20px)' }}
    >
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex flex-col gap-3">
          <Block
            className="w-full"
            style={{
              aspectRatio:  'var(--st-media-ratio, 1 / 1)',
              borderRadius: 'var(--st-radius-media, 12px)',
            }}
          />
          <Block className="h-3.5 w-4/5 rounded" />
          <Block className="h-4 w-1/3 rounded" />
        </div>
      ))}
    </div>
  );
}

/** L'écran d'attente d'une page de catalogue. */
export function CatalogSkeleton() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12" aria-busy="true" aria-live="polite">
      <span className="sr-only">Chargement du catalogue…</span>
      <Block className="mb-3 h-3 w-40 rounded" />
      <Block className="mb-8 h-7 w-56 rounded" />
      <div className="flex flex-col gap-10 lg:flex-row">
        <div className="hidden w-60 flex-shrink-0 flex-col gap-4 lg:flex">
          {Array.from({ length: 5 }, (_, i) => <Block key={i} className="h-10 w-full rounded" />)}
        </div>
        <div className="flex-1">
          <ProductGridSkeleton />
        </div>
      </div>
    </div>
  );
}

/** L'écran d'attente d'une fiche produit. */
export function ProductSkeleton() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12" aria-busy="true" aria-live="polite">
      <span className="sr-only">Chargement du produit…</span>
      <Block className="mb-6 h-3 w-52 rounded" />
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
        <Block
          className="w-full"
          style={{
            aspectRatio:  'var(--st-media-ratio, 1 / 1)',
            borderRadius: 'var(--st-radius-card, 14px)',
          }}
        />
        <div className="flex flex-col gap-4">
          <Block className="h-3 w-24 rounded" />
          <Block className="h-8 w-4/5 rounded" />
          <Block className="h-9 w-40 rounded" />
          <Block className="mt-2 h-3 w-full rounded" />
          <Block className="h-3 w-11/12 rounded" />
          <Block className="h-3 w-3/4 rounded" />
          <Block className="mt-6 h-14 w-full rounded" />
        </div>
      </div>
    </div>
  );
}

/** L'écran d'attente de la page d'accueil. */
export function HomeSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Chargement de la boutique…</span>
      <Block className="h-[46vh] max-h-[420px] w-full" />
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <Block className="mb-8 h-7 w-52 rounded" />
        <ProductGridSkeleton count={4} />
      </div>
    </div>
  );
}
