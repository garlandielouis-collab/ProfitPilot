'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Le livre de transactions — deux briques, pas un tableau rétréci (§5.4)
//
// Un tableau à cinq colonnes et 580 px de large ne tient pas sur le téléphone
// du marchand : il défile horizontalement ET verticalement, ce qui viole la
// règle « une direction par section » (§5.3). Ici, la même donnée prend deux
// formes : des LIGNES sur mobile, un TABLEAU à partir de l'ordinateur.
//
// Ce qui a disparu :
//   · le flux « Transactions récentes » qui affichait les huit mêmes lignes,
//     juste au-dessus. La même donnée deux fois est une redondance (§3.6)
//   · les six couleurs de modes de paiement (bleu, violet, cyan, rose, ambre…) —
//     un mode de paiement est une mention, pas une alerte (§4.2)
//   · le vert et le rouge sur chaque montant : le signe + ou − le dit déjà, et
//     un rouge répété à chaque ligne ne veut plus rien dire (§6.3)
//
// La recherche sans résultat le DIT, propose une correction et offre une
// sortie (§5.10) — au lieu d'un tableau vide et muet.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react';
import { Badge, Card, FilterPill, Money, NoResult, closestMatch } from '../ds';
import type { LedgerRow } from '../../app/actions/ai';

const PAGE_SIZE = 8;

