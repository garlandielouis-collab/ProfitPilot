// ─────────────────────────────────────────────────────────────────────────────
// La transcription — derrière une interface, pour pouvoir changer de
// fournisseur (§2.2, « Transcription (backend) »)
//
// Fournisseur par défaut : Whisper (OpenAI), langue `ht`. La spécification
// prévoit de tester la détection automatique si le code de langue dégrade le
// résultat : `VOICE_TRANSCRIPTION_LANGUAGE=auto` la active sans toucher au code.
// Une alternative auto-hébergée (MMS de Meta) se branchera ici, en
// implémentant la même interface.
//
// Serveur seulement : la clé ne quitte jamais le serveur.
// ─────────────────────────────────────────────────────────────────────────────

import { openai } from '@ai-sdk/openai';
import { experimental_transcribe as transcribe } from 'ai';

export interface TranscriptionProvider {
  readonly name: string;
  transcribe(audio: Uint8Array): Promise<string>;
}

class WhisperProvider implements TranscriptionProvider {
  readonly name = 'openai-whisper';

  async transcribe(audio: Uint8Array): Promise<string> {
    const language = process.env.VOICE_TRANSCRIPTION_LANGUAGE ?? 'ht';
    const result = await transcribe({
      model: openai.transcription('whisper-1'),
      audio,
      providerOptions: language === 'auto' ? {} : { openai: { language } },
    });
    return result.text.trim();
  }
}

/** Le fournisseur configuré, ou `null` : la voix n'est alors pas proposée. */
export function getTranscriptionProvider(): TranscriptionProvider | null {
  if (process.env.OPENAI_API_KEY) return new WhisperProvider();
  return null;
}
