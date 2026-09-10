'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Studio IA — la modale de retouche
//
// Le curseur avant/après est écrit à la main plutôt qu'importé. `react-compare-image`
// aurait ajouté une dépendance pour cent lignes, ne gère pas le clavier, et ne
// tient pas compte du fait qu'ici les deux images n'ont PAS le même cadrage : la
// photo d'origine est prise de travers, la retouche est recadrée. Un composant
// générique suppose deux images superposables.
//
// Ce que la modale doit garantir, et qui compte plus que le curseur :
//
//   Le marchand voit sa photo D'ORIGINE en permanence. Il compare, il ne
//   découvre pas. Une IA qui montre seulement son résultat obtient un « oui »
//   qui n'en est pas un.
//
//   Rien n'est appliqué sans un second geste. Générer et appliquer sont deux
//   boutons, dans cet ordre.
//
//   L'attente est nommée. « Traitement en cours » avec une roue qui tourne
//   pendant quatre-vingt-dix secondes fait fermer l'onglet. On dit l'étape et
//   on dit que ça peut être long.
//
//   L'échec est lisible. Le message du fournisseur, pas un code.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Sparkles, Check, AlertTriangle, RotateCcw } from 'lucide-react';
import { PRESET_LIST, type PresetKey } from '../../lib/ai/imageEnhancer';
import { applyEnhancement, revertEnhancement } from '../../app/actions/aiStudio';

type Product = {
  id:                 string;
  name:               string;
  image_url:          string | null;
  enhanced_image_url: string | null;
};

type Phase = 'idle' | 'working' | 'ready' | 'error';

