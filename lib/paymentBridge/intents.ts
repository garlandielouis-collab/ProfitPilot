// ─────────────────────────────────────────────────────────────────────────────
// Créer une dette, ouvrir une tentative, la montrer à l'acheteur
//
// ── La règle qui gouverne tout ce fichier ──────────────────────────────────
//
// Le navigateur envoie un IDENTIFIANT de commande. Rien d'autre. Ni montant, ni
// destination, ni référence, ni entreprise.
//
// Ce n'est pas de la prudence abstraite : ce dépôt a déjà payé cette leçon deux
// fois. `create_store_order` acceptait `unit_price` depuis le client, et un
// acheteur pouvait fixer son propre prix (20260904). Les routes de passerelle
// passaient `orderData.total` venu du navigateur à MonCash, et un acheteur pouvait
// payer le montant de son choix pour une commande enregistrée à un autre
// (lib/storePaymentGateway.ts). Les deux sont corrigés. La troisième occasion de
// refaire la même erreur, c'est ici.
//
// Tout ce qui décide d'argent est donc relu depuis la base : le total depuis
// `orders`, la devise depuis `orders`, le taux depuis `businesses`, le numéro
// depuis `merchant_payment_methods`.
//
// ── Pourquoi la clé service, et non la session ─────────────────────────────
//
// L'acheteur d'une vitrine n'a pas de compte. Il n'a pas de session, donc pas de
// RLS possible : `getBusinessContext()` lèverait « Non authentifié ». C'est déjà
// le choix fait par `app/actions/store-public.ts` pour la création de commande, et
// pour la même raison.
//
// Ce que ce choix impose en échange : chaque fonction publique de ce fichier
// vérifie elle-même le cloisonnement, et ne rend que des projections choisies. Un
// `select('*')` renvoyé tel quel à un acheteur exposerait le numéro de tous les
// moyens de paiement du marchand et l'identité de ses autres clients.
// ─────────────────────────────────────────────────────────────────────────────

import { getSupabaseService } from '../supabaseServiceClient';
import { htgChargeFor } from '../storePaymentGateway';
import { logSafe } from './mask';
import { money, notifyMerchant } from './notifications';
import {
  SESSION_MINUTES,
  isReconcilable,
  type BridgeMethod,
  type IntentStatus,
  type PaymentEventType,
} from './types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Une erreur dont le message est écrit pour l'acheteur ou le marchand. */
export class BridgeError extends Error {
  constructor(message: string) {
    super(message);
    // Reconnue par `lib/actionResult.ts` grâce à son nom, pas à son type : Next
    // perd l'identité des classes entre le serveur et le client.
    this.name = 'UserFacingError';
  }
}

// ─── Le journal ──────────────────────────────────────────────────────────────

/**
 * Une ligne dans `payment_events`.
 *
 * Ne lève jamais. Un journal qui fait échouer l'action qu'il journalise est pire
 * que pas de journal : il transforme une trace manquante en paiement perdu. Même
 * choix que `logActivity` et `notify`, pour la même raison.
 */
export async function logPaymentEvent(input: {
  businessId: string;
  intentId?:  string | null;
  receiptId?: string | null;
  eventType:  PaymentEventType;
  actorType:  'customer' | 'merchant' | 'system' | 'device' | 'admin';
  actorId?:   string | null;
  actorLabel?: string | null;
  metadata?:  Record<string, unknown>;
}): Promise<void> {
  try {
    await getSupabaseService().from('payment_events').insert({
      business_id: input.businessId,
      intent_id:   input.intentId ?? null,
      receipt_id:  input.receiptId ?? null,
      event_type:  input.eventType,
      actor_type:  input.actorType,
      actor_id:    input.actorId ?? null,
      actor_label: input.actorLabel ?? null,
      metadata:    input.metadata ?? {},
    });
  } catch (err) {
    console.error('[payment-bridge] événement non journalisé', logSafe({
      businessId: input.businessId,
      intentId:   input.intentId,
      reason:     (err as Error).message,
    }));
  }
}

// ─── Les destinations ────────────────────────────────────────────────────────

