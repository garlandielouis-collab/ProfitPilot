'use client';

// ─────────────────────────────────────────────────────────────────────────────
// L'enregistrement d'un vocal (§2.1)
//
// Une minute au plus, puis l'envoi se fait de lui-même. Le téléphone vibre au
// début et à la fin : le marchand, les yeux sur son client, sait sans regarder
// que l'écoute a commencé puis s'est arrêtée. Opus à 24 kbit/s : une minute
// pèse moins de 200 Ko, ce qui passe même sur une connexion lente.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react';

export const MAX_RECORD_SECONDS = 60;
/** Plus court que ça, c'est un tap, pas une phrase. */
export const MIN_RECORD_MS = 600;

const buzz = (ms: number) => {
  try { navigator.vibrate?.(ms); } catch { /* pas de vibreur : rien */ }
};

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return undefined;
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((m) => MediaRecorder.isTypeSupported(m));
}

export type RecorderState = 'idle' | 'starting' | 'recording';

export function useVoiceRecorder(onRecorded: (audio: Blob, recordedAt: Date) => void) {
  const [state, setState] = useState<RecorderState>('idle');
  const [elapsed, setElapsed] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef<Date | null>(null);
  const discard = useRef(false);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const deliver = useRef(onRecorded);
  deliver.current = onRecorded;

  const release = useCallback(() => {
    if (tick.current) { clearInterval(tick.current); tick.current = null; }
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    recorder.current = null;
  }, []);

  useEffect(() => () => {
    discard.current = true;
    if (recorder.current?.state === 'recording') recorder.current.stop();
    release();
  }, [release]);

  /** Faux si le micro est refusé ou absent. */
  const start = useCallback(async (): Promise<boolean> => {
    if (recorder.current) return true;
    setState('starting');
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickMimeType();
      const rec = new MediaRecorder(media, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 24_000 });
      stream.current = media;
      recorder.current = rec;
      chunks.current = [];
      discard.current = false;
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.current.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(chunks.current, { type: rec.mimeType || mimeType || 'audio/webm' });
        const at = startedAt.current ?? new Date();
        release();
        setState('idle');
        setElapsed(0);
        buzz(30);
        if (!discard.current && blob.size > 0) deliver.current(blob, at);
      };
      startedAt.current = new Date();
      rec.start();
      setState('recording');
      setElapsed(0);
      buzz(40);
      tick.current = setInterval(() => {
        const s = Math.floor((Date.now() - (startedAt.current?.getTime() ?? Date.now())) / 1000);
        setElapsed(s);
        if (s >= MAX_RECORD_SECONDS && recorder.current?.state === 'recording') recorder.current.stop();
      }, 250);
      return true;
    } catch {
      release();
      setState('idle');
      return false;
    }
  }, [release]);

  /** Fin de la phrase : le vocal part. */
  const stop = useCallback(() => {
    discard.current = false;
    if (recorder.current?.state === 'recording') recorder.current.stop();
  }, []);

  /** Glissé vers la gauche, ou trop court : rien ne part. */
  const cancel = useCallback(() => {
    discard.current = true;
    if (recorder.current?.state === 'recording') recorder.current.stop();
    else { release(); setState('idle'); }
  }, [release]);

  /** Depuis combien de millisecondes l'écoute dure. */
  const duration = useCallback(() => (startedAt.current ? Date.now() - startedAt.current.getTime() : 0), []);

  /** Le micro est ouvert (lu sur la référence, pas sur un état figé dans une fermeture). */
  const active = useCallback(() => recorder.current !== null, []);

  return { state, elapsed, start, stop, cancel, duration, active };
}
