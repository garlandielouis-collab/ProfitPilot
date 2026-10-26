'use server';

// ─────────────────────────────────────────────────────────────────────────────
// « Konfime » — un brouillon vocal devient une vraie opération
//
// Une seule source de vérité (§1 de la spécification) : la voix ne crée rien
// par un chemin à elle. Elle appelle les MÊMES actions que la saisie à la main :
//
//   vente, crédit           → createSaleAction (app/actions/sales.ts)
//   dépense, retrait « Kay » → upsertExpense    (app/actions/expenses.ts)
//   paiement de crédit      → recordReceivablePayment (app/actions/receivables.ts)
//
// Les montants arrivent en centimes entiers et ne deviennent des décimaux qu'à
// l'appel de ces actions (la base reste en NUMERIC, décision du 26/10/2026).
// La transcription brute accompagne l'opération (§2.2) ; la date est celle de
// l'enregistrement, pas de la confirmation (§2.3).
//
// Deux taps sur « Konfime » ne font pas deux ventes : la clé de la vente est
// dérivée du vocal et du brouillon, et le vocal garde la liste de ce qui a déjà
// été confirmé.
// ─────────────────────────────────────────────────────────────────────────────

import { createHash } from 'node:crypto';
import { getBusinessContext } from '../../lib/serverAuth';
import { attempt, UserFacingError, type ActionResult } from '../../lib/actionResult';
import { draftBlockers, fromMinor, type VoiceDraft } from '../../lib/voice/draft';
import { VOICE_TX_TYPES } from '../../lib/voice/schema';
import { draftLabel } from '../../lib/voice/sheet';
import { localDay } from '../../lib/eveningReport';
import { createSaleAction } from './sales';
import { upsertExpense } from './expenses';
import { ensureQuickAmountProductAction } from './products';
import { listReceivables, recordReceivablePayment } from './receivables';

const SALE_METHOD = { cash: 'Cash', moncash: 'MonCash', natcash: 'Natcash' } as const;
const EXPENSE_METHOD = { cash: 'Espèces', moncash: 'MonCash', natcash: 'Natcash' } as const;