export type Destination = {
  id:           string;
  method:       BridgeMethod;
  provider:     string | null;
  destination:  string | null;
  displayLabel: string | null;
  instructions: string | null;
};

/**
 * Où l'argent doit aller, pour ce commerce et ce moyen.
 *
 * Le moyen par DÉFAUT du marchand passe devant, puis la plus ancienne — jamais
 * « une au hasard ». Sans tri, `limit(1)` rend une ligne différente d'un appel à
 * l'autre, et deux acheteurs de la même boutique verraient deux numéros
 * différents à la même minute. C'est exactement le défaut que `getBusinessContext`
 * a corrigé sur la résolution d'entreprise.
 */
export async function resolveDestination(
  businessId: string,
  method: BridgeMethod,
): Promise<Destination | null> {
  const { data, error } = await getSupabaseService()
    .from('merchant_payment_methods')
    .select('id, method, provider, destination, display_label, instructions')
    .eq('business_id', businessId)
    .eq('method', method)
    .eq('is_enabled', true)
    .is('deleted_at', null)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(1);

  if (error) throw new Error(`destination illisible : ${error.message}`);

  const row = (data ?? [])[0] as any;
  if (!row) return null;

  return {
    id:           row.id,
    method:       row.method,
    provider:     row.provider ?? null,
    destination:  row.destination ?? null,
    displayLabel: row.display_label ?? null,
    instructions: row.instructions ?? null,
  };
}

/**
 * Les moyens qu'un commerce peut réellement encaisser en direct.
 *
 * À demander AVANT de proposer le choix à l'acheteur. La leçon vient de
 * `checkGatewayCurrency` : une vérification faite après la création de la commande
 * laisse une commande impayable à chaque essai.
 */
export async function bridgeMethodsFor(businessId: string): Promise<BridgeMethod[]> {
  const { data, error } = await getSupabaseService()
    .from('merchant_payment_methods')
    .select('method')
    .eq('business_id', businessId)
    .eq('is_enabled', true)
    .is('deleted_at', null);

  if (error) throw new Error(`moyens de paiement illisibles : ${error.message}`);

  const out: BridgeMethod[] = [];
  for (const r of (data ?? []) as Array<{ method: BridgeMethod }>) {
    if (!out.includes(r.method)) out.push(r.method);
  }
  return out;
}

// ─── Créer la dette ─────────────────────────────────────────────────────────

export type CreatedIntent = {
  intentId:       string;
  reference:      string;
  /** Ce que l'acheteur doit transférer, dans la devise réellement encaissée. */
  chargeAmount:   number;
  chargeCurrency: 'HTG' | 'USD';
  /** Le total de la commande, dans SA devise. Affiché à côté quand elles diffèrent. */
  amount:         number;
  currency:       'HTG' | 'USD';
  destination:    Destination;
  sessionId:      string;
  expiresAt:      string;
};

/**
 * La dette d'une commande boutique, et sa première tentative.
 *
 * Idempotente par commande ET par moyen : rappelée sur la même commande, elle
 * rouvre une session sur la dette EXISTANTE au lieu d'en créer une seconde. Sans
 * cela, un acheteur qui recharge sa page de paiement trois fois donnerait trois
 * dettes de 4 500 G au marchand — et le rapprochement aurait trois candidates
 * identiques pour un seul versement, c'est-à-dire l'ambiguïté qu'on cherche
 * justement à éviter (§12).
 */
