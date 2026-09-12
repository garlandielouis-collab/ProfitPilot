import { NextRequest, NextResponse } from 'next/server';
import {
  checkGatewayCurrency,
  getMoncashToken,
  moncashApiBase,
  paymentUnavailableResponse,
  prepareGatewayCharge,
  readGatewayCredentials,
} from '../../../../../lib/storePaymentGateway';
import { createStoreOrder } from '../../../../actions/store-public';

// ── MonCash API helpers ───────────────────────────────────────────────────────
// L'URL de l'API et le jeton OAuth vivent dans lib/storePaymentGateway.ts,
// partagés avec le rappel.

const MC_REDIR_PROD = 'https://moncashbutton.digicelgroup.com/Moncash-middleware/Payment/Redirect';
const MC_REDIR_SAND = 'https://sandbox.moncashbutton.digicelgroup.com/Moncash-middleware/Payment/Redirect';

async function createMoncashPayment(
  token: string, sandbox: boolean,
  amount: number, orderId: string,
): Promise<string> {
  const base = moncashApiBase(sandbox);
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

    // Les identifiants de paiement, la devise et la commande doivent désigner la
    // même boutique : sinon l'argent part chez un marchand et la commande chez un
    // autre.
    if (orderData.business_id !== businessId) {
      return NextResponse.json({ error: 'Boutique incohérente' }, { status: 400 });
    }

    // 1. Les identifiants du marchand
    const creds = await readGatewayCredentials(businessId, 'moncash');
    if (!creds) {
      return NextResponse.json({
        error: 'Identifiants MonCash non configurés. Allez dans Boutique → Paiement pour les ajouter.',
      }, { status: 400 });
    }

    const sandbox = creds.sandbox;

    // 2. La vitrine est-elle facturable en gourdes ? Vérifié AVANT de créer la
    // commande : une boutique en USD sans taux ne doit pas laisser une commande
    // impayable à chaque essai.
    const currencyCheck = await checkGatewayCurrency(businessId);
    if (!currencyCheck.ok) {
      console.error('[moncash] paiement non lancé :', currencyCheck.reason, { businessId });
      return paymentUnavailableResponse();
    }

    // 3. La commande, avec son total calculé par la base
    //
    // `orderData.total` venait du navigateur : on demandait à la passerelle
    // d'encaisser un montant que l'acheteur pouvait choisir. Le montant qui part
    // chez MonCash vient des prix relus dans le catalogue.
    const { orderId: orderDbId, orderNumber } = await createStoreOrder(orderData);

    // 4. Le montant en gourdes. MonCash n'encaisse que des gourdes : une
    // commande en USD part à son équivalent au taux de l'entreprise, figé ici
    // pour que le rappel compare le paiement à ce qui a été demandé.
    const charge = await prepareGatewayCharge({ orderId: orderDbId, gateway: 'moncash' });
    if (!charge.ok) {
      console.error('[moncash] paiement non lancé :', charge.reason, { orderId: orderDbId });
      return paymentUnavailableResponse();
    }

    // 5. Get MonCash OAuth token
    const accessToken = await getMoncashToken(creds);

    // 6. Create MonCash payment — orderId = our DB order UUID for verification
    const paymentToken = await createMoncashPayment(accessToken, sandbox, charge.amount, orderDbId);

    // 7. Build redirect URL
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
