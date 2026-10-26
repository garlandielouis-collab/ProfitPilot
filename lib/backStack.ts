// ─────────────────────────────────────────────────────────────────────────────
// Le bouton retour d'Android — qui doit répondre en premier
//
// « Bouton retour Android cohérent sur chaque écran ; jamais de sortie
// accidentelle de l'app pendant une vente. » Quand une feuille est ouverte (la
// vente, la dépense, le crédit), le retour la referme ; il ne quitte jamais
// l'écran derrière elle. Chaque élément qui doit intercepter le retour s'inscrit
// ici, le plus récent répond en premier — exactement comme les feuilles se
// superposent.
//
// Pur et sans dépendance : le pont natif (components/native/NativeBridge.tsx)
// l'appelle, le navigateur l'ignore.
// ─────────────────────────────────────────────────────────────────────────────

type Handler = () => void;

const stack: Handler[] = [];

/** Inscrit un gestionnaire du retour ; la fonction rendue le désinscrit. */
export function pushBackHandler(handler: Handler): () => void {
  stack.push(handler);
  return () => {
    const i = stack.lastIndexOf(handler);
    if (i !== -1) stack.splice(i, 1);
  };
}

/** Donne le retour au dernier inscrit. Vrai s'il l'a pris. */
export function runBackHandler(): boolean {
  const handler = stack[stack.length - 1];
  if (!handler) return false;
  handler();
  return true;
}

/** Nombre de gestionnaires inscrits (pour les tests). */
export function backHandlerCount(): number {
  return stack.length;
}

// ── Sortir de l'application ─────────────────────────────────────────────────
//
// Sur l'écran d'accueil, un premier retour prévient ; il faut un second retour
// dans les deux secondes pour sortir. Une poche ou un pouce maladroit ne ferme
// plus l'application au milieu de la journée.

export const EXIT_WINDOW_MS = 2000;

export function shouldExit(lastBackAt: number | null, now: number): boolean {
  return lastBackAt !== null && now - lastBackAt <= EXIT_WINDOW_MS;
}

/** Les écrans d'où « retour » propose de sortir au lieu de revenir en arrière. */
export function isRootPath(pathname: string | null | undefined): boolean {
  return pathname === '/dashboard' || pathname === '/auth/login' || pathname === '/';
}
