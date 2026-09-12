// ─────────────────────────────────────────────────────────────────────────────
// Studio IA — le pipeline de retouche des photos produits
//
// Le problème réel : un marchand photographie son savon sur une table de
// cuisine, au néon, avec la vaisselle derrière. Le produit est bon, la photo
// tue la vente. Il n'a ni studio, ni éclairage, ni logiciel.
//
// Ce module ne fait PAS l'image. Il parle à un fournisseur qui la fait, et il
// est écrit pour qu'on puisse en changer : les fournisseurs de génération
// d'images changent de modèle tous les trimestres, et un appel `fetch` codé en
// dur au milieu d'une route API se paie au premier changement.
//
// D'où trois séparations :
//
//   Les PRESETS sont à nous. Ce sont eux qui portent le savoir métier — quel
//   décor pour quel type de produit — et ils survivent au fournisseur.
//
//   L'ADAPTATEUR est une petite interface : lancer, interpréter le rappel,
//   interroger le fournisseur. Deux implémentations livrées (Replicate,
//   fal.ai), choisies par variable d'environnement.
//
//   Les IDENTIFIANTS DE MODÈLES sont en variables d'environnement, avec des
//   valeurs par défaut. Changer de modèle ne demande pas de redéploiement.
//
// ⚠️ Les contrats HTTP des deux fournisseurs sont à vérifier contre leur
// documentation courante avant la première mise en production : ce sont les
// seules lignes de ce module qui dépendent d'un tiers.
// ─────────────────────────────────────────────────────────────────────────────

export type PresetKey =
  | 'studio_minimal'
  | 'luxury_marble'
  | 'nature_organic'
  | 'modern_podium'
  | 'vibrant_lifestyle';

export type EnhancementType = 'full' | 'background_only' | 'upscale_only';

export type Preset = {
  key:         PresetKey;
  label:       string;
  /** Ce que le marchand doit comprendre en une ligne, sans jargon. */
  description: string;
  /** Le décor demandé au modèle. En anglais : c'est la langue des modèles. */
  scene:       string;
};

export const PRESETS: Record<PresetKey, Preset> = {
  studio_minimal: {
    key: 'studio_minimal',
    label: 'Studio minimaliste',
    description: 'Fond gris clair uni, ombre douce. Le passe-partout : il va à tout.',
    scene:
      'seamless light grey studio backdrop, soft diffused key light from the upper left, ' +
      'subtle contact shadow beneath the product, centered composition',
  },
  luxury_marble: {
    key: 'luxury_marble',
    label: 'Marbre & luxe',
    description: 'Plan de marbre blanc, lumière directionnelle. Parfums, cosmétiques, bijoux.',
    scene:
      'polished white marble surface, soft directional light, elegant long shadow, ' +
      'warm neutral background, luxury boutique aesthetic',
  },
  nature_organic: {
    key: 'nature_organic',
    label: 'Nature & organique',
    description: 'Lin, bois clair, lumière du jour. Savons, tisanes, artisanat.',
    scene:
      'natural linen fabric on light wood, soft daylight from a window, ' +
      'dried botanical accents, warm organic tones',
  },
  modern_podium: {
    key: 'modern_podium',
    label: 'Podium moderne',
    description: 'Socle cylindrique, fond dégradé. Électronique, accessoires.',
    scene:
      'minimalist cylindrical podium, smooth pastel gradient backdrop, ' +
      'clean studio lighting, modern e-commerce hero shot',
  },
  vibrant_lifestyle: {
    key: 'vibrant_lifestyle',
    label: 'Couleur & énergie',
    description: 'Fond vif et contrasté. Pour les réseaux sociaux.',
    scene:
      'bright saturated color backdrop, bold contrasting shadows, ' +
      'energetic commercial advertising look',
  },
};

export const PRESET_LIST: Preset[] = Object.values(PRESETS);

export function isPresetKey(v: unknown): v is PresetKey {
  return typeof v === 'string' && v in PRESETS;
}

/**
 * L'invite envoyée au modèle.
 *
 * Le nom du produit y entre — « a bar of soap » et « a bottle of perfume » ne
 * se posent pas de la même façon sur un podium — mais il est nettoyé d'abord :
 * c'est du texte saisi par le marchand, et il finit dans une invite envoyée à
 * un tiers. Un nom de produit contenant des consignes ne doit pas devenir une
 * consigne.
 */
