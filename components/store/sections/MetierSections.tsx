// ─────────────────────────────────────────────────────────────────────────────
// Les six sections qui achèvent les gabarits métier
//
// Les sections précédentes vendent, puis répondent. Il restait un troisième
// travail que ni l'une ni l'autre ne faisait : dire ce que CE métier-là doit
// dire et qu'aucun autre ne dit.
//
//   Disponibilités  ce que j'ai, aujourd'hui, en quantités vraies   → Élevage
//   Vente en gros   le prix qui baisse quand la commande monte      → Élevage
//   Forfaits        deux à quatre niveaux comparables               → Services
//   Résultats       d'où le client partait, où il est arrivé        → Services
//   Journal         le savoir-faire, qui se lit avant de s'acheter  → Artisan
//   Mur de vidéos   le produit là où il a été vu                    → Vendeur
//
// ── La règle qui les gouverne toutes ───────────────────────────────────────
//
// Rien à dire → rien d'affiché. Aucun prix dégressif, aucun résultat, aucune
// quantité n'est inventé : ce sont des engagements que l'acheteur viendra
// réclamer au marchand, pas à nous.
//
// « Disponibilités » va plus loin que les autres sur ce point : elle ne stocke
// AUCUNE quantité. Elle lit le stock, article par article, au moment du rendu.
// Une liste de disponibilités tenue à la main est fausse le lendemain — et sur
// un rayon d'élevage, une disponibilité fausse est un déplacement pour rien.
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link';
import {
  PackageCheck, Layers, Check, ArrowRight, Quote, PlayCircle, Newspaper,
} from 'lucide-react';
import { Section, SectionHeader } from './Shell';
import { storeLink } from './storeLink';
import { StoreImage } from '../blocks/StoreImage';
import { ProductGrid } from '../blocks/ProductGrid';
import { storeMoney } from '../format';
import { sectionTitle } from '../../../lib/storeSections';
import { resolveOrderPhone } from '../../../lib/storeWhatsApp';
import type { SectionProps } from './types';

// ── Disponibles actuellement ────────────────────────────────────────────────

/**
 * Ce qui est réellement en stock, du plus fourni au plus rare.
 *
 * Elle n'existe que sur les vitrines qui MONTRENT leur stock : sans
 * `showStock`, la section n'aurait rien à dire que le catalogue ne dit déjà, et
 * s'appellerait « Disponibles actuellement » sans annoncer une seule
 * disponibilité.
 *
 * Le tri par stock décroissant est le bon ici, et il n'est pas anodin : sur un
 * rayon d'élevage, l'acheteur cherche le lot qui couvre sa commande. Trier par
 * nouveauté lui montrerait d'abord les trois têtes qui restent.
 */
export function AvailabilitySection({ store, section, data, design }: SectionProps) {
  const a = store.theme.availability;
  if (!a.enabled) return null;
  if (!store.showStock) return null;

  const inStock = data.products
    .filter((p) => p.stock > 0)
    .sort((x, y) => y.stock - x.stock)
    .slice(0, section.config.limit);

  if (inStock.length === 0) return null;

  const title = sectionTitle(section, store.templateId);
  const total = inStock.reduce((sum, p) => sum + p.stock, 0);

  return (
    <Section design={design} tone="surface-2" label={title}>
      <SectionHeader
        design={design}
        title={title}
        eyebrow="En stock"
        description={a.note.trim() || undefined}
        href={`${store.base}/products?stock=1`}
        hrefLabel="Tout voir"
      />

      {/* Le total est une SOMME de stocks réels, pas une accroche. Il vaut la
          ligne qu'il prend : c'est la première chose qu'un acheteur en gros
          veut savoir avant de lire une seule fiche. */}
      <p className="mb-6 flex items-center gap-2 text-[13px] font-medium text-[var(--st-ink-2)]">
        <PackageCheck className="h-4 w-4 flex-shrink-0" strokeWidth={1.8} aria-hidden />
        {inStock.length === 1
          ? `1 référence disponible, ${total.toLocaleString('fr-HT')} en stock`
          : `${inStock.length} références disponibles, ${total.toLocaleString('fr-HT')} unités en stock`}
      </p>

      <ProductGrid
        store={store}
        products={inStock}
        ratings={data.ratings}
        design={design}
        priorityCount={0}
      />
    </Section>
  );
}

