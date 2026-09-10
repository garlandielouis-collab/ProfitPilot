'use client';

// ─────────────────────────────────────────────────────────────────────────────
// La bibliothèque (§7, §8)
//
// ── Un seul axe de filtre à la fois, et c'est délibéré ──────────────────────
//
// Le §8 énumère huit filtres possibles. Les offrir tous en même temps produit
// l'écran que personne n'utilise : trois rangées de pastilles au-dessus de deux
// résultats. Ici, la recherche est toujours là — c'est le geste qui marche
// quand on sait ce qu'on cherche — et les pastilles portent les deux questions
// que le marchand se pose vraiment : de quelle famille, et est-ce que ça presse.
//
// Les archives ont leur propre pastille plutôt qu'un interrupteur : « Archivé »
// est un statut parmi d'autres, et le voir dans la même rangée dit clairement
// qu'on quitte la vue courante pour aller voir ailleurs.
//
// ── La pagination ───────────────────────────────────────────────────────────
//
// « Voir plus » plutôt que des pages numérotées. Sur un téléphone, la
// numérotation demande de viser un chiffre de 20 px et fait perdre la position
// de lecture ; le bouton se pousse au pouce et garde ce qui est déjà affiché.
// ─────────────────────────────────────────────────────────────────────────────

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, Download, Search, Upload } from 'lucide-react';

import {
  listDocuments, listDocumentTypes,
  type DocumentFilters, type DocumentSummary, type DocumentTypeOption,
} from '../../actions/documents';
import { useLanguage } from '../../../components/LanguageWrapper';
import {
  Button, FilterPill, FirstRun, NoResult, ScreenHeader, closestMatch,
} from '../../../components/ds';
import { DocumentList } from '../../../components/documents/DocumentList';
import { DocumentUploader } from '../../../components/documents/DocumentUploader';
import {
  CATEGORY_LABELS, CATEGORY_ORDER, STATUS_LABELS,
  type DocumentCategory, type ExpirationState,
} from '../../../lib/documents/types';
import { csvFilename, downloadCsv, toCsv } from '../../../lib/documents/csv';

const PAGE_SIZE = 30;

/** Les deux vues d'échéance qui appellent une action. « Valide » n'en est pas
 *  une : un document en règle ne se cherche pas, il se trouve. */
const URGENCY: Array<{ key: ExpirationState; label: { fr: string; ht: string } }> = [
  { key: 'expired',       label: { fr: 'Expirés',      ht: 'Ekspire' } },
  { key: 'expiring_soon', label: { fr: 'Bientôt',      ht: 'Byento' } },
];

