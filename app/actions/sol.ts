'use server';

// ─────────────────────────────────────────────────────────────────────────────
// Sòl ak sabotaj (F17 de l'étude de marché inversée)
//
// « 55 % épargnent de façon informelle » (§4) : le sòl fait partie de la
// trésorerie. Une cotisation sort de la caisse — elle compte dans la caisse
// attendue — mais elle ne réduit pas le profit : c'est de l'épargne, et elle
// revient le jour de la main. Le bilan du soir prévient la veille d'une
// cotisation (lib/eveningReport.ts, `solTomorrow`).
// ─────────────────────────────────────────────────────────────────────────────

import { revalidatePath } from 'next/cache';
import { getBusinessContext } from '../../lib/serverAuth';
import { attempt, UserFacingError, type ActionResult } from '../../lib/actionResult';
import { assertFeature } from '../../lib/entitlements';
import { localDay, nextDay, solDueOn } from '../../lib/eveningReport';

export type SolFrequency = 'daily' | 'weekly' | 'monthly';

export type SolGroupView = {
  id: string;
  kind: 'sol' | 'sabotaj';
  name: string;
  contribution: number;
  frequency: SolFrequency;
  hands: number | null;
  startDate: string;
  payoutDate: string | null;
  payoutAmount: number | null;
  /** Versé depuis le début, et reçu (la main). */
  paidIn: number;
  received: number;
  /** La prochaine cotisation, dans les 40 jours. */
  nextDue: string | null;
  paidToday: boolean;
};

const missingTable = (error: any) => error && ['42P01', 'PGRST205'].includes(error.code);
const NOT_READY = 'Le sòl n’est pas encore ouvert sur ce compte (mise à jour en attente).';

export async function listSol(): Promise<ActionResult<SolGroupView[]>> {
  return attempt(async () => {
    await assertFeature('sol');
    const ctx = await getBusinessContext();
    const [{ data: groups, error }, { data: payments }, { data: biz }] = await Promise.all([
      ctx.supabase.from('sol_groups').select('*').eq('business_id', ctx.businessId).eq('is_active', true).order('created_at'),
      ctx.supabase.from('sol_payments').select('sol_id, amount, direction, paid_on').eq('business_id', ctx.businessId),
      ctx.supabase.from('businesses').select('timezone').eq('id', ctx.businessId).maybeSingle(),
    ]);
    if (missingTable(error)) return [];
    if (error) throw error;

    const today = localDay(new Date(), biz?.timezone || 'America/Port-au-Prince');
    return (groups ?? []).map((g: any) => {
      const mine = (payments ?? []).filter((p: any) => p.sol_id === g.id);
      const group = { name: g.name, contribution: Number(g.contribution), frequency: g.frequency, startDate: g.start_date, payoutDate: g.payout_date };
      let next: string | null = null;
      let day = today;
      for (let i = 0; i < 40 && !next; i++) {
        if (solDueOn(group, day)) next = day;
        day = nextDay(day);
      }
      return {
        id: g.id,
        kind: g.kind,
        name: g.name,
        contribution: Number(g.contribution),
        frequency: g.frequency,
        hands: g.hands,
        startDate: g.start_date,
        payoutDate: g.payout_date,
        payoutAmount: g.payout_amount === null ? null : Number(g.payout_amount),
        paidIn: mine.filter((p: any) => p.direction === 'out').reduce((s: number, p: any) => s + Number(p.amount), 0),
        received: mine.filter((p: any) => p.direction === 'in').reduce((s: number, p: any) => s + Number(p.amount), 0),
        nextDue: next,
        paidToday: mine.some((p: any) => p.direction === 'out' && p.paid_on === today),
      };
    });
  });
}

export async function createSol(input: {
  kind: 'sol' | 'sabotaj';
  name: string;
  contribution: number;
  frequency: SolFrequency;
  hands?: number | null;
  startDate: string;
  payoutDate?: string | null;
}): Promise<ActionResult<void>> {
  return attempt(async () => {
    await assertFeature('sol');
    const ctx = await getBusinessContext();
    const contribution = Number(input.contribution);
    if (!input.name?.trim()) throw new UserFacingError('Donnez un nom au sòl.');
    if (!(contribution > 0)) throw new UserFacingError('Le montant de la cotisation doit être positif.');
    if (!['daily', 'weekly', 'monthly'].includes(input.frequency)) throw new UserFacingError('Choisissez la fréquence.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate)) throw new UserFacingError('Date de début invalide.');
    const hands = input.hands ? Math.round(Number(input.hands)) : null;

    const { error } = await ctx.supabase.from('sol_groups').insert({
      business_id: ctx.businessId,
      kind: input.kind === 'sabotaj' ? 'sabotaj' : 'sol',
      name: input.name.trim().slice(0, 80),
      contribution,
      frequency: input.frequency,
      hands: hands && hands > 0 ? hands : null,
      start_date: input.startDate,
      payout_date: input.payoutDate && /^\d{4}-\d{2}-\d{2}$/.test(input.payoutDate) ? input.payoutDate : null,
      // La main : la cotisation fois le nombre de mains, si on le connaît.
      payout_amount: hands && hands > 0 ? contribution * hands : null,
    });
    if (missingTable(error)) throw new UserFacingError(NOT_READY);
    if (error) throw error;
    revalidatePath('/sol');
  });
}

/** Une cotisation versée (`out`) ou la main reçue (`in`). Espèces par défaut : c'est le sòl du marché. */
export async function recordSolPayment(input: {
  solId: string; direction: 'in' | 'out'; amount: number; method?: 'Cash' | 'MonCash' | 'Natcash';
}): Promise<ActionResult<void>> {
  return attempt(async () => {
    await assertFeature('sol');
    const ctx = await getBusinessContext();
    const amount = Number(input.amount);
    if (!(amount > 0)) throw new UserFacingError('Le montant doit être positif.');
    const { data: biz } = await ctx.supabase.from('businesses').select('timezone').eq('id', ctx.businessId).maybeSingle();
    const { error } = await ctx.supabase.from('sol_payments').insert({
      business_id: ctx.businessId,
      sol_id: input.solId,
      direction: input.direction === 'in' ? 'in' : 'out',
      amount,
      paid_on: localDay(new Date(), biz?.timezone || 'America/Port-au-Prince'),
      payment_method: input.method ?? 'Cash',
    });
    if (missingTable(error)) throw new UserFacingError(NOT_READY);
    if (error) throw error;
    revalidatePath('/sol');
    revalidatePath('/caisse');
  });
}

export async function closeSol(solId: string): Promise<ActionResult<void>> {
  return attempt(async () => {
    await assertFeature('sol');
    const ctx = await getBusinessContext();
    const { error } = await ctx.supabase.from('sol_groups').update({ is_active: false }).eq('id', solId).eq('business_id', ctx.businessId);
    if (error) throw error;
    revalidatePath('/sol');
  });
}
