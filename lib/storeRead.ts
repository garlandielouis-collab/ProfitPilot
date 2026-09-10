// ─────────────────────────────────────────────────────────────────────────────
// Une lecture qui échoue n'est pas une lecture vide
//
// Les lectures de la vitrine écrivaient toutes la même ligne :
//
//     if (error || !data) return null;   // ou return []
//
// Elles confondaient donc deux situations qui n'ont rien à voir : « ce produit
// n'existe pas » et « la base n'a pas répondu ».
//
// Prise isolément, la confusion coûte un affichage. Prise à travers
// `unstable_cache` (lib/storefrontData.ts), elle coûte cinq minutes : le `null`
// d'un aller-retour Supabase en échec est MÉMORISÉ, et la fiche produit d'un
// marchand répond « introuvable » à tous ses clients jusqu'à expiration du
// cache — bien après que la base soit revenue.
//
// Le cas n'a rien de théorique ici : le projet Supabase du plan gratuit se met
// en veille entre deux pics, et la lecture qui le réveille peut expirer.
// Constaté en test : le catalogue répondait, la fiche répondait 404, et elle a
// continué pendant cinq minutes après le retour de la base.
//
// Lever plutôt que mentir. `unstable_cache` ne mémorise pas une exception : la
// vitrine affiche son écran d'erreur, qui propose « Réessayer », et le second
// essai aboutit. Une page qui dit « ça n'a pas marché, réessayez » vaut mieux
// qu'une page qui affirme calmement que l'article n'existe pas.
//
// ── Pourquoi ce fichier et pas les actions ─────────────────────────────────
//
// `app/actions/store-public.ts` porte `'use server'` : tout ce qu'il exporte
// doit être une fonction asynchrone appelable depuis le navigateur. Un garde-fou
// synchrone n'y a donc pas sa place — il vit ici, en simple module partagé.
// ─────────────────────────────────────────────────────────────────────────────

/** L'erreur telle que `postgrest-js` la rend. On n'en lit que le message. */
type ReadError = { message?: string } | null;

/**
 * Lève si la lecture a échoué. Ne dit rien d'un résultat vide : une boutique
 * sans produit est une réponse valide, pas une panne.
 */
export function failIfUnreadable(error: ReadError, what: string): void {
  if (!error) return;
  throw new Error(`Lecture impossible : ${what}. ${error.message ?? ''}`.trim());
}
