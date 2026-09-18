'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Le panneau de Pilot AI — une conversation par-dessus l'écran, pas une page
//
// Le marchand regardait ses ventes, un chiffre l'a arrêté. L'envoyer sur
// `/ai-assistant` lui fait perdre l'écran qui a soulevé la question : il revient
// et ne sait plus quelle ligne l'avait intrigué. Le panneau garde l'écran
// visible derrière lui — c'est le §5.7, la même raison qui fait saisir une vente
// dans une feuille plutôt que sur une page.
//
// ── Ce qu'il n'est pas ───────────────────────────────────────────────────────
//
// Ce n'est pas une seconde conversation. Il ouvre la conversation la plus
// récente du marchand, celle-là même que `/ai-assistant` affiche : une question
// posée à la bulle se retrouve dans l'historique, et une analyse commencée en
// grand se continue depuis la bulle. Deux fils séparés auraient demandé au
// marchand de se souvenir d'où il avait posé sa question.
//
// Il ne refait pas non plus le transport : `useMessages` porte déjà le flux, la
// coupure, la sauvegarde et les messages optimistes. Recopier ces cent lignes
// ici, c'était garantir que la prochaine correction ne serait faite que d'un
// côté.
//
// ── Deux tailles, deux intentions ────────────────────────────────────────────
//
// Sur grand écran, 400 × 650 ancré en bas à droite : on lit la réponse et
// l'écran en même temps. Sur téléphone, plein écran — une fenêtre flottante de
// 340 px au-dessus d'un clavier qui mange la moitié de l'écran ne laisse voir
// que deux lignes de réponse. La géométrie exacte vit dans `app/globals.css`
// (bloc « PILOT AI »), avec le dégagement de la barre mobile dont elle dépend.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Bot, Maximize2, Send, Sparkles, Square, X } from 'lucide-react';

import { supabase } from '../../lib/supabaseClient';
import { useConversations } from '../../hooks/useConversations';
import { useMessages } from '../../hooks/useMessages';
import { getWeeklySummaryAction } from '../../app/actions/ai';
import { useLanguage } from '../LanguageWrapper';
import { usePlan } from '../../hooks/usePlan';
import { plansWithFeature } from '../../lib/planFeatures';
import { getPlanLabel } from '../../lib/plans';
import { cn } from '../../lib/utils';
import type { PilotRoute } from '../../lib/pilotContext';

const ReactMarkdown = dynamic(() => import('react-markdown'), { ssr: false });

// Les offres qui ouvrent Pilot AI viennent du registre, comme dans
// `/api/ai/chat` et dans la page : le marchand lit « Kwasans / Elit », jamais la
// clé stockée en base.
const AI_PLAN_LABELS   = plansWithFeature('ai_assistant').map(getPlanLabel);
const AI_UPGRADE_LABEL = getPlanLabel('Business Pilot');

