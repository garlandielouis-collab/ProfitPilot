// ─────────────────────────────────────────────────────────────────────────────
// Le pied de vitrine
//
// Composant serveur : rien ici ne dépend de l'état du navigateur, donc rien ici
// ne part dans le bundle du visiteur.
//
// Il ne montre que ce que le marchand a réellement renseigné. Un pied de page
// avec « Facebook · Instagram · TikTok » dont deux liens sur trois pointent vers
// le vide donne exactement l'impression qu'on cherche à éviter : une boutique
// montée à la hâte.
//
// ── Pourquoi il a été repris ────────────────────────────────────────────────
//
// `sections/Shell.tsx` pose la règle du système : « l'espacement vient de
// `--st-section-y`, posé par le gabarit. Une section n'a plus le droit d'avoir
// un avis sur sa propre hauteur. Le titre suit la même règle : sa taille, sa
// casse et son lettrage viennent du profil. »
//
// Le pied de page était le dernier morceau de la vitrine à n'en rien savoir. Il
// écrivait `mt-16`, `py-12`, `text-[18px]`, `text-[13px]`, `rounded-[8px]` —
// cinq décisions prises une fois pour les vingt-deux gabarits. Conséquence
// visible : sur Mode et Luxe, dont TOUT est en capitales espacées jusqu'au nom
// de la boutique dans l'en-tête, le pied de page rendait ce même nom en bas de
// casse, dans une taille qui n'appartenait à aucune échelle. La page changeait
// de voix à sa dernière ligne.
//
// Il ne décide plus de rien :
//
//   rythme    `--st-section-y`, comme toute section
//   nom       la graphie de l'en-tête — le marchand s'annonce pareil aux deux
//             bouts de la page
//   intitulés le sur-titre canonique de `SectionHeader` (11px, 0.18em)
//   angles    `--st-radius-btn`
//   en-tête   sombre ⇒ pied sombre : sur les gabarits dont l'en-tête est un
//             aplat de la couleur de structure, un pied resté clair coupait la
//             page en deux. Les variables sont redéfinies localement, comme
//             dans `StorefrontHeader` : tout ce que porte le pied suit sans le
//             savoir.
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link';
import { Mail, MapPin, Phone, Instagram, Facebook, MessageCircle } from 'lucide-react';
import { collectionHref } from '../../lib/storeTheme';
import { designFor, type DesignProfile } from '../../lib/storeDesign';
import type { StoreCategory, StoreView } from './types';

function normalizeSocial(value: string, base: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  return `${base}${v.replace(/^@/, '')}`;
}

/**
 * L'intitulé d'une colonne.
 *
 * Exactement le sur-titre de `SectionHeader` — 11px, capitales, 0.18em d'écart.
 * Il ne suit PAS `design.type.eyebrow` : là-bas le sur-titre est un ornement
 * éditorial, qu'un gabarit dense a raison de taire. Ici c'est l'étiquette d'une
 * colonne, et une colonne sans étiquette est une liste de liens sans titre.
 */
function ColumnHeading({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-[11px] font-semibold uppercase text-[var(--st-ink-3)]"
      style={{ letterSpacing: '0.18em' }}
    >
      {children}
    </p>
  );
}

/** Une entrée de liste : toute la ligne est tactile, l'icône reste centrée dessus. */
const ROW = 'flex min-h-[44px] items-center gap-2 text-[14px] text-[var(--st-ink-2)] transition hover:text-[var(--st-ink)]';

