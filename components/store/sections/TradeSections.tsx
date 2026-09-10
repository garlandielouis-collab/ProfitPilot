// ─────────────────────────────────────────────────────────────────────────────
// Les sections des gabarits métier (§34)
//
// Chiffres, méthode, galerie, demande sur mesure, appel final. Cinq sections
// qui ne servent pas un rayon mais un MÉTIER : elles répondent à des questions
// qu'une grille de produits ne pose jamais.
//
//   Vos chiffres        un prestataire vend un résultat avant de vendre une
//                       séance — et un résultat se chiffre.
//   Comment ça se passe ce qui ne se photographie pas : la méthode, l'atelier,
//                       le déroulé d'une prestation.
//   Galerie             les photos qui ne sont pas des fiches produit. Le
//                       trafic social achète ce qu'il a vu chez quelqu'un.
//   Commande sur mesure ce qu'un panier ne sait pas prendre, faute d'une date
//                       ou d'un nombre de parts.
//   Appel final         une page qui a raconté pendant six sections doit dire
//                       quoi faire ensuite. Une grille de produits, non.
//
// ── La règle, et l'endroit exact où elle a changé ───────────────────────────
//
// Ces sections ne CALCULENT toujours rien. Aucun chiffre n'est dérivé de la
// base : le nombre de clients d'un compte ProfitPilot n'est pas le nombre de
// clients du commerce, et l'écart entre les deux est précisément ce qui rendrait
// le chiffre faux.
//
// Ce qui a changé : elles ne partent plus VIDES. `lib/storeContent.ts` pose un
// texte de démarrage par gabarit, parce que « rien à saisir, rien d'affiché »
// laissait une vitrine neuve à cinq sections sur quatorze — le marchand ne
// voyait pas les autres, donc ne savait pas qu'elles existaient, donc ne les
// remplissait jamais. La règle se retournait contre lui.
//
// La distinction tient en une phrase : un texte de démarrage est un BROUILLON
// que le marchand réécrit ; un chiffre calculé est une AFFIRMATION qu'il ne
// peut pas contredire. Le premier est utile, le second reste interdit.
//
// Reste que `stats` porte des chiffres — « 48 h », « 7j/7 » — et que ceux-là
// engagent le marchand devant ses clients, même écrits en brouillon. Ils sont
// pour cette raison dans `DEMO_SECTIONS`, et se coupent d'un seul geste.
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link';
import { ProductMedia } from '../blocks/ProductMedia';
import { StoreImage } from '../blocks/StoreImage';
import { FadeIn } from '../blocks/FadeIn';
import { Section, SectionHeader } from './Shell';
import { OrderRequestForm } from './OrderRequestForm';
import { sectionTitle } from '../../../lib/storeSections';
import { resolveOrderPhone } from '../../../lib/storeWhatsApp';
import { IMAGE_SIZES } from '../../../lib/storeImage';
import { ART_SLOTS, templateArt } from '../../../lib/storeArt';
import type { SectionProps } from './types';

// ── Vos chiffres ────────────────────────────────────────────────────────────

/**
 * Les chiffres de la preuve — « +200 clients », « 8 ans d'expérience ».
 *
 * Ils sont SAISIS dans l'éditeur, jamais dérivés de la base : le nombre de
 * clients d'un compte ProfitPilot n'est pas le nombre de clients du commerce,
 * et l'écart entre les deux est précisément ce qui rendrait le chiffre faux.
 *
 * La bande se pose juste sous la bannière du gabarit Services. Elle n'a pas de
 * titre : quatre chiffres alignés se lisent sans qu'on les annonce, et un titre
 * au-dessus les repousserait sous la ligne de flottaison sur téléphone.
 */
