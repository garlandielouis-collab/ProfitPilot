'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Le catalogue filtrable
//
// C'est la page où l'on choisit, et une vraie expérience de catalogue (§15) se
// reconnaît à quatre choses : on sait où on est, on voit combien il reste, on
// filtre sur ce qui existe vraiment, et on peut tout défaire d'un geste.
//
// ── Les filtres sont dérivés du catalogue, pas déclarés ────────────────────
//
// On ne demande pas au marchand de dire que ses produits ont une taille : on le
// constate. `getStoreFacets` lit les attributs réellement saisis et n'en retient
// que ceux qui ont plus d'une valeur — un attribut à valeur unique ne filtre
// rien, il occupe seulement une colonne.
//
// Cette lecture existait dans le code depuis l'origine et n'était appelée par
// personne : la page n'offrait que le rayon et le tri. Toute la matière du §15
// était là, inutilisée.
//
// ── Le rayon, et le bug qu'il cachait ──────────────────────────────────────
//
// Un rayon arrive tantôt comme identifiant (`category_id`, un UUID), tantôt
// comme libellé — selon l'ancienneté de la fiche. L'ancien filtre comparait le
// paramètre au seul libellé : sur toute boutique dont les produits portent un
// `category_id`, cliquer un rayon depuis l'accueil ouvrait un catalogue vide.
// `matchesCategory` compare aux deux.
//
// ── Pourquoi le filtrage est côté navigateur ───────────────────────────────
//
// Chaque clic déclenchait un aller-retour serveur : sur une connexion
// irrégulière, changer de rayon prenait plusieurs secondes et la page restait
// figée sans rien dire. Le filtrage se fait en mémoire, et l'URL se met à jour
// derrière, pour rester partageable et pour que le retour arrière fonctionne.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SlidersHorizontal, PackageSearch, X, Check } from 'lucide-react';
import { ProductGrid } from '../../../../components/store/blocks/ProductGrid';
import { storeMoney } from '../../../../components/store/format';
import { designFor } from '../../../../lib/storeDesign';
import type { RatingMap } from '../../../../components/store/blocks/ProductGrid';
import type {
  StoreProduct, StoreCategory, StoreView,
} from '../../../../components/store/types';

export type Facet = { name: string; values: string[] };

type Props = {
  store:           StoreView;
  products:        StoreProduct[];
  categories:      StoreCategory[];
  facets:          Facet[];
  ratings:         RatingMap;
  initialCategory: string;
  initialSort:     string;
  initialSearch:   string;
  initialFacets:   Record<string, string>;
  initialInStock:  boolean;
  /**
   * Vrai quand le visiteur arrive par « Rechercher » du socle mobile (§4).
   *
   * Sur téléphone, le champ vit dans le panneau de filtres, replié par défaut :
   * sans cela, toucher « Rechercher » déposerait le visiteur sur un catalogue
   * où il ne voit même pas où taper.
   */
  initialFocusSearch: boolean;
};

const SORT_OPTIONS = [
  { value: 'newest',     label: 'Les plus récents' },
  { value: 'price_asc',  label: 'Prix croissant' },
  { value: 'price_desc', label: 'Prix décroissant' },
  { value: 'name',       label: 'Nom A→Z' },
];

