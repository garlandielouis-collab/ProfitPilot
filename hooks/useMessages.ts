'use client';

import { useCallback, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { QK } from '../lib/queryKeys';
import { listMessages, saveMessage, type Message } from '../app/actions/conversations';

export type UIMessage = {
  id:        string;
  role:      'user' | 'assistant';
  content:   string;
  streaming?: boolean;
};

export function useMessages(conversationId: string | null) {
  const qc       = useQueryClient();
  const key      = QK.messages(conversationId ?? '');
  const abortRef = useRef<AbortController | null>(null);

  const query = useQuery({
    queryKey:  key,
    queryFn:   () => listMessages(conversationId!),
    enabled:   !!conversationId,
    staleTime: 0,
    select: (data): UIMessage[] =>
      data
        .filter((m): m is Message & { role: 'user' | 'assistant' } =>
          m.role === 'user' || m.role === 'assistant')
        .map((m) => ({ id: m.id, role: m.role, content: m.content })),
  });

  const addOptimistic = useCallback(
    (msg: UIMessage) => { qc.setQueryData<UIMessage[]>(key, (old = []) => [...old, msg]); },
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

  const send = useMutation({
    mutationFn: async ({ text, weeklySummary }: { text: string; weeklySummary?: Record<string, unknown> | null }) => {
      if (!conversationId) throw new Error('Aucune conversation sélectionnée');

      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      addOptimistic({ id: `opt-user-${Date.now()}`, role: 'user', content: text });
      addOptimistic({ id: `opt-assistant-${Date.now()}`, role: 'assistant', content: '', streaming: true });

      const res = await fetch('/api/ai/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ userMessage: text, conversationId, weeklySummary: weeklySummary ?? null, stream: true }),
        signal:  ctrl.signal,
      });

      if (!res.ok) throw new Error(`API ${res.status}`);

      let fullContent = '';
      const reader  = res.body!.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value, { stream: true }).split('\n')) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6);
          if (raw === '[DONE]') break;
          try {
            const parsed = JSON.parse(raw) as { delta?: string };
            fullContent += parsed.delta ?? '';
            patchLast({ content: fullContent });
          } catch { /* skip */ }
        }
      }

      patchLast({ streaming: false });

      await Promise.all([
        saveMessage(conversationId, 'user',      text),
        saveMessage(conversationId, 'assistant', fullContent, { model: 'claude-3-5-sonnet-20241022' }),
      ]);

      qc.invalidateQueries({ queryKey: key });
      return fullContent;
    },
    onError: (err: Error) => {
      if (err.name === 'AbortError') return;
      patchLast({ content: '⚠️ Erreur de connexion. Réessayez.', streaming: false });
      toast.error('Erreur PilotAI');
    },
  });

  const cancel = useCallback(() => { abortRef.current?.abort(); }, []);

  return { query, send, cancel };
}
