'use server';

// ─────────────────────────────────────────────────────────────────────────────
// Fich travay — les fiches de travail des services (F13)
//
// « Vêtements à coudre, téléphones en réparation, motos au garage. Qui a payé
// l'avance, combien reste-t-il, est-ce prêt ? » (§5.2)
//
// Une fiche = une vente à crédit (marquée `work_order`) + ce que la vente ne
// dit pas : quoi, pour quand, où en est le travail. L'avance est un versement
// sur cette vente ; le solde est ce qui reste dû — le cahier de crédit sait
// déjà suivre les paiements partiels, inutile d'en écrire un second.
//
// « Li pare » : quand le travail est prêt, un message poli part en un tap
// depuis le WhatsApp du marchand, montant restant compris.
// ─────────────────────────────────────────────────────────────────────────────

import { revalidatePath } from 'next/cache';
import { getBusinessContext } from '../../lib/serverAuth';
import { attempt, UserFacingError, type ActionResult } from '../../lib/actionResult';
import { assertFeature } from '../../lib/entitlements';
import { buildWhatsAppLink } from '../../lib/whatsappReport';
import { localDay, formatMoney } from '../../lib/eveningReport';
import { createSaleAction } from './sales';
import { ensureQuickAmountProductAction } from './products';
import { markReceivablePaid, recordReceivablePayment } from './receivables';

export type WorkStatus = 'in_progress' | 'ready' | 'delivered' | 'cancelled';

export type WorkOrder = {
  id: string;
  customerName: string;
  customerPhone: string | null;
  description: string;
  price: number;
  deposit: number;
  /** Ce qui reste dû, lu sur la vente. */
  balance: number;
  status: WorkStatus;
  dueDate: string | null;
  createdAt: string;
  readyAt: string | null;
  /** Le message « li pare », prêt à partir. */
  readyLink: string;
};

const missingTable = (error: any) => error && ['42P01', 'PGRST205'].includes(error.code);
const NOT_READY = 'Les fiches de travail ne sont pas encore ouvertes sur ce compte (mise à jour en attente).';

function readyMessage(name: string, description: string, balance: number, business: string): string {
  const rest = balance > 0 ? ` Ki rete pou peye : ${formatMoney(balance, 'HTG')}.` : '';
  return `Bonjou ${name}, ${description} ou an pare.${rest} Ou mèt pase chèche l. Mèsi ! — ${business}`;
}

export async function listWorkOrders(): Promise<ActionResult<WorkOrder[]>> {
  return attempt(async () => {
    await assertFeature('work_orders');
    const ctx = await getBusinessContext();
    const [{ data, error }, { data: biz }] = await Promise.all([
      ctx.supabase
        .from('work_orders')
        .select('id, sale_id, customer_name, customer_phone, description, price, deposit, status, due_date, created_at, ready_at')
        .eq('business_id', ctx.businessId)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false })
        .limit(200),
      ctx.supabase.from('businesses').select('name').eq('id', ctx.businessId).maybeSingle(),
    ]);
    if (missingTable(error)) return [];
    if (error) throw error;

    const saleIds = (data ?? []).map((w: any) => w.sale_id).filter(Boolean);
    const balances = new Map<string, number>();
    if (saleIds.length > 0) {
      const { data: sales } = await ctx.supabase.from('sales').select('id, total_amount, paid_amount').in('id', saleIds);
      for (const s of sales ?? []) balances.set(s.id, Math.max(0, Number(s.total_amount) - Number(s.paid_amount ?? 0)));
    }

    return (data ?? []).map((w: any) => {
      const balance = w.sale_id ? (balances.get(w.sale_id) ?? 0) : Math.max(0, Number(w.price) - Number(w.deposit));
      return {
        id: w.id,
        customerName: w.customer_name,
        customerPhone: w.customer_phone,
        description: w.description,
        price: Number(w.price),
        deposit: Number(w.deposit),
        balance,
        status: w.status,
        dueDate: w.due_date,
        createdAt: w.created_at,
        readyAt: w.ready_at,
        readyLink: buildWhatsAppLink(w.customer_phone, readyMessage(w.customer_name, w.description, balance, biz?.name ?? '')),
      };
    });
  });
}

