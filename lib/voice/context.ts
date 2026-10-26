// ─────────────────────────────────────────────────────────────────────────────
// Le contexte d'un vocal : le catalogue et les clients du commerce
//
// C'est lui qui permet au modèle de dire « Kola » plutôt que « kola » — et à
// la normalisation de refuser un produit qu'il aurait inventé. Lu avec la
// session du marchand : la RLS ne laisse passer que son commerce.
//
// Serveur seulement.
// ─────────────────────────────────────────────────────────────────────────────

import type { VoiceContext } from './draft';
import { toMinor } from './draft';
import { MAX_CONTEXT_CUSTOMERS, MAX_CONTEXT_PRODUCTS } from './prompt';

export async function buildVoiceContext(
  supabase: any,
  businessId: string,
  usdRate: number | null,
): Promise<VoiceContext> {
  const [{ data: products }, { data: customers }] = await Promise.all([
    supabase
      .from('products')
      .select('id, name, sale_price, metadata')
      .eq('business_id', businessId)
      .order('name')
      .limit(MAX_CONTEXT_PRODUCTS * 2),
    supabase
      .from('customers')
      .select('id, first_name, last_name')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(MAX_CONTEXT_CUSTOMERS),
  ]);

  const catalog = (products ?? [])
    // La fiche système de la « vente au montant » n'est pas un produit.
    .filter((p: any) => p?.metadata?.kind !== 'quick_amount')
    // Les favoris d'abord : ce sont eux qu'on dicte.
    .sort((a: any, b: any) => Number(b?.metadata?.favorite === true) - Number(a?.metadata?.favorite === true))
    .slice(0, MAX_CONTEXT_PRODUCTS)
    .map((p: any) => ({
      id: p.id as string,
      name: String(p.name ?? '').trim(),
      priceMinor: Number(p.sale_price) > 0 ? toMinor(Number(p.sale_price)) : null,
    }));

  const known = (customers ?? []).map((c: any) => ({
    id: c.id as string,
    name: `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim(),
  })).filter((c: { name: string }) => c.name);

  return { products: catalog, customers: known, usdRate };
}
