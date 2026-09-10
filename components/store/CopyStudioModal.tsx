'use client';

// ─────────────────────────────────────────────────────────────────────────────
// PilotAI Copy — la modale de rédaction
//
// Le §41 décrit le parcours en une ligne : « le commerçant doit pouvoir passer
// de produit brut à produit professionnel en quelques clics ». Cette modale est
// la moitié texte de ce parcours, et elle suit la même règle que la moitié
// photo : ON PROPOSE, LE MARCHAND DÉCIDE.
//
// D'où trois choix qui se voient à l'écran :
//
//   TOUT EST ÉDITABLE. Le texte de l'IA arrive dans des champs, pas dans un
//   aperçu. Un marchand qui doit accepter en bloc ou refuser en bloc refuse.
//
//   RIEN N'EST ENREGISTRÉ SANS UN CLIC. Générer ne touche pas la fiche ; c'est
//   « Enregistrer » qui écrit. Le bouton dit ce qu'il fait.
//
//   LE COÛT EST ANNONCÉ AVANT, PAS APRÈS. Chaque bouton porte son prix en
//   crédits et le solde reste visible en haut. Une action payante dont on
//   découvre le prix une fois débité est une action qu'on n'ose plus lancer.
//
// Le SEO est un second bouton et non une case du premier : il se facture à
// part, et beaucoup de marchands veulent la description sans se soucier de
// Google. Les lui imposer reviendrait à lui prendre un crédit pour rien.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Sparkles, Check, AlertTriangle, Search, Coins } from 'lucide-react';

import {
  applyProductCopy,
  draftProductCopy,
  draftProductSeo,
  getProductCopyState,
  type ProductCopyState,
} from '../../app/actions/aiCopy';
import { Button } from '../ds/Button';
import { Field, TextField } from '../ds/Field';
import { Badge } from '../ds/Badge';

type Tone     = 'standard' | 'court' | 'persuasif';
type Language = 'fr' | 'ht';

const TONES: Array<{ id: Tone; label: string; hint: string }> = [
  { id: 'standard',  label: 'Équilibré', hint: 'Informatif et chaleureux' },
  { id: 'court',     label: 'Court',     hint: 'Deux phrases, rien de plus' },
  { id: 'persuasif', label: 'Vendeur',   hint: "Parle des bénéfices pour l'acheteur" },
];

/** Le libellé des champs modifiés, pour que « Enregistrer » dise quoi. */
type Draft = {
  name:           string;
  short:          string;
  long:           string;
  highlights:     string[];
  seoTitle:       string;
  seoDescription: string;
  tags:           string[];
};

