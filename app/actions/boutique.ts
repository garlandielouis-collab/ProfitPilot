'use server';

import { revalidatePath } from 'next/cache';
import { getBusinessContext, requirePermission } from '../../lib/serverAuth';
import { getSupabaseService } from '../../lib/supabaseServiceClient';
import { assertFeature } from '../../lib/entitlements';
import { revalidateStore } from '../../lib/storefrontData';
import { slugify, validateSlug } from '../../lib/storeTheme';
import { confirmStoreOrder } from './store-public';
import type { StoreSettings, ShippingMode } from './store-public';

// ─── Identifiants de passerelle ───────────────────────────────────────────────
//
// Ils vivent dans `store_payment_credentials`, une table sans aucune politique
// RLS : seule la clé service la lit. Ils étaient auparavant une colonne de
// `store_settings`, laquelle porte un GRANT à `authenticated` — n'importe quel
// marchand connecté pouvait lire les identifiants MonCash de tous les autres.
//
// Vers l'écran de réglages, le secret part MASQUÉ. L'écran le réaffiche tel
// quel et le renvoie à l'enregistrement : recevoir le masque signifie donc
// « ne change pas ce secret ». Le marchand qui tape une nouvelle valeur, lui,
// l'enregistre normalement.

const SECRET_MASK = '••••••••';

type GatewayCreds = { client_id?: string; client_secret?: string; sandbox?: boolean };
type PaymentCredentials = Record<string, GatewayCreds>;

async function readCredentials(businessId: string): Promise<PaymentCredentials> {
  const svc = getSupabaseService();
  const { data } = await svc
    .from('store_payment_credentials')
    .select('credentials')
    .eq('business_id', businessId)
    .maybeSingle();
  return ((data as any)?.credentials ?? {}) as PaymentCredentials;
}

function maskCredentials(creds: PaymentCredentials): PaymentCredentials {
  const out: PaymentCredentials = {};
  for (const [gateway, c] of Object.entries(creds ?? {})) {
    out[gateway] = {
      ...c,
      client_secret: c?.client_secret ? SECRET_MASK : '',
    };
  }
  return out;
}

/** Remet les vrais secrets là où l'écran a renvoyé le masque. */
function unmaskCredentials(
  incoming: PaymentCredentials,
  stored: PaymentCredentials,
): PaymentCredentials {
  const out: PaymentCredentials = {};
  for (const [gateway, c] of Object.entries(incoming ?? {})) {
    const secret =
      !c?.client_secret || c.client_secret === SECRET_MASK
        ? stored?.[gateway]?.client_secret ?? ''
        : c.client_secret;
    out[gateway] = { ...c, client_secret: secret };
  }
  return out;
}

// ─── Store settings ───────────────────────────────────────────────────────────

/**
 * Ce que l'écran de réglages reçoit : la vitrine, plus ses identifiants de
 * passerelle avec les secrets masqués. Un type distinct de `StoreSettings`,
 * qui sert à la vitrine publique et ne doit rien savoir des passerelles.
 */
export type AdminStoreSettings = StoreSettings & {
  payment_credentials: PaymentCredentials;
};

export async function getMyStoreSettings(): Promise<AdminStoreSettings | null> {
  const { supabase, businessId } = await getBusinessContext();
  const { data } = await supabase
    .from('store_settings')
    .select('*')
    .eq('business_id', businessId)
    .maybeSingle();

  if (!data) return null;

  return {
    ...(data as StoreSettings),
    payment_credentials: maskCredentials(await readCredentials(businessId)),
  };
}