function LibraryScreen() {
  const { t } = useLanguage();
  const router = useRouter();
  const params = useSearchParams();

  const initialCategory = params.get('categorie') as DocumentCategory | null;

  const [search, setSearch]     = useState('');
  const [debounced, setDebounced] = useState('');
  const [category, setCategory] = useState<DocumentCategory | 'all'>(initialCategory ?? 'all');
  const [urgency, setUrgency]   = useState<ExpirationState | null>(null);
  const [archived, setArchived] = useState(false);

  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  /** Les noms déjà vus. « Vouliez-vous dire… » se calcule sur eux : les tirer
   *  du résultat courant serait absurde, puisqu'on n'affiche la suggestion
   *  QUE lorsque ce résultat est vide. */
  const [knownNames, setKnownNames] = useState<string[]>([]);
  const [total, setTotal]   = useState(0);
  const [types, setTypes]   = useState<DocumentTypeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [exporting, setExporting]   = useState(false);

  // La frappe ne déclenche pas une requête par lettre : 300 ms de silence
  // suffisent, et c'est une requête au lieu de neuf sur « licence ».
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const filters = useMemo<DocumentFilters>(() => ({
    search:     debounced || undefined,
    category,
    status:     archived ? 'archived' : undefined,
    expiration: urgency ?? undefined,
    limit:      PAGE_SIZE,
  }), [debounced, category, urgency, archived]);

  const load = useCallback(async (offset: number) => {
    setLoading(true);
    try {
      const result = await listDocuments({ ...filters, offset });
      setTotal(result.total);
      setDocuments((previous) => (offset === 0 ? result.documents : [...previous, ...result.documents]));
      if (result.documents.length > 0) {
        setKnownNames((previous) =>
          [...new Set([...previous, ...result.documents.map((d) => d.name)])].slice(-300));
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chargement impossible.');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { void load(0); }, [load]);

  useEffect(() => {
    listDocumentTypes().then(setTypes).catch(() => { /* le catalogue n'est utile qu'au dépôt */ });
  }, []);

  /**
   * L'export porte sur CE QUE LES FILTRES DISENT, pas sur ce que « Voir plus »
   * a déjà chargé. Exporter trente lignes quand l'écran en annonce cent
   * quarante donnerait un fichier faux — et c'est le genre de faux qu'on ne
   * remarque qu'au moment où il compte.
   */
  const exportCsv = useCallback(async () => {
    setExporting(true);
    try {
      const result = await listDocuments({ ...filters, limit: 1000, offset: 0 });
      const csv = toCsv(result.documents, [
        { header: 'Nom',        value: (d) => d.name },
        { header: 'Type',       value: (d) => d.typeLabelFr ?? '' },
        { header: 'Famille',    value: (d) => (d.category ? t(CATEGORY_LABELS[d.category]) : '') },
        { header: 'Statut',     value: (d) => t(STATUS_LABELS[d.status]) },
        { header: 'Expire le',  value: (d) => d.expiresOn ?? '' },
        { header: 'Jours restants', value: (d) => d.daysLeft ?? '' },
        { header: 'Version',    value: (d) => d.version },
        { header: 'Étiquettes', value: (d) => d.tags.join(', ') },
        { header: 'Modifié le', value: (d) => d.updatedAt.slice(0, 10) },
      ]);
      downloadCsv(csv, csvFilename('documents'));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export impossible.');
    } finally {
      setExporting(false);
    }
  }, [filters, t]);

  const clearFilters = useCallback(() => {
    setSearch(''); setDebounced(''); setCategory('all'); setUrgency(null); setArchived(false);
  }, []);

  const filtering = Boolean(debounced) || category !== 'all' || urgency !== null || archived;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-8">
      <ScreenHeader
        title={t({ fr: 'Bibliothèque', ht: 'Bibliyotèk' })}
        subtitle={t({
          fr: 'Tous les documents du commerce',
          ht: 'Tout dokiman komès la',
        })}
        action={
          <div className="flex gap-2">
            {total > 0 && (
              <Button size="sm" variant="quiet"
                      loading={exporting}
                      icon={<Download className="h-4 w-4" strokeWidth={1.8} aria-hidden />}
                      onClick={() => void exportCsv()}>
                {t({ fr: 'Exporter', ht: 'Ekspòte' })}
              </Button>
            )}
            <Button size="sm" variant="accent"
                    icon={<Upload className="h-4 w-4" strokeWidth={1.8} aria-hidden />}
                    onClick={() => setUploadOpen(true)}>
              {t({ fr: 'Déposer', ht: 'Depoze' })}
            </Button>
          </div>
        }
      />

      {/* ── La recherche ──────────────────────────────────────────────────── */}
      <div className="relative mt-6">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
                strokeWidth={1.8} aria-hidden />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t({ fr: 'Rechercher un document…', ht: 'Chèche yon dokiman…' })}
          aria-label={t({ fr: 'Rechercher un document', ht: 'Chèche yon dokiman' })}
          className="min-h-action w-full rounded-surface border border-border bg-white pl-11 pr-4 text-body text-primary outline-none placeholder:text-muted focus:border-primary/40 dark:border-dark-border dark:bg-dark-surface dark:text-dark-text"
        />
      </div>

      {/* ── Les familles ──────────────────────────────────────────────────── */}
      <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        <FilterPill
          label={t({ fr: 'Tout', ht: 'Tout' })}
          selected={category === 'all'}
          onClick={() => setCategory('all')}
        />
        {CATEGORY_ORDER.map((key) => (
          <FilterPill
            key={key}
            label={t(CATEGORY_LABELS[key])}
            selected={category === key}
            onClick={() => setCategory(category === key ? 'all' : key)}
          />
        ))}
      </div>

      {/* ── L'urgence, et les archives ────────────────────────────────────── */}
      <div className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {URGENCY.map(({ key, label }) => (
          <FilterPill
            key={key}
            label={t(label)}
            selected={urgency === key}
            onClick={() => { setUrgency(urgency === key ? null : key); setArchived(false); }}
          />
        ))}
        <FilterPill
          label={t({ fr: 'Archivés', ht: 'Achive' })}
          selected={archived}
          onClick={() => { setArchived(!archived); setUrgency(null); }}
        />
      </div>

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-control bg-danger-sub px-3 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-danger" strokeWidth={1.8} aria-hidden />
          <p className="text-body text-danger">{error}</p>
        </div>
      )}

      {/* ── Les résultats ─────────────────────────────────────────────────── */}
      <div className="mt-6">
        {loading && documents.length === 0 ? (
          <div className="flex justify-center py-12">
            <span className="h-8 w-8 animate-spin rounded-pill border-2 border-border border-t-primary"
                  aria-label={t({ fr: 'Chargement', ht: 'Chajman' })} />
          </div>
        ) : documents.length > 0 ? (
          <>
            <DocumentList documents={documents} />

            {documents.length < total && (
              <div className="mt-4 flex justify-center">
                <Button variant="quiet" loading={loading} onClick={() => void load(documents.length)}>
                  {t({ fr: 'Voir plus', ht: 'Wè plis' })}
                </Button>
              </div>
            )}

            <p className="mt-4 text-center text-note text-muted dark:text-dark-muted">
              {t({
                fr: `${documents.length} sur ${total}`,
                ht: `${documents.length} sou ${total}`,
              })}
            </p>
          </>
        ) : debounced ? (
          <NoResult
            query={debounced}
            noun={t({ fr: 'document', ht: 'dokiman' })}
            suggestion={closestMatch(debounced, knownNames)}
            onUseSuggestion={setSearch}
            onClear={() => setSearch('')}
          />
        ) : filtering ? (
          <div className="px-4 py-10 text-center">
            <p className="text-body text-text2 dark:text-dark-text2">
              {archived
                ? t({ fr: 'Aucun document archivé.', ht: 'Pa gen dokiman achive.' })
                : t({ fr: 'Aucun document dans cette vue.', ht: 'Pa gen dokiman nan vi sa a.' })}
            </p>
            <div className="mt-6 flex justify-center">
              <Button variant="quiet" onClick={clearFilters}>
                {t({ fr: 'Voir tous les documents', ht: 'Wè tout dokiman yo' })}
              </Button>
            </div>
          </div>
        ) : (
          <FirstRun
            title={t({ fr: 'La bibliothèque est vide', ht: 'Bibliyotèk la vid' })}
            hint={t({
              fr: 'Déposez un premier document : une patente, un bail, une facture importante.',
              ht: 'Depoze yon premye dokiman : yon patant, yon kontra kay, yon fakti enpòtan.',
            })}
            action={
              <Button variant="accent" block onClick={() => setUploadOpen(true)}>
                {t({ fr: 'Déposer un document', ht: 'Depoze yon dokiman' })}
              </Button>
            }
          />
        )}
      </div>

      <DocumentUploader
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        types={types}
        onUploaded={(id) => router.push(`/documents/${id}`)}
      />
    </div>
  );
}

export default function BibliothequePage() {
  // `useSearchParams()` exige une frontière de suspense : sans elle, la page
  // entière serait rendue à la demande, y compris sa coquille.
  return (
    <Suspense fallback={null}>
      <LibraryScreen />
    </Suspense>
  );
}
