'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useCart } from './StoreCartContext';
import type { StoreSettings } from '../../actions/store-public';

export function StoreNav({ store, slug }: { store: StoreSettings; slug: string }) {
  const { count } = useCart();
  const pathname   = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [search,   setSearch]   = useState('');

  const base = `/store/${slug}`;

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (search.trim()) {
      window.location.href = `${base}/products?search=${encodeURIComponent(search.trim())}`;
    }
  }

  return (
    <nav className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur-sm shadow-sm">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex h-16 items-center justify-between gap-4">

          {/* Logo */}
          <Link href={base} className="flex items-center gap-2 flex-shrink-0">
            {store.logo_url ? (
              <img src={store.logo_url} alt={store.store_name ?? ''} className="h-8 w-auto object-contain" />
            ) : (
              <span className="text-xl font-bold" style={{ color: 'var(--store-primary)' }}>
                {store.store_name ?? 'Boutique'}
              </span>
            )}
          </Link>

          {/* Search (desktop) */}
          <form onSubmit={handleSearch} className="hidden flex-1 max-w-md sm:flex">
            <div className="relative w-full">
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher un produit…"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-4 pr-10 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
              />
              <button type="submit" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </button>
            </div>
          </form>

          {/* Nav links (desktop) */}
          <div className="hidden sm:flex items-center gap-6 text-sm font-medium text-slate-600">
            <Link href={`${base}/products`} className="hover:text-slate-900 transition">Produits</Link>
            <Link href={`${base}/products?filter=new`} className="hover:text-slate-900 transition">Nouveautés</Link>
            <Link href={`${base}/products?filter=sale`} className="hover:text-slate-900 transition">Promotions</Link>
          </div>

          {/* Cart */}
          <Link
            href={`${base}/cart`}
            className="relative flex h-10 w-10 items-center justify-center rounded-xl transition hover:bg-slate-100"
          >
            <svg className="h-5 w-5 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
            </svg>
            {count > 0 && (
              <span
                className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white"
                style={{ backgroundColor: 'var(--store-primary)' }}
              >
                {count > 9 ? '9+' : count}
              </span>
            )}
          </Link>

          {/* Mobile menu */}
          <button onClick={() => setMenuOpen(!menuOpen)} className="sm:hidden rounded-xl p-2 text-slate-600 hover:bg-slate-100">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {menuOpen
                ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />}
            </svg>
          </button>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div className="border-t border-slate-100 py-4 space-y-3 sm:hidden">
            <form onSubmit={handleSearch} className="flex gap-2">
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher…"
                className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm outline-none"
              />
              <button type="submit" className="rounded-xl px-4 py-2 text-sm font-semibold text-white" style={{ backgroundColor: 'var(--store-primary)' }}>
                OK
              </button>
            </form>
            {[
              { href: `${base}/products`,             label: 'Produits' },
              { href: `${base}/products?filter=new`,  label: 'Nouveautés' },
              { href: `${base}/products?filter=sale`, label: 'Promotions' },
            ].map((l) => (
              <Link key={l.href} href={l.href} onClick={() => setMenuOpen(false)}
                className="block rounded-xl px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
                {l.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    </nav>
  );
}