export async function upsertStoreSettings(
  settings: Partial<Omit<StoreSettings, 'id' | 'business_id' | 'slug'>> & {
    slug?: string;
    payment_credentials?: PaymentCredentials;
  },
): Promise<{ slug: string }> {
  await assertFeature('online_store');
  await requirePermission('settings:write');
  const { businessId } = await getBusinessContext();
  const svc = getSupabaseService();

  // Les identifiants ne passent pas par `store_settings` : ils sont extraits
  // ici et écrits à part.
  const { payment_credentials, ...storeFields } = settings;

  // Les couleurs n'ont qu'un auteur, l'éditeur (`saveDesign`). Écrites d'ici,
  // une valeur hors défaut figeait la palette sur tous les gabarits
  // (`hasLegacyColorChoice`). Omises, elles gardent leur valeur ou leur défaut SQL.
  delete storeFields.primary_color;
  delete storeFields.secondary_color;

  // L'ancien slug : il faut l'invalider lui aussi en sortant (voir plus bas).
  const { data: previous } = await svc
    .from('store_settings')
    .select('slug')
    .eq('business_id', businessId)
    .maybeSingle();

  // Le slug suit les mêmes règles que dans l'éditeur (`saveGeneral`). Cet écran
  // l'écrivait sans le valider ni vérifier qu'une autre boutique l'avait déjà :
  // le marchand recevait une violation de contrainte brute, ou rien du tout.
  let slug = slugify(storeFields.slug ?? '');
  if (!slug) {
    const { data: biz } = await svc
      .from('businesses')
      .select('name')
      .eq('id', businessId)
      .single();
    slug = slugify((biz as any)?.name ?? businessId);
  }

  // Un slug inchangé n'est pas revalidé : une vitrine créée avant une règle
  // (mot réservé ajouté depuis) ne doit pas bloquer l'enregistrement de ses
  // modes de paiement. Il ne peut de toute façon pas être « pris » — il est à elle.
  if (slug !== previous?.slug) {
    const check = validateSlug(slug);
    if (!check.ok) throw new Error(`Adresse de la boutique : ${check.reason}`);

    const { data: taken } = await svc
      .from('store_settings')
      .select('business_id')
      .eq('slug', slug)
      .maybeSingle();

    if (taken && taken.business_id !== businessId) {
      throw new Error(`L'adresse « ${slug} » est déjà utilisée par une autre boutique.`);
    }
  }
  storeFields.slug = slug;

  const { error: upsertErr } = await svc.from('store_settings').upsert(
    { ...storeFields, business_id: businessId },
    { onConflict: 'business_id' },
  );
  if (upsertErr) throw new Error('Erreur sauvegarde boutique: ' + upsertErr.message);

  if (payment_credentials) {
    const merged = unmaskCredentials(payment_credentials, await readCredentials(businessId));
    const { error: credErr } = await svc.from('store_payment_credentials').upsert(
      { business_id: businessId, credentials: merged },
      { onConflict: 'business_id' },
    );
    if (credErr) throw new Error('Erreur sauvegarde des identifiants: ' + credErr.message);
  }

  // La vitrine est en cache (5 min). Sans invalidation, les modes de paiement et
  // de livraison restaient les anciens côté acheteur — et `create_store_order`,
  // qui relit la base, refusait le mode que la page lui proposait encore.
  // L'ancien slug aussi : sinon l'ancienne adresse sert la version en cache.
  await revalidateStore(previous?.slug ?? null, businessId);
  await revalidateStore(slug, businessId);
  revalidatePath('/boutique');

  return { slug };
}

// ─── Orders ───────────────────────────────────────────────────────────────────

export type OrderRow = {
  id:              string;
  order_number:    string;
  customer_name:   string;
  customer_email:  string;
  customer_phone:  string | null;
  status:          string;
  payment_status:  string;
  payment_method:  string | null;
  subtotal:        number;
  shipping_amount: number;
  discount_amount: number;
  total:           number;
  currency:        string;
  shipping_address: any;
  shipping_mode:   string | null;
  notes:           string | null;
  tracking_number: string | null;
  sale_id:         string | null;
  created_at:      string;
  updated_at:      string;
  order_items:     OrderItem[];
};

export type OrderItem = {
  id:            string;
  product_id:    string | null;
  product_name:  string;
  product_image: string | null;
  quantity:      number;
  unit_price:    number;
  total_price:   number;
};

export async function listOrders(opts?: {
  status?: string;
  search?: string;
  limit?:  number;
  offset?: number;
}): Promise<{ orders: OrderRow[]; total: number }> {
  const { supabase, businessId } = await getBusinessContext();

  let q = supabase
    .from('orders')
    .select('*, order_items(*)', { count: 'exact' })
    .eq('business_id', businessId);

  if (opts?.status && opts.status !== 'all') q = q.eq('status', opts.status);
  if (opts?.search) {
    q = q.or(`order_number.ilike.%${opts.search}%,customer_name.ilike.%${opts.search}%,customer_email.ilike.%${opts.search}%`);
  }

  q = q.order('created_at', { ascending: false });
  if (opts?.limit)  q = (q as any).limit(opts.limit);
  if (opts?.offset) q = (q as any).range(opts.offset, (opts.offset + (opts?.limit ?? 20)) - 1);

  const { data, error, count } = await q;
  if (error) throw new Error(error.message);
  return { orders: (data ?? []) as OrderRow[], total: count ?? 0 };
}

export async function getOrder(orderId: string): Promise<OrderRow | null> {
  const { supabase, businessId } = await getBusinessContext();
  const { data } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .eq('id', orderId)
    .eq('business_id', businessId)
    .maybeSingle();
  return data as OrderRow | null;
}

