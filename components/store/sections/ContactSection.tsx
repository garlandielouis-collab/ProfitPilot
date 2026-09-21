// ─────────────────────────────────────────────────────────────────────────────
// « Nous joindre »
//
// La section répondait à une question — « vous êtes ouverts à quelle heure ? »
// — avec deux colonnes de texte : les horaires à gauche, quatre liens bordés à
// droite. Techniquement juste, et exactement ce qu'on regarde sans rien y
// trouver : rien n'y disait de quel côté écrire, ni combien de temps on attend
// une réponse.
//
// Elle se lit maintenant dans l'ordre où la question se pose :
//
//   1. le bandeau   qui on est, et par où passer le plus vite
//   2. la fiche     le numéro, le courriel, l'adresse — avec leur délai
//   3. les trois    où c'est · quand c'est ouvert · le bouton pour écrire
//
// ── Les couleurs ne sont pas écrites ici ───────────────────────────────────
//
// Pas un `#` dans ce fichier. Tout passe par les jetons du gabarit
// (`--st-primary`, `--st-accent`, `--st-surface`…), qui sont posés par
// `storeTheme`. C'est ce qui fait que la même section sort vert bouteille chez
// « Style Chic », rose poudré chez « Beauty Studio » et bleu nuit chez « Tech
// Store » sans une seule condition sur le gabarit.
//
// ── Rien d'affiché qui ne soit rempli ──────────────────────────────────────
//
// Le §2 s'applique ligne à ligne. Pas de numéro, pas de ligne téléphone. Pas
// d'adresse, pas de plan. Pas d'horaires saisis, pas de carte d'horaires. La
// section entière disparaît quand il n'y a rien à joindre — un bandeau
// « Nous joindre » au-dessus de trois cadres vides est pire que son absence.
//
// ── La phrase sur la photo ─────────────────────────────────────────────────
//
// C'est la signature du marchand (`store.tagline`), en italique de la police de
// titre du gabarit. La maquette la montre en écriture manuscrite ; charger une
// police de plus pour une seule ligne décorative coûterait un téléchargement à
// chaque visiteur, sur des connexions souvent comptées. L'italique du gabarit
// fait le même travail — et elle est déjà là.
// ─────────────────────────────────────────────────────────────────────────────

import { Clock, Mail, MapPin, Phone, Headset, ShieldCheck, LifeBuoy, ChevronDown } from 'lucide-react';
import { Section } from './Shell';
import { MapCard } from '../blocks/MapCard';
import { SocialRow } from '../blocks/SocialLinks';
import { StoreImage } from '../blocks/StoreImage';
import { IMAGE_SIZES } from '../../../lib/storeImage';
import { artOr } from '../../../lib/storeArt';
import { sectionTitle } from '../../../lib/storeSections';
import { offeredPayments, PAYMENT_LABEL } from '../../../lib/storePayments';
import { resolveOrderPhone, toWhatsAppNumber } from '../../../lib/storeWhatsApp';
import type { SectionProps } from './types';
import type { StoreView } from '../types';

// ── Ce qu'il y a à joindre ──────────────────────────────────────────────────

type Row = {
  label: string;
  value: string;
  /** La précision sous la valeur : un délai, une portée. Jamais inventée. */
  note:  string | null;
  href:  string | null;
  Icon:  typeof Phone;
};

/**
 * Les trois lignes de la fiche.
 *
 * La note de chaque ligne vient d'une donnée réelle ou n'existe pas : les
 * horaires pour le téléphone, rien pour le courriel tant que personne ne s'est
 * engagé sur un délai, la zone de livraison pour l'adresse — et celle-là se lit
 * dans les modes d'expédition de la caisse, pas dans une phrase écrite ici.
 */
function contactRows(store: StoreView): Row[] {
  const rows: Row[] = [];
  const hours = store.theme.contact.hours.filter((h) => h.days.trim() && h.hours.trim());

  if (store.contactPhone) {
    rows.push({
      label: 'Téléphone',
      value: store.contactPhone,
      // La première ligne d'horaires renseignée résume l'accueil téléphonique.
      // Deux lignes sous un numéro seraient les horaires complets, et ils ont
      // déjà leur carte.
      note:  hours[0] ? `${hours[0].days} : ${hours[0].hours}` : null,
      href:  `tel:${store.contactPhone.replace(/\s/g, '')}`,
      Icon:  Phone,
    });
  }
  if (store.contactEmail) {
    rows.push({
      label: 'Courriel',
      value: store.contactEmail,
      note:  null,
      href:  `mailto:${store.contactEmail}`,
      Icon:  Mail,
    });
  }
  if (store.contactAddress) {
    const modes = store.shippingModes.filter((m) => m.label?.trim());
    rows.push({
      label: 'Adresse',
      value: store.contactAddress,
      note:  modes.length > 0 ? modes.map((m) => m.label).join(' · ') : null,
      href:  null,
      Icon:  MapPin,
    });
  }
  return rows;
}

