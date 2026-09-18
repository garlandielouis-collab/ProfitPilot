// ─────────────────────────────────────────────────────────────────────────────
// Ce qu'une section reçoit
//
// Un contrat unique pour les trente et une sections. C'est ce qui permet au moteur
// de les rendre sans savoir laquelle il rend, et d'en ajouter une quinzième
// sans toucher au moteur.
//
// `data` est assemblé UNE fois par la page, pas par chaque section. Trois
// sections qui affichent des produits ne font pas trois lectures : elles
// piochent dans le même catalogue déjà chargé et déjà mis en cache.
// ─────────────────────────────────────────────────────────────────────────────

import type { ResolvedSection } from '../../../lib/storeSections';
import type { DesignProfile } from '../../../lib/storeDesign';
import type { StoreView, StoreProduct, StoreCategory } from '../types';
import type { StoreBundle } from '../../../app/actions/store-public';
import type { RatingMap } from '../blocks/ProductGrid';

export type { RatingMap };

/** Un avis publié, réduit à ce que la vitrine affiche. */
export type StoreReview = {
  id:          string;
  author_name: string;
  rating:      number;
  body:        string | null;
  created_at:  string;
  /** Le produit concerné, pour situer l'avis. */
  product_name: string | null;
};

export type SectionData = {
  /** Le catalogue visible, déjà filtré selon le mode de publication. */
  products:    StoreProduct[];
  categories:  StoreCategory[];
  /** Les fiches cochées « en vedette » par le marchand. */
  featured:    StoreProduct[];
  /** Calculées sur les ventes des 90 derniers jours, jamais cochées. */
  bestsellers: StoreProduct[];
  newArrivals: StoreProduct[];
  /** Les avis publiés, tous produits confondus. */
  reviews:     StoreReview[];
  /** Les lots actifs, pièces épuisées déjà écartées (§18). */
  bundles:     StoreBundle[];
  /**
   * Les notes moyennes, par identifiant de produit.
   *
   * Un produit absent de cette table n'a aucun avis publié, et sa carte
   * n'affiche donc pas d'étoiles. C'est volontairement un vide, pas un zéro :
   * « 0 sur 5 » se lirait comme un mauvais produit alors qu'il n'a été noté par
   * personne.
   */
  ratings:     RatingMap;
};

export type SectionProps = {
  store:   StoreView;
  section: ResolvedSection;
  data:    SectionData;
  /**
   * La direction artistique du gabarit.
   *
   * Elle est calculée UNE fois par la page et transmise, plutôt que redérivée
   * dans chacune des trente et une sections : une section qui appellerait `designFor`
   * elle-même pourrait, un jour, en tirer un profil différent des autres.
   */
  design:  DesignProfile;
  /**
   * La page interne où la section est rendue (`'a-propos'`…), absente sur
   * l'accueil. Une section qui renvoie vers une page s'en sert pour ne pas
   * renvoyer vers celle où l'on est déjà.
   */
  infoPage?: string;
};
