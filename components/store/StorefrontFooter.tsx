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
//   couleurs  le pied est l'ANCRE SOMBRE de la page, sur les vingt-trois
//             gabarits. Il l'était déjà sur les deux dont l'en-tête est sombre ;
//             il l'est maintenant partout, parce que c'est ce que la maquette
//             demande et parce que la palette le permet sans exception :
//             `palette.primary` est par contrat la couleur de STRUCTURE —
//             « navigation, titres, aplats sombres » — et les vingt-trois
//             presets y posent un ton foncé (#141B22 chez Proximité, #160B24
//             chez Social, #3A2A1B chez Artisan…). Les variables sont
//             redéfinies localement, comme dans `StorefrontHeader` : tout ce
//             que porte le pied suit sans le savoir, et le pied sort vert
//             bouteille chez Style Chic et brun chez Artisan sans une seule
//             condition sur le gabarit. Mesuré : les vingt-trois primaires ont
//             une luminance relative sous 0,08. Et le marchand qui poserait sa
//             PROPRE couleur claire ne casse rien — `--st-primary-ink` vient de
//             `readableInk()`, qui rend une encre foncée sur un fond clair.
//
// ── Ce que la maquette a ajouté ────────────────────────────────────────────
//
// Trois choses, et aucune n'invente sa matière :
//
//   la lettre  le formulaire d'inscription, celui de la section d'accueil
//              (`NewsletterForm`) — une seule mécanique, un seul carnet
//              d'adresses. Il suit l'interrupteur « Newsletter » du marchand :
//              le pied ne rallume pas ce qu'il a éteint.
//   le paiement il remonte dans la colonne de marque, sous les réseaux, à la
//              place qu'il occupe sur la maquette. Il fermait la page ; il
//              appartient à l'identité, pas au colophon.
//   le retour  un bouton « Haut de page » en fin de pied, sur téléphone. Le
//              pied est le bas d'une page qui fait sept mille pixels : sans
//              lui, revenir au panier est un geste de pouce de huit écrans.
//              Il est DANS le flux, pas flottant — le coin bas-droit est déjà
//              pris par le socle mobile et la bulle d'aide (§4).
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link';
import { Mail, MapPin, Phone, ChevronDown, Clock, ArrowUp } from 'lucide-react';
import { collectionHref } from '../../lib/storeTheme';
import { designFor, type DesignProfile } from '../../lib/storeDesign';
import { PaymentMarks } from './blocks/PaymentMarks';
import { SocialRow } from './blocks/SocialLinks';
import { NewsletterForm } from './sections/NewsletterForm';
import { offeredPayments } from '../../lib/storePayments';
import type { InfoPage } from '../../lib/storefrontPages';
import type { StoreCategory, StoreView } from './types';

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
const ROW = 'flex min-h-[44px] min-w-0 items-center gap-2 break-words text-[14px] text-[var(--st-ink-2)] transition hover:text-[var(--st-ink)]';

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
  heading, label, span = '', children,
}: {
  heading:  string;
  /** Le nom du repère de navigation, pour les lecteurs d'écran. */
  label:    string;
  /**
   * La place de la colonne dans la grille de douze.
   *
   * Portée par les DEUX rendus, et pas par une enveloppe : un `div` autour des
   * deux ferait de la colonne une cellule qui contient une cellule, et le
   * repli de l'accordéon — qui compte sur le filet de son voisin — se
   * décalerait d'un cran sur téléphone.
   */
  span?:    string;
  children: React.ReactNode;
}) {
  return (
    <>
      <details
        className={`group border-b sm:hidden ${span}`}
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

      <nav aria-label={label} className={`hidden sm:block ${span}`}>
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

  /**
   * La lettre d'information, telle que le marchand l'a réglée.
   *
   * Le pied ne RALLUME pas ce qu'il a éteint : l'interrupteur « Newsletter » de
   * l'éditeur commande les deux endroits où le formulaire paraît, la section
   * d'accueil et cette carte. Un marchand qui ne veut pas collecter d'adresses
   * n'en collecte nulle part.
   */
  const letter = store.theme.newsletter;

  // ── La grille de la maquette ───────────────────────────────────────────────
  //
  // Douze colonnes : la marque en tient trois, chaque liste deux, la carte de
  // la lettre trois. La marque prend ce que les absentes laissent — une
  // boutique sans rayon ni page interne n'a pas un nom coincé à gauche d'un
  // vide de neuf colonnes.
  //
  const columns = (categories.length > 0 ? 1 : 0)
    + (infoPages.length > 0 ? 1 : 0)
    + (contacts.length > 0 || hours.length > 0 ? 1 : 0);

  // Les classes sont ÉCRITES, pas construites : Tailwind lit le source pour
  // décider ce qu'il génère, et une classe assemblée à l'exécution
  // (`lg:col-span-${n}`) n'existe dans aucun fichier — elle ne serait donc
  // jamais produite, et la colonne retomberait silencieusement à sa largeur
  // par défaut. Le tableau est indexé par le nombre de listes présentes.
  const BRAND_SPAN = {
    avecLettre: ['lg:col-span-9', 'lg:col-span-7', 'lg:col-span-5', 'lg:col-span-3'],
    sansLettre: ['lg:col-span-12', 'lg:col-span-10', 'lg:col-span-8', 'lg:col-span-6'],
  } as const;
  const brandSpan = BRAND_SPAN[letter.enabled ? 'avecLettre' : 'sansLettre'][columns];

  return (
    <footer
      id="contact"
      className="border-t"
      style={{
        // L'ancre sombre. Les variables sont redéfinies ICI, une fois : tout ce
        // que le pied contient — titres, liens, filets, marques de paiement,
        // formulaire — lit `--st-ink` et `--st-border` sans savoir qu'elles ne
        // valent plus la même chose qu'au-dessus. C'est ce qui permet de
        // retourner le pied sans toucher à une seule de ses vingt règles.
        //
        // `--st-panel` n'existe qu'ici : la carte de la lettre d'information est
        // un aplat LÉGÈREMENT plus clair que le fond, comme sur la maquette. Un
        // second ton tiré du fond lui-même, donc juste sur les vingt-trois.
        ['--st-surface'   as string]: 'var(--st-primary)',
        ['--st-surface-2' as string]: 'var(--st-primary)',
        ['--st-panel'     as string]: 'color-mix(in srgb, var(--st-primary-ink) 7%, var(--st-primary))',
        ['--st-ink'       as string]: 'var(--st-primary-ink)',
        ['--st-ink-2'     as string]: 'color-mix(in srgb, var(--st-primary-ink) 78%, transparent)',
        ['--st-ink-3'     as string]: 'color-mix(in srgb, var(--st-primary-ink) 58%, transparent)',
        ['--st-border'    as string]: 'color-mix(in srgb, var(--st-primary-ink) 20%, transparent)',
        borderColor: 'var(--st-border)',
        background:  'var(--st-surface-2)',
        color:       'var(--st-ink)',
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
        <div className="grid gap-x-10 gap-y-0 sm:gap-y-12 sm:grid-cols-2 lg:grid-cols-12">
          <div className={`${columns === 0 ? 'max-w-xl' : 'max-w-sm'} ${brandSpan} pb-8 sm:pb-0`}>
            <p
              className="text-[var(--st-ink)]"
              style={{
                fontFamily:    'var(--st-font-heading)',
                // La taille d'un titre de section : le nom grandit avec le
                // gabarit au lieu de rester à 18 pixels sur les vingt-trois.
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

            {/* Les cinq réseaux, dessinés une seule fois pour toute la vitrine :
                voir `blocks/SocialLinks`. SANS cadre ici : sur l'aplat sombre
                du pied, un glyphe plein se tient tout seul, et cinq carrés
                bordés côte à côte feraient une rangée de boutons là où la
                maquette ne montre que des logos. */}
            <SocialRow store={store} look="bare" className="mt-6 -ml-2.5" />

            {/* ── Les moyens de paiement ──────────────────────────────────
                Ils fermaient la page, sous les colonnes. Ils remontent ici,
                sous les réseaux et derrière un filet : « MonCash · NatCash »
                n'est pas un colophon, c'est la réponse à la question qui
                décide de rester — un visiteur sans carte bancaire, c'est-à-dire
                la grande majorité du trafic haïtien, la cherche avant de
                regarder un seul prix.

                `offeredPayments` écarte les valeurs mortes restées dans les
                réglages d'anciennes boutiques : une marque affichée est une
                marque que la caisse encaisse réellement. Aucun moyen
                configuré, aucune rangée — pas une promesse par défaut. */}
            {payments.length > 0 && (
              <div className="mt-7 border-t pt-6" style={{ borderColor: 'var(--st-border)' }}>
                <PaymentMarks methods={store.paymentMethods} onDark />
              </div>
            )}
          </div>

          {categories.length > 0 && (
            <FooterColumn heading={design.mobile.catalogLabel} label="Rayons" span="lg:col-span-2">
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
            <FooterColumn heading="Informations" label="Informations" span="lg:col-span-2">
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
            <FooterColumn heading="Nous joindre" label="Nous joindre" span="lg:col-span-2">
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

          {/* ── Restez connecté ─────────────────────────────────────────────
              La carte de la maquette : un aplat légèrement plus clair que le
              pied, posé dans la grille comme une quatrième colonne large.

              Le formulaire est CELUI de la section d'accueil, importé tel quel.
              En écrire un second ici aurait donné deux mécaniques, deux
              messages de confirmation et, le jour d'une correction, une seule
              des deux corrigée — c'est exactement ce que le registre des
              sections existe pour éviter. L'adresse part dans le carnet de
              clients du marchand, avec son consentement marqué, et rien ne
              promet un envoi que personne n'a encore écrit. */}
          {letter.enabled && (
            <div className="lg:col-span-3 pt-8 sm:pt-0">
              <div
                className="p-6"
                style={{
                  background:   'var(--st-panel)',
                  borderRadius: 'var(--st-radius-card)',
                }}
              >
                <p className="flex items-center gap-2.5 text-[15px] font-semibold text-[var(--st-ink)]">
                  <Mail className="h-4 w-4 flex-shrink-0" strokeWidth={1.9} aria-hidden />
                  {letter.title}
                </p>
                {letter.body.trim() && (
                  <p className="mt-2 text-[13px] leading-relaxed text-[var(--st-ink-2)]">
                    {letter.body.trim()}
                  </p>
                )}
                <NewsletterForm store={store} layout="stacked" />
              </div>
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

        {/* ── Haut de page ────────────────────────────────────────────────
            Sur téléphone seulement : sur un écran à souris, la barre de
            défilement et la touche Origine font déjà ce travail.

            C'est une ANCRE, pas un bouton : `href="#"` remonte sans une ligne
            de JavaScript, donc sans rien envoyer dans le paquet du visiteur, et
            reste utilisable au clavier sans qu'on s'en occupe. Un
            `scrollTo({ behavior: 'smooth' })` aurait coûté un composant client
            pour rendre le même service en moins fiable.

            Dans le flux, centré, avec sa réserve sous lui : le coin bas-droit
            est pris par le socle mobile et la bulle d'aide, et un troisième
            rond flottant au même endroit les recouvrirait (§4). */}
        <div className="mt-8 flex justify-center pb-2 sm:hidden">
          <a
            href="#"
            aria-label="Revenir en haut de la page"
            className="flex h-11 w-11 items-center justify-center border text-[var(--st-ink-2)] transition hover:text-[var(--st-ink)]"
            style={{ borderColor: 'var(--st-border)', borderRadius: '9999px' }}
          >
            <ArrowUp className="h-4 w-4" strokeWidth={1.9} aria-hidden />
          </a>
        </div>
      </div>
    </footer>
  );
}
