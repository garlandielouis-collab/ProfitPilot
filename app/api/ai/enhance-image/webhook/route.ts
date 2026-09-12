// ─────────────────────────────────────────────────────────────────────────────
// POST /api/ai/enhance-image/webhook?job=…&token=…
//
// Le fournisseur nous rappelle ici quand l'image est prête. Cette route est
// PUBLIQUE — elle doit l'être, un service tiers ne peut pas porter la session
// du marchand — et c'est ce qui la rend délicate.
//
// Sans authentification, n'importe qui connaissant la forme de l'URL pourrait
// POSTer un lien d'image arbitraire et le voir remplacer la photo produit d'un
// marchand. D'où le jeton : généré à la création du travail
// (`ai_asset_jobs.callback_token`, 24 octets aléatoires), jamais exposé au
// navigateur — la vue `v_ai_asset_jobs` que lit l'éditeur ne contient pas la
// colonne — et comparé ici en temps constant.
//
// Ce jeton garde aussi le remboursement : un rappel « échec » rend les crédits
// de la retouche, et aucun changement d'état n'a lieu avant sa vérification.
//
// Le rappel répond toujours 200, y compris sur un travail déjà traité ou
// inconnu. Un fournisseur qui reçoit une erreur réessaie, parfois longtemps ;
// et un code d'erreur différencié dirait à qui sonde la route quels
// identifiants de travail existent.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { getSupabaseService } from '../../../../../lib/supabaseServiceClient';
import { getEnhancementProvider } from '../../../../../lib/ai/imageEnhancer';
import { storeResultImage } from '../../../../../lib/ai/storeResultImage';
import { completeImageJob, failImageJob } from '../../../../../lib/ai/credits';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Comparaison à durée constante : deux chaînes de longueurs différentes incluses. */
function tokensMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

const ok = () => NextResponse.json({ received: true });

export async function POST(request: Request) {
  const url   = new URL(request.url);
  const jobId = url.searchParams.get('job');
  const token = url.searchParams.get('token');

  if (!jobId || !token) return ok();

  const svc = getSupabaseService();
  const { data: job } = await svc
    .from('ai_asset_jobs')
    .select('id, business_id, status, callback_token, provider')
    .eq('id', jobId)
    .maybeSingle();

  if (!job || !tokensMatch(token, job.callback_token)) return ok();

  // Rappel en double : les fournisseurs en envoient, et un travail déjà terminé
  // ne doit pas voir son image remplacée par un second téléchargement. Ce n'est
  // qu'un raccourci : la garantie contre le double remboursement est la
  // transition conditionnelle de `failImageJob` / `completeImageJob`, qui tient
  // aussi quand l'interrogation directe passe entre cette lecture et l'écriture.
  if (job.status === 'completed' || job.status === 'failed') return ok();

  const provider = getEnhancementProvider();
  if (!provider) return ok();

  const payload = await request.json().catch(() => null);
  const result  = provider.parseCallback(payload);

  if (result.status === 'processing') return ok();

  if (result.status === 'failed') {
    // Rien ne sera livré : échec, et le crédit débité au lancement revient.
    await failImageJob(job, result.error);
    return ok();
  }

  // Terminé : on rapatrie l'image avant de marquer le travail terminé. Si le
  // téléchargement échoue, le travail passe en échec — plutôt que d'être marqué
  // « terminé » avec l'URL éphémère d'un fournisseur, qui expirera en silence —
  // et le marchand, qui ne reçoit rien, est remboursé.
  let stored: string;
  try {
    stored = await storeResultImage(result.imageUrl, job.business_id, job.id);
  } catch (err) {
    await failImageJob(job, err instanceof Error ? err.message : 'Image irrécupérable.');
    return ok();
  }

  await completeImageJob(job.id, stored).catch(() => false);
  return ok();
}

// Certains fournisseurs vérifient l'accessibilité de l'URL par un GET avant de
// l'utiliser. On répond, sans rien divulguer.
export async function GET() {
  return NextResponse.json({ ok: true });
}
