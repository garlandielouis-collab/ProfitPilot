import { NextRequest, NextResponse } from 'next/server';
import {
  checkGatewayCurrency,
  paymentUnavailableResponse,
  prepareGatewayCharge,
  readGatewayCredentials,
} from '../../../../../lib/storePaymentGateway';
import { createStoreOrder } from '../../../../actions/store-public';

// ── NatCash (Natcom Haiti) API helpers ────────────────────────────────────────
// API docs: obtained from Natcom merchant portal after registration.
// Base URL provided per merchant by Natcom.

const NC_PROD = 'https://www.natcash.com/api/v1';
const NC_SAND = 'https://sandbox.natcash.com/api/v1';

async function getNatcashToken(clientId: string, clientSecret: string, sandbox: boolean): Promise<string> {
  const base = sandbox ? NC_SAND : NC_PROD;
  const res = await fetch(`${base}/oauth/token`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ grant_type: 'client_credentials' }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`NatCash auth failed (${res.status}): ${txt}`);
  }
  const json = await res.json();
  return json.access_token as string;
}

async function createNatcashPayment(
  token: string, sandbox: boolean,
  amount: number, orderId: string, returnUrl: string,
): Promise<{ paymentUrl: string }> {
  const base = sandbox ? NC_SAND : NC_PROD;
  const res = await fetch(`${base}/payment/create`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ amount, orderId, returnUrl, currency: 'HTG' }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`NatCash create payment failed (${res.status}): ${txt}`);
  }
  const json = await res.json();
  const paymentUrl: string = json?.paymentUrl ?? json?.redirect_url;
  if (!paymentUrl) throw new Error('NatCash: URL de paiement manquante dans la réponse');
  return { paymentUrl };
}

// ── POST /api/store/payment/natcash ──────────────────────────────────────────

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

    const creds = await readGatewayCredentials(businessId, 'natcash');
    if (!creds) {
      return NextResponse.json({
        error: 'Identifiants NatCash non configurés. Allez dans Boutique → Paiement pour les ajouter.',
      }, { status: 400 });
    }

    const sandbox = creds.sandbox;
    const appUrl  = process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin;

    // La vitrine est-elle facturable en gourdes ? Vérifié AVANT de créer la
    // commande : une boutique en USD sans taux ne doit pas laisser une commande
    // impayable à chaque essai.
    const currencyCheck = await checkGatewayCurrency(businessId);
    if (!currencyCheck.ok) {
      console.error('[natcash] paiement non lancé :', currencyCheck.reason, { businessId });
      return paymentUnavailableResponse();
    }

    // La commande, et son total calculé par la base — pas celui du navigateur.
    const { orderId: orderDbId, orderNumber } = await createStoreOrder(orderData);

    // Le montant en gourdes. La demande part en `currency: 'HTG'` : envoyer le
    // total d'une commande en USD facturait 25 gourdes pour 25 dollars. Une
    // commande en USD part à son équivalent au taux de l'entreprise, figé ici
    // pour que le rappel compare le paiement à ce qui a été demandé.
    const charge = await prepareGatewayCharge({ orderId: orderDbId, gateway: 'natcash' });
    if (!charge.ok) {
      console.error('[natcash] paiement non lancé :', charge.reason, { orderId: orderDbId });
      return paymentUnavailableResponse();
    }

    const returnUrl = `${appUrl}/api/store/payment/natcash/callback?orderId=${orderDbId}`;

    const accessToken = await getNatcashToken(creds.client_id, creds.client_secret, sandbox);
    const { paymentUrl } = await createNatcashPayment(
      accessToken, sandbox, charge.amount, orderDbId, returnUrl,
    );

    return NextResponse.json({ redirectUrl: paymentUrl, orderNumber, orderId: orderDbId });
  } catch (err: any) {
    console.error('[natcash] initiate error:', err.message);
    return NextResponse.json({ error: err.message ?? 'Erreur paiement NatCash' }, { status: 500 });
  }
}