export function buildPrompt(preset: PresetKey, productName?: string | null): string {
  const scene = PRESETS[preset]?.scene ?? PRESETS.studio_minimal.scene;
  const subject = sanitizeSubject(productName);

  return [
    'professional commercial product photograph',
    subject ? `of ${subject}` : '',
    scene,
    'high detail, sharp focus, realistic materials, 8k, catalogue quality',
  ]
    .filter(Boolean)
    .join(', ');
}

export const NEGATIVE_PROMPT =
  'text, watermark, logo, signature, extra objects, hands, people, ' +
  'distorted product, deformed shape, blurry, low quality, cropped product';

/**
 * Réduit un nom de produit à ce qu'une invite peut contenir : des mots.
 *
 * Retire la ponctuation qui sert à structurer une consigne, les sauts de ligne,
 * et borne la longueur. Ce n'est pas une défense absolue contre l'injection
 * d'invite — il n'y en a pas — mais l'invite n'a de toute façon aucun pouvoir
 * ici : elle produit une image, pas une action.
 */
function sanitizeSubject(name?: string | null): string {
  if (!name) return '';
  return name
    .replace(/[\r\n]+/g, ' ')
    .replace(/[^\p{L}\p{N}\s'-]/gu, '')
    .trim()
    .slice(0, 60);
}

// ── L'adaptateur ────────────────────────────────────────────────────────────

export type StartInput = {
  imageUrl:        string;
  preset:          PresetKey;
  enhancementType: EnhancementType;
  productName?:    string | null;
  /** L'URL que le fournisseur rappellera. Elle porte déjà le jeton du job. */
  webhookUrl:      string;
};

export type StartResult = {
  provider:      string;
  providerJobId: string;
};

export type CallbackResult =
  | { status: 'completed'; imageUrl: string }
  | { status: 'processing' }
  | { status: 'failed'; error: string };

/**
 * Ce que rend l'interrogation directe : les trois états du rappel, plus
 * « introuvable ».
 *
 * `not_found` est à part de `failed`, et c'est voulu. `failed`, c'est le
 * fournisseur qui dit « échoué » ou « annulé » : définitif, on peut rembourser
 * tout de suite. `not_found`, c'est une réponse 404/410 sur l'identifiant : le
 * travail n'existe pas (ou plus) chez lui — définitif aussi, mais c'est la même
 * réponse que donnerait une URL d'interrogation fausse. L'appelant décide donc
 * du crédit qu'il lui accorde selon l'âge du travail (voir la route GET).
 *
 * `processing` couvre tout le reste : encore en cours, mais aussi erreur réseau,
 * délai dépassé, 5xx, 429, réponse illisible. Une panne passagère chez le
 * fournisseur ne doit jamais tuer — et rembourser — une retouche qui aboutira.
 */
export type PollResult =
  | CallbackResult
  | { status: 'not_found'; error: string };

/** Ce que l'appelant sait du travail et qui aide à retrouver la requête (fal.ai). */
export type PollContext = {
  enhancementType?: EnhancementType | null;
};

export interface EnhancementProvider {
  readonly name: string;
  start(input: StartInput): Promise<StartResult>;
  /** Interprète le corps du rappel. Ne lève pas : un rappel mal formé est un échec. */
  parseCallback(payload: unknown): CallbackResult;
  /**
   * L'identifiant de prédiction / de requête que porte le corps du rappel, ou
   * `null`. Le webhook le compare à `ai_asset_jobs.provider_job_id` : un rappel
   * qui parle d'un autre travail que celui de l'URL n'écrit rien.
   */
  callbackJobId(payload: unknown): string | null;
  /** Interrogation directe, quand le rappel s'est perdu — ou pour le vérifier. Ne lève pas. */
  poll(providerJobId: string, context?: PollContext): Promise<PollResult>;
}

/** Délai d'une requête d'interrogation. Le cron quotidien n'a que soixante secondes. */
const POLL_TIMEOUT_MS = 8_000;

/** `fetch` d'interrogation : `null` sur erreur réseau ou délai dépassé — un état passager. */
async function pollFetch(url: string, headers: Record<string, string>): Promise<Response | null> {
  try {
    return await fetch(url, { headers, signal: AbortSignal.timeout(POLL_TIMEOUT_MS) });
  } catch {
    return null;
  }
}

/** 404 et 410 : l'identifiant n'existe pas ou plus chez le fournisseur. */
function isGone(res: Response): boolean {
  return res.status === 404 || res.status === 410;
}

// ── Replicate ───────────────────────────────────────────────────────────────

const REPLICATE_API = 'https://api.replicate.com/v1';

/**
 * Les modèles, par étape, surchargeables sans redéploiement.
 *
 * On passe par l'endpoint « par modèle » (/models/{owner}/{name}/predictions)
 * et non par un hash de version figé : un hash codé en dur expire le jour où le
 * modèle est mis à jour, et l'erreur qui en résulte — 404 sur une version — ne
 * dit rien au marchand.
 */
const REPLICATE_MODELS: Record<EnhancementType, string> = {
  full:            process.env.REPLICATE_MODEL_PRODUCT_SCENE ?? 'logerzhu/ad-inpaint',
  background_only: process.env.REPLICATE_MODEL_BG_REMOVE     ?? '851-labs/background-remover',
  upscale_only:    process.env.REPLICATE_MODEL_UPSCALE       ?? 'nightmareai/real-esrgan',
};

function replicateInput(input: StartInput): Record<string, unknown> {
  const prompt = buildPrompt(input.preset, input.productName);

  switch (input.enhancementType) {
    case 'background_only':
      return { image: input.imageUrl };
    case 'upscale_only':
      return { image: input.imageUrl, scale: 4, face_enhance: false };
    default:
      return {
        image_path:      input.imageUrl,
        prompt,
        negative_prompt: NEGATIVE_PROMPT,
        image_num:       1,
        product_size:    'Original',
      };
  }
}

/** Un modèle rend une URL, une liste d'URL, ou un objet. On accepte les trois. */
function firstImageUrl(output: unknown): string | null {
  if (typeof output === 'string' && /^https?:\/\//.test(output)) return output;
  if (Array.isArray(output)) {
    // Certains modèles renvoient [masque, résultat] : la DERNIÈRE image est
    // celle qu'on veut, pas la première.
    for (let i = output.length - 1; i >= 0; i -= 1) {
      const found = firstImageUrl(output[i]);
      if (found) return found;
    }
    return null;
  }
  if (output && typeof output === 'object') {
    for (const value of Object.values(output as Record<string, unknown>)) {
      const found = firstImageUrl(value);
      if (found) return found;
    }
  }
  return null;
}

function replicateProvider(token: string): EnhancementProvider {
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  function interpret(prediction: any): CallbackResult {
    const status = prediction?.status;
    if (status === 'succeeded') {
      const url = firstImageUrl(prediction.output);
      return url
        ? { status: 'completed', imageUrl: url }
        : { status: 'failed', error: "Le modèle n'a renvoyé aucune image." };
    }
    // `aborted` : prédiction arrêtée avant d'avoir tourné (délai de mise en
    // file dépassé). Terminal comme les deux autres — sans lui, elle resterait
    // « en cours » jusqu'au seuil dur du balayage.
    if (status === 'failed' || status === 'canceled' || status === 'aborted') {
      return { status: 'failed', error: String(prediction?.error ?? 'Traitement interrompu.') };
    }
    return { status: 'processing' };
  }

  return {
    name: 'replicate',

    async start(input) {
      const model = REPLICATE_MODELS[input.enhancementType];
      const res = await fetch(`${REPLICATE_API}/models/${model}/predictions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          input: replicateInput(input),
          webhook: input.webhookUrl,
          webhook_events_filter: ['completed'],
        }),
      });

      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.id) {
        throw new Error(
          `Replicate a refusé la demande (${res.status}) : ${body?.detail ?? 'réponse illisible'}`,
        );
      }
      return { provider: 'replicate', providerJobId: String(body.id) };
    },

    parseCallback(payload) {
      return interpret(payload);
    },

    // Le rappel Replicate est l'objet prédiction lui-même : son `id` est celui
    // que `start()` a enregistré.
    callbackJobId(payload) {
      const id = (payload as any)?.id;
      return typeof id === 'string' && id ? id : null;
    },

    async poll(providerJobId) {
      const res = await pollFetch(
        `${REPLICATE_API}/predictions/${encodeURIComponent(providerJobId)}`,
        headers,
      );
      // Réseau, délai, 5xx, 429, jeton refusé : rien ne dit que la prédiction
      // est morte. Elle reste « en cours » ; le seuil dur du balayage tranchera.
      if (!res) return { status: 'processing' };
      if (isGone(res)) {
        return { status: 'not_found', error: 'Retouche introuvable ou expirée chez Replicate.' };
      }
      if (!res.ok) return { status: 'processing' };

      const body = await res.json().catch(() => null);
      return body ? interpret(body) : { status: 'processing' };
    },
  };
}

// ── fal.ai ──────────────────────────────────────────────────────────────────

const FAL_MODELS: Record<EnhancementType, string> = {
  full:            process.env.FAL_MODEL_PRODUCT_SCENE ?? 'fal-ai/flux/dev/image-to-image',
  background_only: process.env.FAL_MODEL_BG_REMOVE     ?? 'fal-ai/imageutils/rembg',
  upscale_only:    process.env.FAL_MODEL_UPSCALE       ?? 'fal-ai/esrgan',
};

const FAL_QUEUE = 'https://queue.fal.run';

/**
 * Les chemins de file sous lesquels chercher une requête fal.ai.
 *
 * L'URL d'état se construit sur le modèle (`/{modèle}/requests/{id}/status`),
 * que `provider_job_id` ne porte pas : on le reprend du type de retouche. La
 * documentation écrit le chemin complet du modèle ; le client officiel ne garde
 * que `propriétaire/application` (`fal-ai/flux` pour
 * `fal-ai/flux/dev/image-to-image`). On essaie les deux, et un 404 sous l'un
 * n'est un « introuvable » que s'il l'est aussi sous l'autre — sans quoi une
 * URL mal formée ferait passer en échec des retouches bien vivantes.
 *
 * Sans type connu, tous les modèles configurés sont candidats.
 */
function falQueuePaths(type?: EnhancementType | null): string[] {
  const models = type && FAL_MODELS[type] ? [FAL_MODELS[type]] : Object.values(FAL_MODELS);
  const paths = new Set<string>();
  for (const model of models) {
    const clean = model.replace(/^\/+|\/+$/g, '');
    if (!clean) continue;
    paths.add(clean);
    paths.add(clean.split('/').slice(0, 2).join('/'));
  }
  return [...paths];
}

/** Le `detail` d'une erreur fal : une phrase, ou une liste d'erreurs de validation. */
function falDetail(body: any, status: number): string {
  const detail = body?.detail;
  if (typeof detail === 'string' && detail) return detail;
  if (detail) return JSON.stringify(detail).slice(0, 300);
  return `fal.ai a rendu une erreur (${status}).`;
}

function falProvider(key: string): EnhancementProvider {
  const headers = {
    Authorization: `Key ${key}`,
    'Content-Type': 'application/json',
  };

  function interpret(payload: any): CallbackResult {
    const status = payload?.status;
    if (status === 'ERROR' || status === 'FAILED') {
      return { status: 'failed', error: String(payload?.error ?? 'Traitement interrompu.') };
    }
    const body = payload?.payload ?? payload;
    const url = firstImageUrl(body?.images ?? body?.image ?? body);
    if (url) return { status: 'completed', imageUrl: url };
    if (status === 'OK' || status === 'COMPLETED') {
      return { status: 'failed', error: "Le modèle n'a renvoyé aucune image." };
    }
    return { status: 'processing' };
  }

  return {
    name: 'fal',

    async start(input) {
      const model = FAL_MODELS[input.enhancementType];
      const res = await fetch(
        `https://queue.fal.run/${model}?fal_webhook=${encodeURIComponent(input.webhookUrl)}`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(
            input.enhancementType === 'full'
              ? {
                  image_url:       input.imageUrl,
                  prompt:          buildPrompt(input.preset, input.productName),
                  negative_prompt: NEGATIVE_PROMPT,
                  // Assez fort pour refaire le décor, assez faible pour que le
                  // produit reste le produit du marchand.
                  strength:        0.65,
                }
              : { image_url: input.imageUrl },
          ),
        },
      );

      const body = await res.json().catch(() => null);
      const id = body?.request_id ?? body?.requestId;
      if (!res.ok || !id) {
        throw new Error(
          `fal.ai a refusé la demande (${res.status}) : ${body?.detail ?? 'réponse illisible'}`,
        );
      }
      return { provider: 'fal', providerJobId: String(id) };
    },

    parseCallback(payload) {
      return interpret(payload);
    },

    // Le rappel fal porte `request_id` — celui que la mise en file a rendu à
    // `start()`. (`gateway_request_id` peut différer : on ne s'en sert pas.)
    callbackJobId(payload) {
      const id = (payload as any)?.request_id ?? (payload as any)?.requestId;
      return typeof id === 'string' && id ? id : null;
    },

    // L'ancienne interrogation visait `queue.fal.run/requests/{id}`, une URL
    // sans modèle que la documentation ne connaît pas, et prenait toute
    // réponse non-OK pour « en cours » : une requête fal perdue ne se terminait
    // jamais. On suit désormais le contrat documenté — état, puis résultat.
    async poll(providerJobId, context) {
      const id = encodeURIComponent(providerJobId);

      for (const path of falQueuePaths(context?.enhancementType)) {
        const res = await pollFetch(`${FAL_QUEUE}/${path}/requests/${id}/status`, headers);
        if (!res) return { status: 'processing' };
        if (isGone(res)) continue;                 // pas sous ce chemin : le suivant
        if (!res.ok) return { status: 'processing' };

        const state = await res.json().catch(() => null);
        // IN_QUEUE, IN_PROGRESS, ou réponse illisible : on repassera.
        if (state?.status !== 'COMPLETED') return { status: 'processing' };
        // Une requête terminée en erreur est COMPLETED avec un `error`.
        if (state.error) return { status: 'failed', error: String(state.error) };

        // L'URL du résultat que fal indique, si elle est bien chez fal : la clé
        // d'API part avec la requête, elle ne doit pas partir ailleurs.
        const resultUrl =
          typeof state.response_url === 'string' && state.response_url.startsWith(`${FAL_QUEUE}/`)
            ? state.response_url
            : `${FAL_QUEUE}/${path}/requests/${id}`;

        const out = await pollFetch(resultUrl, headers);
        if (!out) return { status: 'processing' };
        if (isGone(out)) {
          return { status: 'not_found', error: 'Résultat expiré ou introuvable chez fal.ai.' };
        }
        const body = await out.json().catch(() => null);
        if (!out.ok) {
          // Terminée, mais le résultat est une erreur (validation, modèle) :
          // définitif. Accès refusé, délai, quota, 5xx : passager.
          const transient = [401, 403, 408, 429].includes(out.status) || out.status >= 500;
          return transient
            ? { status: 'processing' }
            : { status: 'failed', error: falDetail(body, out.status) };
        }
        if (!body) return { status: 'processing' };

        const url = firstImageUrl(body.images ?? body.image ?? body);
        return url
          ? { status: 'completed', imageUrl: url }
          : { status: 'failed', error: "Le modèle n'a renvoyé aucune image." };
      }

      // 404 sous tous les chemins candidats.
      return { status: 'not_found', error: 'Retouche introuvable ou expirée chez fal.ai.' };
    },
  };
}

// ── Sélection ───────────────────────────────────────────────────────────────

/**
 * Le fournisseur configuré, ou `null`.
 *
 * `null` n'est pas une erreur : c'est l'état d'une installation où le Studio IA
 * n'est pas activé. L'appelant doit le dire au marchand — « cette fonction
 * n'est pas activée » — et non lui montrer une erreur technique.
 */
export function getEnhancementProvider(): EnhancementProvider | null {
  const preferred = process.env.AI_IMAGE_PROVIDER?.toLowerCase();
  const replicateToken = process.env.REPLICATE_API_TOKEN;
  const falKey = process.env.FAL_KEY ?? process.env.FAL_API_KEY;

  if (preferred === 'fal'       && falKey)         return falProvider(falKey);
  if (preferred === 'replicate' && replicateToken) return replicateProvider(replicateToken);

  if (replicateToken) return replicateProvider(replicateToken);
  if (falKey)         return falProvider(falKey);
  return null;
}
