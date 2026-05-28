'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { QK } from '../lib/queryKeys';
import {
  listConversations,
  createConversation,
  renameConversation,
  deleteConversation,
  type Conversation,
} from '../app/actions/conversations';

export function useConversations(userId: string | undefined) {
  const qc = useQueryClient();
  const key = QK.conversations(userId ?? '');

  // ── List ──────────────────────────────────────────────────────────────────
  const query = useQuery({
    queryKey:  key,
    queryFn:   listConversations,
    enabled:   !!userId,
    staleTime: 1000 * 30,
  });

  // ── Create ────────────────────────────────────────────────────────────────
  const create = useMutation({
    mutationFn: (title?: string) => createConversation(title),
    onSuccess:  (newConv) => {
      qc.setQueryData<Conversation[]>(key, (old = []) => [newConv, ...old]);
    },
    onError: () => toast.error('Impossible de créer la conversation'),
  });

  // ── Rename ────────────────────────────────────────────────────────────────
  const rename = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      renameConversation(id, title),
    onMutate: async ({ id, title }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Conversation[]>(key);
      qc.setQueryData<Conversation[]>(key, (old = []) =>
        old.map((c) => (c.id === id ? { ...c, title } : c)),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      qc.setQueryData(key, ctx?.prev);
      toast.error('Renommage échoué');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  // ── Delete ────────────────────────────────────────────────────────────────
  const remove = useMutation({
    mutationFn: (id: string) => deleteConversation(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Conversation[]>(key);
      qc.setQueryData<Conversation[]>(key, (old = []) =>
        old.filter((c) => c.id !== id),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      qc.setQueryData(key, ctx?.prev);
      toast.error('Suppression échouée');
    },
  });

  return { query, create, rename, remove };
}