/** Une clé d'idempotence au format UUID, stable pour un vocal et un brouillon. */
function stableUuid(seed: string): string {
  const h = createHash('sha256').update(seed).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

const norm = (s: string | null | undefined) =>
  (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

export type ConfirmResult = { type: VoiceDraft['type']; ids: string[]; alreadyDone: boolean };

export async function confirmVoiceDraft(input: {
  noteId: string;
  draft: VoiceDraft;
  transcription: string;
  recordedAt?: string;
}): Promise<ActionResult<ConfirmResult>> {
  return attempt(async () => {
    const d = input.draft;
    if (!d || !VOICE_TX_TYPES.includes(d.type)) throw new UserFacingError('Brouillon invalide.');
    if (!Number.isInteger(d.amountMinor) || (d.amountMinor as number) <= 0) {
      throw new UserFacingError('Montan an manke. / Le montant manque.');
    }
    const blockers = draftBlockers(d);
    if (blockers.length > 0) throw new UserFacingError(`${blockers[0].ht} / ${blockers[0].fr}`);

    const ctx = await getBusinessContext();
    const { data: biz } = await ctx.supabase.from('businesses').select('timezone').eq('id', ctx.businessId).maybeSingle();
    const tz = biz?.timezone || 'America/Port-au-Prince';
    const recorded = input.recordedAt && !Number.isNaN(Date.parse(input.recordedAt)) ? new Date(input.recordedAt) : new Date();
    const day = localDay(recorded, tz);
    const amount = fromMinor(d.amountMinor as number);
    const note = `Vokal : « ${input.transcription.trim().slice(0, 400)} »`;

    // Déjà confirmé (double tap, réseau qui a répondu deux fois) : on le dit.
    const { data: voiceNote, error: noteErr } = await ctx.supabase
      .from('voice_notes')
      .select('confirmed')
      .eq('id', input.noteId)
      .eq('business_id', ctx.businessId)
      .maybeSingle();
    const confirmed: Array<{ key: string; type: string; ids: string[] }> = noteErr ? [] : (voiceNote?.confirmed ?? []);
    const previous = confirmed.find((c) => c.key === d.key);
    if (previous) return { type: d.type, ids: previous.ids, alreadyDone: true };

    let ids: string[] = [];

    if (d.type === 'sale' || d.type === 'credit') {
      const credit = d.type === 'credit';
      const catalogItems = d.currency === 'HTG' && !d.totalMismatch && d.catalogTotalMinor !== null
        && d.lines.every((l) => l.productId && l.unitPriceMinor !== null);
      let items;
      if (catalogItems) {
        // Le total dit et les prix du catalogue concordent : les vraies lignes,
        // et le stock descend comme pour une vente tapée.
        items = d.lines.map((l) => ({
          product_id: l.productId as string, product_name: l.label, quantity: l.quantity,
          unit_price: fromMinor(l.unitPriceMinor as number), discount_percent: 0, tax_rate: 0,
        }));
      } else {
        // Sinon, la « vente au montant » : le total dit, tel quel. Les articles
        // nommés restent dans le libellé ; aucun prix n'est réparti au hasard.
        const quick = await ensureQuickAmountProductAction();
        if (!quick.ok) throw new UserFacingError(quick.message);
        items = [{
          product_id: quick.data, product_name: draftLabel(d) || (credit ? 'Kredi' : 'Vant'), quantity: 1,
          unit_price: amount, discount_percent: 0, tax_rate: 0,
        }];
      }
      const method = credit ? 'Cash' : SALE_METHOD[(d.paymentMethod ?? 'cash') as keyof typeof SALE_METHOD] ?? 'Cash';
      const res = await createSaleAction({
        business_id: ctx.businessId,
        currency: d.currency,
        payment_method: method,
        payment_status: credit ? 'credit' : 'paid',
        discount_percent: 0,
        tax_amount: 0,
        customer_name: d.customerLabel ?? undefined,
        customer_id: d.customerId ?? undefined,
        sale_date: day,
        notes: note,
        client_ref: stableUuid(`${input.noteId}:${d.key}`),
        items,
      });
      if (!res.ok) throw new UserFacingError(res.message);
      if (!res.data.success) throw new UserFacingError(res.data.errors[0]?.message ?? 'Lavant pa t pase.');
      ids = res.data.saleId ? [res.data.saleId] : [];
    } else if (d.type === 'expense' || d.type === 'owner_withdrawal') {
      const household = d.type === 'owner_withdrawal';
      const res = await upsertExpense({
        description: (draftLabel(d) || (household ? 'Lajan pou lakay' : d.expenseCategory) || 'Depans').slice(0, 200),
        category: d.expenseCategory ?? (household ? 'Retrait personnel' : 'Autre'),
        amount,
        currency: d.currency,
        payment_status: 'Payé',
        payment_method: EXPENSE_METHOD[(d.paymentMethod ?? 'cash') as keyof typeof EXPENSE_METHOD] ?? 'Espèces',
        date: day,
        scope: household ? 'personal' : 'business',
      });
      if (!res.ok) throw new UserFacingError(res.message);
      if (res.data?.error) throw new UserFacingError(res.data.error);
    } else {
      // Paiement de crédit : sur les crédits de ce client, le plus ancien
      // d'abord, dans la devise dite. Jamais plus que ce qu'il doit.
      const list = await listReceivables();
      if (!list.ok) throw new UserFacingError(list.message);
      const wanted = norm(d.customerLabel);
      const open = list.data.items
        .filter((r) => r.currency === d.currency && r.balanceDue > 0)
        .filter((r) => (d.customerId && r.customerId === d.customerId) || norm(r.customerName) === wanted)
        .sort((a, b) => a.saleDate.localeCompare(b.saleDate));
      const due = open.reduce((s, r) => s + r.balanceDue, 0);
      if (open.length === 0) {
        throw new UserFacingError(`Nou pa jwenn kredi pou ${d.customerLabel}. / Aucun crédit trouvé pour ${d.customerLabel}.`);
      }
      if (amount > due + 0.001) {
        throw new UserFacingError(`${d.customerLabel} dwe sèlman ${due}. / ${d.customerLabel} ne doit que ${due}.`);
      }
      const method = SALE_METHOD[(d.paymentMethod ?? 'cash') as keyof typeof SALE_METHOD] ?? 'Cash';
      let left = amount;
      for (const r of open) {
        if (left < 0.01) break;
        const part = Math.min(left, r.balanceDue);
        const paid = await recordReceivablePayment(r.saleId, Math.round(part * 100) / 100, method);
        if (!paid.settled) throw new UserFacingError('Peman an pa t pase. / Le paiement n’est pas passé.');
        ids.push(r.saleId);
        left = Math.round((left - part) * 100) / 100;
      }
    }

    if (!noteErr) {
      await ctx.supabase
        .from('voice_notes')
        .update({ confirmed: [...confirmed, { key: d.key, type: d.type, ids }] })
        .eq('id', input.noteId)
        .eq('business_id', ctx.businessId);
    }
    return { type: d.type, ids, alreadyDone: false };
  });
}
