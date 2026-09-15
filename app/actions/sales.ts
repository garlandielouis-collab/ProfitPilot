'use server';

import { revalidatePath } from 'next/cache';
import { verifyBusinessAccess, getBusinessContext } from '../../lib/serverAuth';
import { createSaleSchema, type CreateSaleInput } from '../../lib/validations';
import { recordSaleEntry } from '../../lib/accounting/posting';
import { logActivity } from '../../lib/activityLog';
import { notify } from '../../lib/notify';
import { makeToReport } from '../../lib/currency';
import { attempt, type ActionResult, screenMessage } from '../../lib/actionResult';

// ── Types (backward compat pour le UI) ────────────────────────────────────────

export type CartItemPayload = {
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  discount_percent?: number;
  tax_rate?: number;
};

export type CreateSaleResult =
  | { success: true;  invoiceNumber: string; subtotal: number; discountAmount: number; totalAmount: number }
  | { success: false; errors: Array<{ field: string; message: string }> };

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt2(n: number): number {
  return parseFloat(n.toFixed(2));
}

async function rollbackSale(supabase: any, saleId: string) {
  // `customer_transactions` ne porte pas de `sale_id` : le lien vers la vente
  // passe par le couple `reference_type` / `reference_id`. Filtrer sur une
  // colonne inexistante faisait échouer le DELETE — donc le rollback laissait
  // derrière lui la transaction client d'une vente pourtant annulée, et le
  // solde du client restait faussé.
  await supabase
    .from('customer_transactions')
    .delete()
    .eq('reference_type', 'sale')
    .eq('reference_id', saleId);
  await supabase.from('sale_items').delete().eq('sale_id', saleId);
  await supabase.from('sales').delete().eq('id', saleId);
}

/**
 * Le rang du prochain numéro de facture de l'entreprise.
 *
 * Même règle que la conversion d'une commande boutique en vente
 * (20260908_commerce_launch.sql) : le plus grand numéro INV-AAAA-N déjà
 * attribué, ou le nombre de ventes s'il est plus grand, plus un. « Nombre + 1 »
 * seul retombait sur un numéro existant dès qu'une vente avait été supprimée,
 * et la contrainte UNIQUE (business_id, invoice_number) refusait la vente.
 */
async function nextInvoiceRank(supabase: any, businessId: string): Promise<number> {
  const [countRes, lastRes] = await Promise.all([
    supabase
      .from('sales')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', businessId),
    // Rang zéro-rempli et année croissante : l'ordre du texte suit celui des
    // numéros. Quelques lignes plutôt qu'une, pour enjamber un format étranger.
    supabase
      .from('sales')
      .select('invoice_number')
      .eq('business_id', businessId)
      .like('invoice_number', 'INV-%')
      .order('invoice_number', { ascending: false })
      .limit(10),
  ]);

  let max = 0;
  for (const r of lastRes.data ?? []) {
    const m = /^INV-\d{4}-(\d+)$/.exec(r.invoice_number ?? '');
    if (m) max = Math.max(max, Number(m[1]));
  }
  return Math.max(countRes.count ?? 0, max) + 1;
}

function formatInvoiceNumber(rank: number): string {
  return `INV-${new Date().getFullYear()}-${String(rank).padStart(5, '0')}`;
}

/** Deux ventes simultanées peuvent calculer le même rang : seule la violation
 *  d'unicité SUR LE NUMÉRO justifie de réessayer avec le suivant. */
function isInvoiceNumberConflict(err: any): boolean {
  // Le message BRUT de Postgres, pas celui qu'on montrerait au marchand : c'est
  // lui qui nomme la contrainte violée, et c'est sur ce nom que la nouvelle
  // tentative se décide. `screenMessage` masque exactement ce texte-là.
  return err?.code === '23505' && `${err.message ?? ''} ${err.details ?? ''}`.includes('invoice_number');
}

const INVOICE_NUMBER_ATTEMPTS = 5;

