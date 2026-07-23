import type { PlanKey } from './plans';

export type Feature =
  | 'ai_assistant'
  | 'multi_stores'
  | 'employees'
  | 'advanced_reports'
  | 'online_store'
  | 'priority_support'
  | 'advanced_dashboard'
  | 'advanced_analytics'
  | 'automation'
  | 'api_access';

const PLAN_FEATURES: Record<PlanKey, Feature[]> = {
  'Ti Machann':     [],
  'Business Pilot': [
    'ai_assistant',
    'multi_stores',
    'employees',
    'advanced_reports',
    'advanced_dashboard',
    'online_store',
  ],
  'Expert': [
    'ai_assistant',
    'multi_stores',
    'employees',
    'advanced_reports',
    'advanced_dashboard',
    'online_store',
    'priority_support',
    'advanced_analytics',
    'automation',
    'api_access',
  ],
};

// Maximum number of businesses a user can own per plan
export const PLAN_MAX_STORES: Record<PlanKey, number> = {
  'Ti Machann':     1,
  'Business Pilot': 1,
  'Expert':         3,
};

export function planHasFeature(planKey: PlanKey | null | undefined, feature: Feature): boolean {
  if (!planKey) return false;
  return PLAN_FEATURES[planKey]?.includes(feature) ?? false;
}

export function planMaxStores(planKey: PlanKey | null | undefined): number {
  if (!planKey) return 1;
  return PLAN_MAX_STORES[planKey] ?? 1;
}
