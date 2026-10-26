'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Le bouton micro — « Pale ak kaye a » (F02)
//
// Appuyer, parler en kreyòl (« M vann 2 kola 150 goud »), appuyer pour finir.
// Ce qui a été compris remplit la feuille de saisie ; le marchand vérifie le
// montant et confirme d'un tap. Rien ne s'enregistre tout seul.
//
// Le bouton n'apparaît que si la saisie vocale est réellement activée sur le
// serveur (clé de transcription posée) : un micro qui répond « indisponible »
// est un contrôle qui ne commande rien.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react';
import { Mic, Square } from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '../LanguageWrapper';
import { cn } from '../../lib/utils';
import type { VoiceIntent } from '../../lib/voiceParse';

export type VoiceResult = {
  kind: VoiceIntent['kind'];
  amount?: number;
  unit?: VoiceIntent['unit'];
  quantity?: number;
  item?: string;
  customer?: string;
  category?: string;
  note?: string;
  transcript: string;
};

/** Le nombre de secondes au-delà duquel l'écoute s'arrête d'elle-même. */
const MAX_SECONDS = 12;

let availability: Promise<boolean> | null = null;
function voiceAvailable(): Promise<boolean> {
  availability ??= fetch('/api/voice', { method: 'GET' })
    .then((r) => (r.ok ? r.json() : { available: false }))
    .then((j) => Boolean(j?.available))
    .catch(() => false);
  return availability;
}

export function VoiceButton({
  kind,
  onResult,
  className,
}: {
  /** Ce que la feuille attend : la réponse d'un autre genre est quand même rendue. */
  kind: 'sale' | 'expense' | 'any';
  onResult: (result: VoiceResult) => void;
  className?: string;
}) {
  const { t } = useLanguage();
  const [available, setAvailable] = useState(false);
  const [state, setState] = useState<'idle' | 'listening' | 'thinking'>('idle');
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;
    const supported = typeof window !== 'undefined'
      && typeof MediaRecorder !== 'undefined'
      && Boolean(navigator.mediaDevices?.getUserMedia);
    if (supported) voiceAvailable().then((ok) => { if (alive) setAvailable(ok); });
    return () => { alive = false; };
  }, []);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    recorder.current?.stream.getTracks().forEach((track) => track.stop());
  }, []);

  if (!available) return null;

  async function send(blob: Blob) {
    setState('thinking');
    try {
      const form = new FormData();
      form.append('audio', blob, 'vokal.webm');
      form.append('kind', kind);
      const res = await fetch('/api/voice', { method: 'POST', body: form });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.intent) {
        toast.error(json?.error ?? t({ fr: 'Je n’ai pas compris. Réessayez.', ht: 'M pa t konprann. Eseye ankò.' }));
        return;
      }
      const intent = json.intent as VoiceIntent;
      const transcript = String(json.transcript ?? '');
      if (!intent.understood || intent.amount <= 0) {
        toast.error(t({
          fr: `J’ai entendu : « ${transcript} ». Dites le montant, par exemple « 500 goud ».`,
          ht: `M tande : « ${transcript} ». Di montan an, pa egzanp « 500 goud ».`,
        }));
        return;
      }
      toast.success(t({ fr: `J’ai entendu : « ${transcript} »`, ht: `M tande : « ${transcript} »` }), {
        description: t({ fr: 'Vérifiez le montant, puis confirmez.', ht: 'Tcheke montan an, epi konfime.' }),
      });
      onResult({
        kind: intent.kind,
        amount: intent.amount,
        unit: intent.unit,
        quantity: intent.quantity,
        item: intent.item || undefined,
        customer: intent.customer || undefined,
        category: intent.category || undefined,
        note: intent.item || undefined,
        transcript,
      });
    } catch {
      toast.error(t({ fr: 'Pas de réseau : tapez le montant.', ht: 'Pa gen rezo : tape montan an.' }));
    } finally {
      setState('idle');
    }
  }

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunks.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.current.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunks.current, { type: rec.mimeType || 'audio/webm' });
        if (blob.size > 0) void send(blob);
        else setState('idle');
      };
      recorder.current = rec;
      rec.start();
      setState('listening');
      timer.current = setTimeout(stop, MAX_SECONDS * 1000);
    } catch {
      toast.error(t({
        fr: 'Le micro est bloqué. Autorisez-le dans le navigateur, ou tapez le montant.',
        ht: 'Mikwo a bloke. Pèmèt li nan navigatè a, oswa tape montan an.',
      }));
      setState('idle');
    }
  }

  function stop() {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (recorder.current?.state === 'recording') recorder.current.stop();
  }

  const listening = state === 'listening';
  const label = listening
    ? t({ fr: 'Terminer', ht: 'Fini' })
    : state === 'thinking'
      ? t({ fr: 'Je lis…', ht: 'M ap li…' })
      : t({ fr: 'Parler', ht: 'Pale' });

  return (
    <button
      type="button"
      onClick={listening ? stop : start}
      disabled={state === 'thinking'}
      aria-pressed={listening}
      aria-label={listening
        ? t({ fr: 'Arrêter l’écoute', ht: 'Sispann koute' })
        : t({ fr: 'Dire la vente ou la dépense à voix haute', ht: 'Di vant lan oswa depans lan ak vwa w' })}
      className={cn(
        'pressable flex min-h-hero min-w-hero flex-col items-center justify-center gap-1 rounded-surface px-3 text-note font-bold',
        'transition-colors duration-press',
        listening ? 'bg-danger text-white' : 'bg-surface2 text-primary hover:bg-border dark:bg-dark-surface2 dark:text-dark-text',
        state === 'thinking' && 'opacity-60',
        className,
      )}
    >
      {listening ? <Square className="h-5 w-5" aria-hidden /> : <Mic className="h-5 w-5" aria-hidden />}
      {label}
    </button>
  );
}