export function LedgerSection({
  rows,
  loading,
  periodLabel,
  labels,
}: {
  rows: LedgerRow[];
  loading: boolean;
  periodLabel: string;
  labels: {
    all: string; sales: string; purchases: string; debts: string;
    search: string; export: string; empty: string; noun: string;
    date: string; description: string; type: string; method: string; amount: string;
    previous: string; next: string;
  };
}) {
  const [search, setSearch] = useState('');
  const [type, setType] = useState<'' | LedgerRow['type']>('');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((r) => (type ? r.type === type : true))
      .filter((r) => (q ? r.description.toLowerCase().includes(q) || r.category.toLowerCase().includes(q) : true))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [rows, search, type]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const shown = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const suggestion = useMemo(
    () => (filtered.length === 0 && search ? closestMatch(search, rows.map((r) => r.description)) : null),
    [filtered.length, search, rows],
  );

  function exportCSV() {
    const header = [labels.date, labels.description, labels.type, labels.method, labels.amount];
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = [header, ...filtered.map((r) => [r.date, r.description, r.type, r.payment_method, r.amount])]
      .map((line) => line.map(esc).join(','))
      .join('\n');
    // Le BOM garde les accents lisibles quand le fichier s'ouvre dans un tableur.
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }));
    const a = Object.assign(document.createElement('a'), {
      href: url,
      download: `transactions-${periodLabel.replace(/\s+/g, '-')}.csv`,
    });
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-3">
      {/* Les filtres vivent au CONTACT de la liste qu'ils affectent : la portée
          de chaque contrôle se devine sans l'expliquer (§6.2). */}
      <div className="scrollbar-none flex gap-2 overflow-x-auto pb-1">
        <FilterPill label={labels.all}       selected={type === ''}     onClick={() => { setType(''); setPage(1); }} />
        <FilterPill label={labels.sales}     selected={type === 'Vann'} onClick={() => { setType('Vann'); setPage(1); }} />
        <FilterPill label={labels.purchases} selected={type === 'Acha'} onClick={() => { setType('Acha'); setPage(1); }} />
        <FilterPill label={labels.debts}     selected={type === 'Dèt'}  onClick={() => { setType('Dèt'); setPage(1); }} />
      </div>

      <div className="flex gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder={labels.search}
          className="min-h-touch min-w-0 flex-1 rounded-surface border border-border bg-white px-4 text-body text-primary outline-none transition-colors duration-press focus:border-primary dark:border-dark-border dark:bg-dark-surface dark:text-dark-text"
        />
        <button
          type="button"
          onClick={exportCSV}
          disabled={filtered.length === 0}
          className="pressable min-h-touch flex-shrink-0 rounded-surface border border-border bg-white px-4 text-note font-bold text-primary disabled:opacity-45 dark:border-dark-border dark:bg-dark-surface dark:text-dark-text"
        >
          {labels.export}
        </button>
      </div>

      <Card>
        {loading ? (
          <div className="space-y-2 p-4" aria-hidden>
            {[0, 1, 2, 3, 4].map((i) => <span key={i} className="pp-skeleton block h-12 rounded-control" />)}
          </div>
        ) : filtered.length === 0 && search ? (
          <NoResult
            query={search}
            noun={labels.noun}
            suggestion={suggestion}
            onUseSuggestion={(value) => { setSearch(value); setPage(1); }}
            onClear={() => { setSearch(''); setPage(1); }}
          />
        ) : filtered.length === 0 ? (
          <p className="px-4 py-8 text-center text-body text-muted dark:text-dark-muted">{labels.empty}</p>
        ) : (
          <>
            {/* Mobile : des lignes. Une seule direction de défilement. */}
            <ul className="divide-y divide-border md:hidden dark:divide-dark-border">
              {shown.map((row) => (
                <li key={row.id} className="flex min-h-touch items-center justify-between gap-3 px-4 py-2">
                  <span className="min-w-0">
                    <span className="block truncate text-body text-primary dark:text-dark-text">
                      {row.description}
                    </span>
                    <span className="block truncate text-note text-muted dark:text-dark-muted">
                      {formatDate(row.date)} · {row.payment_method}
                    </span>
                  </span>
                  <Money
                    value={row.type === 'Vann' ? row.amount : -row.amount}
                    currency={row.currency}
                    size="body"
                    signed
                  />
                </li>
              ))}
            </ul>

            {/* Bureau : le tableau, où l'espace le permet. */}
            <table className="hidden w-full text-left md:table">
              <thead>
                <tr className="border-b border-border dark:border-dark-border">
                  <Th>{labels.date}</Th>
                  <Th>{labels.description}</Th>
                  <Th>{labels.type}</Th>
                  <Th>{labels.method}</Th>
                  <Th className="text-right">{labels.amount}</Th>
                </tr>
              </thead>
              <tbody>
                {shown.map((row) => (
                  <tr key={row.id} className="border-b border-border last:border-0 dark:border-dark-border">
                    <td className="amount whitespace-nowrap px-4 py-3 text-note text-muted dark:text-dark-muted">
                      {formatDate(row.date)}
                    </td>
                    <td className="max-w-xs truncate px-4 py-3 text-body text-primary dark:text-dark-text">
                      {row.description}
                    </td>
                    <td className="px-4 py-3"><Badge>{row.type}</Badge></td>
                    <td className="px-4 py-3 text-note text-muted dark:text-dark-muted">{row.payment_method}</td>
                    <td className="px-4 py-3 text-right">
                      <Money
                        value={row.type === 'Vann' ? row.amount : -row.amount}
                        currency={row.currency}
                        size="body"
                        signed
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {pageCount > 1 && (
              <div className="flex items-center justify-between gap-4 border-t border-border px-4 py-2 dark:border-dark-border">
                <span className="amount text-note text-muted dark:text-dark-muted">
                  {(current - 1) * PAGE_SIZE + 1}–{Math.min(current * PAGE_SIZE, filtered.length)} / {filtered.length}
                </span>
                <div className="flex gap-1">
                  <PageButton onClick={() => setPage(current - 1)} disabled={current === 1}>
                    {labels.previous}
                  </PageButton>
                  <PageButton onClick={() => setPage(current + 1)} disabled={current === pageCount}>
                    {labels.next}
                  </PageButton>
                </div>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`px-4 py-2 text-note font-bold uppercase tracking-wide text-muted dark:text-dark-muted ${className}`}>
      {children}
    </th>
  );
}

function PageButton({
  children, onClick, disabled,
}: { children: React.ReactNode; onClick: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="pressable min-h-touch rounded-control px-4 text-note font-bold text-primary disabled:opacity-45 dark:text-dark-text"
    >
      {children}
    </button>
  );
}

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}
