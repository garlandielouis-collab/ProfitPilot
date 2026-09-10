// ─────────────────────────────────────────────────────────────────────────────
// Les sections de contenu
//
// Bandeau, bannière, réassurance, rayons, promotion, histoire, questions
// fréquentes, inscription, réseaux.
//
// Toutes suivent la même règle : **rien à afficher, rien d'affiché**. Aucune ne
// pose de texte de remplissage, aucune n'invente une promesse. Une section
// « Notre histoire » sans histoire n'est pas une section vide à remplir plus
// tard : c'est une section qui n'existe pas encore.
//
// ── La bannière a huit compositions, pas huit couleurs (§6, §34) ───────────
//
//   editorial  Image plein écran, texte posé bas à gauche, titre en capitales
//              espacées. La grammaire du prêt-à-porter : l'image parle, le
//              texte se contente de nommer la saison.
//   split      Deux colonnes : le discours d'un côté, le visuel de l'autre.
//              Cosmétique et électronique — deux rayons où il faut DIRE quelque
//              chose avant de montrer.
//   immersive  Image pleine largeur, texte centré sur un voile chaud. La
//              restauration : on vend l'envie, et l'envie est dans l'assiette.
//   card       La bannière tient dans une carte à l'intérieur de la page, ce qui
//              laisse voir les premiers produits dès le premier écran. Le
//              commerce généraliste, où le catalogue est l'argument.
//   compact    Deux lignes et un bouton. Le trafic réseaux sociaux arrive déjà
//              convaincu : chaque pixel de bannière est un produit de moins.
//   feature    Photo pleine largeur, discours calé à gauche, hauteur mesurée.
//              La boutique de quartier, l'artisan, l'éleveur, le traiteur : on
//              montre ce qu'on vend, on le dit en une phrase, et les produits
//              commencent tout de suite après.
//   social     Aplat sombre, photo à droite, arguments en pastilles. Le
//              visiteur vient d'une story : il retrouve la grammaire qu'il
//              vient de quitter, et les pastilles remplacent la bande de
//              réassurance que ce gabarit n'a pas.
//   pro        Photo sombre, promesse, prise de rendez-vous. La seule bannière
//              dont l'action n'est pas « voir le catalogue » : un prestataire
//              se réserve, et le bouton ouvre la conversation.
//
// Aucune ne se contente de « Bienvenue dans notre boutique ». Quand le marchand
// n'a pas écrit d'accroche, la bannière porte le nom de la boutique et son
// slogan — ce qu'il a réellement écrit — et jamais une phrase creuse générée à
// sa place.
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link';
import {
  ChevronDown, Instagram, Facebook, MessageCircle, Music2, ArrowRight, MapPin,
  CalendarCheck,
} from 'lucide-react';
import { StoreImage } from '../blocks/StoreImage';
import { templateArt, heroOverlay } from '../../../lib/storeArt';
import { ProductMedia } from '../blocks/ProductMedia';
import { TrustBadges } from '../blocks/TrustBadges';
import { FadeIn } from '../blocks/FadeIn';
import { NewsletterForm } from './NewsletterForm';
import { Section, SectionHeader } from './Shell';
import { sectionTitle } from '../../../lib/storeSections';
import { collectionHref } from '../../../lib/storeTheme';
import { buildBookingLink, resolveOrderPhone } from '../../../lib/storeWhatsApp';
import { IMAGE_SIZES } from '../../../lib/storeImage';
import type { SectionProps } from './types';
import type { DesignProfile } from '../../../lib/storeDesign';
import type { StoreView } from '../types';

// ── Bandeau d'annonce ───────────────────────────────────────────────────────

export function AnnouncementSection({ store }: SectionProps) {
  const { announcement } = store.theme;
  if (!announcement.enabled || !announcement.text.trim()) return null;

  return (
    <div
      className="px-4 py-2.5 text-center text-[12px] font-medium tracking-wide"
      style={{ background: 'var(--st-primary)', color: 'var(--st-primary-ink)' }}
    >
      {announcement.text}
    </div>
  );
}

// ── Bannière ────────────────────────────────────────────────────────────────

/** Le titre de bannière : sa taille et sa casse viennent du gabarit. */
function HeroTitle({
  design, children, onDark, ink,
}: {
  design: DesignProfile;
  children: React.ReactNode;
  onDark: boolean;
  /**
   * L'encre, quand le fond n'est pas une photo assombrie mais un aplat de la
   * couleur du marchand. Le blanc y est un pari : un aplat pâle rendrait le
   * titre illisible. `--st-primary-ink` est calculé, lui.
   */
  ink?: string;
}) {
  return (
    <h1
      style={{
        fontFamily:    'var(--st-font-heading)',
        fontSize:      'var(--st-h1)',
        fontWeight:    design.type.upper ? 500 : 600,
        letterSpacing: 'var(--st-tracking)',
        textTransform: design.type.upper ? 'uppercase' : undefined,
        lineHeight:    1.05,
        color:         ink ?? (onDark ? '#FFFFFF' : 'var(--st-ink)'),
      }}
    >
      {children}
    </h1>
  );
}

