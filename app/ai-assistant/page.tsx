'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import { motion, AnimatePresence } from 'framer-motion';
import dynamic from 'next/dynamic';
const ReactMarkdown = dynamic(() => import('react-markdown'), { ssr: false });
import {
  Plus, Trash2, Send, Square, Sparkles,
  MessageSquare, ChevronLeft, ChevronRight, Bot, User,
  TrendingUp, AlertTriangle, Package, DollarSign,
  PenLine,
} from 'lucide-react';
import { toast } from 'sonner';

import { supabase }               from '../../lib/supabaseClient';
import { useConversations }        from '../../hooks/useConversations';
import { useMessages }             from '../../hooks/useMessages';
import { getWeeklySummaryAction }  from '../actions/ai';
import { useLanguage }            from '../../components/LanguageWrapper';
import { cn }                      from '../../lib/utils';
import type { Conversation }       from '../actions/conversations';

// ── helpers ────────────────────────────────────────────────────────────────────

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m    = Math.floor(diff / 60000);
  if (m < 1)  return 'maintenant';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}j`;
}

// ── Typing dots ───────────────────────────────────────────────────────────────

function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-1 py-0.5">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400"
          animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
          transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.18 }}
        />
      ))}
    </div>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────────

function MessageBubble({
  role, content, streaming,
}: { role: 'user' | 'assistant'; content: string; streaming?: boolean }) {
  const isUser = role === 'user';
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn('flex gap-3', isUser ? 'flex-row-reverse' : 'flex-row')}
    >
      <div className={cn(
        'flex-shrink-0 h-8 w-8 rounded-xl flex items-center justify-center',
        isUser
          ? 'bg-slate-200 text-[var(--color-muted)]'
          : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
      )}>
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>

      <div className={cn(
        'max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-relaxed',
        isUser
          ? 'bg-[#001F3F] text-white rounded-tr-sm'
          : 'bg-[var(--color-surface)] text-[var(--color-text)] border border-[var(--color-border)] rounded-tl-sm',
      )}>
        {streaming && !content ? (
          <TypingDots />
        ) : (
          <ReactMarkdown
            components={{
              p:      ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
              strong: ({ children }) => <strong className="font-semibold text-[var(--color-text)]">{children}</strong>,
              ul:     ({ children }) => <ul className="mb-2 list-disc pl-4 space-y-1">{children}</ul>,
              ol:     ({ children }) => <ol className="mb-2 list-decimal pl-4 space-y-1">{children}</ol>,
              li:     ({ children }) => <li className="text-[var(--color-muted)]">{children}</li>,
              h2:     ({ children }) => <h2 className="mb-2 mt-3 font-bold text-[var(--color-text)]">{children}</h2>,
              h3:     ({ children }) => <h3 className="mb-1 mt-2 font-semibold text-[var(--color-text)]">{children}</h3>,
              code:   ({ children }) => (
                <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-emerald-700">
                  {children}
                </code>
              ),
            }}
          >
            {content}
          </ReactMarkdown>
        )}
        {streaming && content && (
          <span className="ml-1 inline-block h-3 w-0.5 animate-pulse bg-emerald-400" />
        )}
      </div>
    </motion.div>
  );
}

// ── Sidebar content (shared desktop + mobile) ────────────────────────────────

function SidebarContent({
  userId, activeId, onSelect, collapsed, onToggle, onMobileClose,
}: {
  userId:        string | undefined;
  activeId:      string | null;
  onSelect:      (id: string) => void;
  collapsed:     boolean;
  onToggle:      () => void;
  onMobileClose?: () => void;
}) {
  const { t } = useLanguage();
  const { query, create, rename, remove } = useConversations(userId);
  const conversations = query.data ?? [];
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameVal,  setRenameVal]  = useState('');

  const handleCreate = () => {
    create.mutate(undefined, {
      onSuccess: (c: Conversation) => {
        onSelect(c.id);
        onMobileClose?.();
      },
    });
  };

  const startRename = (c: Conversation, e: React.MouseEvent) => {
    e.stopPropagation();
    setRenamingId(c.id);
    setRenameVal(c.title ?? '');
  };

  const submitRename = (id: string) => {
    if (renameVal.trim()) rename.mutate({ id, title: renameVal.trim() });
    setRenamingId(null);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 p-3 border-b border-[var(--color-border)]">
        {!collapsed && (
          <span className="text-xs font-semibold uppercase tracking-widest text-[var(--color-muted)]">
            {t({ fr: 'Conversations', ht: 'Konvèsasyon' })}
          </span>
        )}
        {/* Desktop toggle */}
        <button
          type="button"
          onClick={onToggle}
          className="hidden lg:flex rounded-lg p-1.5 text-[var(--color-muted)] hover:bg-slate-100 transition ml-auto"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
        {/* Mobile close */}
        {onMobileClose && (
          <button
            type="button"
            onClick={onMobileClose}
            className="lg:hidden flex rounded-lg p-1.5 text-[var(--color-muted)] hover:bg-slate-100 transition ml-auto"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* New conversation button */}
      <div className="p-2">
        <button
          type="button"
          onClick={handleCreate}
          disabled={create.isPending}
          className={cn(
            'flex items-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20',
            'text-emerald-400 hover:bg-emerald-500/20 transition text-sm font-medium',
            collapsed ? 'w-10 h-10 justify-center p-0' : 'w-full px-3 py-2',
          )}
        >
          <Plus className="h-4 w-4 flex-shrink-0" />
          {!collapsed && <span>{t({ fr: 'Nouvelle analyse', ht: 'Nouvo analiz' })}</span>}
        </button>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {conversations.map((c) => (
          <div
            key={c.id}
            onClick={() => { onSelect(c.id); onMobileClose?.(); }}
            className={cn(
              'group relative flex items-center gap-2 rounded-xl px-2 py-2 cursor-pointer transition',
              activeId === c.id
                ? 'bg-[#EAF1F8] text-[#001F3F]'
                : 'text-[var(--color-muted)] hover:bg-slate-100 hover:text-[var(--color-text)]',
            )}
          >
            <MessageSquare className="h-4 w-4 flex-shrink-0" />

            {!collapsed && (
              <>
                {renamingId === c.id ? (
                  <input
                    autoFocus
                    value={renameVal}
                    onChange={(e) => setRenameVal(e.target.value)}
                    onBlur={() => submitRename(c.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter')  submitRename(c.id);
                      if (e.key === 'Escape') setRenamingId(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 min-w-0 bg-slate-200 rounded px-1 text-xs text-[var(--color-text)] outline-none border border-emerald-500/50"
                  />
                ) : (
                  <span className="flex-1 min-w-0 truncate text-xs">
                    {c.title ?? t({ fr: 'Sans titre', ht: 'San tit' })}
                  </span>
                )}
                <span className="text-[10px] text-[var(--color-muted)] flex-shrink-0">
                  {timeAgo(c.updated_at)}
                </span>
                <div className="absolute right-1.5 hidden group-hover:flex items-center gap-1 bg-white rounded-lg">
                  <button
                    type="button"
                    onClick={(e) => startRename(c, e)}
                    className="rounded p-1 hover:bg-slate-200 text-[var(--color-muted)]"
                  >
                    <PenLine className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); remove.mutate(c.id); }}
                    className="rounded p-1 hover:bg-red-500/20 text-[var(--color-muted)] hover:text-red-400"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </>
            )}
          </div>
        ))}

        {!query.isLoading && conversations.length === 0 && !collapsed && (
          <p className="px-2 py-6 text-center text-xs text-[var(--color-muted)]">
            Aucune conversation.<br />Créez-en une pour commencer.
          </p>
        )}
      </div>
    </div>
  );
}

// ── Sidebar wrapper (desktop + mobile overlay) ────────────────────────────────

function Sidebar({
  userId, activeId, onSelect, collapsed, onToggle,
  mobileOpen, onMobileClose,
}: {
  userId:        string | undefined;
  activeId:      string | null;
  onSelect:      (id: string) => void;
  collapsed:     boolean;
  onToggle:      () => void;
  mobileOpen:    boolean;
  onMobileClose: () => void;
}) {
  const sharedProps = { userId, activeId, onSelect, collapsed, onToggle };

  return (
    <>
      {/* ── Desktop sidebar (toujours visible ≥ lg) ── */}
      <aside className={cn(
        'hidden lg:flex flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] transition-all duration-300 flex-shrink-0',
        collapsed ? 'w-14' : 'w-56',
      )}>
        <SidebarContent {...sharedProps} />
      </aside>

      {/* ── Mobile overlay sidebar ── */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-black/50 lg:hidden"
              onClick={onMobileClose}
            />
            {/* Panel */}
            <motion.aside
              key="mobile-sidebar"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="fixed left-0 top-0 bottom-0 z-50 w-72 bg-[var(--color-surface)] border-r border-[var(--color-border)] lg:hidden flex flex-col"
            >
              <SidebarContent {...sharedProps} onMobileClose={onMobileClose} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE ROOT
// ═══════════════════════════════════════════════════════════════════════════════

function AiAssistantPage() {
  const { t } = useLanguage();
  const QUICK = [
    { icon: TrendingUp,    text: t({ fr: 'Analyse mes ventes cette semaine', ht: 'Analize vant mwen yo semèn sa a' }) },
    { icon: AlertTriangle, text: t({ fr: 'Quelles sont mes dettes urgentes ?', ht: 'Ki dèt ijan mwen yo?' }) },
    { icon: Package,       text: t({ fr: 'Produits en rupture de stock ?', ht: 'Pwodui ki fini nan stock?' }) },
    { icon: DollarSign,    text: t({ fr: 'Comment améliorer ma trésorerie ?', ht: 'Kijan amelyore trezoreri mwen?' }) },
  ];
  const [userId,        setUserId]        = useState<string | undefined>();
  const [sidebarOpen,   setSidebarOpen]   = useState(true);
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const [activeConvId,  setActiveConvId]  = useState<string | null>(null);
  const [input,         setInput]         = useState('');
  const [summary,       setSummary]       = useState<Record<string, unknown> | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

  const { query: msgQuery, send, cancel } = useMessages(activeConvId);
  const messages    = msgQuery.data ?? [];
  const isStreaming = send.isPending;

  // auth
  useEffect(() => {
    supabase.auth.getUser().then(({ data }: any) => {
      setUserId(data.user?.id);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e: any, session: any) => {
      setUserId(session?.user?.id ?? undefined);
    });
    return () => subscription.unsubscribe();
  }, []);

  // weekly context
  useEffect(() => {
    getWeeklySummaryAction()
      .then((s) => setSummary(s as Record<string, unknown>))
      .catch(() => {});
  }, []);

  // auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isStreaming) return;
    if (!activeConvId) { toast.error('Sélectionnez ou créez une conversation'); return; }
    setInput('');
    send.mutate({ text, weeklySummary: summary });
  }, [input, isStreaming, activeConvId, send, summary]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const showWelcome = messages.length === 0;

  return (
    <div className="fullscreen-layout flex h-screen overflow-hidden bg-[var(--color-bg)]">

      {/* Sidebar */}
      <Sidebar
        userId={userId}
        activeId={activeConvId}
        onSelect={setActiveConvId}
        collapsed={!sidebarOpen}
        onToggle={() => setSidebarOpen((v) => !v)}
        mobileOpen={mobileSidebar}
        onMobileClose={() => setMobileSidebar(false)}
      />

      {/* Main area */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">

        {/* Header */}
        <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-3 py-3 bg-[var(--color-surface)]">
          {/* Bouton mobile pour ouvrir sidebar */}
          <button
            type="button"
            onClick={() => setMobileSidebar(true)}
            className="lg:hidden flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-emerald-600 dark:text-emerald-400 transition hover:bg-emerald-500/20 flex-shrink-0 font-medium"
            title="Conversations"
          >
            <MessageSquare className="h-4 w-4" />
            <span className="text-xs">{t({ fr: 'Analyses', ht: 'Analiz' })}</span>
          </button>

          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 border border-emerald-500/30">
            <Sparkles className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-semibold text-[var(--color-text)]">{t({ fr: 'Pilot AI', ht: 'Pilot AI' })}</h1>
            <p className="hidden sm:block text-xs text-[var(--color-muted)]">Assistant financier intelligent</p>
          </div>
          <div className="ml-auto">
            <span className={cn(
              'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium',
              summary ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-100 text-[var(--color-muted)]',
            )}>
              <span className={cn(
                'h-1.5 w-1.5 rounded-full',
                summary ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600',
              )} />
              {summary ? t({ fr: 'Données chargées', ht: 'Done chaje' }) : t({ fr: 'Chargement…', ht: 'Chajman…' })}
            </span>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-6 space-y-5">
          <AnimatePresence initial={false}>
            {showWelcome ? (
              <motion.div
                key="welcome"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex h-full flex-col items-center justify-center text-center py-12"
              >
                <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/15 border border-emerald-500/20">
                  <Sparkles className="h-8 w-8 text-emerald-400" />
                </div>
                <h2 className="mb-2 text-xl font-bold text-[var(--color-text)]">Bonjour, je suis PilotAI</h2>
                <p className="mb-8 max-w-md text-sm text-[var(--color-muted)]">
                  Votre conseiller financier intelligent. Je connais vos ventes, stocks et dettes
                  en temps réel. Posez-moi n'importe quelle question sur votre entreprise.
                </p>

                <div className="grid grid-cols-2 gap-3 w-full max-w-lg">
                  {QUICK.map(({ icon: Icon, text }) => (
                    <button
                      key={text}
                      type="button"
                      onClick={() => {
                        if (!activeConvId) { toast.error(t({ fr: 'Créez d\'abord une conversation', ht: 'Kreye yon konvèsasyon anvan' }) + ' ←'); return; }
                        setInput(text);
                        inputRef.current?.focus();
                      }}
                      className="flex items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-left hover:border-emerald-500/30 hover:bg-emerald-500/5 transition"
                    >
                      <Icon className="h-4 w-4 flex-shrink-0 text-[var(--color-muted)]" />
                      <span className="text-xs leading-snug text-[var(--color-muted)]">{text}</span>
                    </button>
                  ))}
                </div>

                {!activeConvId && (
                  <div className="mt-8 space-y-2">
                    <p className="hidden sm:block text-xs text-[var(--color-muted)]">
                      ← Créez une analyse dans le panneau de gauche pour commencer
                    </p>
                    <p className="sm:hidden text-xs text-[var(--color-muted)]">
                      Ouvrez le menu <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-emerald-600 dark:text-emerald-400 font-medium"><MessageSquare className="h-3 w-3" /> Analyses</span> en haut à gauche pour créer une analyse
                    </p>
                  </div>
                )}
              </motion.div>
            ) : (
              messages.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  role={msg.role}
                  content={msg.content}
                  streaming={msg.streaming}
                />
              ))
            )}
          </AnimatePresence>
          <div ref={bottomRef} />
        </div>

        {/* Input — pb-mobile-nav adds clearance for the fixed 64px bottom nav on mobile */}
        <div className="border-t border-[var(--color-border)] px-4 pt-3 pb-3 pb-mobile-nav bg-[var(--color-surface)]">
          <div className="flex items-end gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 focus-within:border-emerald-500/40 transition">
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                activeConvId
                  ? t({ fr: 'Posez votre question… (Entrée pour envoyer, Shift+Entrée pour nouvelle ligne)', ht: 'Poze kesyon ou… (Antre pou voye, Shift+Antre pou nouvo liy)' })
                  : t({ fr: 'Créez ou sélectionnez une conversation pour commencer…', ht: 'Kreye oswa chwazi yon konvèsasyon pou kòmanse…' })
              }
              disabled={!activeConvId}
              className="flex-1 resize-none bg-transparent text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] outline-none leading-relaxed max-h-40 overflow-y-auto disabled:cursor-not-allowed"
            />
            {isStreaming ? (
              <button
                type="button"
                onClick={cancel}
                className="flex-shrink-0 rounded-xl bg-red-500/20 p-2 text-red-400 hover:bg-red-500/30 transition"
                title="Arrêter"
              >
                <Square className="h-4 w-4 fill-current" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSend}
                disabled={!input.trim() || !activeConvId}
                className="flex-shrink-0 rounded-xl bg-emerald-500 p-2 text-white hover:bg-emerald-400 transition disabled:opacity-30 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/20"
              >
                <Send className="h-4 w-4" />
              </button>
            )}
          </div>
          <p className="mt-1.5 px-1 text-[10px] text-[var(--color-muted)]">
            PilotAI peut faire des erreurs. Vérifiez toujours les informations importantes.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function AiAssistantPageWrapper() {
  return (
    <ProtectedRoute>
      <AiAssistantPage />
    </ProtectedRoute>
  );
}
