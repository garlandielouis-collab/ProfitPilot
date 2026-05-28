'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { QK } from '../lib/queryKeys';
import {
  getUserPreferences,
  upsertUserPreferences,
} from '../app/actions/settings';
import type { UserPreferencesInput } from '../lib/validations';

const DEFAULT_PREFS: UserPreferencesInput = {
  language:              'fr',
  currency:              'HTG',
  dark_mode:             false,
  notifications_enabled: true,
  auto_save:             true,
};

export function usePreferences(userId: string | undefined) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey:  QK.userPrefs(userId ?? ''),
    queryFn:   () => getUserPreferences(),
    enabled:   !!userId,
    staleTime: 1000 * 60 * 10,
    select: (data) => ({
      ...DEFAULT_PREFS,
      ...(data ?? {}),
    }),
  });

  const mutation = useMutation({
    mutationFn: (data: UserPreferencesInput) => upsertUserPreferences(data),
    onMutate: async (newData) => {
      await qc.cancelQueries({ queryKey: QK.userPrefs(userId ?? '') });
      const previous = qc.getQueryData(QK.userPrefs(userId ?? ''));
      qc.setQueryData(QK.userPrefs(userId ?? ''), (old: any) => ({
        ...old,
        ...newData,
      }));
      return { previous };
    },
    onError: (_err, _newData, ctx) => {
      qc.setQueryData(QK.userPrefs(userId ?? ''), ctx?.previous);
      toast.error('Erreur lors de la sauvegarde des préférences');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.userPrefs(userId ?? '') });
      toast.success('Préférences sauvegardées ✓');
    },
  });

  return { query, mutation, defaults: DEFAULT_PREFS };
}
