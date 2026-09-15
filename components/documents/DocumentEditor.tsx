'use client';

// ─────────────────────────────────────────────────────────────────────────────
// L'éditeur de documents (§20)
//
// « Un éditeur de documents, pas un traitement de texte. » La différence n'est
// pas une limitation : c'est ce qui rend l'écran utilisable au pouce, sur un
// téléphone, dans une boutique. Il n'y a ni police à choisir, ni taille, ni
// couleur — parce qu'aucun de ces choix n'améliore un contrat, et que chacun
// d'eux ajoute une barre d'outils.
//
// On ajoute un bloc, on écrit dedans, on le monte ou on le descend. C'est tout,
// et c'est suffisant pour un contrat, un devis, une procédure.
//
// ── Deux vues, un seul contenu ──────────────────────────────────────────────
//
// « Écrire » montre les champs ; « Relire » montre le document tel qu'il sera
// imprimé. Le va-et-vient entre les deux est le geste central : personne ne
// signe un formulaire de saisie.
//
// ── L'enregistrement ────────────────────────────────────────────────────────
//
// Explicite, jamais automatique. Chaque enregistrement qui change quelque chose
// crée une version (§38) ; enregistrer à chaque frappe ferait cent versions
// d'un contrat et rendrait l'historique illisible. Le bouton reste désactivé
// tant que rien n'a bougé, et l'écran prévient avant de quitter avec du non
// enregistré.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react';
import {
  ArrowDown, ArrowUp, Eye, Pencil, Plus, Save, Trash2, X,
} from 'lucide-react';

import { useLanguage } from '../LanguageWrapper';
import { Button, Card } from '../ds';
import { DocumentBlocks } from './DocumentBlocks';
import {
  BLOCK_LABELS, BLOCK_TYPES, emptyBlock,
  type BlockType, type PlainBlock,
} from '../../lib/documents/blocks';
import { screenMessage } from '../../lib/actionResult';

const INPUT =
  'min-h-touch w-full rounded-control border border-border bg-white px-3 py-2 text-body '
  + 'text-primary outline-none placeholder:text-muted focus:border-primary/40 '
  + 'dark:border-dark-border dark:bg-dark-surface dark:text-dark-text';

const AREA = INPUT.replace('min-h-touch', 'min-h-[6rem]') + ' leading-relaxed';

type Props = {
  initial: PlainBlock[];
  /** Rend `true` si le contenu a bougé côté serveur — l'écran s'en sert pour
   *  dire « version 3 enregistrée » plutôt qu'un « enregistré » qui ment. */
  onSave: (blocks: PlainBlock[]) => Promise<void>;
  onCancel?: () => void;
};

