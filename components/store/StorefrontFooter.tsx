// ─────────────────────────────────────────────────────────────────────────────
// Le pied de vitrine
//
// Composant serveur : rien ici ne dépend de l'état du navigateur, donc rien ici
// ne part dans le bundle du visiteur.
//
// ── Ce qu'il était, et pourquoi c'était le maillon faible ──────────────────
//
// Une colonne de marque, une colonne de rayons, une colonne de contact, et une
// ligne de copyright. Identique sur les vingt-deux gabarits, et surtout : la
// moitié de sa largeur était vide sur grand écran. Un pied de page à moitié
// vide est la dernière chose que voit un visiteur qui hésite — et il dit
// « boutique montée en vingt minutes », quelle que soit la qualité du reste.
//
// Il manquait aussi tout ce qu'on cherche DANS un pied de page quand on est
// sur le point d'acheter : les horaires, les moyens de paiement acceptés, la
// zone de livraison, un moyen d'écrire tout de suite.
//
// ── Ce qu'il est maintenant ────────────────────────────────────────────────
//
//   1. Une colonne de marque avec l'action du métier — écrire sur WhatsApp
//      chez un commerçant, prendre rendez-vous chez un prestataire.
//   2. Le catalogue, sous le NOM que ce métier lui donne : « La boutique »
//      chez l'un, « La carte » chez le traiteur, « Nos lots » chez l'éleveur.
//   3. « Avant d'acheter » : les réponses que le marchand a réellement
//      écrites — livraison, paiement, tailles, questions — chacune pointant
//      sur la section correspondante de l'accueil.
//   4. Nous joindre : téléphone, courriel, adresse, ET les horaires.
//   5. Les moyens de paiement réellement acceptés par la caisse.
//
// ── La règle qui n'a pas changé ────────────────────────────────────────────
//
// Il ne montre que ce que le marchand a réellement renseigné. Une colonne sans
// contenu n'est pas une colonne vide : elle n'existe pas, et les autres se
// répartissent la largeur. Un pied de page avec « Facebook · Instagram ·
// TikTok » dont deux liens sur trois pointent vers le vide donne exactement
// l'impression qu'on cherche à éviter.
//
// ── Le téléphone ───────────────────────────────────────────────────────────
//
// Quatre colonnes empilées font un pied de page de deux écrans de haut, qu'on
// franchit au pouce sans rien lire. Les groupes deviennent donc des
// accordéons — `<details>` natifs, qui s'ouvrent sans JavaScript et que le
// lecteur d'écran annonce — et seule la colonne de marque reste dépliée.
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link';
import {
  Mail, MapPin, Phone, Instagram, Facebook, MessageCircle, Clock,
  CalendarCheck, CreditCard, ChevronDown,
} from 'lucide-react';
import { collectionHref } from '../../lib/storeTheme';
import { designFor } from '../../lib/storeDesign';
import { presetFor, type SectionKey } from '../../lib/storeSections';
import { buildBookingLink, resolveOrderPhone } from '../../lib/storeWhatsApp';
import type { StoreCategory, StoreView } from './types';

function normalizeSocial(value: string, base: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  return `${base}${v.replace(/^@/, '')}`;
}

type LinkItem = { href: string; label: string; external?: boolean };
type Group    = { title: string; links: LinkItem[] };

/**
 * Un groupe de liens : une colonne sur grand écran, un accordéon sur
 * téléphone. Le même balisage dans les deux cas — un `<details>` dont le
 * marqueur et le repliement sont neutralisés au-dessus de `md`. Deux rendus
 * séparés finiraient par diverger, et c'est le genre de divergence que
 * personne ne voit avant qu'un lien manque sur mobile.
 */
