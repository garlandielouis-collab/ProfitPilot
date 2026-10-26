'use server';

// ─────────────────────────────────────────────────────────────────────────────
// Le bilan du soir (F06), la caisse du jour (F08) et le salaire du patron (F04)
//
// La lecture d'une journée, dans le fuseau du commerce, et rien d'autre : le
// calcul vit dans `lib/eveningReport.ts`, testé sans base.
//
// ── Comment le bilan « vient » au marchand ──────────────────────────────────
//
// Sans l'API WhatsApp Business (compte Meta vérifié, modèle approuvé, coût par
// message), rien ne part tout seul sur WhatsApp. Le bilan vient donc par trois
// chemins, tous sans compte externe :
//
//   1. l'accueil le montre dès l'heure choisie passée ;
//   2. à la première ouverture après cette heure, une notification est posée,
//      avec le message prêt à partir sur WhatsApp en un tap ;
//   3. le cron du matin (`/api/cron/daily`) pose celle de la veille pour qui
//      n'a pas ouvert l'application le soir.
//
// Une notification par jour au plus : `deliverEveningReport` est idempotent.
// ─────────────────────────────────────────────────────────────────────────────

import { revalidatePath } from 'next/cache';
import { getBusinessContext, requirePermission } from '../../lib/serverAuth';
import { attempt, UserFacingError, type ActionResult } from '../../lib/actionResult';
import { readKaye } from '../../lib/kaye';
import { buildWhatsAppLink } from '../../lib/whatsappReport';
import { businessFacts, missing, num, postEveningNotification, readDay } from '../../lib/eveningData';
import { buildEveningMessage, localDay, localHour, pickTip, type EveningReport } from '../../lib/eveningReport';

export type DayView = {
  report: EveningReport;
  tip: { fr: string; ht: string };
  /** Le message prêt à partir, dans les deux langues, et son lien WhatsApp. */
  message: { fr: string; ht: string };
  whatsapp: { fr: string; ht: string };
  /** L'heure du bilan est passée : l'accueil montre le bilan, pas la journée en cours. */
  eveningReached: boolean;
  eveningHour: number;
  cashOpened: boolean;
  cashClosed: boolean;
};

/** La journée d'aujourd'hui (ou d'un jour donné), telle que l'accueil la montre. */
export async function getDayView(input: { day?: string; memberUserId?: string | null } = {}): Promise<ActionResult<DayView>> {
  return attempt(async () => {
    const ctx = await getBusinessContext();
    const biz = await businessFacts(ctx);
    const timeZone = biz?.timezone || 'America/Port-au-Prince';
    const kaye = readKaye(biz?.settings);
    const day = input.day ?? localDay(new Date(), timeZone);

    // La caisse d'un aide ne se lit que par qui voit les rapports (F22).
    const memberUserId = input.memberUserId && ctx.can('reports:read') ? input.memberUserId : null;
    const { report, cashOpened, cashClosed } = await readDay(ctx, day, timeZone, memberUserId, kaye.ownerWeeklySalary);

    const name = String(biz?.name ?? 'ProfitPilot');
    const fr = buildEveningMessage(report, 'fr', name);
    const ht = buildEveningMessage(report, 'ht', name);
    const to = biz?.whatsapp_number || biz?.phone || null;

    return {
      report,
      tip: pickTip(report),
      message: { fr, ht },
      whatsapp: { fr: buildWhatsAppLink(to, fr), ht: buildWhatsAppLink(to, ht) },
      eveningReached: localHour(new Date(), timeZone) >= kaye.eveningHour,
      eveningHour: kaye.eveningHour,
      cashOpened,
      cashClosed,
    };
  });
}

/**
 * Pose la notification du bilan du soir, une fois par jour au plus. Appelée par
 * l'accueil passé l'heure choisie, et par le cron du matin pour la veille.
 */
export async function deliverEveningReport(): Promise<ActionResult<boolean>> {
  return attempt(async () => {
    const ctx = await getBusinessContext();
    if (!ctx.can('reports:read')) return false;
    const biz = await businessFacts(ctx);
    const timeZone = biz?.timezone || 'America/Port-au-Prince';
    const kaye = readKaye(biz?.settings);
    if (!kaye.eveningEnabled) return false;

    const now = new Date();
    if (localHour(now, timeZone) < kaye.eveningHour) return false;
    const day = localDay(now, timeZone);

    return postEveningNotification({
      businessId: ctx.businessId,
      day,
      build: async () => {
        const { report } = await readDay(ctx, day, timeZone, null, kaye.ownerWeeklySalary);
        return { report, name: String(biz?.name ?? 'ProfitPilot'), to: biz?.whatsapp_number || biz?.phone || null };
      },
    });
  });
}

