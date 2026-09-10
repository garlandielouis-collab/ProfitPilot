'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Le rendu d'un document écrit (§20, §55)
//
// Un seul composant pour deux sorties : l'écran et le papier. Ce n'est pas une
// économie de code, c'est une garantie — un document imprimé qui ne ressemble
// pas à ce qu'on a relu à l'écran est un document qu'on signe sans l'avoir lu.
//
// ── Le papier commande ──────────────────────────────────────────────────────
//
// Les marges, la largeur de colonne, la taille du texte : tout est réglé pour
// une feuille A4, et l'écran s'y conforme. L'inverse — dessiner pour l'écran
// puis « adapter à l'impression » — produit les documents dont la dernière
// ligne tombe seule sur une deuxième page.
//
// ── Ce qui n'est jamais rendu ───────────────────────────────────────────────
//
// Aucun `dangerouslySetInnerHTML`. Les blocs ne portent que du texte, et c'est
// React qui l'échappe. Un contrat déposé par un tiers ne peut donc rien
// exécuter dans le navigateur du marchand, quoi qu'il contienne.
// ─────────────────────────────────────────────────────────────────────────────

import { forwardRef } from 'react';

import type { PlainBlock } from '../../lib/documents/blocks';
import { BLANK } from '../../lib/documents/variables';

/** Un trait à remplir se voit : gris, souligné, pas confondu avec du texte. */
function Text({ value }: { value: string }) {
  if (value.trim() === '') return null;

  const parts = value.split(BLANK);
  if (parts.length === 1) return <>{value}</>;

  return (
    <>
      {parts.map((part, index) => (
        <span key={index}>
          {part}
          {index < parts.length - 1 && (
            <span className="text-slate-400 print:text-slate-500">{BLANK}</span>
          )}
        </span>
      ))}
    </>
  );
}

function Block({ block }: { block: PlainBlock }) {
  switch (block.type) {
    case 'heading': {
      const level = block.level ?? 2;
      const className = level === 1
        ? 'mt-0 text-xl font-bold text-primary print:text-black'
        : level === 2
          ? 'mt-6 text-base font-bold text-primary print:text-black'
          : 'mt-4 text-sm font-bold text-primary print:text-black';
      if (level === 1) return <h1 className={className}><Text value={block.text} /></h1>;
      if (level === 2) return <h2 className={className}><Text value={block.text} /></h2>;
      return <h3 className={className}><Text value={block.text} /></h3>;
    }

    case 'paragraph':
      return (
        <p className="mt-3 whitespace-pre-line text-body leading-relaxed text-text2 print:text-black">
          <Text value={block.text} />
        </p>
      );

    case 'notice':
      // L'encadré porte le §23 la plupart du temps : la mention de vérification
      // professionnelle. Il reste visible à l'impression — c'est là qu'il sert.
      return (
        <p className="mt-4 rounded-control border border-amber-300 bg-amber-50 px-4 py-3 text-note text-amber-900 print:border-slate-400 print:bg-white print:text-black">
          <Text value={block.text} />
        </p>
      );

    case 'list': {
      const items = block.items.map((item, index) => (
        <li key={index} className="mt-1.5"><Text value={item} /></li>
      ));
      return block.ordered
        ? <ol className="mt-3 list-decimal pl-5 text-body text-text2 print:text-black">{items}</ol>
        : <ul className="mt-3 list-disc pl-5 text-body text-text2 print:text-black">{items}</ul>;
    }

    case 'fields':
      return (
        <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
          {block.items.map((item, index) => (
            <div key={index} className="flex gap-2 text-body">
              <dt className="font-bold text-primary print:text-black"><Text value={item.label} /> :</dt>
              <dd className="text-text2 print:text-black"><Text value={item.value} /></dd>
            </div>
          ))}
        </dl>
      );

    case 'table':
      return (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-body">
            <thead>
              <tr>
                {block.columns.map((column, index) => (
                  <th key={index}
                      className="border border-border px-3 py-2 text-left font-bold text-primary print:border-slate-400 print:text-black">
                    <Text value={column} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {block.columns.map((_, cellIndex) => (
                    <td key={cellIndex}
                        className="border border-border px-3 py-2 text-text2 print:border-slate-400 print:text-black">
                      <Text value={row[cellIndex] ?? ''} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case 'signature':
      // Un trait, un nom sous le trait. `break-inside-avoid` empêche la coupure
      // qui laisse la ligne de signature en haut de la page suivante.
      return (
        <div className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-2 print:break-inside-avoid">
          {block.parties.map((party, index) => (
            <div key={index}>
              <div className="h-12 border-b border-slate-400" />
              <p className="mt-2 text-note text-muted print:text-black"><Text value={party} /></p>
            </div>
          ))}
        </div>
      );

    case 'spacer':
      return <div className="h-6" />;
  }
}

export function DocumentBlocks({ blocks }: { blocks: PlainBlock[] }) {
  return (
    <div className="text-body">
      {blocks.map((block, index) => <Block key={index} block={block} />)}
    </div>
  );
}

/**
 * La feuille imprimable.
 *
 * `forwardRef` parce que `react-to-print` a besoin du nœud : c'est lui qu'il
 * détache pour l'envoyer à la boîte d'impression du navigateur. Rien ici n'est
 * caché à l'écran — c'est la MÊME feuille qu'on relit et qu'on imprime.
 */
export const DocumentSheet = forwardRef<HTMLDivElement, {
  title: string;
  businessName?: string | null;
  blocks: PlainBlock[];
}>(function DocumentSheet({ title, businessName, blocks }, ref) {
  return (
    <div ref={ref} className="mx-auto w-full max-w-[210mm] bg-white p-6 sm:p-10 print:p-0">
      {businessName && (
        <p className="mb-6 border-b border-border pb-3 text-note uppercase tracking-widest text-muted print:border-slate-400 print:text-black">
          {businessName}
        </p>
      )}
      <h1 className="sr-only">{title}</h1>
      <DocumentBlocks blocks={blocks} />
    </div>
  );
});
