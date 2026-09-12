// ─────────────────────────────────────────────────────────────────────────────
// Passerelles de paiement — ce que MonCash et NatCash partagent
//
// Les deux routes faisaient la même chose de deux façons légèrement
// différentes, et les deux avaient les mêmes trois défauts :
//
//   Elles lisaient les identifiants dans `store_settings.payment_credentials`.
//   Cette colonne a été déplacée dans `store_payment_credentials`, une table
//   que seule la clé service peut lire — la précédente était visible de tout
//   compte connecté (cf. 20260904_commerce_integrity.sql).
//
//   Elles passaient `orderData.total` — un nombre venu du navigateur — au
//   fournisseur. Un acheteur pouvait donc payer le montant de son choix pour
//   une commande enregistrée à un autre. Le total qui part à la passerelle est
//   maintenant celui que la base a calculé.
//
//   Au retour, elles écrivaient `status = 'confirmed'` directement dans la
//   table. Aucune vente ProfitPilot n'était créée, aucun stock décrémenté : une
//   commande payée par MonCash n'existait pour le reste de l'application que
//   comme une ligne dans `orders`. Le règlement passe désormais par
//   `confirm_store_order`, la même transaction que la confirmation manuelle.
// ─────────────────────────────────────────────────────────────────────────────

import { after, NextResponse } from 'next/server';
import { getSupabaseService } from './supabaseServiceClient';
import { notify } from './notify';

export type GatewayName = 'moncash' | 'natcash';

export type GatewayCredentials = {
  client_id:     string;
  client_secret: string;
  sandbox:       boolean;
};

/**
 * Les identifiants du marchand pour une passerelle, ou `null` s'il ne les a pas
 * configurés. Lecture par clé service uniquement — cette table n'a aucune
 * politique RLS, donc aucun autre rôle ne peut la lire.
 */
export async function readGatewayCredentials(
  businessId: string,
  gateway: GatewayName,
): Promise<GatewayCredentials | null> {
  const svc = getSupabaseService();
  const { data } = await svc
    .from('store_payment_credentials')
    .select('credentials')
    .eq('business_id', businessId)
    .maybeSingle();

  const creds = (data as any)?.credentials?.[gateway];
  if (!creds?.client_id || !creds?.client_secret) return null;

  return {
    client_id:     String(creds.client_id),
    client_secret: String(creds.client_secret),
    sandbox:       creds.sandbox === true,
  };
}

/** Le slug de la vitrine d'une entreprise — pour construire les redirections. */
export async function storeSlugOf(businessId: string): Promise<string> {
  const svc = getSupabaseService();
  const { data } = await svc
    .from('store_settings')
    .select('slug')
    .eq('business_id', businessId)
    .maybeSingle();
  return (data as any)?.slug ?? '';
}

// ─── MonCash : l'API et son jeton ────────────────────────────────────────────
//
// Le lancement et le rappel avaient chacun leur copie de `getMoncashToken`.
// Celle du rappel ne regardait ni le statut HTTP ni la présence du jeton : un
// refus d'authentification partait vérifier la transaction avec
// `Bearer undefined`, et le journal disait « verify failed (401) », loin de la
// cause.

const MONCASH_API_PROD    = 'https://moncashbutton.digicelgroup.com/Api';
const MONCASH_API_SANDBOX = 'https://sandbox.moncashbutton.digicelgroup.com/Api';

/** La racine de l'API MonCash — production ou bac à sable. */
export function moncashApiBase(sandbox: boolean): string {
  return sandbox ? MONCASH_API_SANDBOX : MONCASH_API_PROD;
}

/**
 * Un jeton OAuth MonCash pour les identifiants du marchand. Lève si MonCash ne
 * répond pas OK ou ne renvoie pas de jeton.
 */