function HeroCta({ store, label }: { store: StoreView; label: string }) {
  return (
    <Link
      href={`${store.base}/products`}
      className="mt-8 inline-flex min-h-[56px] items-center justify-center gap-2 px-8 text-[15px] font-semibold transition hover:brightness-95"
      style={{
        background:   'var(--st-accent)',
        color:        'var(--st-accent-ink)',
        borderRadius: 'var(--st-radius-btn)',
      }}
    >
      {label}
      <ArrowRight className="h-4 w-4" strokeWidth={2.2} aria-hidden />
    </Link>
  );
}

// ── Le fond des bannières pleine largeur ────────────────────────────────────
//
// Il est peint SOUS la photo, jamais à sa place. Le test « une adresse
// d'image, donc pas de fond » se trompe sur le cas le plus courant : l'adresse
// existe et l'image ne charge pas — le CDN gratuit du marchand a rendu son
// lien, ou la connexion l'a abandonnée. Le voile posé par-dessus restait alors
// seul, sur du blanc : un dégradé gris de 800 pixels de haut, avec le nom de
// la boutique écrit en blanc dessus.
//
// Sous la photo, le même aplat sert les deux cas sans les distinguer : on ne
// le voit pas quand la photo arrive, il tient la bannière quand elle manque.
const HERO_GROUND: React.CSSProperties = { background: 'var(--st-primary)' };

