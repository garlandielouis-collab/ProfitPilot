'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Le bloc « Documents » d'une fiche — fournisseur, client, employé (§37)
//
// La bibliothèque répond à « où est ce document ? ». Ce bloc-ci répond à la
// question inverse, et c'est celle que le marchand se pose vraiment quand il a
// quelqu'un au téléphone : « qu'est-ce que j'ai sur CE fournisseur ? »
//
// ── Deux gestes, et pas un seul ─────────────────────────────────────────────
//
//   Déposer     le fichier n'existe pas encore. Le rattachement se fait à
//               l'envoi — la route accepte déjà `entityType` / `entityId`.
//   Rattacher   le fichier est déjà dans la bibliothèque. C'est le cas du §36 :
//               un contrat appartient au fournisseur ET à la commande. Sans ce
//               second geste, le marchand redéposerait le même PDF sur chaque
//               fiche, et l'application aurait trois vérités pour un document.
//
// Le second est volontairement plus discret : un lien sous la liste, pas un
// bouton à côté du premier. Deux boutons de même poids dans un en-tête de
// section obligent à choisir avant d'avoir compris la différence.
//
// ── Détacher n'est pas supprimer ────────────────────────────────────────────
//
// La croix retire le RATTACHEMENT. Le document reste dans la bibliothèque, et
// reste attaché à tout le reste. C'est pour cela que la ligne porte `linkId` et
// non seulement l'identifiant du document — et c'est pour cela qu'il n'y a pas
// de confirmation : le geste est réversible d'un clic, à deux lignes d'ici.
//
// ── Ce que le bloc fait quand il n'a pas le droit ───────────────────────────
//
// Rien. Pas d'encart verrouillé, pas d'invitation à monter d'offre au milieu
// d'une fiche client : la section disparaît. Un cadenas sur chaque fiche de
// chaque écran serait la publicité la plus fatigante de l'application.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react';
import { Link2, Search, Upload, X } from 'lucide-react';

import { useLanguage } from '../LanguageWrapper';
import { usePermissions } from '../../hooks/usePermissions';
import { BottomSheet, Button, FirstRun, NoResult } from '../ds';
import { DocumentRow } from './DocumentList';
import { DocumentUploader } from './DocumentUploader';
import { cn } from '../../lib/utils';
import {
  linkDocument, listDocuments, listDocumentTypes, listDocumentsForEntity, unlinkDocument,
  type DocumentSummary, type DocumentTypeOption, type EntityDocument,
} from '../../app/actions/documents';
import type { Bilingual, DocumentEntityType } from '../../lib/documents/types';
import { unwrap, screenMessage  } from '../../lib/actionResult';

/** Ce qu'on range sur cette fiche-là. Une phrase vraie vaut mieux qu'un
 *  « Aucun document » qui n'apprend rien sur ce qu'il faudrait déposer. */
const HINTS: Partial<Record<DocumentEntityType, Bilingual>> = {
  supplier: {
    fr: 'Le contrat, les bons de commande, la correspondance avec ce fournisseur.',
    ht: 'Kontra a, bon kòmand yo, korespondans ak founisè sa a.',
  },
  customer: {
    fr: 'Le devis signé, la reconnaissance de dette, la pièce d’identité.',
    ht: 'Deviz siyen an, rekonesans dèt la, pyès idantite a.',
  },
  employee: {
    fr: 'Le contrat de travail, la pièce d’identité, les fiches de paie.',
    ht: 'Kontra travay la, pyès idantite a, fich peman yo.',
  },
};

const FALLBACK_HINT: Bilingual = {
  fr: 'Déposez ici tout document qui concerne cette fiche.',
  ht: 'Depoze isit tout dokiman ki konsène fich sa a.',
};

/** Combien de documents la feuille de rattachement propose d'un coup. Huit
 *  tiennent sur un écran de téléphone sans le faire défiler. */
const PICKER_SIZE = 8;

type Props = {
  entityType: DocumentEntityType;
  entityId:   string;
  /** Le nom de l'objet — il apparaît dans la feuille de rattachement, pour que
   *  le marchand sache à QUOI il attache pendant qu'il cherche. */
  entityName?: string;
  className?: string;
};

