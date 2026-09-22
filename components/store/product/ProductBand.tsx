'use client';

// ─────────────────────────────────────────────────────────────────────────────
// La bande de marque, sous la fiche
//
// Les vingt-trois maquettes la posent toutes, et toutes au même endroit : en
// PLEINE LARGEUR, sous les onglets, un aplat sombre avec un titre, une phrase
// et un bouton. « L'élégance au-delà du temps », « Une peau saine,
// naturellement », « Le goût authentique de nos terres ».
//
// ── Ce qui a changé, et pourquoi ───────────────────────────────────────────
//
// Elle vivait sous la GALERIE, en petite carte claire. C'était une réponse à
// un vrai défaut, mesuré le 19/09/2026 : la colonne de gauche s'arrêtait
// 500 px avant celle d'achat, et la moitié de l'écran était vide au moment où
// l'acheteur hésite. La carte bouchait le trou.
//
// Mais elle le bouchait en sacrifiant ce qu'elle porte. À 40 % d'une colonne,
// l'histoire du marchand est une note de bas de page ; les maquettes en font
// le seul moment de la fiche où la BOUTIQUE parle d'elle-même, et ce moment a
// besoin de la largeur pour exister. Le trou de la colonne gauche reste un
// défaut — c'est un problème de galerie, et c'est là qu'il se réglera.
//
// ── Ce qu'elle n'invente pas ───────────────────────────────────────────────
//
// `theme.brandStory` : le titre, le texte et la photo que le marchand a écrits
// une fois pour sa page d'accueil. Rien n'est rédigé pour la fiche, rien n'est
// répété — `brand_story` ne fait partie des sections reprises sous la fiche
// d'aucun gabarit (`pdpSectionsFor`). Vide, la bande n'existe pas.
//
// Le texte est COUPÉ, et le bouton mène à « À propos » où il se lit en entier.
// Une fiche produit n'est pas l'endroit où l'on raconte tout : c'est l'endroit
// où l'on donne une raison de faire confiance, puis où l'on rend la main.
//
// ── La couleur ─────────────────────────────────────────────────────────────
//
// `--st-primary`, comme le pied de page : c'est par contrat la couleur de
// STRUCTURE du gabarit, et l'encre vient de `readableInk()`. La bande sort donc
// vert bouteille chez Style Chic et brune chez Artisan sans qu'une seule ligne
// ne nomme un gabarit. Sur une photo, l'aplat devient un voile — le même ton,
// à travers lequel la photo se voit.
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
      <MerchantHint title="Votre histoire, en bas de fiche" where="Éditeur → Contenu → Notre histoire">
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
      className="relative mt-16 overflow-hidden"
      style={{ background: 'var(--st-primary)', borderRadius: 'var(--st-radius-card)' }}
    >
      {story.imageUrl && (
        <>
          <StoreImage
            src={story.imageUrl}
            alt=""
            sizes={IMAGE_SIZES.editorial}
            className="object-cover"
          />
          {/* Le voile, et non un noir neutre : la bande garde la couleur du
              gabarit, la photo garde sa lisibilité, et le texte garde son
              contraste sans qu'on ait à choisir une photo claire. */}
          <div
            className="absolute inset-0"
            style={{ background: 'var(--st-primary)', opacity: 0.82 }}
            aria-hidden
          />
        </>
      )}

      {/* La colonne de texte s'arrête avant la moitié : une ligne de 1 100 px
          ne se lit pas, et la photo doit rester visible à droite. */}
      <div className="relative px-6 py-12 sm:px-10 sm:py-16">
        <div className="max-w-xl">
          <h2
            style={{
              fontFamily: 'var(--st-font-heading)',
              fontSize:   'var(--st-h2)',
              fontWeight: 600,
              lineHeight: 1.15,
              color:      'var(--st-primary-ink)',
            }}
          >
            {title}
          </h2>
          <p
            className="mt-3 whitespace-pre-line text-[15px] leading-relaxed"
            style={{ color: 'var(--st-primary-ink)', opacity: 0.82 }}
          >
            {short}
          </p>
          <Link
            href={`${store.base}/a-propos`}
            className="mt-6 inline-flex min-h-[44px] items-center gap-2 px-5 text-[14px] font-semibold transition hover:brightness-95"
            style={{
              background:   'var(--st-accent)',
              color:        'var(--st-accent-ink)',
              borderRadius: 'var(--st-radius-btn)',
            }}
          >
            Découvrir notre histoire
            <ArrowRight className="h-4 w-4" strokeWidth={2.2} aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  );
}
