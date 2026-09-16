// ─────────────────────────────────────────────────────────────────────────────
// Un nom tapé au comptoir → une ligne `customers`
//
// Le marchand qui vend à crédit n'a qu'une chose sous la main : un nom. Pas un
// courriel, pas un téléphone, pas un formulaire de fiche client — le client est
// devant lui et attend. La table, elle, veut un prénom, un nom et une adresse
// de courriel unique par entreprise.
//
// Ces deux fonctions font la traduction, et elles vivent ici parce que DEUX
// chemins en ont besoin : la création de client depuis la fiche (`upsertCustomer`)
// et la vente à crédit rapide, qui doit retrouver ou créer le client toute
// seule. Les deux écrivaient leur propre version ; deux conventions d'adresse
// de remplissage qui divergent, c'est un client dupliqué et un historique de
// crédit coupé en deux.
// ─────────────────────────────────────────────────────────────────────────────

/** Le domaine des adresses de remplissage. Jamais routable, par construction. */
export const PLACEHOLDER_EMAIL_DOMAIN = 'profitpilot.local';

/**
 * Coupe « Jean Baptiste Pierre » en prénom et nom.
 *
 * Le premier mot est le prénom, tout le reste est le nom : en Haïti comme
 * ailleurs, un nom composé est plus courant qu'un second prénom, et le garder
 * entier vaut mieux que de le tronquer. Un nom d'un seul mot laisse le nom de
 * famille vide — c'est un état normal, pas une saisie incomplète : « Jonathan »
 * est un client valide.
 */
export function splitCustomerName(raw: string): { first: string; last: string } {
  const parts = (raw ?? '').trim().split(/\s+/).filter(Boolean);
  return {
    first: parts[0] ?? '',
    last:  parts.slice(1).join(' '),
  };
}

/**
 * Une adresse de remplissage pour un client qui n'en a pas.
 *
 * `customers.email` est unique par entreprise et ne se laisse pas vider : sans
 * adresse, le deuxième client de comptoir heurterait la contrainte du premier.
 * L'adresse porte donc l'entreprise, le nom réduit à ses lettres, l'horodatage
 * et un grain d'aléa — assez pour que deux clients créés dans la même seconde
 * ne se marchent pas dessus.
 *
 * `suffix` est injectable pour que le test puisse vérifier la forme sans
 * dépendre de l'horloge.
 */
export function placeholderEmail(
  businessId: string,
  first:      string,
  last:       string,
  suffix:     string = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
): string {
  const slug = `${first}${last}`.replace(/[^a-z0-9]+/gi, '').toLowerCase() || 'customer';
  return `no-email-${businessId.replace(/-/g, '')}-${slug}-${suffix}@${PLACEHOLDER_EMAIL_DOMAIN}`;
}
