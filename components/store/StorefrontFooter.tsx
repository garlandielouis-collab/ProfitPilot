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
import {
  Mail, MapPin, Phone, Instagram, Facebook, MessageCircle, ChevronDown, Clock,
} from 'lucide-react';
import { collectionHref } from '../../lib/storeTheme';
import { designFor, type DesignProfile } from '../../lib/storeDesign';
import { PaymentMarks } from './blocks/PaymentMarks';
import { offeredPayments } from '../../lib/storePayments';
import type { InfoPage } from '../../lib/storefrontPages';
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

/**
 * Une colonne du pied : dépliée sur grand écran, repliée sur téléphone (§13).
 *
 * ── Pourquoi deux rendus et non un seul qu'on déplierait ──────────────────
 *
 * Un pied de page complet, c'est trois listes et une dizaine de liens. Sur un
 * écran de 375 pixels, les colonnes s'empilent : le visiteur qui arrive en bas
 * de la page — c'est-à-dire celui qui n'a pas trouvé ce qu'il cherchait — se
 * retrouve devant deux écrans et demi de liens à faire défiler avant le dernier.
 * Replié, le même pied tient en un écran et montre ses quatre intitulés d'un
 * coup : le choix est visible, et une seule liste s'ouvre.
 *
 * L'attribut `open` d'un `<details>` est un booléen : il ne se conditionne pas
 * à la largeur de l'écran. Il n'existe donc pas de moyen de replier le MÊME
 * élément sous 640 pixels et de le laisser ouvert au-dessus — d'où deux
 * rendus, dont un seul est affiché à la fois. Celui qui ne l'est pas est en
 * `display: none`, donc absent de la grille et invisible aux lecteurs d'écran :
 * ni cellule fantôme, ni liens comptés deux fois.
 *
 * `<details>` natif : il s'ouvre sans JavaScript — rien de tout cela ne part
 * dans le paquet du visiteur — il est accessible au clavier sans qu'on s'en
 * occupe, et il reste trouvable au Ctrl+F même replié.
 */
function FooterColumn({
  heading, label, children,
}: {
  heading:  string;
  /** Le nom du repère de navigation, pour les lecteurs d'écran. */
  label:    string;
  children: React.ReactNode;
}) {
  return (
    <>
      <details
        className="group border-b sm:hidden"
        style={{ borderColor: 'var(--st-border)' }}
      >
        <summary className="flex min-h-[52px] cursor-pointer list-none items-center justify-between gap-3">
          <ColumnHeading>{heading}</ColumnHeading>
          <ChevronDown
            className="h-4 w-4 flex-shrink-0 text-[var(--st-ink-3)] transition-transform group-open:rotate-180"
            strokeWidth={2}
            aria-hidden
          />
        </summary>
        <nav aria-label={label} className="pb-2">{children}</nav>
      </details>

      <nav aria-label={label} className="hidden sm:block">
        <ColumnHeading>{heading}</ColumnHeading>
        <div className="mt-4">{children}</div>
      </nav>
    </>
  );
}