// ── La caisse du jour (F08) ─────────────────────────────────────────────────

/** Le fond de caisse du matin : « l'argent présent dans la caisse aujourd'hui ». */
export async function openCashDay(input: { openingCash: number; day?: string }): Promise<ActionResult<void>> {
  return attempt(async () => {
    const amount = Number(input.openingCash);
    if (!Number.isFinite(amount) || amount < 0) throw new UserFacingError('Le montant doit être positif.');
    const ctx = await getBusinessContext();
    const biz = await businessFacts(ctx);
    const day = input.day ?? localDay(new Date(), biz?.timezone || 'America/Port-au-Prince');

    const { error } = await ctx.supabase
      .from('cash_days')
      .upsert(
        { business_id: ctx.businessId, day, member_user_id: null, opening_cash: Math.round(amount * 100) / 100 },
        { onConflict: 'business_id,day,member_user_id' },
      );
    if (missing(error)) throw new UserFacingError('La caisse n’est pas encore ouverte sur ce compte (mise à jour en attente).');
    if (error) throw error;
    revalidatePath('/caisse');
    revalidatePath('/dashboard');
  });
}

/**
 * Le compte du soir : ce qu'il y a VRAIMENT dans la caisse. La caisse attendue
 * est figée à côté, pour que l'écart reste lisible demain. `memberUserId` =
 * la caisse d'un aide (F22, Elit).
 */
export async function closeCashDay(input: { countedCash: number; memberUserId?: string | null; note?: string }): Promise<ActionResult<{ expected: number; gap: number }>> {
  return attempt(async () => {
    const counted = Number(input.countedCash);
    if (!Number.isFinite(counted) || counted < 0) throw new UserFacingError('Le montant compté doit être positif.');
    const ctx = input.memberUserId ? await requirePermission('reports:read') : await getBusinessContext();
    const biz = await businessFacts(ctx);
    const timeZone = biz?.timezone || 'America/Port-au-Prince';
    const day = localDay(new Date(), timeZone);
    const memberUserId = input.memberUserId ?? null;

    const { report } = await readDay(ctx, day, timeZone, memberUserId, null);
    const { error } = await ctx.supabase
      .from('cash_days')
      .upsert({
        business_id: ctx.businessId,
        day,
        member_user_id: memberUserId,
        counted_cash: Math.round(counted * 100) / 100,
        expected_cash: report.expectedCash,
        closed_at: new Date().toISOString(),
        closed_by: ctx.userId,
        note: input.note?.trim() || null,
      }, { onConflict: 'business_id,day,member_user_id' });
    if (missing(error)) throw new UserFacingError('La caisse n’est pas encore ouverte sur ce compte (mise à jour en attente).');
    if (error) throw error;
    revalidatePath('/caisse');
    return { expected: report.expectedCash, gap: Math.round((counted - report.expectedCash) * 100) / 100 };
  });
}

export type CashClosing = {
  day: string;
  memberUserId: string | null;
  memberName: string | null;
  opening: number;
  expected: number | null;
  counted: number | null;
  gap: number | null;
};

/** Les dernières clôtures, et leur écart — par aide quand il y en a (F22). */
export async function listCashClosings(limit = 14): Promise<ActionResult<CashClosing[]>> {
  return attempt(async () => {
    const ctx = await requirePermission('reports:read');
    const { data, error } = await ctx.supabase
      .from('cash_days')
      .select('day, member_user_id, opening_cash, expected_cash, counted_cash')
      .eq('business_id', ctx.businessId)
      .order('day', { ascending: false })
      .limit(limit);
    if (missing(error)) return [];
    if (error) throw error;

    const ids = [...new Set((data ?? []).map((r: any) => r.member_user_id).filter(Boolean))] as string[];
    const names = new Map<string, string>();
    if (ids.length > 0) {
      const { data: profiles } = await ctx.supabase.from('profiles').select('id, full_name').in('id', ids);
      for (const p of profiles ?? []) names.set(p.id, p.full_name ?? '');
    }

    return (data ?? []).map((r: any) => {
      const expected = r.expected_cash === null ? null : num(r.expected_cash);
      const counted = r.counted_cash === null ? null : num(r.counted_cash);
      return {
        day: r.day,
        memberUserId: r.member_user_id,
        memberName: r.member_user_id ? names.get(r.member_user_id) || null : null,
        opening: num(r.opening_cash),
        expected,
        counted,
        gap: expected !== null && counted !== null ? Math.round((counted - expected) * 100) / 100 : null,
      };
    });
  });
}
