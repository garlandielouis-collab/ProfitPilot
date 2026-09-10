'use client';

// ─────────────────────────────────────────────────────────────────────────────
// La liste des documents — une ligne, trois informations, rien de plus
//
// Le §67 le demande explicitement : « ne pas afficher trop d'informations
// simultanément ». Une ligne porte donc :
//
//   ce que c'est          le nom, en gras, tronqué proprement
//   de quelle famille     le type ; à défaut, « Sans type », qui est une
//                         information — c'est ce document-là qu'il faut classer
//   ce qui presse         l'échéance, et elle seule quand elle parle
//
// La taille, la date de modification et la version vivent sur la fiche. Les
// mettre ici ferait une ligne à cinq colonnes qu'on ne lit plus.
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link';
import type { ReactNode } from 'react';
import { FileSpreadsheet, FileText, FileType2, Image as ImageIcon } from 'lucide-react';

import { useLanguage } from '../LanguageWrapper';
import { Card } from '../ds';
import { ExpirationBadge, StatusBadge, VisibilityBadge } from './DocumentBadges';
import type { DocumentSummary } from '../../app/actions/documents';

/** L'icône dit le format d'un coup d'œil. Une seule bibliothèque, en contour. */
function iconFor(mime: string | null) {
  if (!mime) return FileText;
  if (mime.startsWith('image/')) return ImageIcon;
  if (mime.includes('spreadsheet') || mime.includes('excel') || mime === 'text/csv') return FileSpreadsheet;
  if (mime === 'application/pdf') return FileType2;
  return FileText;
}

/**
 * `action` — un geste propre à l'écran hôte, posé À CÔTÉ du lien, jamais
 * dedans : un bouton imbriqué dans une ancre est un piège au doigt, et le
 * lecteur d'écran l'annonce comme un seul élément. La fiche fournisseur s'en
 * sert pour détacher ; la bibliothèque n'en passe aucun.
 */
export function DocumentRow({ doc, action }: { doc: DocumentSummary; action?: ReactNode }) {
  const { t, language } = useLanguage();
  const Icon = iconFor(doc.mimeType);

  const typeLabel = language === 'ht' ? doc.typeLabelHt : doc.typeLabelFr;

  return (
    <Card as="li" interactive>
      <div className="flex items-center">
        <Link href={`/documents/${doc.id}`} className="flex min-h-touch flex-1 items-center gap-3 overflow-hidden px-4 py-3">
          <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-control bg-surface2 dark:bg-dark-surface2">
            <Icon className="h-5 w-5 text-muted dark:text-dark-muted" strokeWidth={1.6} aria-hidden />
          </span>

          <span className="min-w-0 flex-1">
            <span className="block truncate text-body font-bold text-primary dark:text-dark-text">
              {doc.name}
            </span>
            <span className="block truncate text-note text-muted dark:text-dark-muted">
              {typeLabel ?? t({ fr: 'Sans type', ht: 'San kalite' })}
            </span>
          </span>

          <span className="flex flex-shrink-0 flex-wrap items-center justify-end gap-1.5">
            <ExpirationBadge expiration={doc.expiration} daysLeft={doc.daysLeft} />
            <VisibilityBadge visibility={doc.visibility} />
            {/* « Actif » sur chaque ligne n'apprend rien : le statut ne s'affiche
                que lorsqu'il sort de l'ordinaire. */}
            {doc.status !== 'active' && <StatusBadge status={doc.status} />}
          </span>
        </Link>

        {action && <div className="flex flex-shrink-0 items-center pr-2">{action}</div>}
      </div>
    </Card>
  );
}

export function DocumentList({ documents }: { documents: DocumentSummary[] }) {
  return (
    <ul className="space-y-2">
      {documents.map((doc) => <DocumentRow key={doc.id} doc={doc} />)}
    </ul>
  );
}
