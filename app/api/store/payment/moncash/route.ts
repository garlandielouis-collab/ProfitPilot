import { NextRequest, NextResponse } from 'next/server';
import { readGatewayCredentials } from '../../../../../lib/storePaymentGateway';
import { createStoreOrder } from '../../../../actions/store-public';

// ── MonCash API helpers ───────────────────────────────────────────────────────

const MC_PROD = 'https://moncashbutton.digicelgroup.com/Api';
const MC_SAND = 'https://sandbox.moncashbutton.digicelgroup.com/Api';
const MC_REDIR_PROD = 'https://moncashbutton.digicelgroup.com/Moncash-middleware/Payment/Redirect';
const MC_REDIR_SAND = 'https://sandbox.moncashbutton.digicelgroup.com/Moncash-middleware/Payment/Redirect';

async function getMoncashToken(clientId: string, clientSecret: string, sandbox: boolean): Promise<string> {
  const base = sandbox ? MC_SAND : MC_PROD;
  const res = await fetch(`${base}/oauth/token?grant_type=client_credentials`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`MonCash auth failed (${res.status}): ${txt}`);
  }
  const json = await res.json();
  return json.access_token as string;
}

async function createMoncashPayment(
  token: string, sandbox: boolean,
  amount: number, orderId: string,
): Promise<string> {
  const base = sandbox ? MC_SAND : MC_PROD;
  const res = await fetch(`${base}/v1/CreatePayment`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ amount, orderId }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`MonCash create payment failed (${res.status}): ${txt}`);
  }
  const json = await res.json();
  const paymentToken: string = json?.payment_token?.token;
  if (!paymentToken) throw new Error('MonCash: token manquant dans la réponse');
  return paymentToken;
}

// ── POST /api/store/payment/moncash ──────────────────────────────────────────
// Body: { businessId, orderData: CreateOrderInput }
// Returns: { redirectUrl, orderNumber }

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { businessId, orderData } = body as { businessId: string; orderData: any };

    if (!businessId || !orderData) {
      return NextResponse.json({ error: 'Données manquantes' }, { status: 400 });
    }

    // 1. Les identifiants du marchand
    const creds = await readGatewayCredentials(businessId, 'moncash');
    if (!creds) {
      return NextResponse.json({
        error: 'Identifiants MonCash non configurés. Allez dans Boutique → Paiement pour les ajouter.',
      }, { status: 400 });
    }

    const sandbox = creds.sandbox;

    // 2. La commande, avec son total calculé par la base
    //
    // `orderData.total` venait du navigateur : on demandait à la passerelle
    // d'encaisser un montant que l'acheteur pouvait choisir. C'est `total`
    // ci-dessous qui part chez MonCash — celui des prix relus dans le catalogue.
    const { orderId: orderDbId, orderNumber, total } = await createStoreOrder(orderData);

    // 3. Get MonCash OAuth token
    const accessToken = await getMoncashToken(creds.client_id, creds.client_secret, sandbox);

    // 4. Create MonCash payment — orderId = our DB order UUID for verification
    const paymentToken = await createMoncashPayment(accessToken, sandbox, total, orderDbId);

    // 5. Build redirect URL
    // We append orderId so our callback can look up the order without a second MonCash call.
    const appUrl      = process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin;
    const callbackUrl = `${appUrl}/api/store/payment/moncash/callback?orderId=${orderDbId}`;
    const redirectBase = sandbox ? MC_REDIR_SAND : MC_REDIR_PROD;
    // MonCash appends ?transactionId=xxx to whatever returnUrl the merchant configured.
    // The merchant must set returnUrl = callbackUrl in their MonCash merchant dashboard.
    const redirectUrl = `${redirectBase}?token=${paymentToken}`;

    return NextResponse.json({ redirectUrl, orderNumber, orderId: orderDbId, callbackUrl });
  } catch (err: any) {
    console.error('[moncash] initiate error:', err.message);
    return NextResponse.json({ error: err.message ?? 'Erreur paiement MonCash' }, { status: 500 });
  }
}
