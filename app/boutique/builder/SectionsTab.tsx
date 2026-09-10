'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Store Builder — l'onglet Sections
//
// La page d'accueil devient une liste : ce qui s'affiche, dans quel ordre (§6).
// Le gabarit fournit l'ordre de départ — c'est lui qui sait qu'une boutique de
// bijoux montre son histoire avant son catalogue et qu'une boutique de revente
// montre son catalogue tout de suite. Cet écran laisse le marchand le corriger,
// parce que c'est lui qui connaît son commerce.
//
// ── Des flèches, pas un glisser-déposer ────────────────────────────────────
//
// Le glisser-déposer se manipule mal au pouce sur une liste qui défile — le
// geste de saisie et le geste de défilement sont le même — et il ne s'utilise
// pas du tout au clavier sans un travail considérable. Deux flèches font le
// même travail, sur tous les appareils, et se lisent à voix haute pour un
// lecteur d'écran.
//
// ── Ce que cet écran ne porte pas ──────────────────────────────────────────
//
// Le CONTENU des sections vit dans l'onglet Contenu, et lui seul. C'est ce qui
// permet au marchand de désactiver puis réactiver une section sans perdre son
// texte : la table des sections ne connaît que l'ordre et l'activation.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { ArrowUp, ArrowDown, Plus } from 'lucide-react';
import { saveSections, type BuilderState } from '../../actions/storeBuilder';
import {
  SECTIONS, SECTION_KEYS, defaultSectionTitle, type SectionKey,
} from '../../../lib/storeSections';
import { isTemplateId } from '../../../lib/storeTheme';
import { Button } from '../../../components/ds/Button';
import { Card } from '../../../components/ds/Surface';
import { Field, SelectField } from '../../../components/ds/Field';
import { Switch } from '../../../components/ds/Switch';

type Row = {
  key:     SectionKey;
  enabled: boolean;
  title:   string;
  /**
   * Gardé en TEXTE tant que le marchand tape.
   *
   * Borné à la frappe, le champ devient impraticable : pour écrire « 12 », le
   * premier « 1 » serait remonté à 2 et le second collerait derrière — « 22 ».
   * Le bornage se fait donc à l'enregistrement, une seule fois.
   */
  limit:   string;
};

/** Le nombre d'articles, ramené dans les bornes du schéma. */
function clampLimit(raw: string): number {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? Math.min(24, Math.max(2, n)) : 8;
}

export function SectionsTab({
  state, run, pending,
}: {
  state:   BuilderState;
  run:     (fn: () => Promise<unknown>) => void;
  pending: boolean;
}) {
  const [rows, setRows] = useState<Row[]>(() =>
    state.sections.map((s) => ({
      key:     s.key,
      enabled: s.enabled,
      title:   s.config.title,
      limit:   String(s.config.limit),
    })),
  );
  const [open, setOpen] = useState<SectionKey | null>(null);
  const [toAdd, setToAdd] = useState('');

  const templateId = isTemplateId(state.templateId) ? state.templateId : undefined;

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    [next[index], next[target]] = [next[target], next[index]];
    setRows(next);
  }

  function update(index: number, patch: Partial<Row>) {
    setRows((current) => current.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  const absent = SECTION_KEYS.filter((k) => !rows.some((r) => r.key === k));

  return (
    <div className="flex flex-col gap-6">
      <p className="text-body text-text2 dark:text-dark-text2">
        L'ordre de cette liste est l'ordre de votre page d'accueil. Une section
        activée mais vide ne s'affiche pas — c'est l'onglet Contenu qui la
        remplit.
      </p>

      <div className="flex flex-col gap-2">
        {rows.map((row, index) => {
          const meta = SECTIONS[row.key];
          const isOpen = open === row.key;

          return (
            <Card key={row.key} className="p-3">
              <div className="flex items-start gap-2">
                {/* Les flèches d'abord : c'est le geste principal de l'écran. */}
                <div className="flex flex-col">
                  <button
                    type="button"
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    aria-label={`Monter « ${meta.label} »`}
                    className="flex h-touch w-touch items-center justify-center rounded-control text-muted transition hover:bg-surface disabled:opacity-30 dark:hover:bg-white/5"
                  >
                    <ArrowUp className="h-4 w-4" strokeWidth={2} aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(index, 1)}
                    disabled={index === rows.length - 1}
                    aria-label={`Descendre « ${meta.label} »`}
                    className="flex h-touch w-touch items-center justify-center rounded-control text-muted transition hover:bg-surface disabled:opacity-30 dark:hover:bg-white/5"
                  >
                    <ArrowDown className="h-4 w-4" strokeWidth={2} aria-hidden />
                  </button>
                </div>

                <div className="min-w-0 flex-1">
                  <Switch
                    checked={row.enabled}
                    onChange={(enabled) => update(index, { enabled })}
                    label={meta.label}
                    hint={meta.hint}
                  />

                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : row.key)}
                    aria-expanded={isOpen}
                    className="mt-1 flex min-h-touch items-center text-note font-semibold text-primary underline underline-offset-4 dark:text-dark-text"
                  >
                    {isOpen ? 'Fermer' : 'Régler'}
                  </button>

                  {isOpen && (
                    <div className="mt-3 flex flex-col gap-3 border-t border-border pt-3 dark:border-dark-border">
                      <Field
                        label="Le titre affiché"
                        hint={`Vide : « ${defaultSectionTitle(row.key, templateId) || 'aucun titre'} ».`}
                        maxLength={80}
                        value={row.title}
                        onChange={(e) => update(index, { title: e.target.value })}
                      />
                      {meta.hasLimit && (
                        <Field
                          label="Nombre d'articles"
                          hint="Entre 2 et 24."
                          type="number"
                          min={2}
                          max={24}
                          inputMode="numeric"
                          value={row.limit}
                          onChange={(e) => update(index, { limit: e.target.value })}
                        />
                      )}
                    </div>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {absent.length > 0 && (
        <Card className="p-4">
          <h2 className="mb-1 text-card font-semibold text-primary dark:text-dark-text">
            Ajouter une section
          </h2>
          <p className="mb-4 text-note text-muted dark:text-dark-muted">
            Celles que votre gabarit ne prévoyait pas. Elle s'ajoute en bas de la
            page, et vous la remontez où vous voulez.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <SelectField
              label="La section"
              className="min-w-[220px] flex-1"
              placeholder="Choisir…"
              options={absent.map((k) => ({ value: k, label: SECTIONS[k].label }))}
              value={toAdd}
              onChange={(e) => setToAdd(e.target.value)}
            />
            <Button
              variant="outline"
              size="md"
              disabled={!toAdd}
              icon={<Plus className="h-4 w-4" strokeWidth={2} aria-hidden />}
              onClick={() => {
                const key = absent.find((k) => k === toAdd);
                if (!key) return;
                setRows((current) => [
                  ...current,
                  { key, enabled: true, title: '', limit: '8' },
                ]);
                setToAdd('');
              }}
            >
              Ajouter
            </Button>
          </div>
        </Card>
      )}

      <Button
        variant="accent"
        size="lg"
        block
        loading={pending}
        loadingLabel="Enregistrement…"
        onClick={() =>
          run(() =>
            saveSections(
              rows.map((r) => ({
                key: r.key, enabled: r.enabled, title: r.title, limit: clampLimit(r.limit),
              })),
            ),
          )
        }
      >
        Enregistrer l'ordre des sections
      </Button>
    </div>
  );
}
