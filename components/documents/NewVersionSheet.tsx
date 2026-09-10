'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Déposer une nouvelle version d'un document (§38)
//
// La même mécanique que la feuille de dépôt initial, réduite à ce qui change :
// un fichier, et un mot pour dire ce qui a bougé. Le nom, le type, l'échéance
// appartiennent au document, pas à sa version — les redemander laisserait
// croire qu'on peut les changer ici, et créerait deux endroits pour la même
// information.
//
// ── Le libellé n'est pas décoratif ──────────────────────────────────────────
//
// « Signé par le fournisseur », « Version corrigée après contrôle » : six mois
// plus tard, c'est la seule chose qui permette de choisir laquelle restaurer.
// Une liste de « Version 2, Version 3, Version 4 » ne se relit pas.
//
// XMLHttpRequest, comme la feuille de dépôt, et pour la même raison : `fetch()`
// ne rapporte pas la progression d'un envoi, et une minute sans barre sur une
// connexion mobile se termine en double dépôt.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useRef, useState } from 'react';
import { FileUp, X } from 'lucide-react';

import { useLanguage } from '../LanguageWrapper';
import { BottomSheet, Button, Field } from '../ds';
import { DOCUMENT_MAX_BYTES } from '../../lib/documents/types';
import { formatBytes } from '../../lib/documents/storage';

type Props = {
  open: boolean;
  documentId: string;
  onClose: () => void;
  onUploaded: (version: number) => void;
};

export function NewVersionSheet({ open, documentId, onClose, onUploaded }: Props) {
  const { t } = useLanguage();

  const [file, setFile]         = useState<File | null>(null);
  const [label, setLabel]       = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError]       = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const busy = progress !== null;

  const reset = useCallback(() => {
    setFile(null); setLabel(''); setProgress(null); setError(null);
  }, []);

  const close = useCallback(() => {
    if (busy) return;
    reset();
    onClose();
  }, [busy, reset, onClose]);

  const choose = useCallback((chosen: File) => {
    if (chosen.size > DOCUMENT_MAX_BYTES) {
      setError(t({
        fr: `Ce fichier pèse ${formatBytes(chosen.size)} — la limite est de ${formatBytes(DOCUMENT_MAX_BYTES)}.`,
        ht: `Fichye sa a peze ${formatBytes(chosen.size)} — limit la se ${formatBytes(DOCUMENT_MAX_BYTES)}.`,
      }));
      return;
    }
    setError(null);
    setFile(chosen);
  }, [t]);

  const submit = useCallback(() => {
    if (!file) return;
    setError(null);
    setProgress(0);

    const form = new FormData();
    form.append('file', file);
    if (label.trim()) form.append('label', label.trim());

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/documents/${documentId}/versions`);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) setProgress(Math.round((event.loaded / event.total) * 100));
    };

    xhr.onload = () => {
      let body: { version?: number; error?: string } = {};
      try { body = JSON.parse(xhr.responseText); } catch { /* réponse non JSON */ }

      if (xhr.status === 201 && body.version) {
        const version = body.version;
        reset();
        onUploaded(version);
        return;
      }

      setProgress(null);
      setError(body.error ?? t({
        fr: 'Le dépôt a échoué. Réessayez dans un instant.',
        ht: 'Depo a pa mache. Eseye ankò nan yon ti moman.',
      }));
    };

    xhr.onerror = () => {
      setProgress(null);
      setError(t({
        fr: 'La connexion a été interrompue. La nouvelle version n’a pas été déposée.',
        ht: 'Koneksyon an koupe. Nouvo vèsyon an pa depoze.',
      }));
    };

    xhr.send(form);
  }, [file, label, documentId, reset, onUploaded, t]);

  return (
    <BottomSheet
      open={open}
      onClose={close}
      title={t({ fr: 'Nouvelle version', ht: 'Nouvo vèsyon' })}
      footer={
        <div className="flex gap-3">
          <Button variant="quiet" onClick={close} disabled={busy}>
            {t({ fr: 'Annuler', ht: 'Anile' })}
          </Button>
          <Button
            variant="accent"
            block
            disabled={!file}
            loading={busy}
            loadingLabel={progress !== null ? `${progress} %` : undefined}
            onClick={submit}
          >
            {t({ fr: 'Déposer', ht: 'Depoze' })}
          </Button>
        </div>
      }
    >
      <p className="text-note text-muted dark:text-dark-muted">
        {t({
          fr: 'La version actuelle est conservée. Elle restera consultable et restaurable.',
          ht: 'Vèsyon ki la kounye a ap rete. W ap toujou ka wè l epi remete l.',
        })}
      </p>

      <div className="mt-4">
        {file ? (
          <div className="flex min-h-touch items-center gap-3 rounded-surface border border-border bg-white px-4 py-3 dark:border-dark-border dark:bg-dark-surface">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-body font-bold text-primary dark:text-dark-text">{file.name}</span>
              <span className="block text-note text-muted dark:text-dark-muted">{formatBytes(file.size)}</span>
            </span>
            {!busy && (
              <button
                type="button"
                onClick={() => setFile(null)}
                aria-label={t({ fr: 'Retirer le fichier', ht: 'Retire fichye a' })}
                className="pressable flex h-touch w-touch items-center justify-center rounded-control text-muted"
              >
                <X className="h-4 w-4" strokeWidth={1.8} aria-hidden />
              </button>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex w-full flex-col items-center gap-2 rounded-surface border border-dashed border-border px-4 py-8 text-center dark:border-dark-border"
          >
            <FileUp className="h-6 w-6 text-muted" strokeWidth={1.5} aria-hidden />
            <span className="text-body font-bold text-primary dark:text-dark-text">
              {t({ fr: 'Choisir le fichier', ht: 'Chwazi fichye a' })}
            </span>
            <span className="text-note text-muted dark:text-dark-muted">
              {t({ fr: `Jusqu’à ${formatBytes(DOCUMENT_MAX_BYTES)}`, ht: `Jiska ${formatBytes(DOCUMENT_MAX_BYTES)}` })}
            </span>
          </button>
        )}

        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) choose(f); }}
        />
      </div>

      <div className="mt-4">
        <Field
          label={t({ fr: 'Ce qui change', ht: 'Sa ki chanje' })}
          hint={t({
            fr: 'Six mois plus tard, c’est ce mot qui dira laquelle restaurer.',
            ht: 'Nan sis mwa, se mo sa a k ap di kilès pou remete.',
          })}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={t({ fr: 'Signé par le fournisseur', ht: 'Founisè a siyen l' })}
          maxLength={120}
          disabled={busy}
        />
      </div>

      {progress !== null && (
        <div className="mt-4 h-1.5 w-full overflow-hidden rounded-pill bg-surface2 dark:bg-dark-surface2">
          <div className="h-full bg-accent transition-all" style={{ width: `${progress}%` }} />
        </div>
      )}

      {error && <p className="mt-3 text-note text-danger" role="alert">{error}</p>}
    </BottomSheet>
  );
}
