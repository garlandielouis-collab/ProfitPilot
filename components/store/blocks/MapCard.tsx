// ─────────────────────────────────────────────────────────────────────────────
// Le plan de la boutique
//
// ── Ce que cette carte est, et ce qu'elle n'est pas ────────────────────────
//
// Ce n'est PAS le quartier du marchand. C'est un plan dessiné — des voies, un
// îlot, une eau — aux couleurs du gabarit, qui porte la puce et l'adresse
// RÉELLES, et qui ouvre la vraie cartographie au clic. Elle joue le rôle que
// joue une carte dans une page de contact : dire « on est quelque part, voici
// où », et donner le chemin d'un doigt.
//
// Le choix est assumé et il a deux raisons.
//
// La première est qu'un plan exact coûte une clé d'API Google, une facturation
// activée, et un chargement de Google chez chaque visiteur de chaque vitrine —
// pour une image que personne ne fait défiler. La seconde est que le §2 de la
// constitution interdit d'AFFICHER un chiffre ou une donnée qui ne soit pas
// celle du marchand : un plan qui montrerait un autre quartier que le sien,
// lui, mentirait. Celui-ci ne prétend rien — il se lit comme la vignette
// qu'il est, et tout ce qu'il affirme (le nom du lieu) vient de la base.
//
// ── Le jour où une vraie carte sera voulue ─────────────────────────────────
//
// Ce composant est la seule chose à remplacer : il prend une adresse, il rend
// un cadre cliquable. Rien d'autre dans la vitrine ne sait comment un plan se
// dessine.
// ─────────────────────────────────────────────────────────────────────────────

import { MapPin, ExternalLink } from 'lucide-react';

/** L'adresse, telle qu'un moteur de cartes la cherche. */
export function mapsHref(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

/**
 * Le tracé.
 *
 * Il ne bouge pas d'une vitrine à l'autre — ce sont les couleurs qui changent,
 * et elles viennent des jetons du gabarit. Un `viewBox` sans dimension fixe :
 * la carte s'étire à la hauteur qu'on lui donne, du bandeau au cadre mobile.
 */
function Plan() {
  return (
    <svg
      viewBox="0 0 400 260"
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 h-full w-full"
      aria-hidden
    >
      {/* Le sol. */}
      <rect width="400" height="260" fill="var(--st-surface-2)" />

      {/* L'eau : un gabarit côtier, ce qui est le cas de toutes les villes
          haïtiennes où une boutique ouvre. */}
      <path
        d="M0 214c46 10 78-4 124-2s72 16 118 12 98-20 158-8v44H0Z"
        fill="var(--st-primary)"
        opacity="0.13"
      />

      {/* Deux îlots bâtis, en retrait : ils donnent au plan sa densité sans
          attirer l'œil, qui doit aller à la puce. */}
      <g fill="var(--st-ink)" opacity="0.06">
        <rect x="36"  y="44"  width="86" height="58" rx="3" />
        <rect x="232" y="30"  width="72" height="46" rx="3" />
        <rect x="286" y="132" width="78" height="54" rx="3" />
        <rect x="56"  y="140" width="58" height="42" rx="3" />
      </g>

      {/* Les voies. Deux axes larges, trois rues plus fines : c'est ce rapport
          d'épaisseurs qui fait lire un plan plutôt qu'une grille. */}
      <g stroke="var(--st-ink)" fill="none" strokeLinecap="round">
        <g opacity="0.14" strokeWidth="9">
          <path d="M-10 118h420" />
          <path d="M196 -10c6 80-10 130 4 280" />
        </g>
        <g opacity="0.09" strokeWidth="4">
          <path d="M-10 62h200" />
          <path d="M210 76h200" />
          <path d="M92 -10v128" />
          <path d="M300 122v148" />
          <path d="M-10 176h206" />
        </g>
      </g>
    </svg>
  );
}

/**
 * La vignette complète : le plan, la puce posée dessus, et le bouton qui ouvre
 * la vraie carte.
 *
 * Tout le cadre est cliquable et c'est un `a` : la cible fait la carte entière
 * sur téléphone, là où viser un bouton de 32 pixels au pouce est une épreuve.
 * Le bouton reste visible parce qu'il DIT ce que le clic fait — sans lui, un
 * plan décoratif ne se devine pas cliquable.
 */
export function MapCard({
  address, className, height = 'h-[200px]',
}: {
  address: string;
  className?: string;
  /** La hauteur du cadre, en classes Tailwind. */
  height?: string;
}) {
  if (!address.trim()) return null;

  return (
    <a
      href={mapsHref(address)}
      target="_blank"
      rel="noopener noreferrer"
      className={`group relative block overflow-hidden border transition hover:shadow-md ${height} ${className ?? ''}`}
      style={{ borderColor: 'var(--st-border)', borderRadius: 'var(--st-radius-card)' }}
    >
      <Plan />

      {/* La puce et le nom du lieu : la seule information que cette carte
          affirme, et elle vient de la base. */}
      <span className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2">
        <span
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full shadow-md"
          style={{ background: 'var(--st-primary)', color: 'var(--st-primary-ink)' }}
        >
          <MapPin className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
        </span>
        <span
          className="max-w-[210px] truncate px-3 py-1.5 text-[13px] font-semibold shadow-sm"
          style={{
            background:   'var(--st-surface)',
            color:        'var(--st-ink)',
            borderRadius: 'var(--st-radius-btn)',
          }}
        >
          {address}
        </span>
      </span>

      <span
        className="absolute bottom-3 left-3 flex min-h-[36px] items-center gap-1.5 px-3 text-[12px] font-semibold shadow-sm transition group-hover:shadow"
        style={{
          background:   'var(--st-surface)',
          color:        'var(--st-ink-2)',
          borderRadius: 'var(--st-radius-btn)',
        }}
      >
        <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        Voir sur Google Maps
      </span>
    </a>
  );
}