export async function createIntentForOrder(params: {
  orderId: string;
  method:  BridgeMethod;
}): Promise<CreatedIntent> {
  if (!UUID_RE.test(params.orderId)) throw new BridgeError('Commande introuvable.');

  const svc = getSupabaseService();

  // ── 1. La commande, telle que la base l'a enregistrée ────────────────────
  const { data: order, error: orderErr } = await svc
    .from('orders')
    .select('id, business_id, order_number, total, currency, customer_id, payment_status, status')
    .eq('id', params.orderId)
    .maybeSingle();

  if (orderErr) throw new Error(`commande illisible : ${orderErr.message}`);
  if (!order) throw new BridgeError('Commande introuvable.');

  const o = order as any;

  if (o.payment_status === 'paid') {
    throw new BridgeError('Cette commande est déjà payée.');
  }
  if (o.status === 'cancelled' || o.status === 'refunded') {
    throw new BridgeError("Cette commande a été annulée : elle ne peut plus être payée.");
  }

  // ── 2. Où l'argent va ───────────────────────────────────────────────────
  const destination = await resolveDestination(o.business_id, params.method);
  if (!destination) {
    // Le message s'adresse à l'ACHETEUR : il ne peut rien faire du fait que le
    // marchand n'a pas rempli un formulaire, mais il peut appeler la boutique.
    throw new BridgeError(
      "Cette boutique n'a pas encore indiqué son numéro pour ce moyen de paiement. Contactez-la pour régler votre commande.",
    );
  }
  if (isReconcilable(params.method) && !destination.destination) {
    throw new BridgeError(
      "Le numéro de paiement de cette boutique est incomplet. Contactez-la pour régler votre commande.",
    );
  }

  // ── 3. Combien, et dans quelle devise ───────────────────────────────────
  //
  // MonCash et NatCash n'encaissent que des gourdes. `htgChargeFor` est celle qui
  // sert déjà à la passerelle : un seul endroit décide « combien de gourdes cette
  // commande doit rapporter », et le taux appliqué est FIGÉ ici.
  const charge = await computeCharge(o.total, o.currency, o.business_id, params.method);

  // ── 4. La dette — ou celle qui existe déjà ──────────────────────────────
  const existing = await findReusableIntent(o.id, params.method);

  let intentId: string;
  let reference: string;

  if (existing) {
    intentId  = existing.id;
    reference = existing.reference;

    // Le montant a pu changer entre deux tentatives : un coupon appliqué, une
    // ligne retirée. On réaligne la dette sur la commande — tant que rien n'a
    // encore été reçu. Après un versement, le montant ne bouge plus : le client a
    // payé une somme annoncée, et la changer sous lui serait malhonnête.
    if (Number(existing.amount_received) === 0
        && (Number(existing.charge_amount) !== charge.chargeAmount
            || Number(existing.amount) !== Number(o.total))) {
      const { error } = await svc
        .from('payment_intents')
        .update({
          amount:          Number(o.total),
          currency:        charge.currency,
          charge_amount:   charge.chargeAmount,
          charge_currency: charge.chargeCurrency,
          exchange_rate:   charge.exchangeRate,
          destination_method_id: destination.id,
          destination_snapshot:  destination.destination,
        })
        .eq('id', intentId)
        .eq('amount_received', 0);
      if (error) throw new Error(`montant non réaligné : ${error.message}`);
    }
  } else {
    // `reference` est omise : le DEFAULT de la colonne la tire
    // (`pp_payment_reference()`), et la retire à chaque tentative. Huit essais
    // avant d'abandonner — avec 31^6 possibilités, le second tour est déjà rare.
    let created: any = null;
    let lastErr: unknown = null;

    for (let attempt = 0; attempt < 8 && !created; attempt += 1) {
      const { data, error } = await svc
        .from('payment_intents')
        .insert({
          business_id:     o.business_id,
          kind:            'merchant_payment',
          order_id:        o.id,
          customer_id:     o.customer_id ?? null,
          amount:          Number(o.total),
          currency:        charge.currency,
          charge_amount:   charge.chargeAmount,
          charge_currency: charge.chargeCurrency,
          exchange_rate:   charge.exchangeRate,
          method:          params.method,
          provider:        destination.provider ?? params.method,
          destination_method_id: destination.id,
          destination_snapshot:  destination.destination,
          metadata: { order_number: o.order_number },
        })
        .select('id, reference')
        .single();

      if (!error) { created = data; break; }
      // 23505 = violation d'unicité. La seule que l'on rejoue : c'est la
      // collision de référence. Tout le reste est une vraie panne.
      if (error.code !== '23505') { lastErr = error; break; }
      lastErr = error;
    }

    if (!created) {
      throw new Error(`paiement non créé : ${(lastErr as any)?.message ?? 'inconnu'}`);
    }

    intentId  = created.id;
    reference = created.reference;

    await logPaymentEvent({
      businessId: o.business_id,
      intentId,
      eventType:  'payment_created',
      actorType:  'customer',
      metadata: {
        order_number:  o.order_number,
        method:        params.method,
        charge_amount: charge.chargeAmount,
      },
    });
  }

  // ── 5. La tentative ─────────────────────────────────────────────────────
  const session = await openSession(intentId);

  return {
    intentId,
    reference,
    chargeAmount:   charge.chargeAmount,
    chargeCurrency: charge.chargeCurrency,
    amount:         Number(o.total),
    currency:       charge.currency,
    destination,
    sessionId:      session.sessionId,
    expiresAt:      session.expiresAt,
  };
}