export function HeroSection({ store, design }: SectionProps) {
  const { theme } = store;

  // ── L'image de la bannière ────────────────────────────────────────────
  //
  // Celle du marchand d'abord, la bannière de sa boutique ensuite, et l'image
  // du gabarit en dernier recours. Une vitrine neuve n'a ni l'une ni l'autre :
  // elle tombait alors sur un aplat de la couleur de structure, et c'est
  // exactement ce qui faisait qu'une page ressemblait à un gabarit vide.
  //
  // Les bannières en deux colonnes reçoivent l'image verticale — c'est un
  // panneau à côté du texte, pas un fond derrière lui.
  const own      = theme.hero.imageUrl ?? store.bannerUrl;
  const sideways = design.hero === 'split' || design.hero === 'social';
  const image    = own ?? templateArt(store.templateId, sideways ? 'story' : 'hero');
  const headline = theme.hero.headline.trim() || store.name;
  const sub      = theme.hero.subheadline.trim() || store.tagline || '';
  const cta      = theme.hero.ctaLabel.trim() || 'Découvrir la boutique';

  // Le voile dépend de CE qu'on voile : la photo du marchand suit son réglage,
  // la photographie de gabarit demande un assombrissement franc, la composition
  // dessinée presque rien — elle est déjà construite autour de son texte.
  const overlay = own
    ? theme.hero.overlay / 100
    : heroOverlay(image, theme.hero.overlay);

  // ── Carte : la bannière vit DANS la page ─────────────────────────────────
  if (design.hero === 'card') {
    return (
      <section className="mx-auto max-w-6xl px-4 pt-6 sm:px-6">
        <div
          className="relative isolate overflow-hidden"
          style={{ borderRadius: 'var(--st-radius-card)', background: 'var(--st-primary)' }}
        >
          {image && (
            <>
              <StoreImage src={image} alt="" priority sizes={IMAGE_SIZES.hero} className="object-cover" />
              <div className="absolute inset-0" style={{ background: `rgba(14,24,34,${overlay})` }} aria-hidden />
            </>
          )}
          <div className="relative px-6 py-16 sm:px-12 sm:py-24">
            <div className="max-w-xl">
              <HeroTitle design={design} onDark>{headline}</HeroTitle>
              {sub && <p className="mt-4 max-w-md text-[15px] leading-relaxed text-white/85">{sub}</p>}
              <HeroCta store={store} label={cta} />
            </div>
          </div>
        </div>
      </section>
    );
  }

  // ── Compact : deux lignes et un bouton ───────────────────────────────────
  if (design.hero === 'compact') {
    return (
      <section
        className="border-b px-4 py-7 sm:px-6"
        style={{ borderColor: 'var(--st-border)', background: 'var(--st-surface-2)' }}
      >
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <HeroTitle design={design} onDark={false}>{headline}</HeroTitle>
            {sub && <p className="mt-1 text-[14px] text-[var(--st-ink-2)]">{sub}</p>}
          </div>
          <Link
            href={`${store.base}/products`}
            className="flex min-h-[48px] items-center px-6 text-[14px] font-semibold"
            style={{
              background: 'var(--st-accent)', color: 'var(--st-accent-ink)',
              borderRadius: 'var(--st-radius-btn)',
            }}
          >
            {cta}
          </Link>
        </div>
      </section>
    );
  }

  // ── Feature : la photo porte, le discours tient à gauche ─────────────────
  //
  // Le dégradé va de la gauche vers la droite et non du bas vers le haut : le
  // texte se pose à gauche, et c'est là — et seulement là — que la photo doit
  // s'assombrir. Un voile uniforme éteindrait l'assiette du traiteur ou la
  // pièce de l'artisan, qui sont précisément ce que la bannière vend.
  if (design.hero === 'feature') {
    return (
      <section className="relative isolate overflow-hidden" style={HERO_GROUND}>
        {image && (
          <>
            <StoreImage src={image} alt="" priority sizes={IMAGE_SIZES.hero} className="object-cover" quality={80} />
            <div
              className="absolute inset-0"
              style={{
                background: `linear-gradient(to right, rgba(14,24,34,${Math.min(overlay + 0.34, 0.86)}) 0%, rgba(14,24,34,${Math.min(overlay + 0.2, 0.7)}) 42%, rgba(14,24,34,${overlay * 0.35}) 100%)`,
              }}
              aria-hidden
            />
          </>
        )}

        <div className="relative mx-auto flex min-h-[54vh] max-w-6xl flex-col justify-center px-4 py-16 sm:px-6 sm:py-24">
          <div className="max-w-lg">
            <HeroTitle design={design} onDark>{headline}</HeroTitle>
            {sub && (
              <p className="mt-4 max-w-md text-[15px] leading-relaxed text-white/85">{sub}</p>
            )}
            <HeroCta store={store} label={cta} />
          </div>
        </div>
      </section>
    );
  }

  // ── Social : l'aplat, la photo à droite, les arguments en pastilles ──────
  //
  // Les pastilles ne sont pas décoratives : ce gabarit est le seul dont la page
  // d'accueil ne porte pas de bande de réassurance, parce que ce visiteur-là ne
  // descend pas jusqu'à elle. Livraison, paiement, retours doivent donc tenir
  // dans la bannière — et ce sont les badges que le marchand a déjà saisis, pas
  // trois promesses écrites à sa place.
  if (design.hero === 'social') {
    const pills = theme.trust.enabled
      ? theme.trust.badges.map((b) => b.label.trim()).filter(Boolean).slice(0, 3)
      : [];

    return (
      <section style={{ background: 'var(--st-primary)' }}>
        <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-12 sm:px-6 md:grid-cols-2 md:gap-12 md:py-16">
          <div className="order-2 md:order-1">
            <HeroTitle design={design} onDark ink="var(--st-primary-ink)">{headline}</HeroTitle>
            {sub && (
              <p
                className="mt-4 max-w-md text-[15px] leading-relaxed"
                style={{ color: 'var(--st-primary-ink)', opacity: 0.85 }}
              >
                {sub}
              </p>
            )}

            {pills.length > 0 && (
              <ul className="mt-6 flex flex-wrap gap-2">
                {pills.map((label) => (
                  <li
                    key={label}
                    className="rounded-full px-3.5 py-1.5 text-[12px] font-medium"
                    style={{
                      border: '1px solid color-mix(in srgb, var(--st-primary-ink) 28%, transparent)',
                      color:  'var(--st-primary-ink)',
                    }}
                  >
                    {label}
                  </li>
                ))}
              </ul>
            )}

            <HeroCta store={store} label={cta} />
          </div>

          <div className="order-1 md:order-2">
            {image ? (
              <ProductMedia
                src={image}
                alt=""
                rule={{ ratio: '1 / 1', fit: 'cover', pad: 0 }}
                sizes={IMAGE_SIZES.heroSplit}
                priority
                radius="var(--st-radius-card)"
              />
            ) : null}
          </div>
        </div>
      </section>
    );
  }

  // ── Pro : la promesse et le rendez-vous ──────────────────────────────────
  //
  // La seule bannière dont l'action principale n'est pas « voir le catalogue ».
  // Elle n'apparaît toutefois que si le marchand est joignable : sans WhatsApp
  // ni courriel, le bouton retombe sur ses prestations, ce qui est au moins
  // vrai.
  if (design.hero === 'pro') {
    const booking = buildBookingLink({
      storeName: store.name,
      phone:     resolveOrderPhone(theme.whatsapp.number, store.whatsappPhone, store.contactPhone),
      email:     store.contactEmail,
    });

    return (
      <section className="relative isolate overflow-hidden" style={HERO_GROUND}>
        {image && (
          <>
            <StoreImage src={image} alt="" priority sizes={IMAGE_SIZES.hero} className="object-cover" quality={80} />
            <div
              className="absolute inset-0"
              style={{ background: `rgba(14,24,34,${Math.min(overlay + 0.3, 0.82)})` }}
              aria-hidden
            />
          </>
        )}

        <div className="relative mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
          <div className="max-w-xl">
            <HeroTitle design={design} onDark>{headline}</HeroTitle>
            {sub && (
              <p className="mt-5 max-w-md text-[16px] leading-relaxed text-white/85">{sub}</p>
            )}

            {booking ? (
              <div className="mt-8 flex flex-wrap items-center gap-3">
                  <a
                    href={booking}
                    target={booking.startsWith('http') ? '_blank' : undefined}
                    rel={booking.startsWith('http') ? 'noopener noreferrer' : undefined}
                    className="inline-flex min-h-[56px] items-center justify-center gap-2 px-8 text-[15px] font-semibold transition hover:brightness-95"
                    style={{
                      background:   'var(--st-accent)',
                      color:        'var(--st-accent-ink)',
                      borderRadius: 'var(--st-radius-btn)',
                    }}
                  >
                    <CalendarCheck className="h-4 w-4" strokeWidth={2.2} aria-hidden />
                    Prendre rendez-vous
                  </a>
                  <Link
                    href={`${store.base}/products`}
                    className="inline-flex min-h-[56px] items-center justify-center px-6 text-[15px] font-semibold text-white transition hover:bg-white/10"
                    style={{ border: '1px solid rgba(255,255,255,0.35)', borderRadius: 'var(--st-radius-btn)' }}
                  >
                    {cta}
                  </Link>
              </div>
            ) : (
              <HeroCta store={store} label={cta} />
            )}
          </div>
        </div>
      </section>
    );
  }

  // ── Deux colonnes : le discours et le visuel ─────────────────────────────
  if (design.hero === 'split') {
    return (
      <section style={{ background: 'var(--st-surface-2)' }}>
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 sm:px-6 md:grid-cols-2 md:gap-16 md:py-20">
          <div className="order-2 md:order-1">
            {design.type.eyebrow && store.tagline && theme.hero.headline.trim() && (
              <p
                className="mb-4 text-[11px] font-semibold uppercase text-[var(--st-ink-3)]"
                style={{ letterSpacing: '0.18em' }}
              >
                {store.tagline}
              </p>
            )}
            <HeroTitle design={design} onDark={false}>{headline}</HeroTitle>
            {sub && (
              <p className="mt-5 max-w-md text-[16px] leading-relaxed text-[var(--st-ink-2)]">{sub}</p>
            )}
            <HeroCta store={store} label={cta} />
          </div>

          <div className="order-1 md:order-2">
            {image ? (
              <ProductMedia
                src={image}
                alt=""
                rule={{ ratio: '4 / 5', fit: 'cover', pad: 0 }}
                sizes={IMAGE_SIZES.heroSplit}
                priority
                radius="var(--st-radius-card)"
              />
            ) : (
              <div
                className="aspect-[4/5] w-full"
                style={{ background: 'var(--st-primary)', borderRadius: 'var(--st-radius-card)' }}
                aria-hidden
              />
            )}
          </div>
        </div>
      </section>
    );
  }

  // ── Immersive et éditorial : l'image occupe l'écran ──────────────────────
  const editorial = design.hero === 'editorial';

  return (
    <section className="relative isolate overflow-hidden" style={HERO_GROUND}>
      {image && (
        <>
          <StoreImage
            src={image} alt="" priority sizes={IMAGE_SIZES.hero}
            className="object-cover"
            focal={editorial ? 'top' : 'center'}
            quality={80}
          />
          <div
            className="absolute inset-0"
            style={{
              background: editorial
                // Un dégradé plutôt qu'un voile uniforme : il assombrit là où le
                // texte se pose et laisse la photographie intacte au-dessus.
                ? `linear-gradient(to top, rgba(14,24,34,${Math.min(overlay + 0.35, 0.85)}) 0%, rgba(14,24,34,${overlay * 0.5}) 55%, rgba(14,24,34,0.05) 100%)`
                : `rgba(14,24,34,${overlay})`,
            }}
            aria-hidden
          />
        </>
      )}

      <div
        className={[
          'relative mx-auto max-w-6xl px-4 sm:px-6',
          editorial
            ? 'flex min-h-[78vh] max-h-[880px] flex-col justify-end pb-16 pt-28 sm:pb-24'
            : 'py-24 text-center sm:py-36',
        ].join(' ')}
      >
        <div className={editorial ? 'max-w-xl' : 'mx-auto max-w-2xl'}>
          {editorial && design.type.eyebrow && store.tagline && (
            <p
              className="mb-4 text-[11px] font-semibold uppercase text-white/75"
              style={{ letterSpacing: '0.22em' }}
            >
              {store.tagline}
            </p>
          )}

          <HeroTitle design={design} onDark>{headline}</HeroTitle>

          {sub && (
            <p
              className={[
                'mt-5 text-[15px] leading-relaxed text-white/85',
                editorial ? 'max-w-md' : 'mx-auto max-w-lg',
              ].join(' ')}
            >
              {sub}
            </p>
          )}

          <HeroCta store={store} label={cta} />
        </div>
      </div>
    </section>
  );
}

