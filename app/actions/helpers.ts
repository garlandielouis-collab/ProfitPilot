'use server';

// ─────────────────────────────────────────────────────────────────────────────
// Èd yo — les comptes des aides et leur paie (F16 de l'étude)
//
// « Impossible de déléguer sans perdre le contrôle ; disputes sur la paie. »
// Un aide note les ventes sans voir le profit ni la caisse (rôle caissier).
// Sa paie se règle de deux façons, les deux du terrain :
//   · à la journée : un montant par jour où il a noté au moins une vente ;
//   · au pourcentage : une part de ce qu'il a vendu lui-même.
//
// Elit ajoute, pour un service, les commissions par service et le classement
// des services qui rapportent le plus (§13.3).
//
// Le module RH complet (contrats, congés, fiches) est retiré des offres
// (§12.1) : il reste à son adresse, mais ce n'est plus là qu'on règle un aide.
// ─────────────────────────────────────────────────────────────────────────────

import { revalidatePath } from 'next/cache';
import { getBusinessContext } from '../../lib/serverAuth';
import { attempt, UserFacingError, type ActionResult } from '../../lib/actionResult';
import { assertFeature, hasFeature } from '../../lib/entitlements';
import { getSupabaseService } from '../../lib/supabaseServiceClient';
import { localDay, weekStart, zonedDayBounds } from '../../lib/eveningReport';
import { makeToReport } from '../../lib/currency';
import { payFor, type PayMode } from '../../lib/helperPay';

export type HelperPay = {
  memberId: string;
  userId: string;
  name: string;
  role: string;
  payMode: PayMode | null;
  payRate: number | null;
  /** Sur la période : ce qu'il a vendu, les jours où il a travaillé, ce qui lui revient. */
  sold: number;
  daysWorked: number;
  due: number;
  /** Elit, service : ce que chaque service lui a rapporté (au pourcentage). */
  byService: { name: string; sold: number; commission: number }[];
};

const missing = (error: any) => error && ['42703', 'PGRST204', '42P01'].includes(error.code);

export async function listHelperPay(period: 'week' | 'month' = 'week'): Promise<ActionResult<{ from: string; to: string; helpers: HelperPay[] }>> {
  return attempt(async () => {
    const ctx = await getBusinessContext();
    if (!ctx.can('reports:read')) throw new UserFacingError('Seul le patron voit la paie des aides.');
    await assertFeature('employees');

    const { data: biz } = await ctx.supabase.from('businesses').select('timezone, owner_id').eq('id', ctx.businessId).maybeSingle();
    const tz = biz?.timezone || 'America/Port-au-Prince';
    const to = localDay(new Date(), tz);
    const from = period === 'week' ? weekStart(to) : `${to.slice(0, 8)}01`;
    const start = zonedDayBounds(from, tz).start;
    const end = zonedDayBounds(to, tz).end;

    let { data: members, error } = await ctx.supabase
      .from('business_members')
      .select('id, user_id, role, pay_mode, pay_rate')
      .eq('business_id', ctx.businessId)
      .eq('is_active', true)
      .is('deleted_at', null);
    // Colonnes de paie absentes (migration 20261025 non jouée) : la liste sans elles.
    if (missing(error)) {
      ({ data: members, error } = await ctx.supabase
        .from('business_members')
        .select('id, user_id, role')
        .eq('business_id', ctx.businessId)
        .eq('is_active', true)
        .is('deleted_at', null) as any);
    }
    if (error) throw error;

    const helpers = (members ?? []).filter((m: any) => m.user_id !== biz?.owner_id && m.role !== 'owner');
    if (helpers.length === 0) return { from, to, helpers: [] };

    const withServices = await hasFeature('service_commissions');
    const convert = makeToReport(ctx);
    const { data: sales } = await ctx.supabase
      .from('sales')
      .select('total_amount, currency, created_by, created_at, payment_status, sale_items(product_name, line_total)')
      .eq('business_id', ctx.businessId)
      .is('deleted_at', null)
      .in('created_by', helpers.map((h: any) => h.user_id))
      .gte('created_at', start)
      .lt('created_at', end);

    const svc = getSupabaseService();
    const out: HelperPay[] = [];
    for (const m of helpers as any[]) {
      const mine = (sales ?? []).filter((s: any) => s.created_by === m.user_id && s.payment_status !== 'cancelled' && s.payment_status !== 'refunded');
      const sold = mine.reduce((sum: number, s: any) => sum + (convert(Number(s.total_amount) || 0, s.currency) ?? 0), 0);
      const days = new Set(mine.map((s: any) => localDay(new Date(s.created_at), tz))).size;
      const mode = (m.pay_mode ?? null) as PayMode | null;
      const rate = m.pay_rate === null || m.pay_rate === undefined ? null : Number(m.pay_rate);

      const byServiceMap = new Map<string, number>();
      if (withServices) {
        for (const s of mine) {
          for (const item of s.sale_items ?? []) {
            const v = convert(Number(item.line_total) || 0, s.currency) ?? 0;
            byServiceMap.set(item.product_name, (byServiceMap.get(item.product_name) ?? 0) + v);
          }
        }
      }

      let name = '';
      try {
        const { data: u } = await svc.auth.admin.getUserById(m.user_id);
        name = u.user?.user_metadata?.full_name ?? u.user?.email ?? '';
      } catch { /* une ligne sans nom vaut mieux qu'une ligne absente */ }

      out.push({
        memberId: m.id,
        userId: m.user_id,
        name,
        role: m.role,
        payMode: mode,
        payRate: rate,
        sold: Math.round(sold),
        daysWorked: days,
        due: payFor(mode, rate, sold, days),
        byService: [...byServiceMap.entries()]
          .map(([serviceName, v]) => ({
            name: serviceName,
            sold: Math.round(v),
            commission: mode === 'percent' && rate ? Math.round((v * rate) / 100) : 0,
          }))
          .sort((a, b) => b.sold - a.sold),
      });
    }
    return { from, to, helpers: out };
  });
}

export async function setHelperPay(memberId: string, mode: PayMode | null, rate: number | null): Promise<ActionResult<void>> {
  return attempt(async () => {
    const ctx = await getBusinessContext();
    if (ctx.role !== 'owner') throw new UserFacingError('Seul le propriétaire règle la paie des aides.');
    await assertFeature('helper_pay');
    if (mode !== null && mode !== 'daily' && mode !== 'percent') throw new UserFacingError('Choisissez « à la journée » ou « au pourcentage ».');
    const value = rate === null ? null : Number(rate);
    if (value !== null && (!Number.isFinite(value) || value < 0)) throw new UserFacingError('Le montant doit être positif.');
    if (mode === 'percent' && value !== null && value > 100) throw new UserFacingError('Un pourcentage ne dépasse pas 100.');

    const { error } = await ctx.supabase
      .from('business_members')
      .update({ pay_mode: mode, pay_rate: value })
      .eq('id', memberId)
      .eq('business_id', ctx.businessId);
    if (missing(error)) throw new UserFacingError('La paie des aides n’est pas encore ouverte sur ce compte (mise à jour en attente).');
    if (error) throw error;
    revalidatePath('/aides');
  });
}
