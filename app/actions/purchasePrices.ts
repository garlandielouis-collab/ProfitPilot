'use server';

// ─────────────────────────────────────────────────────────────────────────────
// Founisè — les prix d'achat suivis, et l'alerte quand la marge baisse (F21)
//
// « Dettes fournisseurs oubliées ; hausses de prix d'achat non répercutées »
// (§12, F21). Les échéances vivent déjà dans /dettes ; ce qui manquait, c'est
// la mémoire des prix : `purchase_items.unit_cost` était enregistré à chaque
// achat et jamais relu dans le temps. Ici, pour chaque produit, les derniers
// prix d'achat, la hausse depuis le précédent, et ce qu'il reste de marge au
// prix de vente actuel — « Dola a monte ? Pri w dwe monte tou » (§8).
// ─────────────────────────────────────────────────────────────────────────────

import { getBusinessContext } from '../../lib/serverAuth';
import { attempt, UserFacingError, type ActionResult } from '../../lib/actionResult';
import { assertFeature } from '../../lib/entitlements';
import { makeToReport } from '../../lib/currency';

export type PricePoint = { date: string; cost: number; supplier: string | null };

export type ProductPriceTrend = {
  productId: string;
  name: string;
  salePrice: number;
  /** Les derniers prix d'achat, le plus récent d'abord, en devise du commerce. */
  history: PricePoint[];
  /** Hausse du dernier prix sur le précédent, en %. */
  changePct: number | null;
  /** Marge au dernier prix d'achat, en % du prix de vente. */
  marginPct: number | null;
  targetMarginPct: number;
  /** La marge est passée sous l'objectif, ou le coût a monté de plus de 10 %. */
  alert: boolean;
};

export async function listPurchasePriceTrends(): Promise<ActionResult<ProductPriceTrend[]>> {
  return attempt(async () => {
    await assertFeature('supplier_price_history');
    const ctx = await getBusinessContext();
    if (!ctx.can('reports:read')) throw new UserFacingError('Seul le patron voit les prix d’achat.');
    const convert = makeToReport(ctx);

    const [{ data: items, error }, { data: products }] = await Promise.all([
      ctx.supabase
        .from('purchase_items')
        .select('product_id, product_name, unit_cost, currency, created_at, purchases(purchase_date, suppliers(name))')
        .eq('business_id', ctx.businessId)
        .order('created_at', { ascending: false })
        .limit(2000),
      ctx.supabase.from('products').select('id, name, sale_price, target_margin_percent').eq('business_id', ctx.businessId),
    ]);
    if (error) throw error;

    const productMap = new Map<string, any>((products ?? []).map((p: any) => [p.id, p]));
    const byProduct = new Map<string, PricePoint[]>();
    for (const it of items ?? []) {
      const cost = convert(Number(it.unit_cost) || 0, it.currency);
      if (cost === null) continue;
      const purchase: any = Array.isArray(it.purchases) ? it.purchases[0] : it.purchases;
      const supplier: any = purchase ? (Array.isArray(purchase.suppliers) ? purchase.suppliers[0] : purchase.suppliers) : null;
      const list = byProduct.get(it.product_id) ?? [];
      if (list.length < 6) {
        list.push({ date: purchase?.purchase_date ?? String(it.created_at).slice(0, 10), cost, supplier: supplier?.name ?? null });
        byProduct.set(it.product_id, list);
      }
    }

    const out: ProductPriceTrend[] = [];
    for (const [productId, history] of byProduct) {
      const p = productMap.get(productId);
      if (!p) continue;
      const last = history[0]?.cost ?? 0;
      const previous = history[1]?.cost ?? null;
      const salePrice = Number(p.sale_price) || 0;
      const changePct = previous && previous > 0 ? Math.round(((last - previous) / previous) * 1000) / 10 : null;
      const marginPct = salePrice > 0 ? Math.round(((salePrice - last) / salePrice) * 1000) / 10 : null;
      const target = Number(p.target_margin_percent ?? 30) || 30;
      out.push({
        productId,
        name: p.name,
        salePrice,
        history,
        changePct,
        marginPct,
        targetMarginPct: target,
        alert: (marginPct !== null && marginPct < target) || (changePct !== null && changePct > 10),
      });
    }
    return out.sort((a, b) => Number(b.alert) - Number(a.alert) || (b.changePct ?? 0) - (a.changePct ?? 0));
  });
}
