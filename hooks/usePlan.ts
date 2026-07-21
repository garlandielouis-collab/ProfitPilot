'use client';

import { useCompanyContext } from '../contexts/CompanyContext';
import { planHasFeature } from '../lib/planFeatures';
import type { PlanKey } from '../lib/plans';
import type { Feature } from '../lib/planFeatures';

export type PlanState = {
  planKey:  PlanKey | null;
  loading:  boolean;
  can:      (feature: Feature) => boolean;
};

/**
 * @deprecated Préférer usePermissions().canUse() + useCompany().planKey
 * Conservé pour compatibilité avec le code existant.
 */
export function usePlan(): PlanState {
  const { planKey, loading, canUse } = useCompanyContext();
  return {
    planKey: planKey as PlanKey | null,
    loading,
    can: canUse,
  };
}
