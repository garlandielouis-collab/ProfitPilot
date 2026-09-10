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
//   L'ADAPTATEUR est une interface à deux fonctions : lancer, interpréter le
//   rappel. Deux implémentations livrées (Replicate, fal.ai), choisies par
//   variable d'environnement.
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

export interface EnhancementProvider {
  readonly name: string;
  start(input: StartInput): Promise<StartResult>;
  /** Interprète le corps du rappel. Ne lève pas : un rappel mal formé est un échec. */
  parseCallback(payload: unknown): CallbackResult;
  /** Interrogation directe, quand le rappel s'est perdu. */
  poll(providerJobId: string): Promise<CallbackResult>;
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
    if (status === 'failed' || status === 'canceled') {
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

    async poll(providerJobId) {
      const res = await fetch(`${REPLICATE_API}/predictions/${providerJobId}`, { headers });
      if (!res.ok) return { status: 'processing' };
      return interpret(await res.json().catch(() => null));
    },
  };
}

// ── fal.ai ──────────────────────────────────────────────────────────────────

const FAL_MODELS: Record<EnhancementType, string> = {
  full:            process.env.FAL_MODEL_PRODUCT_SCENE ?? 'fal-ai/flux/dev/image-to-image',
  background_only: process.env.FAL_MODEL_BG_REMOVE     ?? 'fal-ai/imageutils/rembg',
  upscale_only:    process.env.FAL_MODEL_UPSCALE       ?? 'fal-ai/esrgan',
};

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

    async poll(providerJobId) {
      const res = await fetch(`https://queue.fal.run/requests/${providerJobId}`, { headers });
      if (!res.ok) return { status: 'processing' };
      return interpret(await res.json().catch(() => null));
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
