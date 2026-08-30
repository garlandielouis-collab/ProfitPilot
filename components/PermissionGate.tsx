'use client';

import type { ReactNode } from 'react';
import { usePermissions } from '../hooks/usePermissions';
import type { Permission } from '../lib/rbac';
import type { Feature } from '../lib/planFeatures';
import { Sparkles } from 'lucide-react';

type PermissionGateProps = {
  children:  ReactNode;
  /** Permission RBAC requise (ex: 'employees:invite') */
  permission?: Permission;
  /** Feature plan requise (ex: 'ai_assistant') */
  feature?:   Feature;
  /**
   * Affiché si la permission/feature est manquante.
   * Par défaut: rien (null).
   */
  fallback?:  ReactNode;
};

/**
 * Affiche `children` seulement si l'utilisateur a la permission ET la feature requise.
 *
 * @example
 * <PermissionGate permission="employees:invite">
 *   <InviteButton />
 * </PermissionGate>
 *
 * <PermissionGate feature="ai_assistant" fallback={<UpsellBanner />}>
 *   <AIChat />
 * </PermissionGate>
 */
export function PermissionGate({
  children,
  permission,
  feature,
  fallback = null,
}: PermissionGateProps) {
  const { can, canUse, loading } = usePermissions();

  // Ne rien afficher tant que le contexte se charge (évite le flash)
  if (loading) return null;

  if (permission && !can(permission)) return <>{fallback}</>;
  if (feature    && !canUse(feature)) return <>{fallback}</>;

  return <>{children}</>;
}

// ─── Variante upsell intégrée ────────────────────────────────────────────────

type FeatureGateProps = {
  feature:   Feature;
  children:  ReactNode;
  title?:    string;
  message?:  string;
};

/**
 * Comme PermissionGate mais affiche automatiquement un banner upsell si le
 * plan ne supporte pas la feature.
 */
export function FeatureGate({
  feature,
  children,
  title   = 'Fonctionnalité Premium',
  message = 'Disponible en plan Business Pilot ou Expert.',
}: FeatureGateProps) {
  const { canUse, loading } = usePermissions();
  if (loading) return null;
  if (canUse(feature)) return <>{children}</>;

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
      <Sparkles className="h-5 w-5 flex-shrink-0 text-amber-600" strokeWidth={1.8} aria-hidden />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-amber-700">{title}</p>
        <p className="text-xs text-amber-600">{message}</p>
      </div>
      <a
        href="/pricing"
        className="flex-shrink-0 rounded-xl bg-amber-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-400 transition"
      >
        Voir les plans
      </a>
    </div>
  );
}
