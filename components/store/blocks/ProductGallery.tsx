'use client';

// ─────────────────────────────────────────────────────────────────────────────
// La galerie d'une fiche produit
//
// C'est l'endroit où l'on décide d'acheter un objet qu'on ne peut pas toucher.
// Le §16 en demande quatre choses : une image principale, des vignettes, un
// zoom, et une navigation. Elle en avait deux.
//
// ── Le zoom ────────────────────────────────────────────────────────────────
//
// Sur grand écran, la loupe suit le pointeur : on déplace la souris sur
// l'image, le cadre montre la zone survolée agrandie deux fois. Pas de fenêtre
// modale, pas de second chargement — c'est la même image, agrandie par
// `background-size`. Le geste est celui qu'on fait dans une boutique : on
// rapproche l'objet de son œil.
//
// Sur mobile, où il n'y a pas de pointeur, le zoom est un plein écran au
// toucher : c'est le geste natif, et une loupe qui suit le doigt cache
// justement ce que le doigt vise.
//
// ── Les vignettes ──────────────────────────────────────────────────────────
//
// Elles ne s'affichent qu'à partir de deux images. Une seule vignette sous une
// image unique n'indique rien et vole une ligne. Elles se parcourent aux
// flèches du clavier, et l'image active est annoncée aux lecteurs d'écran par
// `aria-current` — pas seulement par une bordure, que personne d'autre ne voit.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ZoomIn, X } from 'lucide-react';
import { ProductMedia } from './ProductMedia';
import { StoreImage } from './StoreImage';
import { IMAGE_SIZES } from '../../../lib/storeImage';
import type { MediaRule } from '../../../lib/storeDesign';

