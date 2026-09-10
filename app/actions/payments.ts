'use server';

// ─────────────────────────────────────────────────────────────────────────────
// La caisse — un devis, puis un encaissement
//
// ── Pourquoi le montant ne vient plus du navigateur ────────────────────────
//
// `createPendingPayment()` recevait `amountHtg` du client. Tant que le prix
// était celui de la page de tarifs, c'était une négligence sans conséquence
// visible. Avec les bons de réduction du parrainage, ça devient une faille :
// n'importe qui pouvait annoncer qu'il payait 400 gourdes pour Elit, et
// l'e-mail d'approbation aurait affiché ce chiffre à l'exploitant.
//
// Le montant se recalcule donc ICI, à partir du tarif du registre et des bons
// réellement détenus par le compte connecté. Le devis affiché en caisse
// (`getCheckoutQuote`) et le montant inscrit sur le paiement sortent de la même
// fonction : l'écran ne peut pas promettre un prix que la base ignore.
//
// ── Et les bons, alors ? ───────────────────────────────────────────────────
//
// Ils sont RETENUS ici, pas consommés. Un paiement MonCash reste en attente
// jusqu'à ce qu'un humain le constate ; brûler un bon à l'enregistrement, c'est
// le perdre pour un virement qui n'arrivera jamais. Le décompte se fait à
// l'approbation, dans `/api/admin/approve`.
// ─────────────────────────────────────────────────────────────────────────────

import { getSupabaseServer } from '../../lib/supabaseServerClient';
import { sendPaymentNotification } from '../../lib/sendEmail';
import { getPlanByKey, normalizePlanKey } from '../../lib/plans';
import {
  discountedPrice,
  selectCredits,
  type CheckoutQuote,
  type UpgradeCredit,
} from '../../lib/referral';

export type PaymentMethod = 'moncash' | 'natcash' | 'visa';
export type PaymentStatus = 'pending' | 'approved' | 'rejected';

export type CreatePaymentInput = {
  planKey: string;
  method: PaymentMethod;
  userId: string;
  userEmail?: string;
  userName?: string;
  /**
   * Le montant tel que l'écran l'a affiché. Conservé pour la compatibilité de
   * la signature, mais IGNORÉ : c'est le serveur qui décide de ce qui est dû.
   */
  amountHtg?: number;
  reference: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Le devis
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ce que le marchand paiera réellement pour une offre, ce mois-ci.
 *
 * Rend `null` si l'offre n'existe pas. Sans session, ou tant que la migration
 * des bons n'est pas jouée, rend le plein tarif : la caisse doit fonctionner
 * même quand le parrainage n'est pas là.
 */
export async function getCheckoutQuote(rawPlanKey: string): Promise<CheckoutQuote | null> {
  const planKey = normalizePlanKey(rawPlanKey);
  const plan    = planKey ? getPlanByKey(planKey) : undefined;
  if (!planKey || !plan) return null;

  const full: CheckoutQuote = {
    planKey,
    baseHtg: plan.priceG,
    percentOff: 0,
    amountHtg: plan.priceG,
    applied: [],
  };

  try {
    const supabase = await getSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return full;

    const { data, error } = await supabase
      .from('upgrade_credits')
      .select('id, target_plan_key, percent_off, months_total, months_used, expires_at, source')
      .eq('user_id', user.id)
      .gt('expires_at', new Date().toISOString());

    if (error) return full;

    const credits = ((data ?? []) as Array<{
      id: string;
      target_plan_key: string | null;
      percent_off: number;
      months_total: number;
      months_used: number;
      expires_at: string;
      source: string;
    }>).map<UpgradeCredit>((c) => ({
      id: c.id,
      targetPlanKey: c.target_plan_key,
      percentOff: c.percent_off,
      monthsTotal: c.months_total,
      monthsUsed: c.months_used,
      expiresAt: c.expires_at,
      source: c.source,
    }));

    const { percentOff, applied } = selectCredits(credits, planKey);

    return {
      planKey,
      baseHtg: plan.priceG,
      percentOff,
      amountHtg: discountedPrice(plan.priceG, percentOff),
      applied,
    };
  } catch {
    return full;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// L'encaissement
// ─────────────────────────────────────────────────────────────────────────────

export async function createPendingPayment(input: CreatePaymentInput): Promise<{
  id: string;
  reference: string;
  status: PaymentStatus;
  amountHtg: number;
  discountPercent: number;
}> {
  const supabase = await getSupabaseServer();

  const quote = await getCheckoutQuote(input.planKey);
  if (!quote) throw new Error('Offre inconnue.');

  // L'identité vient de la session quand il y en a une. Le `userId` transmis
  // par l'écran ne sert plus que de repli pour les parcours sans session.
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id ?? input.userId;

  const core = {
    user_id:        userId,
    plan_key:       input.planKey,
    payment_method: input.method,
    amount_htg:     quote.amountHtg,
    status:         'pending',
    reference:      input.reference,
  };

  let { data, error } = await supabase
    .from('payments')
    .insert({
      ...core,
      base_amount_htg:  quote.baseHtg,
      discount_percent: quote.percentOff,
      // Retenus, pas consommés : un paiement refusé ne doit pas brûler un bon.
      credit_ids:       quote.applied.map((c) => c.id),
    })
    .select('id, reference, status')
    .single();

  // 42703 = colonne inconnue, c'est-à-dire migration des bons non jouée. On
  // encaisse quand même : une caisse fermée coûte infiniment plus cher qu'un
  // paiement enregistré sans son détail de remise. (Et sans les colonnes, il
  // n'y a de toute façon aucun bon à retenir : `quote` est au plein tarif.)
  if (error?.code === '42703') {
    ({ data, error } = await supabase
      .from('payments')
      .insert(core)
      .select('id, reference, status')
      .single());
  }

  if (error) throw new Error(error.message);

  // ── Send email notification (non-blocking, never fails the payment) ──
  try {
    const userEmail  = user?.email ?? input.userEmail ?? userId;
    const userName   = input.userName  ?? userEmail.split('@')[0];
    const adminSecret = process.env.ADMIN_APPROVAL_SECRET;
    const appUrl      = process.env.NEXT_PUBLIC_APP_URL
      ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : undefined)
      ?? 'http://localhost:3000';
    const approveUrl  = adminSecret
      ? `${appUrl}/api/admin/approve?ref=${encodeURIComponent(input.reference)}&token=${adminSecret}`
      : undefined;

    await sendPaymentNotification({
      userEmail,
      userName,
      planKey:    input.planKey,
      reference:  input.reference,
      method:     input.method,
      // Le montant réellement attendu sur le compte MonCash : c'est celui-là
      // qu'un humain va comparer au virement reçu, pas le tarif catalogue.
      amountHtg:  quote.amountHtg,
      approveUrl,
    });
  } catch (emailErr) {
    console.error('[ProfitPilot] Failed to send payment notification (non-fatal):', emailErr);
  }

  const row = data as { id: string; reference: string; status: PaymentStatus };
  return { ...row, amountHtg: quote.amountHtg, discountPercent: quote.percentOff };
}

export async function getActiveSubscription(userId: string) {
  const supabase = await getSupabaseServer();

  const { data, error } = await supabase
    .from('subscriptions')
    .select('id, plan_key, status, expires_at, created_at')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}
