'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Déposer un document
//
// ── Pourquoi XMLHttpRequest et pas fetch ────────────────────────────────────
//
// `fetch()` ne rapporte pas la progression d'un envoi. Sur une connexion mobile
// haïtienne, un PDF de 8 Mo met facilement une minute : sans barre, le marchand
// croit l'application figée et recommence — deux envois, deux documents. XHR
// est la seule API du navigateur qui expose `upload.onprogress`, et c'est la
// seule raison pour laquelle il est ici.
//
// ── Ce que cette feuille NE valide PAS ──────────────────────────────────────
//
// Le type du fichier. Elle regarde la taille, parce que refuser 40 Mo avant de
// les envoyer économise une minute au marchand — mais le TYPE est décidé par le
// serveur, sur les octets d'en-tête (§10). Rejeter ici sur l'extension
// donnerait deux règles : celle du navigateur, contournable, et celle de la
// base. C'est toujours la seconde qui tranche.
//
// ── La date d'expiration ────────────────────────────────────────────────────
//
// Elle n'apparaît que si le type choisi en demande une (`requiresExpiration`).
// Demander « quand ce document expire-t-il ? » sur une facture n'appelle aucune
// réponse juste, et un champ sans réponse juste finit rempli n'importe comment.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useMemo, useRef, useState } from 'react';
import { FileUp, Paperclip, X } from 'lucide-react';

import { useLanguage } from '../LanguageWrapper';
import { BottomSheet, Button, Field, SelectField } from '../ds';
import { DOCUMENT_MAX_BYTES, CATEGORY_LABELS } from '../../lib/documents/types';
import { formatBytes } from '../../lib/documents/storage';
import type { DocumentTypeOption } from '../../app/actions/documents';

type Props = {
  open: boolean;
  onClose: () => void;
  /** Le catalogue, déjà chargé par l'écran — la feuille ne va pas le rechercher. */
  types: DocumentTypeOption[];
  /** Appelé avec l'identifiant du document créé, une fois le dépôt terminé. */
  onUploaded: (documentId: string) => void;
  /** Dépôt depuis une fiche (fournisseur, client, employé) : le lien se crée seul. */
  entityType?: string;
  entityId?: string;
};

/** Le nom proposé : le fichier sans son extension. Modifiable, évidemment. */
function suggestName(filename: string): string {
  const dot = filename.lastIndexOf('.');
  const base = dot > 0 ? filename.slice(0, dot) : filename;
  return base.replace(/[_-]+/g, ' ').trim().slice(0, 200);
}

