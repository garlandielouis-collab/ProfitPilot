import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseService } from '../../../../../../lib/supabaseServiceClient';

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

// ── GET /api/store/payment/moncash/callback ───────────────────────────────────
// Called by MonCash after customer completes payment.
// Query params: transactionId (from MonCash)
// The order UUID is retrieved via MonCash's orderId field.

export async function GET(req: NextRequest) {
  const svc = getSupabaseService();
  const { searchParams } = req.nextUrl;
  const transactionId = searchParams.get('transactionId');

  if (!transactionId) {
    return NextResponse.redirect(new URL('/store?error=missing_transaction', req.url));
  }

  try {
    // 1. We need credentials to verify — but we don't know the business yet.
    //    Strategy: MonCash returns orderId in the verify response, which is our order UUID.
    //    We first try to find a store with MonCash creds to do the verify.
    //    Best approach: call verify with any valid MonCash token from any configured store.
    //    Since orderId = our DB order UUID, we look up the order to get the business.

    // 2. Find any store with MonCash credentials configured to get a token
    //    (We'll use the order's own business credentials once we have the order ID)
    //
    // Problem: we need a token to get the orderId, but need the orderId to get creds.
    // Solution: store the orderId in a pending_payments table, OR use a two-step approach.
    // Pragmatic fix: The caller passes orderId as an extra query param (set in initiate route).
    const orderDbId = searchParams.get('orderId');
    if (!orderDbId) {
      return NextResponse.redirect(new URL('/store?error=missing_order', req.url));
    }

    // 3. Look up the order to get business_id
    const { data: order } = await svc
      .from('orders')
      .select('id, business_id, order_number, total, payment_status')
      .eq('id', orderDbId)
      .maybeSingle();

    if (!order) {
      return NextResponse.redirect(new URL('/store?error=order_not_found', req.url));
    }

    if (order.payment_status === 'paid') {
      // Already processed — idempotent redirect to confirmation
      const slug = await getSlug(svc, order.business_id);
      return NextResponse.redirect(
        new URL(`/store/${slug}/confirmation?order=${order.order_number}&biz=${order.business_id}`, req.url)
      );
    }

    // 4. Get MonCash credentials for this business
    const { data: settings } = await svc
      .from('store_settings')
      .select('payment_credentials, slug')
      .eq('business_id', order.business_id)
      .maybeSingle();

    const creds = (settings?.payment_credentials as any)?.moncash;
    if (!creds?.client_id || !creds?.client_secret) {
      return NextResponse.redirect(new URL('/store?error=no_credentials', req.url));
    }

    const sandbox = creds.sandbox === true;

    // 5. Verify the transaction with MonCash
    const accessToken = await getMoncashToken(creds.client_id, creds.client_secret, sandbox);
    const verification = await verifyMoncashTransaction(accessToken, sandbox, transactionId);

    // MonCash returns: { payment: { reference, transactionId, cost, message, payer }, timestamp, status }
    const payment = verification?.payment;
    const mcStatus = payment?.message; // 'successful' on success

    if (mcStatus !== 'successful' && verification?.status !== 200) {
      console.error('[moncash callback] verification failed:', verification);
      const slug = settings?.slug ?? await getSlug(svc, order.business_id);
      return NextResponse.redirect(
        new URL(`/store/${slug}/checkout?error=payment_failed`, req.url)
      );
    }

    // 6. Mark order as paid
    await svc
      .from('orders')
      .update({
        payment_status:        'paid',
        payment_transaction_id: transactionId,
        payment_gateway:       'moncash',
        status:                'confirmed',
      })
      .eq('id', order.id);

    // 7. Redirect to confirmation
    const slug = settings?.slug ?? await getSlug(svc, order.business_id);
    return NextResponse.redirect(
      new URL(`/store/${slug}/confirmation?order=${order.order_number}&biz=${order.business_id}&paid=1`, req.url)
    );
  } catch (err: any) {
    console.error('[moncash callback] error:', err.message);
    return NextResponse.redirect(new URL('/store?error=payment_error', req.url));
  }
}

async function getSlug(svc: any, businessId: string): Promise<string> {
  const { data } = await svc
    .from('store_settings')
    .select('slug')
    .eq('business_id', businessId)
    .maybeSingle();
  return data?.slug ?? '';
}
