// ─────────────────────────────────────────────────────────────────────────────
// L'extraction — de la transcription aux opérations (§2.2, « Extraction » et
// « Normalisation et validation »)
//
// Claude Opus 5.5 en sortie structurée (lib/ai/claude.ts, décision du
// 26/10/2026 : on garde Opus plutôt qu'un modèle plus léger). La réponse est
// revérifiée par Zod ; en cas d'échec, UNE nouvelle tentative, puis on rend
// la transcription seule pour une saisie à la main (§2.2).
//
// Serveur seulement.
// ─────────────────────────────────────────────────────────────────────────────

import { extractJson } from '../ai/claude';
import { RAW_EXTRACTION_JSON_SCHEMA, rawExtractionSchema, type RawExtraction } from './schema';
import { VOICE_EXTRACTION_SYSTEM, renderVoiceContext } from './prompt';
import type { VoiceContext } from './draft';

export type ExtractionOutcome =
  | { ok: true; raw: RawExtraction; attempts: number }
  | { ok: false; attempts: number };

export async function extractVoiceTransactions(
  transcript: string,
  ctx: VoiceContext,
  defaultCurrency: 'HTG' | 'USD',
): Promise<ExtractionOutcome> {
  const context = renderVoiceContext(ctx, defaultCurrency);
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const raw = await extractJson<unknown>({
      system: VOICE_EXTRACTION_SYSTEM,
      content: [
        { type: 'text', text: context },
        { type: 'text', text: `Transcription :\n${transcript}` },
      ],
      schema: RAW_EXTRACTION_JSON_SCHEMA,
      effort: 'low',
    });
    if (raw === null) continue;
    const parsed = rawExtractionSchema.safeParse(raw);
    if (parsed.success) return { ok: true, raw: parsed.data, attempts: attempt };
    console.error('[voice] extraction hors schéma :', parsed.error.issues.slice(0, 3));
  }
  return { ok: false, attempts: 2 };
}