// ── Réassurance ─────────────────────────────────────────────────────────────

export function BenefitsSection({ store }: SectionProps) {
  return <TrustBadges trust={store.theme.trust} />;
}

// ── Rayons ──────────────────────────────────────────────────────────────────

/**
 * Les rayons de la boutique.
 *
 * Quatre formes, et c'est le GABARIT qui tranche (`design.categories`) — non
 * plus une déduction faite ici à partir de la bannière et de la carte, qui
 * donnait le bon résultat par accident et le mauvais dès qu'un gabarit
 * changeait de bannière.
 *
 *   tiles    Vignettes photo. On choisit une catégorie parce qu'elle est belle :
 *            mode, cosmétique, restauration, artisanat.
 *   chips    Pastilles de texte. On sait déjà ce qu'on cherche — électronique,
 *            commerce général — et une rangée de cartes carrées repousserait
 *            les produits sous la ligne de flottaison.
 *   circles  Médaillons ronds, en bande qui défile. La grammaire des stories,
 *            pour le visiteur qui arrive d'Instagram ou de TikTok.
 *   tabs     Onglets posés au-dessus du catalogue. Une carte de restaurant, une
 *            liste d'espèces : on choisit un rayon, pas une ambiance.
 *
 * L'image d'un rayon n'est pas téléversée par le marchand : c'est la photo d'un
 * de ses produits de ce rayon. Une vraie, donc, et une de moins à lui demander.
 */
