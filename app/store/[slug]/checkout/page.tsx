// ─────────────────────────────────────────────────────────────────────────────
// Le checkout
//
// Trois choses ont changé par rapport à la version précédente.
//
//   Les réglages de la boutique sont lus SUR LE SERVEUR. La page appelait
//   `getStoreBySlug(slug)` depuis le navigateur, ce qui faisait descendre la
//   ligne `store_settings` entière dans le client — à l'époque où elle portait
//   encore `payment_credentials`. Le composant client ne reçoit désormais que
//   les modes de paiement, les modes de livraison et l'identifiant de
//   l'entreprise.
//
//   L'écran suit le thème du marchand, comme le reste de la vitrine.
//
//   Le panier envoyé au serveur ne contient plus que des identifiants et des
//   quantités : les prix sont relus en base (cf. `create_store_order`).
// ─────────────────────────────────────────────────────────────────────────────

import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { loadStore, buildStorefrontContext } from '../../../../lib/storefrontData';
import { toStoreView } from '../../../../components/store/types';
import { resolveTemplateId } from '../../../../components/store/templates/registry';
import { CheckoutClient } from './CheckoutClient';

type Props = {
  params:       Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata: Metadata = {
  title: 'Commander',
  // Un tunnel d'achat n'a rien à faire dans un index de recherche.
  robots: { index: false, follow: false },
};

export default async function CheckoutPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp       = await searchParams;
  const store    = await loadStore(slug);
  if (!store) notFound();

  const ctx        = await buildStorefrontContext(store, slug);
  const templateId = resolveTemplateId(store.template_id);
  const view       = toStoreView(store, { base: ctx.base, origin: ctx.origin, templateId });

  const failed = (Array.isArray(sp.error) ? sp.error[0] : sp.error) === 'payment_failed';

  return (
    <CheckoutClient
      store={view}
      businessId={store.business_id}
      paymentMethods={Array.isArray(store.payment_methods) ? store.payment_methods : ['cash']}
      shippingModes={Array.isArray(store.shipping_modes) ? store.shipping_modes : []}
      paymentFailed={failed}
    />
  );
}