/**
 * La dette réutilisable pour cette commande et ce moyen, s'il y en a une.
 *
 * Volontairement restreinte aux dettes SANS parent : une dette complémentaire
 * (le reste d'un versement partiel) ne doit pas être reprise comme si elle était
 * la dette principale — son montant n'est pas celui de la commande.
 */
async function findReusableIntent(orderId: string, method: BridgeMethod) {
  const { data, error } = await getSupabaseService()
    .from('payment_intents')
    .select('id, reference, amount, charge_amount, amount_received, status')
    .eq('order_id', orderId)
    .eq('method', method)
    .is('parent_intent_id', null)
    .in('status', ['created', 'awaiting_payment', 'expired'] satisfies IntentStatus[])
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) throw new Error(`paiement existant illisible : ${error.message}`);
  return ((data ?? [])[0] as any) ?? null;
}

type Charge = {
  amount:         number;
  currency:       'HTG' | 'USD';
  chargeAmount:   number;
  chargeCurrency: 'HTG' | 'USD';
  exchangeRate:   number | null;
};

/**
 * Le montant à demander, et sa devise.
 *
 * Pour un moyen mobile, toujours des gourdes — via `htgChargeFor`, la même
 * fonction que la passerelle, arrondi compris. Pour les autres (espèces, paiement
 * à la livraison), la devise de la commande : rien n'est converti puisque rien
 * n'est encaissé par un opérateur.
 */
async function computeCharge(
  total: unknown,
  currency: string | null,
  businessId: string,
  method: BridgeMethod,
): Promise<Charge> {
  const code: 'HTG' | 'USD' =
    String(currency ?? 'HTG').toUpperCase() === 'USD' ? 'USD' : 'HTG';
  const amount = Number(total);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new BridgeError("Le montant de cette commande est illisible : contactez la boutique.");
  }

  if (!isReconcilable(method)) {
    return { amount, currency: code, chargeAmount: amount, chargeCurrency: code, exchangeRate: null };
  }

  let rate: number | null = null;
  if (code === 'USD') {
    const { data, error } = await getSupabaseService()
      .from('businesses')
      .select('exchange_rate')
      .eq('id', businessId)
      .maybeSingle();
    if (error) throw new Error(`taux de change illisible : ${error.message}`);
    rate = (data as any)?.exchange_rate ?? null;
  }

  const charge = htgChargeFor(amount, code, rate);
  if (!charge.ok) {
    // Le même refus que la passerelle, et pour la même raison : mieux vaut ne pas
    // lancer le paiement que facturer 25 gourdes une commande de 25 dollars. Le
    // détail va au journal, pas à l'acheteur — il ne peut rien en faire.
    console.error('[payment-bridge] dette non créée', logSafe({
      businessId, amount, reason: charge.reason,
    }));
    throw new BridgeError(
      "Le paiement en ligne n'est pas disponible pour le moment dans cette boutique.",
    );
  }

  return {
    amount,
    currency:       code,
    chargeAmount:   charge.amount,
    chargeCurrency: 'HTG',
    exchangeRate:   charge.exchangeRate,
  };
}

/**
 * Ouvrir une tentative sur une dette.
 *
 * Passe par `pp_open_payment_session` : fermer l'ancienne session et ouvrir la
 * nouvelle doit être atomique, sinon deux rechargements simultanés laissent deux
 * sessions ouvertes — et l'index unique partiel refuse la seconde, ce qui ferait
 * échouer un rechargement de page sur un conflit.
 */
