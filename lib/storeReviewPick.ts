// ─────────────────────────────────────────────────────────────────────────────
// L'avis qui tient dans le rail (§17)
//
// La maquette pose une carte de témoignage sous les engagements, à droite du
// prix : une phrase, un prénom, une ville. Elle y pose aussi « +3 000 clients
// satisfaits », que nous n'écrirons jamais — un chiffre de réassurance inventé
// est exactement ce que le §10 interdit, et c'est celui qu'un client vérifie
// en comptant les avis affichés juste en dessous.
//
// Reste la carte, qui elle est tenable : il suffit de prendre un avis RÉEL.
// Encore faut-il prendre le bon, parce qu'il n'y a de la place que pour un.
//
// ── Ce qui décide ──────────────────────────────────────────────────────────
//
//   1. il a un TEXTE. Une note sans phrase ne rassure personne à cet endroit —
//      les étoiles sont déjà sous le titre.
//   2. il est BON. Le rail est un bloc de réassurance ; y poser un avis à deux
//      étoiles serait malhonnête envers le marchand autant qu'envers le
//      lecteur, qui le lirait comme le meilleur qu'on ait trouvé. En dessous
//      de 4, le rail n'affiche rien et les avis restent dans leur onglet, où
//      ils se lisent tous.
//   3. il est COURT. Le rail fait 200 px de large : une tirade s'y coupe au
//      milieu d'un mot. À note égale, le plus court gagne.
//   4. il est RÉCENT. À note et longueur comparables, le dernier parle mieux
//      de la boutique d'aujourd'hui.
// ─────────────────────────────────────────────────────────────────────────────

type Reviewish = {
  id:          string;
  author_name: string;
  rating:      number;
  body:        string | null;
  created_at:  string;
};

/** En dessous, aucun avis ne monte dans le rail. */
export const RAIL_REVIEW_MIN_RATING = 4;

/** Au-delà, la carte tronquerait : on préfère un avis qui tient entier. */
const COMFORTABLE = 240;

export function pickRailReview<T extends Reviewish>(reviews: T[]): T | null {
  const eligible = (reviews ?? []).filter(
    (r) => (r.body ?? '').trim().length > 0 && r.rating >= RAIL_REVIEW_MIN_RATING,
  );
  if (eligible.length === 0) return null;

  return [...eligible].sort((a, b) => {
    if (b.rating !== a.rating) return b.rating - a.rating;

    // La longueur ne départage que ce qui dépasse le confort : entre 40 et 200
    // signes, c'est la date qui doit décider, pas trois mots de moins.
    const aLong = (a.body ?? '').trim().length > COMFORTABLE;
    const bLong = (b.body ?? '').trim().length > COMFORTABLE;
    if (aLong !== bLong) return aLong ? 1 : -1;

    return +new Date(b.created_at) - +new Date(a.created_at);
  })[0];
}