export function PilotPanel({
  open,
  onClose,
  route,
}: {
  open:    boolean;
  onClose: () => void;
  /** L'écran d'où la bulle a été appelée : il fournit les questions proposées. */
  route:   PilotRoute;
}) {
  const { t }  = useLanguage();
  const plan   = usePlan();
  const hasAI  = plan.can('ai_assistant');

  const [mounted, setMounted] = useState(false);
  const [userId,  setUserId]  = useState<string | undefined>();
  const [convId,  setConvId]  = useState<string | null>(null);
  const [input,   setInput]   = useState('');
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
  /**
   * Trois états, pas deux.
   *
   * Avec un simple `summary === null`, une lecture qui ÉCHOUE laisse le témoin
   * sur « Je lis vos chiffres… » pour toujours : plus rien ne lit, et l'écran
   * dit le contraire. C'est la même impasse que la roue infinie du verrou
   * d'écran — un état d'attente dont on ne sort jamais, et le marchand attend
   * une réponse qui ne viendra pas.
   */
  const [dataState, setDataState] = useState<'loading' | 'ready' | 'unavailable'>('loading');

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);
  /**
   * Une seule création, quoi qu'il arrive.
   *
   * `create.isPending` ne suffit pas : l'objet de mutation change d'identité à
   * chaque rendu du crochet, donc l'effet ci-dessous se relance, et il peut le
   * faire AVANT que React ait rendu l'état « en cours ». Deux conversations
   * vides apparaîtraient alors dans l'historique du marchand à la première
   * ouverture — un dégât silencieux, visible seulement des jours plus tard dans
   * la liste de `/ai-assistant`.
   */
  const creatingRef = useRef(false);

  const conversations = useConversations(userId);
  const { query: msgQuery, send, cancel } = useMessages(convId);
  const messages    = msgQuery.data ?? [];
  const isStreaming = send.isPending;

  useEffect(() => { setMounted(true); }, []);

  // ── Ce que le panneau lit, et QUAND il le lit ──────────────────────────────
  //
  // Rien avant la première ouverture. La bulle est sur chaque écran de
  // l'application : lire le résumé hebdomadaire au montage, c'était une requête
  // serveur sur chaque page pour une fenêtre que la plupart n'ouvriront pas.
  useEffect(() => {
    if (!open) return;

    // Le client Supabase de ce projet n'est pas typé : la réponse arrive en
    // `any`, et le destructurer sans annotation fait échouer le typecheck.
    supabase.auth.getUser().then(
      ({ data }: { data: { user: { id: string } | null } }) => setUserId(data.user?.id),
    );

    if (!summary) {
      getWeeklySummaryAction()
        .then((s) => {
          setSummary(s as unknown as Record<string, unknown>);
          setDataState('ready');
        })
        // Le panneau s'ouvre quand même : l'assistant répondra sans les chiffres
        // plutôt que pas du tout — mais il le DIT, au lieu de laisser croire
        // qu'il les a sous les yeux.
        .catch(() => setDataState('unavailable'));
    }
  }, [open, summary]);

  // La conversation la plus récente, ou une nouvelle si le marchand n'en a
  // aucune. `listConversations` trie par `updated_at` décroissant : la première
  // est bien celle qu'il regardait en dernier.
  useEffect(() => {
    if (!open || convId || !userId) return;

    const latest = conversations.query.data?.[0];
    if (latest) { setConvId(latest.id); return; }

    if (conversations.query.isLoading || creatingRef.current) return;

    creatingRef.current = true;
    conversations.create
      .mutateAsync(t({ fr: 'Depuis mon écran', ht: 'Depi ekran mwen' }))
      .then((c) => setConvId(c.id))
      .catch(() => {
        // `useConversations` a déjà prévenu le marchand. Le verrou se relâche
        // pour qu'une seconde ouverture puisse réessayer — sinon un échec
        // réseau condamnerait le panneau jusqu'au rechargement de la page.
        creatingRef.current = false;
      });
  }, [open, convId, userId, conversations.query.data, conversations.query.isLoading,
      conversations.create, t]);

  // Échap ferme, et le focus part au champ : la fenêtre s'ouvre prête à écrire,
  // sans un clic de plus.
  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);

    const focus = window.setTimeout(() => inputRef.current?.focus(), 120);

    return () => {
      document.removeEventListener('keydown', onKey);
      window.clearTimeout(focus);
    };
  }, [open, onClose]);

  // Le fond ne défile pas derrière le plein écran du téléphone. Sur grand
  // écran, il le peut : le panneau ne couvre qu'un coin, et bloquer la molette
  // de tout l'écran pour une fenêtre de 400 px serait une prise d'otage.
  useEffect(() => {
    if (!open) return;
    if (window.matchMedia('(min-width: 1024px)').matches) return;

    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  // ── Le clavier du téléphone ────────────────────────────────────────────────
  //
  // Sur iOS, ouvrir le clavier ne redimensionne pas la page : `inset-0` continue
  // de décrire un écran entier dont la moitié basse est maintenant sous le
  // clavier. Le champ de saisie s'y retrouve caché, et le marchand tape sans
  // voir ce qu'il écrit — sur un produit dont l'usage principal est le
  // téléphone, ce seul détail rend le panneau inutilisable.
  //
  // `visualViewport.height` est la seule mesure qui connaisse le clavier. Elle
  // n'est appliquée que sous 1024 px : sur grand écran, la hauteur vient de la
  // classe `lg:h-[min(650px,…)]`, et un style en ligne l'écraserait.
  const [keyboardHeight, setKeyboardHeight] = useState<number | null>(null);
  useEffect(() => {
    if (!open) return;

    const vv = window.visualViewport;
    if (!vv) return;

    const desktop = window.matchMedia('(min-width: 1024px)');
    const sync    = () => setKeyboardHeight(desktop.matches ? null : vv.height);

    sync();
    vv.addEventListener('resize', sync);
    desktop.addEventListener('change', sync);

    return () => {
      vv.removeEventListener('resize', sync);
      desktop.removeEventListener('change', sync);
      setKeyboardHeight(null);
    };
  }, [open]);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  const ask = useCallback((text: string) => {
    const question = text.trim();
    if (!question || isStreaming || !convId) return;
    setInput('');
    send.mutate({ text: question, weeklySummary: summary });
  }, [isStreaming, convId, send, summary]);

  const ready = !!convId && hasAI && !isStreaming;

  // Les questions proposées disparaissent dès la première réponse : elles sont
  // un point de départ, pas un menu permanent.
  const showPrompts = messages.length === 0 && route.prompts.length > 0 && hasAI;

  const subtitle = useMemo(
    () => t({ fr: 'Votre copilote ProfitPilot', ht: 'Kopilòt ou nan ProfitPilot' }),
    [t],
  );

  if (!open || !mounted) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="false"
      aria-label={t({ fr: 'Pilot AI, votre copilote', ht: 'Pilot AI, kopilòt ou' })}
      className={cn(
        // Téléphone : plein écran. Grand écran : une fenêtre ancrée, dont la
        // hauteur cède avant les bords de l'écran (`min()`) — sur un portable
        // de 768 px de haut, 650 px de fenêtre plus 96 px de dégagement ne
        // tiennent pas, et c'est la fenêtre qui doit rétrécir.
        'pp-pilot-panel fixed inset-0 z-[60] flex flex-col bg-white dark:bg-dark-surface',
        // Grand écran : 400 × 650 ancrés au-dessus de la bulle (24 du bord,
        // 96 du bas = 24 + la bulle de 64 + 8). La géométrie est ÉCRITE ICI et
        // non dans `globals.css` comme celle de la bulle : `inset-auto` est une
        // propriété raccourcie, donc n'importe quelle règle de feuille se fait
        // écraser par elle quel que soit l'ordre du fichier. Mesuré : le
        // panneau tombait en bas du document, hors de l'écran.
        'lg:left-auto lg:top-auto lg:right-6 lg:bottom-24',
        // 650 de haut, mais jamais jusqu'à l'en-tête : 176 px réservés = les 56
        // de l'en-tête collant, les 96 qui séparent du bas, et 24 de respiration
        // entre les deux. Sans cette réserve, le panneau venait toucher
        // l'en-tête sur un portable de 800 px (mesuré : 2 px de recouvrement).
        'lg:h-[min(650px,calc(100dvh-11rem))] lg:w-[400px]',
        'lg:rounded-surface lg:shadow-pop',
        // §6 : ombre OU bordure, jamais les deux. En sombre, l'ombre ne porte
        // pas — le liseré prend son rôle, et lui seul.
        'lg:dark:shadow-none lg:dark:ring-1 lg:dark:ring-white/10',
        'pp-enter overflow-hidden',
      )}
      style={{
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        height: keyboardHeight ? `${keyboardHeight}px` : undefined,
      }}
    >
      {/* ── L'en-tête ────────────────────────────────────────────────────────
          Marine plein : il porte l'identité de Pilot AI et sépare la
          conversation de l'écran qui reste visible derrière. L'émeraude n'y
          paraît qu'en un point — le témoin de l'antenne — parce que l'aplat
          d'accent de l'écran est déjà pris par le bouton de vente (§4). */}
      <header className="flex items-center gap-3 bg-primary px-4 py-3">
        <span className="relative flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-control bg-white/10">
          <Bot className="h-5 w-5 text-white" strokeWidth={1.8} aria-hidden />
          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-pill bg-accent" aria-hidden />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-card font-bold leading-6 text-white">Pilot AI</p>
          <p className="truncate text-note leading-4 text-white/70">{subtitle}</p>
        </div>

        <Link
          href="/ai-assistant"
          onClick={onClose}
          aria-label={t({ fr: 'Ouvrir en grand', ht: 'Louvri an gran' })}
          title={t({ fr: 'Ouvrir en grand', ht: 'Louvri an gran' })}
          className="pressable flex h-touch w-touch items-center justify-center rounded-control text-white/60 transition hover:bg-white/10 hover:text-white"
        >
          <Maximize2 className="h-4 w-4" strokeWidth={1.8} aria-hidden />
        </Link>

        <button
          type="button"
          onClick={onClose}
          aria-label={t({ fr: 'Fermer', ht: 'Fèmen' })}
          className="pressable -mr-2 flex h-touch w-touch items-center justify-center rounded-control text-white/60 transition hover:bg-white/10 hover:text-white"
        >
          <X className="h-5 w-5" strokeWidth={1.8} aria-hidden />
        </button>
      </header>

      {/* ── Le bandeau d'offre ───────────────────────────────────────────────
          Il dit ce qui manque et ce qu'il faut pour l'avoir, au-dessus d'une
          conversation qui reste lisible : le marchand voit l'outil avant de
          payer, il ne lit pas un mur. */}
      {!plan.loading && !hasAI && (
        <div className="flex items-center gap-3 border-b border-border bg-warning/10 px-4 py-3 dark:border-dark-border">
          <Sparkles className="h-4 w-4 flex-shrink-0 text-warning" strokeWidth={1.8} aria-hidden />
          <p className="flex-1 text-note leading-4 text-text2 dark:text-dark-text2">
            {t({
              fr: `Pilot AI répond aux offres ${AI_PLAN_LABELS.join(' et ')}.`,
              ht: `Pilot AI reponn nan òf ${AI_PLAN_LABELS.join(' ak ')}.`,
            })}
          </p>
          <Link
            href="/pricing"
            onClick={onClose}
            className="pressable flex-shrink-0 rounded-control bg-primary px-3 py-2 text-note font-bold text-white dark:bg-accent dark:text-accent-ink"
          >
            {t({ fr: `Passer à ${AI_UPGRADE_LABEL}`, ht: `Pase ${AI_UPGRADE_LABEL}` })}
          </Link>
        </div>
      )}

      {/* ── La conversation ──────────────────────────────────────────────── */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-body font-semibold text-primary dark:text-dark-text">
                {/* Où l'on est. C'est la première chose qu'un copilote doit
                    prouver qu'il sait, sans quoi il n'est qu'un champ vide. */}
                {route.here}
              </p>
              <p className="mt-1 text-body leading-5 text-text2 dark:text-dark-text2">
                {route.capsule}
              </p>
            </div>

            {/* L'état réel des données, jamais un « ● En ligne » décoratif :
                ce témoin dit si l'assistant a vos chiffres sous les yeux, ce
                qui change la valeur de sa réponse. */}
            <p className="flex items-center gap-2 text-note text-muted dark:text-dark-muted">
              <span
                className={cn('h-1.5 w-1.5 flex-shrink-0 rounded-pill',
                  dataState === 'ready'  ? 'bg-accent'
                  : dataState === 'loading' ? 'bg-border dark:bg-dark-border'
                  : 'bg-warning')}
                aria-hidden
              />
              {/* L'offre passe avant les chiffres : tant qu'elle est inconnue,
                  les questions proposées sont grisées, et une rangée de boutons
                  éteints sans un mot laisse croire à une panne. */}
              {plan.loading      ? t({ fr: 'Je vérifie votre offre…',   ht: 'M ap verifye òf ou…' })
                : dataState === 'ready'   ? t({ fr: 'Vos chiffres sont chargés.', ht: 'Chif ou yo chaje.' })
                : dataState === 'loading' ? t({ fr: 'Je lis vos chiffres…',       ht: 'M ap li chif ou yo…' })
                : t({
                    fr: 'Je n’ai pas pu lire vos chiffres : je répondrai sans eux.',
                    ht: 'M pa rive li chif ou yo : m ap reponn san yo.',
                  })}
            </p>

            {showPrompts && (
              <div className="flex flex-col gap-2">
                {route.prompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => ask(prompt)}
                    disabled={!ready}
                    className={cn(
                      'pressable flex min-h-touch items-center rounded-control border border-border px-3 text-left',
                      'text-body text-text transition hover:border-primary/30 hover:bg-surface',
                      'disabled:opacity-50 dark:border-dark-border dark:text-dark-text dark:hover:bg-white/5',
                    )}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            )}

            {route.next && (
              <Link
                href={route.next.href}
                onClick={onClose}
                // Écrit en 12, il doit quand même offrir 44 au pouce (§8) :
                // c'est la zone qui grandit, pas le texte.
                className="-my-2 inline-flex min-h-touch items-center self-start text-note font-semibold text-primary underline underline-offset-2 dark:text-accent"
              >
                {t({ fr: 'Ensuite : ', ht: 'Apre sa : ' })}{route.next.label}
              </Link>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((m) => (
              <div
                key={m.id}
                className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}
              >
                <div
                  className={cn(
                    // Le rayon interne est plus petit que celui du panneau
                    // (12 → 8) : deux rayons identiques emboîtés épaississent
                    // le liseré dans les angles (§5).
                    'max-w-[85%] rounded-control px-3 py-2 text-body leading-5',
                    m.role === 'user'
                      ? 'bg-primary text-white'
                      : 'bg-surface text-text dark:bg-white/5 dark:text-dark-text',
                  )}
                >
                  {m.role === 'assistant' && m.streaming && !m.content ? (
                    <span className="flex items-center gap-1" aria-label={t({ fr: 'Pilot AI écrit', ht: 'Pilot AI ap ekri' })}>
                      {[0, 1, 2].map((i) => (
                        <span
                          key={i}
                          className="h-1.5 w-1.5 animate-pulse rounded-pill bg-muted"
                          style={{ animationDelay: `${i * 0.18}s` }}
                        />
                      ))}
                    </span>
                  ) : m.role === 'assistant' ? (
                    <div className="pp-markdown">
                      <ReactMarkdown>{m.content}</ReactMarkdown>
                    </div>
                  ) : (
                    m.content
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* ── Le champ ─────────────────────────────────────────────────────────
          Entrée envoie, Maj+Entrée va à la ligne : la même promesse que partout
          ailleurs dans le produit. */}
      <div className="border-t border-border px-4 py-3 dark:border-dark-border">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input); }
            }}
            placeholder={hasAI
              ? t({ fr: 'Posez votre question…', ht: 'Poze kesyon ou…' })
              : t({ fr: 'Disponible avec une offre supérieure', ht: 'Disponib ak yon òf pi wo' })}
            disabled={!hasAI}
            aria-label={t({ fr: 'Votre question', ht: 'Kesyon ou' })}
            className={cn(
              'min-h-touch max-h-32 flex-1 resize-none rounded-control border border-border bg-white px-3 py-3',
              'text-body text-text placeholder:text-muted',
              'focus:border-primary/40 focus:outline-none disabled:bg-surface disabled:text-muted',
              'dark:border-dark-border dark:bg-dark-bg dark:text-dark-text',
            )}
          />

          {isStreaming ? (
            <button
              type="button"
              onClick={cancel}
              aria-label={t({ fr: 'Arrêter', ht: 'Kanpe' })}
              className="pressable flex h-touch w-touch flex-shrink-0 items-center justify-center rounded-control bg-surface text-text2 dark:bg-white/5 dark:text-dark-text2"
            >
              <Square className="h-4 w-4" strokeWidth={2} aria-hidden />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => ask(input)}
              disabled={!ready || !input.trim()}
              aria-label={t({ fr: 'Envoyer', ht: 'Voye' })}
              className={cn(
                'pressable flex h-touch w-touch flex-shrink-0 items-center justify-center rounded-control',
                'bg-primary text-white transition disabled:opacity-40',
                'dark:bg-accent dark:text-accent-ink',
              )}
            >
              <Send className="h-4 w-4" strokeWidth={1.8} aria-hidden />
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