/** Non exporté : un fichier 'use server' n'exporte que des fonctions async. */
const EXCHANGE_RATE_MISSING_MESSAGE =
  "Renseignez le taux USD/HTG de l'entreprise (Paramètres) avant d'enregistrer un montant en dollars.";

// ── Main action ───────────────────────────────────────────────────────────────

export async function createSaleAction(input: CreateSaleInput): Promise<ActionResult<CreateSaleResult>> {
  return attempt(async () => {
  // ── 1. Zod validation (before any DB call) ───────────────────────────────
  const parsed = createSaleSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      errors: parsed.error.issues.map((i) => ({
        field: i.path.join('.'),
        message: i.message,
      })),
    };
  }
  const data = parsed.data;

  if (data.payment_status === 'credit' && !data.customer_id) {
    return {
      success: false,
      errors: [{ field: 'customer_id', message: 'Client requis pour les ventes à crédit.' }],
    };
  }

  // ── 2. Session + business membership ─────────────────────────────────────
  const ctx = await verifyBusinessAccess(data.business_id);
  const { supabase: sb, userId, businessId } = ctx;
  const today = data.sale_date ?? new Date().toISOString().split('T')[0];

  // ── 2b. Idempotence (rejeu de la file hors-ligne) ────────────────────────
  // Une vente déjà passée avec la même clé client ne doit pas être créée deux
  // fois : on renvoie simplement le résultat de la première.
  if (data.client_ref) {
    const { data: existing } = await sb
      .from('sales')
      .select('invoice_number, subtotal_amount, discount_amount, total_amount')
      .eq('business_id', businessId)
      .eq('metadata->>client_ref', data.client_ref)
      .maybeSingle();

    if (existing) {
      return {
        success:        true,
        invoiceNumber:  existing.invoice_number,
        subtotal:       Number(existing.subtotal_amount ?? 0),
        discountAmount: Number(existing.discount_amount ?? 0),
        totalAmount:    Number(existing.total_amount ?? 0),
      };
    }
  }

  // ── 3. Exchange rate — already cached in verifyBusinessAccess context ────
  // Un montant en dollars ne s'enregistre qu'avec le taux saisi par le
  // marchand : `exchangeRate` vaut 1 (défaut de colonne, ou NULL) quand il ne
  // l'a jamais renseigné, et ce taux-là finirait dans sales.exchange_rate
  // puis dans base_debit/base_credit du journal. Refus AVANT toute écriture.
  const exchangeRate = ctx.exchangeRate;
  const rateMissing = [{ field: 'currency', message: EXCHANGE_RATE_MISSING_MESSAGE }];
  if (data.currency === 'USD' && !ctx.exchangeRateSet) {
    return { success: false, errors: rateMissing };
  }

  // ── 4. Check stock via warehouse_stock + products fallback ──────────────
  type StockRow = { product_id: string; variant_id: string | null; quantity: number };
  const productIds = [...new Set(data.items.map((i) => i.product_id))];
  const [stockResult, prodResult] = await Promise.all([
    sb.from('warehouse_stock')
      .select('product_id, variant_id, quantity')
      .eq('business_id', businessId)
      .in('product_id', productIds),
    sb.from('products')
      .select('id, stock_quantity, purchase_price, currency')
      .in('id', productIds),
  ]);

  // warehouse_stock table may not exist on all deployments — treat as no data rather than blocking
  const stockRows: StockRow[] = stockResult.error ? [] : (stockResult.data ?? []);
  const prodStockMap: Record<string, number> = {};
  for (const p of prodResult.data ?? []) prodStockMap[p.id] = p.stock_quantity ?? 0;

  for (const item of data.items) {
    const hasWarehouseEntry = (stockRows ?? []).some((r: StockRow) => r.product_id === item.product_id);
    const productStockSet = prodStockMap[item.product_id] !== undefined && prodStockMap[item.product_id] !== null;

    // Only enforce stock check if stock is explicitly tracked
    if (!hasWarehouseEntry && !productStockSet) continue;

    let available = 0;
    if (item.variant_id) {
      const row = (stockRows ?? []).find(
        (r: StockRow) => r.product_id === item.product_id && r.variant_id === item.variant_id
      );
      available = row?.quantity ?? 0;
    } else {
      const wsQty = (stockRows ?? [])
        .filter((r: StockRow) => r.product_id === item.product_id)
        .reduce((s: number, r: StockRow) => s + r.quantity, 0);
      available = wsQty > 0 ? wsQty : (prodStockMap[item.product_id] ?? 0);
    }
    if (available < item.quantity) {
      return {
        success: false,
        errors: [{ field: `items.${item.product_name}`, message: `Stock insuffisant pou "${item.product_name}" (disponib: ${available})` }],
      };
    }
  }

  // ── 5. Compute totals ────────────────────────────────────────────────────
  const subtotal = data.items.reduce((s, i) => s + i.unit_price * i.quantity, 0);
  const discountAmount = fmt2(subtotal * (data.discount_percent / 100));
  const totalAmount = fmt2(subtotal - discountAmount + data.tax_amount);
  const paidAmount = data.payment_status === 'paid' ? totalAmount : data.payment_status === 'partial' ? 0 : 0;

  // ── 5b. Coût d'achat de chaque ligne, dans la devise de la vente ─────────
  // Résolu AVANT l'insertion : une conversion impossible doit refuser la vente
  // sans rien laisser derrière elle.
  //
  // sale_items.cost_price est lu tel quel par recordSaleCogs (posting.ts), qui
  // le poste dans la devise de la vente. `products.purchase_price` est, lui,
  // exprimé dans `products.currency` : c'est la devise choisie à côté du champ
  // « Pri Acha » (ProductsClient), et celle que computeLandedCost (lib/margin)
  // et l'inventaire lui attribuent. Un produit acheté en USD vendu en HTG
  // doit donc voir son coût converti, sinon la marge brute est fausse d'un
  // facteur ~130.
  //
  // `product_variants.purchase_price` n'a pas de devise et aucun écran ne le
  // saisit : il est repris tel quel, comme avant.
  const variantIds = data.items.filter((i) => i.variant_id).map((i) => i.variant_id!);
  const variantCost = new Map<string, number>();
  if (variantIds.length > 0) {
    const { data: variants } = await sb
      .from('product_variants')
      .select('id, purchase_price')
      .in('id', variantIds);
    for (const v of variants ?? []) variantCost.set(v.id, Number(v.purchase_price ?? 0));
  }

  const productCost = new Map<string, { cost: number; currency: string }>();
  for (const p of prodResult.data ?? []) {
    productCost.set(p.id, {
      cost:     Number(p.purchase_price ?? 0),
      currency: String(p.currency ?? 'HTG').toUpperCase(),
    });
  }

  const lineCosts: number[] = [];
  for (const item of data.items) {
    const fromVariant = item.variant_id ? (variantCost.get(item.variant_id) ?? 0) : 0;
    if (fromVariant !== 0) { lineCosts.push(fromVariant); continue; }

    // Pas de coût de variante : celui du produit. Sans ce repli, cost_price
    // restait à 0 pour tout produit sans variante, l'écriture de coût des
    // ventes était sautée et la marge brute égalait le chiffre d'affaires.
    const prod = productCost.get(item.product_id);
    if (!prod || !prod.cost || prod.currency === data.currency) {
      lineCosts.push(prod?.cost ?? 0);
      continue;
    }
    if (prod.currency !== 'HTG' && prod.currency !== 'USD') {
      // Devise inconnue : aucun coût plutôt qu'un coût deviné (recordSaleCogs
      // saute alors l'écriture au lieu de fausser la marge).
      lineCosts.push(0);
      continue;
    }
    if (!ctx.exchangeRateSet) {
      return { success: false, errors: rateMissing };
    }
    const converted = prod.currency === 'USD'
      ? prod.cost * exchangeRate   // coût USD → vente HTG
      : prod.cost / exchangeRate;  // coût HTG → vente USD
    lineCosts.push(parseFloat(converted.toFixed(4)));
  }

  // ── 6. Insert sale ───────────────────────────────────────────────────────
  const firstRank = await nextInvoiceRank(sb, businessId);
  let invoiceNumber = formatInvoiceNumber(firstRank);
  let saleRow: any = null;
  let sErr: any = null;

  // Numéro pris entre-temps (vente simultanée) : on tente le suivant plutôt que
  // de refuser une vente valide.
  for (let attempt = 0; attempt < INVOICE_NUMBER_ATTEMPTS; attempt++) {
    invoiceNumber = formatInvoiceNumber(firstRank + attempt);
    ({ data: saleRow, error: sErr } = await sb
      .from('sales')
      .insert({
        business_id:      businessId,
        warehouse_id:     data.warehouse_id ?? null,
        invoice_number:   invoiceNumber,
        customer_id:      data.customer_id ?? null,
        customer_name:    data.customer_name ?? null,
        sale_date:        today,
        currency:         data.currency,
        exchange_rate:    data.currency === 'USD' ? exchangeRate : 1,
        payment_method:   data.payment_method,
        payment_status:   data.payment_status,
        discount_percent: data.discount_percent,
        discount_amount:  discountAmount,
        tax_amount:       data.tax_amount,
        subtotal_amount:  fmt2(subtotal),
        total_amount:     totalAmount,
        paid_amount:      paidAmount,
        notes:            data.notes ?? null,
        metadata:         data.client_ref ? { client_ref: data.client_ref } : null,
        created_by:       userId,
      })
      .select('id')
      .single());
    if (!isInvoiceNumberConflict(sErr)) break;
  }

  if (sErr) return { success: false, errors: [{ field: 'sale', message: sErr.message }] };
  const saleId = saleRow.id;
  void logActivity({ action: 'create', entity: 'sale', entityId: invoiceNumber, newValues: { invoice: invoiceNumber, total: totalAmount, customer: data.customer_name, payment: data.payment_method } });
  void notify({
    companyId: businessId, triggeredBy: userId,
    type: data.payment_status === 'paid' ? 'invoice_paid' : 'sale_created',
    title: data.payment_status === 'paid' ? `Facture payée — ${invoiceNumber}` : `Nouvelle vente — ${invoiceNumber}`,
    body: data.customer_name ? `Client : ${data.customer_name} · Montant : ${totalAmount.toLocaleString('fr-FR')} ${data.currency}` : `Montant : ${totalAmount.toLocaleString('fr-FR')} ${data.currency}`,
    entity: 'sale', entityId: invoiceNumber,
    data: { invoice: invoiceNumber, total: totalAmount, currency: data.currency, customer: data.customer_name },
  });

  // ── 7. Insert sale_items ─────────────────────────────────────────────────
  const multiplier = 1 - data.discount_percent / 100;
  const saleItems = data.items.map((item, idx) => ({
    sale_id:          saleId,
    business_id:      businessId,
    product_id:       item.product_id,
    variant_id:       item.variant_id ?? null,
    product_name:     item.product_name,
    sku:              item.sku ?? null,
    quantity:         item.quantity,
    unit_price:       item.unit_price,
    cost_price:       lineCosts[idx] ?? 0, // déjà dans la devise de la vente (5b)
    discount_percent: item.discount_percent,
    line_total:       fmt2(item.unit_price * item.quantity * multiplier),
    tax_rate:         item.tax_rate,
    tax_amount:       fmt2(item.unit_price * item.quantity * (item.tax_rate / 100)),
    currency:         data.currency,
  }));

  const { error: siErr } = await sb.from('sale_items').insert(saleItems);
  if (siErr) {
    await rollbackSale(sb, saleId);
    return { success: false, errors: [{ field: 'sale_items', message: siErr.message }] };
  }

  // ── 8. Decrement warehouse_stock + inventory_movements ───────────────────
  try {
    for (const item of data.items) {
      const cost_price = saleItems.find((si) => si.product_id === item.product_id)?.cost_price ?? 0;

      // Decrement warehouse_stock (if entry exists)
      const matchQty = item.variant_id
        ? sb.from('warehouse_stock').select('quantity').eq('business_id', businessId).eq('product_id', item.product_id).eq('variant_id', item.variant_id).maybeSingle()
        : null;

      const stockRow = matchQty ? (await matchQty).data : null;
      if (stockRow) {
        const newQty = Math.max(0, stockRow.quantity - item.quantity);
        const upd: any = { quantity: newQty };
        if (data.warehouse_id) upd.warehouse_id = data.warehouse_id;
        await sb.from('warehouse_stock').update(upd).eq('business_id', businessId).eq('product_id', item.product_id).eq('variant_id', item.variant_id);
      }

      // Insert inventory_movement
      await sb.from('inventory_movements').insert({
        business_id:    businessId,
        warehouse_id:   data.warehouse_id ?? (stockRow ? undefined : null),
        product_id:     item.product_id,
        variant_id:     item.variant_id ?? null,
        movement_type:  'sale_out',
        quantity:       item.quantity,
        unit_cost:      cost_price,
        total_cost:     fmt2(cost_price * item.quantity),
        currency:       data.currency,
        reference_type: 'sale',
        reference_id:   saleId,
        notes:          `Vente — ${invoiceNumber}`,
        created_by:     userId,
      });

      // Update products.stock_quantity
      const { data: legacy, error: legacyErr } = await sb
        .from('products')
        .select('stock_quantity, reorder_point')
        .eq('id', item.product_id)
        .maybeSingle();
      if (legacyErr) throw new Error(legacyErr.message);
      if (legacy) {
        const newQtyLegacy = Math.max(0, legacy.stock_quantity - item.quantity);
        const { error: stockErr } = await sb
          .from('products')
          .update({ stock_quantity: newQtyLegacy })
          .eq('id', item.product_id);
        if (stockErr) throw new Error(stockErr.message);
        // Le seuil de la fiche produit, comme la liste /products : un 0 hérité de
        // l'ancienne colonne (DEFAULT 0) vaut « non renseigné », d'où le repli à 5.
        const LOW_STOCK_THRESHOLD = Number(legacy.reorder_point) || 5;
        if (newQtyLegacy <= LOW_STOCK_THRESHOLD) {
          void notify({
            companyId: businessId, triggeredBy: userId,
            type: 'stock_low',
            title: `Stock faible — ${item.product_name}`,
            body: `Il reste ${newQtyLegacy} unité${newQtyLegacy !== 1 ? 's' : ''} en stock.`,
            entity: 'product', entityId: item.product_id,
            data: { product: item.product_name, quantity: newQtyLegacy },
          });
        }
      }
    }
  } catch (err: any) {
    await rollbackSale(sb, saleId);
    return { success: false, errors: [{ field: 'sale', message: screenMessage(err, 'Erreur lors de la mise à jour des stocks.') }] };
  }

  // ── 9. Credit sale: update client total_credit ───────────────────────────
  const isCredit = data.payment_status === 'credit';
  const clientId = data.customer_id ?? null;
  if (isCredit && clientId) {
    // Some deployments may not have migrated the legacy `total_credit` column
    // into `customers`. Be defensive: if the column is missing, skip the
    // update (don't fail the sale) and log a warning so the migration can be
    // applied later. If any other DB error occurs, rollback as before.
    const { data: clt, error: cltErr } = await sb
      .from('customers')
      .select('total_credit')
      .eq('id', clientId)
      .single();

    if (cltErr) {
      const msg = cltErr.message ?? String(cltErr);
      if (msg.includes("column \"total_credit\" does not exist") || msg.includes('column "total_credit" does not exist')) {
        console.warn('[sales] customers.total_credit missing — skipping client credit update');
      } else {
        await rollbackSale(sb, saleId);
        return { success: false, errors: [{ field: 'client', message: cltErr.message }] };
      }
    } else {
      const newCredit = fmt2((clt.total_credit ?? 0) + totalAmount);
      const { error: creditErr } = await sb.from('customers').update({ total_credit: newCredit }).eq('id', clientId);
      if (creditErr) {
        const msg = creditErr.message ?? String(creditErr);
        if (msg.includes("column \"total_credit\" does not exist") || msg.includes('column "total_credit" does not exist')) {
          console.warn('[sales] customers.total_credit missing during update — skipped');
        } else {
          await rollbackSale(sb, saleId);
          return { success: false, errors: [{ field: 'client', message: creditErr.message }] };
        }
      }
    }
  }

  // ── 10. Journal entry (non-bloquant) ─────────────────────────────────────
  try {
    await recordSaleEntry({
      saleId,
      invoiceNumber,
      amount: totalAmount,
      isCredit,
      date: today,
      currency: data.currency,
      paymentMethod: data.payment_method,
      exchangeRate: data.currency === 'USD' ? exchangeRate : 1,
    });
  } catch (error) {
    console.error('[accounting] recordSaleEntry failed:', (error as Error).message);
  }

  revalidatePath('/sales');
  revalidatePath('/customers');
  revalidatePath('/dettes');
  revalidatePath('/rapports/comptabilite');

  return {
    success: true,
    invoiceNumber,
    subtotal: fmt2(subtotal),
    discountAmount,
    totalAmount,
  };
  });
}

