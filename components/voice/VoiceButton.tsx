'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Le petit micro des feuilles de saisie — « Pale » (F02)
//
// Appuyer, parler en kreyòl (« M vann 2 kola 150 goud »), appuyer pour finir.
// Le premier brouillon compris remplit la feuille ; le marchand vérifie le
// montant et enregistre comme d'habitude. Rien ne s'enregistre tout seul.
//
// Même chemin que le gros micro de l'accueil (components/voice/HoldToTalk) :
// /api/voice, une minute au plus, absent si la voix n'est pas ouverte.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { Mic, Square } from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '../LanguageWrapper';
import { cn } from '../../lib/utils';
import { canRecord, sendVoice, voiceAvailable } from '../../lib/voice/client';
import { draftLabel, spokenAmount } from '../../lib/voice/sheet';
import { useVoiceRecorder } from './useVoiceRecorder';

export type VoiceResult = {
  kind: 'sale' | 'expense' | 'credit';
  amount?: number;
  unit?: 'HTG' | 'DOLA' | 'USD';
  quantity?: number;
  item?: string;
  customer?: string;
  category?: string;
  note?: string;
  transcript: string;
};

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
  const [thinking, setThinking] = useState(false);

  const recorder = useVoiceRecorder(async (audio, recordedAt) => {
    setThinking(true);
    const res = await sendVoice(audio, recordedAt);
    setThinking(false);
    if (!res.ok) {
      toast.error(t(res.error));
      if (res.error.code === 'voice_unavailable') setAvailable(false);
      return;
    }
    const { transcription, drafts } = res.data;
    // La feuille ouverte d'abord : une dépense dite dans la feuille des
    // dépenses passe avant une vente comprise dans la même phrase.
    const wanted = kind === 'expense' ? ['expense', 'owner_withdrawal'] : kind === 'sale' ? ['sale', 'credit'] : null;
    const d = (wanted && drafts.find((x) => wanted.includes(x.type))) ?? drafts[0];
    if (!d || d.amountMinor === null) {
      toast.error(t({
        fr: `J’ai entendu : « ${transcription} ». Dites le montant, par exemple « 500 goud ».`,
        ht: `M tande : « ${transcription} ». Di montan an, pa egzanp « 500 goud ».`,
      }));
      return;
    }
    if (d.type === 'credit_payment') {
      toast.error(t({
        fr: 'C’est un paiement de crédit : notez-le depuis l’accueil ou la page « On vous doit ».',
        ht: 'Se yon peman kredi : note l sou paj akèy la oswa « Sa yo dwe w ».',
      }));
      return;
    }
    const { amount, unit } = spokenAmount(d);
    toast.success(t({ fr: `J’ai entendu : « ${transcription} »`, ht: `M tande : « ${transcription} »` }), {
      description: d.amountNeedsCheck
        ? t({ fr: 'Vérifiez bien le montant, puis confirmez.', ht: 'Verifye montan an byen, epi konfime.' })
        : t({ fr: 'Vérifiez le montant, puis confirmez.', ht: 'Tcheke montan an, epi konfime.' }),
    });
    const first = d.lines[0];
    onResult({
      kind: d.type === 'owner_withdrawal' ? 'expense' : d.type,
      amount,
      unit,
      quantity: first?.quantity,
      item: first?.label,
      customer: d.customerLabel ?? undefined,
      category: d.type === 'owner_withdrawal' ? 'Retrait personnel' : d.expenseCategory ?? undefined,
      note: draftLabel(d) || undefined,
      transcript: transcription,
    });
  });

  useEffect(() => {
    let alive = true;
    if (canRecord()) voiceAvailable().then((ok) => { if (alive) setAvailable(ok); });
    return () => { alive = false; };
  }, []);

  if (!available) return null;

  async function start() {
    const ok = await recorder.start();
    if (!ok) {
      toast.error(t({
        fr: 'Le micro est bloqué. Autorisez-le dans le navigateur, ou tapez le montant.',
        ht: 'Mikwo a bloke. Pèmèt li nan navigatè a, oswa tape montan an.',
      }));
    }
  }

  const listening = recorder.state === 'recording';
  const label = listening
    ? t({ fr: 'Terminer', ht: 'Fini' })
    : thinking
      ? t({ fr: 'Je lis…', ht: 'M ap li…' })
      : t({ fr: 'Parler', ht: 'Pale' });

  return (
    <button
      type="button"
      onClick={listening ? recorder.stop : start}
      disabled={thinking || recorder.state === 'starting'}
      aria-pressed={listening}
      aria-label={listening
        ? t({ fr: 'Arrêter l’écoute', ht: 'Sispann koute' })
        : t({ fr: 'Dire la vente ou la dépense à voix haute', ht: 'Di vant lan oswa depans lan ak vwa w' })}
      className={cn(
        'pressable flex min-h-hero min-w-hero flex-col items-center justify-center gap-1 rounded-surface px-3 text-note font-bold',
        'transition-colors duration-press',
        listening ? 'bg-danger text-white' : 'bg-surface2 text-primary hover:bg-border dark:bg-dark-surface2 dark:text-dark-text',
        thinking && 'opacity-60',
        className,
      )}
    >
      {listening ? <Square className="h-5 w-5" aria-hidden /> : <Mic className="h-5 w-5" aria-hidden />}
      {label}
    </button>
  );
}