export function StorefrontFooter({
  store, categories = [], infoPages = [],
}: {
  store: StoreView;
  /** Les rayons, pour que le pied de page serve aussi de plan du site (§31). */
  categories?: StoreCategory[];
  /**
   * Les pages internes de cette vitrine, résolues par le layout.
   *
   * La liste est déjà filtrée : elle ne contient que les pages dont ce marchand
   * a la matière. C'est ce qui permet d'écrire la colonne sans une seule
   * condition ici — et ce qui garantit qu'aucun lien ne mène à une page
   * blanche, la même règle que le socle mobile.
   */
  infoPages?: InfoPage[];
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

  // Les horaires tels que le marchand les a saisis. Une ligne sans jour n'est
  // pas une ligne vide à afficher : c'est une ligne qu'il n'a pas remplie.
  const hours = store.theme.contact.hours.filter((h) => h.days.trim());

  // Ce que la caisse encaisse réellement, et rien d'autre.
  const payments = offeredPayments(store.paymentMethods);

  // La colonne de marque tient deux places quand elle est seule en face d'une
  // autre, et quatre quand elle l'est tout court : un nom de boutique perdu à
  // gauche d'un vide de trois colonnes se lit comme une page mal chargée.
  const columns = (categories.length > 0 ? 1 : 0)
    + (infoPages.length > 0 ? 1 : 0)
    + (contacts.length > 0 || hours.length > 0 ? 1 : 0);

  // Le nom occupe ce que les autres colonnes laissent. Écrit en table plutôt
  // qu'en cascade de ternaires : il y a maintenant quatre cas, et le troisième
  // manquait — la colonne « Informations » aurait débordé la grille.
  const brandSpan = ['lg:col-span-4', 'lg:col-span-3', 'lg:col-span-2', 'lg:col-span-1'][columns];

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
        {/* Sur téléphone, les colonnes sont des accordéons qui se touchent :
            leur filet inférieur fait la séparation, et quarante-huit pixels
            entre deux intitulés repliés les feraient lire comme quatre blocs
            sans rapport. L'écart revient dès que ce sont de vraies colonnes. */}
        <div className="grid gap-x-10 gap-y-0 sm:gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
          <div className={`${columns === 0 ? 'max-w-xl' : 'max-w-sm'} ${brandSpan} pb-8 sm:pb-0`}>
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
            <FooterColumn heading={design.mobile.catalogLabel} label="Rayons">
              <ul className="flex flex-col">
                <li>
                  <Link href={`${store.base}/products`} className={ROW}>Tout voir</Link>
                </li>
                {categories.slice(0, 6).map((c) => (
                  <li key={c.id}>
                    <Link href={collectionHref(store.base, c)} className={ROW}>{c.name}</Link>
                  </li>
                ))}
              </ul>
            </FooterColumn>
          )}

          {/* Les pages qui font d'une vitrine un site : qui nous sommes,
              comment on livre, ce qu'on reprend, ce qu'on répond. Elles
              vivaient en bas de la page d'accueil, sans adresse à elles — donc
              impossibles à envoyer par message ou à mettre en favori. */}
          {infoPages.length > 0 && (
            <FooterColumn heading="Informations" label="Informations">
              <ul className="flex flex-col">
                {infoPages.map((page) => (
                  <li key={page.key}>
                    <Link href={`${store.base}/${page.slug}`} className={ROW}>
                      {page.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </FooterColumn>
          )}

          {(contacts.length > 0 || hours.length > 0) && (
            <FooterColumn heading="Nous joindre" label="Nous joindre">
              <ul className="flex flex-col">
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

              {/* ── Les horaires ──────────────────────────────────────────
                  Ils étaient saisis dans l'éditeur et n'apparaissaient que
                  dans la section « Nous joindre » de la page d'accueil, si le
                  marchand l'avait activée. Le visiteur d'une fiche produit qui
                  se demande « est-ce que c'est ouvert maintenant ? » ne les
                  voyait donc jamais. Le pied de page est sur toutes les pages,
                  et c'est l'endroit où on va les chercher. */}
              {hours.length > 0 && (
                <dl className="mt-5 flex flex-col gap-1.5">
                  <dt className="mb-1 flex items-center gap-2 text-[12px] font-semibold text-[var(--st-ink-3)]">
                    <Clock className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={1.8} aria-hidden />
                    Horaires
                  </dt>
                  {hours.map((h, i) => (
                    <dd
                      key={`${h.days}-${i}`}
                      className="flex flex-wrap justify-between gap-x-4 text-[13px] text-[var(--st-ink-2)]"
                    >
                      <span>{h.days}</span>
                      {/* Un jour sans horaire n'est pas un jour sans
                          information : c'est un jour de fermeture, et c'est
                          précisément ce que le visiteur veut savoir. */}
                      <span className="tabular-nums text-[var(--st-ink-3)]">
                        {h.hours.trim() || 'Fermé'}
                      </span>
                    </dd>
                  ))}
                </dl>
              )}
            </FooterColumn>
          )}
        </div>

        {/* ── Les moyens de paiement ────────────────────────────────────────
            Ils ne figuraient que sous le bouton d'achat de la fiche produit.
            Or la question « est-ce que je peux payer avec MonCash ? » se pose
            AVANT d'ouvrir une fiche, et souvent décide de rester ou de partir :
            un visiteur qui n'a pas de carte bancaire — c'est-à-dire la grande
            majorité du trafic haïtien — cherche cette rangée-là en bas de page
            avant de regarder un seul prix.

            `offeredPayments` écarte les valeurs mortes restées dans les
            réglages d'anciennes boutiques : une marque affichée ici est une
            marque que la caisse encaisse réellement. Aucun moyen configuré,
            aucune rangée — pas une promesse de paiement par défaut. */}
        {payments.length > 0 && (
          <div
            /* Sur téléphone, le dernier accordéon ferme déjà par un filet. Un
               second filet 48 pixels plus bas n'ajoute pas une séparation : il
               dessine une bande vide, qui se lit comme une colonne oubliée.
               Le bloc se pose donc juste sous le filet existant, et ne reprend
               le sien qu'à partir du moment où les colonnes s'alignent — ou
               tout de suite si cette vitrine n'a aucune colonne à aligner. */
            className={`mt-6 pt-6 sm:mt-12 sm:border-t sm:pt-8 ${columns > 0 ? '' : 'border-t'}`}
            style={{ borderColor: 'var(--st-border)' }}
          >
            <ColumnHeading>Paiement</ColumnHeading>
            <PaymentMarks methods={store.paymentMethods} className="mt-4" />
          </div>
        )}

        <div
          className={`${payments.length > 0 ? 'mt-8' : 'mt-12'} flex flex-col gap-2 border-t pt-6 text-[12px] text-[var(--st-ink-3)] sm:flex-row sm:items-center sm:justify-between`}
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