// ── Total du jour ─────────────────────────────────────────────────────────────

/**
 * Le total encaissé aujourd'hui, et rien d'autre.
 *
 * C'est le chiffre vers lequel « vole » le montant d'une vente qu'on vient
 * d'enregistrer (audit §7, moment 1) : le marchand voit où son argent est allé,
 * et le total s'incrémente sous ses yeux. Une requête minuscule, parce qu'elle
 * part depuis la feuille de vente, sur une connexion irrégulière.
 *
 * Silencieux en cas d'échec : un total indisponible n'est pas une erreur à
 * montrer au milieu d'une vente. On renvoie 0 et la feuille n'affiche rien.
 *
 * Total dans la devise de l'entreprise (`currency`), par `makeToReport` : une
 * vente dans l'autre devise sans taux saisi reste HORS du total et compte dans
 * `unconvertedCount`. Jamais de taux de repli.
 */
export async function getTodaySalesTotal(): Promise<{
  total: number; count: number; currency: string; unconvertedCount?: number;
}> {
  try {
    const { supabase, businessId, exchangeRate, exchangeRateSet, defaultCurrency } = await getBusinessContext();
    const toReport = makeToReport({ exchangeRate, exchangeRateSet, defaultCurrency });

    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const { data } = await supabase
      .from('sales')
      .select('total_amount, currency')
      .eq('business_id', businessId)
      .gte('created_at', start.toISOString());

    const rows = data ?? [];
    let unconvertedCount = 0;
    const total = rows.reduce((sum: number, r: any) => {
      const v = toReport(parseFloat(r.total_amount ?? 0) || 0, r.currency);
      if (v === null) { unconvertedCount += 1; return sum; }
      return sum + v;
    }, 0);

    return { total: parseFloat(total.toFixed(2)), count: rows.length, currency: defaultCurrency, unconvertedCount };
  } catch {
    return { total: 0, count: 0, currency: 'HTG' };
  }
}

