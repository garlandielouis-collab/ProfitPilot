'use client';

// ─────────────────────────────────────────────────────────────────────────────
// La vidéo du marchand, chargée seulement si on la regarde
//
// Un lecteur YouTube embarqué pèse plusieurs centaines de kilo-octets et pose
// ses cookies avant même qu'on ait cliqué. Sur une connexion haïtienne, cela se
// paie en secondes d'attente sur une page que la plupart des visiteurs
// parcourent sans jamais lancer la vidéo.
//
// Donc : une façade — l'affiche du gabarit, un bouton de lecture — et l'iframe
// n'arrive qu'au clic. C'est le motif « lite embed », et il ne coûte rien à
// celui qui ne regarde pas.
//
// Un lien qui n'est ni YouTube ni Vimeo n'est pas deviné : il s'ouvre chez son
// hébergeur, dans un onglet. Mieux vaut un lien honnête qu'un cadre vide.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { Play, ExternalLink } from 'lucide-react';

type Source = { kind: 'youtube' | 'vimeo'; embed: string } | { kind: 'link' };

export function parseVideo(url: string): Source {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');

    if (host === 'youtu.be') {
      const id = u.pathname.slice(1);
      if (id) return { kind: 'youtube', embed: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1` };
    }
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
      const id =
        u.searchParams.get('v')
        ?? (u.pathname.startsWith('/embed/')  ? u.pathname.slice(7)  : null)
        ?? (u.pathname.startsWith('/shorts/') ? u.pathname.slice(8)  : null);
      if (id) return { kind: 'youtube', embed: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1` };
    }
    if (host === 'vimeo.com' || host === 'player.vimeo.com') {
      const id = u.pathname.split('/').filter(Boolean).pop();
      if (id && /^\d+$/.test(id)) return { kind: 'vimeo', embed: `https://player.vimeo.com/video/${id}?autoplay=1` };
    }
  } catch {
    // Une adresse illisible retombe sur le lien : le schéma du thème a déjà
    // refusé tout ce qui n'est pas une URL.
  }
  return { kind: 'link' };
}

export function VideoEmbed({
  url, title, poster,
}: {
  url:    string;
  title:  string;
  /** L'affiche posée derrière le bouton de lecture. */
  poster?: string | null;
}) {
  const [playing, setPlaying] = useState(false);
  const source = parseVideo(url);

  if (source.kind === 'link') {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex min-h-[48px] items-center gap-2 px-6 text-[14px] font-semibold"
        style={{
          background:   'var(--st-accent)',
          color:        'var(--st-accent-ink)',
          borderRadius: 'var(--st-radius-btn)',
        }}
      >
        <ExternalLink className="h-4 w-4" strokeWidth={2} aria-hidden />
        Voir la vidéo
      </a>
    );
  }

  return (
    <div
      className="relative isolate w-full overflow-hidden"
      style={{ aspectRatio: '16 / 9', borderRadius: 'var(--st-radius-card)', background: 'var(--st-primary)' }}
    >
      {playing ? (
        <iframe
          src={source.embed}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 h-full w-full"
          style={{ border: 0 }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          aria-label={`Lire la vidéo : ${title}`}
          className="group absolute inset-0 flex h-full w-full items-center justify-center"
        >
          {poster && (
            // eslint-disable-next-line @next/next/no-img-element -- affiche décorative servie par nous
            <img src={poster} alt="" className="absolute inset-0 h-full w-full object-cover" />
          )}
          <span className="absolute inset-0" style={{ background: 'rgba(14,24,34,0.42)' }} aria-hidden />
          <span
            className="relative flex h-16 w-16 items-center justify-center rounded-full transition group-hover:scale-105"
            style={{ background: 'var(--st-accent)', color: 'var(--st-accent-ink)' }}
          >
            <Play className="h-7 w-7 translate-x-0.5" strokeWidth={2} fill="currentColor" aria-hidden />
          </span>
        </button>
      )}
    </div>
  );
}