export async function createWorkOrder(input: {
  customerName: string;
  customerPhone?: string;
  description: string;
  price: number;
  deposit?: number;
  dueDate?: string | null;
}): Promise<ActionResult<{ id: string }>> {
  return attempt(async () => {
    await assertFeature('work_orders');
    const ctx = await getBusinessContext();
    const name = input.customerName?.trim();
    const description = input.description?.trim();
    const price = Number(input.price);
    const deposit = Number(input.deposit ?? 0);
    if (!name) throw new UserFacingError('Le nom du client est obligatoire.');
    if (!description) throw new UserFacingError('Dites quel travail est à faire.');
    if (!(price > 0)) throw new UserFacingError('Le prix doit être positif.');
    if (deposit < 0 || deposit > price) throw new UserFacingError('L’avance doit être entre 0 et le prix.');

    // La table d'abord : sans elle, ne pas créer une vente qu'aucune fiche ne suivrait.
    const probe = await ctx.supabase.from('work_orders').select('id').limit(1);
    if (missingTable(probe.error)) throw new UserFacingError(NOT_READY);

    const product = await ensureQuickAmountProductAction();
    if (!product.ok) throw new UserFacingError(product.message);
    const { data: biz } = await ctx.supabase.from('businesses').select('timezone').eq('id', ctx.businessId).maybeSingle();

    const sale = await createSaleAction({
      business_id:      ctx.businessId,
      currency:         'HTG',
      payment_method:   'Cash',
      payment_status:   'credit',
      discount_percent: 0,
      tax_amount:       0,
      customer_name:    name,
      sale_date:        localDay(new Date(), biz?.timezone || 'America/Port-au-Prince'),
      notes:            `Fich travay · ${description}`,
      origin:           'work_order',
      items: [{ product_id: product.data, product_name: description.slice(0, 120), quantity: 1, unit_price: price, discount_percent: 0, tax_rate: 0 }],
    });
    if (!sale.ok) throw new UserFacingError(sale.message);
    if (!sale.data.success) throw new UserFacingError(sale.data.errors[0]?.message ?? 'La fiche n’a pas pu être créée.');
    const saleId = sale.data.saleId ?? null;

    if (deposit > 0 && saleId) {
      await recordReceivablePayment(saleId, deposit, 'Cash').catch(() => null);
    }

    const { data, error } = await ctx.supabase.from('work_orders').insert({
      business_id:    ctx.businessId,
      sale_id:        saleId,
      customer_name:  name,
      customer_phone: input.customerPhone?.trim() || null,
      description,
      price,
      deposit,
      due_date:       input.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(input.dueDate) ? input.dueDate : null,
    }).select('id').single();
    if (error) throw error;

    revalidatePath('/travaux');
    revalidatePath('/creances');
    return { id: data.id as string };
  });
}

/**
 * Où en est le travail. « Livré » peut encaisser le solde en même temps : le
 * client paie en récupérant son téléphone — un seul geste pour les deux.
 */
export async function setWorkOrderStatus(id: string, status: WorkStatus, collectBalance = false): Promise<ActionResult<void>> {
  return attempt(async () => {
    await assertFeature('work_orders');
    const ctx = await getBusinessContext();
    const { data: wo, error: readErr } = await ctx.supabase
      .from('work_orders').select('sale_id').eq('id', id).eq('business_id', ctx.businessId).maybeSingle();
    if (readErr) throw readErr;
    if (!wo) throw new UserFacingError('Fiche introuvable.');

    const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
    if (status === 'ready') patch.ready_at = new Date().toISOString();
    if (status === 'delivered') patch.delivered_at = new Date().toISOString();

    const { error } = await ctx.supabase.from('work_orders').update(patch).eq('id', id).eq('business_id', ctx.businessId);
    if (error) throw error;

    if (status === 'delivered' && collectBalance && wo.sale_id) {
      const paid = await markReceivablePaid(wo.sale_id);
      if (!paid.ok) throw new UserFacingError(paid.message);
    }
    revalidatePath('/travaux');
    revalidatePath('/creances');
  });
}
