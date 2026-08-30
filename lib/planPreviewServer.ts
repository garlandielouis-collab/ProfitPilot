import { cookies } from 'next/headers';
import { normalizePlanKey, type PlanKey } from './plans';
import { PLAN_PREVIEW_COOKIE } from './planPreview';

// ─────────────────────────────────────────────────────────────────────────────
// Le côté serveur de l'aperçu des offres
//
// Le cookie ne vaut RIEN par lui-même. Il n'est honoré que si l'exploitant a
// posé `PLAN_PREVIEW=1` dans l'environnement du serveur — ou si l'on tourne en
// développement. En production normale, ce fichier renvoie toujours `null`,
// quoi qu'il y ait dans le cookie.
//
// C'est là toute la sûreté du dispositif : le garde n'est pas une valeur que le
// navigateur envoie, c'est une variable que seul l'exploitant peut poser. On
// peut donc laisser l'aperçu dans le code livré sans ouvrir quoi que ce soit.
// ─────────────────────────────────────────────────────────────────────────────

/** L'installation autorise-t-elle l'aperçu ? Question tranchée côté serveur. */
export function serverPreviewAllowed(): boolean {
  return process.env.NODE_ENV !== 'production' || process.env.PLAN_PREVIEW === '1';
}

/**
 * L'offre simulée pour cette requête, ou `null`.
 * `null` signifie « juge sur l'offre réelle », ce qui est le cas par défaut.
 */
export async function getPreviewPlanServer(): Promise<PlanKey | null> {
  if (!serverPreviewAllowed()) return null;
  try {
    const jar = await cookies();
    return normalizePlanKey(jar.get(PLAN_PREVIEW_COOKIE)?.value);
  } catch {
    // Hors contexte de requête (build, rendu statique) : pas d'aperçu.
    return null;
  }
}
