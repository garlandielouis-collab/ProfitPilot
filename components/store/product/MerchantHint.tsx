'use client';

// ─────────────────────────────────────────────────────────────────────────────
// L'exemple que seul le marchand voit
//
// Les maquettes de la fiche produit montrent des blocs qu'aucune donnée ne
// remplit encore : les dimensions d'une pièce, « pour qui » est une
// prestation, les créneaux d'un coach. La règle du produit interdit de les
// inventer — un « Poids : 450 kg » écrit par nous est un engagement que le
// marchand découvrira le jour où un client le réclamera.
//
// Mais un bloc qui n'existe pas est un bloc que le marchand ne remplira jamais,
// faute de savoir qu'il existe. D'où ce compromis : l'emplacement s'affiche,
// GRIS et annoncé comme un exemple, dans l'aperçu de l'éditeur seulement. Le
// visiteur de la vraie vitrine ne voit rien du tout.
//
// ── Comment l'aperçu se reconnaît ──────────────────────────────────────────
//
// `StorePreview` charge la vitrine dans une iframe avec `?pp_preview=<nonce>`.
// C'est le seul signal disponible côté navigateur, et il suffit : une adresse
// publique n'en porte pas, et un visiteur qui l'ajouterait à la main ne verrait
// que des exemples explicitement étiquetés comme tels.
//
// La lecture se fait APRÈS le montage, jamais pendant le rendu : le serveur ne
// connaît pas la barre d'adresse, et un composant qui en dépend directement
// rendrait deux arbres différents de part et d'autre de l'hydratation.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState, type ReactNode } from 'react';

export function useMerchantPreview(): boolean {
  const [preview, setPreview] = useState(false);
  useEffect(() => {
    try {
      setPreview(new URLSearchParams(window.location.search).has('pp_preview'));
    } catch {
      // Barre d'adresse illisible : on ne montre rien, ce qui est le cas sûr.
    }
  }, []);
  return preview;
}

/**
 * Un emplacement vide, montré au marchand et à lui seul.
 *
 * `title` dit ce qui manque, `children` montre à quoi cela ressemblerait. Le
 * cadre en pointillés et la mention « Exemple » sont ce qui empêche de le
 * confondre avec du contenu réel — c'est la différence entre un guide et un
 * faux.
 */
export function MerchantHint({ title, where, children }: {
  title:  string;
  /** Où le remplir, en quelques mots : « Éditeur → Contenu → Composition ». */
  where:  string;
  children?: ReactNode;
}) {
  const preview = useMerchantPreview();
  if (!preview) return null;

  return (
    <div
      className="mt-4 p-4"
      style={{
        border:       '1px dashed var(--st-border)',
        borderRadius: 'var(--st-radius-card)',
        background:   'var(--st-surface-2)',
      }}
    >
      <p className="flex flex-wrap items-center gap-2 text-[12px] font-semibold uppercase tracking-wide text-[var(--st-ink-3)]">
        <span
          className="inline-flex items-center px-1.5 py-0.5 text-[10px]"
          style={{ border: '1px solid var(--st-border)', borderRadius: 4 }}
        >
          Exemple
        </span>
        {title}
      </p>
      {children && (
        <div className="mt-3 opacity-60" aria-hidden>
          {children}
        </div>
      )}
      <p className="mt-3 text-[12px] leading-relaxed text-[var(--st-ink-3)]">
        Visible par vous seul, dans cet aperçu. Vos clients ne le voient pas
        tant que vous ne l'avez pas rempli — {where}.
      </p>
    </div>
  );
}
