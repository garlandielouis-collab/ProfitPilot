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
// ── Le jeton ne suffit pas ──────────────────────────────────────────────────
//
// L'URL complète, jeton compris, finit dans des journaux : les nôtres, ceux du
// fournisseur, ceux d'un proxy. Qui la lit pouvait envoyer un faux « échec » —
// travail tué, crédits rendus — ou un faux « terminé » avec l'image de son
// choix. Aucune écriture n'a donc lieu avant quatre vérifications, dans cet
// ordre :
//
//   1. LE JETON de l'URL, en temps constant.
//   2. LA SIGNATURE du fournisseur, quand il en pose une et que le secret est
//      configuré : Replicate (`REPLICATE_WEBHOOK_SECRET`). Sans le secret, la
//      route fonctionne comme avant et le journalise — la poser ne doit pas
//      être la condition pour que la production tienne le jour du déploiement.
//      fal.ai signe aussi (ED25519, clés publiées en JWKS) : vérifiée quand
//      `FAL_WEBHOOK_VERIFY=1` (lib/ai/falWebhookSignature.ts). Clés JWKS
//      injoignables : non vérifiable, pas refusée — les couches 3 et 4
//      tiennent.
//   3. L'IDENTIFIANT : le rappel doit parler de la prédiction que CE travail a
//      lancée (`provider_job_id`). Un travail qui n'en a pas encore n'est pas
//      touché — l'interrogation du Studio ou le balayage quotidien s'en
//      chargeront.
//   4. LE FOURNISSEUR CONFIRME : le corps n'est pas cru sur parole. On
//      réinterroge le fournisseur ; un échec n'est écrit que s'il le confirme,
//      et l'image livrée est celle qu'il désigne, pas celle du corps.
//
// Le rappel répond toujours 200, y compris sur un travail déjà traité, inconnu
// ou refusé. Un fournisseur qui reçoit une erreur réessaie, parfois longtemps ;
// et un code d'erreur différencié dirait à qui sonde la route quels
// identifiants de travail existent. Un rappel ignoré ne perd rien : le travail
// reste ouvert, et le balayage du cron quotidien le clôt.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { getSupabaseService } from '../../../../../lib/supabaseServiceClient';
import { getEnhancementProvider } from '../../../../../lib/ai/imageEnhancer';
import { deliverImageJob, failImageJob } from '../../../../../lib/ai/credits';
import { verifyFalSignature } from '../../../../../lib/ai/falWebhookSignature';

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

// ── Signature Replicate ─────────────────────────────────────────────────────
//
// Schéma « Standard Webhooks » : en-têtes `webhook-id`, `webhook-timestamp`,
// `webhook-signature` ; HMAC-SHA256 de `${id}.${timestamp}.${corps brut}` avec
// le secret `whsec_…` décodé de base64 ; la signature, en base64, préfixée de
// `v1,`, éventuellement plusieurs séparées par des espaces (rotation du secret).

/** Écart toléré entre l'horodatage signé et notre horloge. Au-delà : rejeu. */
const SIGNATURE_TOLERANCE_S = 5 * 60;

type SignatureCheck = 'valid' | 'invalid' | 'disabled';

/** Un avertissement par instance, pas un par rappel. */
let warnedUnsigned = false;

function verifyReplicateSignature(headers: Headers, rawBody: string): SignatureCheck {
  const secret = process.env.REPLICATE_WEBHOOK_SECRET?.trim();
  if (!secret) return 'disabled';

  const id        = headers.get('webhook-id');
  const timestamp = headers.get('webhook-timestamp');
  const signature = headers.get('webhook-signature');
  if (!id || !timestamp || !signature) return 'invalid';

  const sentAt = Number(timestamp);
  if (!Number.isFinite(sentAt) || Math.abs(Date.now() / 1000 - sentAt) > SIGNATURE_TOLERANCE_S) {
    return 'invalid';
  }

  const key = Buffer.from(
    secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret,
    'base64',
  );
  if (key.length === 0) {
    // Secret posé mais illisible : on refuse. Qui a posé un secret veut que
    // la signature soit exigée, et les travaux refusés ici ne sont pas perdus.
    console.error('[ai-webhook] REPLICATE_WEBHOOK_SECRET illisible : rappels Replicate refusés.');
    return 'invalid';
  }

  const expected = createHmac('sha256', key)
    .update(`${id}.${timestamp}.${rawBody}`, 'utf8')
    .digest();

  const matches = signature.split(' ').some((entry) => {
    const [version, value] = entry.split(',', 2);
    if (version !== 'v1' || !value) return false;
    const received = Buffer.from(value, 'base64');
    return received.length === expected.length && timingSafeEqual(received, expected);
  });

  return matches ? 'valid' : 'invalid';
}