// ── Metrics ───────────────────────────────────────────────────────────────────

export type SalesMetrics = {
  monthlyTotal:  number;
  allTimeTotal:  number;
  monthlyCount:  number;
  topClient:     string | null;
  /** Devise des totaux : celle de l'entreprise. */
  currency:      string;
  /** Ventes dans l'autre devise restées hors des totaux, faute de taux saisi. */
  unconvertedCount?: number;
};

export async function getSalesMetrics(): Promise<SalesMetrics> {
  let supabase: any, businessId: string, ctx: Awaited<ReturnType<typeof getBusinessContext>>;
  try {
    ctx = await getBusinessContext();
    supabase = ctx.supabase; businessId = ctx.businessId;
  } catch { return { monthlyTotal: 0, allTimeTotal: 0, monthlyCount: 0, topClient: null, currency: 'HTG' }; }

  const now        = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  // Conversion vers la devise de l'entreprise ; `null` = exclu et compté (par
  // id de vente : le mois est inclus dans « depuis le début », une même vente
  // ne compte qu'une fois).
  const convert = makeToReport(ctx);
  const unconverted = new Set<string>();
  const add = (r: any): number => {
    const v = convert(parseFloat(r.total_amount ?? 0) || 0, r.currency);
    if (v === null) { unconverted.add(String(r.id)); return 0; }
    return v;
  };

  const [monthly, allTime] = await Promise.all([
    supabase.from('sales').select('id, total_amount, customer_name, currency')
      .eq('business_id', businessId).gte('created_at', monthStart),
    supabase.from('sales').select('id, total_amount, currency')
      .eq('business_id', businessId),
  ]);

  const sum = (rows: any[] | null) =>
    (rows ?? []).reduce((s: number, r: any) => s + add(r), 0);

  // Top client this month
  const clientTotals: Record<string, number> = {};
  for (const r of monthly.data ?? []) {
    if (r.customer_name) {
      clientTotals[r.customer_name] = (clientTotals[r.customer_name] ?? 0) + add(r);
    }
  }
  const topClient = Object.entries(clientTotals).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  return {
    monthlyTotal: parseFloat(sum(monthly.data).toFixed(2)),
    allTimeTotal: parseFloat(sum(allTime.data).toFixed(2)),
    monthlyCount: (monthly.data ?? []).length,
    topClient,
    currency:         ctx.defaultCurrency,
    unconvertedCount: unconverted.size,
  };
}