export function DocumentUploader({
  open, onClose, types, onUploaded, entityType, entityId,
}: Props) {
  const { t, language } = useLanguage();

  const [file, setFile]         = useState<File | null>(null);
  const [name, setName]         = useState('');
  const [typeId, setTypeId]     = useState('');
  const [expiresOn, setExpires] = useState('');
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError]       = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  const selectedType = useMemo(
    () => types.find((ty) => ty.id === typeId) ?? null,
    [types, typeId],
  );

  // Le catalogue compte soixante et un types. Chaque libellé porte sa catégorie
  // — « Conformité · Patente » — parce que « Patente » seul, au milieu de
  // soixante autres, ne dit pas où l'on est dans la liste. Le catalogue arrive
  // déjà trié par `sort_order`, qui suit l'ordre narratif des catégories : les
  // types d'une même famille se suivent donc naturellement.
  const options = useMemo(
    () => types.map((ty) => ({
      value: ty.id,
      label: `${t(CATEGORY_LABELS[ty.category])} · ${language === 'ht' ? ty.labelHt : ty.labelFr}`,
    })),
    [types, t, language],
  );

  const reset = useCallback(() => {
    setFile(null); setName(''); setTypeId(''); setExpires('');
    setProgress(null); setError(null); setDragging(false);
  }, []);

  const close = useCallback(() => {
    if (progress !== null) return;   // un envoi en cours ne se ferme pas par mégarde
    reset();
    onClose();
  }, [progress, reset, onClose]);

  const accept = useCallback((chosen: File | null | undefined) => {
    if (!chosen) return;
    setError(null);

    if (chosen.size > DOCUMENT_MAX_BYTES) {
      setError(t({
        fr: `Ce fichier pèse ${formatBytes(chosen.size)} — la limite est de ${formatBytes(DOCUMENT_MAX_BYTES)}.`,
        ht: `Fichye sa a peze ${formatBytes(chosen.size)} — limit la se ${formatBytes(DOCUMENT_MAX_BYTES)}.`,
      }));
      return;
    }

    setFile(chosen);
    if (!name) setName(suggestName(chosen.name));
  }, [name, t]);

  const submit = useCallback(() => {
    if (!file) return;
    setError(null);
    setProgress(0);

    const form = new FormData();
    form.append('file', file);
    form.append('name', name.trim() || suggestName(file.name));
    if (typeId)    form.append('documentTypeId', typeId);
    if (expiresOn) form.append('expiresOn', expiresOn);
    if (entityType && entityId) {
      form.append('entityType', entityType);
      form.append('entityId', entityId);
    }

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/documents/upload');

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) setProgress(Math.round((event.loaded / event.total) * 100));
    };

    xhr.onload = () => {
      let body: { id?: string; error?: string } = {};
      try { body = JSON.parse(xhr.responseText); } catch { /* réponse non JSON */ }

      if (xhr.status === 201 && body.id) {
        const id = body.id;
        reset();
        onUploaded(id);
        onClose();
        return;
      }

      setProgress(null);
      setError(body.error ?? t({
        fr: "Le dépôt a échoué. Réessayez dans un instant.",
        ht: 'Depo a pa mache. Eseye ankò nan yon ti moman.',
      }));
    };

    xhr.onerror = () => {
      setProgress(null);
      setError(t({
        fr: 'La connexion a été interrompue. Le document n’a pas été déposé.',
        ht: 'Koneksyon an koupe. Dokiman an pa depoze.',
      }));
    };

    xhr.send(form);
  }, [file, name, typeId, expiresOn, entityType, entityId, reset, onUploaded, onClose, t]);

  const busy = progress !== null;

  return (
    <BottomSheet
      open={open}
      onClose={close}
      title={t({ fr: 'Déposer un document', ht: 'Depoze yon dokiman' })}
      footer={
        <div className="flex gap-3">
          <Button variant="quiet" onClick={close} disabled={busy}>
            {t({ fr: 'Annuler', ht: 'Anile' })}
          </Button>
          <Button
            variant="accent"
            block
            onClick={submit}
            disabled={!file}
            loading={busy}
            loadingLabel={
              progress !== null && progress < 100
                ? t({ fr: `Envoi ${progress} %`, ht: `Voye ${progress} %` })
                : t({ fr: 'Enregistrement…', ht: 'Anrejistreman…' })
            }
          >
            {t({ fr: 'Déposer', ht: 'Depoze' })}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* ── Le fichier ─────────────────────────────────────────────────── */}
        {file ? (
          <div className="flex items-center gap-3 rounded-control border border-border bg-surface2 px-3 py-3 dark:border-dark-border dark:bg-dark-surface2">
            <Paperclip className="h-4 w-4 flex-shrink-0 text-muted" strokeWidth={1.8} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate text-body font-bold text-primary dark:text-dark-text">{file.name}</p>
              <p className="amount text-note text-muted dark:text-dark-muted">{formatBytes(file.size)}</p>
            </div>
            {!busy && (
              <button
                type="button"
                onClick={() => { setFile(null); setProgress(null); }}
                className="pressable flex h-touch w-touch items-center justify-center rounded-control text-muted"
                aria-label={t({ fr: 'Retirer le fichier', ht: 'Retire fichye a' })}
              >
                <X className="h-4 w-4" strokeWidth={1.8} aria-hidden />
              </button>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              accept(e.dataTransfer.files?.[0]);
            }}
            className={[
              'flex w-full flex-col items-center gap-2 rounded-surface border border-dashed px-4 py-8',
              'transition-colors duration-press ease-pp',
              dragging
                ? 'border-accent bg-accent-sub'
                : 'border-border bg-surface2 dark:border-dark-border dark:bg-dark-surface2',
            ].join(' ')}
          >
            <FileUp className="h-6 w-6 text-muted" strokeWidth={1.5} aria-hidden />
            <span className="text-body font-bold text-primary dark:text-dark-text">
              {t({ fr: 'Choisir un fichier', ht: 'Chwazi yon fichye' })}
            </span>
            <span className="text-note text-muted dark:text-dark-muted">
              {t({
                fr: `PDF, Word, Excel, photo — jusqu’à ${formatBytes(DOCUMENT_MAX_BYTES)}`,
                ht: `PDF, Word, Excel, foto — jiska ${formatBytes(DOCUMENT_MAX_BYTES)}`,
              })}
            </span>
          </button>
        )}

        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            accept(e.target.files?.[0]);
            // Le champ garde sa valeur : retirer un fichier puis rechoisir le
            // MÊME ne déclencherait aucun événement, et le marchand croirait
            // que l'application ignore son clic.
            e.target.value = '';
          }}
        />

        {/* ── La fiche ───────────────────────────────────────────────────── */}
        <Field
          label={t({ fr: 'Nom du document', ht: 'Non dokiman an' })}
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={busy}
          placeholder={t({ fr: 'Licence commerciale 2027', ht: 'Lisans komèsyal 2027' })}
        />

        <SelectField
          label={t({ fr: 'Type', ht: 'Kalite' })}
          hint={t({
            fr: 'Le type décide qui peut lire le document et s’il faut surveiller sa date.',
            ht: 'Kalite a deside kiyès ki ka li dokiman an epi si dat li dwe siveye.',
          })}
          value={typeId}
          onChange={(e) => setTypeId(e.target.value)}
          disabled={busy}
          placeholder={t({ fr: 'Sans type', ht: 'San kalite' })}
          options={options}
        />

        {selectedType?.requiresExpiration && (
          <Field
            label={t({ fr: 'Date d’expiration', ht: 'Dat ekspirasyon' })}
            hint={t({
              fr: 'Vous serez prévenu 30, 15, 7 et 1 jour avant.',
              ht: 'W ap resevwa avètisman 30, 15, 7 ak 1 jou anvan.',
            })}
            type="date"
            value={expiresOn}
            onChange={(e) => setExpires(e.target.value)}
            disabled={busy}
          />
        )}

        {/* ── L'envoi ────────────────────────────────────────────────────── */}
        {busy && (
          <div
            className="h-2 w-full overflow-hidden rounded-pill bg-surface2 dark:bg-dark-surface2"
            role="progressbar"
            aria-valuenow={progress ?? 0}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-pill bg-accent transition-[width] duration-300"
              style={{ width: `${Math.max(3, progress ?? 0)}%` }}
            />
          </div>
        )}

        {error && (
          <p className="rounded-control bg-danger-sub px-3 py-2 text-body text-danger">{error}</p>
        )}
      </div>
    </BottomSheet>
  );
}
