// ─────────────────────────────────────────────────────────────────────────────
// La fiche produit, dans le gabarit regardé
//
// Les vingt-trois gabarits ont chacun leur fiche : dix mécaniques d'achat
// (panier, réservation, demande de lot, commande pour une date…), leurs
// onglets, leurs bandes. L'aperçu n'en montrait aucune — un clic sur un
// produit ouvrait la fiche EN LIGNE, dans le gabarit réel de la boutique. Le
// marchand voyait donc vingt-trois accueils et une seule fiche, et concluait,
// à raison, qu'il n'y en avait qu'une.
//
// Cette page rend la fiche avec le gabarit de l'adresse. Le corps est celui de
// la boutique (`ProductPageBody`), sans une ligne de rendu propre : ce que le
// marchand voit ici est ce que ses clients verront s'il choisit ce gabarit.
// Deux différences seulement — ni mesure de visite, ni balisage pour les
// moteurs : l'aperçu n'est pas une page publique.
// ─────────────────────────────────────────────────────────────────────────────

import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { loadCatalog, loadCategories, loadProduct } from '../../../../../lib/storefrontData';
import { readableInk } from '../../../../../lib/storeTheme';
import { TEMPLATES } from '../../../../../components/store/templates/registry';
import { StorefrontShell } from '../../../../../components/store/StorefrontShell';
import { ProductPageBody } from '../../../../store/[slug]/products/[id]/ProductPageBody';
import { ApercuBar } from '../../ApercuBar';
import { openApercu } from '../../openApercu';

export const metadata: Metadata = {
  title:  'Aperçu de la fiche produit',
  robots: { index: false, follow: false },
};

type Props = { params: Promise<{ template: string; id: string }> };

export default async function ApercuProductPage({ params }: Props) {
  const { template, id } = await params;

  const opened = await openApercu(template);
  if (opened.kind === 'screen') return opened.node;

  const { store, view, templateId } = opened;
  const onlyPublished = view.theme.catalog.mode === 'selected';

  // Le produit est relu DANS l'entreprise de la session : un identifiant
  // collé dans l'adresse ne montre jamais la fiche d'une autre boutique.
  const [product, catalog, categories] = await Promise.all([
    loadProduct(store.business_id, id),
    loadCatalog(store.business_id, { sort: 'name', limit: 200, onlyPublished }),
    loadCategories(store.business_id, onlyPublished),
  ]);
  if (!product) notFound();

  // Même règle qu'en ligne : un produit retiré de la vitrine n'a pas de fiche.
  // L'aperçu montre ce que le client verra, pas davantage.
  if (onlyPublished && !product.is_published) notFound();

  return (
    <>
      <StorefrontShell
        view={view}
        businessId={store.business_id}
        searchIndex={catalog.map((p) => ({ ...p, images: [] }))}
        categories={categories}
        dockMode="static"
      >
        <ProductPageBody
          store={store}
          product={product}
          view={view}
          templateId={templateId}
          slug={store.slug}
          publicPage={null}
        />
        {/* La barre de l'aperçu recouvre la fin de la page. */}
        <div className="h-24" aria-hidden />
      </StorefrontShell>

      {/* En passant au gabarit suivant, on reste sur CE produit : c'est la
          comparaison que le marchand est venu faire — la même fiche, rendue
          par deux gabarits, l'une après l'autre. */}
      <ApercuBar
        templateId={templateId}
        name={TEMPLATES[templateId].name}
        tagline={TEMPLATES[templateId].tagline}
        isCurrent={store.template_id === templateId}
        productCount={catalog.length}
        accent={view.theme.palette.accent}
        accentInk={readableInk(view.theme.palette.accent)}
        path={`/products/${product.id}`}
        pageLabel={product.name}
      />
    </>
  );
}
