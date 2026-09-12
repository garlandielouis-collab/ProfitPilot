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
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { assertFeature } from '../../../../lib/entitlements';
import { getBusinessContext } from '../../../../lib/serverAuth';
import { getSupabaseService } from '../../../../lib/supabaseServiceClient';
import {
  IMAGE_CREDIT_ACTION,
  IMAGE_JOB_STALE_MS,
  InsufficientCreditsError,
  deliverImageJob,
  failImageJob,
  imageJobCreditRef,
  refundDebit,
  spendCredits,
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
  //
  // Le geste facturé dépend de la retouche : un détourage ne coûte pas le prix
  // d'un agrandissement (`IMAGE_CREDIT_ACTION`).
  //
  // L'identifiant du travail est tiré ICI, avant le débit, pour que le débit
  // porte la référence du travail et non celle du produit. Un échec peut être
  // découvert bien après — rappel du fournisseur, interrogation directe — et le
  // remboursement doit alors retrouver exactement CE débit : sous
  // `product:<id>`, la deuxième retouche d'un même produit se confondrait avec
  // la première.
  const creditAction = IMAGE_CREDIT_ACTION[enhancementType];
  const jobId        = randomUUID();
  const creditRef    = imageJobCreditRef(jobId);
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
      id:                 jobId,
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
    // Rien n'est parti chez le fournisseur : le crédit revient — le montant
    // réellement débité, lu dans le grand livre.
    await refundDebit(ctx.businessId, creditRef);
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
        provider:        started.provider,
        provider_job_id: started.providerJobId,
      })
      .eq('id', job.id);

    // `processing` seulement si le travail est encore `pending`. Un fournisseur
    // rapide peut avoir déjà rappelé — terminé, ou échoué et remboursé — et
    // réécrire `processing` par-dessus rouvrirait un travail clos : il
    // pourrait alors être « échoué » une seconde fois par l'interrogation.
    await svc
      .from('ai_asset_jobs')
      .update({ status: 'processing' })
      .eq('id', job.id)
      .eq('status', 'pending');

    return NextResponse.json({ jobId: job.id, status: 'processing' }, { status: 202 });
  } catch (err) {
    // L'échec est écrit sur le travail, pas seulement renvoyé : le marchand
    // doit retrouver la raison en rouvrant le Studio, pas seulement dans le
    // message éphémère qui a disparu quand il a changé d'écran.
    //
    // Le fournisseur a refusé le travail : un travail raté ne se facture pas.
    // `failImageJob` écrit l'échec et rembourse, une seule fois.
    const message = err instanceof Error ? err.message : 'Lancement impossible.';
    await failImageJob({ id: job.id, business_id: ctx.businessId }, message);

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

  const businessId = ctx.businessId;
  const svc = getSupabaseService();
  const readJob = async () => {
    const { data } = await svc
      .from('ai_asset_jobs')
      .select('id, status, processed_image_url, original_image_url, error_message, provider, provider_job_id, enhancement_type, created_at, prompt_preset')
      .eq('id', jobId)
      .eq('business_id', businessId)   // cloisonnement : pas le travail d'un autre
      .maybeSingle();
    return data;
  };

  const job = await readJob();

  if (!job) {
    return NextResponse.json({ error: 'Travail introuvable.' }, { status: 404 });
  }

  const age   = Date.now() - new Date(job.created_at).getTime();
  const stale = job.status === 'processing' && age > 20_000;

  if (stale && job.provider_job_id) {
    const provider = getEnhancementProvider();
    if (provider && provider.name === job.provider) {
      const result = await provider
        .poll(job.provider_job_id, { enhancementType: job.enhancement_type })
        .catch(() => null);

      // Le rappel du fournisseur peut arriver pendant qu'on interroge. Les deux
      // chemins passent par les mêmes transitions conditionnelles : le premier
      // qui écrit gagne, le second ne change rien — et en particulier ne
      // rembourse pas une seconde fois. D'où la relecture : on renvoie l'état
      // réellement en base, pas celui que CET appel croyait écrire.
      if (result?.status === 'completed') {
        // Même règle que le rappel (`deliverImageJob`) : image irrécupérable,
        // échec, remboursement. Laisser lever gardait le travail « en cours »
        // pour toujours — le Studio ignore les réponses en erreur et réinterroge
        // sans fin.
        await deliverImageJob({ id: job.id, business_id: businessId }, result.imageUrl);
        return NextResponse.json((await readJob()) ?? job);
      }

      // « Introuvable » n'est cru qu'au-delà du seuil du balayage. Avant, un
      // 404 peut venir d'une URL d'interrogation fausse (fal.ai) ou d'un
      // fournisseur pas encore à jour, et le prendre au mot tuerait — et
      // rembourserait — une retouche que le rappel s'apprête à livrer.
      if (
        result?.status === 'failed' ||
        (result?.status === 'not_found' && age > IMAGE_JOB_STALE_MS)
      ) {
        await failImageJob({ id: job.id, business_id: businessId }, result.error);
        return NextResponse.json((await readJob()) ?? job);
      }
    }
  }

  return NextResponse.json(job);
}
