'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { supabase } from '../lib/supabaseClient';
import { type Role, type Permission, roleHasPermission } from '../lib/rbac';
import { type Feature, planHasFeature } from '../lib/planFeatures';
import { getClientTenantContext, type ClientTenantContext, type CompanyInfo } from '../app/actions/company';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type CompanyContextValue = {
  /** Données de l'entreprise active */
  company:     CompanyInfo | null;
  /** Toutes les entreprises auxquelles l'user a accès */
  allCompanies: Array<{ id: string; name: string }>;
  /** Rôle de l'utilisateur dans l'entreprise active */
  role:        Role | null;
  /** Plan d'abonnement actif */
  planKey:     string | null;
  /** Vrai tant que le contexte se charge */
  loading:     boolean;
  /** Vérifie si l'utilisateur peut faire une action */
  can:         (permission: Permission) => boolean;
  /** Vérifie si une feature est disponible selon le plan */
  canUse:      (feature: Feature) => boolean;
  /** Recharge le contexte (après switch de boutique, etc.) */
  refresh:     () => Promise<void>;
};

// ─────────────────────────────────────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────────────────────────────────────

const CompanyContext = createContext<CompanyContextValue>({
  company:      null,
  allCompanies: [],
  role:         null,
  planKey:      null,
  loading:      true,
  can:          () => false,
  canUse:       () => false,
  refresh:      async () => {},
});

// ─────────────────────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────────────────────

export function CompanyProvider({ children }: { children: ReactNode }) {
  const [ctx,     setCtx]     = useState<ClientTenantContext | null>(null);
  const [loading, setLoading] = useState(true);
  const loadingRef = useRef(false);

  const load = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      const data = await getClientTenantContext();
      setCtx(data);
    } catch {
      setCtx(null);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, []);

  // Load on mount and on auth change
  useEffect(() => {
    load();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event: string) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
        load();
      }
    });
    return () => subscription.unsubscribe();
  }, [load]);

  const can = useCallback(
    (permission: Permission) =>
      ctx?.role ? roleHasPermission(ctx.role, permission) : false,
    [ctx?.role],
  );

  const canUse = useCallback(
    (feature: Feature) => planHasFeature(ctx?.planKey as any, feature),
    [ctx?.planKey],
  );

  const value: CompanyContextValue = {
    company:      ctx?.company ?? null,
    allCompanies: ctx?.allCompanies ?? [],
    role:         ctx?.role ?? null,
    planKey:      ctx?.planKey ?? null,
    loading,
    can,
    canUse,
    refresh:      load,
  };

  return (
    <CompanyContext.Provider value={value}>
      {children}
    </CompanyContext.Provider>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal hook (use via useCompany / usePermissions instead)
// ─────────────────────────────────────────────────────────────────────────────

export function useCompanyContext(): CompanyContextValue {
  return useContext(CompanyContext);
}
