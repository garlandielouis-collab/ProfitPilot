import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { loadStore, loadProduct, buildStorefrontContext } from '../../../../../lib/storefrontData';
import { storePublicUrl } from '../../../../../lib/storeTheme';
import { toStoreView } from '../../../../../components/store/types';
import { resolveTemplateId } from '../../../../../components/store/templates/registry';
import { ProductPageBody } from './ProductPageBody';

type Props = { params: Promise<{ slug: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, id } = await params;
  const store = await loadStore(slug);
  if (!store) return {};
  const product = await loadProduct(store.business_id, id);
  if (!product) return { title: 'Produit introuvable' };

  // Ce que le marchand a écrit pour Google passe avant ce qu'on peut déduire.
  // L'ordre dit la précision décroissante : le texte fait pour la balise, puis
  // l'accroche — une phrase, la bonne longueur —, puis la description longue
  // que Google coupera, puis un pis-aller qui vaut mieux qu'une balise vide.
  const title = product.seo_title?.trim() || product.name;
  const description =
    product.seo_description?.trim()
    || product.short_description?.trim()
    || product.description?.trim()
    || `${product.name} — ${store.store_name ?? 'Boutique'}`;

  return {
    title,
    description,
    openGraph: {
      type:  'website',
      title,
      description,
      images: product.image_url ? [{ url: product.image_url }] : undefined,
    },
  };
}

/**
 * La fiche produit de la boutique, dans SON gabarit.
 *
 * Le corps vit dans `ProductPageBody`, que l'aperçu des gabarits rend aussi —
 * dans le gabarit regardé, et sans mesure ni balisage.
 */
export default async function ProductDetailPage({ params }: Props) {
  const { slug, id } = await params;
  const store = await loadStore(slug);
  if (!store) notFound();

  const product = await loadProduct(store.business_id, id);
  if (!product) notFound();

  const ctx        = await buildStorefrontContext(store, slug);
  const templateId = resolveTemplateId(store.template_id);
  const view       = toStoreView(store, { base: ctx.base, origin: ctx.origin, templateId });

  // Un produit dépublié n'est pas seulement absent de la grille : son URL ne
  // doit pas rester une porte dérobée vers un article que le marchand a retiré.
  if (ctx.theme.catalog.mode === 'selected' && !product.is_published) notFound();

  return (
    <ProductPageBody
      store={store}
      product={product}
      view={view}
      templateId={templateId}
      slug={slug}
      publicPage={{ origin: ctx.origin || storePublicUrl(store) }}
    />
  );
}