function fold(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Un rayon se reconnaît à son identifiant OU à son libellé. Voir l'en-tête. */
function matchesCategory(product: StoreProduct, key: string): boolean {
  if (!key) return true;
  return product.category_id === key || product.category === key;
}

function priceOf(p: StoreProduct): number {
  return p.sale_price ?? p.price;
}

export function ProductsClient({
  store, products, categories, facets, ratings,
  initialCategory, initialSort, initialSearch, initialFacets, initialInStock,
  initialFocusSearch,
}: Props) {
  const router = useRouter();
  const design = designFor(store.templateId);

  const [search, setSearch]     = useState(initialSearch);
  const [category, setCategory] = useState(initialCategory);
  const [sort, setSort]         = useState(initialSort);
  const [inStock, setInStock]   = useState(initialInStock);
  const [chosen, setChosen]     = useState<Record<string, string>>(initialFacets);
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(initialFocusSearch);
  const [focusSearch, setFocusSearch] = useState(initialFocusSearch);
  const searchRef = useRef<HTMLInputElement>(null);

  // Le panneau est déjà ouvert au premier rendu ; le champ existe donc quand cet
  // effet passe. Le drapeau se relâche aussitôt : rendre le focus au champ à
  // chaque frappe le rendrait impossible à quitter.
  useEffect(() => {
    if (!focusSearch) return;
    searchRef.current?.focus();
    setFocusSearch(false);
  }, [focusSearch]);

  // Les bornes de prix viennent du catalogue, pas d'une valeur ronde choisie au
  // hasard : un curseur qui monte à 100 000 sur une boutique dont l'article le
  // plus cher vaut 3 000 ne sert à rien.
  const bounds = useMemo(() => {
    if (products.length === 0) return { min: 0, max: 0 };
    const prices = products.map(priceOf);
    return { min: Math.floor(Math.min(...prices)), max: Math.ceil(Math.max(...prices)) };
  }, [products]);

  const effectiveMax = maxPrice ?? bounds.max;

  /** L'URL suit l'état, pour qu'un filtre reste partageable et revienne au retour arrière. */
  function syncUrl(next: Partial<{
    search: string; category: string; sort: string;
    inStock: boolean; chosen: Record<string, string>;
  }>) {
    const p  = new URLSearchParams();
    const s  = next.search   ?? search;
    const c  = next.category ?? category;
    const so = next.sort     ?? sort;
    const st = next.inStock  ?? inStock;
    const fs = next.chosen   ?? chosen;

    if (s)  p.set('search', s);
    if (c)  p.set('category', c);
    if (so && so !== 'newest') p.set('sort', so);
    if (st) p.set('stock', '1');
    for (const [name, value] of Object.entries(fs)) {
      if (value) p.set(`f_${name}`, value);
    }

    const qs = p.toString();
    router.replace(`${store.base}/products${qs ? `?${qs}` : ''}`, { scroll: false });
  }

  const visible = useMemo(() => {
    const q = fold(search.trim());
    let list = products;

    if (category) list = list.filter((p) => matchesCategory(p, category));

    if (q.length > 0) {
      list = list.filter(
        (p) => fold(p.name).includes(q)
            || fold(p.category ?? '').includes(q)
            || fold(p.sku ?? '').includes(q),
      );
    }

    if (inStock) list = list.filter((p) => p.stock > 0 || p.allow_backorders);

    if (maxPrice !== null) list = list.filter((p) => priceOf(p) <= maxPrice);

    for (const [name, value] of Object.entries(chosen)) {
      if (!value) continue;
      list = list.filter((p) => (p.attributes ?? {})[name] === value);
    }

    const sorted = [...list];
    switch (sort) {
      case 'price_asc':  sorted.sort((a, b) => priceOf(a) - priceOf(b)); break;
      case 'price_desc': sorted.sort((a, b) => priceOf(b) - priceOf(a)); break;
      case 'name':       sorted.sort((a, b) => a.name.localeCompare(b.name, 'fr')); break;
      default:           sorted.sort((a, b) => b.created_at.localeCompare(a.created_at));
    }
    return sorted;
  }, [products, category, search, sort, inStock, maxPrice, chosen]);

  const activeCategory = categories.find((c) => c.id === category);
  const chosenCount    = Object.values(chosen).filter(Boolean).length;
  const filtersActive  = Boolean(category || search || inStock || maxPrice !== null || chosenCount > 0);

  function reset() {
    setSearch(''); setCategory(''); setInStock(false);
    setMaxPrice(null); setChosen({});
    syncUrl({ search: '', category: '', inStock: false, chosen: {} });
  }

  function chooseFacet(name: string, value: string) {
    // Recliquer la valeur active la retire : c'est le geste attendu d'un filtre,
    // et cela évite une croix par ligne.
    const next = { ...chosen, [name]: chosen[name] === value ? '' : value };
    setChosen(next);
    syncUrl({ chosen: next });
  }

  const FilterPanel = (
    <div className="flex flex-col gap-7">
      <div>
        <label
          htmlFor="catalog-search"
          className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-[var(--st-ink-3)]"
        >
          Recherche
        </label>
        <input
          id="catalog-search"
          ref={searchRef}
          type="search"
          value={search}
          onChange={(e) => { setSearch(e.target.value); syncUrl({ search: e.target.value }); }}
          placeholder="Rechercher…"
          className="min-h-[44px] w-full border bg-[var(--st-surface)] px-3 text-[14px] text-[var(--st-ink)] outline-none focus:border-[var(--st-accent)]"
          style={{ borderColor: 'var(--st-border)', borderRadius: 'var(--st-radius-input)' }}
        />
      </div>

      {categories.length > 0 && (
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--st-ink-3)]">
            Rayon
          </p>
          <div className="flex flex-col">
            {[{ id: '', name: 'Tout', count: products.length }, ...categories].map((c) => {
              const active = category === c.id;
              return (
                <button
                  key={c.id || 'all'}
                  type="button"
                  onClick={() => { setCategory(c.id); syncUrl({ category: c.id }); }}
                  aria-pressed={active}
                  className={[
                    'flex min-h-[44px] items-center justify-between px-3 text-left text-[14px] transition',
                    active ? 'font-semibold' : 'text-[var(--st-ink-2)] hover:bg-[var(--st-surface-2)]',
                  ].join(' ')}
                  style={{
                    borderRadius: 'var(--st-radius-input)',
                    ...(active
                      ? { background: 'var(--st-primary)', color: 'var(--st-primary-ink)' }
                      : {}),
                  }}
                >
                  <span className="truncate">{c.name}</span>
                  <span className="ml-2 text-[12px] tabular-nums opacity-70">{c.count}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Le prix. Un plafond seul plutôt qu'un intervalle : « je ne veux pas
          mettre plus de » est la question que se pose un acheteur, « je ne veux
          rien en dessous de » ne l'est presque jamais. */}
      {bounds.max > bounds.min && (
        <div>
          <label
            htmlFor="catalog-price"
            className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-[var(--st-ink-3)]"
          >
            Prix maximum
          </label>
          <input
            id="catalog-price"
            type="range"
            min={bounds.min}
            max={bounds.max}
            step={Math.max(1, Math.round((bounds.max - bounds.min) / 50))}
            value={effectiveMax}
            onChange={(e) => setMaxPrice(Number(e.target.value))}
            className="w-full accent-[var(--st-accent)]"
          />
          <p className="mt-1 flex items-center justify-between text-[12px] tabular-nums text-[var(--st-ink-2)]">
            <span>{storeMoney(bounds.min, store.currency)}</span>
            <span className="font-semibold text-[var(--st-ink)]">
              {storeMoney(effectiveMax, store.currency)}
            </span>
          </p>
        </div>
      )}

      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--st-ink-3)]">
          Disponibilité
        </p>
        <button
          type="button"
          onClick={() => { setInStock((v) => !v); syncUrl({ inStock: !inStock }); }}
          aria-pressed={inStock}
          className="flex min-h-[44px] w-full items-center gap-2.5 px-3 text-left text-[14px] text-[var(--st-ink-2)] transition hover:bg-[var(--st-surface-2)]"
          style={{ borderRadius: 'var(--st-radius-input)' }}
        >
          <span
            className="flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center border"
            style={{
              borderColor: inStock ? 'var(--st-accent)' : 'var(--st-border)',
              background:  inStock ? 'var(--st-accent)' : 'transparent',
              borderRadius: '4px',
            }}
          >
            {inStock && (
              <Check className="h-3 w-3" strokeWidth={3} style={{ color: 'var(--st-accent-ink)' }} aria-hidden />
            )}
          </span>
          Uniquement disponible
        </button>
      </div>

      {/* Les facettes du marchand : taille, couleur, matière, capacité… On
          n'en sait rien à l'avance, et c'est le principe. */}
      {facets.map((facet) => (
        <div key={facet.name}>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--st-ink-3)]">
            {facet.name}
          </p>
          <div className="flex flex-wrap gap-2">
            {facet.values.map((value) => {
              const active = chosen[facet.name] === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => chooseFacet(facet.name, value)}
                  aria-pressed={active}
                  className="flex min-h-[40px] items-center border px-3 text-[13px] transition"
                  style={{
                    borderRadius:  'var(--st-radius-btn)',
                    borderColor:   active ? 'var(--st-ink)' : 'var(--st-border)',
                    background:    active ? 'var(--st-ink)' : 'transparent',
                    color:         active ? 'var(--st-surface)' : 'var(--st-ink-2)',
                    fontWeight:    active ? 600 : 400,
                  }}
                >
                  {value}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <div>
        <label
          htmlFor="catalog-sort"
          className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-[var(--st-ink-3)]"
        >
          Trier par
        </label>
        <select
          id="catalog-sort"
          value={sort}
          onChange={(e) => { setSort(e.target.value); syncUrl({ sort: e.target.value }); }}
          className="min-h-[44px] w-full border bg-[var(--st-surface)] px-3 text-[14px] text-[var(--st-ink)] outline-none"
          style={{ borderColor: 'var(--st-border)', borderRadius: 'var(--st-radius-input)' }}
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {filtersActive && (
        <button
          type="button"
          onClick={reset}
          className="flex min-h-[44px] items-center justify-center gap-2 border text-[14px] font-semibold text-[var(--st-ink)]"
          style={{ borderColor: 'var(--st-border)', borderRadius: 'var(--st-radius-btn)' }}
        >
          <X className="h-4 w-4" strokeWidth={2} aria-hidden />
          Tout effacer
        </button>
      )}
    </div>
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      {/* ── En-tête de collection (§15) ─────────────────────────────────── */}
      <header className="mb-8">
        <nav aria-label="Fil d'Ariane" className="mb-3 flex flex-wrap items-center gap-2 text-[12px] text-[var(--st-ink-3)]">
          <a href={store.base || '/'} className="hover:text-[var(--st-ink-2)]">Accueil</a>
          <span aria-hidden>/</span>
          {activeCategory ? (
            <>
              <a href={`${store.base}/products`} className="hover:text-[var(--st-ink-2)]">Produits</a>
              <span aria-hidden>/</span>
              <span className="text-[var(--st-ink-2)]">{activeCategory.name}</span>
            </>
          ) : (
            <span className="text-[var(--st-ink-2)]">Produits</span>
          )}
        </nav>

        <h1
          className="text-[var(--st-ink)]"
          style={{
            fontFamily:    'var(--st-font-heading)',
            fontSize:      'var(--st-h2)',
            fontWeight:    design.type.upper ? 500 : 600,
            letterSpacing: 'var(--st-tracking)',
            textTransform: design.type.upper ? 'uppercase' : undefined,
          }}
        >
          {activeCategory?.name ?? (search ? `« ${search} »` : 'Tous les produits')}
        </h1>

        <p className="mt-2 text-[13px] tabular-nums text-[var(--st-ink-3)]">
          {visible.length} produit{visible.length !== 1 ? 's' : ''}
          {visible.length !== products.length && ` sur ${products.length}`}
        </p>
      </header>

      {/* Sur mobile les filtres sont repliés : ils occupaient un écran entier
          avant que le premier produit apparaisse. */}
      <button
        type="button"
        onClick={() => setFiltersOpen((v) => !v)}
        aria-expanded={filtersOpen}
        className="mb-5 flex min-h-[44px] items-center gap-2 border px-4 text-[14px] font-semibold text-[var(--st-ink)] lg:hidden"
        style={{ borderColor: 'var(--st-border)', borderRadius: 'var(--st-radius-btn)' }}
      >
        <SlidersHorizontal className="h-4 w-4" strokeWidth={1.8} aria-hidden />
        Filtrer et trier
        {filtersActive && (
          <span
            className="ml-1 flex h-5 min-w-[20px] items-center justify-center rounded-full px-1 text-[11px] font-semibold tabular-nums"
            style={{ background: 'var(--st-accent)', color: 'var(--st-accent-ink)' }}
          >
            {chosenCount + (category ? 1 : 0) + (inStock ? 1 : 0) + (maxPrice !== null ? 1 : 0)}
          </span>
        )}
      </button>

      <div className="flex flex-col gap-10 lg:flex-row">
        <aside
          className={`w-full flex-shrink-0 lg:block lg:w-60 ${filtersOpen ? 'block' : 'hidden'}`}
          aria-label="Filtres"
        >
          {FilterPanel}
        </aside>

        <div className="flex-1">
          {visible.length === 0 ? (
            // L'état vide nomme la recherche et propose la sortie. « Aucun
            // produit trouvé » seul laisse le visiteur devant une impasse.
            <div
              className="flex flex-col items-center justify-center gap-3 border border-dashed px-6 py-20 text-center"
              style={{ borderColor: 'var(--st-border)', borderRadius: 'var(--st-radius-card)' }}
            >
              <PackageSearch className="h-8 w-8 text-[var(--st-ink-3)]" strokeWidth={1.4} aria-hidden />
              <p className="text-[15px] font-semibold text-[var(--st-ink)]">
                {search
                  ? <>Aucun produit ne correspond à « {search} »</>
                  : <>Aucun produit avec ces filtres</>}
              </p>
              <p className="max-w-sm text-[14px] leading-relaxed text-[var(--st-ink-2)]">
                Essayez avec moins de critères, ou parcourez tout le catalogue.
              </p>
              {filtersActive && (
                <button
                  type="button"
                  onClick={reset}
                  className="mt-1 flex min-h-[48px] items-center px-6 text-[14px] font-semibold"
                  style={{
                    background: 'var(--st-accent)', color: 'var(--st-accent-ink)',
                    borderRadius: 'var(--st-radius-btn)',
                  }}
                >
                  Effacer les filtres
                </button>
              )}
            </div>
          ) : (
            <ProductGrid
              store={store}
              products={visible}
              ratings={ratings}
              design={design}
              priorityCount={design.grid.desktop}
            />
          )}
        </div>
      </div>
    </div>
  );
}
