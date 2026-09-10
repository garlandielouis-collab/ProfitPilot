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
import { getPreviewPlan, subscribePreview } from '../lib/planPreview';

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
  /** Plan d'abonnement actif — ou l'offre simulée si un aperçu est en cours. */
  planKey:     string | null;
  /** L'offre RÉELLE, celle du compte. Elle ne bouge jamais avec l'aperçu. */
  realPlanKey: string | null;
  /** L'offre simulée, ou `null` quand on voit son offre réelle. */
  previewPlan: string | null;
  /** Les capacités offertes temporairement — parrainage, geste commercial. */
  grants:      string[];
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
  realPlanKey:  null,
  previewPlan:  null,
  grants:       [],
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

  // ── L'aperçu des offres ────────────────────────────────────────────────────
  // Il ne remplace le plan QUE dans ce contexte, c'est-à-dire uniquement dans
  // ce que l'écran affiche. Le serveur ne lit pas ce réglage : `assertFeature()`
  // et les politiques RLS continuent de juger sur l'offre réelle. Voir un écran
  // d'Elit ne donne donc pas Elit — c'est exactement ce qu'on veut d'un aperçu.
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => setPreview(getPreviewPlan());
    sync();
    return subscribePreview(sync);
  }, []);

  const realPlanKey = ctx?.planKey ?? null;
  const shownPlanKey = preview ?? realPlanKey;

  // Un droit offert s'ajoute à l'offre, il ne la remplace pas — et il vaut même
  // pendant un aperçu : le mois gagné par parrainage est réel, lui.
  const grants = ctx?.grants ?? [];
  const grantKey = grants.join(',');

  const canUse = useCallback(
    (feature: Feature) =>
      planHasFeature(shownPlanKey as any, feature) || grantKey.split(',').includes(feature),
    [shownPlanKey, grantKey],
  );

  const value: CompanyContextValue = {
    company:      ctx?.company ?? null,
    allCompanies: ctx?.allCompanies ?? [],
    role:         ctx?.role ?? null,
    planKey:      shownPlanKey,
    realPlanKey,
    previewPlan:  preview,
    grants,
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