// ── Vente en gros ───────────────────────────────────────────────────────────

/**
 * La grille des prix par quantité.
 *
 * Deux façons de la lire selon l'écran : un tableau sur grand écran, des cartes
 * empilées sur téléphone. Un tableau de trois colonnes qui défile
 * horizontalement se lit mal au pouce, et c'est précisément l'écran où cet
 * acheteur est.
 *
 * Le bouton mène à la commande sur mesure (`#devis`) quand le marchand l'a
 * activée — c'est là que la demande part vraiment. Sinon il ne s'affiche pas :
 * un « Demander un devis » qui ne mène nulle part est pire que pas de bouton.
 */
export function WholesaleSection({ store, section, design }: SectionProps) {
  const w = store.theme.wholesale;
  if (!w.enabled) return null;

  const tiers = w.tiers.filter((t) => t.quantity.trim() && t.price.trim());
  if (tiers.length === 0) return null;

  const title = sectionTitle(section, store.templateId);

  // Le bouton ne s'affiche que si la demande sur mesure existe VRAIMENT : la
  // section activée ET un numéro pour la recevoir — c'est la double condition
  // que `OrderFormSection` applique pour se rendre. Sans elle, le bouton
  // enverrait vers une ancre qui ne pointe sur rien, et l'acheteur en gros
  // conclurait que la boutique est cassée à l'endroit exact où il allait
  // engager la plus grosse commande de la page.
  const canAsk = store.theme.orderForm.enabled
    && Boolean(resolveOrderPhone(
      store.theme.whatsapp.number, store.whatsappPhone, store.contactPhone,
    ));

  return (
    <Section design={design} label={title}>
      <SectionHeader
        design={design}
        title={title}
        eyebrow="Prix dégressifs"
        description={w.body.trim() || undefined}
      />

      {/* Sur téléphone : une carte par palier. */}
      <ul className="flex flex-col gap-2 sm:hidden">
        {tiers.map((t, i) => (
          <li
            key={i}
            className="flex items-center justify-between gap-4 border p-4"
            style={{
              borderColor:  'var(--st-border)',
              borderRadius: 'var(--st-radius-card)',
              background:   'var(--st-surface-2)',
            }}
          >
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-[var(--st-ink)]">{t.quantity}</p>
              {t.note.trim() && (
                <p className="mt-0.5 text-[12px] text-[var(--st-ink-3)]">{t.note}</p>
              )}
            </div>
            <p className="flex-shrink-0 text-[16px] font-semibold tabular-nums text-[var(--st-ink)]">
              {t.price}
            </p>
          </li>
        ))}
      </ul>

      {/* Sur grand écran : le tableau, qui se compare d'un coup d'œil. */}
      <div className="hidden sm:block">
        <table className="w-full border-collapse text-[14px]">
          <thead>
            <tr>
              <th
                scope="col"
                className="border-b px-3 py-2.5 text-left text-[12px] font-semibold uppercase tracking-wide text-[var(--st-ink-3)]"
                style={{ borderColor: 'var(--st-border)' }}
              >
                Quantité
              </th>
              <th
                scope="col"
                className="border-b px-3 py-2.5 text-right text-[12px] font-semibold uppercase tracking-wide text-[var(--st-ink-3)]"
                style={{ borderColor: 'var(--st-border)' }}
              >
                Prix
              </th>
            </tr>
          </thead>
          <tbody>
            {tiers.map((t, i) => (
              <tr key={i} style={{ background: i % 2 ? 'var(--st-surface-2)' : undefined }}>
                <td className="px-3 py-3">
                  <span className="font-semibold text-[var(--st-ink)]">{t.quantity}</span>
                  {t.note.trim() && (
                    <span className="ml-2 text-[13px] text-[var(--st-ink-3)]">{t.note}</span>
                  )}
                </td>
                <td className="px-3 py-3 text-right text-[15px] font-semibold tabular-nums text-[var(--st-ink)]">
                  {t.price}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canAsk && w.ctaLabel.trim() && (
        <a
          href={`${store.base}/#devis`}
          className="mt-6 inline-flex min-h-[48px] items-center gap-2 px-6 text-[15px] font-semibold transition hover:brightness-95"
          style={{
            background:   'var(--st-accent)',
            color:        'var(--st-accent-ink)',
            borderRadius: 'var(--st-radius-btn)',
          }}
        >
          {w.ctaLabel}
          <ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden />
        </a>
      )}
    </Section>
  );
}

// ── Forfaits ────────────────────────────────────────────────────────────────

/**
 * Deux à quatre formules, comparées côte à côte.
 *
 * Un seul forfait mis en avant, quoi qu'en dise la saisie : trois formules
 * toutes « recommandées » ne recommandent rien, et le marchand qui coche les
 * trois cases perd le seul effet qu'il cherchait. C'est le premier coché qui
 * gagne.
 *
 * Les avantages se saisissent une ligne par ligne. Ce format inélégant est le
 * seul qu'un marchand remplit depuis un téléphone — le même choix que le guide
 * des tailles.
 */
export function PackagesSection({ store, section, design }: SectionProps) {
  const p = store.theme.packages;
  if (!p.enabled) return null;

  const items = p.items.filter((i) => i.name.trim());
  if (items.length === 0) return null;

  const title      = sectionTitle(section, store.templateId);
  const highlight  = items.findIndex((i) => i.featured);
  const columns    = items.length >= 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-2';

  return (
    <Section design={design} label={title}>
      <SectionHeader
        design={design}
        title={title}
        eyebrow="Formules"
        description={p.body.trim() || undefined}
        align="center"
      />

      <div className={`grid gap-5 sm:grid-cols-2 ${columns}`}>
        {items.map((item, i) => {
          const featured = i === highlight;
          const features = item.features
            .split('\n')
            .map((f) => f.trim())
            .filter(Boolean)
            .slice(0, 10);

          return (
            <div
              key={i}
              className="flex flex-col border p-6"
              style={{
                borderColor:  featured ? 'var(--st-accent)' : 'var(--st-border)',
                borderWidth:  featured ? 2 : 1,
                borderRadius: 'var(--st-radius-card)',
                background:   featured ? 'var(--st-surface-2)' : 'var(--st-surface)',
                boxShadow:    featured ? 'var(--st-shadow-hover)' : 'var(--st-shadow)',
              }}
            >
              {featured && (
                <span
                  className="mb-3 self-start px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide"
                  style={{
                    background:   'var(--st-accent)',
                    color:        'var(--st-accent-ink)',
                    borderRadius: 'var(--st-radius-btn)',
                  }}
                >
                  Le plus choisi
                </span>
              )}

              <h3
                className="text-[18px] font-semibold text-[var(--st-ink)]"
                style={{ fontFamily: 'var(--st-font-heading)' }}
              >
                {item.name}
              </h3>

              {/* Le prix est du texte : « sur devis » est une réponse valide, et
                  un prestataire l'emploie souvent pour sa formule haute. */}
              {item.price.trim() && (
                <p className="mt-2 flex items-baseline gap-1.5">
                  <span className="text-[26px] font-semibold tabular-nums text-[var(--st-ink)]">
                    {item.price}
                  </span>
                  {item.period.trim() && (
                    <span className="text-[13px] text-[var(--st-ink-3)]">{item.period}</span>
                  )}
                </p>
              )}

              {item.body.trim() && (
                <p className="mt-3 text-[14px] leading-relaxed text-[var(--st-ink-2)]">
                  {item.body}
                </p>
              )}

              {features.length > 0 && (
                <ul className="mt-5 flex flex-col gap-2.5">
                  {features.map((f, j) => (
                    <li key={j} className="flex items-start gap-2.5 text-[14px] text-[var(--st-ink-2)]">
                      <Check
                        className="mt-0.5 h-4 w-4 flex-shrink-0"
                        strokeWidth={2.2}
                        style={{ color: 'var(--st-accent)' }}
                        aria-hidden
                      />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              )}

              {/* Le bouton pousse la carte vers le bas pour que trois formules
                  de longueurs différentes alignent quand même leurs boutons :
                  une colonne dont l'action flotte au milieu se lit comme une
                  colonne inachevée. */}
              {item.ctaLabel.trim() && item.ctaHref.trim() && (
                <a
                  href={storeLink(item.ctaHref, store.base)}
                  target={item.ctaHref.startsWith('http') ? '_blank' : undefined}
                  rel={item.ctaHref.startsWith('http') ? 'noopener noreferrer' : undefined}
                  className="mt-auto flex min-h-[48px] w-full items-center justify-center pt-0 text-[14px] font-semibold transition hover:brightness-95"
                  style={{
                    marginTop:    features.length > 0 ? '1.5rem' : '1.25rem',
                    background:   featured ? 'var(--st-accent)' : 'transparent',
                    color:        featured ? 'var(--st-accent-ink)' : 'var(--st-ink)',
                    border:       featured ? 'none' : '1px solid var(--st-border)',
                    borderRadius: 'var(--st-radius-btn)',
                  }}
                >
                  {item.ctaLabel}
                </a>
              )}
            </div>
          );
        })}
      </div>
    </Section>
  );
}

// ── Résultats obtenus ───────────────────────────────────────────────────────

/**
 * Le point de départ, le point d'arrivée, et la phrase du client.
 *
 * « Avant » et « après » sont deux blocs distincts et non un paragraphe : c'est
 * l'ÉCART qui est l'argument d'une prestation, et un texte continu le noie. Le
 * nom du client n'est pas obligatoire — beaucoup ne veulent pas être nommés, et
 * exiger le nom reviendrait à n'avoir aucun résultat à montrer.
 */
export function CaseStudiesSection({ store, section, design }: SectionProps) {
  const c = store.theme.caseStudies;
  if (!c.enabled) return null;

  const items = c.items.filter((i) => i.before.trim() && i.after.trim());
  if (items.length === 0) return null;

  const title = sectionTitle(section, store.templateId);

  return (
    <Section design={design} tone="surface-2" label={title}>
      <SectionHeader
        design={design}
        title={title}
        eyebrow="Résultats"
        description={c.body.trim() || undefined}
      />

      <div className="grid gap-5 lg:grid-cols-2">
        {items.map((item, i) => (
          <article
            key={i}
            className="flex flex-col overflow-hidden border"
            style={{
              borderColor:  'var(--st-border)',
              borderRadius: 'var(--st-radius-card)',
              background:   'var(--st-surface)',
              boxShadow:    'var(--st-shadow)',
            }}
          >
            {item.imageUrl && (
              <div className="relative w-full" style={{ aspectRatio: '16 / 9' }}>
                <StoreImage
                  src={item.imageUrl}
                  alt={item.client.trim() || 'Résultat obtenu'}
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  className="h-full w-full object-cover"
                />
              </div>
            )}

            <div className="flex flex-1 flex-col p-6">
              {item.client.trim() && (
                <p className="mb-4 text-[12px] font-semibold uppercase tracking-wide text-[var(--st-ink-3)]">
                  {item.client}
                </p>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--st-ink-3)]">
                    Au départ
                  </p>
                  <p className="text-[14px] leading-relaxed text-[var(--st-ink-2)]">{item.before}</p>
                </div>
                <div>
                  <p
                    className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider"
                    style={{ color: 'var(--st-accent)' }}
                  >
                    Aujourd'hui
                  </p>
                  <p className="text-[14px] font-medium leading-relaxed text-[var(--st-ink)]">
                    {item.after}
                  </p>
                </div>
              </div>

              {item.quote.trim() && (
                <blockquote
                  className="mt-5 border-t pt-4 text-[14px] italic leading-relaxed text-[var(--st-ink-2)]"
                  style={{ borderColor: 'var(--st-border)' }}
                >
                  <Quote
                    className="mb-1.5 h-4 w-4"
                    strokeWidth={1.8}
                    style={{ color: 'var(--st-ink-3)' }}
                    aria-hidden
                  />
                  {item.quote}
                </blockquote>
              )}
            </div>
          </article>
        ))}
      </div>
    </Section>
  );
}

// ── Journal & conseils ──────────────────────────────────────────────────────

/**
 * Les articles, là où le marchand les publie déjà.
 *
 * Rien n'est hébergé ici : le lien pointe vers une publication Facebook, un
 * billet, une vidéo. Une salle de rédaction dans un logiciel de gestion
 * resterait vide, et un journal vide sur une vitrine dit au visiteur que la
 * boutique est abandonnée.
 *
 * Une entrée sans lien reste affichée — un titre et un extrait valent une
 * lecture même sans page derrière — mais elle ne prétend pas être cliquable.
 */
export function JournalSection({ store, section, design }: SectionProps) {
  const j = store.theme.journal;
  if (!j.enabled) return null;

  const items = j.items.filter((i) => i.title.trim());
  if (items.length === 0) return null;

  const title = sectionTitle(section, store.templateId);

  return (
    <Section design={design} label={title}>
      <SectionHeader
        design={design}
        title={title}
        eyebrow="À lire"
        description={j.body.trim() || undefined}
      />

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item, i) => {
          const linked = item.href.trim().length > 0;
          const external = item.href.startsWith('http');

          const body = (
            <>
              {item.imageUrl && (
                <div
                  className="relative w-full overflow-hidden"
                  style={{ aspectRatio: '16 / 10', borderRadius: 'var(--st-radius-media)' }}
                >
                  <StoreImage
                    src={item.imageUrl}
                    alt={item.title}
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                  />
                </div>
              )}

              <div className={item.imageUrl ? 'mt-4' : ''}>
                {item.date.trim() && (
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--st-ink-3)]">
                    {item.date}
                  </p>
                )}
                <h3
                  className="text-[16px] font-semibold leading-snug text-[var(--st-ink)]"
                  style={{ fontFamily: 'var(--st-font-heading)' }}
                >
                  {item.title}
                </h3>
                {item.excerpt.trim() && (
                  <p className="mt-2 text-[14px] leading-relaxed text-[var(--st-ink-2)]">
                    {item.excerpt}
                  </p>
                )}
                {linked && (
                  <span
                    className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold"
                    style={{ color: 'var(--st-accent)' }}
                  >
                    Lire la suite
                    <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden />
                  </span>
                )}
              </div>
            </>
          );

          return linked ? (
            <a
              key={i}
              href={storeLink(item.href, store.base)}
              target={external ? '_blank' : undefined}
              rel={external ? 'noopener noreferrer' : undefined}
              className="group flex flex-col"
            >
              {body}
            </a>
          ) : (
            <article key={i} className="flex flex-col">{body}</article>
          );
        })}
      </div>

      {items.length >= 3 && (
        <p className="mt-6 flex items-center gap-2 text-[12px] text-[var(--st-ink-3)]">
          <Newspaper className="h-4 w-4" strokeWidth={1.6} aria-hidden />
          Publications de la boutique.
        </p>
      )}
    </Section>
  );
}

