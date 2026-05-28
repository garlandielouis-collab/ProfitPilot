'use client';

import { useCallback, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { QK } from '../lib/queryKeys';
import {
  listMessages,
  saveMessage,
  type Message,
} from '../app/actions/conversations';

export type UIMessage = {
  id:      string;
  role:    'user' | 'assistant';
  content: string;
  streaming?: boolean;     // true while SSE stream is in progress
};

export function useMessages(conversationId: string | null) {
  const qc  = useQueryClient();
  const key = QK.messages(conversationId ?? '');
  const abortRef = useRef<AbortController | null>(null);

  // ── Fetch persisted messages ───────────────────────────────────────────────
  const query = useQuery({
    queryKey:  key,
    queryFn:   () => listMessages(conversationId!),
    enabled:   !!conversationId,
    staleTime: 0,
    select: (data): UIMessage[] =>
      data
        .filter((m): m is Message & { role: 'user' | 'assistant' } =>
          m.role === 'user' || m.role === 'assistant',
        )
        .map((m) => ({
          id:      m.id,
          role:    m.role,
          content: m.content,
        })),
  });

  // ── Optimistic message adder ───────────────────────────────────────────────
  const addOptimistic = useCallback(
    (msg: UIMessage) => {
      qc.setQueryData<UIMessage[]>(key, (old = []) => [...old, msg]);
    },
    [qc, key],
  );

  const patchLast = useCallback(
    (patch: Partial<UIMessage>) => {
      qc.setQueryData<UIMessage[]>(key, (old = []) => {
        if (!old.length) return old;
        const updated = [...old];
        updated[updated.length - 1] = { ...updated[updated.length - 1], ...patch };
        return updated;
      });
    },
    [qc, key],
  );

  // ── Streaming send ────────────────────────────────────────────────────────
  /**
   * 1. Optimistically add user message to cache
   * 2. POST to /api/ai/chat
   * 3. Read SSE stream, patch assistant bubble token-by-token
   * 4. Persist both messages to DB via saveMessage server action
   */
  const send = useMutation({
    mutationFn: async ({
      text,
      weeklySummary,
    }: {
      text: string;
      weeklySummary?: Record<string, unknown> | null;
    }) => {
      if (!conversationId) throw new Error('Aucune conversation sélectionnée');

      // Abort any in-flight stream
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      const userMsg: UIMessage = {
        id:      `opt-user-${Date.now()}`,
        role:    'user',
        content: text,
      };
      addOptimistic(userMsg);

      const assistantMsg: UIMessage = {
        id:       `opt-assistant-${Date.now()}`,
        role:     'assistant',
        content:  '',
        streaming: true,
      };
      addOptimistic(assistantMsg);

      // ── Stream from API ──────────────────────────────────────────────────
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userMessage:         text,
          conversationId,
          weeklySummary:       weeklySummary ?? null,
          conversationHistory: [],   // route uses DB now; history is sent by route
          stream:              true,
        }),
        signal: ctrl.signal,
      });

      if (!res.ok) throw new Error(`API ${res.status}`);

      let fullContent = '';

      const reader    = res.body!.getReader();
      const decoder   = new TextDecoder();

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });

        // SSE lines: "data: <token>\n\n"
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6);
          if (payload === '[DONE]') break;
          try {
            const parsed = JSON.parse(payload) as { delta?: string; response?: string };
            const token  = parsed.delta ?? parsed.response ?? '';
            fullContent += token;
            patchLast({ content: fullContent });
          } catch {
            // non-JSON line — skip
          }
        }
      }

      patchLast({ streaming: false });

      // ── Persist to DB ────────────────────────────────────────────────────
      await Promise.all([
        saveMessage(conversationId, 'user',      text),
        saveMessage(conversationId, 'assistant', fullContent, { model: 'claude-3-5-sonnet-20241022' }),
      ]);

      // Invalidate so next mount loads fresh from DB
      qc.invalidateQueries({ queryKey: key });

      return fullContent;
    },
    onError: (err: Error) => {
      if (err.name === 'AbortError') return; // intentional cancel
      patchLast({ content: '⚠️ Erreur de connexion. Réessayez.', streaming: false });
      toast.error('Erreur PilotAI');
    },
  });

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { query, send, cancel };
}
