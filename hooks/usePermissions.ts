'use client';

import { useCompanyContext } from '../contexts/CompanyContext';
import type { Permission } from '../lib/rbac';
import type { Feature } from '../lib/planFeatures';

export type UsePermissionsReturn = {
  /** Vérifie si l'utilisateur a la permission RBAC */
  can:    (permission: Permission) => boolean;
  /** Vérifie si la feature est disponible sur le plan actif */
  canUse: (feature: Feature) => boolean;
  loading: boolean;
};

/**
 * Hook centralisé pour vérifier les permissions et les feature flags.
 *
 * @example
 * const { can, canUse } = usePermissions();
 * if (!can('employees:invite')) return <Forbidden />;
 * if (!canUse('ai_assistant')) return <Upsell />;
 */
export function usePermissions(): UsePermissionsReturn {
  const { can, canUse, loading } = useCompanyContext();
  return { can, canUse, loading };
}