export function DocumentEditor({ initial, onSave, onCancel }: Props) {
  const { t } = useLanguage();

  const [blocks, setBlocks] = useState<PlainBlock[]>(initial);
  const [dirty, setDirty]   = useState(false);
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  // Fermer l'onglet avec un contrat à moitié écrit doit coûter une question.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const change = useCallback((next: PlainBlock[]) => {
    setBlocks(next);
    setDirty(true);
  }, []);

  const update = useCallback((index: number, block: PlainBlock) => {
    change(blocks.map((b, i) => (i === index ? block : b)));
  }, [blocks, change]);

  const move = useCallback((index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= blocks.length) return;
    const next = [...blocks];
    [next[index], next[target]] = [next[target], next[index]];
    change(next);
  }, [blocks, change]);

  const remove = useCallback((index: number) => {
    change(blocks.filter((_, i) => i !== index));
  }, [blocks, change]);

  const append = useCallback((type: BlockType) => {
    change([...blocks, emptyBlock(type)]);
  }, [blocks, change]);

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave(blocks);
      setDirty(false);
    } catch (err) {
      setError(screenMessage(err, 'Enregistrement impossible.'));
    } finally {
      setSaving(false);
    }
  }, [blocks, onSave]);

  return (
    <div className="pb-28">
      {/* ── Écrire / Relire ────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={preview ? 'quiet' : 'soft'}
            icon={<Pencil className="h-4 w-4" strokeWidth={1.8} aria-hidden />}
            onClick={() => setPreview(false)}
          >
            {t({ fr: 'Écrire', ht: 'Ekri' })}
          </Button>
          <Button
            size="sm"
            variant={preview ? 'soft' : 'quiet'}
            icon={<Eye className="h-4 w-4" strokeWidth={1.8} aria-hidden />}
            onClick={() => setPreview(true)}
          >
            {t({ fr: 'Relire', ht: 'Reli' })}
          </Button>
        </div>

        {dirty && (
          <span className="text-note text-muted">
            {t({ fr: 'Non enregistré', ht: 'Poko anrejistre' })}
          </span>
        )}
      </div>

      {error && (
        <p className="mt-4 rounded-control border border-red-200 bg-red-50 px-4 py-3 text-note text-red-700" role="alert">
          {error}
        </p>
      )}

      {preview ? (
        <Card className="mt-4 p-5">
          <DocumentBlocks blocks={blocks} />
        </Card>
      ) : (
        <>
          <ul className="mt-4 space-y-3">
            {blocks.map((block, index) => (
              <li key={index}>
                <Card className="p-4">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <span className="text-note font-bold uppercase tracking-widest text-muted">
                      {t(BLOCK_LABELS[block.type])}
                    </span>
                    <span className="flex items-center gap-1">
                      <IconButton
                        label={t({ fr: 'Monter', ht: 'Monte' })}
                        disabled={index === 0}
                        onClick={() => move(index, -1)}
                      >
                        <ArrowUp className="h-4 w-4" strokeWidth={1.8} aria-hidden />
                      </IconButton>
                      <IconButton
                        label={t({ fr: 'Descendre', ht: 'Desann' })}
                        disabled={index === blocks.length - 1}
                        onClick={() => move(index, 1)}
                      >
                        <ArrowDown className="h-4 w-4" strokeWidth={1.8} aria-hidden />
                      </IconButton>
                      <IconButton
                        label={t({ fr: 'Retirer ce bloc', ht: 'Retire blòk sa a' })}
                        danger
                        onClick={() => remove(index)}
                      >
                        <Trash2 className="h-4 w-4" strokeWidth={1.8} aria-hidden />
                      </IconButton>
                    </span>
                  </div>

                  <BlockFields block={block} onChange={(next) => update(index, next)} />
                </Card>
              </li>
            ))}
          </ul>

          {/* ── Ajouter ──────────────────────────────────────────────────── */}
          <div className="mt-5">
            <p className="text-note font-bold uppercase tracking-widest text-muted">
              {t({ fr: 'Ajouter', ht: 'Ajoute' })}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {BLOCK_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => append(type)}
                  className="inline-flex min-h-touch items-center gap-1.5 rounded-control border border-border bg-white px-3 text-note font-semibold text-primary transition hover:border-slate-300 dark:border-dark-border dark:bg-dark-surface dark:text-dark-text"
                >
                  <Plus className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                  {t(BLOCK_LABELS[type])}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── La barre d'enregistrement ─────────────────────────────────────── */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-white/95 px-4 py-3 backdrop-blur dark:border-dark-border dark:bg-dark-surface/95">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          {onCancel && (
            <Button variant="quiet" onClick={onCancel} disabled={saving}>
              {t({ fr: 'Fermer', ht: 'Fèmen' })}
            </Button>
          )}
          <Button
            variant="accent"
            block
            loading={saving}
            loadingLabel={t({ fr: 'Enregistrement…', ht: 'Ap anrejistre…' })}
            disabled={!dirty}
            icon={<Save className="h-4 w-4" strokeWidth={1.8} aria-hidden />}
            onClick={() => void save()}
          >
            {dirty
              ? t({ fr: 'Enregistrer', ht: 'Anrejistre' })
              : t({ fr: 'Tout est enregistré', ht: 'Tout anrejistre' })}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Les champs d'un bloc
// ─────────────────────────────────────────────────────────────────────────────

function IconButton({
  children, label, onClick, disabled, danger,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`inline-flex min-h-touch min-w-touch items-center justify-center rounded-control text-muted transition disabled:opacity-30 ${
        danger ? 'hover:bg-red-50 hover:text-red-600' : 'hover:bg-surface2 hover:text-primary'
      }`}
    >
      {children}
    </button>
  );
}

