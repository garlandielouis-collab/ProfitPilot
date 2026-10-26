// ─────────────────────────────────────────────────────────────────────────────
// « Pale ak kaye a » — la voix devient une saisie (F02 de l'étude)
//
// Deux étapes, deux services :
//   1. la transcription : Whisper (OpenAI), parce que c'est l'un des rares
//      modèles qui transcrit le kreyòl haïtien. Il demande `OPENAI_API_KEY`.
//      Sans elle, la saisie vocale n'est pas proposée — le bouton n'apparaît
//      pas, plutôt que d'apparaître pour rien (GET ci-dessous) ;
//   2. la compréhension : Claude, en sortie structurée (lib/ai/claude.ts), et,
//      à défaut, un lecteur de montant sans IA (lib/voiceParse.ts).
//
// Rien n'est enregistré ici : la route rend ce qu'elle a compris, la feuille
// de saisie le propose, le marchand confirme.
//
// L'étude demande de mesurer avant de promettre (§14) : « au moins 90 % des
// montants compris sans correction » sur 50 phrases réelles. La transcription
// est donc renvoyée avec le résultat, pour que l'écran la montre et que le
// marchand voie ce qui a été entendu.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from 'next/server';
import { openai } from '@ai-sdk/openai';
import { experimental_transcribe as transcribe } from 'ai';
import { getSupabaseServer } from '../../../lib/supabaseServerClient';
import { extractJson } from '../../../lib/ai/claude';
import {
  VOICE_INTENT_SCHEMA, VOICE_SYSTEM_PROMPT, parseSpokenFallback, sanitizeIntent, type VoiceIntent,
} from '../../../lib/voiceParse';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Quinze secondes de voix compressée tiennent largement sous 2 Mo. */
const MAX_AUDIO_BYTES = 2 * 1024 * 1024;

const transcriptionAvailable = () => Boolean(process.env.OPENAI_API_KEY);

/** L'écran demande d'abord si la voix est disponible, pour ne pas montrer un bouton mort. */
export async function GET() {
  return NextResponse.json({ available: transcriptionAvailable() });
}

export async function POST(req: NextRequest) {
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  if (!transcriptionAvailable()) {
    return NextResponse.json(
      { error: 'La saisie vocale n’est pas encore activée.', code: 'voice_unavailable' },
      { status: 503 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Requête invalide' }, { status: 400 });
  }

  const audio = form.get('audio');
  if (!(audio instanceof Blob) || audio.size === 0) {
    return NextResponse.json({ error: 'Aucun son reçu.' }, { status: 400 });
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: 'Message trop long : dites la vente en une phrase.' }, { status: 413 });
  }

  let transcript = '';
  try {
    const result = await transcribe({
      model: openai.transcription('whisper-1'),
      audio: new Uint8Array(await audio.arrayBuffer()),
      providerOptions: { openai: { language: 'ht' } },
    });
    transcript = result.text.trim();
  } catch (error) {
    console.error('[voice] transcription impossible:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Le son n’a pas pu être compris. Réessayez, plus près du téléphone.' }, { status: 502 });
  }

  if (!transcript) {
    return NextResponse.json({ transcript, intent: parseSpokenFallback('') });
  }

  const raw = await extractJson<VoiceIntent>({
    system: VOICE_SYSTEM_PROMPT,
    content: [{ type: 'text', text: transcript }],
    schema: VOICE_INTENT_SCHEMA,
    effort: 'low',
  });

  return NextResponse.json({ transcript, intent: sanitizeIntent(raw, transcript) });
}
