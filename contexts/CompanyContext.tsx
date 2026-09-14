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

// ─────────────────────────────────────────────────────────────────────────────
// Le contexte gardé d’une visite à l’autre
//
// Ce contexte est ce que TOUT écran attend pour savoir quoi afficher : le
// tableau de bord ne dessine rien tant que `loading` est vrai. Le demander au
// serveur à chaque chargement de page, c’est un aller-retour complet (identité,
// commerce, rôle, offre, droits) AVANT le premier pixel — une seconde ou deux
// sur une connexion mobile haïtienne, passées devant une roue qui tourne.
//
// On repart donc du dernier contexte connu, puis on revalide en arrière-plan.
// Trois précautions, parce qu’un contexte périmé ne doit jamais ouvrir de porte :
//
//   Il est rangé PAR compte. Au montage, on relit la session (lecture locale,
//   sans réseau) : si l’identifiant ne correspond pas, le cache est jeté avant
//   d’avoir servi à quoi que ce soit.
//   Il est purement d’AFFICHAGE. Le serveur ne le lit pas : `assertFeature()`,
//   `assertPermission()` et les politiques RLS jugent sur l’état réel. Une
//   offre périmée d’une seconde ne donne donc accès à rien.
//   Il est effacé à la déconnexion, et remplacé dès que la réponse arrive.
// ─────────────────────────────────────────────────────────────────────────────

const CACHE_KEY = 'pp_tenant_ctx';

type CachedTenant = { userId: string; ctx: ClientTenantContext };

function readCache(): CachedTenant | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedTenant;
    return parsed?.userId && parsed?.ctx?.company ? parsed : null;
  } catch {
    return null;
  }
}

function writeCache(userId: string, ctx: ClientTenantContext): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ userId, ctx }));
  } catch {
    /* stockage plein ou refusé : on s’en passe */
  }
}

function clearCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    /* rien à faire */
  }
}

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
      // Le contexte frais devient celui que la prochaine visite affichera
      // sans attendre. Rangé sous l’identifiant du compte : un autre compte
      // sur le même navigateur ne verra jamais celui-ci.
      if (data) {
        const { data: { session } } = await supabase.auth.getSession();
        const uid = session?.user?.id;
        if (uid) writeCache(uid, data);
      } else {
        clearCache();
      }
    } catch {
      setCtx(null);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, []);

  // Load on mount and on auth change
  useEffect(() => {
    // ① Le dernier contexte connu, tout de suite : l’écran a de quoi se
    //    dessiner pendant que la revalidation part.
    const cached = readCache();
    if (cached) {
      setCtx(cached.ctx);
      setLoading(false);
      // …sauf s’il appartient à quelqu’un d’autre. La session se lit en local,
      // sans réseau : la vérification ne coûte rien et ferme le seul trou.
      supabase.auth.getSession().then(({ data: { session } }: any) => {
        if (session?.user?.id && session.user.id !== cached.userId) {
          clearCache();
          setCtx(null);
          setLoading(true);
        }
      });
    }

    // ② La vérité, dans tous les cas.
    load();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event: string) => {
      if (event === 'SIGNED_OUT') {
        clearCache();
        setCtx(null);
      }
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
