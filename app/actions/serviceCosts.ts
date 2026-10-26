'use server';

// ─────────────────────────────────────────────────────────────────────────────
// Konsomab — ce que coûte vraiment une prestation (F14)
//
// « Une coiffure à 2 500 HTG peut consommer 1 200 HTG de produits ; sans
// calcul, le prix est fixé " comme les autres " » (§5.2). Chaque service est
// lié à ses consommables et à leur coût par prestation ; leur somme devient le
// prix d'achat du service (`products.purchase_price`). La marge de chaque
// coupe se calcule alors par le même chemin que celle d'un produit — la vente
// fige ce coût dans `sale_items.cost_price`, et le bilan du soir le déduit.
// ─────────────────────────────────────────────────────────────────────────────

import { revalidatePath } from 'next/cache';
import { getBusinessContext } from '../../lib/serverAuth';
import { attempt, UserFacingError, type ActionResult } from '../../lib/actionResult';
import { assertFeature } from '../../lib/entitlements';

export type Consumable = { label: string; cost: number };

export type ServiceCost = {
  id: string;
  name: string;
  price: number;
  consumables: Consumable[];
  cost: number;
  /** Ce que la prestation laisse, consommables déduits. */
  profit: number;
  /** Fois vendue sur les 30 derniers jours : le classement des services (Elit). */
  soldLast30: number;
};

const missingTable = (error: any) => error && ['42P01', 'PGRST205'].includes(error.code);

export async function listServiceCosts(): Promise<ActionResult<ServiceCost[]>> {
  return attempt(async () => {
    await assertFeature('service_costing');
    const ctx = await getBusinessContext();
    if (!ctx.can('reports:read')) throw new UserFacingError('Seul le patron voit le coût des prestations.');

    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const [{ data: products, error }, { data: rows, error: cErr }, { data: items }] = await Promise.all([
      ctx.supabase.from('products').select('id, name, sale_price, metadata').eq('business_id', ctx.businessId).eq('is_active', true),
      ctx.supabase.from('service_consumables').select('service_product_id, label, cost').eq('business_id', ctx.businessId),
      ctx.supabase.from('sale_items').select('product_id, quantity').eq('business_id', ctx.businessId).gte('created_at', since),
    ]);
    if (error) throw error;
    const consumables = missingTable(cErr) ? [] : rows ?? [];

    return (products ?? [])
      .filter((p: any) => p?.metadata?.kind === 'service')
      .map((p: any) => {
        const mine = consumables.filter((c: any) => c.service_product_id === p.id)
          .map((c: any) => ({ label: c.label, cost: Number(c.cost) }));
        const cost = mine.reduce((s, c) => s + c.cost, 0);
        const soldLast30 = (items ?? []).filter((i: any) => i.product_id === p.id).reduce((s: number, i: any) => s + Number(i.quantity), 0);
        return { id: p.id, name: p.name, price: Number(p.sale_price), consumables: mine, cost, profit: Number(p.sale_price) - cost, soldLast30 };
      })
      .sort((a, b) => b.profit * b.soldLast30 - a.profit * a.soldLast30 || a.name.localeCompare(b.name));
  });
}

/** Remplace la liste des consommables d'un service, et met son coût à jour. */
export async function saveServiceConsumables(serviceId: string, list: Consumable[]): Promise<ActionResult<void>> {
  return attempt(async () => {
    await assertFeature('service_costing');
    const ctx = await getBusinessContext();
    if (!ctx.can('products:write')) throw new UserFacingError('Seul le patron règle le coût des prestations.');

    const clean = (list ?? [])
      .map((c) => ({ label: String(c.label ?? '').trim().slice(0, 80), cost: Math.round(Number(c.cost) * 100) / 100 }))
      .filter((c) => c.label && Number.isFinite(c.cost) && c.cost >= 0)
      .slice(0, 30);

    const { data: product } = await ctx.supabase.from('products').select('id').eq('id', serviceId).eq('business_id', ctx.businessId).maybeSingle();
    if (!product) throw new UserFacingError('Service introuvable.');

    const del = await ctx.supabase.from('service_consumables').delete().eq('service_product_id', serviceId).eq('business_id', ctx.businessId);
    if (missingTable(del.error)) throw new UserFacingError('Le coût des prestations n’est pas encore ouvert sur ce compte (mise à jour en attente).');
    if (del.error) throw del.error;

    if (clean.length > 0) {
      const { error } = await ctx.supabase.from('service_consumables').insert(
        clean.map((c) => ({ business_id: ctx.businessId, service_product_id: serviceId, label: c.label, cost: c.cost })),
      );
      if (error) throw error;
    }

    const total = clean.reduce((s, c) => s + c.cost, 0);
    const { error: upErr } = await ctx.supabase
      .from('products')
      .update({ purchase_price: total, currency: 'HTG' })
      .eq('id', serviceId)
      .eq('business_id', ctx.businessId);
    if (upErr) throw upErr;

    revalidatePath('/prestations');
    revalidatePath('/products');
  });
}
