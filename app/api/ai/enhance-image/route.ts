// ─────────────────────────────────────────────────────────────────────────────
// POST /api/ai/enhance-image   — lance une retouche
// GET  /api/ai/enhance-image?jobId=…  — état d'une retouche
//
// Le traitement est ASYNCHRONE et c'est délibéré. Une génération d'image prend
// entre dix secondes et deux minutes ; tenir la requête ouverte pendant ce
// temps expose à trois échecs qu'on ne contrôle pas : le délai de la fonction
// serverless, celui du navigateur, et la connexion mobile du marchand qui passe
// sous un tunnel. On enregistre un travail, on rend la main, le fournisseur
// nous rappelle.
//
// La retouche n'est JAMAIS appliquée au produit ici. Elle atterrit dans
// `ai_asset_jobs.processed_image_url`, le marchand la compare, et c'est lui qui
// décide (`applyEnhancement`). Une IA qui remplace d'autorité la photo d'un
// produit en vente est une IA qu'on désactive le lendemain.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { assertFeature } from '../../../../lib/entitlements';
import { getBusinessContext } from '../../../../lib/serverAuth';
import { getSupabaseService } from '../../../../lib/supabaseServiceClient';
import { storeResultImage } from '../../../../lib/ai/storeResultImage';
import {
  InsufficientCreditsError,
  refundCredits,
  spendCredits,
  type AiAction,
} from '../../../../lib/ai/credits';
import {
  getEnhancementProvider,
  isPresetKey,
  type EnhancementType,
} from '../../../../lib/ai/imageEnhancer';

export const runtime = 'nodejs';
// Un travail se crée, il ne se met pas en cache.
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  productId: z.string().uuid(),
  preset:    z.string().refine(isPresetKey, 'Style inconnu.'),
  enhancementType: z
    .enum(['full', 'background_only', 'upscale_only'])
    .default('full'),
});

/**
 * Le geste facturé, selon la retouche demandée. Les trois clés sont les trois
 * lignes « image » de `ai_credit_costs` : un détourage ne coûte pas le prix
 * d'un agrandissement.
 */
const CREDIT_ACTION: Record<z.infer<typeof bodySchema>['enhancementType'], AiAction> = {
  full:            'image_enhance',
  background_only: 'image_background',
  upscale_only:    'image_upscale',
};

/** L'URL publique de l'application, celle que le fournisseur devra rappeler. */
function appUrl(): string | null {
  const explicit = process.env.NEXT_PUBLIC_APP_URL;
  if (explicit) return explicit.replace(/\/$/, '');
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  return vercel ? `https://${vercel}` : null;
}