export function CategoriesSection({ store, section, data, design }: SectionProps) {
  if (!store.theme.catalog.showCategories || data.categories.length === 0) return null;

  const title      = sectionTitle(section, store.templateId);
  const categories = data.categories.slice(0, section.config.limit);

  /**
   * La photo du rayon : celle du premier de ses produits qui en a une.
   *
   * `category_id` d'abord, le libellé ensuite — les vitrines créées avant la
   * normalisation du schéma n'ont que le second.
   */
  const sampleFor = (categoryId: string) =>
    data.products.find((p) => (p.category_id ?? p.category) === categoryId && p.image_url)
      ?.image_url
    // Un rayon dont aucun produit n'est photographié affichait un cadre vide.
    // Il reçoit maintenant la matière du gabarit — abstraite, donc elle ne
    // promet aucun produit ; elle donne juste une forme à cliquer.
    ?? templateArt(store.templateId, 'tile');

  // ── Médaillons ronds ────────────────────────────────────────────────────
  //
  // La bande défile horizontalement plutôt que de passer à la ligne : c'est le
  // geste que ce visiteur vient de faire pendant dix minutes, et une grille de
  // ronds sur trois rangées n'est plus une bande de stories, c'est un damier.
  if (design.categories === 'circles') {
    return (
      <Section design={design} label={title}>
        {title && <SectionHeader design={design} title={title} eyebrow="Rayons" />}
        <nav aria-label="Rayons">
          <ul className="-mx-4 flex gap-5 overflow-x-auto px-4 pb-2 sm:mx-0 sm:flex-wrap sm:justify-center sm:overflow-visible sm:px-0">
            {categories.map((c) => (
              <li key={c.id} className="flex-shrink-0">
                <Link
                  href={collectionHref(store.base, c)}
                  className="group flex w-[84px] flex-col items-center gap-2 text-center"
                >
                  <ProductMedia
                    src={sampleFor(c.id)}
                    alt=""
                    rule={{ ratio: '1 / 1', fit: 'cover', pad: 0 }}
                    sizes="84px"
                    radius="999px"
                    className="w-full"
                    imageClassName="transition-transform duration-500 group-hover:scale-[1.06]"
                  />
                  <span className="line-clamp-2 text-[12px] font-medium leading-tight text-[var(--st-ink-2)]">
                    {c.name}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </Section>
    );
  }

  // ── Onglets ─────────────────────────────────────────────────────────────
  //
  // Ils se posent directement au-dessus du catalogue, sans titre de section :
  // un menu ne s'annonce pas, il se lit. « Tout » ouvre en premier parce que
  // c'est la vue par défaut de la page qui suit.
  if (design.categories === 'tabs') {
    return (
      <Section design={design} className="!pb-0" label={title || 'Rayons'}>
        <nav aria-label="Rayons">
          <ul
            className="-mx-4 flex gap-1 overflow-x-auto border-b px-4 sm:mx-0 sm:px-0"
            style={{ borderColor: 'var(--st-border)' }}
          >
            <li className="flex-shrink-0">
              <Link
                href={`${store.base}/products`}
                className="flex min-h-[48px] items-center whitespace-nowrap border-b-2 px-4 text-[14px] font-semibold text-[var(--st-ink)]"
                style={{ borderColor: 'var(--st-accent)' }}
              >
                Tout
              </Link>
            </li>
            {categories.map((c) => (
              <li key={c.id} className="flex-shrink-0">
                <Link
                  href={collectionHref(store.base, c)}
                  className="flex min-h-[48px] items-center gap-2 whitespace-nowrap border-b-2 border-transparent px-4 text-[14px] font-medium text-[var(--st-ink-2)] transition hover:border-[var(--st-border)] hover:text-[var(--st-ink)]"
                >
                  {c.name}
                  <span className="text-[12px] tabular-nums text-[var(--st-ink-3)]">{c.count}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </Section>
    );
  }

  if (design.categories === 'chips') {
    return (
      <Section design={design} label={title}>
        {title && <SectionHeader design={design} title={title} eyebrow="Rayons" />}
        <nav aria-label="Rayons" className="flex flex-wrap gap-2">
          <Link
            href={`${store.base}/products`}
            className="flex min-h-[44px] items-center px-4 text-[13px] font-medium text-[var(--st-ink)]"
            style={{ border: '1px solid var(--st-ink)', borderRadius: 'var(--st-radius-btn)' }}
          >
            Tout
          </Link>
          {categories.map((c) => (
            <Link
              key={c.id}
              href={collectionHref(store.base, c)}
              className="flex min-h-[44px] items-center px-4 text-[13px] font-medium text-[var(--st-ink-2)] transition hover:text-[var(--st-ink)]"
              style={{ border: '1px solid var(--st-border)', borderRadius: 'var(--st-radius-btn)' }}
            >
              {c.name}
              <span className="ml-2 text-[12px] tabular-nums text-[var(--st-ink-3)]">{c.count}</span>
            </Link>
          ))}
        </nav>
      </Section>
    );
  }

  return (
    <Section design={design} label={title}>
      <SectionHeader
        design={design}
        title={title}
        eyebrow="Rayons"
        href={`${store.base}/products`}
        hrefLabel="Tout le catalogue"
      />

      <nav aria-label="Rayons">
        <ul
          className="grid grid-cols-2 md:grid-cols-4"
          style={{ gap: 'var(--st-grid-gap)' }}
        >
          {categories.slice(0, 8).map((c) => {
            return (
              <li key={c.id}>
                <Link
                  href={collectionHref(store.base, c)}
                  className="group block"
                >
                  <ProductMedia
                    src={sampleFor(c.id)}
                    alt=""
                    rule={{ ratio: '3 / 4', fit: 'cover', pad: 0 }}
                    sizes="(max-width: 768px) 50vw, 25vw"
                    imageClassName="transition-transform duration-700 group-hover:scale-[1.04]"
                  >
                    <div
                      className="absolute inset-0"
                      style={{ background: 'linear-gradient(to top, rgba(14,24,34,0.62), rgba(14,24,34,0.05) 60%)' }}
                      aria-hidden
                    />
                    <div className="absolute inset-x-0 bottom-0 p-4">
                      <p
                        className="text-[15px] font-semibold text-white"
                        style={{
                          fontFamily:    'var(--st-font-heading)',
                          textTransform: design.type.upper ? 'uppercase' : undefined,
                          letterSpacing: design.type.upper ? '0.1em' : undefined,
                        }}
                      >
                        {c.name}
                      </p>
                      <p className="mt-0.5 text-[12px] tabular-nums text-white/75">
                        {c.count} article{c.count > 1 ? 's' : ''}
                      </p>
                    </div>
                  </ProductMedia>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </Section>
  );
}

// ── Promotion ───────────────────────────────────────────────────────────────

export function PromotionSection({ store, design }: SectionProps) {
  const p = store.theme.promotion;
  if (!p.enabled || !p.title.trim()) return null;

  return (
    <Section design={design} label={p.title}>
      <div
        className="relative isolate overflow-hidden px-6 py-14 sm:px-12 sm:py-20"
        style={{ background: 'var(--st-primary)', borderRadius: 'var(--st-radius-card)' }}
      >
        <StoreImage
          src={p.imageUrl ?? templateArt(store.templateId, 'band')}
          alt=""
          sizes={IMAGE_SIZES.band}
          className="object-cover"
        />
        {/* La photo d'un marchand se voile pour que le texte tienne ; l'image
            du gabarit est déjà sombre et n'en demande presque pas. */}
        <div
          className="absolute inset-0"
          style={{ background: p.imageUrl ? 'rgba(14,24,34,0.55)' : 'rgba(14,24,34,0.12)' }}
          aria-hidden
        />

        <div className="relative max-w-lg">
          <h2
            className="text-white"
            style={{
              fontFamily:    'var(--st-font-heading)',
              fontSize:      'var(--st-h2)',
              fontWeight:    600,
              lineHeight:    1.15,
              letterSpacing: 'var(--st-tracking)',
            }}
          >
            {p.title}
          </h2>
          {p.subtitle && (
            <p className="mt-3 text-[15px] leading-relaxed text-white/85">{p.subtitle}</p>
          )}
          {p.ctaLabel && (
            <Link
              href={p.ctaHref || `${store.base}/products`}
              className="mt-7 inline-flex min-h-[52px] items-center justify-center px-7 text-[15px] font-semibold transition hover:brightness-95"
              style={{
                background: 'var(--st-accent)', color: 'var(--st-accent-ink)',
                borderRadius: 'var(--st-radius-btn)',
              }}
            >
              {p.ctaLabel}
            </Link>
          )}
        </div>
      </div>
    </Section>
  );
}

// ── Notre histoire ──────────────────────────────────────────────────────────

export function BrandStorySection({ store, section, design }: SectionProps) {
  const s = store.theme.brandStory;
  if (!s.enabled || !s.body.trim()) return null;

  const body = (
    <Section design={design} tone="surface-2" label={s.title}>
      <div className="grid items-center gap-10 md:grid-cols-2 md:gap-16">
        {/* Sans photo d'atelier, l'histoire s'écrivait seule au milieu de la
            page. Elle garde ses deux colonnes : la matière du gabarit tient la
            gauche, le récit la droite. */}
        <ProductMedia
          src={s.imageUrl ?? templateArt(store.templateId, 'story')}
          alt=""
          rule={{ ratio: '4 / 3', fit: 'cover', pad: 0 }}
          sizes={IMAGE_SIZES.editorial}
          radius="var(--st-radius-card)"
        />
        <div>
          {design.type.eyebrow && (
            <p
              className="mb-3 text-[11px] font-semibold uppercase text-[var(--st-ink-3)]"
              style={{ letterSpacing: '0.18em' }}
            >
              La maison
            </p>
          )}
          <h2
            className="text-[var(--st-ink)]"
            style={{
              fontFamily:    'var(--st-font-heading)',
              fontSize:      'var(--st-h2)',
              fontWeight:    600,
              lineHeight:    1.2,
              letterSpacing: 'var(--st-tracking)',
            }}
          >
            {sectionTitle(section, store.templateId) || s.title}
          </h2>
          {/* `whitespace-pre-line` : le marchand écrit des paragraphes dans un
              champ de texte, ses retours à la ligne sont son découpage. */}
          <p className="mt-5 whitespace-pre-line text-[15px] leading-relaxed text-[var(--st-ink-2)]">
            {s.body}
          </p>
        </div>
      </div>
    </Section>
  );

  return design.reveal ? <FadeIn>{body}</FadeIn> : body;
}

// ── Questions fréquentes ────────────────────────────────────────────────────

export function FaqSection({ store, section, design }: SectionProps) {
  const faq = store.theme.faq;
  const items = faq.items.filter((i) => i.question.trim() && i.answer.trim());
  if (!faq.enabled || items.length === 0) return null;

  return (
    <Section design={design} label={faq.title}>
      <div className="mx-auto max-w-3xl">
        <SectionHeader
          design={design}
          title={sectionTitle(section, store.templateId) || faq.title}
          eyebrow="Avant d'acheter"
          align="center"
        />

        <div className="flex flex-col gap-2">
          {items.map((item, i) => (
            // `<details>` natif : il s'ouvre sans JavaScript, il est accessible au
            // clavier sans qu'on s'en occupe, et il se cherche avec Ctrl+F même
            // fermé sur les navigateurs récents.
            <details
              key={`${item.question}-${i}`}
              className="group px-4"
              style={{
                border: '1px solid var(--st-border)',
                borderRadius: 'var(--st-radius-card)',
                background: 'var(--st-surface)',
              }}
            >
              <summary className="flex min-h-[56px] cursor-pointer list-none items-center justify-between gap-3 text-[15px] font-medium text-[var(--st-ink)]">
                {item.question}
                <ChevronDown
                  className="h-4 w-4 flex-shrink-0 text-[var(--st-ink-3)] transition-transform group-open:rotate-180"
                  strokeWidth={2} aria-hidden
                />
              </summary>
              <p className="whitespace-pre-line pb-4 text-[14px] leading-relaxed text-[var(--st-ink-2)]">
                {item.answer}
              </p>
            </details>
          ))}
        </div>
      </div>
    </Section>
  );
}

// ── Inscription ─────────────────────────────────────────────────────────────

export function NewsletterSection({ store, section, design }: SectionProps) {
  const n = store.theme.newsletter;
  if (!n.enabled) return null;

  return (
    <Section design={design} tone="surface-2" label={n.title}>
      <div className="mx-auto max-w-md text-center">
        <h2
          className="text-[var(--st-ink)]"
          style={{
            fontFamily: 'var(--st-font-heading)',
            fontSize:   'var(--st-h2)',
            fontWeight: 600,
            lineHeight: 1.2,
          }}
        >
          {sectionTitle(section, store.templateId) || n.title}
        </h2>
        {n.body && (
          <p className="mt-3 text-[14px] leading-relaxed text-[var(--st-ink-2)]">{n.body}</p>
        )}
        <NewsletterForm store={store} />
      </div>
    </Section>
  );
}

// ── Nous trouver ────────────────────────────────────────────────────────────

/**
 * L'adresse, quand il y en a une.
 *
 * La restauration en dépend (§10) : un client qui commande à emporter doit
 * savoir où venir chercher. La section n'invente ni horaires ni plan — elle
 * affiche ce que le marchand a renseigné, et ouvre l'adresse dans la
 * cartographie du téléphone, qui fait ce travail mieux qu'un cadre intégré.
 */
export function LocationSection({ store, section, design }: SectionProps) {
  if (!store.contactAddress) return null;

  const title = sectionTitle(section, store.templateId) || 'Nous trouver';

  return (
    <Section design={design} tone="surface-2" label={title}>
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 text-center">
        <MapPin className="h-6 w-6 text-[var(--st-ink-3)]" strokeWidth={1.5} aria-hidden />
        <h2
          className="text-[var(--st-ink)]"
          style={{ fontFamily: 'var(--st-font-heading)', fontSize: 'var(--st-h2)', fontWeight: 600 }}
        >
          {title}
        </h2>
        <p className="text-[15px] leading-relaxed text-[var(--st-ink-2)]">{store.contactAddress}</p>
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(store.contactAddress)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-[48px] items-center px-6 text-[14px] font-semibold text-[var(--st-ink)] transition hover:bg-[var(--st-surface)]"
          style={{ border: '1px solid var(--st-border)', borderRadius: 'var(--st-radius-btn)' }}
        >
          Ouvrir dans le plan
        </a>
        {store.contactPhone && (
          <a
            href={`tel:${store.contactPhone.replace(/\s/g, '')}`}
            className="min-h-[44px] text-[14px] font-semibold text-[var(--st-ink-2)] underline underline-offset-4"
          >
            {store.contactPhone}
          </a>
        )}
      </div>
    </Section>
  );
}

// ── Réseaux sociaux ─────────────────────────────────────────────────────────

const SOCIAL_ICONS = {
  instagram: Instagram,
  facebook:  Facebook,
  tiktok:    Music2,
  whatsapp:  MessageCircle,
} as const;

const SOCIAL_LABELS = {
  instagram: 'Instagram',
  facebook:  'Facebook',
  tiktok:    'TikTok',
  whatsapp:  'WhatsApp',
} as const;

export function SocialSection({ store, section, design }: SectionProps) {
  const links = (Object.keys(SOCIAL_ICONS) as Array<keyof typeof SOCIAL_ICONS>)
    .map((k) => ({ key: k, href: store.theme.social[k]?.trim() }))
    .filter((l): l is { key: keyof typeof SOCIAL_ICONS; href: string } => Boolean(l.href));

  if (links.length === 0) return null;

  return (
    <Section design={design} label="Réseaux sociaux">
      <div className="text-center">
        <h2
          className="text-[var(--st-ink)]"
          style={{ fontFamily: 'var(--st-font-heading)', fontSize: 'var(--st-h2)', fontWeight: 600 }}
        >
          {sectionTitle(section, store.templateId)}
        </h2>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {links.map(({ key, href }) => {
            const Icon = SOCIAL_ICONS[key];
            return (
              <a
                key={key}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-[48px] items-center gap-2 px-5 text-[14px] font-medium text-[var(--st-ink)] transition hover:brightness-95"
                style={{ border: '1px solid var(--st-border)', borderRadius: 'var(--st-radius-btn)' }}
              >
                <Icon className="h-4 w-4" strokeWidth={1.8} aria-hidden />
                {SOCIAL_LABELS[key]}
              </a>
            );
          })}
        </div>
      </div>
    </Section>
  );
}