export async function POST(request: Request) {
  // Le corps BRUT d'abord : la signature porte sur les octets envoyés, pas sur
  // un JSON relu puis re-sérialisé.
  const rawBody = await request.text().catch(() => '');

  const url   = new URL(request.url);
  const jobId = url.searchParams.get('job');
  const token = url.searchParams.get('token');

  if (!jobId || !token) return ok();

  // ── 1. Le jeton ────────────────────────────────────────────────────────────
  const svc = getSupabaseService();
  const { data: job } = await svc
    .from('ai_asset_jobs')
    .select('id, business_id, status, callback_token, provider, provider_job_id, enhancement_type')
    .eq('id', jobId)
    .maybeSingle();

  if (!job || typeof job.callback_token !== 'string' || !tokensMatch(token, job.callback_token)) {
    return ok();
  }

  // Rappel en double : les fournisseurs en envoient, et un travail déjà terminé
  // ne doit pas voir son image remplacée par un second téléchargement. Ce n'est
  // qu'un raccourci : la garantie contre le double remboursement est la
  // transition conditionnelle de `failImageJob` / `completeImageJob`, qui tient
  // aussi quand l'interrogation directe passe entre cette lecture et l'écriture.
  if (job.status === 'completed' || job.status === 'failed') return ok();

  // Le rappel s'interprète avec l'adaptateur qui a lancé le travail. Si la
  // configuration a changé depuis, on ne sait ni le lire ni le vérifier.
  const provider = getEnhancementProvider();
  if (!provider || provider.name !== job.provider) return ok();

  // ── 2. La signature ────────────────────────────────────────────────────────
  let signature: SignatureCheck = 'disabled';
  if (provider.name === 'replicate') {
    signature = verifyReplicateSignature(request.headers, rawBody);
    if (signature === 'invalid') {
      console.warn('[ai-webhook] rappel Replicate à la signature invalide, ignoré', job.id);
      return ok();
    }
    if (signature === 'disabled' && !warnedUnsigned) {
      warnedUnsigned = true;
      console.warn(
        '[ai-webhook] REPLICATE_WEBHOOK_SECRET absente : la signature des rappels Replicate ' +
        "n'est pas vérifiée (restent le jeton, l'identifiant et la réinterrogation).",
      );
    }
  } else if (provider.name === 'fal') {
    // Désactivée ou clés injoignables : 'disabled', journalisé dans le module.
    signature = await verifyFalSignature(request.headers, rawBody);
    if (signature === 'invalid') {
      console.warn('[ai-webhook] rappel fal à la signature invalide, ignoré', job.id);
      return ok();
    }
  }

  // ── 3. L'identifiant ───────────────────────────────────────────────────────
  //
  // Pas encore d'identifiant de fournisseur : le lancement n'a pas fini
  // d'écrire, ou son écriture a échoué. Rien à comparer, donc rien à écrire.
  if (!job.provider_job_id) return ok();

  let payload: unknown = null;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return ok();
  }

  if (provider.callbackJobId(payload) !== job.provider_job_id) {
    console.warn('[ai-webhook] rappel pour une autre prédiction que celle du travail, ignoré', job.id);
    return ok();
  }

  const claimed = provider.parseCallback(payload);
  if (claimed.status === 'processing') return ok();

  // ── 4. Le fournisseur confirme ─────────────────────────────────────────────
  const confirmed = await provider
    .poll(job.provider_job_id, { enhancementType: job.enhancement_type })
    .catch(() => ({ status: 'processing' as const }));

  if (confirmed.status === 'completed') {
    // L'image que le fournisseur désigne, pas celle du corps. Si le
    // téléchargement échoue, échec et remboursement (`deliverImageJob`).
    await deliverImageJob(job, confirmed.imageUrl);
    return ok();
  }

  if (confirmed.status === 'failed') {
    await failImageJob(job, confirmed.error);
    return ok();
  }

  if (confirmed.status === 'not_found') {
    // Introuvable chez le fournisseur : cela confirme un échec annoncé. Cela
    // contredit un succès annoncé — on ne livre pas une image que le
    // fournisseur ne connaît pas ; le balayage tranchera.
    if (claimed.status === 'failed') {
      await failImageJob(job, confirmed.error);
    } else {
      console.warn('[ai-webhook] succès annoncé, prédiction introuvable chez le fournisseur', job.id);
    }
    return ok();
  }

  // Le fournisseur ne répond pas (réseau, 5xx) ou pas encore. Un succès dont
  // la signature a été VÉRIFIÉE peut être livré sur la foi du corps : c'est
  // bien le fournisseur qui parle. Tout le reste attend l'interrogation du Studio
  // ou le balayage — un échec n'est jamais écrit sans confirmation.
  if (claimed.status === 'completed' && signature === 'valid') {
    await deliverImageJob(job, claimed.imageUrl);
  }
  return ok();
}

// Certains fournisseurs vérifient l'accessibilité de l'URL par un GET avant de
// l'utiliser. On répond, sans rien divulguer.
export async function GET() {
  return NextResponse.json({ ok: true });
}
