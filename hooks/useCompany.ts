'use client';

import { useCompanyContext } from '../contexts/CompanyContext';
import type { CompanyInfo } from '../app/actions/company';
import type { Role } from '../lib/rbac';

export type UseCompanyReturn = {
  company:      CompanyInfo | null;
  allCompanies: Array<{ id: string; name: string }>;
  role:         Role | null;
  planKey:      string | null;
  loading:      boolean;
  refresh:      () => Promise<void>;
};

/**
 * Accès aux infos de l'entreprise active et du rôle de l'utilisateur.
 *
 * @example
 * const { company, role } = useCompany();
 */
export function useCompany(): UseCompanyReturn {
  const { company, allCompanies, role, planKey, loading, refresh } = useCompanyContext();
  return { company, allCompanies, role, planKey, loading, refresh };
}
