'use client';

// ─────────────────────────────────────────────────────────────────────────────
// La recherche instantanée
//
// Elle filtre en mémoire le catalogue déjà chargé par la page. Pas d'appel
// réseau par frappe : sur une connexion irrégulière, une recherche qui part au
// serveur à chaque lettre affiche ses résultats dans le désordre, ou pas du
// tout. Un marchand de ProfitPilot a des dizaines de produits, rarement des
// milliers — le filtre tient largement côté navigateur.
//
// ── Ce que le §14 demande, et qui manquait ────────────────────────────────
//
// « Utilisateur tape "robe" → afficher immédiatement les produits
//   correspondants. » C'était déjà le cas, mais en texte seul : une liste de
//   noms et de prix. Sur une boutique, on reconnaît un article à sa photo avant
//   de lire son nom — la vignette n'est pas une décoration, c'est ce qui rend la
//   liste lisible d'un coup d'œil.
//
// S'y ajoutent les RAYONS correspondants, en tête. Quelqu'un qui tape « robe »
// dans une boutique de mode ne cherche pas une robe précise : il cherche le
// rayon. Le lui proposer évite de le laisser choisir parmi six vignettes quand
// il en voulait trente.
//
// La comparaison ignore les accents : « creme » doit trouver « Crème ». Sans ça
// la recherche échoue précisément sur les mots français les plus courants, et
// sur les claviers de téléphone qui ne mettent pas les accents.
//
// Les flèches parcourent la liste et Entrée ouvre le résultat visé ; à défaut,
// Entrée ouvre la page catalogue avec le terme. La recherche complète, avec
// filtres, reste une page — pas une liste déroulante.
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, Tag } from 'lucide-react';
import { StoreImage } from './StoreImage';
import { storeMoney } from '../format';
import { IMAGE_SIZES } from '../../../lib/storeImage';
import { collectionHref } from '../../../lib/storeTheme';
import type { StoreProduct, StoreView } from '../types';

