'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { QK } from '../lib/queryKeys';
import {
  getBusinessProfile,
  upsertBusinessProfile,
} from '../app/actions/settings';
import type { BusinessProfileInput } from '../lib/validations';

export function useBusinessProfile(userId: string | undefined) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey:  QK.businessProfile(userId ?? ''),
    queryFn:   () => getBusinessProfile(),
    enabled:   !!userId,
    staleTime: 1000 * 60 * 5, // 5 min
  });

  const mutation = useMutation({
    mutationFn: (data: BusinessProfileInput) => upsertBusinessProfile(data),
    onMutate: async (newData) => {
      // Optimistic update
      await qc.cancelQueries({ queryKey: QK.businessProfile(userId ?? '') });
      const previous = qc.getQueryData(QK.businessProfile(userId ?? ''));
      qc.setQueryData(QK.businessProfile(userId ?? ''), (old: any) => ({
        ...old,
        ...newData,
      }));
      return { previous };
    },
    onError: (_err, _newData, ctx) => {
      qc.setQueryData(QK.businessProfile(userId ?? ''), ctx?.previous);
      toast.error('Erreur lors de la sauvegarde du profil');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.businessProfile(userId ?? '') });
      toast.success('Profil mis à jour ✓');
    },
  });

  return { query, mutation };
}
