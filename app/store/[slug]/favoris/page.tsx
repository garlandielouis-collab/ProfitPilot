// ─────────────────────────────────────────────────────────────────────────────
// Les favoris — la destination du cœur des cartes mode (§5)
//
// Le serveur ne sait pas ce que le visiteur a mis en favori : la liste vit dans
// son navigateur (voir `components/store/FavoritesContext.tsx`). La page charge
// donc le catalogue et laisse le client choisir ce qu'il en garde.
//
// Elle n'est pas indexée : son contenu dépend d'un stockage local, ce qui donne
// une page différente pour chaque visiteur et vide pour un robot. Un moteur de
// recherche qui l'indexerait n'indexerait rien.
// ─────────────────────────────────────────────────────────────────────────────

import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { loadStore, loadCatalog, loadRatings, buildStorefrontContext } from '../../../../lib/storefrontData';
import { toStoreView } from '../../../../components/store/types';
import { resolveTemplateId } from '../../../../components/store/templates/registry';
import { FavoritesClient } from './FavoritesClient';

type Props = { params: Promise<{ slug: string }> };

export const metadata: Metadata = {
  title: 'Mes favoris',
  robots: { index: false, follow: true },
};

export default async function FavoritesPage({ params }: Props) {
  const { slug } = await params;
  const store = await loadStore(slug);
  if (!store) notFound();

  const ctx        = await buildStorefrontContext(store, slug);
  const templateId = resolveTemplateId(store.template_id);
  const view       = toStoreView(store, { base: ctx.base, origin: ctx.origin, templateId });

  const onlyPublished = ctx.theme.catalog.mode === 'selected';

  const [products, ratings] = await Promise.all([
    loadCatalog(store.business_id, { sort: 'newest', limit: 200, onlyPublished }),
    loadRatings(store.business_id),
  ]);

  return <FavoritesClient store={view} products={products} ratings={ratings} />;
}
