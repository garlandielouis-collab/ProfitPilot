// ─────────────────────────────────────────────────────────────────────────────
// La page de paiement — Payment Bridge, côté acheteur
//
// L'acheteur a choisi MonCash ou NatCash, la boutique n'a pas de contrat API :
// il va transférer lui-même, depuis son téléphone, vers le numéro du marchand.
// Cette page lui dit combien, à qui, et sous quelle référence — puis le laisse
// signaler qu'il a payé.
//
// ── Adressée par l'identifiant de la dette ─────────────────────────────────
//
// Comme la page de confirmation, et pour la même raison : une référence
// `PP-7K9M2Q` ne fait que 887 millions de combinaisons, un numéro de commande est
// séquentiel, un UUID ne s'énumère pas. Et la dette doit appartenir à CETTE
// vitrine : l'identifiant d'une dette d'une autre boutique donne un 404.
//
// ── Ce que la page ne dit jamais ───────────────────────────────────────────
//
// « Payé » avant que la boutique ne l'ait confirmé. Le bouton « J'ai effectué le
// paiement » enregistre une déclaration ; l'écran répond « la boutique vérifie »,
// pas « merci pour votre paiement ». Le contraire ferait croire au client que sa
// capture d'écran vaut règlement (§57).
// ─────────────────────────────────────────────────────────────────────────────

import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { loadStore, buildStorefrontContext } from '../../../../lib/storefrontData';
import { toStoreView } from '../../../../components/store/types';
import { resolveTemplateId } from '../../../../components/store/templates/registry';
import { getPublicIntent } from '../../../../lib/paymentBridge/intents';
import { formatHaitianPhone } from '../../../../lib/paymentBridge/mask';
import { PaymentClient } from './PaymentClient';

type Props = {
  params:       Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata: Metadata = {
  title: 'Paiement',
  robots: { index: false, follow: false },
};

// Chaque visite relit l'état : une page de paiement mise en cache afficherait
// « en attente » à un client dont le paiement vient d'être confirmé.
export const dynamic = 'force-dynamic';

function one(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? '';
}

export default async function PaymentPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp       = await searchParams;
  const store    = await loadStore(slug);
  if (!store) notFound();

  const intent = await getPublicIntent(one(sp.id));
  if (!intent || intent.businessId !== (store as any).business_id) notFound();

  const ctx        = await buildStorefrontContext(store, slug);
  const templateId = resolveTemplateId(store.template_id);
  const view       = toStoreView(store, { base: ctx.base, origin: ctx.origin, templateId });

  return (
    <PaymentClient
      slug={slug}
      base={view.base}
      storeName={view.name}
      contactPhone={view.contactPhone ?? null}
      intent={{
        id:               intent.id,
        reference:        intent.reference,
        status:           intent.status,
        method:           intent.method,
        amount:           intent.amount,
        currency:         intent.currency,
        chargeAmount:     intent.chargeAmount,
        chargeCurrency:   intent.chargeCurrency,
        remaining:        intent.remaining,
        // Le numéro, groupé pour être RECOPIÉ sans erreur — lisible en entier :
        // c'est la seule page où il doit l'être.
        destination:      intent.destination ? formatHaitianPhone(intent.destination) : null,
        destinationLabel: intent.destinationLabel,
        instructions:     intent.instructions,
        orderNumber:      intent.orderNumber,
        orderId:          intent.orderId,
        expiresAt:        intent.expiresAt,
        reported:         intent.reported,
      }}
    />
  );
}