export function StatsSection({ store, design }: SectionProps) {
  const stats = store.theme.stats;
  const items = stats.items.filter((i) => i.value.trim() && i.label.trim());
  if (!stats.enabled || items.length === 0) return null;

  return (
    <Section design={design} tone="surface-2" label="Nos chiffres">
      <dl
        className={[
          'grid gap-8 text-center',
          items.length === 2 ? 'grid-cols-2'
          : items.length === 3 ? 'grid-cols-1 sm:grid-cols-3'
          : 'grid-cols-2 md:grid-cols-4',
        ].join(' ')}
      >
        {items.map((item, i) => (
          <div key={`${item.value}-${i}`}>
            {/* Le libellé est répété en `sr-only` : à l'œil, la valeur en gros
                et son libellé dessous forment une paire évidente, mais un
                lecteur d'écran qui parcourt une liste de définitions annonce
                d'abord le terme — sans lui, il annonce quatre nombres nus. */}
            <dt className="sr-only">{item.label}</dt>
            <dd>
              <p
                className="tabular-nums text-[var(--st-ink)]"
                style={{
                  fontFamily:    'var(--st-font-heading)',
                  fontSize:      'var(--st-h2)',
                  fontWeight:    600,
                  lineHeight:    1.1,
                  letterSpacing: 'var(--st-tracking)',
                }}
              >
                {item.value}
              </p>
              <p className="mt-2 text-[14px] font-medium text-[var(--st-ink-2)]">{item.label}</p>
              {item.note && (
                <p className="mt-0.5 text-[12px] text-[var(--st-ink-3)]">{item.note}</p>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}

// ── Comment ça se passe ─────────────────────────────────────────────────────

/**
 * La méthode, en trois ou quatre temps.
 *
 * « Choisissez → Réservez → On s'occupe du reste » chez un prestataire,
 * « La matière → L'atelier → La pièce » chez un artisan. C'est le motif qui
 * vend ce qui ne se photographie pas.
 *
 * Le numéro d'étape est décoratif — `aria-hidden`. Un lecteur d'écran qui
 * annonce « zéro un, Choisissez votre formule » fait entendre un identifiant
 * technique là où l'œil voit un repère de lecture ; l'ordre, lui, est déjà
 * porté par la liste ordonnée.
 */
export function ProcessSection({ store, section, design }: SectionProps) {
  const p = store.theme.process;
  const steps = p.steps.filter((s) => s.title.trim());
  if (!p.enabled || steps.length === 0) return null;

  const title = sectionTitle(section, store.templateId) || p.title;

  const body = (
    <Section design={design} label={title}>
      <SectionHeader design={design} title={title} eyebrow="La méthode" align="center" />

      <ol
        className={[
          'grid gap-8',
          steps.length === 2 ? 'sm:grid-cols-2'
          : steps.length === 3 ? 'sm:grid-cols-3'
          : 'sm:grid-cols-2 lg:grid-cols-4',
        ].join(' ')}
      >
        {steps.map((step, i) => (
          <li key={`${step.title}-${i}`}>
            <p
              className="tabular-nums"
              style={{
                fontFamily: 'var(--st-font-heading)',
                fontSize:   28,
                fontWeight: 600,
                lineHeight: 1,
                color:      'var(--st-accent)',
              }}
              aria-hidden
            >
              {String(i + 1).padStart(2, '0')}
            </p>
            <h3
              className="mt-3 text-[16px] font-semibold text-[var(--st-ink)]"
              style={{ fontFamily: 'var(--st-font-heading)' }}
            >
              {step.title}
            </h3>
            {step.body && (
              <p className="mt-2 text-[14px] leading-relaxed text-[var(--st-ink-2)]">{step.body}</p>
            )}
          </li>
        ))}
      </ol>
    </Section>
  );

  return design.reveal ? <FadeIn>{body}</FadeIn> : body;
}

// ── Galerie ─────────────────────────────────────────────────────────────────

/**
 * Les photos qui ne sont pas des fiches produit : l'atelier, la vitrine, un
 * buffet livré, une publication Instagram.
 *
 * Le cadre est carré, quel que soit le gabarit. C'est le seul rapport qui
 * accueille sans les mutiler à la fois une photo prise au téléphone en portrait
 * et une capture de story — et ce sont les deux seules sources dont dispose
 * réellement un marchand.
 *
 * Sans image saisie, la section reprend les quatre compositions DESSINÉES du
 * gabarit, comme le font déjà la bannière, la bande d'appel et les vignettes de
 * rayon (`lib/storeArt.ts`). Elles sont abstraites, et c'est la condition :
 * poser ici une photographie de boutique montrerait un commerce qui n'est pas
 * celui du marchand. La première image qu'il téléverse les remplace toutes.
 */
export function GallerySection({ store, section, design }: SectionProps) {
  const g = store.theme.gallery;
  const own = g.images.filter(Boolean);
  const images = own.length > 0
    ? own
    : ART_SLOTS.map((slot) => templateArt(store.templateId, slot));
  if (!g.enabled || images.length === 0) return null;

  const title = sectionTitle(section, store.templateId) || g.title;

  const body = (
    <Section design={design} label={title}>
      <SectionHeader design={design} title={title} eyebrow="En images" description={g.caption} />

      <ul className="grid grid-cols-2 md:grid-cols-4" style={{ gap: 'var(--st-grid-gap)' }}>
        {images.slice(0, 12).map((src, i) => (
          <li key={`${src}-${i}`}>
            <ProductMedia
              src={src}
              alt=""
              rule={{ ratio: '1 / 1', fit: 'cover', pad: 0 }}
              sizes={IMAGE_SIZES.card}
              radius="var(--st-radius-media)"
            />
          </li>
        ))}
      </ul>
    </Section>
  );

  return design.reveal ? <FadeIn>{body}</FadeIn> : body;
}

// ── Commande sur mesure ─────────────────────────────────────────────────────

/**
 * La demande qui passe par WhatsApp.
 *
 * Sans numéro exploitable, la section disparaît : un formulaire qui n'aboutit
 * nulle part est pire qu'une section absente — l'acheteur croit avoir commandé
 * et attend une réponse qui ne viendra jamais.
 */
export function OrderFormSection({ store, section, design }: SectionProps) {
  const f = store.theme.orderForm;
  if (!f.enabled) return null;

  const phone = resolveOrderPhone(
    store.theme.whatsapp.number,
    store.whatsappPhone,
    store.contactPhone,
  );
  if (!phone) return null;

  const title = sectionTitle(section, store.templateId) || f.title;

  return (
    // L'ancre sert la grille de prix de gros, qui y envoie son bouton
    // « Demander un devis » — depuis la page d'accueil comme depuis une fiche
    // produit. Voir `WholesaleSection`.
    <Section design={design} tone="surface-2" label={title} id="devis">
      <div className="mx-auto max-w-2xl">
        <SectionHeader
          design={design}
          title={title}
          eyebrow="Sur mesure"
          align="center"
          description={f.body}
        />
        <OrderRequestForm
          store={store}
          phone={phone}
          ctaLabel={f.ctaLabel.trim() || 'Envoyer ma demande'}
          askDate={f.askDate}
        />
      </div>
    </Section>
  );
}

// ── Appel final ─────────────────────────────────────────────────────────────

/**
 * Une phrase, un bouton, sur un aplat de la couleur de structure.
 *
 * Elle ferme la page d'un prestataire, dont la vente n'est pas un panier mais
 * un rendez-vous. Le bouton n'apparaît que si le marchand lui a donné un
 * libellé : « En savoir plus » écrit à sa place n'engage personne et occupe la
 * place du seul geste qui comptait.
 */
export function CtaBandSection({ store, design }: SectionProps) {
  const c = store.theme.ctaBand;
  if (!c.enabled || !c.title.trim()) return null;

  return (
    <Section design={design} label={c.title}>
      <div
        className="relative isolate overflow-hidden px-6 py-14 text-center sm:px-12 sm:py-16"
        style={{ background: 'var(--st-primary)', borderRadius: 'var(--st-radius-card)' }}
      >
        {/* La bande fermait la page sur un aplat. Elle porte maintenant la
            matière du gabarit — la même que la bannière, en plus calme. */}
        <StoreImage
          src={templateArt(store.templateId, 'band')}
          alt=""
          sizes={IMAGE_SIZES.band}
          className="object-cover"
        />
        <div className="absolute inset-0" style={{ background: 'rgba(14,24,34,0.18)' }} aria-hidden />
        <div className="relative">
          <h2
            className="mx-auto max-w-2xl"
            style={{
              fontFamily:    'var(--st-font-heading)',
              fontSize:      'var(--st-h2)',
              fontWeight:    600,
              lineHeight:    1.15,
              letterSpacing: 'var(--st-tracking)',
              color:         'var(--st-primary-ink)',
            }}
          >
            {c.title}
          </h2>

          {c.body && (
            <p
              className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed"
              style={{ color: 'var(--st-primary-ink)', opacity: 0.85 }}
            >
              {c.body}
            </p>
          )}

          {c.ctaLabel.trim() && (
            <Link
              href={c.ctaHref.trim() || `${store.base}/products`}
              className="mt-8 inline-flex min-h-[52px] items-center justify-center px-8 text-[15px] font-semibold transition hover:brightness-95"
              style={{
                background:   'var(--st-accent)',
                color:        'var(--st-accent-ink)',
                borderRadius: 'var(--st-radius-btn)',
              }}
            >
              {c.ctaLabel}
            </Link>
          )}
        </div>
      </div>
    </Section>
  );
}