export async function POST(request: Request) {
  // ── 1. Qui, et pour quelle entreprise ──────────────────────────────────────
  let ctx;
  try {
    ctx = await getBusinessContext();
  } catch {
    return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 });
  }

  if (!ctx.can('products:write')) {
    return NextResponse.json(
      { error: "Vous n'avez pas le droit de modifier les produits." },
      { status: 403 },
    );
  }

  // L'offre, vérifiée ici et pas seulement dans la navigation. Une route API
  // est un point d'entrée public : `components/nav.tsx` masquait l'écran, il
  // n'empêchait pas l'appel — et chaque appel coûte de l'argent réel chez le
  // fournisseur d'images.
  try {
    await assertFeature('online_store');
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Fonctionnalité non disponible.' },
      { status: 402 },
    );
  }

  // ── 2. Le fournisseur est-il configuré ? ───────────────────────────────────
  const provider = getEnhancementProvider();
  if (!provider) {
    // Ce n'est pas une panne : c'est une fonction non activée. Le message le
    // dit, plutôt que de laisser le marchand devant une erreur 500.
    return NextResponse.json(
      {
        error:
          "Le Studio IA n'est pas activé sur cette installation. " +
          'Ajoutez REPLICATE_API_TOKEN ou FAL_KEY dans les variables d\'environnement.',
        code: 'provider_not_configured',
      },
      { status: 503 },
    );
  }

  const callbackBase = appUrl();
  if (!callbackBase) {
    return NextResponse.json(
      {
        error:
          "L'adresse publique de l'application est inconnue : le fournisseur ne peut pas " +
          'renvoyer le résultat. Renseignez NEXT_PUBLIC_APP_URL.',
        code: 'app_url_missing',
      },
      { status: 503 },
    );
  }

  // ── 3. La demande ──────────────────────────────────────────────────────────
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
  }
  const { productId, preset, enhancementType } = parsed.data;

  // ── 4. Le produit appartient-il bien à ce marchand ? ───────────────────────
  //
  // Cadré par l'entreprise ouverte. Sans ce filtre, un identifiant de produit
  // deviné ferait retoucher — et facturer — la photo d'un autre marchand.
  const svc = getSupabaseService();
  const { data: product } = await svc
    .from('products')
    .select('id, name, image_url, business_id')
    .eq('id', productId)
    .eq('business_id', ctx.businessId)
    .maybeSingle();

  if (!product) {
    return NextResponse.json({ error: 'Produit introuvable.' }, { status: 404 });
  }
  if (!product.image_url) {
    return NextResponse.json(
      { error: "Ce produit n'a pas encore de photo à retoucher.", code: 'no_source_image' },
      { status: 400 },
    );
  }

  // ── 5. Le débit ────────────────────────────────────────────────────────────
  //
  // AVANT le travail et AVANT le fournisseur. `image_enhance` figurait dans la
  // grille tarifaire, mais personne ne le débitait : chaque retouche était un
  // appel payant chez un tiers, sans plafond, là où la rédaction et le
  // merchandising s'arrêtent au solde. Même schéma qu'eux (`lib/ai/credits.ts`)
  // — et même tolérance : fonctions de crédit absentes de la base, on laisse
  // passer plutôt que de fermer le Studio.
  const creditAction = CREDIT_ACTION[enhancementType];
  const creditRef    = `product:${product.id}`;
  try {
    await spendCredits(ctx.businessId, ctx.userId, creditAction, creditRef);
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      // 402 et la phrase de `InsufficientCreditsError` telle quelle : le Studio
      // affiche `error`, et elle dit le coût, le solde et la date de recharge.
      return NextResponse.json(
        { error: err.message, code: 'insufficient_credits', cost: err.cost, remaining: err.remaining },
        { status: 402 },
      );
    }
    return NextResponse.json(
      { error: 'Impossible de vérifier vos crédits IA pour le moment. Réessayez dans un instant.' },
      { status: 500 },
    );
  }

  // ── 6. Le travail ──────────────────────────────────────────────────────────
  const { data: job, error: jobErr } = await svc
    .from('ai_asset_jobs')
    .insert({
      business_id:        ctx.businessId,
      user_id:            ctx.userId,
      product_id:         product.id,
      original_image_url: product.image_url,
      prompt_preset:      preset,
      enhancement_type:   enhancementType as EnhancementType,
      status:             'pending',
      provider:           provider.name,
    })
    .select('id, callback_token')
    .single();

  if (jobErr || !job) {
    // Rien n'est parti chez le fournisseur : le crédit revient.
    await refundCredits(ctx.businessId, creditAction, creditRef);
    return NextResponse.json(
      { error: "Impossible d'enregistrer la demande." },
      { status: 500 },
    );
  }

  // ── 7. Le lancement ────────────────────────────────────────────────────────
  const webhookUrl =
    `${callbackBase}/api/ai/enhance-image/webhook` +
    `?job=${job.id}&token=${encodeURIComponent(job.callback_token)}`;

  try {
    const started = await provider.start({
      imageUrl:        product.image_url,
      preset,
      enhancementType: enhancementType as EnhancementType,
      productName:     product.name,
      webhookUrl,
    });

    await svc
      .from('ai_asset_jobs')
      .update({
        status:          'processing',
        provider:        started.provider,
        provider_job_id: started.providerJobId,
      })
      .eq('id', job.id);

    return NextResponse.json({ jobId: job.id, status: 'processing' }, { status: 202 });
  } catch (err) {
    // L'échec est écrit sur le travail, pas seulement renvoyé : le marchand
    // doit retrouver la raison en rouvrant le Studio, pas seulement dans le
    // message éphémère qui a disparu quand il a changé d'écran.
    const message = err instanceof Error ? err.message : 'Lancement impossible.';
    await svc
      .from('ai_asset_jobs')
      .update({ status: 'failed', error_message: message })
      .eq('id', job.id);

    // Le fournisseur a refusé le travail : un travail raté ne se facture pas.
    await refundCredits(ctx.businessId, creditAction, creditRef);

    return NextResponse.json({ error: message, jobId: job.id }, { status: 502 });
  }
}

// ── État d'un travail ───────────────────────────────────────────────────────
//
// Le navigateur interroge cette route pendant le traitement. Elle sert aussi de
// filet quand le rappel du fournisseur s'est perdu — réseau, redéploiement,
// URL publique changée : au-delà de vingt secondes, on va demander directement.

export async function GET(request: Request) {
  let ctx;
  try {
    ctx = await getBusinessContext();
  } catch {
    return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 });
  }

  const jobId = new URL(request.url).searchParams.get('jobId');
  if (!jobId) {
    return NextResponse.json({ error: 'jobId manquant.' }, { status: 400 });
  }

  const svc = getSupabaseService();
  const { data: job } = await svc
    .from('ai_asset_jobs')
    .select('id, status, processed_image_url, original_image_url, error_message, provider, provider_job_id, created_at, prompt_preset')
    .eq('id', jobId)
    .eq('business_id', ctx.businessId)   // cloisonnement : pas le travail d'un autre
    .maybeSingle();

  if (!job) {
    return NextResponse.json({ error: 'Travail introuvable.' }, { status: 404 });
  }

  const stale =
    job.status === 'processing' &&
    Date.now() - new Date(job.created_at).getTime() > 20_000;

  if (stale && job.provider_job_id) {
    const provider = getEnhancementProvider();
    if (provider && provider.name === job.provider) {
      const result = await provider.poll(job.provider_job_id).catch(() => null);

      if (result?.status === 'completed') {
        const stored = await storeResultImage(result.imageUrl, ctx.businessId, job.id);
        await svc
          .from('ai_asset_jobs')
          .update({ status: 'completed', processed_image_url: stored })
          .eq('id', job.id);
        return NextResponse.json({ ...job, status: 'completed', processed_image_url: stored });
      }

      if (result?.status === 'failed') {
        await svc
          .from('ai_asset_jobs')
          .update({ status: 'failed', error_message: result.error })
          .eq('id', job.id);
        return NextResponse.json({ ...job, status: 'failed', error_message: result.error });
      }
    }
  }

  return NextResponse.json(job);
}
