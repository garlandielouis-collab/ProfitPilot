// ─────────────────────────────────────────────────────────────────────────────
// Ce que la page d'accueil d'une vitrine a besoin de savoir
//
// Une seule fonction, appelée par deux écrans : la vitrine publique
// (`/store/<slug>`) et l'aperçu de gabarit du marchand (`/apercu/<gabarit>`).
//
// Pourquoi ce fichier existe : ces deux écrans DOIVENT montrer la même page.
// Un aperçu qui assemble ses données autrement finit par mentir — le marchand
// choisit un gabarit sur ce qu'il a vu, et découvre autre chose en ligne. Le
// jour où une section change de source, elle change ici, pour les deux.
//
// Toutes les lectures partagent le même catalogue. « Mis en avant », « meilleures
// ventes », « nouveautés » et « catalogue » sont quatre vues d'une seule liste
// déjà en cache : quatre sections de produits ne coûtent pas quatre
// allers-retours.
// ─────────────────────────────────────────────────────────────────────────────

import {
  loadStorefrontCatalog, loadCategories, loadSections, loadBestsellerIds,
  loadReviews, loadBundles, loadRatings,
} from './storefrontData';
import {
  resolveSections, pdpSectionsFor, type ResolvedSection,
} from './storeSections';
import type { ThemeConfig, TemplateId } from './storeTheme';
import type { StoreSettings } from '../app/actions/store-public';
import type { SectionData } from '../components/store/sections/types';

/** Trente jours : la même définition que `is_new` côté catalogue. */
const NEW_WINDOW_DAYS = 30;

/**
 * Une rangée qui répète le catalogue n'est pas une rangée.
 *
 * Le symptôme se voit sur toutes les boutiques neuves : « Meilleures ventes »
 * affichait les photos de TOUS les produits. Ce n'était pas un bug de calcul —
 * la vue `v_store_bestsellers` ne compte que des ventes réelles, sur 90 jours.
 * C'est de l'arithmétique : une boutique de six fiches dont chacune s'est
 * vendue une fois a six meilleures ventes, et la rangée montre le catalogue
 * entier, juste au-dessus du catalogue.
 *
 * Le visiteur, lui, ne lit pas « ces six-là se vendent bien ». Il lit « cette
 * page se répète », et il descend moins loin.
 *
 * La règle : une rangée ne montre jamais plus de la MOITIÉ du catalogue
 * visible, et disparaît en dessous de trois articles — trois cartes sur une
 * ligne de quatre, c'est déjà une sélection ; deux, c'est un reste. Elle
 * réapparaît d'elle-même quand la boutique grandit, sans que personne ait à
 * régler quoi que ce soit.
 *
 * Ne s'applique qu'aux rangées CALCULÉES — meilleures ventes, nouveautés. « Mis
 * en avant » est un choix explicite du marchand : s'il coche ses six fiches, il
 * a voulu ses six fiches, et ce n'est pas à nous de le corriger.
 */
const MIN_ROW = 3;

function selection<T>(row: T[], catalogSize: number): T[] {
  if (row.length === 0) return row;
  const cap = Math.floor(catalogSize / 2);
  return cap >= MIN_ROW ? row.slice(0, cap) : [];
}

export async function loadHome(
  store: StoreSettings,
  opts: { slug: string; theme: ThemeConfig; templateId: TemplateId },
): Promise<{ data: SectionData; sections: ResolvedSection[] }> {
  const onlyPublished = opts.theme.catalog.mode === 'selected';

  const [catalog, categories, storedSections, bestsellerIds, reviews, bundles, ratings] =
    await Promise.all([
      // La MÊME lecture que le layout : une seule entrée de cache, donc un
      // seul aller-retour pour les deux. Les rangées tronquent ensuite à leur
      // propre limite, l'affichage est inchangé.
      loadStorefrontCatalog(store.business_id, onlyPublished),
      loadCategories(store.business_id, onlyPublished),
      loadSections(opts.slug, store.business_id),
      loadBestsellerIds(store.business_id),
      loadReviews(store.business_id),
      loadBundles(store.business_id),
      loadRatings(store.business_id),
    ]);

  const products = opts.theme.catalog.hideOutOfStock
    ? catalog.filter((p) => p.stock > 0 || p.allow_backorders)
    : catalog;

  // Les meilleures ventes arrivent comme des identifiants ordonnés : on les
  // rapproche du catalogue plutôt que de relire les fiches. Une vente d'un
  // produit dépublié depuis ne doit pas le faire réapparaître.
  const byId = new Map(products.map((p) => [p.id, p]));
  const bestsellers = bestsellerIds
    .map((id) => byId.get(id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  const newestFirst = [...products].sort(
    (a, b) => +new Date(b.created_at) - +new Date(a.created_at),
  );

  const newArrivals = newestFirst.filter((p) => {
    const days = (Date.now() - +new Date(p.created_at)) / 86_400_000;
    return days <= NEW_WINDOW_DAYS;
  });

  const data: SectionData = {
    products,
    categories,
    featured:    products.filter((p) => p.is_featured),
    bestsellers: selection(bestsellers, products.length),
    newArrivals: selection(newArrivals, products.length),
    reviews,
    bundles,
    ratings,
  };

  return { data, sections: resolveSections(opts.templateId, storedSections) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Ce que la FICHE PRODUIT reprend de la boutique (§16, §34)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Les sections de boutique reprises sous la fiche produit.
 *
 * Une seule lecture de plus sur la page — celle des sections — et rien d'autre :
 * les sections concernées (composition, fabrication, guide des tailles, prix de
 * gros, galerie, questions fréquentes) lisent le THÈME, pas le catalogue. C'est
 * pour cela que les données produits partent vides : leur remplir un catalogue
 * dont aucune de ces sections ne se sert ferait payer six lectures à chaque
 * fiche ouverte.
 *
 * L'état du marchand est respecté : une section qu'il a désactivée pour sa page
 * d'accueil ne réapparaît pas ici, et le titre qu'il a choisi la suit. C'est
 * l'intérêt de reprendre `resolveSections` au lieu de fabriquer une liste.
 */
export async function loadProductPageSections(
  store: StoreSettings,
  opts: { slug: string; templateId: TemplateId },
): Promise<{ data: SectionData; sections: ResolvedSection[] }> {
  const wanted = pdpSectionsFor(opts.templateId);

  const storedSections = await loadSections(opts.slug, store.business_id);

  const sections = resolveSections(opts.templateId, storedSections)
    .filter((s) => wanted.includes(s.key))
    // L'ordre de la fiche est celui du gabarit, pas celui de la page d'accueil :
    // sous un article, la composition vient avant les questions fréquentes,
    // quelle que soit la place que le marchand leur a donnée plus haut.
    .sort((a, b) => wanted.indexOf(a.key) - wanted.indexOf(b.key));

  const data: SectionData = {
    products:    [],
    categories:  [],
    featured:    [],
    bestsellers: [],
    newArrivals: [],
    reviews:     [],
    bundles:     [],
    ratings:     {},
  };

  return { data, sections };
}
