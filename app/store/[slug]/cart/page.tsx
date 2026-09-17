// ─────────────────────────────────────────────────────────────────────────────
// Le panier, en pleine page
//
// Il vivait hors du moteur de gabarits : couleurs `slate-*` en dur et
// `var(--store-primary)`, une variable CSS que plus personne ne déclare depuis
// que le layout pose `--st-*`. Concrètement, le bouton « Commander » était
// transparent avec du texte blanc — invisible. Le tunnel d'achat entier était
// dans cet état.
//
// La page charge donc la vitrine comme toutes les autres, et le rendu passe au
// composant client — le contenu du panier vit dans `localStorage`, le serveur
// ne peut rien en savoir.
// ─────────────────────────────────────────────────────────────────────────────

import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import {
  loadStore, loadStorefrontCatalog, loadBestsellerIds, loadRatings, buildStorefrontContext,
} from '../../../../lib/storefrontData';
import { toStoreView } from '../../../../components/store/types';
import { resolveTemplateId } from '../../../../components/store/templates/registry';
import { CartClient } from './CartClient';

type Props = { params: Promise<{ slug: string }> };

export const metadata: Metadata = { title: 'Mon panier' };

export default async function CartPage({ params }: Props) {
  const { slug } = await params;
  const store = await loadStore(slug);
  if (!store) notFound();

  const ctx        = await buildStorefrontContext(store, slug);
  const templateId = resolveTemplateId(store.template_id);
  const view       = toStoreView(store, { base: ctx.base, origin: ctx.origin, templateId });

  // Les suggestions du panier (§19). Ce sont les meilleures ventes RÉELLES de
  // la boutique, calculées sur ses commandes — pas une sélection au hasard, et
  // pas un produit poussé parce qu'il stagne. Le composant client en retire
  // ensuite ce qui est déjà dans le panier : proposer d'ajouter ce qu'on vient
  // d'ajouter est le plus sûr moyen de faire douter de la page.
  const onlyPublished = ctx.theme.catalog.mode === 'selected';
  const [catalog, bestsellerIds, ratings] = await Promise.all([
    loadStorefrontCatalog(store.business_id, onlyPublished),
    loadBestsellerIds(store.business_id),
    loadRatings(store.business_id),
  ]);

  const byId = new Map(catalog.map((p) => [p.id, p]));
  const suggestions = bestsellerIds
    .map((id) => byId.get(id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .filter((p) => p.stock > 0 || p.allow_backorders)
    .slice(0, 8);

  return <CartClient store={view} suggestions={suggestions} ratings={ratings} />;
}