export function StorefrontFooter({
  store, categories = [],
}: {
  store: StoreView;
  /** Les rayons, pour que le pied de page serve aussi de plan du site (§31). */
  categories?: StoreCategory[];
}) {
  const design: DesignProfile = designFor(store.templateId);
  const { social } = store.theme;

  const socials = [
    { href: normalizeSocial(social.instagram, 'https://instagram.com/'), Icon: Instagram, label: 'Instagram' },
    { href: normalizeSocial(social.facebook,  'https://facebook.com/'),  Icon: Facebook,  label: 'Facebook' },
    { href: normalizeSocial(social.tiktok,    'https://tiktok.com/@'),   Icon: MessageCircle, label: 'TikTok' },
  ].filter((s): s is { href: string; Icon: typeof Instagram; label: string } => Boolean(s.href));

  const contacts = [
    store.contactPhone   ? { Icon: Phone,  text: store.contactPhone,   href: `tel:${store.contactPhone.replace(/\s/g, '')}` } : null,
    store.contactEmail   ? { Icon: Mail,   text: store.contactEmail,   href: `mailto:${store.contactEmail}` } : null,
    store.contactAddress ? { Icon: MapPin, text: store.contactAddress, href: null } : null,
  ].filter(Boolean) as Array<{ Icon: typeof Phone; text: string; href: string | null }>;

  // La colonne de marque tient deux places quand elle est seule en face d'une
  // autre, et quatre quand elle l'est tout court : un nom de boutique perdu à
  // gauche d'un vide de trois colonnes se lit comme une page mal chargée.
  const columns = (categories.length > 0 ? 1 : 0) + (contacts.length > 0 ? 1 : 0);

  return (
    <footer
      id="contact"
      className="border-t"
      style={{
        // L'inversion de `StorefrontHeader`, à l'identique : sur les gabarits
        // dont l'en-tête est sombre, le pied l'est aussi, et tout ce qu'il
        // contient lit les mêmes variables sans savoir qu'elles ont changé.
        ...(design.headerDark
          ? {
              ['--st-surface'   as string]: 'var(--st-primary)',
              ['--st-surface-2' as string]: 'var(--st-primary)',
              ['--st-ink'       as string]: 'var(--st-primary-ink)',
              ['--st-ink-2'     as string]: 'color-mix(in srgb, var(--st-primary-ink) 78%, transparent)',
              ['--st-ink-3'     as string]: 'color-mix(in srgb, var(--st-primary-ink) 58%, transparent)',
              ['--st-border'    as string]: 'color-mix(in srgb, var(--st-primary-ink) 20%, transparent)',
            }
          : null),
        borderColor: 'var(--st-border)',
        background:  'var(--st-surface-2)',
        // Le rythme du gabarit, jamais celui du pied de page.
        paddingTop:    'var(--st-section-y)',
        paddingBottom: 'var(--st-section-y)',
      }}
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
          <div className={columns === 2 ? 'max-w-sm lg:col-span-2' : columns === 1 ? 'max-w-sm lg:col-span-3' : 'max-w-xl lg:col-span-4'}>
            <p
              className="text-[var(--st-ink)]"
              style={{
                fontFamily:    'var(--st-font-heading)',
                // La taille d'un titre de section : le nom grandit avec le
                // gabarit au lieu de rester à 18 pixels sur les vingt-deux.
                fontSize:      'var(--st-h2)',
                fontWeight:    design.type.upper ? 500 : 600,
                letterSpacing: design.type.upper ? '0.18em' : 'var(--st-tracking)',
                textTransform: design.type.upper ? 'uppercase' : undefined,
                lineHeight:    1.2,
              }}
            >
              {store.name}
            </p>

            {store.tagline && (
              <p className="mt-3 text-[14px] leading-relaxed text-[var(--st-ink-2)]">
                {store.tagline}
              </p>
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
                    className="flex h-11 w-11 items-center justify-center border text-[var(--st-ink-2)] transition hover:border-[var(--st-ink-2)] hover:text-[var(--st-ink)]"
                    style={{ borderColor: 'var(--st-border)', borderRadius: 'var(--st-radius-btn)' }}
                  >
                    <Icon className="h-4 w-4" strokeWidth={1.8} aria-hidden />
                  </a>
                ))}
              </div>
            )}
          </div>

          {categories.length > 0 && (
            <nav aria-label="Rayons">
              <ColumnHeading>{design.mobile.catalogLabel}</ColumnHeading>
              <ul className="mt-4 flex flex-col">
                <li>
                  <Link href={`${store.base}/products`} className={ROW}>Tout voir</Link>
                </li>
                {categories.slice(0, 6).map((c) => (
                  <li key={c.id}>
                    <Link href={collectionHref(store.base, c)} className={ROW}>{c.name}</Link>
                  </li>
                ))}
              </ul>
            </nav>
          )}

          {contacts.length > 0 && (
            <div>
              <ColumnHeading>Nous joindre</ColumnHeading>
              <ul className="mt-4 flex flex-col">
                {contacts.map(({ Icon, text, href }) => (
                  <li key={text}>
                    {href ? (
                      <a href={href} className={ROW}>
                        <Icon className="h-4 w-4 flex-shrink-0" strokeWidth={1.8} aria-hidden />
                        {text}
                      </a>
                    ) : (
                      // Une adresse n'est pas un lien : elle garde la hauteur
                      // de ligne de ses voisines, pas leur survol.
                      <span className={`${ROW} hover:text-[var(--st-ink-2)]`}>
                        <Icon className="h-4 w-4 flex-shrink-0" strokeWidth={1.8} aria-hidden />
                        {text}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div
          className="mt-12 flex flex-col gap-2 border-t pt-6 text-[12px] text-[var(--st-ink-3)] sm:flex-row sm:items-center sm:justify-between"
          style={{ borderColor: 'var(--st-border)' }}
        >
          <p>© {new Date().getFullYear()} {store.name}</p>
          {/* Un lien qui SORT de la boutique : une balise `a` avec `target`, pas
              un `Link` de Next. Le visiteur qui clique par curiosité revient
              sur son panier en fermant l'onglet, au lieu de le perdre. */}
          <a
            href="https://profitpilot.app"
            target="_blank"
            rel="noopener noreferrer"
            className="transition hover:text-[var(--st-ink-2)]"
          >
            Propulsé par ProfitPilot
          </a>
        </div>
      </div>
    </footer>
  );
}
