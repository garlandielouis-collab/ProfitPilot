'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Le gros micro de l'accueil — « Kenbe pou pale » (§2.1)
//
// Appuyer et garder le doigt pendant la phrase, lâcher pour envoyer. Glisser
// vers la gauche annule. Une minute au plus. Pendant l'écoute, la durée
// défile ; le téléphone vibre au début et à la fin.
//
// La première fois, avant que le téléphone ne demande l'accès au micro, une
// feuille explique en kreyòl pourquoi : une demande système qui tombe sans
// explication est souvent refusée, et un micro refusé ne se rattrape que dans
// les réglages.
//
// Absent si la voix n'est pas ouverte (clé, offre, migration) : pas de micro
// mort à l'écran.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Loader2, Mic, X } from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '../LanguageWrapper';
import { BottomSheet, Button } from '../ds';
import { cn } from '../../lib/utils';
import { canRecord, sendVoice, voiceAvailable, type VoiceResponse } from '../../lib/voice/client';
import { MAX_RECORD_SECONDS, MIN_RECORD_MS, useVoiceRecorder } from './useVoiceRecorder';
import { VoiceDraftsSheet } from './VoiceDraftsSheet';

const INTRO_KEY = 'pp:voice-intro';
/** Glisser de plus de 80 px vers la gauche annule. */
const CANCEL_DX = -80;

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

function introSeen(): boolean {
  try { return localStorage.getItem(INTRO_KEY) === '1'; } catch { return true; }
}
function markIntroSeen() {
  try { localStorage.setItem(INTRO_KEY, '1'); } catch { /* stockage bloqué : la feuille reviendra */ }
}

