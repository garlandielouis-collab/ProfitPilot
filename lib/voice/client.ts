// ─────────────────────────────────────────────────────────────────────────────
// Le côté écran de la voix : savoir si elle est là, envoyer un vocal
//
// Aucune clé ici : le navigateur envoie l'audio à /api/voice, qui seul parle
// aux fournisseurs (règle de sécurité de la spécification, §6).
// ─────────────────────────────────────────────────────────────────────────────

import type { VoiceDraft } from './draft';

export type VoiceResponse = {
  noteId: string;
  transcription: string;
  drafts: VoiceDraft[];
  /** L'extraction a échoué deux fois : la transcription seule, pour saisir à la main. */
  manual: boolean;
  recordedAt: string;
  usage?: { used: number; limit: number };
};

export type VoiceFailure = { fr: string; ht: string; code?: string };

let availability: Promise<boolean> | null = null;

/** Le micro peut-il enregistrer sur cet appareil ? */
export function canRecord(): boolean {
  return typeof window !== 'undefined'
    && typeof MediaRecorder !== 'undefined'
    && Boolean(navigator.mediaDevices?.getUserMedia);
}

/** La voix est-elle ouverte sur ce compte ? Demandé une fois par session. */
export function voiceAvailable(): Promise<boolean> {
  availability ??= fetch('/api/voice', { method: 'GET' })
    .then((r) => (r.ok ? r.json() : { available: false }))
    .then((j) => Boolean(j?.available))
    .catch(() => false);
  return availability;
}

export async function sendVoice(
  audio: Blob,
  recordedAt: Date,
): Promise<{ ok: true; data: VoiceResponse } | { ok: false; error: VoiceFailure }> {
  const form = new FormData();
  form.append('audio', audio, audio.type.includes('mp4') ? 'vokal.m4a' : 'vokal.webm');
  form.append('recordedAt', recordedAt.toISOString());
  try {
    const res = await fetch('/api/voice', { method: 'POST', body: form });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json) {
      // La voix s'est fermée entre-temps (clé retirée, migration absente) :
      // le micro disparaît au lieu de répondre « indisponible » à chaque fois.
      if (json?.code === 'voice_unavailable') availability = Promise.resolve(false);
      return {
        ok: false,
        error: {
          ht: json?.error ?? 'M pa t konprann. Eseye ankò.',
          fr: json?.errorFr ?? 'Je n’ai pas compris. Réessayez.',
          code: json?.code,
        },
      };
    }
    return { ok: true, data: json as VoiceResponse };
  } catch {
    return { ok: false, error: { ht: 'Pa gen rezo : tape montan an.', fr: 'Pas de réseau : tapez le montant.', code: 'offline' } };
  }
}