export function ImageEnhancerModal({
  product,
  open,
  onClose,
  onApplied,
}: {
  product:  Product;
  open:     boolean;
  onClose:  () => void;
  onApplied?: (imageUrl: string | null) => void;
}) {
  const [preset, setPreset]   = useState<PresetKey>('studio_minimal');
  const [phase, setPhase]     = useState<Phase>('idle');
  const [result, setResult]   = useState<string | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [mounted, setMounted] = useState(false);
  // L'identifiant du travail, et non l'URL du résultat : c'est lui que l'action
  // serveur sait rattacher à ce marchand. Appliquer une URL fournie par le
  // navigateur reviendrait à laisser poser n'importe quelle image sur
  // n'importe quel produit.
  const [jobId, setJobId] = useState<string | null>(null);

  const pollRef = useRef<number | null>(null);
  const tickRef = useRef<number | null>(null);

  useEffect(() => setMounted(true), []);

  const stopTimers = useCallback(() => {
    if (pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = null; }
    if (tickRef.current) { window.clearInterval(tickRef.current); tickRef.current = null; }
  }, []);

  // Les minuteries meurent avec le composant : sans ce nettoyage, fermer la
  // modale pendant un traitement laisse une interrogation réseau toutes les
  // deux secondes, indéfiniment.
  useEffect(() => stopTimers, [stopTimers]);

  useEffect(() => {
    if (!open) {
      stopTimers();
      setPhase('idle'); setResult(null); setError(null); setElapsed(0); setJobId(null);
    }
  }, [open, stopTimers]);

  // Échap ferme — sauf pendant un traitement, où la fermeture ferait perdre le
  // fil d'un travail déjà lancé et facturé.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && phase !== 'working') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, phase, onClose]);

  async function launch() {
    setPhase('working'); setError(null); setResult(null); setElapsed(0);

    tickRef.current = window.setInterval(() => setElapsed((s) => s + 1), 1000);

    let newJobId: string;
    try {
      const res = await fetch('/api/ai/enhance-image', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ productId: product.id, preset, enhancementType: 'full' }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? 'Le lancement a échoué.');
      newJobId = body.jobId;
      setJobId(newJobId);
    } catch (err) {
      stopTimers();
      setPhase('error');
      setError(err instanceof Error ? err.message : 'Le lancement a échoué.');
      return;
    }

    pollRef.current = window.setInterval(async () => {
      try {
        const res = await fetch(`/api/ai/enhance-image?jobId=${newJobId}`);
        if (!res.ok) return;
        const job = await res.json();

        if (job.status === 'completed' && job.processed_image_url) {
          stopTimers();
          setResult(job.processed_image_url);
          setPhase('ready');
        } else if (job.status === 'failed') {
          stopTimers();
          setError(job.error_message ?? 'Le traitement a échoué.');
          setPhase('error');
        }
      } catch {
        // Coupure réseau passagère : on laisse la prochaine interrogation
        // retenter plutôt que d'annoncer un échec qui n'en est pas un.
      }
    }, 2500);
  }

  async function apply() {
    if (!jobId) return;
    setApplying(true);
    try {
      const { imageUrl } = await applyEnhancement(jobId);
      onApplied?.(imageUrl);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "L'application a échoué.");
      setPhase('error');
    } finally {
      setApplying(false);
    }
  }

  async function revert() {
    setApplying(true);
    try {
      await revertEnhancement(product.id);
      onApplied?.(null);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Le retour a échoué.');
    } finally {
      setApplying(false);
    }
  }

  if (!open || !mounted) return null;

  const original = product.image_url;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-primary/50 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="studio-title"
    >
      <div className="flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-surface bg-white shadow-pop dark:bg-dark-surface sm:rounded-surface">

        {/* ── En-tête ── */}
        <header className="flex items-start justify-between gap-4 border-b border-border px-4 py-4 dark:border-dark-border">
          <div className="min-w-0">
            <h2 id="studio-title" className="text-card font-semibold text-primary dark:text-dark-text">
              Studio photo
            </h2>
            <p className="mt-0.5 truncate text-note text-muted dark:text-dark-muted">
              {product.name}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={phase === 'working'}
            aria-label="Fermer"
            className="flex h-touch w-touch flex-shrink-0 items-center justify-center rounded-control text-muted transition hover:bg-surface disabled:opacity-40 dark:hover:bg-white/5"
          >
            <X className="h-5 w-5" strokeWidth={1.8} aria-hidden />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {!original ? (
            <p className="py-8 text-center text-body text-text2 dark:text-dark-text2">
              Ce produit n'a pas encore de photo. Ajoutez-en une avant de passer au Studio.
            </p>
          ) : (
            <>
              {/* ── Comparaison ── */}
              {result ? (
                <BeforeAfter before={original} after={result} />
              ) : (
                <div className="relative mx-auto aspect-square w-full max-w-md overflow-hidden rounded-surface border border-border bg-surface dark:border-dark-border">
                  {/* eslint-disable-next-line @next/next/no-img-element -- photo marchand, hôte libre */}
                  <img src={original} alt={product.name} className="h-full w-full object-cover" />

                  {phase === 'working' && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-primary/70 px-6 text-center">
                      <span className="h-8 w-8 animate-spin rounded-pill border-2 border-white/40 border-t-white" aria-hidden />
                      <p className="text-body font-semibold text-white">
                        Création de la photo studio…
                      </p>
                      {/* Le temps écoulé, et l'ordre de grandeur attendu. Une
                          attente nommée est une attente qu'on supporte. */}
                      <p className="text-note text-white/80">
                        {elapsed} s — cela prend en général 20 à 60 secondes.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* ── Erreur ── */}
              {phase === 'error' && error && (
                <div className="mt-4 flex items-start gap-2 rounded-control bg-danger-sub px-3 py-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-danger" strokeWidth={1.8} aria-hidden />
                  <p className="text-body text-danger">{error}</p>
                </div>
              )}

              {/* ── Styles ── */}
              {phase !== 'working' && (
                <fieldset className="mt-6">
                  <legend className="mb-2 text-note font-semibold uppercase tracking-wider text-muted dark:text-dark-muted">
                    Décor
                  </legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {PRESET_LIST.map((p) => {
                      const active = preset === p.key;
                      return (
                        <button
                          key={p.key}
                          type="button"
                          onClick={() => setPreset(p.key)}
                          aria-pressed={active}
                          className={[
                            'flex min-h-action flex-col items-start gap-0.5 rounded-control border px-3 py-2 text-left transition',
                            active
                              ? 'border-accent bg-accent-sub'
                              : 'border-border hover:bg-surface dark:border-dark-border dark:hover:bg-white/5',
                          ].join(' ')}
                        >
                          <span className="text-body font-semibold text-primary dark:text-dark-text">
                            {p.label}
                          </span>
                          <span className="text-note text-muted dark:text-dark-muted">
                            {p.description}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              )}
            </>
          )}
        </div>

        {/* ── Pied ── */}
        {original && (
          <footer className="flex flex-col gap-2 border-t border-border px-4 py-4 dark:border-dark-border sm:flex-row-reverse">
            {result ? (
              <>
                <button
                  type="button"
                  onClick={apply}
                  disabled={applying}
                  className="flex min-h-hero flex-1 items-center justify-center gap-2 rounded-surface bg-accent px-6 text-body font-semibold text-accent-ink shadow-card transition hover:bg-accent-h disabled:opacity-60"
                >
                  {applying
                    ? <><span className="h-4 w-4 animate-spin rounded-pill border-2 border-primary/30 border-t-primary" aria-hidden /> Application…</>
                    : <><Check className="h-5 w-5" strokeWidth={2.2} aria-hidden /> Appliquer à la boutique</>}
                </button>
                <button
                  type="button"
                  onClick={() => { setResult(null); setPhase('idle'); }}
                  className="flex min-h-action items-center justify-center rounded-surface px-4 text-body font-semibold text-primary underline underline-offset-4 dark:text-dark-text"
                >
                  Essayer un autre décor
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={launch}
                  disabled={phase === 'working'}
                  className="flex min-h-hero flex-1 items-center justify-center gap-2 rounded-surface bg-accent px-6 text-body font-semibold text-accent-ink shadow-card transition hover:bg-accent-h disabled:opacity-60"
                >
                  <Sparkles className="h-5 w-5" strokeWidth={2} aria-hidden />
                  {phase === 'working' ? 'Traitement…' : 'Créer la photo studio'}
                </button>

                {product.enhanced_image_url && phase !== 'working' && (
                  <button
                    type="button"
                    onClick={revert}
                    disabled={applying}
                    className="flex min-h-action items-center justify-center gap-2 rounded-surface px-4 text-body font-semibold text-primary underline underline-offset-4 dark:text-dark-text"
                  >
                    <RotateCcw className="h-4 w-4" strokeWidth={1.8} aria-hidden />
                    Revenir à la photo d'origine
                  </button>
                )}
              </>
            )}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Le curseur avant/après
//
// Souris, doigt ET clavier. Le clavier n'est pas un supplément : un curseur qui
// ne répond qu'au pointeur est inutilisable pour qui navigue au clavier, et
// c'est un `input[type=range]` déguisé — donc autant en utiliser un, invisible,
// posé par-dessus. Il apporte gratuitement les flèches, Début/Fin, et
// l'annonce vocale.
// ─────────────────────────────────────────────────────────────────────────────

function BeforeAfter({ before, after }: { before: string; after: string }) {
  const [position, setPosition] = useState(50);

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="relative aspect-square select-none overflow-hidden rounded-surface border border-border dark:border-dark-border">
        {/* Après, en fond */}
        {/* eslint-disable-next-line @next/next/no-img-element -- résultat IA, hôte de stockage */}
        <img src={after} alt="Photo retouchée" className="absolute inset-0 h-full w-full object-cover" />

        {/* Avant, découpé par le curseur */}
        <div
          className="absolute inset-0 overflow-hidden"
          style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- photo d'origine du marchand */}
          <img src={before} alt="Photo d'origine" className="h-full w-full object-cover" />
        </div>

        {/* La poignée */}
        <div
          className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow-pop"
          style={{ left: `${position}%` }}
          aria-hidden
        >
          <span className="absolute left-1/2 top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-pill bg-white text-note font-semibold text-primary shadow-pop">
            ↔
          </span>
        </div>

        <span className="pointer-events-none absolute left-2 top-2 rounded-control bg-primary/75 px-2 py-1 text-note font-semibold text-white">
          Avant
        </span>
        <span className="pointer-events-none absolute right-2 top-2 rounded-control bg-primary/75 px-2 py-1 text-note font-semibold text-white">
          Après
        </span>

        <input
          type="range"
          min={0}
          max={100}
          value={position}
          onChange={(e) => setPosition(Number(e.target.value))}
          aria-label="Comparer avant et après"
          className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
        />
      </div>
    </div>
  );
}
