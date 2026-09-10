'use client';

// ─────────────────────────────────────────────────────────────────────────────
// La barre de l'aperçu
//
// Elle est posée EN BAS, et pas en haut : l'en-tête de la vitrine est collant,
// et deux barres collantes superposées se recouvrent l'une l'autre au premier
// défilement. En bas, elle tombe aussi sous le pouce, là où se prend la
// décision sur un téléphone.
//
// Elle ne fait que trois choses : dire quel gabarit est affiché, permettre de
// passer au suivant, et l'appliquer. Aucune option de réglage — le marchand
// regarde, il ne configure pas ; l'éditeur est à un clic.
// ─────────────────────────────────────────────────────────────────────────────

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import { ChevronLeft, ChevronRight, Check, PenLine, Loader2 } from 'lucide-react';
import { applyTemplate } from '../../actions/storeBuilder';
import { templateChoices } from '../../../components/store/templates/registry';
import type { TemplateId } from '../../../lib/storeTheme';

export function ApercuBar({
  templateId, name, tagline, isCurrent, productCount, accent, accentInk,
}: {
  templateId:   TemplateId;
  name:         string;
  tagline:      string;
  /** Vrai quand c'est déjà le gabarit de la boutique. */
  isCurrent:    boolean;
  /** Zéro produit visible : l'aperçu est vide, et il faut le dire. */
  productCount: number;
  /**
   * Les couleurs du gabarit prévisualisé.
   *
   * La barre vit HORS de l'enveloppe de la vitrine — les variables `--st-*`
   * n'y arrivent pas — et son bouton doit pourtant être celui que le marchand
   * verra sur sa boutique. Les couleurs sont donc passées en clair, calculées
   * par le serveur avec le même `readableInk` que la vitrine.
   */
  accent:    string;
  accentInk: string;
}) {
  const router = useRouter();
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Les gabarits qu'on peut parcourir : ceux proposés, plus celui-ci s'il est
  // historique — sinon la boutique qui en porte un se retrouverait sans point
  // de départ dans la liste.
  const list  = templateChoices(templateId);
  const index = Math.max(0, list.findIndex((t) => t.id === templateId));
  const prev  = list[(index - 1 + list.length) % list.length];
  const next  = list[(index + 1) % list.length];

  async function choose() {
    setBusy(true);
    setError(null);
    try {
      await applyTemplate(templateId);
      router.push('/boutique/builder');
    } catch (err) {
      setError(err instanceof Error ? err.message : "Le gabarit n'a pas pu être appliqué.");
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-[#0E1822] text-white"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {productCount === 0 && (
        <p className="bg-[#B45309] px-4 py-2 text-center text-[12px] font-medium text-white">
          Votre catalogue en ligne est vide : l'aperçu ne montre donc aucun
          produit. Publiez des fiches depuis l'onglet Produits.
        </p>
      )}

      {error && (
        <p role="alert" className="bg-[#8C2F26] px-4 py-2 text-center text-[12px] font-medium text-white">
          {error}
        </p>
      )}

      <div className="mx-auto flex max-w-6xl items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-4">
        <Link
          href={`/apercu/${prev.id}`}
          aria-label={`Gabarit précédent : ${prev.name}`}
          className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-control text-white/80 transition hover:bg-white/10"
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={2} aria-hidden />
        </Link>

        <div className="min-w-0 flex-1 text-center sm:text-left">
          <p className="truncate text-[14px] font-semibold">{name}</p>
          <p className="truncate text-[12px] text-white/65">{tagline}</p>
        </div>

        <Link
          href={`/apercu/${next.id}`}
          aria-label={`Gabarit suivant : ${next.name}`}
          className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-control text-white/80 transition hover:bg-white/10"
        >
          <ChevronRight className="h-5 w-5" strokeWidth={2} aria-hidden />
        </Link>

        <Link
          href="/boutique/builder"
          className="hidden h-11 flex-shrink-0 items-center gap-2 rounded-control border border-white/25 px-4 text-[14px] font-semibold text-white transition hover:bg-white/10 sm:flex"
        >
          <PenLine className="h-4 w-4" strokeWidth={1.8} aria-hidden />
          Éditeur
        </Link>

        {isCurrent ? (
          <span className="flex h-11 flex-shrink-0 items-center gap-2 rounded-control bg-white/10 px-4 text-[14px] font-semibold text-white/80">
            <Check className="h-4 w-4" strokeWidth={2.4} aria-hidden />
            <span className="hidden sm:inline">Gabarit actuel</span>
            <span className="sm:hidden">Actuel</span>
          </span>
        ) : (
          <button
            type="button"
            onClick={choose}
            disabled={busy}
            className="flex h-11 flex-shrink-0 items-center gap-2 rounded-control px-5 text-[14px] font-semibold transition hover:brightness-95 disabled:opacity-70"
            style={{ background: accent, color: accentInk }}
          >
            {busy
              ? <><Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.2} aria-hidden /> Application…</>
              : <>Choisir ce gabarit</>}
          </button>
        )}
      </div>
    </div>
  );
}
