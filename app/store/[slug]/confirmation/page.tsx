// ─────────────────────────────────────────────────────────────────────────────
// La confirmation de commande
//
// Page SERVEUR, et adressée par l'identifiant de la commande.
//
// La version précédente lisait `?order=ORD-2026-00012&biz=<uuid>` depuis le
// navigateur. Les numéros de commande sont séquentiels : il suffisait de
// décrémenter le numéro pour lire, une par une, les commandes des autres
// clients de la boutique — nom, courriel, téléphone, adresse. Un UUID ne
// s'énumère pas.
//
// Elle affiche le total RÉELLEMENT enregistré, pas celui que le panier avait
// calculé. Si un prix a changé entre la mise au panier et la commande, c'est ici
// que l'acheteur le voit — au lieu de le découvrir sur son relevé.
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { Check, Package } from 'lucide-react';
import { loadStore, buildStorefrontContext } from '../../../../lib/storefrontData';
import { toStoreView } from '../../../../components/store/types';
import { resolveTemplateId } from '../../../../components/store/templates/registry';
import { StoreImage } from '../../../../components/store/blocks/StoreImage';
import { storeMoney } from '../../../../components/store/format';
import { getStoreOrder } from '../../../actions/store-public';
import { getReviewedProductIds } from '../../../actions/store-content';
import { mintReviewToken } from '../../../../lib/reviewToken';
import { ReviewForm } from '../../../../components/store/blocks/ReviewForm';
import { ClearPaidCart } from './ClearPaidCart';

