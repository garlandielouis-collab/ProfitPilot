import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseService } from '../../../../../../lib/supabaseServiceClient';

const NC_PROD = 'https://www.natcash.com/api/v1';
const NC_SAND = 'https://sandbox.natcash.com/api/v1';

async function getNatcashToken(clientId: string, clientSecret: string, sandbox: boolean) {
  const base = sandbox ? NC_SAND : NC_PROD;
  const res = await fetch(`${base}/oauth/token`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ grant_type: 'client_credentials' }),
  });
  const json = await res.json();
  return json.access_token as string;
}

async function verifyNatcashPayment(token: string, sandbox: boolean, transactionId: string) {
  const base = sandbox ? NC_SAND : NC_PROD;
  const res = await fetch(`${base}/payment/verify`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ transactionId }),
  });
  if (!res.ok) throw new Error(`NatCash verify failed (${res.status})`);
  return await res.json();
}

// ── GET /api/store/payment/natcash/callback ───────────────────────────────────

export async function GET(req: NextRequest) {
  const svc = getSupabaseService();
  const { searchParams } = req.nextUrl;
  const transactionId = searchParams.get('transactionId');
  const orderDbId     = searchParams.get('orderId');

  if (!transactionId || !orderDbId) {
    return NextResponse.redirect(new URL('/store?error=missing_params', req.url));
  }

  try {
    const { data: order } = await svc
      .from('orders')
      .select('id, business_id, order_number, total, payment_status')
      .eq('id', orderDbId)
      .maybeSingle();

    if (!order) return NextResponse.redirect(new URL('/store?error=order_not_found', req.url));

    if (order.payment_status === 'paid') {
      const slug = await getSlug(svc, order.business_id);
      return NextResponse.redirect(
        new URL(`/store/${slug}/confirmation?order=${order.order_number}&biz=${order.business_id}`, req.url)
      );
    }

    const { data: settings } = await svc
      .from('store_settings')
      .select('payment_credentials, slug')
      .eq('business_id', order.business_id)
      .maybeSingle();

    const creds = (settings?.payment_credentials as any)?.natcash;
    if (!creds?.client_id || !creds?.client_secret) {
      return NextResponse.redirect(new URL('/store?error=no_credentials', req.url));
    }

    const sandbox     = creds.sandbox === true;
    const accessToken = await getNatcashToken(creds.client_id, creds.client_secret, sandbox);
    const result      = await verifyNatcashPayment(accessToken, sandbox, transactionId);

    const success = result?.status === 'success' || result?.message === 'successful';
    if (!success) {
      const slug = settings?.slug ?? await getSlug(svc, order.business_id);
      return NextResponse.redirect(new URL(`/store/${slug}/checkout?error=payment_failed`, req.url));
    }

    await svc
      .from('orders')
      .update({
        payment_status:         'paid',
        payment_transaction_id: transactionId,
        payment_gateway:        'natcash',
        status:                 'confirmed',
      })
      .eq('id', order.id);

    const slug = settings?.slug ?? await getSlug(svc, order.business_id);
    return NextResponse.redirect(
      new URL(`/store/${slug}/confirmation?order=${order.order_number}&biz=${order.business_id}&paid=1`, req.url)
    );
  } catch (err: any) {
    console.error('[natcash callback] error:', err.message);
    return NextResponse.redirect(new URL('/store?error=payment_error', req.url));
  }
}

async function getSlug(svc: any, businessId: string): Promise<string> {
  const { data } = await svc.from('store_settings').select('slug').eq('business_id', businessId).maybeSingle();
  return data?.slug ?? '';
}
