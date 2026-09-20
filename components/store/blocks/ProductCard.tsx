'use client';

// ─────────────────────────────────────────────────────────────────────────────
// La carte produit — une, neuf peaux
//
// Neuf gabarits de carte, un seul composant. La tentation était d'écrire neuf
// cartes ; elle coûte cher : une correction d'accessibilité ou un bouton
// d'ajout cassé se répare alors neuf fois, et se répare deux fois en pratique.
//
// Ce qui change entre les peaux est ce que l'œil voit — cadre, air,
// typographie, informations retenues, moment où l'action apparaît. Ce qui ne
// change pas : la cible tactile de 44 pixels, le contraste du prix, le
// comportement hors stock, l'ordre de lecture, le rapport d'image imposé.
//
// ── Les neuf peaux (§5, §34) ───────────────────────────────────────────────
//
//   minimal    photo · nom · prix · ajouter
//   editorial  grande photo · nom · prix, action au survol
//   fashion    photo · favori · badge · nom · prix · déclinaisons
//   beauty     photo · badge · nom · note · prix
//   tech       photo · badge · nom · caractéristique · prix · disponibilité
//   compact    la même, resserrée, pour les catalogues denses
//   service    photo · nom · durée · « à partir de » · Réserver
//   wholesale  photo · nom · unité de vente · « à partir de » · Commander
//   social     photo · badge · nom · note · prix · ajout direct
//   chic       photo · étiquette en pilule · favori · nom · matières · note ·
//              prix · « Ajouter au panier » en toutes lettres
//
// Les trois dernières viennent des gabarits métier, et la première d'entre
// elles est la seule qui ne mène pas au panier : une prestation se réserve, et
// un bouton « Ajouter au panier » sous une séance de coaching fait promettre à
// la vitrine un tunnel qu'elle ne sait pas tenir.
//
// ── Ce que la carte ne fait pas ────────────────────────────────────────────
//
// Elle ne pose pas le prix sur l'image : un prix en surimpression est illisible
// dès que la photo est claire, et les photos de produits le sont presque
// toujours. Elle n'empile pas trois badges : « Nouveau », « Vedette » et
// « −30 % » côte à côte rendent les trois invisibles — un seul est retenu, dans
// l'ordre d'importance pour l'achat. Et elle n'invente rien : pas de note sans
// avis publié, pas de « plus que 2 en stock » sans stock réel (§29).
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link';
import { useState } from 'react';
import { Check, Plus, Heart, Star, ShoppingBag, ShoppingCart, Clock, CalendarCheck } from 'lucide-react';
import { ProductMedia } from './ProductMedia';
import { useCart } from '../CartContext';
import { useFavorites } from '../FavoritesContext';
import { storeMoney } from '../format';
import { designFor, type DesignProfile } from '../../../lib/storeDesign';
import type { StoreProduct, StoreView } from '../types';

export type ProductRating = { average: number; count: number };

type Props = {
  product: StoreProduct;
  store:   StoreView;
  /** Priorité de chargement : les premières cartes de la grille seulement. */
  priority?: boolean;
  /** L'attribut `sizes` de la grille qui accueille cette carte (§26). */
  sizes?: string;
  /** La note réelle du produit. Absente : aucune étoile n'est affichée. */
  rating?: ProductRating;
  /** Permet à une section de forcer une peau — un encart « vedette », par exemple. */
  design?: DesignProfile;
  /**
   * Vrai quand la carte est rendue dans « Meilleures ventes », calculée sur les
   * ventes réelles des 90 derniers jours. C'est la seule source de l'étiquette
   * « Best-seller » : un produit n'en est pas un parce qu'on le dit.
   */
  bestseller?: boolean;
};

/** La remise, en points de pourcentage, quand elle est réelle. */
function discountPercent(price: number, compareAt: number | null): number | null {
  if (compareAt === null || compareAt <= price) return null;
  const pct = Math.round((1 - price / compareAt) * 100);
  return pct >= 5 ? pct : null;   // sous 5 %, l'étiquette ment plus qu'elle n'informe
}

/**
 * La caractéristique courte de la carte électronique.
 *
 * Elle vient des attributs saisis par le marchand — « 128 Go », « 6,1 pouces ».
 * Jamais de la description : une première phrase tronquée à quarante signes
 * donne « Ce téléphone dispose d'un écran… », qui n'aide personne à choisir.
 */