export function HoldToTalk() {
  const { t } = useLanguage();
  const [available, setAvailable] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [cancelArmed, setCancelArmed] = useState(false);
  const [intro, setIntro] = useState(false);
  const [result, setResult] = useState<VoiceResponse | null>(null);
  const startX = useRef<number | null>(null);
  const held = useRef(false);

  const recorder = useVoiceRecorder(async (audio, recordedAt) => {
    setThinking(true);
    const res = await sendVoice(audio, recordedAt);
    setThinking(false);
    if (!res.ok) {
      toast.error(t(res.error));
      if (res.error.code === 'voice_unavailable') setAvailable(false);
      return;
    }
    setResult(res.data);
  });

  useEffect(() => {
    let alive = true;
    if (canRecord()) voiceAvailable().then((ok) => { if (alive) setAvailable(ok); });
    return () => { alive = false; };
  }, []);

  if (!available) return null;

  const recording = recorder.state === 'recording';

  async function begin() {
    if (thinking) return;
    if (!introSeen()) { setIntro(true); return; }
    held.current = true;
    setCancelArmed(false);
    const ok = await recorder.start();
    if (!ok) {
      held.current = false;
      toast.error(t({
        fr: 'Le micro est bloqué. Autorisez-le dans les réglages, ou tapez le montant.',
        ht: 'Mikwo a bloke. Pèmèt li nan paramèt yo, oswa tape montan an.',
      }));
      return;
    }
    // Le doigt s'est levé pendant que le micro s'ouvrait : ce n'était qu'un tap.
    if (!held.current) end(false);
  }

  function end(cancel: boolean) {
    held.current = false;
    startX.current = null;
    setCancelArmed(false);
    if (!recorder.active()) return;
    if (cancel) { recorder.cancel(); return; }
    if (recorder.duration() < MIN_RECORD_MS) {
      recorder.cancel();
      toast(t({ fr: 'Gardez le doigt appuyé pendant que vous parlez.', ht: 'Kenbe dwèt ou peze pandan w ap pale.' }));
      return;
    }
    recorder.stop();
  }

  function onPointerDown(e: PointerEvent<HTMLButtonElement>) {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    startX.current = e.clientX;
    void begin();
  }
  function onPointerMove(e: PointerEvent<HTMLButtonElement>) {
    if (startX.current === null || !held.current) return;
    setCancelArmed(e.clientX - startX.current < CANCEL_DX);
  }
  function onPointerUp() {
    if (!held.current && !recorder.active()) return;
    end(cancelArmed);
  }
  // Le clavier : Espace ou Entrée tenus, comme le doigt ; Échap annule.
  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === 'Escape' && held.current) { e.preventDefault(); end(true); return; }
    if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); void begin(); }
  }
  function onKeyUp(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); end(false); }
  }

  async function acceptIntro() {
    markIntroSeen();
    setIntro(false);
    // La demande système arrive maintenant, juste après l'explication.
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      media.getTracks().forEach((track) => track.stop());
      toast(t({ fr: 'C’est prêt : gardez le bouton appuyé et parlez.', ht: 'Li pare : kenbe bouton an epi pale.' }));
    } catch {
      toast.error(t({
        fr: 'Le micro est bloqué. Autorisez-le dans les réglages, ou tapez le montant.',
        ht: 'Mikwo a bloke. Pèmèt li nan paramèt yo, oswa tape montan an.',
      }));
    }
  }

  return (
    <>
      <button
        type="button"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => end(true)}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onContextMenu={(e) => e.preventDefault()}
        disabled={thinking}
        aria-pressed={recording}
        aria-label={t({
          fr: 'Garder appuyé et dire la vente, la dépense ou le crédit',
          ht: 'Kenbe peze epi di vant lan, depans lan oswa kredi a',
        })}
        className={cn(
          // Le geste se tient : pas de sélection de texte, pas de défilement.
          'pressable flex min-h-hero w-full touch-none select-none items-center justify-center gap-3 rounded-surface px-4',
          'transition-colors duration-press ease-pp',
          recording
            ? cancelArmed ? 'bg-surface2 text-muted dark:bg-dark-surface2' : 'bg-danger text-white'
            : 'border border-border bg-white text-primary hover:bg-surface dark:border-dark-border dark:bg-dark-surface dark:text-dark-text',
          thinking && 'opacity-70',
        )}
      >
        {thinking ? (
          <>
            <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
            <span className="text-body font-bold">{t({ fr: 'Je lis…', ht: 'M ap li…' })}</span>
          </>
        ) : recording ? (
          <>
            {cancelArmed ? <X className="h-6 w-6" aria-hidden /> : <Mic className="h-6 w-6 animate-pulse" aria-hidden />}
            <span className="amount text-body font-bold" aria-live="off">
              {mmss(recorder.elapsed)} / {mmss(MAX_RECORD_SECONDS)}
            </span>
            <span className="text-note">
              {cancelArmed
                ? t({ fr: 'Lâchez pour annuler', ht: 'Lage pou anile' })
                : t({ fr: '← glisser pour annuler', ht: '← glise pou anile' })}
            </span>
          </>
        ) : (
          <>
            <Mic className="h-6 w-6" aria-hidden />
            <span className="text-left">
              <span className="block text-body font-bold">{t({ fr: 'Garder appuyé pour parler', ht: 'Kenbe pou pale' })}</span>
              <span className="block text-note text-muted dark:text-dark-muted">« M vann 2 kola 250 goud »</span>
            </span>
          </>
        )}
      </button>

      <BottomSheet
        open={intro}
        onClose={() => setIntro(false)}
        title={t({ fr: 'Parler à votre cahier', ht: 'Pale ak kaye w' })}
        footer={
          <Button variant="accent" size="lg" block onClick={acceptIntro}>
            {t({ fr: 'Continuer', ht: 'Kontinye' })}
          </Button>
        }
      >
        <div className="space-y-3 text-body text-primary dark:text-dark-text">
          <p>
            {t({
              fr: 'Dites ce que vous avez vendu ou dépensé, comme à un ami : « M vann 2 kola 250 goud ». ProfitPilot prépare l’opération, vous la confirmez d’un tap.',
              ht: 'Di sa w vann oswa sa w depanse, tankou w ap pale ak yon zanmi : « M vann 2 kola 250 goud ». ProfitPilot prepare l, ou konfime l ak yon tap.',
            })}
          </p>
          <p>
            {t({
              fr: 'Pour cela, le téléphone va demander l’accès au micro. Il n’écoute que lorsque vous gardez le bouton appuyé. Le son est effacé dès qu’il est lu.',
              ht: 'Pou sa, telefòn nan pral mande w pèmisyon pou mikwo a. Li koute sèlman lè w kenbe bouton an peze. Son an efase depi li fin li l.',
            })}
          </p>
        </div>
      </BottomSheet>

      <VoiceDraftsSheet result={result} onClose={() => setResult(null)} />
    </>
  );
}