// ── Mur de vidéos ───────────────────────────────────────────────────────────

/**
 * Les vidéos, chacune reliée à un article du catalogue.
 *
 * Le vrai sujet de cette section n'est pas la vidéo : c'est le LIEN vers la
 * fiche. Le visiteur d'un vendeur social a vu le produit dans une vidéo, il
 * vient le retrouver — et sans ce lien, il repart le chercher dans le
 * catalogue, ou ne le cherche pas.
 *
 * Rien n'est embarqué. Quatre lecteurs sur une même page dépassent le
 * mégaoctet, et le trafic visé arrive d'un téléphone sur une connexion comptée.
 * La vignette vient de l'article lui-même quand le marchand n'en a pas fourni :
 * une image réelle de son catalogue, jamais un cadre gris.
 *
 * Un article épuisé n'est pas montré : envoyer le visiteur d'une vidéo vers une
 * fiche indisponible est le plus sûr moyen de le perdre pour de bon.
 */
export function VideoWallSection({ store, section, data, design }: SectionProps) {
  const v = store.theme.videoWall;
  if (!v.enabled) return null;

  const byId = new Map(data.products.map((p) => [p.id, p]));

  const items = v.items
    .filter((i) => i.url.trim())
    .map((item) => {
      const product = item.productId ? byId.get(item.productId) ?? null : null;
      return {
        ...item,
        // Le produit n'est retenu que s'il est encore commandable : la vidéo
        // reste, le lien tombe.
        product: product && (product.stock > 0 || product.allow_backorders) ? product : null,
      };
    });

  if (items.length === 0) return null;

  const title = sectionTitle(section, store.templateId);

  return (
    <Section design={design} label={title}>
      <SectionHeader
        design={design}
        title={title}
        eyebrow="En vidéo"
        description={v.body.trim() || undefined}
      />

      {/* Format vertical 9/16 : c'est celui dans lequel ces vidéos sont
          tournées, et les afficher en paysage les rognerait au milieu du sujet. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((item, i) => {
          const poster = item.posterUrl ?? item.product?.image_url ?? null;
          const label  = item.label.trim() || item.product?.name || 'Voir la vidéo';
          const price  = item.product && store.showPrices
            ? storeMoney(item.product.sale_price ?? item.product.price, store.currency)
            : null;

          return (
            <div key={i} className="flex flex-col">
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Voir la vidéo : ${label}`}
                className="group relative block w-full overflow-hidden"
                style={{
                  aspectRatio:  '9 / 16',
                  borderRadius: 'var(--st-radius-media)',
                  background:   'var(--st-surface-2)',
                }}
              >
                {poster && (
                  <StoreImage
                    src={poster}
                    alt={label}
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                    className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
                  />
                )}

                {/* Le voile ne sert pas la décoration : sans lui, le bouton de
                    lecture disparaît sur une vignette claire. */}
                <span
                  aria-hidden
                  className="absolute inset-0 flex items-center justify-center transition group-hover:bg-black/10"
                  style={{ background: 'rgba(14,24,34,0.18)' }}
                >
                  <PlayCircle className="h-11 w-11 text-white drop-shadow" strokeWidth={1.5} />
                </span>
              </a>

              {/* Le lien vers la fiche, qui est la raison d'être de la section. */}
              {item.product ? (
                <Link
                  href={`${store.base}/products/${item.product.id}`}
                  className="mt-2.5 flex items-baseline justify-between gap-2 text-[13px]"
                >
                  <span className="min-w-0 truncate font-medium text-[var(--st-ink)] underline-offset-4 hover:underline">
                    {item.product.name}
                  </span>
                  {price && (
                    <span className="flex-shrink-0 font-semibold tabular-nums text-[var(--st-ink)]">
                      {price}
                    </span>
                  )}
                </Link>
              ) : (
                item.label.trim() && (
                  <p className="mt-2.5 truncate text-[13px] font-medium text-[var(--st-ink-2)]">
                    {item.label}
                  </p>
                )
              )}
            </div>
          );
        })}
      </div>

      {items.some((i) => i.product) && (
        <p className="mt-5 flex items-center gap-2 text-[12px] text-[var(--st-ink-3)]">
          <Layers className="h-4 w-4" strokeWidth={1.6} aria-hidden />
          Touchez un nom pour ouvrir la fiche de l'article.
        </p>
      )}
    </Section>
  );
}