export function EntityDocuments({ entityType, entityId, entityName, className }: Props) {
  const { t } = useLanguage();
  const { can, canUse, loading: permissionsLoading } = usePermissions();

  const [documents, setDocuments] = useState<EntityDocument[]>([]);
  const [types,     setTypes]     = useState<DocumentTypeOption[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [busyLink,  setBusyLink]  = useState<string | null>(null);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const mayRead   = canUse('documents') && can('documents:read');
  const mayUpload = mayRead && can('documents:create');
  const mayAttach = mayRead && can('documents:update');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setDocuments(unwrap(await listDocumentsForEntity(entityType, entityId)));
      setError(null);
    } catch (err) {
      setError(screenMessage(err, 'Chargement impossible.'));
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId]);

  useEffect(() => {
    if (!mayRead) return;
    void load();
  }, [mayRead, load]);

  // Le catalogue compte soixante et un types : il ne se charge qu'au moment où
  // la feuille de dépôt s'ouvre. Le chercher à l'affichage de la fiche ferait
  // une requête de plus sur chaque fournisseur consulté, pour un dépôt qui
  // n'arrive presque jamais.
  useEffect(() => {
    if (!uploadOpen || types.length > 0) return;
    listDocumentTypes().then(unwrap).then(setTypes).catch(() => { /* le dépôt le signalera */ });
  }, [uploadOpen, types.length]);

  const detach = useCallback(async (linkId: string) => {
    setBusyLink(linkId);
    try {
      unwrap(await unlinkDocument(linkId));
      setDocuments((previous) => previous.filter((d) => d.linkId !== linkId));
      setError(null);
    } catch (err) {
      setError(screenMessage(err, 'Détachement impossible.'));
    } finally {
      setBusyLink(null);
    }
  }, []);

  const attach = useCallback(async (documentId: string) => {
    await linkDocument({ documentId, entityType, entityId });
    setPickerOpen(false);
    await load();
  }, [entityType, entityId, load]);

  // Le droit de lire se vérifie AVANT de rendre quoi que ce soit : pendant que
  // le contexte se résout, la section n'existe pas encore — elle ne clignote
  // pas en « vide » pour se remplir ensuite.
  if (permissionsLoading || !mayRead) return null;

  const hint = t(HINTS[entityType] ?? FALLBACK_HINT);

  const attachLink = mayAttach ? (
    <button
      type="button"
      onClick={() => setPickerOpen(true)}
      className="inline-flex min-h-touch items-center gap-1.5 text-note font-semibold text-primary transition hover:underline"
    >
      <Link2 className="h-4 w-4" strokeWidth={1.8} aria-hidden />
      {t({ fr: 'Rattacher un document existant', ht: 'Tache yon dokiman ki deja la' })}
    </button>
  ) : null;

  return (
    <section className={cn('rounded-surface border border-[var(--color-border)] bg-[var(--color-surface)]', className)}>
      <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-[var(--color-muted)]">
          {t({ fr: 'Documents', ht: 'Dokiman' })}
          {documents.length > 0 && ` (${documents.length})`}
        </p>

        {mayUpload && documents.length > 0 && (
          <Button
            size="sm"
            variant="soft"
            icon={<Upload className="h-4 w-4" strokeWidth={1.8} aria-hidden />}
            onClick={() => setUploadOpen(true)}
          >
            {t({ fr: 'Déposer', ht: 'Depoze' })}
          </Button>
        )}
      </div>

      <div className="px-5 py-4">
        {loading ? (
          <div className="flex justify-center py-6" aria-live="polite">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-primary" />
            <span className="sr-only">{t({ fr: 'Chargement…', ht: 'Chajman…' })}</span>
          </div>
        ) : error ? (
          <p className="py-4 text-center text-sm text-red-600" role="alert">{error}</p>
        ) : documents.length === 0 ? (
          <FirstRun
            className="py-4"
            title={t({ fr: 'Aucun document rattaché', ht: 'Pa gen dokiman tache' })}
            hint={hint}
            action={
              <div className="flex flex-col items-center gap-3">
                {mayUpload && (
                  <Button variant="accent" block onClick={() => setUploadOpen(true)}>
                    {t({ fr: 'Déposer un document', ht: 'Depoze yon dokiman' })}
                  </Button>
                )}
                {attachLink}
              </div>
            }
          />
        ) : (
          <>
            <ul className="space-y-2">
              {documents.map((doc) => (
                <DocumentRow
                  key={doc.linkId}
                  doc={doc}
                  action={mayAttach ? (
                    <button
                      type="button"
                      onClick={() => void detach(doc.linkId)}
                      disabled={busyLink === doc.linkId}
                      title={t({ fr: 'Détacher de cette fiche', ht: 'Detache nan fich sa a' })}
                      aria-label={t({ fr: 'Détacher de cette fiche', ht: 'Detache nan fich sa a' })}
                      className="inline-flex min-h-touch min-w-touch items-center justify-center rounded-control text-muted transition hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                    >
                      <X className="h-4 w-4" strokeWidth={1.8} aria-hidden />
                    </button>
                  ) : null}
                />
              ))}
            </ul>

            {attachLink && <div className="mt-3">{attachLink}</div>}
          </>
        )}
      </div>

      <DocumentUploader
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        types={types}
        entityType={entityType}
        entityId={entityId}
        /* La feuille se referme d'elle-même après un dépôt réussi ; il ne
           reste qu'à relire la liste, qui compte un document de plus. */
        onUploaded={() => void load()}
      />

      {mayAttach && (
        <DocumentPicker
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          onPick={attach}
          attachedIds={documents.map((d) => d.id)}
          entityName={entityName}
        />
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// La feuille de rattachement
//
// Elle s'ouvre sur les derniers documents modifiés plutôt que sur un champ
// vide : neuf fois sur dix, celui qu'on veut attacher vient d'être déposé.
// La recherche sert au dixième cas.
//
// Les documents DÉJÀ attachés sont retirés de la liste. Les afficher grisés
// dirait « il est là, mais tu ne peux pas » ; les retirer dit la vérité — il
// n'y a plus rien à faire pour eux.
// ─────────────────────────────────────────────────────────────────────────────

function DocumentPicker({
  open, onClose, onPick, attachedIds, entityName,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (documentId: string) => Promise<void>;
  attachedIds: string[];
  entityName?: string;
}) {
  const { t, language } = useLanguage();

  const [search,    setSearch]    = useState('');
  const [debounced, setDebounced] = useState('');
  const [results,   setResults]   = useState<DocumentSummary[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [busyId,    setBusyId]    = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // La recherche repart de zéro à chaque fermeture : la prochaine ouverture
  // parlera peut-être d'une autre fiche.
  useEffect(() => {
    if (open) return;
    setSearch(''); setDebounced(''); setError(null);
  }, [open]);

  const size = PICKER_SIZE + attachedIds.length;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    // Une marge au-dessus de PICKER_SIZE : les déjà-attachés se retirent APRÈS
    // la requête, et sans elle une liste de huit pourrait revenir vide.
    listDocuments({ search: debounced || undefined, limit: size })
      .then(unwrap)
      .then((r) => { if (!cancelled) { setResults(r.documents); setError(null); } })
      .catch((err) => { if (!cancelled) setError(screenMessage(err, 'Recherche impossible.')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, debounced, size]);

  // Huit lignes filtrées à chaque rendu : mémoïser un tableau qui change
  // d'identité à chaque rendu du parent ne ferait qu'ajouter du code.
  const attached = new Set(attachedIds);
  const visible  = results.filter((d) => !attached.has(d.id)).slice(0, PICKER_SIZE);

  const pick = useCallback(async (id: string) => {
    setBusyId(id);
    try {
      await onPick(id);
    } catch (err) {
      setError(screenMessage(err, 'Rattachement impossible.'));
    } finally {
      setBusyId(null);
    }
  }, [onPick]);

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={entityName
        ? t({ fr: `Rattacher à ${entityName}`, ht: `Tache ak ${entityName}` })
        : t({ fr: 'Rattacher un document', ht: 'Tache yon dokiman' })}
    >
      <div className="relative">
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

      <div className="mt-4">
        {error && <p className="py-2 text-center text-note text-red-600" role="alert">{error}</p>}

        {loading ? (
          <div className="flex justify-center py-8">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-primary" />
          </div>
        ) : visible.length === 0 ? (
          debounced ? (
            <NoResult
              query={debounced}
              noun={t({ fr: 'document', ht: 'dokiman' })}
              onClear={() => setSearch('')}
            />
          ) : (
            <p className="py-8 text-center text-body text-muted">
              {t({
                fr: 'La bibliothèque ne contient aucun autre document à rattacher.',
                ht: 'Bibliyotèk la pa gen okenn lòt dokiman pou tache.',
              })}
            </p>
          )
        ) : (
          <ul className="space-y-2">
            {visible.map((doc) => (
              <li key={doc.id}>
                <button
                  type="button"
                  onClick={() => void pick(doc.id)}
                  disabled={busyId !== null}
                  className="flex min-h-touch w-full items-center gap-3 rounded-surface border border-border bg-white px-4 py-3 text-left transition hover:border-slate-300 disabled:opacity-50 dark:border-dark-border dark:bg-dark-surface"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body font-bold text-primary dark:text-dark-text">
                      {doc.name}
                    </span>
                    <span className="block truncate text-note text-muted dark:text-dark-muted">
                      {(language === 'ht' ? doc.typeLabelHt : doc.typeLabelFr)
                        ?? t({ fr: 'Sans type', ht: 'San kalite' })}
                    </span>
                  </span>
                  <Link2 className="h-4 w-4 flex-shrink-0 text-muted" strokeWidth={1.8} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </BottomSheet>
  );
}
