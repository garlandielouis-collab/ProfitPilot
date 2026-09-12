// ─────────────────────────────────────────────────────────────────────────────
// Le lien d'un bouton, ramené dans le référentiel de la vitrine
//
// Vivait dans ContentSections.tsx, réservé à la bannière de promotion. Les
// autres boutons dont le marchand ou le préréglage écrit l'adresse — bande
// d'appel final, présentation, formules, journal — rendaient « /products » tel
// quel. Un module à part, sans composant, pour que chaque section l'importe
// sans tirer les autres.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Le préréglage et le marchand écrivent « /products » : c'est lisible, et
 * c'est juste sur un sous-domaine. Mais sur `/store/<slug>`, rendu tel quel, il
 * menait au back-office de ProfitPilot — l'acheteur tombait sur l'écran de
 * connexion. Une adresse relative reçoit donc la base de la vitrine au rendu ;
 * une URL absolue (`https://`, `mailto:`, `tel:`) ou une ancre reste telle
 * quelle, et un chemin déjà préfixé par la base n'est pas préfixé deux fois.
 *
 * `base` est `store.base` : chaîne vide sur le propre hôte de la boutique,
 * `/store/<slug>` sur le domaine de l'application (`getStoreRouting`).
 *
 * Une adresse vide mène au catalogue.
 */
export function storeLink(href: string, base: string): string {
  const h = href.trim();
  if (!h) return `${base}/products`;
  if (!h.startsWith('/') || h.startsWith('//')) return h;
  if (base && (h === base || h.startsWith(`${base}/`))) return h;
  return `${base}${h}`;
}