function FooterGroup({ group }: { group: Group }) {
  return (
    <details className="st-fgroup group border-b md:border-b-0" style={{ borderColor: 'var(--st-border)' }}>
      <summary
        className="flex min-h-[52px] cursor-pointer list-none items-center justify-between text-[13px] font-semibold uppercase tracking-wide text-[var(--st-ink-3)] md:pointer-events-none md:min-h-0 md:cursor-default"
      >
        {group.title}
        <ChevronDown
          className="h-4 w-4 transition-transform group-open:rotate-180 md:hidden"
          strokeWidth={1.8}
          aria-hidden
        />
      </summary>
      <ul className="st-fbody flex flex-col gap-1 pb-3 md:mt-4 md:pb-0">
        {group.links.map((l) => (
          <li key={`${l.href}-${l.label}`}>
            <Link
              href={l.href}
              {...(l.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              className="flex min-h-[40px] items-center text-[14px] text-[var(--st-ink-2)] transition hover:text-[var(--st-ink)]"
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </details>
  );
}

export function StorefrontFooter({
  store, categories = [], homeSections,
}: {
  store: StoreView;
  /** Les rayons, pour que le pied de page serve aussi de plan du site (§31). */
  categories?: StoreCategory[];
  /**
   * Les sections RÉELLEMENT rendues par la page d'accueil de CETTE vitrine.
   *
   * Sans elles, la colonne « Avant d'acheter » se fiait au thème seul — et le
   * thème remplit ses valeurs par défaut pour les vingt-deux gabarits, y
   * compris un guide des tailles chez un coach. Le pied de page promettait
   * donc « Guide des tailles » sur une vitrine de prestations, dont la page
   * d'accueil ne porte pas cette section : l'ancre ne menait nulle part.
   *
   * Le préréglage du gabarit sert de repli quand l'appelant ne les fournit
   * pas (l'aperçu, l'atelier) : c'est ce que la page d'accueil montrera tant
   * que le marchand n'a rien réordonné.
   */
  homeSections?: SectionKey[];
}) {
  const { social, contact } = store.theme;
  const design = designFor(store.templateId);
  const home   = store.base || '/';
  const onHome = new Set<SectionKey>(homeSections ?? presetFor(store.templateId));

  const socials = [
    { href: normalizeSocial(social.instagram, 'https://instagram.com/'), Icon: Instagram, label: 'Instagram' },
    { href: normalizeSocial(social.facebook,  'https://facebook.com/'),  Icon: Facebook,  label: 'Facebook' },
    { href: normalizeSocial(social.tiktok,    'https://tiktok.com/@'),   Icon: MessageCircle, label: 'TikTok' },
  ].filter((s): s is { href: string; Icon: typeof Instagram; label: string } => Boolean(s.href));

  // ── Le catalogue, sous le nom du métier ───────────────────────────────────
  //
  // « La boutique » chez un commerçant, « La carte » chez un traiteur, « Nos
  // lots » chez un éleveur. Le mot vient du gabarit, comme celui du socle
  // mobile : deux vocabulaires différents pour la même liste diraient au
  // visiteur que la page a été assemblée par deux personnes qui ne se sont pas
  // parlé.
  const catalogGroup: Group | null = categories.length > 0 ? {
    title: design.mobile.catalogLabel,
    links: [
      { href: `${store.base}/products`, label: 'Tout voir' },
      ...categories.slice(0, 6).map((c) => ({
        href:  collectionHref(store.base, c),
        label: c.name,
      })),
    ],
  } : null;

  // ── « Avant d'acheter » ───────────────────────────────────────────────────
  //
  // Chaque entrée n'existe QUE si le marchand a rempli la section
  // correspondante — c'est la même condition que la section elle-même vérifie
  // avant de se rendre. Sans cela, le pied de page promettrait une ancre qui
  // ne mène nulle part, ce qui est pire que de ne rien promettre.
  const helpLinks: LinkItem[] = [
    onHome.has('shipping') && store.theme.shipping.enabled
      ? { href: `${home}#livraison`, label: store.theme.shipping.title || 'Livraison & retours' } : null,
    onHome.has('payments') && store.theme.payments.enabled
      ? { href: `${home}#paiement`, label: store.theme.payments.title || 'Comment payer' } : null,
    onHome.has('size_guide') && store.theme.sizeGuide.enabled && store.theme.sizeGuide.rows.length > 0
      ? { href: `${home}#tailles`, label: store.theme.sizeGuide.title || 'Guide des tailles' } : null,
    onHome.has('faq') && store.theme.faq.enabled && store.theme.faq.items.length > 0
      ? { href: `${home}#faq`, label: store.theme.faq.title || 'Questions fréquentes' } : null,
  ].filter((l): l is LinkItem => l !== null);

  const helpGroup: Group | null =
    helpLinks.length > 0 ? { title: 'Avant d\'acheter', links: helpLinks } : null;

  const contacts = [
    store.contactPhone   ? { Icon: Phone,  text: store.contactPhone,   href: `tel:${store.contactPhone.replace(/\s/g, '')}` } : null,
    store.contactEmail   ? { Icon: Mail,   text: store.contactEmail,   href: `mailto:${store.contactEmail}` } : null,
    store.contactAddress ? { Icon: MapPin, text: store.contactAddress, href: null } : null,
  ].filter(Boolean) as Array<{ Icon: typeof Phone; text: string; href: string | null }>;

  const hours = contact.enabled ? contact.hours.filter((h) => h.days.trim()) : [];

  // ── L'action du métier ────────────────────────────────────────────────────
  //
  // Un prestataire ne se « commande » pas, il se réserve — et son pied de page
  // ne doit pas proposer d'écrire pour passer commande. Le lien est le même
  // que celui de l'en-tête et de la fiche : une seule façon d'entrer en
  // conversation, quelle que soit la page d'où l'on part.
  const phone = resolveOrderPhone(
    store.theme.whatsapp.number,
    store.whatsappPhone,
    store.contactPhone,
  );
  const booking = design.navCta === 'booking'
    ? buildBookingLink({ storeName: store.name, phone, email: store.contactEmail })
    : null;
  const whatsapp = !booking && store.whatsappPhone
    ? `https://wa.me/${store.whatsappPhone.replace(/[^\d]/g, '')}`
    : null;

  const groups = [catalogGroup, helpGroup].filter((g): g is Group => g !== null);

  // La largeur des colonnes suit ce qu'il y a VRAIMENT à montrer : une vitrine
  // sans rayon ni question fréquente ne doit pas afficher deux colonnes de
  // vide à droite de sa marque.
  const columnCount = 1 + groups.length + (contacts.length > 0 || hours.length > 0 ? 1 : 0);
  const gridCols =
    columnCount >= 4 ? 'md:grid-cols-4'
    : columnCount === 3 ? 'md:grid-cols-3'
    : 'md:grid-cols-2';

  return (
    <footer
      id="contact"
      className="mt-16 border-t"
      style={{ borderColor: 'var(--st-border)', background: 'var(--st-surface-2)' }}
    >
      <div className={`mx-auto grid max-w-6xl gap-x-8 gap-y-2 px-4 py-12 sm:px-6 md:gap-y-10 md:py-16 ${gridCols}`}>

        {/* ── La marque ──────────────────────────────────────────────────── */}
        <div className="pb-6 md:pb-0">
          <p
            className="text-[19px] font-semibold text-[var(--st-ink)]"
            style={{
              fontFamily:    'var(--st-font-heading)',
              textTransform: design.type.upper ? 'uppercase' : undefined,
              letterSpacing: design.type.upper ? '0.12em' : undefined,
            }}
          >
            {store.name}
          </p>
          {store.tagline && (
            <p className="mt-2 max-w-xs text-[14px] leading-relaxed text-[var(--st-ink-2)]">
              {store.tagline}
            </p>
          )}

          {(booking || whatsapp) && (
            <a
              href={booking ?? whatsapp ?? '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 inline-flex min-h-[48px] items-center gap-2 px-5 text-[14px] font-semibold transition hover:brightness-95"
              style={{
                background:   'var(--st-accent)',
                color:        'var(--st-accent-ink)',
                borderRadius: 'var(--st-radius-btn)',
              }}
            >
              {booking
                ? <><CalendarCheck className="h-4 w-4" strokeWidth={2.1} aria-hidden /> Prendre rendez-vous</>
                : <><MessageCircle className="h-4 w-4" strokeWidth={2.1} aria-hidden /> Écrire sur WhatsApp</>}
            </a>
          )}

          {socials.length > 0 && (
            <div className="mt-6 flex gap-2">
              {socials.map(({ href, Icon, label }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="flex h-11 w-11 items-center justify-center border text-[var(--st-ink-2)] transition hover:text-[var(--st-ink)]"
                  style={{ borderColor: 'var(--st-border)', borderRadius: 'var(--st-radius-btn)' }}
                >
                  <Icon className="h-4 w-4" strokeWidth={1.7} aria-hidden />
                </a>
              ))}
            </div>
          )}
        </div>

        {/* ── Les groupes de liens ───────────────────────────────────────── */}
        {groups.map((g) => <FooterGroup key={g.title} group={g} />)}

        {/* ── Nous joindre, horaires compris ─────────────────────────────── */}
        {(contacts.length > 0 || hours.length > 0) && (
          <details className="st-fgroup group border-b md:border-b-0" style={{ borderColor: 'var(--st-border)' }}>
            <summary className="flex min-h-[52px] cursor-pointer list-none items-center justify-between text-[13px] font-semibold uppercase tracking-wide text-[var(--st-ink-3)] md:pointer-events-none md:min-h-0 md:cursor-default">
              Nous joindre
              <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180 md:hidden" strokeWidth={1.8} aria-hidden />
            </summary>

            <ul className="st-fbody flex flex-col gap-2 pb-3 md:mt-4 md:pb-0">
              {contacts.map(({ Icon, text, href }) => (
                <li key={text} className="flex items-start gap-2 text-[14px] text-[var(--st-ink-2)]">
                  <Icon className="mt-3 h-4 w-4 flex-shrink-0 md:mt-0.5" strokeWidth={1.7} aria-hidden />
                  {href ? (
                    <a href={href} className="flex min-h-[40px] items-center hover:text-[var(--st-ink)] md:min-h-0">{text}</a>
                  ) : (
                    <span className="py-1">{text}</span>
                  )}
                </li>
              ))}
            </ul>

            {/* Les horaires. « Ouvert ? » est la question qu'on se pose avant
                de traverser la ville — et la seule information du pied de page
                qui n'existe nulle part ailleurs sur la vitrine. */}
            {hours.length > 0 && (
              <div className="st-fbody pb-4 md:mt-5 md:pb-0">
                <p className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-[var(--st-ink-3)]">
                  <Clock className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden />
                  Horaires
                </p>
                <ul className="mt-2 flex flex-col gap-1">
                  {hours.map((h) => (
                    <li key={h.days} className="flex flex-wrap justify-between gap-x-4 text-[13px] text-[var(--st-ink-2)]">
                      {/* Même précaution que la section Contact : sans
                          `flex-wrap`, la ligne refuse de descendre sous la
                          largeur de ses deux textes et pousse la page. */}
                      <span className="min-w-0">{h.days}</span>
                      <span className="min-w-0 tabular-nums">{h.hours || '—'}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </details>
        )}
      </div>

      {/* ── Les moyens de paiement réellement acceptés ───────────────────────
          Ils viennent des réglages de la caisse, jamais d'une liste écrite
          ici : un logo de carte dans un pied de page alors que la boutique ne
          prend que du comptant est un mensonge qui se découvre au pire moment,
          c'est-à-dire au paiement. */}
      {store.paymentMethods.length > 0 && (
        <div className="border-t" style={{ borderColor: 'var(--st-border)' }}>
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-5 sm:px-6">
            <span className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-[var(--st-ink-3)]">
              <CreditCard className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden />
              Paiement
            </span>
            {store.paymentMethods.map((m) => (
              <span
                key={m}
                className="border px-2.5 py-1 text-[12px] font-medium text-[var(--st-ink-2)]"
                style={{ borderColor: 'var(--st-border)', borderRadius: '6px' }}
              >
                {m}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── La ligne du bas ─────────────────────────────────────────────── */}
      <div className="border-t" style={{ borderColor: 'var(--st-border)' }}>
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-[12px] text-[var(--st-ink-3)] sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>© {new Date().getFullYear()} {store.name}</p>
          <Link href="https://profitpilot.app" className="hover:text-[var(--st-ink-2)]">
            Propulsé par ProfitPilot
          </Link>
        </div>
      </div>
    </footer>
  );
}