export async function openSession(
  intentId: string,
  minutes = SESSION_MINUTES,
): Promise<{ sessionId: string; expiresAt: string }> {
  const { data, error } = await getSupabaseService()
    .rpc('pp_open_payment_session', { p_intent_id: intentId, p_minutes: minutes });

  if (error) throw new BridgeError(error.message);

  const row = (Array.isArray(data) ? data[0] : data) as any;
  if (!row?.out_session_id) throw new Error('session de paiement non ouverte');

  return { sessionId: row.out_session_id, expiresAt: row.out_expires_at };
}

// ─── Ce que l'acheteur a le droit de voir ───────────────────────────────────

/**
 * La dette telle qu'elle s'affiche sur la page de paiement publique.
 *
 * Adressée par l'UUID de la dette, et non par sa référence. La référence fait
 * 31^6 ≈ 887 millions de combinaisons : assez pour ne pas collisionner, très loin
 * d'être assez pour protéger une page. Un UUID v4, lui, ne s'énumère pas — c'est
 * exactement le raisonnement qui a fait passer la page de confirmation des
 * numéros de commande séquentiels à l'identifiant (voir son en-tête).
 *
 * La projection est CHOISIE champ par champ. Un `select('*')` renvoyé ici aurait
 * exposé `confirmed_by`, `metadata` et l'identifiant du client.
 */
export type PublicIntent = {
  id:              string;
  /** Pour que l'appelant vérifie que la dette est bien celle de la vitrine visitée. */
  businessId:      string;
  reference:       string;
  status:          IntentStatus;
  method:          BridgeMethod;
  amount:          number;
  currency:        string;
  chargeAmount:    number;
  chargeCurrency:  string;
  amountReceived:  number;
  remaining:       number;
  /** Le numéro du marchand, LISIBLE : l'acheteur doit le recopier. */
  destination:     string | null;
  destinationLabel: string | null;
  instructions:    string | null;
  orderNumber:     string | null;
  /** Pour renvoyer vers la page de confirmation, qui est adressée par lui. */
  orderId:         string | null;
  /** `null` quand aucune session n'est ouverte : l'écran propose d'en rouvrir une. */
  expiresAt:       string | null;
  /** Le client a-t-il déjà signalé son paiement ? Évite de le lui redemander. */
  reported:        boolean;
};

export async function getPublicIntent(intentId: string): Promise<PublicIntent | null> {
  if (!UUID_RE.test(intentId)) return null;

  const svc = getSupabaseService();

  const { data, error } = await svc
    .from('payment_intents')
    .select(
      'id, business_id, reference, status, method, amount, currency, charge_amount, charge_currency, '
      + 'amount_received, destination_snapshot, metadata, order_id, '
      + 'merchant_payment_methods(display_label, instructions), '
      + 'payment_sessions(expires_at, status), '
      + 'payment_evidence(id)',
    )
    .eq('id', intentId)
    .maybeSingle();

  // Une base injoignable n'est PAS une dette inexistante. Confondre les deux
  // affichait « Ce paiement est introuvable » à un client qui venait de payer,
  // pendant une simple coupure réseau vers Supabase — et un client qui lit
  // « introuvable » après avoir payé repaie, ou appelle en colère.
  if (error) {
    console.error('[payment-bridge] dette illisible', logSafe({ intentId, reason: error.message }));
    throw new BridgeError(
      "La connexion est momentanément impossible. Votre paiement n'est pas perdu : réessayez dans un instant.",
    );
  }
  if (!data) return null;
  const r = data as any;

  const sessions = (r.payment_sessions ?? []) as Array<{ expires_at: string; status: string }>;
  // Une session « ouverte » dont l'heure est passée est traitée comme close. Le
  // cron qui les ferme en base passe une fois par jour : sans ce filtre, un
  // acheteur revenu une heure plus tard verrait un compte à rebours négatif.
  const now  = Date.now();
  const open = sessions.find((s) => s.status === 'open' && Date.parse(s.expires_at) > now) ?? null;

  const dest = Array.isArray(r.merchant_payment_methods)
    ? r.merchant_payment_methods[0]
    : r.merchant_payment_methods;

  const chargeAmount = Number(r.charge_amount ?? 0);
  const received     = Number(r.amount_received ?? 0);

  return {
    id:               r.id,
    businessId:       r.business_id,
    reference:        r.reference,
    status:           r.status,
    method:           r.method,
    amount:           Number(r.amount ?? 0),
    currency:         r.currency ?? 'HTG',
    chargeAmount,
    chargeCurrency:   r.charge_currency ?? 'HTG',
    amountReceived:   received,
    remaining:        Math.max(chargeAmount - received, 0),
    destination:      r.destination_snapshot ?? null,
    destinationLabel: dest?.display_label ?? null,
    instructions:     dest?.instructions ?? null,
    orderNumber:      r.metadata?.order_number ?? null,
    orderId:          r.order_id ?? null,
    expiresAt:        open?.expires_at ?? null,
    reported:         (r.payment_evidence ?? []).length > 0,
  };
}