/**
 * Les trois engagements du bandeau.
 *
 * Chacun se déduit d'un réglage : WhatsApp actif, une adresse de contact, des
 * moyens de paiement configurés. Aucun n'est une promesse ajoutée pour remplir
 * la ligne — un engagement affiché est un engagement que le client viendra
 * réclamer au marchand.
 */
function assurances(store: StoreView, whatsapp: string | null) {
  const payments = offeredPayments(store.paymentMethods);
  return [
    whatsapp
      ? { Icon: LifeBuoy, title: 'WhatsApp', note: 'Réponse rapide' }
      : null,
    store.contactEmail || store.contactPhone
      ? { Icon: Headset, title: 'Support client', note: 'Conseils & suivi' }
      : null,
    payments.length > 0
      ? {
          Icon:  ShieldCheck,
          title: 'Paiement sécurisé',
          note:  payments.map((p) => PAYMENT_LABEL[p]).join(' · '),
        }
      : null,
  ].filter(Boolean) as Array<{ Icon: typeof Phone; title: string; note: string }>;
}

// ── Les pièces ──────────────────────────────────────────────────────────────

/** Une ligne de la fiche de contact : pastille, intitulé, valeur, précision. */
function ContactRow({ label, value, note, href, Icon }: Row) {
  const body = (
    <>
      <span
        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full"
        style={{ background: 'var(--st-primary)', color: 'var(--st-primary-ink)' }}
      >
        <Icon className="h-[18px] w-[18px]" strokeWidth={1.9} aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block text-[12px] text-[var(--st-ink-3)]">{label}</span>
        <span className="block break-words text-[15px] font-semibold text-[var(--st-ink)]">{value}</span>
        {note && <span className="mt-0.5 block text-[12px] text-[var(--st-ink-3)]">{note}</span>}
      </span>
    </>
  );

  const shell = 'flex min-h-[56px] items-center gap-3.5 py-1';

  return (
    <li>
      {href ? (
        <a href={href} className={`${shell} transition hover:opacity-80`}>{body}</a>
      ) : (
        <span className={shell}>{body}</span>
      )}
    </li>
  );
}

/** La carte blanche qui porte les trois lignes. */
function ContactCard({ rows, className }: { rows: Row[]; className?: string }) {
  return (
    <div
      className={`p-5 sm:p-6 ${className ?? ''}`}
      style={{
        background:   'var(--st-surface)',
        border:       '1px solid var(--st-border)',
        borderRadius: 'var(--st-radius-card)',
        boxShadow:    'var(--st-shadow)',
      }}
    >
      <ul className="flex flex-col gap-1">
        {rows.map((r) => <ContactRow key={r.label} {...r} />)}
      </ul>
    </div>
  );
}

/** Le bouton qui ouvre la conversation, à la couleur d'action du gabarit. */
function WhatsAppButton({ href, className }: { href: string; className?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`flex min-h-[48px] items-center justify-center gap-2 px-5 text-[14px] font-semibold transition hover:opacity-90 ${className ?? ''}`}
      style={{
        background:   'var(--st-accent)',
        color:        'var(--st-accent-ink)',
        borderRadius: 'var(--st-radius-btn)',
      }}
    >
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-[18px] w-[18px]" aria-hidden>
        <path d="M12.04 2a9.9 9.9 0 0 0-8.5 14.95L2 22l5.2-1.5A9.9 9.9 0 1 0 12.04 2Zm0 1.8a8.1 8.1 0 1 1-4.1 15.08l-.3-.17-3.08.89.9-3-.2-.31A8.1 8.1 0 0 1 12.04 3.8Zm-3.2 4.1c-.16 0-.42.06-.64.3-.22.24-.85.83-.85 2.02 0 1.2.87 2.35.99 2.51.12.16 1.7 2.72 4.22 3.7 2.09.82 2.52.66 2.97.62.46-.04 1.47-.6 1.68-1.19.2-.58.2-1.08.14-1.18-.06-.1-.22-.16-.46-.28-.24-.12-1.43-.7-1.65-.79-.22-.08-.38-.12-.54.12-.16.24-.62.78-.76.94-.14.16-.28.18-.52.06-.24-.12-1.02-.37-1.94-1.2-.72-.63-1.2-1.42-1.34-1.66-.14-.24-.02-.37.1-.49.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.53-1.32-.73-1.8-.19-.47-.38-.4-.53-.41h-.45Z" />
      </svg>
      Discuter sur WhatsApp
      <span aria-hidden>→</span>
    </a>
  );
}