export async function getMoncashToken(creds: GatewayCredentials): Promise<string> {
  const res = await fetch(`${moncashApiBase(creds.sandbox)}/oauth/token?grant_type=client_credentials`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${creds.client_id}:${creds.client_secret}`).toString('base64'),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`MonCash auth failed (${res.status}): ${txt.slice(0, 300)}`);
  }
  const json = await res.json().catch(() => null);
  const token = json?.access_token;
  if (typeof token !== 'string' || token === '') {
    throw new Error('MonCash auth: jeton absent de la réponse');
  }
  return token;
}

// ─── Le montant demandé à la passerelle ──────────────────────────────────────
//
// MonCash et NatCash encaissent des gourdes. `orders.total`, lui, est exprimé
// dans `orders.currency` — la devise de la vitrine, recopiée par
// `create_store_order`. Les deux routes de lancement envoyaient ce nombre tel
// quel : une commande de 25 USD était facturée 25 gourdes, et le rappel, qui
// comparait le montant payé à ce même total, l'acceptait.
//
// Une commande en USD est désormais facturée son équivalent en gourdes au taux
// de l'entreprise (`businesses.exchange_rate`, 1 USD = X HTG). Ce montant est
// FIGÉ au lancement dans `payment_transactions` ; le rappel compare le montant
// payé à cette ligne, plus au total. Un seul endroit dit « combien de gourdes
// cette commande doit rapporter ».

export type GatewayCharge =
  | { ok: true;  amount: number; orderCurrency: 'HTG' | 'USD'; exchangeRate: number | null }
  | { ok: false; reason: string };

/**
 * Le montant en gourdes à demander pour un total exprimé dans `currency`.
 *
 * Arrondi EXPLICITE pour l'USD : au centime d'abord (en virgule flottante,
 * 1,1 × 100 donne 110,00000000000001), puis à la gourde SUPÉRIEURE. Le
 * marchand ne reçoit jamais moins que son prix en dollars — l'acheteur paie au
 * plus une gourde de plus —, et un montant entier ne dépend pas de la façon
 * dont chaque passerelle traite les centimes. Un total en gourdes part tel que
 * la base l'a calculé, comme avant.
 *
 * Un taux ≤ 1 est refusé : `exchange_rate` vaut 1 par défaut, c'est-à-dire
 * « jamais renseigné », et un dollar ne vaut jamais une gourde. Mieux vaut ne
 * pas lancer le paiement que facturer 25 gourdes une commande de 25 dollars.
 */
export function htgChargeFor(
  total: number | string | null,
  currency: string | null,
  exchangeRate: number | string | null,
): GatewayCharge {
  const amount = Number(total);
  if (total == null || !Number.isFinite(amount)) {
    return { ok: false, reason: `total illisible « ${total ?? '(absent)'} »` };
  }

  const code = String(currency ?? '').trim().toUpperCase() || 'HTG';
  if (code === 'HTG') {
    return { ok: true, amount, orderCurrency: 'HTG', exchangeRate: null };
  }
  if (code !== 'USD') {
    return { ok: false, reason: `devise « ${currency} » non facturable en gourdes` };
  }

  const rate = Number(exchangeRate);
  if (exchangeRate == null || !Number.isFinite(rate) || rate <= 1) {
    return { ok: false, reason: `taux USD→HTG absent ou invalide « ${exchangeRate ?? '(absent)'} »` };
  }

  const cents = Math.round(amount * rate * 100) / 100;
  return { ok: true, amount: Math.ceil(cents), orderCurrency: 'USD', exchangeRate: rate };
}

/**
 * `businesses.exchange_rate` quand la devise est l'USD, `null` sinon — une
 * commande en gourdes ne dépend d'aucun taux. Une erreur de lecture lève.
 */
async function exchangeRateFor(
  currency: string | null,
  businessId: string,
): Promise<number | string | null> {
  if (String(currency ?? '').trim().toUpperCase() !== 'USD') return null;

  const svc = getSupabaseService();
  const { data, error } = await svc
    .from('businesses')
    .select('exchange_rate')
    .eq('id', businessId)
    .maybeSingle();
  if (error) throw new Error(`taux de change illisible : ${error.message}`);
  return (data as any)?.exchange_rate ?? null;
}

/**
 * La vitrine peut-elle être payée par passerelle ? À demander AVANT de créer
 * la commande : une boutique en USD sans taux utilisable laisserait, à chaque
 * essai de l'acheteur, une commande `pending` que personne ne paiera.
 *
 * Lit la devise là où `create_store_order` la prend (`store_settings.currency`
 * de la vitrine active). Sans vitrine active, on laisse la création de commande
 * le dire à l'acheteur, avec son propre message. Le montant, lui, est calculé
 * depuis la commande créée (`prepareGatewayCharge`).
 */
export async function checkGatewayCurrency(
  businessId: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const svc = getSupabaseService();
  const { data, error } = await svc
    .from('store_settings')
    .select('currency')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .limit(1);
  if (error) throw new Error(`devise de la vitrine illisible : ${error.message}`);

  const store = (data ?? [])[0] as { currency?: string | null } | undefined;
  if (!store) return { ok: true };

  const currency = store.currency ?? null;
  const probe = htgChargeFor(1, currency, await exchangeRateFor(currency, businessId));
  return probe.ok ? { ok: true } : probe;
}

/**
 * Le montant à demander à la passerelle pour une commande qui vient d'être
 * créée — calculé depuis ce que la base a enregistré (total ET devise), puis
 * figé dans `payment_transactions`.
 *
 * La ligne est une tentative `pending`, sans identifiant de transaction (la
 * passerelle ne l'a pas encore donné) ; `raw` garde le total d'origine, sa
 * devise et le taux appliqué. C'est elle que le rappel relit : un taux modifié
 * par le marchand pendant que l'acheteur paie ne change pas le montant attendu.
 *
 * Commande en USD dont le montant n'a pas pu être figé : refus. Le rappel
 * devrait sinon recalculer au taux du moment, et pourrait refuser un paiement
 * légitime. En gourdes rien ne dépend d'un taux : l'échec est journalisé et le
 * paiement part.
 */
export async function prepareGatewayCharge(params: {
  orderId: string;
  gateway: GatewayName;
}): Promise<GatewayCharge> {
  const svc = getSupabaseService();
  const { data: order, error } = await svc
    .from('orders')
    .select('id, business_id, total, currency')
    .eq('id', params.orderId)
    .maybeSingle();
  if (error) throw new Error(`[${params.gateway}] commande illisible : ${error.message}`);
  if (!order) return { ok: false, reason: 'commande introuvable' };

  const charge = htgChargeFor(
    order.total,
    order.currency,
    await exchangeRateFor(order.currency, order.business_id),
  );
  if (!charge.ok) return charge;

  const { error: freezeError } = await svc.from('payment_transactions').insert({
    business_id: order.business_id,
    order_id:    order.id,
    gateway:     params.gateway,
    amount:      charge.amount,
    currency:    'HTG',
    status:      'pending',
    raw: {
      stage:          'initiation',
      order_total:    Number(order.total),
      order_currency: charge.orderCurrency,
      exchange_rate:  charge.exchangeRate,
      rounding:       charge.orderCurrency === 'USD' ? 'cent_then_ceil_htg' : null,
    },
  });

  if (freezeError) {
    if (charge.orderCurrency === 'USD') {
      return { ok: false, reason: `montant HTG non figé : ${freezeError.message}` };
    }
    console.error(`[${params.gateway}] tentative de paiement non enregistrée`, {
      orderId: order.id,
      error:   freezeError.message,
    });
  }

  return charge;
}

/** La tentative ouverte au lancement par `prepareGatewayCharge`. */
type GatewayAttempt = {
  id:       string;
  amount:   number | string | null;
  currency: string | null;
  status:   string;
  raw:      Record<string, unknown> | null;
};

/**
 * La tentative de lancement la plus récente pour cette commande et cette
 * passerelle — `null` si la commande n'en a pas (lancée avant qu'on les
 * enregistre). Une erreur de lecture lève.
 */
async function latestInitiationAttempt(
  orderId: string,
  gateway: GatewayName,
): Promise<GatewayAttempt | null> {
  const { data, error } = await getSupabaseService()
    .from('payment_transactions')
    .select('id, amount, currency, status, raw')
    .eq('order_id', orderId)
    .eq('gateway', gateway)
    .eq('raw->>stage', 'initiation')
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw new Error(`[${gateway}] tentative de paiement illisible : ${error.message}`);
  return ((data ?? [])[0] as GatewayAttempt | undefined) ?? null;
}

export type ExpectedAmount =
  | { ok: true;  amount: number; source: 'frozen' | 'recomputed' }
  | { ok: false; reason: string };

/**
 * Les gourdes que le paiement de cette commande doit couvrir, pour le rappel.
 *
 * Le montant figé au lancement (`prepareGatewayCharge`) quand il existe. À
 * défaut — commande lancée avant que ce montant soit figé, ou commande en
 * gourdes dont la tentative n'a pas été enregistrée — recalculé comme au
 * lancement. LIMITE de ce repli pour une commande en USD : il prend le taux
 * COURANT de l'entreprise. Si le marchand l'a modifié entre le lancement et le
 * rappel, un paiement légitime peut être refusé (taux monté) ou un paiement
 * plus faible accepté (taux baissé, dans la limite de l'écart).
 *
 * Une erreur de lecture lève : ne pas savoir n'est pas une autorisation.
 */
export async function expectedGatewayAmount(params: {
  order:   { id: string; business_id: string; total: number | string | null; currency: string | null };
  gateway: GatewayName;
}): Promise<ExpectedAmount> {
  const frozen = await latestInitiationAttempt(params.order.id, params.gateway);
  const frozenAmount = Number(frozen?.amount);
  if (
    frozen
    && frozen.amount != null
    && Number.isFinite(frozenAmount)
    && String(frozen.currency ?? '').toUpperCase() === 'HTG'
  ) {
    return { ok: true, amount: frozenAmount, source: 'frozen' };
  }

  const charge = htgChargeFor(
    params.order.total,
    params.order.currency,
    await exchangeRateFor(params.order.currency, params.order.business_id),
  );
  return charge.ok ? { ok: true, amount: charge.amount, source: 'recomputed' } : charge;
}

/**
 * Pourquoi le montant payé ne couvre pas les gourdes attendues — ou `null`.
 * Le centime de tolérance absorbe l'arrondi d'un nombre passé en JSON ; un
 * montant absent ou illisible vaut refus.
 */
export function amountShortfall(paid: unknown, expectedHtg: number): string | null {
  const value = Number(paid);
  if (paid == null || paid === '' || !Number.isFinite(value)) {
    return `montant payé absent ou illisible « ${String(paid ?? '(absent)')} »`;
  }
  if (!Number.isFinite(expectedHtg) || value + 0.01 < expectedHtg) {
    return `montant payé ${value} HTG < ${expectedHtg} HTG attendus`;
  }
  return null;
}

/**
 * Réponse d'une route de lancement quand la commande ne peut pas être facturée
 * en gourdes. Le `code` est celui des retours de passerelle : la page de
 * commande affiche le même message, sans recharger — panier et formulaire
 * restent remplis.
 */
export function paymentUnavailableResponse(): NextResponse {
  return NextResponse.json(
    {
      error: "Le paiement en ligne n'est pas disponible pour le moment dans cette boutique.",
      code:  'payment_unavailable',
    },
    { status: 409 },
  );
}

// ─── L'alerte au marchand ────────────────────────────────────────────────────

export type StoreOrderEvent = 'placed' | 'paid';

/**
 * Prévient le propriétaire qu'une commande en ligne l'attend.
 *
 * Personne ne le faisait : une commande passée sur la vitrine n'existait pour
 * le marchand que s'il pensait à ouvrir /boutique/commandes. Vit ici plutôt
 * que dans `app/actions/store-public.ts` parce que ce fichier-là est
 * `'use server'` : exportée de là, elle deviendrait un point d'entrée public
 * par lequel n'importe qui pourrait spammer la cloche d'un marchand.
 *
 * Un seul moment par commande :
 *   'placed'  paiement à la livraison — la commande est ferme dès sa création ;
 *   'paid'    MonCash / NatCash — au règlement vérifié, PAS à la création. Une
 *             commande créée puis abandonnée chez la passerelle n'est pas une
 *             commande ; l'annoncer ferait préparer un colis que personne n'a payé.
 *
 * Planifiée avec `after()` : elle part après la réponse, ne rallonge pas le
 * tunnel d'achat et ne peut pas le faire échouer. `notify` avale déjà ses
 * erreurs ; le `catch` d'ici couvre la lecture de la commande, et le repli
 * `void` un appel hors requête, où `after` lève.
 *
 * Type `generic`, sans préférence : `sale_created` est gouverné par `new_sale`,
 * désactivée par défaut — l'alerte ne serait arrivée chez presque personne. Et
 * on n'invente pas de type (`notifications.type` a pu devenir une énum).
 */
export function queueStoreOrderNotification(orderId: string, event: StoreOrderEvent): void {
  const send = () => sendStoreOrderNotification(orderId, event);
  try {
    after(send);
  } catch {
    void send();
  }
}

async function sendStoreOrderNotification(orderId: string, event: StoreOrderEvent): Promise<void> {
  try {
    const svc = getSupabaseService();
    const { data: order } = await svc
      .from('orders')
      .select('id, business_id, order_number, customer_name, total, currency')
      .eq('id', orderId)
      .maybeSingle();

    if (!order) return;

    const total    = Number(order.total ?? 0);
    const currency = (order.currency as string | null) ?? 'HTG';

    await notify({
      companyId: order.business_id as string,
      type:      'generic',
      title:     event === 'paid'
        ? `Commande payée en ligne — ${order.order_number}`
        : `Nouvelle commande en ligne — ${order.order_number}`,
      body:      `${order.customer_name ?? 'Client'} · ${total.toLocaleString('fr-FR')} ${currency}`,
      entity:    'order',
      // `notifications.reference_id` est un UUID : l'identifiant, pas le numéro.
      entityId:  order.id as string,
      data: {
        href:     '/boutique/commandes',
        order:    order.order_number,
        total,
        currency,
        event,
      },
    });
  } catch {
    // Jamais au détriment de la commande.
  }
}

/**
 * Vrai si cette transaction a déjà réglé une AUTRE commande de la passerelle.
 *
 * Le rappel reçoit l'identifiant de transaction dans l'URL : rien n'empêche
 * de rejouer celui d'un achat réussi avec l'identifiant d'une autre commande.
 * La vérification auprès du fournisseur doit déjà le refuser (la référence ne
 * correspond pas) ; ce contrôle-ci ne dépend que de notre base, et tient même
 * si le fournisseur ne renvoie pas la référence qu'on attend.
 *
 * Une erreur de lecture lève : ne pas savoir n'est pas une autorisation.
 */
export async function transactionSettledElsewhere(params: {
  gateway:       GatewayName;
  transactionId: string;
  orderId:       string;
}): Promise<boolean> {
  const svc = getSupabaseService();
  const { data, error } = await svc
    .from('orders')
    .select('id')
    .eq('payment_gateway', params.gateway)
    .eq('payment_transaction_id', params.transactionId)
    .neq('id', params.orderId)
    .limit(1);

  if (error) {
    throw new Error(`[${params.gateway}] lecture des transactions impossible : ${error.message}`);
  }
  return (data ?? []).length > 0;
}

// ─── Le suivi des tentatives : payment_transactions ─────────────────────────
//
// `prepareGatewayCharge` ouvre une tentative `pending`. Personne ne la fermait :
// un paiement encaissé comme un paiement refusé restait `pending` pour
// toujours, sans identifiant de transaction ni réponse du fournisseur.
//
// Transitions écrites ici, toujours conditionnelles au statut LU (verrou
// optimiste — `raw` est fusionné côté code, PostgREST ne sait pas faire
// `raw || …`) :
//   pending → failed      refus au rappel (payment_failed / payment_unverified)
//   pending → succeeded   paiement vérifié et encaissé
//   failed  → succeeded   refus suivi d'un paiement vérifié pour la même
//                         commande : l'argent est arrivé, le refus reste lisible
//                         dans `raw.failure`
// Jamais succeeded → failed ; `refunded` n'est jamais touché. `stage`,
// `order_total`, `exchange_rate`… restent en place : `expectedGatewayAmount`
// relit la ligne par `raw->>stage`.
//
// Rien ici ne lève : le suivi ne doit ni empêcher l'encaissement, ni priver
// l'acheteur de sa redirection. Une commande lancée avant ce suivi n'a pas de
// tentative ; on n'en invente pas après coup, on le journalise.

type AttemptOutcome =
  | { status: 'succeeded'; transactionId: string; providerResponse?: unknown }
  | {
      status:            'failed';
      code:              'payment_failed' | 'payment_unverified';
      reason:            string;
      transactionId:     string;
      providerResponse?: unknown;
    };

/** `latestInitiationAttempt` qui ne lève pas : absence et erreur sont journalisées. */
async function readAttemptQuietly(orderId: string, gateway: GatewayName): Promise<GatewayAttempt | null> {
  try {
    const attempt = await latestInitiationAttempt(orderId, gateway);
    if (!attempt) {
      console.warn(`[${gateway}] suivi de paiement : aucune tentative enregistrée (commande lancée avant le suivi ?)`, { orderId });
    }
    return attempt;
  } catch (err) {
    console.error(`[${gateway}] suivi de paiement : tentative illisible`, { orderId, error: (err as Error).message });
    return null;
  }
}

async function recordAttemptOutcome(
  attempt: GatewayAttempt,
  gateway: GatewayName,
  outcome: AttemptOutcome,
): Promise<void> {
  const log = {
    attemptId:     attempt.id,
    from:          attempt.status,
    to:            outcome.status,
    transactionId: outcome.transactionId,
  };

  const allowedFrom = outcome.status === 'succeeded' ? ['pending', 'failed'] : ['pending'];
  if (!allowedFrom.includes(attempt.status)) {
    // Même issue déjà écrite (rappel rejoué) : rien à dire. Sinon on garde
    // l'état existant — jamais succeeded → failed — et on le note.
    if (attempt.status !== outcome.status) {
      console.warn(`[${gateway}] suivi de paiement : transition ignorée`, log);
    }
    return;
  }

  try {
    const svc = getSupabaseService();
    const raw = attempt.raw && typeof attempt.raw === 'object' && !Array.isArray(attempt.raw)
      ? attempt.raw
      : {};
    const at = new Date().toISOString();

    const write = (fields: Record<string, unknown>) =>
      svc
        .from('payment_transactions')
        .update(fields)
        .eq('id', attempt.id)
        .eq('status', attempt.status)
        .select('id');

    if (outcome.status === 'failed') {
      const { data, error } = await write({
        status: 'failed',
        raw: {
          ...raw,
          failure: {
            at,
            code:                    outcome.code,
            reason:                  outcome.reason,
            // L'identifiant reçu dans l'URL n'est pas vérifié : il reste dans
            // `raw`, hors de la colonne unique, où un rejeu pourrait occuper la
            // place de la transaction légitime.
            received_transaction_id: outcome.transactionId,
            provider_response:       outcome.providerResponse ?? null,
          },
        },
      });
      if (error) throw new Error(error.message);
      if ((data ?? []).length === 0) {
        console.warn(`[${gateway}] suivi de paiement : tentative modifiée entre-temps, rien écrit`, log);
      }
      return;
    }

    const settlement = {
      at,
      transaction_id:    outcome.transactionId,
      provider_response: outcome.providerResponse ?? null,
    };

    let { data, error } = await write({
      status:         'succeeded',
      transaction_id: outcome.transactionId,
      raw:            { ...raw, settlement },
    });

    // (gateway, transaction_id) est unique : une AUTRE ligne porte déjà cette
    // transaction. Le paiement a été vérifié pour CETTE commande : la tentative
    // passe quand même `succeeded`, sans la colonne, conflit noté dans `raw`.
    if (error?.code === '23505') {
      console.error(`[${gateway}] suivi de paiement : transaction déjà portée par une autre ligne`, log);
      ({ data, error } = await write({
        status: 'succeeded',
        raw:    { ...raw, settlement: { ...settlement, transaction_id_conflict: true } },
      }));
    }

    if (error) throw new Error(error.message);
    if ((data ?? []).length === 0) {
      console.warn(`[${gateway}] suivi de paiement : tentative modifiée entre-temps, rien écrit`, log);
    }
  } catch (err) {
    console.error(`[${gateway}] suivi de paiement non écrit`, { ...log, error: (err as Error).message });
  }
}

/**
 * Ferme la tentative de paiement de la commande sur un refus du rappel
 * (`payment_failed` / `payment_unverified`). Ne lève jamais.
 *
 * Pas pour `payment_unavailable` ni `payment_error` : ce ne sont pas des refus
 * du paiement — l'acheteur a peut-être payé, et un rappel suivant l'encaissera.
 */
export async function recordGatewayRefusal(params: {
  orderId:           string;
  gateway:           GatewayName;
  code:              'payment_failed' | 'payment_unverified';
  reason:            string;
  transactionId:     string;
  providerResponse?: unknown;
}): Promise<void> {
  const attempt = await readAttemptQuietly(params.orderId, params.gateway);
  if (!attempt) return;
  await recordAttemptOutcome(attempt, params.gateway, {
    status:           'failed',
    code:             params.code,
    reason:           params.reason,
    transactionId:    params.transactionId,
    providerResponse: params.providerResponse,
  });
}

/**
 * Aligne le taux de la vente sur celui FIGÉ au lancement.
 *
 * `confirm_store_order` écrit `sales.exchange_rate` au taux COURANT de
 * l'entreprise. Si le marchand l'a changé pendant que l'acheteur payait, la
 * vente d'une commande en USD porterait un autre taux que celui auquel les
 * gourdes ont été encaissées. La fonction ne passe aucune écriture comptable, et
 * ni `sale_items` ni `inventory_movements` ne portent de taux : la vente est la
 * seule ligne à reprendre.
 *
 * Ne lève jamais : un taux non aligné se corrige, un encaissement bloqué non.
 */
async function alignSaleExchangeRate(params: {
  saleId:     string;
  businessId: string;
  orderId:    string;
  gateway:    GatewayName;
  attempt:    GatewayAttempt;
}): Promise<void> {
  const raw = params.attempt.raw;
  if (!raw || String(raw.order_currency ?? '').toUpperCase() !== 'USD') return;

  const log = { orderId: params.orderId, saleId: params.saleId, frozenRate: raw.exchange_rate };
  const frozen = Number(raw.exchange_rate);
  if (raw.exchange_rate == null || !Number.isFinite(frozen) || frozen <= 1) {
    console.error(`[${params.gateway}] taux figé illisible : vente laissée au taux courant`, log);
    return;
  }

  try {
    const { data, error } = await getSupabaseService()
      .from('sales')
      .update({ exchange_rate: frozen })
      .eq('id', params.saleId)
      .eq('business_id', params.businessId)
      .eq('currency', 'USD')
      .select('id');
    if (error) throw new Error(error.message);
    if ((data ?? []).length === 0) {
      console.warn(`[${params.gateway}] taux figé non appliqué : vente introuvable ou pas en USD`, log);
    }
  } catch (err) {
    console.error(`[${params.gateway}] taux figé non appliqué à la vente`, { ...log, error: (err as Error).message });
  }
}

export type SettlementOutcome =
  | { ok: true;  slug: string; orderId: string; orderNumber: string; businessId: string }
  | { ok: false; slug: string; reason: string };

/**
 * Encaisse un paiement vérifié : marque la commande payée, puis la confirme.
 *
 * Idempotente de bout en bout — `confirm_store_order` retourne la vente
 * existante quand la commande en a déjà une. Un fournisseur qui rappelle deux
 * fois ne crée pas deux ventes et ne décrémente pas deux fois le stock.
 *
 * Si la confirmation échoue (stock devenu insuffisant entre la commande et le
 * paiement), le paiement reste enregistré et la commande reste `pending` : le
 * marchand la voit dans sa liste avec l'argent reçu, et tranche lui-même. Perdre
 * la trace d'un paiement encaissé serait pire que laisser une commande en
 * attente.
 *
 * Ferme aussi la tentative `payment_transactions` (`succeeded`, identifiant et
 * réponse vérifiée du fournisseur) et, au premier règlement d'une commande en
 * USD, recale la vente créée sur le taux figé au lancement. Ni l'un ni l'autre
 * ne peut faire échouer l'encaissement.
 */
export async function settleGatewayOrder(params: {
  orderId:       string;
  gateway:       GatewayName;
  transactionId: string;
  /** La réponse de vérification du fournisseur, gardée dans `payment_transactions.raw`. */
  providerResponse?: unknown;
}): Promise<SettlementOutcome> {
  const svc = getSupabaseService();

  const { data: order } = await svc
    .from('orders')
    .select('id, business_id, order_number, payment_status, payment_transaction_id, sale_id')
    .eq('id', params.orderId)
    .maybeSingle();

  if (!order) return { ok: false, slug: '', reason: 'order_not_found' };

  const slug = await storeSlugOf(order.business_id);

  // Conditionnelle : seule une commande pas encore payée passe à « paid ». Deux
  // rappels simultanés lisent tous deux `unpaid` ; un seul modifie la ligne, et
  // la transaction enregistrée n'est jamais écrasée par la seconde. C'est ce
  // résultat — pas le statut lu plus haut — qui dit si le règlement est le
  // premier. (`payment_status` est NOT NULL : le `neq` n'écarte pas de NULL.)
  const { data: marked, error: markError } = await svc
    .from('orders')
    .update({
      payment_status:         'paid',
      payment_transaction_id: params.transactionId,
      payment_gateway:        params.gateway,
    })
    .eq('id', order.id)
    .neq('payment_status', 'paid')
    .select('id');

  if (markError) {
    throw new Error(`[${params.gateway}] commande non marquée payée : ${markError.message}`);
  }

  const firstSettlement = (marked ?? []).length > 0;

  const otherTransaction = Boolean(
    !firstSettlement
    && order.payment_transaction_id
    && order.payment_transaction_id !== params.transactionId,
  );

  if (otherTransaction) {
    // Commande déjà réglée par une autre transaction : peut-être un double
    // paiement de l'acheteur. On n'écrase rien ; le journal garde la trace.
    console.error(`[${params.gateway}] commande déjà réglée par une autre transaction`, {
      orderId:  order.id,
      order:    order.order_number,
      recorded: order.payment_transaction_id,
      received: params.transactionId,
    });
  }

  // La tentative : fermée en `succeeded`, et relue pour son taux figé. Pas pour
  // un double paiement — elle appartient à la transaction qui a réglé la
  // commande. Ne lève jamais.
  const attempt = otherTransaction ? null : await readAttemptQuietly(order.id, params.gateway);
  if (attempt) {
    await recordAttemptOutcome(attempt, params.gateway, {
      status:           'succeeded',
      transactionId:    params.transactionId,
      providerResponse: params.providerResponse,
    });
  }

  let saleId: string | null = null;
  try {
    const { data: confirmedSaleId } = await svc
      .rpc('confirm_store_order', { p_order_id: order.id })
      .throwOnError();
    saleId = typeof confirmedSaleId === 'string' ? confirmedSaleId : null;
    await svc.from('orders').update({ status: 'confirmed' }).eq('id', order.id);
  } catch (err) {
    console.error(
      `[${params.gateway}] paiement encaissé mais commande non confirmée`,
      { orderId: order.id, order: order.order_number, error: (err as Error).message },
    );
    // Le paiement est enregistré ; la commande attend le marchand.
  }

  // Le taux figé, au PREMIER règlement et pour la seule vente que CE règlement
  // vient de créer : une vente préexistante (commande confirmée à la main avant
  // le paiement) garde le taux auquel elle a été enregistrée.
  if (firstSettlement && !order.sale_id && saleId && attempt) {
    await alignSaleExchangeRate({
      saleId,
      businessId: order.business_id as string,
      orderId:    order.id as string,
      gateway:    params.gateway,
      attempt,
    });
  }

  // Au PREMIER règlement seulement : un fournisseur qui rappelle deux fois ne
  // doit pas annoncer deux commandes au marchand.
  if (firstSettlement) {
    queueStoreOrderNotification(order.id as string, 'paid');
  }

  return {
    ok: true,
    slug,
    orderId:     order.id as string,
    orderNumber: order.order_number as string,
    businessId:  order.business_id as string,
  };
}