// ─── « J'ai effectué le paiement » ──────────────────────────────────────────

/**
 * Le client déclare avoir payé.
 *
 * Ce que cela FAIT : une ligne dans `payment_evidence`, la dette passe en
 * `customer_reported`, le marchand est prévenu, le journal garde la trace.
 *
 * Ce que cela NE FAIT PAS : régler la commande. Une déclaration n'est pas un
 * encaissement — c'est toute la raison pour laquelle `payment_evidence` et
 * `payment_receipts` sont deux tables. Une capture d'écran se fabrique en deux
 * minutes, et le §57 l'interdit explicitement comme vérité.
 *
 * Ce qu'elle apporte de réellement utile : `declared_reference`. Quand le client
 * recopie son numéro de transaction, le rapprochement peut lever une ambiguïté
 * que le montant seul laissait entière — et c'est ce qui fait passer une
 * confirmation de « impossible » à « automatique » (voir matching.ts, le test
 * « la référence déclarée par le client lève l'ambiguïté »).
 */
export async function reportPayment(params: {
  intentId:           string;
  declaredAmount?:    number | null;
  declaredReference?: string | null;
  declaredSender?:    string | null;
  declaredPaidAt?:    string | null;
  comment?:           string | null;
}): Promise<{ status: IntentStatus }> {
  if (!UUID_RE.test(params.intentId)) throw new BridgeError('Paiement introuvable.');

  const svc = getSupabaseService();

  const { data: intent, error } = await svc
    .from('payment_intents')
    .select('id, business_id, status, charge_amount, charge_currency, reference, order_id')
    .eq('id', params.intentId)
    .maybeSingle();

  if (error) throw new Error(`paiement illisible : ${error.message}`);
  if (!intent) throw new BridgeError('Paiement introuvable.');

  const i = intent as any;

  if (i.status === 'confirmed') {
    // Pas une erreur : le client a signalé après que le rapprochement a confirmé.
    // Lui dire « erreur » là où tout va bien serait le pousser à repayer.
    return { status: 'confirmed' };
  }
  if (i.status === 'cancelled') {
    throw new BridgeError('Cette commande a été annulée.');
  }

  // Un plafond. La route est publique et chaque déclaration réveille le
  // marchand : sans limite, un seul visiteur pourrait remplir sa cloche de
  // « paiement signalé » en boucle. Cinq couvre les vrais cas — un client qui
  // corrige sa référence, qui renvoie après un échec réseau.
  const { count } = await svc
    .from('payment_evidence')
    .select('id', { count: 'exact', head: true })
    .eq('intent_id', params.intentId);

  if ((count ?? 0) >= MAX_DECLARATIONS) {
    throw new BridgeError(
      'Votre paiement a déjà été signalé à la boutique. Elle va le vérifier : inutile de le signaler à nouveau.',
    );
  }

  const { data: session } = await svc
    .from('payment_sessions')
    .select('id')
    .eq('intent_id', params.intentId)
    .eq('status', 'open')
    .maybeSingle();

  // Les champs déclarés sont BORNÉS avant d'entrer en base : ils viennent d'un
  // formulaire public, et rien n'empêche d'y coller cent kilo-octets.
  const { error: evErr } = await svc.from('payment_evidence').insert({
    business_id:        i.business_id,
    intent_id:          params.intentId,
    session_id:         (session as any)?.id ?? null,
    source:             'customer',
    declared_amount:    normalizeDeclaredAmount(params.declaredAmount),
    declared_currency:  i.charge_currency,
    declared_reference: clip(params.declaredReference, 64),
    declared_sender:    clip(params.declaredSender, 32),
    declared_paid_at:   normalizeDeclaredDate(params.declaredPaidAt),
    comment:            clip(params.comment, 500),
  });

  if (evErr) throw new Error(`déclaration non enregistrée : ${evErr.message}`);

  // `.in('status', …)` plutôt qu'un `.eq('id', …)` nu : c'est le verrou optimiste.
  // Si le rapprochement a confirmé la dette entre la lecture ci-dessus et ici,
  // aucune ligne ne correspond et la confirmation n'est pas écrasée par un
  // « signalé ».
  const { data: moved } = await svc
    .from('payment_intents')
    .update({ status: 'customer_reported' })
    .eq('id', params.intentId)
    .in('status', ['created', 'awaiting_payment', 'expired'] satisfies IntentStatus[])
    .select('status')
    .maybeSingle();

  await logPaymentEvent({
    businessId: i.business_id,
    intentId:   params.intentId,
    eventType:  'payment_reported',
    actorType:  'customer',
    metadata: {
      // Le montant et la référence déclarés vont au journal : ce sont eux que le
      // marchand relira. Le commentaire libre, non — il peut contenir n'importe
      // quoi, y compris ce que le client n'aurait pas dû écrire.
      declared_amount:    normalizeDeclaredAmount(params.declaredAmount),
      declared_reference: clip(params.declaredReference, 64),
      had_reference:      !!clip(params.declaredReference, 64),
    },
  });

  // Le marchand est prévenu, et la phrase le dit sans ambiguïté : SIGNALÉ, pas
  // reçu. « Paiement reçu » ici lui ferait livrer sur la foi d'une déclaration.
  const declared = normalizeDeclaredAmount(params.declaredAmount);
  const order    = await orderNumberOf(i.order_id);
  await notifyMerchant({
    businessId: i.business_id,
    event:      'payment_reported',
    title:      'Paiement signalé par un client',
    body: `${order ? `Commande ${order}` : i.reference} — le client dit avoir payé `
      + `${money(declared ?? Number(i.charge_amount), i.charge_currency)}. `
      + 'Vérifiez sur votre téléphone avant de confirmer.',
    intentId: params.intentId,
  });

  return { status: ((moved as any)?.status as IntentStatus) ?? (i.status as IntentStatus) };
}

const MAX_DECLARATIONS = 5;

async function orderNumberOf(orderId: string | null): Promise<string | null> {
  if (!orderId) return null;
  const { data } = await getSupabaseService()
    .from('orders')
    .select('order_number')
    .eq('id', orderId)
    .maybeSingle();
  return (data as any)?.order_number ?? null;
}

function clip(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s === '' ? null : s.slice(0, max);
}

function normalizeDeclaredAmount(v: unknown): number | null {
  const n = Number(v);
  // Un montant déclaré absurde n'est pas conservé : il n'apporte rien et la
  // contrainte CHECK (> 0) ferait échouer toute la déclaration.
  if (!Number.isFinite(n) || n <= 0 || n > 1e9) return null;
  return Math.round(n * 100) / 100;
}

function normalizeDeclaredDate(v: unknown): string | null {
  if (typeof v !== 'string' || v.trim() === '') return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  // Une date dans le futur est une erreur de saisie ou de fuseau. On ne la refuse
  // pas — on ne garde pas une information fausse, c'est tout.
  if (d.getTime() > Date.now() + 86_400_000) return null;
  return d.toISOString();
}