function shortSpec(product: StoreProduct): string | null {
  const entries = Object.entries(product.attributes ?? {}).filter(
    ([, v]) => typeof v === 'string' && v.trim(),
  );
  if (entries.length === 0) return null;
  return entries.slice(0, 2).map(([, v]) => v).join(' · ');
}

/**
 * Un attribut du produit, cherché sous plusieurs noms.
 *
 * Le marchand saisit ses attributs librement : « Durée », « duree », « Temps ».
 * Chercher la clé exacte, c'est n'afficher la durée que sur les fiches dont la
 * casse tombe juste — et un produit sur deux perdrait alors l'information qui
 * justifie sa carte. La comparaison ignore donc casse et accents.
 */
function attribute(product: StoreProduct, names: readonly string[]): string | null {
  const normalize = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

  const entries = Object.entries(product.attributes ?? {})
    .filter(([, v]) => typeof v === 'string' && v.trim());

  for (const name of names) {
    const hit = entries.find(([k]) => normalize(k) === name);
    if (hit) return String(hit[1]).trim();
  }
  return null;
}

/** La durée d'une prestation, telle que le prestataire l'a nommée. */
const DURATION_KEYS = ['duree', 'duration', 'temps', 'seance'] as const;

/** L'unité de vente d'un lot : la tête, le sac, le kilo, la douzaine. */
const UNIT_KEYS = ['unite', 'unit', 'conditionnement', 'poids', 'vendu par'] as const;

/** Les déclinaisons affichées sur la carte mode : les valeurs, pas les clés. */
function variantChips(product: StoreProduct): string[] {
  return Object.entries(product.attributes ?? {})
    .filter(([, v]) => typeof v === 'string' && v.trim())
    .map(([, v]) => v.trim())
    .slice(0, 3);
}