export function ProductGallery({
  images, alt, rule,
}: {
  images: string[];
  alt:    string;
  rule:   MediaRule;
}) {
  const [index, setIndex]       = useState(0);
  const [zoomed, setZoomed]     = useState(false);
  const [origin, setOrigin]     = useState('50% 50%');
  const [fullscreen, setFullscreen] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);

  const active = images[index] ?? null;

  useEffect(() => { setIndex(0); }, [images.length]);

  useEffect(() => {
    if (!fullscreen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setFullscreen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', onKey);
    };
  }, [fullscreen]);

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setOrigin(`${Math.max(0, Math.min(100, x))}% ${Math.max(0, Math.min(100, y))}%`);
  }

  function step(delta: number) {
    setIndex((i) => (i + delta + images.length) % images.length);
  }

  return (
    // ── Où vont les vignettes ──────────────────────────────────────────────
    //
    // À gauche de la photo dès qu'il y a de la largeur, comme sur les maquettes
    // et comme partout ailleurs en commerce en ligne : la bande horizontale
    // posée SOUS l'image repoussait le prix et le bouton d'achat de soixante-dix
    // pixels vers le bas, sur l'écran où ils doivent être vus en premier.
    //
    // `flex-row-reverse` met le rail à gauche sans toucher à l'ordre du
    // document : la photo principale reste le premier élément lu, et sur
    // téléphone — où un rail vertical prendrait un cinquième de la largeur de
    // l'image — les vignettes retombent en bande sous la photo.
    <div className="flex flex-col gap-3 sm:flex-row-reverse sm:items-start sm:gap-4">
      <div
        ref={frameRef}
        className="group relative min-w-0 flex-1"
        onMouseEnter={() => setZoomed(true)}
        onMouseLeave={() => setZoomed(false)}
        onMouseMove={onMove}
      >
        <ProductMedia
          src={active}
          alt={alt}
          rule={rule}
          sizes={IMAGE_SIZES.gallery}
          priority
          radius="var(--st-radius-card)"
          className="border"
          imageClassName={zoomed ? 'opacity-0' : 'opacity-100 transition-opacity duration-200'}
        >
          {/* Le calque de zoom : la même image, posée en fond et agrandie deux
              fois autour du point survolé. Elle n'existe que sur les écrans qui
              ont un pointeur — d'où le `hidden sm:block`. */}
          {active && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 hidden opacity-0 transition-opacity duration-200 group-hover:opacity-100 sm:block"
              style={{
                backgroundImage:    `url(${active})`,
                backgroundSize:     '200%',
                backgroundPosition: origin,
                backgroundRepeat:   'no-repeat',
              }}
            />
          )}

          {/* Le plein écran, pour le tactile. */}
          {active && (
            <button
              type="button"
              onClick={() => setFullscreen(true)}
              aria-label="Agrandir l'image"
              className="absolute bottom-3 right-3 flex h-11 w-11 items-center justify-center backdrop-blur transition"
              style={{
                background: 'color-mix(in srgb, var(--st-surface) 88%, transparent)',
                color:      'var(--st-ink)',
                borderRadius: 'var(--st-radius-btn)',
              }}
            >
              <ZoomIn className="h-5 w-5" strokeWidth={1.8} aria-hidden />
            </button>
          )}

          {/* La navigation image par image, quand il y en a plusieurs. */}
          {images.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => step(-1)}
                aria-label="Image précédente"
                className="absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center backdrop-blur transition sm:opacity-0 sm:group-hover:opacity-100"
                style={{
                  background: 'color-mix(in srgb, var(--st-surface) 88%, transparent)',
                  color: 'var(--st-ink)', borderRadius: '999px',
                }}
              >
                <ChevronLeft className="h-5 w-5" strokeWidth={2} aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => step(1)}
                aria-label="Image suivante"
                className="absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center backdrop-blur transition sm:opacity-0 sm:group-hover:opacity-100"
                style={{
                  background: 'color-mix(in srgb, var(--st-surface) 88%, transparent)',
                  color: 'var(--st-ink)', borderRadius: '999px',
                }}
              >
                <ChevronRight className="h-5 w-5" strokeWidth={2} aria-hidden />
              </button>
            </>
          )}
        </ProductMedia>
      </div>

      {images.length > 1 && (
        <div
          className="flex gap-2 overflow-x-auto pb-1 sm:max-h-[520px] sm:w-[76px] sm:flex-col sm:overflow-x-visible sm:overflow-y-auto sm:pb-0"
          role="tablist"
          aria-label="Images du produit"
        >
          {images.map((src, i) => (
            <button
              key={src}
              type="button"
              role="tab"
              onClick={() => setIndex(i)}
              aria-label={`Image ${i + 1} sur ${images.length}`}
              aria-selected={i === index}
              aria-current={i === index ? 'true' : undefined}
              className="relative h-[72px] w-[72px] flex-shrink-0 overflow-hidden transition"
              style={{
                border: `2px solid ${i === index ? 'var(--st-ink)' : 'var(--st-border)'}`,
                borderRadius: 'var(--st-radius-media)',
                background: 'var(--st-surface-2)',
              }}
            >
              <StoreImage src={src} alt="" sizes={IMAGE_SIZES.thumb} className="object-cover" />
            </button>
          ))}
        </div>
      )}

      {/* ── Plein écran ─────────────────────────────────────────────────── */}
      {fullscreen && active && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0E1822]/95 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={alt}
        >
          <button
            type="button"
            onClick={() => setFullscreen(false)}
            aria-label="Fermer"
            className="absolute right-4 top-4 flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white"
          >
            <X className="h-6 w-6" strokeWidth={1.9} aria-hidden />
          </button>

          {/* eslint-disable-next-line @next/next/no-img-element -- affichage plein écran, dimensions inconnues */}
          <img
            src={active}
            alt={alt}
            className="max-h-full max-w-full object-contain"
          />

          {images.length > 1 && (
            <div className="absolute inset-x-0 bottom-6 flex justify-center gap-2">
              {images.map((src, i) => (
                <button
                  key={src}
                  type="button"
                  onClick={() => setIndex(i)}
                  aria-label={`Image ${i + 1}`}
                  className="h-2.5 w-2.5 rounded-full transition"
                  style={{ background: i === index ? '#FFFFFF' : 'rgba(255,255,255,0.4)' }}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
