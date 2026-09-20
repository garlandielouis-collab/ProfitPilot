'use client';

// ─────────────────────────────────────────────────────────────────────────────
// La bande sous la galerie
//
// ── Le défaut qu'elle corrige ──────────────────────────────────────────────
//
// Mesuré le 19/09/2026 sur la fiche de plusieurs gabarits, à 1440 px : la
// colonne de gauche s'arrêtait à la fin de la galerie, la colonne d'achat
// continuait sur 500 px de plus. La moitié gauche de l'écran — celle où
// l'acheteur regarde le produit — était vide au moment où il hésite.
//
// ── Ce qu'elle met dedans, et ce qu'elle n'invente pas ─────────────────────
//
// L'histoire du marchand, `theme.brandStory` : un titre, un paragraphe, une
// photo. Écrite une fois pour la page d'accueil, elle sert ici la question qui
// reste quand le prix est lu — « à qui j'achète ? ». Rien n'est rédigé pour la
// fiche, rien n'est répété : `brand_story` ne fait partie des sections
// reprises sous la fiche d'aucun gabarit (`pdpSectionsFor`).
//
// Le corps est COUPÉ à quelques lignes, et le lien mène à « À propos » où il se
// lit en entier. Une fiche produit n'est pas l'endroit où l'on raconte tout :
// c'est l'endroit où l'on donne une raison de faire confiance, puis où l'on
// rend la main au bouton d'achat.
//
// Vide, la bande n'existe pas — et le marchand la voit en gris dans son
// éditeur, avec l'adresse où la remplir.
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { StoreImage } from '../blocks/StoreImage';
import { MerchantHint } from './MerchantHint';
import { IMAGE_SIZES } from '../../../lib/storeImage';
import type { StoreView } from '../types';

/** Le nombre de caractères au-delà duquel le récit part sur « À propos ». */
const CUT = 240;

export function ProductBand({ store }: { store: StoreView }) {
  const story = store.theme.brandStory;
  const title = story.title?.trim() || 'Notre histoire';
  const body  = story.body?.trim() || '';

  if (!story.enabled || !body) {
    return (
      <MerchantHint title="Votre histoire, sous la photo" where="Éditeur → Contenu → Notre histoire">
        <p className="text-[14px] leading-relaxed text-[var(--st-ink-2)]">
          Dites en trois phrases qui vous êtes et pourquoi vous vendez ceci.
          C'est ce que lit l'acheteur juste avant de se décider.
        </p>
      </MerchantHint>
    );
  }

  const short = body.length > CUT ? `${body.slice(0, CUT).trimEnd()}…` : body;

  return (
    <section
      className="mt-6 overflow-hidden"
      style={{ background: 'var(--st-surface-2)', borderRadius: 'var(--st-radius-card)' }}
    >
      <div className="flex flex-col sm:flex-row">
        {story.imageUrl && (
          <div className="relative w-full flex-shrink-0 sm:w-[38%]">
            {/* La photo garde un rapport fixe : sans lui, une image haute
                étirerait la bande et rouvrirait le vide qu'elle vient de
                combler. */}
            <div className="relative aspect-[4/3] h-full w-full sm:aspect-auto sm:min-h-[168px]">
              <StoreImage
                src={story.imageUrl}
                alt=""
                sizes={IMAGE_SIZES.editorial}
                className="object-cover"
              />
            </div>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col justify-center gap-2 p-5 sm:p-6">
          <h2
            className="text-[var(--st-ink)]"
            style={{
              fontFamily: 'var(--st-font-heading)',
              fontSize:   'var(--st-h3)',
              fontWeight: 600,
            }}
          >
            {title}
          </h2>
          <p className="whitespace-pre-line text-[14px] leading-relaxed text-[var(--st-ink-2)]">
            {short}
          </p>
          {body.length > CUT && (
            <Link
              href={`${store.base}/a-propos`}
              className="mt-1 inline-flex items-center gap-1.5 text-[13px] font-semibold text-[var(--st-ink)] underline-offset-4 hover:underline"
            >
              Lire la suite
              <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden />
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
