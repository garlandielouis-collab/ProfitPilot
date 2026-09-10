// ─────────────────────────────────────────────────────────────────────────────
// GET /api/store/payment/moncash/callback
//
// MonCash renvoie l'acheteur ici après le paiement. On vérifie la transaction
// auprès de MonCash — jamais sur la foi des paramètres d'URL — puis on encaisse.
//
// « Encaisser » veut dire : marquer la commande payée ET la confirmer, ce qui
// crée la vente ProfitPilot, décrémente le stock et écrit le mouvement
// d'inventaire. La version précédente se contentait d'écrire
// `status = 'confirmed'` dans `orders` : la commande payée n'apparaissait ni
// dans les ventes, ni dans les rapports, et le stock ne bougeait pas.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseService } from '../../../../../../lib/supabaseServiceClient';
import {
  readGatewayCredentials,
  settleGatewayOrder,
  storeSlugOf,
} from '../../../../../../lib/storePaymentGateway';

const MC_PROD = 'https://moncashbutton.digicelgroup.com/Api';
const MC_SAND = 'https://sandbox.moncashbutton.digicelgroup.com/Api';

async function getMoncashToken(clientId: string, clientSecret: string, sandbox: boolean) {
  const base = sandbox ? MC_SAND : MC_PROD;
  const res = await fetch(`${base}/oauth/token?grant_type=client_credentials`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  });
  const json = await res.json();
  return json.access_token as string;
}

async function verifyMoncashTransaction(token: string, sandbox: boolean, transactionId: string) {
  const base = sandbox ? MC_SAND : MC_PROD;
  const res = await fetch(`${base}/v1/RetrieveTransactionPaymentById`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ transactionId }),
  });
  if (!res.ok) throw new Error(`MonCash verify failed (${res.status})`);
  return await res.json();
}

export async function GET(req: NextRequest) {
  const svc = getSupabaseService();
  const { searchParams } = req.nextUrl;
  const transactionId = searchParams.get('transactionId');
  // Posé par la route d'initiation sur l'URL de retour : sans lui on ne sait
  // pas de quelle commande — donc de quel marchand — il s'agit, et on ne peut
  // pas récupérer les identifiants pour vérifier.
  const orderDbId = searchParams.get('orderId');

  if (!transactionId) {
    return NextResponse.redirect(new URL('/store?error=missing_transaction', req.url));
  }
  if (!orderDbId) {
    return NextResponse.redirect(new URL('/store?error=missing_order', req.url));
  }

  try {
    const { data: order } = await svc
      .from('orders')
      .select('id, business_id, order_number, payment_status')
      .eq('id', orderDbId)
      .maybeSingle();

    if (!order) {
      return NextResponse.redirect(new URL('/store?error=order_not_found', req.url));
    }

    const slug = await storeSlugOf(order.business_id);

    // Déjà encaissée : on renvoie vers la confirmation sans rappeler MonCash.
    if (order.payment_status === 'paid') {
      return NextResponse.redirect(
        new URL(
          `/store/${slug}/confirmation?id=${order.id}&paid=1`,
          req.url,
        ),
      );
    }

    const creds = await readGatewayCredentials(order.business_id, 'moncash');
    if (!creds) {
      return NextResponse.redirect(new URL('/store?error=no_credentials', req.url));
    }

    const accessToken  = await getMoncashToken(creds.client_id, creds.client_secret, creds.sandbox);
    const verification = await verifyMoncashTransaction(accessToken, creds.sandbox, transactionId);

    // MonCash renvoie : { payment: { reference, transactionId, cost, message, payer }, timestamp, status }
    const payment  = verification?.payment;
    const mcStatus = payment?.message; // 'successful' en cas de succès

    if (mcStatus !== 'successful' && verification?.status !== 200) {
      console.error('[moncash callback] vérification refusée:', verification);
      return NextResponse.redirect(
        new URL(`/store/${slug}/checkout?error=payment_failed`, req.url),
      );
    }

    const settled = await settleGatewayOrder({
      orderId:       order.id,
      gateway:       'moncash',
      transactionId,
    });

    if (!settled.ok) {
      return NextResponse.redirect(new URL('/store?error=order_not_found', req.url));
    }

    return NextResponse.redirect(
      new URL(
        `/store/${settled.slug}/confirmation?id=${settled.orderId}&paid=1`,
        req.url,
      ),
    );
  } catch (err: any) {
    console.error('[moncash callback] error:', err.message);
    return NextResponse.redirect(new URL('/store?error=payment_error', req.url));
  }
}