export function ProductCard({
  product, store, priority = false, sizes, rating, design, bestseller = false,
}: Props) {
  const { addItem } = useCart();
  const favorites   = useFavorites();
  const [justAdded, setJustAdded] = useState(false);

  const d     = design ?? designFor(store.templateId);
  const skin  = d.card;
  const price = product.sale_price ?? product.price;

  // Un produit à zéro reste commandable si le marchand a autorisé la vente à
  // découvert (§25) : il se réapprovisionne vite et ne veut pas perdre la vente.
  const outOfStock = product.stock <= 0 && !product.allow_backorders;
  const href       = `${store.base}/products/${product.id}`;
  const discount   = store.showPrices ? discountPercent(price, product.compare_at_price) : null;

  // Une seule étiquette, dans l'ordre où elle pèse sur la décision d'achat :
  // je ne peux pas l'avoir > il coûte moins cher > les autres l'ont choisi >
  // il vient d'arriver. « Best-seller » n'existe que sur la peau chic, dont la
  // maquette le demande : ailleurs, la section le dit déjà dans son titre.
  const pill = skin === 'chic';
  const badge = outOfStock
    ? { text: 'Épuisé', tone: 'ink' as const }
    : discount !== null
      ? { text: `−${discount} %`, tone: pill ? 'highlight' as const : 'accent' as const }
      : pill && bestseller
        ? { text: 'Best-seller', tone: 'highlight' as const }
        : product.is_new
          ? { text: 'Nouveau', tone: pill ? 'primary' as const : 'soft' as const }
          : null;

  const hoverSrc = d.hoverSwap ? (product.images.find((i) => i !== product.image_url) ?? null) : null;

  const bordered = skin !== 'editorial' && skin !== 'fashion';
  const framed   =
    skin === 'beauty' || skin === 'tech' || skin === 'minimal' || skin === 'compact'
    || skin === 'service' || skin === 'wholesale' || skin === 'social' || skin === 'chic';

  // ── Ce que les trois peaux métier ajoutent ──────────────────────────────
  //
  // Toutes trois lisent les attributs saisis par le marchand, et n'affichent
  // rien quand il n'a rien saisi. Une durée par défaut sur une prestation ou
  // une unité de vente supposée sur un lot engageraient le marchand sur un
  // chiffre qu'il n'a pas donné.
  const duration = skin === 'service'   ? attribute(product, DURATION_KEYS) : null;
  const unit     = skin === 'wholesale' ? attribute(product, UNIT_KEYS)     : null;

  // « À partir de » : sur une prestation et sur un lot, le prix affiché est un
  // point de départ — la séance se module, le lot se négocie au volume. Le
  // taire ferait de chaque devis une déception.
  const fromPrice = skin === 'service' || skin === 'wholesale';

  // La prestation ne va pas au panier : la carte entière est déjà un lien vers
  // la fiche, où la réservation se conclut.
  const booking = skin === 'service';

  function handleAdd(e: React.MouseEvent) {
    // La carte entière est un lien vers la fiche produit ; le bouton d'ajout
    // vit dedans. Sans ces deux lignes, ajouter au panier navigue aussi.
    e.preventDefault();
    e.stopPropagation();
    if (outOfStock) return;
    addItem(product, 1);
    setJustAdded(true);
    window.setTimeout(() => setJustAdded(false), 1400);
  }

  function handleFavorite(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    favorites.toggle(product.id);
  }

  const isFavorite = favorites.hydrated && favorites.has(product.id);

  return (
    <Link
      href={href}
      className="group relative flex h-full flex-col transition-shadow duration-300"
      style={{
        borderRadius: framed ? 'var(--st-radius-card)' : undefined,
        border:       bordered ? '1px solid var(--st-border)' : undefined,
        background:   framed ? 'var(--st-surface)' : undefined,
        overflow:     framed ? 'hidden' : undefined,
        boxShadow:    framed ? 'var(--st-shadow)' : undefined,
      }}
      onMouseEnter={(e) => {
        if (framed) e.currentTarget.style.boxShadow = 'var(--st-shadow-hover)';
      }}
      onMouseLeave={(e) => {
        if (framed) e.currentTarget.style.boxShadow = 'var(--st-shadow)';
      }}
    >
      {/* ── Visuel ─────────────────────────────────────────────────────── */}
      <ProductMedia
        src={product.image_url}
        alt={product.name}
        rule={d.media}
        sizes={sizes ?? '(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw'}
        priority={priority}
        hoverSrc={hoverSrc}
        // La photo de mode est cadrée sur la silhouette : rogner par le haut
        // coupe une tête, rogner par le centre coupe des pieds. Le centre haut
        // est le seul point qui tienne sur les deux formats.
        focal={skin === 'fashion' ? 'top' : 'center'}
        radius={framed ? '0px' : 'var(--st-radius-media)'}
        imageClassName={[
          'transition-transform duration-700',
          outOfStock ? 'opacity-55' : '',
          d.hoverSwap ? '' : 'group-hover:scale-[1.03]',
        ].join(' ')}
      >
        {badge && (
          <span
            className={
              pill
                ? 'absolute left-2 top-2 rounded-full px-2.5 py-1 text-[11px] font-semibold'
                : 'absolute left-2 top-2 rounded-[6px] px-2 py-1 text-[11px] font-semibold uppercase tracking-wide'
            }
            style={
              badge.tone === 'ink'
                ? { background: 'var(--st-ink)', color: 'var(--st-surface)' }
                : badge.tone === 'accent'
                  ? { background: 'var(--st-accent)', color: 'var(--st-accent-ink)' }
                  : badge.tone === 'highlight'
                    ? { background: 'var(--st-highlight)', color: 'var(--st-highlight-ink)' }
                    : badge.tone === 'primary'
                      ? { background: 'var(--st-primary)', color: 'var(--st-primary-ink)' }
                      : { background: 'var(--st-surface)', color: 'var(--st-ink)' }
            }
          >
            {badge.text}
          </span>
        )}

        {/* Le favori. Toujours visible : caché au survol, il n'existe pas sur un
            téléphone, où se fait l'essentiel du trafic.

            Il n'était offert que sur la peau mode. Les favoris ont pourtant
            leur page (`/favoris`) et leur compteur dans l'en-tête sur TOUTES
            les vitrines : sur les huit autres peaux, rien ne les alimentait —
            une page que le visiteur ne pouvait pas remplir.

            Trois peaux restent sans cœur, et pour la même raison : elles ne
            vendent pas un objet qu'on met de côté. On ne garde pas une séance
            de coaching en favori, ni un lot de trente poulets ; et la peau
            resserrée des gros catalogues n'a pas la place d'un bouton de plus
            sans manger la photo. */}
        {skin !== 'service' && skin !== 'wholesale' && skin !== 'compact' && (
          <button
            type="button"
            onClick={handleFavorite}
            aria-label={isFavorite ? `Retirer ${product.name} des favoris` : `Ajouter ${product.name} aux favoris`}
            aria-pressed={isFavorite}
            className="absolute right-2 top-2 flex h-10 w-10 items-center justify-center rounded-full backdrop-blur transition"
            style={{ background: 'color-mix(in srgb, var(--st-surface) 82%, transparent)' }}
          >
            <Heart
              className="h-4 w-4"
              strokeWidth={1.8}
              style={{
                fill:  isFavorite ? 'var(--st-accent)' : 'transparent',
                color: isFavorite ? 'var(--st-accent)' : 'var(--st-ink-2)',
              }}
              aria-hidden
            />
          </button>
        )}

        {/* Action au survol : elle libère la carte de son bouton et laisse la
            photo occuper toute la place — la composition éditoriale. Sur mobile
            elle reste visible en permanence, sinon la boutique n'a plus de
            bouton d'achat du tout. */}
        {d.hoverAction && !outOfStock && (
          <button
            type="button"
            onClick={handleAdd}
            aria-label={`Ajouter ${product.name} au panier`}
            className="absolute inset-x-2 bottom-2 flex min-h-[44px] items-center justify-center gap-2 text-[13px] font-semibold backdrop-blur transition duration-300 sm:translate-y-2 sm:opacity-0 sm:group-hover:translate-y-0 sm:group-hover:opacity-100"
            style={{
              background:   'color-mix(in srgb, var(--st-surface) 94%, transparent)',
              color:        'var(--st-ink)',
              borderRadius: 'var(--st-radius-btn)',
            }}
          >
            {justAdded
              ? <><Check className="h-4 w-4" strokeWidth={2.4} aria-hidden /> Ajouté</>
              : <><ShoppingBag className="h-4 w-4" strokeWidth={1.8} aria-hidden /> Ajouter</>}
          </button>
        )}
      </ProductMedia>

      {/* ── Texte ──────────────────────────────────────────────────────── */}
      <div
        className={[
          'flex flex-1 flex-col',
          skin === 'editorial' ? 'items-center gap-1.5 px-1 pt-4 text-center' : '',
          skin === 'fashion'   ? 'gap-1.5 pt-3'    : '',
          skin === 'beauty'    ? 'gap-1 p-4'       : '',
          skin === 'tech'      ? 'gap-1 p-3.5'     : '',
          skin === 'minimal'   ? 'gap-1 p-4'       : '',
          skin === 'compact'   ? 'gap-0.5 p-2.5'   : '',
          skin === 'service'   ? 'gap-1.5 p-4'     : '',
          skin === 'wholesale' ? 'gap-1 p-3.5'     : '',
          skin === 'social'    ? 'gap-1 p-3.5'     : '',
          skin === 'chic'      ? 'gap-1 p-3.5'     : '',
        ].join(' ')}
      >
        {/* Le rayon, en sur-titre. Il situe le produit dans la boutique sans
            occuper la ligne du nom. */}
        {product.category && (skin === 'tech' || skin === 'minimal') && (
          <p className="truncate text-[11px] uppercase tracking-wide text-[var(--st-ink-3)]">
            {product.category}
          </p>
        )}

        <h3
          className={[
            'text-[var(--st-ink)]',
            skin === 'compact' ? 'line-clamp-1' : 'line-clamp-2',
            skin === 'editorial' || skin === 'fashion' ? 'font-normal leading-snug' : 'font-semibold leading-snug',
          ].join(' ')}
          style={{
            fontSize:      'var(--st-card-title)',
            fontFamily:    skin === 'editorial' || skin === 'fashion' ? 'var(--st-font-heading)' : undefined,
            letterSpacing: skin === 'fashion' ? '0.04em' : undefined,
            textTransform: skin === 'fashion' ? 'uppercase' : undefined,
          }}
        >
          {product.name}
        </h3>

        {/* Les matières et déclinaisons de la peau chic : « Légère • Confortable
            • Tendance ». Les VALEURS saisies par le marchand, jamais inventées. */}
        {skin === 'chic' && variantChips(product).length > 0 && (
          <p className="truncate text-[12px] text-[var(--st-ink-3)]">
            {variantChips(product).join(' • ')}
          </p>
        )}

        {/* La note. Elle n'apparaît que si de vrais avis ont été publiés — le
            §29 interdit d'en inventer, et une note par défaut en serait une.
            Le gabarit décide seulement si la carte a de la PLACE pour elle :
            c'est `showRating`, et non plus un nom de peau écrit en dur ici. */}
        {d.showRating && rating && rating.count > 0 && (
          <div className="flex items-center gap-1.5" aria-label={`${rating.average} sur 5, ${rating.count} avis`}>
            <div className="flex gap-0.5" aria-hidden>
              {Array.from({ length: 5 }, (_, i) => (
                <Star
                  key={i}
                  className="h-3 w-3"
                  strokeWidth={1.6}
                  style={{
                    fill:  i < Math.round(rating.average) ? 'var(--st-highlight)' : 'transparent',
                    color: i < Math.round(rating.average) ? 'var(--st-highlight)' : 'var(--st-ink-3)',
                  }}
                />
              ))}
            </div>
            <span className="text-[11px] tabular-nums text-[var(--st-ink-3)]">({rating.count})</span>
          </div>
        )}

        {/* La caractéristique courte du rayon électronique. */}
        {skin === 'tech' && shortSpec(product) && (
          <p className="truncate text-[12px] text-[var(--st-ink-3)]">{shortSpec(product)}</p>
        )}

        {/* La durée d'une prestation. C'est la deuxième question posée après le
            prix — « ça dure combien de temps ? » — et y répondre sur la carte
            évite un aller-retour dans la fiche. */}
        {duration && (
          <p className="flex items-center gap-1.5 truncate text-[12px] text-[var(--st-ink-3)]">
            <Clock className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={1.8} aria-hidden />
            {duration}
          </p>
        )}

        {/* L'unité de vente d'un lot : la tête, le sac de cinquante kilos, la
            douzaine. Un prix sans unité ne veut rien dire sur ce rayon. */}
        {unit && (
          <p className="truncate text-[12px] text-[var(--st-ink-3)]">{unit}</p>
        )}

        {/* Les déclinaisons du rayon mode. Elles disent « il existe en » sans
            promettre une sélection que la carte ne sait pas gérer. */}
        {skin === 'fashion' && variantChips(product).length > 0 && (
          <p className="flex flex-wrap gap-1.5 text-[11px] uppercase tracking-wide text-[var(--st-ink-3)]">
            {variantChips(product).map((v) => <span key={v}>{v}</span>)}
          </p>
        )}

        {store.showPrices && (
          <p
            className={[
              'flex flex-wrap items-baseline gap-x-2 tabular-nums',
              skin === 'editorial' || skin === 'fashion'
                ? 'text-[14px] tracking-wide text-[var(--st-ink-2)]'
                : 'text-[16px] font-semibold text-[var(--st-ink)]',
              skin === 'compact' ? 'text-[14px]' : '',
              skin === 'fashion' ? 'mt-0.5' : '',
            ].join(' ')}
          >
            {fromPrice && (
              <span className="text-[12px] font-normal text-[var(--st-ink-3)]">À partir de</span>
            )}
            <span>{storeMoney(price, store.currency)}</span>

            {/* L'ancien prix barré. Il n'apparaît que s'il est RÉELLEMENT plus
                élevé — `mapProduct` a déjà écarté le cas contraire — et il est
                marqué `line-through` plutôt que coloré : une remise se lit à la
                barre, pas à un rouge qui crie. */}
            {product.compare_at_price !== null && (
              <span className="text-[13px] font-normal text-[var(--st-ink-3)] line-through">
                {storeMoney(product.compare_at_price, store.currency)}
              </span>
            )}
          </p>
        )}

        {/* La disponibilité, sur les deux rayons où elle décide de l'achat :
            l'électronique, où l'on compare avant de commander, et l'élevage,
            où l'on demande d'abord « vous en avez combien aujourd'hui ? ». */}
        {(skin === 'tech' || skin === 'wholesale') && store.showStock && (
          <p
            className="text-[11px] font-semibold"
            style={{ color: outOfStock ? 'var(--st-ink-3)' : product.stock <= 5 ? '#B45309' : '#0B7F54' }}
          >
            {outOfStock
              ? 'Indisponible'
              : product.stock <= 5
                ? `Plus que ${product.stock} en stock`
                : 'En stock'}
          </p>
        )}

        {store.showStock && skin !== 'tech' && skin !== 'wholesale' && !outOfStock && product.stock > 0 && product.stock <= 5 && (
          // Le stock bas est une information, pas une alarme : ambre, jamais
          // rouge. Le rouge dit « erreur » et il ment ici.
          <p className="text-[11px] font-semibold text-[#B45309]">
            Plus que {product.stock} en stock
          </p>
        )}

        {/* La prestation : pas de panier, une invitation à ouvrir la fiche.
            C'est un `span` et non un bouton — la carte entière est déjà le lien
            qui y mène, et un bouton posé dans un lien donne au clavier deux
            arrêts pour une seule destination. */}
        {booking && (
          <span
            className="mt-auto flex w-full min-h-[44px] items-center justify-center gap-2 text-[14px] font-semibold transition group-hover:brightness-95"
            style={{
              marginTop:    '10px',
              borderRadius: 'var(--st-radius-btn)',
              background:   'var(--st-accent)',
              color:        'var(--st-accent-ink)',
            }}
          >
            <CalendarCheck className="h-4 w-4" strokeWidth={2.2} aria-hidden />
            Réserver
          </span>
        )}

        {/* L'action permanente, pleine largeur, sous le prix. C'est le geste que
            la carte doit provoquer — sauf sur les peaux où il vit au survol, et
            sauf sur la prestation, qui se réserve au lieu de s'ajouter. */}
        {!d.hoverAction && !booking && (
          <button
            type="button"
            onClick={handleAdd}
            disabled={outOfStock}
            aria-label={`Ajouter ${product.name} au panier`}
            className={[
              'mt-auto flex w-full items-center justify-center gap-2 pt-0 text-[14px] font-semibold transition',
              skin === 'compact' ? 'min-h-[40px]' : 'min-h-[44px]',
              outOfStock ? 'cursor-not-allowed' : 'hover:brightness-95 active:brightness-90',
            ].join(' ')}
            style={{
              marginTop:    '10px',
              borderRadius: 'var(--st-radius-btn)',
              background:   outOfStock ? 'var(--st-surface-2)' : 'var(--st-accent)',
              color:        outOfStock ? 'var(--st-ink-3)' : 'var(--st-accent-ink)',
            }}
          >
            {outOfStock ? (
              'Indisponible'
            ) : justAdded ? (
              <><Check className="h-4 w-4" strokeWidth={2.5} aria-hidden /> Ajouté</>
            ) : skin === 'chic' ? (
              // En toutes lettres, comme la maquette : à 13 px, le libellé
              // tient sur une ligne dans une carte de 160 px de large.
              <span className="flex items-center gap-2 whitespace-nowrap text-[13px]">
                <ShoppingCart className="h-4 w-4" strokeWidth={2} aria-hidden /> Ajouter au panier
              </span>
            ) : skin === 'wholesale' ? (
              // « Commander » plutôt qu'« Ajouter » : on ne fait pas ses
              // courses chez un éleveur, on passe une commande.
              <><Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden /> Commander</>
            ) : (
              // Le cartable, pas le « plus ». C'est l'icône que porte déjà le
              // bouton au survol des peaux éditoriales, celle du panier dans
              // l'en-tête, et celle des maquettes : trois endroits où le même
              // geste doit porter le même signe. Le libellé reste court —
              // « Ajouter au panier » se casse en deux lignes dans une carte de
              // grille à deux colonnes sur un téléphone de 360 pixels.
              <><ShoppingBag className="h-4 w-4" strokeWidth={2} aria-hidden /> Ajouter</>
            )}
          </button>
        )}
      </div>
    </Link>
  );
}