export function CopyStudioModal({
  productId,
  productName,
  open,
  onClose,
  onSaved,
}: {
  productId:   string;
  productName: string;
  open:        boolean;
  onClose:     () => void;
  onSaved?:    () => void;
}) {
  const [mounted, setMounted]   = useState(false);
  const [state, setState]       = useState<ProductCopyState | null>(null);
  const [draft, setDraft]       = useState<Draft | null>(null);
  const [credits, setCredits]   = useState<number | null>(null);
  const [tone, setTone]         = useState<Tone>('standard');
  const [language, setLanguage] = useState<Language>('fr');
  const [busy, setBusy]         = useState<null | 'copy' | 'seo' | 'save'>(null);
  const [error, setError]       = useState<string | null>(null);
  const [saved, setSaved]       = useState(false);

  useEffect(() => setMounted(true), []);

  const load = useCallback(async () => {
    setError(null);
    try {
      const s = await getProductCopyState(productId);
      setState(s);
      setCredits(s.credits);
      setDraft({
        name:           s.name,
        short:          s.short,
        long:           s.long,
        highlights:     s.highlights.length ? s.highlights : [''],
        seoTitle:       s.seoTitle,
        seoDescription: s.seoDescription,
        tags:           s.tags,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chargement impossible.');
    }
  }, [productId]);

  useEffect(() => {
    if (!open) {
      setState(null); setDraft(null); setError(null); setSaved(false); setBusy(null);
      return;
    }
    void load();
  }, [open, load]);

  // Échap ferme — sauf pendant un appel, où la fermeture ferait perdre un
  // texte déjà généré et déjà facturé.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && busy === null) onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, busy, onClose]);

  function patch(next: Partial<Draft>) {
    setDraft((d) => (d ? { ...d, ...next } : d));
    setSaved(false);
  }

  async function writeCopy() {
    setBusy('copy'); setError(null); setSaved(false);
    try {
      const result = await draftProductCopy(productId, tone, language);
      patch({
        name:       result.title,
        short:      result.short,
        long:       result.long,
        highlights: result.highlights.length ? result.highlights : [''],
      });
      setCredits(result.remaining);
    } catch (err) {
      setError(err instanceof Error ? err.message : "La rédaction n'a pas abouti.");
    } finally {
      setBusy(null);
    }
  }

  async function writeSeo() {
    setBusy('seo'); setError(null); setSaved(false);
    try {
      const result = await draftProductSeo(productId, language);
      patch({
        seoTitle:       result.seoTitle,
        seoDescription: result.seoDescription,
        tags:           result.tags,
      });
      setCredits(result.remaining);
    } catch (err) {
      setError(err instanceof Error ? err.message : "L'optimisation n'a pas abouti.");
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (!draft) return;
    setBusy('save'); setError(null);
    try {
      await applyProductCopy(productId, {
        name:           draft.name.trim() || productName,
        short:          draft.short.trim(),
        long:           draft.long.trim(),
        highlights:     draft.highlights.map((h) => h.trim()).filter(Boolean),
        seoTitle:       draft.seoTitle.trim(),
        seoDescription: draft.seoDescription.trim(),
        tags:           draft.tags.map((t) => t.trim()).filter(Boolean),
      });
      setSaved(true);
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enregistrement impossible.');
    } finally {
      setBusy(null);
    }
  }

  if (!open || !mounted) return null;

  const unavailable = state !== null && !state.available;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-primary/60 p-0 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`Rédaction PilotAI pour ${productName}`}
      onClick={(e) => { if (e.target === e.currentTarget && busy === null) onClose(); }}
    >
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-surface bg-white shadow-modal dark:bg-dark-surface sm:rounded-surface">

        {/* ── En-tête ── */}
        <header className="flex items-center gap-3 border-b border-border px-4 py-3 dark:border-dark-border">
          <div className="min-w-0 flex-1">
            <p className="truncate text-body font-semibold text-primary dark:text-dark-text">
              {productName}
            </p>
            <p className="text-note text-muted dark:text-dark-muted">
              Rédaction PilotAI
            </p>
          </div>

          {credits !== null && (
            <Badge tone={credits > 0 ? 'accent' : 'warning'}>
              <Coins className="mr-1 inline h-3.5 w-3.5" strokeWidth={1.8} aria-hidden />
              {credits} crédit{credits > 1 ? 's' : ''}
            </Badge>
          )}

          <button
            type="button"
            onClick={onClose}
            disabled={busy !== null}
            aria-label="Fermer"
            className="flex h-touch w-touch flex-shrink-0 items-center justify-center rounded-control text-muted transition hover:bg-surface disabled:opacity-40 dark:hover:bg-white/5"
          >
            <X className="h-5 w-5" strokeWidth={1.8} aria-hidden />
          </button>
        </header>

        {/* ── Corps ── */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {!draft ? (
            <p className="py-8 text-center text-body text-muted dark:text-dark-muted">
              Chargement…
            </p>
          ) : (
            <>
              {unavailable && (
                <div className="mb-4 flex items-start gap-2 rounded-control bg-warning-sub px-3 py-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-warning" strokeWidth={1.8} aria-hidden />
                  <p className="text-body text-warning">
                    La rédaction automatique n'est pas activée sur cette installation.
                    Vous pouvez tout de même écrire la fiche à la main ci-dessous.
                  </p>
                </div>
              )}

              {error && (
                <div className="mb-4 flex items-start gap-2 rounded-control bg-danger-sub px-3 py-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-danger" strokeWidth={1.8} aria-hidden />
                  <p className="text-body text-danger">{error}</p>
                </div>
              )}

              {/* ── Les réglages de la rédaction ── */}
              {!unavailable && (
                <div className="mb-5 rounded-surface border border-border p-3 dark:border-dark-border">
                  <fieldset>
                    <legend className="mb-2 text-note font-semibold uppercase tracking-wider text-muted dark:text-dark-muted">
                      Ton
                    </legend>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {TONES.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setTone(t.id)}
                          aria-pressed={tone === t.id}
                          className={[
                            'flex min-h-action flex-col items-start gap-0.5 rounded-control border px-3 py-2 text-left transition',
                            tone === t.id
                              ? 'border-accent bg-accent-sub'
                              : 'border-border hover:bg-surface dark:border-dark-border dark:hover:bg-white/5',
                          ].join(' ')}
                        >
                          <span className="text-body font-semibold text-primary dark:text-dark-text">
                            {t.label}
                          </span>
                          <span className="text-note text-muted dark:text-dark-muted">{t.hint}</span>
                        </button>
                      ))}
                    </div>
                  </fieldset>

                  <fieldset className="mt-3">
                    <legend className="mb-2 text-note font-semibold uppercase tracking-wider text-muted dark:text-dark-muted">
                      Langue
                    </legend>
                    <div className="flex gap-2">
                      {([['fr', 'Français'], ['ht', 'Kreyòl']] as const).map(([id, label]) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setLanguage(id)}
                          aria-pressed={language === id}
                          className={[
                            'min-h-touch rounded-pill border px-4 text-note font-semibold transition',
                            language === id
                              ? 'border-accent bg-accent-sub text-primary dark:text-dark-text'
                              : 'border-border text-text2 hover:bg-surface dark:border-dark-border dark:text-dark-text2 dark:hover:bg-white/5',
                          ].join(' ')}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </fieldset>

                  <Button
                    className="mt-4"
                    block
                    icon={<Sparkles className="h-5 w-5" strokeWidth={2} aria-hidden />}
                    loading={busy === 'copy'}
                    loadingLabel="Rédaction…"
                    disabled={busy !== null}
                    onClick={() => void writeCopy()}
                  >
                    {draft.long ? 'Réécrire la fiche' : 'Écrire la fiche'} · 1 crédit
                  </Button>
                </div>
              )}

              {/* ── Le texte, modifiable ── */}
              <div className="flex flex-col gap-3">
                <Field
                  label="Nom du produit"
                  value={draft.name}
                  onChange={(e) => patch({ name: e.target.value })}
                />

                <Field
                  label="Accroche"
                  hint="Une phrase, sous le nom. Elle s'affiche en tête de la fiche."
                  value={draft.short}
                  maxLength={240}
                  onChange={(e) => patch({ short: e.target.value })}
                />

                <TextField
                  label="Description"
                  rows={5}
                  value={draft.long}
                  onChange={(e) => patch({ long: e.target.value })}
                />

                <HighlightsEditor
                  values={draft.highlights}
                  onChange={(highlights) => patch({ highlights })}
                />
              </div>

              {/* ── Le SEO, facturé à part ── */}
              <div className="mt-6 rounded-surface border border-border p-3 dark:border-dark-border">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-body font-semibold text-primary dark:text-dark-text">
                      Référencement
                    </p>
                    <p className="text-note text-muted dark:text-dark-muted">
                      Ce que Google affiche quand quelqu'un cherche ce produit.
                    </p>
                  </div>

                  {!unavailable && (
                    <Button
                      variant="quiet"
                      size="sm"
                      icon={<Search className="h-4 w-4" strokeWidth={1.8} aria-hidden />}
                      loading={busy === 'seo'}
                      loadingLabel="Optimisation…"
                      disabled={busy !== null}
                      onClick={() => void writeSeo()}
                    >
                      Optimiser · 1 crédit
                    </Button>
                  )}
                </div>

                <div className="flex flex-col gap-3">
                  <Field
                    label="Titre SEO"
                    hint={`${draft.seoTitle.length}/60 caractères`}
                    warning={draft.seoTitle.length > 60 ? 'Trop long : Google coupera la fin.' : undefined}
                    value={draft.seoTitle}
                    maxLength={120}
                    onChange={(e) => patch({ seoTitle: e.target.value })}
                  />

                  <TextField
                    label="Description SEO"
                    rows={2}
                    hint={`${draft.seoDescription.length}/158 caractères`}
                    warning={
                      draft.seoDescription.length > 158
                        ? 'Trop long : Google coupera la fin.'
                        : undefined
                    }
                    value={draft.seoDescription}
                    maxLength={320}
                    onChange={(e) => patch({ seoDescription: e.target.value })}
                  />

                  <Field
                    label="Étiquettes"
                    hint="Séparées par des virgules. Elles servent à la recherche et aux filtres."
                    value={draft.tags.join(', ')}
                    onChange={(e) =>
                      patch({ tags: e.target.value.split(',').map((t) => t.trim()) })
                    }
                  />
                </div>
              </div>
            </>
          )}
        </div>

        {/* ── Pied ── */}
        <footer className="flex flex-col gap-2 border-t border-border px-4 py-4 dark:border-dark-border sm:flex-row-reverse">
          <Button
            size="lg"
            className="flex-1"
            icon={<Check className="h-5 w-5" strokeWidth={2.2} aria-hidden />}
            loading={busy === 'save'}
            loadingLabel="Enregistrement…"
            confirmed={saved}
            disabled={!draft || busy !== null}
            onClick={() => void save()}
          >
            {saved ? 'Enregistré' : 'Enregistrer la fiche'}
          </Button>

          <Button variant="quiet" size="lg" disabled={busy !== null} onClick={onClose}>
            Fermer
          </Button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Les points forts
//
// Une ligne par point fort, et non un champ multiligne à découper : la vitrine
// affiche des puces, et un marchand qui tape des tirets dans un textarea obtient
// des puces avec des tirets dedans.
// ─────────────────────────────────────────────────────────────────────────────

function HighlightsEditor({
  values,
  onChange,
}: {
  values:   string[];
  onChange: (next: string[]) => void;
}) {
  function setAt(index: number, value: string) {
    const next = [...values];
    next[index] = value;
    onChange(next);
  }

  function removeAt(index: number) {
    const next = values.filter((_, i) => i !== index);
    onChange(next.length ? next : ['']);
  }

  return (
    <fieldset>
      <legend className="mb-1 text-note font-semibold text-text2 dark:text-dark-text2">
        Points forts
      </legend>
      <p className="mb-2 text-note text-muted dark:text-dark-muted">
        Trois à cinq lignes courtes, lues sans faire défiler.
      </p>

      <div className="flex flex-col gap-2">
        {values.map((value, index) => (
          <div key={index} className="flex items-center gap-2">
            <input
              value={value}
              onChange={(e) => setAt(index, e.target.value)}
              maxLength={160}
              aria-label={`Point fort ${index + 1}`}
              className="min-h-touch w-full rounded-control border border-border bg-white px-3 text-body text-primary outline-none focus:border-accent dark:border-dark-border dark:bg-dark-surface2 dark:text-dark-text"
            />
            <button
              type="button"
              onClick={() => removeAt(index)}
              aria-label={`Retirer le point fort ${index + 1}`}
              className="flex h-touch w-touch flex-shrink-0 items-center justify-center rounded-control text-muted transition hover:bg-surface dark:hover:bg-white/5"
            >
              <X className="h-4 w-4" strokeWidth={1.8} aria-hidden />
            </button>
          </div>
        ))}
      </div>

      {values.length < 5 && (
        <button
          type="button"
          onClick={() => onChange([...values, ''])}
          className="mt-2 min-h-touch text-note font-semibold text-accent underline underline-offset-4"
        >
          Ajouter un point fort
        </button>
      )}
    </fieldset>
  );
}
