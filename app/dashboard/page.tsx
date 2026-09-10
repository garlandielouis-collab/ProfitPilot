'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Le tableau de bord — l'orchestrateur, et rien d'autre
//
// Cet écran ne dessine plus rien. Il fait trois choses :
//
//   1. il demande les données (un lot, puis l'autre — §49) ;
//   2. il lit le NIVEAU de l'offre (`lib/dashboardLevel.ts`, §57) ;
//   3. il rend la composition correspondante.
//
// « Un écran = une tâche = un fichier » : la tâche de ce fichier est de
// choisir. Les 493 lignes de l'ancien tableau de bord ont été réparties entre
// trois compositions et onze briques partagées — pas recopiées trois fois
// (§55, §56).
//
// ── Pourquoi trois compositions, et pas des `if` dans une seule page ───────
//
// Le §1 le dit avant tout le reste : « Il ne faut PAS simplement ajouter
// davantage de widgets au fur et à mesure que le plan devient cher. Chaque plan
// doit avoir sa propre hiérarchie d'information. » Une page unique truffée de
// conditions produit exactement l'inverse : la même hiérarchie pour tous, avec
// des trous. Trois fichiers, trois ordres de lecture, un seul jeu de briques.
// ─────────────────────────────────────────────────────────────────────────────

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import { ProtectedRoute } from '../../components/ProtectedRoute';
import { CockpitWelcome } from '../../components/CockpitWelcome';
import { useLanguage } from '../../components/LanguageWrapper';
import { useCompanyContext } from '../../contexts/CompanyContext';
import { supabase } from '../../lib/supabaseClient';
import { dashboardLevel } from '../../lib/dashboardLevel';

import { useDashboard } from '../../components/dashboard/useDashboard';
import { EsansyelDashboard } from '../../components/dashboard/esansyel/EsansyelDashboard';
import { KwasansDashboard } from '../../components/dashboard/kwasans/KwasansDashboard';
import { ElitDashboard } from '../../components/dashboard/elit/ElitDashboard';

function DashboardInner() {
  const { t } = useLanguage();
  const searchParams = useSearchParams();
  const showWelcome = searchParams.get('welcome') === '1';

  const { planKey, company, loading: contextLoading } = useCompanyContext();
  const level = dashboardLevel(planKey);

  const [userName, setUserName] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }: any) => {
      const meta = session?.user?.user_metadata;
      setUserName(meta?.full_name ?? meta?.name ?? session?.user?.email?.split('@')[0] ?? '');
    });
  }, []);

  // Esansyel s'arrête au premier lot : demander le second lui coûterait un
  // aller-retour pour des blocs que son offre n'ouvre pas (§11, §49).
  const state = useDashboard({
    initialRange: level === 'basic' ? 'month' : 'month',
    initialCompare: 'previous',
    withModules: level !== 'basic',
  });

  // L'offre n'est pas encore connue : rendre Esansyel puis basculer sur Elit
  // une demi-seconde plus tard ferait clignoter tout l'écran. On attend — c'est
  // la règle que `RouteFeatureGate` applique déjà aux écrans verrouillés.
  if (contextLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <span
          className="h-8 w-8 animate-spin rounded-pill border-2 border-border border-t-primary"
          aria-label={t({ fr: 'Chargement', ht: 'Ap chaje' })}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-text dark:bg-dark-bg dark:text-dark-text">
      {showWelcome && <CockpitWelcome companyName={company?.name ?? ''} />}

      <div className="mx-auto max-w-6xl px-4 pb-32 pt-6 sm:px-6">
        {level === 'executive' ? (
          <ElitDashboard state={state} userName={userName} />
        ) : level === 'advanced' ? (
          <KwasansDashboard state={state} userName={userName} />
        ) : (
          <EsansyelDashboard state={state} userName={userName} />
        )}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <Suspense
        fallback={
          <div className="flex h-screen items-center justify-center bg-background dark:bg-dark-bg">
            <span className="h-8 w-8 animate-spin rounded-pill border-2 border-border border-t-primary" aria-hidden />
          </div>
        }
      >
        <DashboardInner />
      </Suspense>
    </ProtectedRoute>
  );
}
