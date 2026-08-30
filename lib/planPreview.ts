'use client';

// ─────────────────────────────────────────────────────────────────────────────
// L'aperçu des offres — voir le rendu d'Esansyèl, Kwasans et Elit
//
// À quoi ça sert : comparer les trois rendus côte à côte, sans créer trois
// comptes ni toucher à la base. On regarde ce que le marchand VERRA.
//
// ── Pourquoi un cookie et pas le stockage local ─────────────────────────────
//
// Parce que l'essentiel du verrouillage est côté SERVEUR : `getActivePlanKey()`
// décide, et les écrans reçoivent des données déjà filtrées. Un aperçu qui ne
// vivrait que dans le navigateur ne changerait presque rien à l'écran — il
// masquerait deux boutons et laisserait tout le reste identique. Le cookie est
// le seul support que les deux côtés lisent.
//
// ── Ce qui empêche que ça devienne une porte ────────────────────────────────
//
// Le serveur n'honore ce cookie QUE si l'exploitant a posé `PLAN_PREVIEW=1`
// dans son environnement (ou s'il tourne en développement). En production
// normale, n'importe qui peut écrire ce cookie à la main : il ne se passera
// rien du tout. Le garde n'est pas le cookie, c'est la variable d'environnement
// — et elle, personne ne la pose depuis un navigateur.
//
// Et tant qu'un aperçu tourne, un bandeau le dit sur chaque écran. « Dans un
// logiciel de gestion, un chiffre affiché est une promesse » : personne ne doit
// croire qu'il a Elit parce qu'un aperçu traînait.
// ─────────────────────────────────────────────────────────────────────────────

import { normalizePlanKey, type PlanKey } from './plans';

export const PLAN_PREVIEW_COOKIE = 'pp_plan_preview';
const EVENT = 'pp:plan-preview';

/** L'aperçu est-il proposé sur cette installation ? */
export function isPreviewEnabled(): boolean {
  return process.env.NODE_ENV !== 'production'
    || process.env.NEXT_PUBLIC_PLAN_PREVIEW === '1';
}

function readCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${PLAN_PREVIEW_COOKIE}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/** L'offre actuellement simulée, ou `null` si l'on voit son offre réelle. */
export function getPreviewPlan(): PlanKey | null {
  if (!isPreviewEnabled()) return null;
  return normalizePlanKey(readCookie());
}

/** Bascule sur une offre, ou revient au réel avec `null`. */
export function setPreviewPlan(plan: PlanKey | null): void {
  if (typeof document === 'undefined' || !isPreviewEnabled()) return;

  if (plan) {
    // Pas de `Secure` : l'aperçu sert surtout en développement, sur http.
    document.cookie =
      `${PLAN_PREVIEW_COOKIE}=${encodeURIComponent(plan)}; path=/; max-age=86400; SameSite=Lax`;
  } else {
    document.cookie = `${PLAN_PREVIEW_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
  }
  window.dispatchEvent(new Event(EVENT));
}

/** S'abonne aux bascules — y compris depuis un autre onglet du navigateur. */
export function subscribePreview(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(EVENT, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(EVENT, listener);
    window.removeEventListener('storage', listener);
  };
}