/**
 * Fait avancer une commande.
 *
 * Confirmer est le seul statut qui touche autre chose que la commande : il crée
 * la vente ProfitPilot, décrémente le stock et écrit le mouvement d'inventaire.
 * Tout cela vit dans `confirm_store_order`, une seule transaction — c'était
 * auparavant une suite de lectures et d'écritures séparées, où deux
 * confirmations simultanées perdaient un décrément de stock.
 *
 * L'ordre compte : on confirme D'ABORD (donc on vérifie le stock), et on marque
 * la commande ensuite. L'inverse laissait une commande « confirmée » alors que
 * la vente n'avait pas pu se faire.
 */
export async function updateOrderStatus(
  orderId: string,
  status: string,
  trackingNumber?: string,
): Promise<void> {
  // Pas de `assertFeature` ici, volontairement.
  //
  // Le reste du module est verrouillé par l'offre — construire la vitrine,
  // publier des produits, retoucher des photos. Mais une commande DÉJÀ passée
  // est de l'argent déjà engagé par un vrai client. Un marchand dont
  // l'abonnement expire un mardi doit pouvoir honorer les commandes du lundi :
  // la boutique cesse d'en prendre de nouvelles, elle ne prend pas les
  // anciennes en otage.
  await requirePermission('sales:update');
  const { businessId } = await getBusinessContext();
  const svc = getSupabaseService();

  // La commande appartient-elle bien à l'entreprise ouverte ? La clé service
  // contourne RLS : sans cette vérification, un identifiant deviné suffirait.
  const { data: owned } = await svc
    .from('orders')
    .select('id')
    .eq('id', orderId)
    .eq('business_id', businessId)
    .maybeSingle();

  if (!owned) throw new Error('Commande introuvable.');

  if (status === 'confirmed') {
    // Lève si le stock ne suit pas — et laisse alors la commande en attente,
    // ce qui est la vérité : elle n'est pas honorable en l'état.
    await confirmStoreOrder(orderId);
  }

  const update: Record<string, unknown> = { status };
  if (trackingNumber) update.tracking_number = trackingNumber;
  if (status === 'confirmed') update.payment_status = 'paid';

  await svc.from('orders').update(update).eq('id', orderId).eq('business_id', businessId);

  revalidatePath('/boutique/commandes');
}

// ─── Statistics ───────────────────────────────────────────────────────────────

export type StoreStats = {
  totalRevenue:     number;
  totalOrders:      number;
  avgOrderValue:    number;
  conversionPct:    number;
  pendingOrders:    number;
  revenueByDay:     Array<{ date: string; total: number }>;
  topProducts:      Array<{ name: string; qty: number; revenue: number }>;
  statusBreakdown:  Record<string, number>;
};

export async function getStoreStats(days = 30): Promise<StoreStats> {
  const { supabase, businessId } = await getBusinessContext();
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const { data: orders } = await supabase
    .from('orders')
    .select('id, status, total, created_at')
    .eq('business_id', businessId)
    .gte('created_at', since);

  const { data: items } = await supabase
    .from('order_items')
    .select('product_name, quantity, total_price, orders(status)')
    .eq('business_id', businessId)
    .gte('created_at', since);

  const rows = (orders ?? []) as any[];
  const paid  = rows.filter((o) => !['cancelled', 'refunded'].includes(o.status));

  const totalRevenue  = paid.reduce((s: number, o: any) => s + Number(o.total), 0);
  const totalOrders   = paid.length;
  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  // Revenue by day
  const byDay: Record<string, number> = {};
  for (const o of paid) {
    const d = o.created_at.slice(0, 10);
    byDay[d] = (byDay[d] ?? 0) + Number(o.total);
  }
  const revenueByDay = Object.entries(byDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, total]) => ({ date, total }));

  // Top products
  const prodMap: Record<string, { qty: number; revenue: number }> = {};
  for (const i of (items ?? []) as any[]) {
    if (['cancelled', 'refunded'].includes((i.orders as any)?.status)) continue;
    if (!prodMap[i.product_name]) prodMap[i.product_name] = { qty: 0, revenue: 0 };
    prodMap[i.product_name].qty     += i.quantity;
    prodMap[i.product_name].revenue += Number(i.total_price);
  }
  const topProducts = Object.entries(prodMap)
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  // Status breakdown
  const statusBreakdown: Record<string, number> = {};
  for (const o of rows) {
    statusBreakdown[o.status] = (statusBreakdown[o.status] ?? 0) + 1;
  }

  return {
    totalRevenue:    parseFloat(totalRevenue.toFixed(2)),
    totalOrders,
    avgOrderValue:   parseFloat(avgOrderValue.toFixed(2)),
    conversionPct:   0, // requires visitor tracking
    pendingOrders:   rows.filter((o: any) => o.status === 'pending').length,
    revenueByDay,
    topProducts,
    statusBreakdown,
  };
}
