'use server';

// ─────────────────────────────────────────────────────────────────────────────
// Studio IA — les actions côté marchand
//
// Le lancement passe par la route API (asynchrone, avec rappel du fournisseur) ;
// ce fichier tient ce qui l'entoure : lire l'historique, appliquer un résultat,
// le retirer.
//
// « Appliquer » est un geste explicite, et réversible. `products.image_url`
// n'est jamais écrasée — la retouche va dans `enhanced_image_url`, et la
// vitrine préfère celle-ci quand elle existe. Le marchand retrouve donc sa
// photo d'origine d'un clic, même six mois plus tard.
// ─────────────────────────────────────────────────────────────────────────────

import { revalidatePath } from 'next/cache';
import { assertFeature } from '../../lib/entitlements';
import { getBusinessContext, requirePermission } from '../../lib/serverAuth';
import { getSupabaseService } from '../../lib/supabaseServiceClient';
import { revalidateStore } from '../../lib/storefrontData';

// Le Studio est gardé par `online_store` : il n'existe que pour la vitrine, et
// c'est la seule capacité vendable qui le couvre aujourd'hui. Le jour où le
// Studio se vend séparément (le cahier des charges parle d'un
// `ai_product_studio` et de crédits IA), c'est ici qu'on change le drapeau —
// pas dans les composants.
const STUDIO_FEATURE = 'online_store' as const;

export type AiJob = {
  id:                  string;
  product_id:          string | null;
  original_image_url:  string;
  processed_image_url: string | null;
  prompt_preset:       string;
  enhancement_type:    string;
  status:              'pending' | 'processing' | 'completed' | 'failed';
  error_message:       string | null;
  applied_at:          string | null;
  created_at:          string;
};

/** L'historique des retouches d'un produit, la plus récente d'abord. */
export async function listProductJobs(productId: string): Promise<AiJob[]> {
  await assertFeature(STUDIO_FEATURE);
  const { businessId } = await getBusinessContext();
  const svc = getSupabaseService();

  const { data } = await svc
    // La VUE, pas la table : elle n'expose pas `callback_token`.
    .from('v_ai_asset_jobs')
    .select('id, product_id, original_image_url, processed_image_url, prompt_preset, enhancement_type, status, error_message, applied_at, created_at')
    .eq('business_id', businessId)
    .eq('product_id', productId)
    .order('created_at', { ascending: false })
    .limit(12);

  return (data ?? []) as AiJob[];
}

/**
 * Applique une retouche au produit.
 *
 * Écrit `enhanced_image_url`, jamais `image_url` : voir l'en-tête.
 */
export async function applyEnhancement(jobId: string): Promise<{ imageUrl: string }> {
  await assertFeature(STUDIO_FEATURE);
  const { businessId } = await requirePermission('products:write');
  const svc = getSupabaseService();

  const { data: job } = await svc
    .from('ai_asset_jobs')
    .select('id, product_id, processed_image_url, status')
    .eq('id', jobId)
    .eq('business_id', businessId)
    .maybeSingle();

  if (!job)                             throw new Error('Retouche introuvable.');
  if (job.status !== 'completed')       throw new Error("Cette retouche n'est pas terminée.");
  if (!job.processed_image_url)         throw new Error('Cette retouche n\'a pas produit d\'image.');
  if (!job.product_id)                  throw new Error('Cette retouche n\'est liée à aucun produit.');

  const { error } = await svc
    .from('products')
    .update({ enhanced_image_url: job.processed_image_url })
    .eq('id', job.product_id)
    .eq('business_id', businessId);

  if (error) throw new Error(`Application impossible : ${error.message}`);

  await svc
    .from('ai_asset_jobs')
    .update({ applied_at: new Date().toISOString() })
    .eq('id', job.id);

  await refreshStorefront(businessId);
  revalidatePath('/products');

  return { imageUrl: job.processed_image_url };
}

/** Revient à la photo d'origine. Le travail reste en base : rien n'est perdu. */
export async function revertEnhancement(productId: string): Promise<void> {
  await assertFeature(STUDIO_FEATURE);
  const { businessId } = await requirePermission('products:write');
  const svc = getSupabaseService();

  const { error } = await svc
    .from('products')
    .update({ enhanced_image_url: null })
    .eq('id', productId)
    .eq('business_id', businessId);

  if (error) throw new Error(`Retour impossible : ${error.message}`);

  await refreshStorefront(businessId);
  revalidatePath('/products');
}

/** Le catalogue de la vitrine a changé : on invalide son cache. */
async function refreshStorefront(businessId: string) {
  const svc = getSupabaseService();
  const { data } = await svc
    .from('store_settings')
    .select('slug')
    .eq('business_id', businessId)
    .maybeSingle();

  await revalidateStore(data?.slug ?? null, businessId);
}
