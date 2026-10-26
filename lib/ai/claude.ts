// ─────────────────────────────────────────────────────────────────────────────
// Claude, pour lire ce que le marchand dit ou photographie
//
// Deux usages de l'étude de marché inversée, un seul chemin :
//   · F02 « Pale ak kaye a » — une phrase kreyòl déjà transcrite devient une
//     vente, une dépense ou un crédit structuré ;
//   · F10 « Pran foto kaye ou » — une page de cahier manuscrite devient la
//     liste « qui me doit combien ».
//
// Sortie structurée (`output_config.format`) : la réponse respecte le schéma
// JSON, on ne la devine pas dans du texte libre. Et repli serveur sur refus
// (`fallbacks: "default"`) : si les filtres de sécurité déclinent une requête,
// l'API la rejoue sur le modèle de repli recommandé au lieu de rendre un refus.
//
// Serveur seulement : la clé `ANTHROPIC_API_KEY` ne quitte jamais le serveur.
// ─────────────────────────────────────────────────────────────────────────────

import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-opus-5-5';

let client: Anthropic | null = null;

/** Le client, ou `null` quand la clé n'est pas posée : l'appelant dégrade. */
function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  client ??= new Anthropic();
  return client;
}

export function claudeAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

type Effort = 'low' | 'medium' | 'high';

/**
 * Une extraction structurée : la réponse de Claude, conforme à `schema`, ou
 * `null` (pas de clé, refus, réponse inexploitable, panne). Jamais d'exception :
 * une lecture qui échoue renvoie le marchand à la saisie au clavier, elle ne
 * casse pas l'écran.
 */
export async function extractJson<T>(input: {
  system: string;
  content: Anthropic.Beta.BetaContentBlockParam[];
  schema: Record<string, unknown>;
  effort?: Effort;
}): Promise<T | null> {
  const anthropic = getClient();
  if (!anthropic) return null;

  try {
    const response = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: input.system,
      messages: [{ role: 'user', content: input.content }],
      output_config: {
        // Une phrase à comprendre n'a pas besoin de réfléchir longtemps ; une
        // page manuscrite, si. Claude Opus 5.5 pense toujours : l'effort est
        // le seul réglage de profondeur.
        effort: input.effort ?? 'low',
        format: { type: 'json_schema', schema: input.schema },
      },
    });

    if (response.stop_reason === 'refusal') return null;

    const text = response.content
      .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');
    if (!text) return null;
    return JSON.parse(text) as T;
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      console.error('[claude] limite de débit atteinte');
    } else if (error instanceof Anthropic.APIError) {
      console.error(`[claude] erreur API ${error.status}:`, error.message);
    } else {
      console.error('[claude] extraction impossible:', error instanceof Error ? error.message : error);
    }
    return null;
  }
}