// ── CRM data ──────────────────────────────────────────────────────────────────

export type ClientSummary = {
  name:     string;
  /** Dans `currency`, la devise de l'entreprise ; hors ventes inconvertibles. */
  total:    number;
  count:    number;
  lastDate: string;
  methods:  string[];
  currency: string;
  /** Ventes de ce client restées hors de `total`, faute de taux saisi. */
  unconvertedCount?: number;
};

export async function getSalesCRMData(): Promise<ClientSummary[]> {
  let supabase: any, businessId: string, ctx: Awaited<ReturnType<typeof getBusinessContext>>;
  try {
    ctx = await getBusinessContext();
    supabase = ctx.supabase; businessId = ctx.businessId;
  } catch { return []; }

  const convert  = makeToReport(ctx);
  const currency = ctx.defaultCurrency;

  const { data } = await supabase
    .from('sales')
    .select('customer_name, total_amount, currency, payment_method, created_at')
    .eq('business_id', businessId)
    .not('customer_name', 'is', null)
    .order('created_at', { ascending: false });

  const map = new Map<string, ClientSummary>();
  for (const row of (data ?? [])) {
    const name = row.customer_name ?? 'Anonim';
    const amt  = parseFloat(String(row.total_amount ?? 0)) || 0;
    const v    = convert(amt, row.currency);
    if (!map.has(name)) {
      map.set(name, { name, total: 0, count: 0, lastDate: row.created_at, methods: [], currency, unconvertedCount: 0 });
    }
    const c = map.get(name)!;
    if (v === null) c.unconvertedCount = (c.unconvertedCount ?? 0) + 1;
    else c.total += v;
    c.count += 1;
    if (row.created_at > c.lastDate) c.lastDate = row.created_at;
    if (row.payment_method && !c.methods.includes(row.payment_method))
      c.methods.push(row.payment_method);
  }

  return [...map.values()].sort((a, b) => b.total - a.total);
}

// ── Get sales list ────────────────────────────────────────────────────────────

export async function getSalesAction(limit = 50) {
  const { supabase, businessId } = await getBusinessContext();

  const { data, error } = await supabase
    .from('sales')
    .select(`
      id, invoice_number, customer_id, customer_name,
      total_amount, currency, payment_method, payment_status,
      discount_percent, sale_date, created_at
    `)
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return data ?? [];
}