function BlockFields({
  block, onChange,
}: {
  block: PlainBlock;
  onChange: (block: PlainBlock) => void;
}) {
  const { t } = useLanguage();

  switch (block.type) {
    case 'heading':
      return (
        <div className="flex gap-2">
          <select
            value={block.level ?? 2}
            onChange={(e) => onChange({ ...block, level: Number(e.target.value) as 1 | 2 | 3 })}
            aria-label={t({ fr: 'Niveau du titre', ht: 'Nivo tit la' })}
            className={`${INPUT} w-20 flex-shrink-0`}
          >
            <option value={1}>H1</option>
            <option value={2}>H2</option>
            <option value={3}>H3</option>
          </select>
          <input
            value={block.text}
            onChange={(e) => onChange({ ...block, text: e.target.value })}
            placeholder={t({ fr: 'Titre', ht: 'Tit' })}
            aria-label={t({ fr: 'Titre', ht: 'Tit' })}
            className={INPUT}
          />
        </div>
      );

    case 'paragraph':
    case 'notice':
      return (
        <textarea
          value={block.text}
          onChange={(e) => onChange({ ...block, text: e.target.value })}
          placeholder={block.type === 'notice'
            ? t({ fr: 'Ce qu’il faut lire avant de signer…', ht: 'Sa pou li anvan siyen…' })
            : t({ fr: 'Écrivez ici…', ht: 'Ekri isit…' })}
          aria-label={t({ fr: 'Texte', ht: 'Tèks' })}
          className={AREA}
        />
      );

    case 'list':
      return (
        <div className="space-y-2">
          <label className="flex min-h-touch items-center gap-2 text-note text-text2">
            <input
              type="checkbox"
              checked={block.ordered === true}
              onChange={(e) => onChange({ ...block, ordered: e.target.checked })}
              className="h-4 w-4"
            />
            {t({ fr: 'Numéroter les points', ht: 'Mete nimewo sou pwen yo' })}
          </label>

          {block.items.map((item, index) => (
            <div key={index} className="flex gap-2">
              <input
                value={item}
                onChange={(e) => onChange({
                  ...block,
                  items: block.items.map((v, i) => (i === index ? e.target.value : v)),
                })}
                aria-label={t({ fr: `Point ${index + 1}`, ht: `Pwen ${index + 1}` })}
                className={INPUT}
              />
              <IconButton
                label={t({ fr: 'Retirer ce point', ht: 'Retire pwen sa a' })}
                danger
                onClick={() => onChange({ ...block, items: block.items.filter((_, i) => i !== index) })}
              >
                <X className="h-4 w-4" strokeWidth={1.8} aria-hidden />
              </IconButton>
            </div>
          ))}

          <AddRow
            label={t({ fr: 'Ajouter un point', ht: 'Ajoute yon pwen' })}
            onClick={() => onChange({ ...block, items: [...block.items, ''] })}
          />
        </div>
      );

    case 'signature':
      return (
        <div className="space-y-2">
          {block.parties.map((party, index) => (
            <div key={index} className="flex gap-2">
              <input
                value={party}
                onChange={(e) => onChange({
                  ...block,
                  parties: block.parties.map((v, i) => (i === index ? e.target.value : v)),
                })}
                placeholder={t({ fr: 'Qui signe', ht: 'Kiyès ki siyen' })}
                aria-label={t({ fr: 'Signataire', ht: 'Moun ki siyen' })}
                className={INPUT}
              />
              <IconButton
                label={t({ fr: 'Retirer', ht: 'Retire' })}
                danger
                onClick={() => onChange({ ...block, parties: block.parties.filter((_, i) => i !== index) })}
              >
                <X className="h-4 w-4" strokeWidth={1.8} aria-hidden />
              </IconButton>
            </div>
          ))}
          <AddRow
            label={t({ fr: 'Ajouter un signataire', ht: 'Ajoute yon moun ki siyen' })}
            onClick={() => onChange({ ...block, parties: [...block.parties, ''] })}
          />
        </div>
      );

    case 'fields':
      return (
        <div className="space-y-2">
          {block.items.map((item, index) => (
            <div key={index} className="flex flex-col gap-2 sm:flex-row">
              <input
                value={item.label}
                onChange={(e) => onChange({
                  ...block,
                  items: block.items.map((v, i) => (i === index ? { ...v, label: e.target.value } : v)),
                })}
                placeholder={t({ fr: 'Intitulé', ht: 'Non enfòmasyon an' })}
                aria-label={t({ fr: 'Intitulé', ht: 'Non enfòmasyon an' })}
                className={`${INPUT} sm:w-1/3`}
              />
              <div className="flex flex-1 gap-2">
                <input
                  value={item.value}
                  onChange={(e) => onChange({
                    ...block,
                    items: block.items.map((v, i) => (i === index ? { ...v, value: e.target.value } : v)),
                  })}
                  placeholder={t({ fr: 'Valeur', ht: 'Valè' })}
                  aria-label={t({ fr: 'Valeur', ht: 'Valè' })}
                  className={INPUT}
                />
                <IconButton
                  label={t({ fr: 'Retirer', ht: 'Retire' })}
                  danger
                  onClick={() => onChange({ ...block, items: block.items.filter((_, i) => i !== index) })}
                >
                  <X className="h-4 w-4" strokeWidth={1.8} aria-hidden />
                </IconButton>
              </div>
            </div>
          ))}
          <AddRow
            label={t({ fr: 'Ajouter une ligne', ht: 'Ajoute yon liy' })}
            onClick={() => onChange({ ...block, items: [...block.items, { label: '', value: '' }] })}
          />
        </div>
      );

    case 'table':
      return (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {block.columns.map((column, index) => (
              <input
                key={index}
                value={column}
                onChange={(e) => onChange({
                  ...block,
                  columns: block.columns.map((v, i) => (i === index ? e.target.value : v)),
                })}
                placeholder={t({ fr: `Colonne ${index + 1}`, ht: `Kolòn ${index + 1}` })}
                aria-label={t({ fr: `Colonne ${index + 1}`, ht: `Kolòn ${index + 1}` })}
                className={`${INPUT} w-32 flex-1`}
              />
            ))}
          </div>

          <div className="space-y-2">
            {block.rows.map((row, rowIndex) => (
              <div key={rowIndex} className="flex gap-2">
                {block.columns.map((_, cellIndex) => (
                  <input
                    key={cellIndex}
                    value={row[cellIndex] ?? ''}
                    onChange={(e) => onChange({
                      ...block,
                      rows: block.rows.map((r, i) => (
                        i === rowIndex
                          ? block.columns.map((__, c) => (c === cellIndex ? e.target.value : r[c] ?? ''))
                          : r
                      )),
                    })}
                    aria-label={t({ fr: `Ligne ${rowIndex + 1}`, ht: `Liy ${rowIndex + 1}` })}
                    className={`${INPUT} w-24 flex-1`}
                  />
                ))}
                <IconButton
                  label={t({ fr: 'Retirer la ligne', ht: 'Retire liy lan' })}
                  danger
                  onClick={() => onChange({ ...block, rows: block.rows.filter((_, i) => i !== rowIndex) })}
                >
                  <X className="h-4 w-4" strokeWidth={1.8} aria-hidden />
                </IconButton>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <AddRow
              label={t({ fr: 'Ajouter une ligne', ht: 'Ajoute yon liy' })}
              onClick={() => onChange({ ...block, rows: [...block.rows, block.columns.map(() => '')] })}
            />
            <AddRow
              label={t({ fr: 'Ajouter une colonne', ht: 'Ajoute yon kolòn' })}
              onClick={() => onChange({
                ...block,
                columns: [...block.columns, ''],
                rows: block.rows.map((r) => [...r, '']),
              })}
            />
          </div>
        </div>
      );

    case 'spacer':
      return (
        <p className="text-note text-muted">
          {t({ fr: 'Un espace vide, pour aérer le document.', ht: 'Yon espas vid, pou dokiman an respire.' })}
        </p>
      );
  }
}

function AddRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-touch items-center gap-1.5 text-note font-semibold text-primary transition hover:underline"
    >
      <Plus className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
      {label}
    </button>
  );
}