/** « Crème brûlée » → « creme brulee » */
function fold(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

type Suggestion =
  | { kind: 'category'; id: string; label: string; count: number }
  | { kind: 'product';  product: StoreProduct };

export function SmartSearch({
  store,
  products,
  className,
  onNavigate,
}: {
  store:    StoreView;
  products: StoreProduct[];
  className?: string;
  /** Appelé quand un résultat est ouvert — pour refermer le menu qui la porte. */
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const [query, setQuery]   = useState('');
  const [open, setOpen]     = useState(false);
  const [cursor, setCursor] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);

  const suggestions = useMemo<Suggestion[]>(() => {
    const q = fold(query.trim());
    if (q.length < 2) return [];

    // Les rayons dont le nom correspond, avec leur volume réel.
    const categories = new Map<string, { label: string; count: number }>();
    for (const p of products) {
      const label = p.category;
      if (!label || !fold(label).includes(q)) continue;
      const id = p.category_id ?? label;
      const entry = categories.get(id);
      if (entry) entry.count += 1;
      else categories.set(id, { label, count: 1 });
    }

    const matches = products.filter(
      (p) => fold(p.name).includes(q) || fold(p.category ?? '').includes(q)
             || fold(p.sku ?? '').includes(q),
    );

    return [
      ...[...categories.entries()]
        .slice(0, 2)
        .map(([id, { label, count }]): Suggestion => ({ kind: 'category', id, label, count })),
      ...matches.slice(0, 6).map((product): Suggestion => ({ kind: 'product', product })),
    ];
  }, [query, products]);

  useEffect(() => { setCursor(-1); }, [query]);

  // Un clic ailleurs referme la liste. Sans cela elle reste ouverte par-dessus
  // le contenu et intercepte les clics du visiteur.
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  function hrefFor(s: Suggestion): string {
    return s.kind === 'category'
      ? collectionHref(store.base, { id: s.id, name: s.label })
      : `${store.base}/products/${s.product.id}`;
  }

  function go(href: string) {
    setOpen(false);
    onNavigate?.();
    router.push(href);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (cursor >= 0 && suggestions[cursor]) {
      go(hrefFor(suggestions[cursor]));
      return;
    }
    const term = query.trim();
    if (!term) return;
    go(`${store.base}/products?search=${encodeURIComponent(term)}`);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => (c + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => (c <= 0 ? suggestions.length - 1 : c - 1));
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  const showPanel = open && query.trim().length >= 2;

  return (
    <div ref={boxRef} className={`relative ${className ?? ''}`}>
      <form onSubmit={submit} role="search">
        <label htmlFor="store-search" className="sr-only">Rechercher un produit</label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--st-ink-3)]"
            strokeWidth={1.8}
            aria-hidden
          />
          <input
            id="store-search"
            type="search"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder="Rechercher un produit…"
            role="combobox"
            aria-expanded={showPanel}
            aria-controls="store-search-results"
            aria-autocomplete="list"
            className="min-h-[44px] w-full border bg-[var(--st-surface-2)] pl-9 pr-9 text-[14px] text-[var(--st-ink)] outline-none transition focus:border-[var(--st-accent)] focus:bg-[var(--st-surface)]"
            style={{ borderColor: 'var(--st-border)', borderRadius: 'var(--st-radius-input)' }}
          />
          {query && (
            <button
              type="button"
              onClick={() => { setQuery(''); setOpen(false); }}
              aria-label="Effacer la recherche"
              className="absolute right-1 top-1/2 flex h-11 w-9 -translate-y-1/2 items-center justify-center text-[var(--st-ink-3)]"
            >
              <X className="h-4 w-4" strokeWidth={2} aria-hidden />
            </button>
          )}
        </div>
      </form>

      {showPanel && (
        <div
          id="store-search-results"
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-40 overflow-hidden border bg-[var(--st-surface)] shadow-[0_12px_32px_-8px_rgba(0,31,63,0.28)]"
          style={{ borderColor: 'var(--st-border)', borderRadius: 'var(--st-radius-input)' }}
        >
          {suggestions.length === 0 ? (
            // L'état vide nomme ce qui a été cherché et propose une sortie.
            // « Aucun résultat » seul laisse croire à un bug de la boutique.
            <div className="px-4 py-5 text-center">
              <p className="text-[14px] text-[var(--st-ink-2)]">
                Aucun produit ne correspond à « {query.trim()} ».
              </p>
              <Link
                href={`${store.base}/products`}
                onClick={() => { setOpen(false); onNavigate?.(); }}
                className="mt-2 inline-flex min-h-[44px] items-center text-[14px] font-semibold text-[var(--st-ink)] underline underline-offset-4"
              >
                Parcourir tout le catalogue
              </Link>
            </div>
          ) : (
            <ul role="listbox" aria-label="Résultats">
              {suggestions.map((s, i) => {
                const active = i === cursor;

                if (s.kind === 'category') {
                  return (
                    <li key={`c-${s.id}`} role="option" aria-selected={active}>
                      <Link
                        href={hrefFor(s)}
                        onClick={() => { setOpen(false); onNavigate?.(); }}
                        className="flex min-h-[48px] items-center gap-3 px-4 text-[14px] transition"
                        style={{ background: active ? 'var(--st-surface-2)' : undefined }}
                      >
                        <Tag className="h-4 w-4 flex-shrink-0 text-[var(--st-ink-3)]" strokeWidth={1.8} aria-hidden />
                        <span className="truncate font-medium text-[var(--st-ink)]">{s.label}</span>
                        <span className="ml-auto flex-shrink-0 text-[12px] tabular-nums text-[var(--st-ink-3)]">
                          {s.count} article{s.count > 1 ? 's' : ''}
                        </span>
                      </Link>
                    </li>
                  );
                }

                const p = s.product;
                return (
                  <li key={p.id} role="option" aria-selected={active}>
                    <Link
                      href={hrefFor(s)}
                      onClick={() => { setOpen(false); onNavigate?.(); }}
                      className="flex min-h-[56px] items-center gap-3 px-3 py-2 text-[14px] transition"
                      style={{ background: active ? 'var(--st-surface-2)' : undefined }}
                    >
                      <span
                        className="relative h-11 w-11 flex-shrink-0 overflow-hidden"
                        style={{ background: 'var(--st-surface-2)', borderRadius: 'var(--st-radius-media)' }}
                      >
                        {p.image_url && (
                          <StoreImage src={p.image_url} alt="" sizes={IMAGE_SIZES.row} className="object-cover" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[var(--st-ink)]">{p.name}</span>
                        {p.category && (
                          <span className="block truncate text-[12px] text-[var(--st-ink-3)]">{p.category}</span>
                        )}
                      </span>
                      {store.showPrices && (
                        <span className="flex-shrink-0 tabular-nums font-semibold text-[var(--st-ink)]">
                          {storeMoney(p.sale_price ?? p.price, store.currency)}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}

              <li>
                <button
                  type="button"
                  onClick={() => go(`${store.base}/products?search=${encodeURIComponent(query.trim())}`)}
                  className="flex min-h-[48px] w-full items-center justify-center border-t px-4 text-[13px] font-semibold text-[var(--st-ink-2)] transition hover:text-[var(--st-ink)]"
                  style={{ borderColor: 'var(--st-border)' }}
                >
                  Voir tous les résultats pour « {query.trim()} »
                </button>
              </li>
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