type Props = {
  params:       Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata: Metadata = {
  title: 'Commande confirmée',
  robots: { index: false, follow: false },
};

function one(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? '';
}

export default async function ConfirmationPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp       = await searchParams;
  const store    = await loadStore(slug);
  if (!store) notFound();

  const ctx        = await buildStorefrontContext(store, slug);
  const templateId = resolveTemplateId(store.template_id);
  const view       = toStoreView(store, { base: ctx.base, origin: ctx.origin, templateId });

  const order = await getStoreOrder(one(sp.id));
  const paid  = one(sp.paid) === '1' || order?.payment_status === 'paid';

  // Ce qui a déjà été noté, pour ne pas reproposer ce que le client vient
  // d'envoyer — ni après un rechargement, ni depuis le lien de la relance.
  const reviewed = order ? await getReviewedProductIds(order.id) : [];

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <div className="flex flex-col items-center text-center">
        <div
          className="flex h-16 w-16 items-center justify-center rounded-full"
          style={{ background: 'var(--st-surface-2)' }}
        >
          <Check className="h-8 w-8" style={{ color: 'var(--st-accent)' }} strokeWidth={2.2} aria-hidden />
        </div>

        <h1 className="mt-5 text-[24px] font-semibold text-[var(--st-ink)]">
          {paid ? 'Paiement reçu' : 'Commande enregistrée'}
        </h1>
        <p className="mt-2 max-w-sm text-[14px] text-[var(--st-ink-2)]">
          {paid
            ? `Merci. ${view.name} prépare votre commande et vous contactera.`
            : `Merci. ${view.name} vous contactera pour confirmer la livraison et le paiement.`}
        </p>
      </div>

      {order ? (
        <>
        {/* Le panier ne part qu'ici pour un paiement en ligne : la base dit
            payée, pas l'URL. */}
        {order.payment_status === 'paid' && (
          <ClearPaidCart slug={view.slug} orderId={order.id} />
        )}
        <section
          className="mt-8 rounded-[var(--st-radius-card)] border p-5 text-left"
          style={{ borderColor: 'var(--st-border)', background: 'var(--st-surface)' }}
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[15px] font-semibold text-[var(--st-ink)]">
              Commande {order.order_number}
            </h2>
            <span
              className="rounded-full px-3 py-1 text-[12px] font-semibold"
              style={{ background: 'var(--st-surface-2)', color: 'var(--st-ink-2)' }}
            >
              {paid ? 'Payée' : 'En attente'}
            </span>
          </div>

          <ul className="flex flex-col">
            {order.items.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-3 border-t py-3 first:border-t-0 first:pt-0"
                style={{ borderColor: 'var(--st-border)' }}
              >
                <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-[var(--st-radius-media)] bg-[var(--st-surface-2)]">
                  {item.product_image ? (
                    <StoreImage
                      src={item.product_image} alt={item.product_name}
                      sizes="64px" className="object-cover"
                    />
                  ) : (
                    <span className="flex h-full items-center justify-center text-[var(--st-ink-3)]">
                      <Package className="h-5 w-5" strokeWidth={1.5} aria-hidden />
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-[14px] text-[var(--st-ink)]">{item.product_name}</p>
                  <p className="text-[12px] text-[var(--st-ink-3)]">Quantité : {item.quantity}</p>
                </div>
                <p className="text-[14px] font-semibold tabular-nums text-[var(--st-ink)]">
                  {storeMoney(item.total_price, order.currency)}
                </p>
              </li>
            ))}
          </ul>

          <div
            className="mt-4 flex flex-col gap-2 border-t pt-4 text-[14px]"
            style={{ borderColor: 'var(--st-border)' }}
          >
            <div className="flex justify-between text-[var(--st-ink-2)]">
              <span>Sous-total</span>
              <span className="tabular-nums">{storeMoney(order.subtotal, order.currency)}</span>
            </div>
            <div className="flex justify-between text-[var(--st-ink-2)]">
              <span>Livraison</span>
              <span className="tabular-nums">
                {order.shipping_amount === 0
                  ? 'Gratuit'
                  : storeMoney(order.shipping_amount, order.currency)}
              </span>
            </div>
            <div
              className="flex items-baseline justify-between border-t pt-3"
              style={{ borderColor: 'var(--st-border)' }}
            >
              <span className="text-[var(--st-ink-2)]">Total</span>
              <span className="text-[20px] font-semibold tabular-nums text-[var(--st-ink)]">
                {storeMoney(order.total, order.currency)}
              </span>
            </div>
          </div>

          {order.shipping_address && (
            <div
              className="mt-4 rounded-[8px] p-4 text-[13px] text-[var(--st-ink-2)]"
              style={{ background: 'var(--st-surface-2)' }}
            >
              <p className="font-semibold text-[var(--st-ink)]">{order.customer_name}</p>
              <p>
                {[order.shipping_address.line1, order.shipping_address.line2, order.shipping_address.city]
                  .filter(Boolean)
                  .join(', ')}
              </p>
            </div>
          )}
        </section>

        {/* Le dépôt d'avis, tout de suite.

            C'est le seul moment où le client est à la fois attentif et chez
            nous : il vient de payer, la page est ouverte, et rien ne lui est
            demandé d'autre. La relance par courriel viendra pour ceux qui
            passent outre (voir le balayage nocturne), mais elle ne remplace
            pas cet instant — elle le rattrape, moins bien.

            Le jeton est fabriqué ICI, côté serveur : charger cette page
            demande l'UUID de la commande, ce qui est la preuve qu'on cherche.
            Il n'ouvre rien de plus que ce que son porteur tenait déjà. */}
        <ReviewForm
          orderId={order.id}
          token={mintReviewToken(order.id)}
          items={order.items.map((i) => ({
            productId:    i.product_id,
            productName:  i.product_name,
            productImage: i.product_image,
          }))}
          alreadyReviewed={reviewed}
        />
        </>
      ) : (
        // Lien périmé, identifiant tronqué par un client de messagerie : on le
        // dit, sans faire croire qu'il n'y a pas eu de commande.
        <p className="mt-8 text-center text-[14px] text-[var(--st-ink-2)]">
          Le détail de cette commande n'est plus consultable depuis ce lien.
          {view.contactPhone && <> Contactez la boutique au {view.contactPhone}.</>}
        </p>
      )}

      <div className="mt-8 flex justify-center">
        <Link
          href={view.base || '/'}
          className="flex min-h-[48px] items-center justify-center rounded-[var(--st-radius-btn)] px-8 text-[15px] font-semibold transition hover:brightness-95"
          style={{ background: 'var(--st-accent)', color: 'var(--st-accent-ink)' }}
        >
          Continuer mes achats
        </Link>
      </div>
    </div>
  );
}