/** Le tableau des horaires, tel que le marchand les a saisis. */
function HoursList({ hours }: { hours: Array<{ days: string; hours: string }> }) {
  return (
    <ul className="flex flex-col">
      {hours.map((h, i) => (
        <li
          key={`${h.days}-${i}`}
          className="flex items-baseline justify-between gap-4 border-b py-2.5 last:border-0"
          style={{ borderColor: 'var(--st-border)' }}
        >
          <span className="text-[14px] text-[var(--st-ink-2)]">{h.days}</span>
          {/* Un jour sans heure n'est pas une ligne vide : c'est un jour de
              fermeture, et c'est précisément ce que le visiteur vient lire. */}
          <span className="tabular-nums text-[14px] font-semibold text-[var(--st-ink)]">
            {h.hours.trim() || 'Fermé'}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** L'enveloppe commune des trois cartes du bas. */
function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`p-5 sm:p-6 ${className ?? ''}`}
      style={{
        background:   'var(--st-surface)',
        border:       '1px solid var(--st-border)',
        borderRadius: 'var(--st-radius-card)',
      }}
    >
      {children}
    </div>
  );
}

/** Le titre d'une carte : pastille discrète + intitulé. */
function PanelHeading({ Icon, children }: { Icon: typeof Clock; children: React.ReactNode }) {
  return (
    <p className="mb-4 flex items-center gap-2.5">
      <span
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full"
        style={{ background: 'var(--st-primary-soft)', color: 'var(--st-primary)' }}
      >
        <Icon className="h-[18px] w-[18px]" strokeWidth={1.9} aria-hidden />
      </span>
      <span
        className="text-[17px] font-semibold text-[var(--st-ink)]"
        style={{ fontFamily: 'var(--st-font-heading)' }}
      >
        {children}
      </span>
    </p>
  );
}

// ── La section ──────────────────────────────────────────────────────────────

export function ContactSection({ store, section, design }: SectionProps) {
  const c = store.theme.contact;
  if (!c.enabled) return null;

  const hours    = c.hours.filter((h) => h.days.trim());
  const rows     = contactRows(store);
  const phone    = resolveOrderPhone(store.theme.whatsapp.number, store.whatsappPhone, store.contactPhone);
  const digits   = phone ? toWhatsAppNumber(phone) : null;
  const waHref   = digits ? `https://wa.me/${digits}` : null;
  const pills    = assurances(store, waHref);

  // Rien à joindre, rien à afficher.
  if (rows.length === 0 && hours.length === 0 && !waHref && !c.body.trim()) return null;

  const title = sectionTitle(section, store.templateId) || 'Nous joindre';
  const image = artOr(store.bannerUrl, store.templateId, 'hero');

  // Le bas de la section : ce qui existe, et rien de plus. Une carte seule
  // occupe toute la largeur plutôt que de laisser deux colonnes vides à côté.
  const panels = (store.contactAddress ? 1 : 0) + (hours.length > 0 ? 1 : 0) + (waHref ? 1 : 0);

  return (
    <Section design={design} tone="surface-2" label={title} full>
      {/* ── Le bandeau ──────────────────────────────────────────────────────
          La photo tient tout le cadre ; un voile parti du bord gauche la
          couvre là où le texte se pose, et la laisse intacte à droite. Sur
          téléphone le voile devient vertical et couvre tout : une colonne de
          texte sur 390 pixels n'a pas de « côté gauche » où se réfugier. */}
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div
          className="relative overflow-hidden"
          style={{ borderRadius: 'var(--st-radius-card)' }}
        >
          <StoreImage src={image} alt="" sizes={IMAGE_SIZES.hero} className="object-cover" quality={80} />
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(180deg, color-mix(in srgb, var(--st-surface) 92%, transparent) 0%,'
                + ' color-mix(in srgb, var(--st-surface) 82%, transparent) 100%)',
            }}
          />
          {/* Sur grand écran, le voile se redresse : il tient la moitié gauche
              et rend la photo au reste du cadre. */}
          <div
            className="absolute inset-0 hidden lg:block"
            style={{
              background:
                'linear-gradient(90deg, var(--st-surface) 0%,'
                + ' color-mix(in srgb, var(--st-surface) 94%, transparent) 42%,'
                + ' transparent 78%)',
            }}
          />

          <div className="relative grid gap-8 p-6 sm:p-10 lg:grid-cols-[1fr_380px] lg:items-center lg:gap-12 lg:p-12">
            <div className="min-w-0">
              <p
                className="text-[11px] font-semibold uppercase"
                style={{ letterSpacing: '0.18em', color: 'var(--st-accent)' }}
              >
                Restons en contact
              </p>
              <h2
                className="mt-3 text-[var(--st-ink)]"
                style={{
                  fontFamily:    'var(--st-font-heading)',
                  fontSize:      'var(--st-h1)',
                  fontWeight:    design.type.upper ? 500 : 600,
                  letterSpacing: 'var(--st-tracking)',
                  textTransform: design.type.upper ? 'uppercase' : undefined,
                  lineHeight:    1.1,
                }}
              >
                {title}
              </h2>
              {c.body.trim() && (
                <p className="mt-4 max-w-md text-[15px] leading-relaxed text-[var(--st-ink-2)]">
                  {c.body.trim()}
                </p>
              )}

              {pills.length > 0 && (
                <ul className="mt-7 flex flex-wrap gap-x-7 gap-y-4">
                  {pills.map(({ Icon, title: t, note }) => (
                    <li key={t} className="flex items-center gap-2.5">
                      <span
                        className="flex h-10 w-10 flex-shrink-0 items-center justify-center"
                        style={{
                          background:   'var(--st-primary-soft)',
                          color:        'var(--st-primary)',
                          borderRadius: 'var(--st-radius-btn)',
                        }}
                      >
                        <Icon className="h-[18px] w-[18px]" strokeWidth={1.9} aria-hidden />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[13px] font-semibold text-[var(--st-ink)]">{t}</span>
                        <span className="block text-[12px] text-[var(--st-ink-3)]">{note}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {/* Les réseaux, sous les garanties : le visiteur qui ne veut ni
                  téléphoner ni écrire passe par là. Même liste qu'au pied de
                  page — voir `blocks/SocialLinks`. Sans cadre, parce que le
                  bandeau porte déjà une photo sous son voile. */}
              <SocialRow store={store} look="bare" className="mt-6 -ml-1.5" />
            </div>

            {rows.length > 0 && <ContactCard rows={rows} />}
          </div>

          {/* La signature du marchand, posée sur la partie restée photo. Elle
              n'existe que s'il en a écrit une, et seulement là où il reste de
              la photo pour la porter. */}
          {store.tagline && (
            <p
              className="pointer-events-none absolute bottom-8 right-10 hidden max-w-[240px] text-right text-[19px] leading-snug xl:block"
              style={{
                fontFamily: 'var(--st-font-heading)',
                fontStyle:  'italic',
                color:      'var(--st-ink)',
                opacity:    0.7,
              }}
            >
              {store.tagline}
            </p>
          )}
        </div>

        {/* ── Le plan, les horaires, le bouton ──────────────────────────── */}
        {panels > 0 && (
          <div
            className={`mt-6 grid gap-5 ${
              panels === 3 ? 'md:grid-cols-3' : panels === 2 ? 'md:grid-cols-2' : ''
            }`}
          >
            {store.contactAddress && (
              <MapCard address={store.contactAddress} height="h-[200px]" />
            )}

            {hours.length > 0 && (
              <Panel>
                <PanelHeading Icon={Clock}>Nos horaires</PanelHeading>
                <HoursList hours={hours} />
              </Panel>
            )}

            {waHref && (
              <Panel className="flex flex-col">
                <PanelHeading Icon={Headset}>Besoin d’aide ou d’un conseil ?</PanelHeading>
                <p className="mb-5 text-[14px] leading-relaxed text-[var(--st-ink-2)]">
                  Écrivez-nous sur WhatsApp, on vous répond rapidement.
                </p>
                <WhatsAppButton href={waHref} className="mt-auto w-full" />
              </Panel>
            )}
          </div>
        )}
      </div>
    </Section>
  );
}

/**
 * La variante repliée, pour la PAGE « Nous joindre » sur téléphone.
 *
 * Le `<details>` natif : il s'ouvre sans JavaScript, il est accessible au
 * clavier sans qu'on s'en occupe, et il reste trouvable au Ctrl+F même replié.
 * Exporté à part parce que la page de contact l'utilise et que la section
 * d'accueil, elle, montre les horaires dépliés — on n'y arrive pas pour eux.
 */
export function CollapsibleHours({ hours }: { hours: Array<{ days: string; hours: string }> }) {
  if (hours.length === 0) return null;

  return (
    <details
      className="group"
      style={{
        background:   'var(--st-surface)',
        border:       '1px solid var(--st-border)',
        borderRadius: 'var(--st-radius-card)',
      }}
    >
      <summary className="flex min-h-[52px] cursor-pointer list-none items-center justify-between gap-3 px-5">
        <span className="flex items-center gap-2.5">
          <Clock className="h-[18px] w-[18px] text-[var(--st-ink-3)]" strokeWidth={1.9} aria-hidden />
          <span className="text-[15px] font-semibold text-[var(--st-ink)]">Nos horaires</span>
        </span>
        <ChevronDown
          className="h-4 w-4 flex-shrink-0 text-[var(--st-ink-3)] transition group-open:rotate-180"
          strokeWidth={2}
          aria-hidden
        />
      </summary>
      <div className="px-5 pb-4">
        <HoursList hours={hours} />
      </div>
    </details>
  );
}
