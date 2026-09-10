'use client';

// ─────────────────────────────────────────────────────────────────────────────
// KWASANS — « Je pilote mon business » (§12 à §24)
//
// L'ordre du §24 :
//
//   HEADER → 5 KPI → Performance Overview → Business Health + Goals →
//   Sales / Inventory → Customers / Team → PilotAI Recommendations →
//   Quick Actions
//
// « NE PAS simplement ajouter 15 cartes. Kwasans doit devenir un dashboard de
//   pilotage. » (§12)
//
// La différence avec Esansyel n'est donc pas le nombre de blocs, c'est ce que
// chaque bloc RÉPOND. Esansyel dit ce qui s'est passé ; Kwasans dit pourquoi, et
// ce qu'il faut gérer aujourd'hui. Concrètement : la comparaison arrive (§13),
// les indicateurs deviennent des portes (§14), et chaque section porte une
// recommandation plutôt qu'un tableau de plus (§18, §22).
//
// §42 — un module dont l'entreprise n'a pas la matière ne s'affiche pas :
// pas d'employé, pas de bloc Équipe ; pas de client, pas de bloc Clients.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo } from 'react';

import { useLanguage } from '../../LanguageWrapper';
import { usePermissions } from '../../../hooks/usePermissions';
import { useCompanyContext } from '../../../contexts/CompanyContext';
import { Card, FirstRun, Money, Stack } from '../../ds';
import { RateAlertBanner } from '../../pilotage/RateAlertBanner';
import { dashboardLevel, moduleEnabled } from '../../../lib/dashboardLevel';
import {
  AlertCard, DashboardHeader, ExecutiveSummary, GoalProgress, HealthScore,
  InsightCard, KpiCard, ModuleSection, QuickActions, RecommendationList,
  SkeletonKpis, TopProducts, TrendChart,
  type AlertItem, type GoalRow, type HealthDimension, type SummaryItem,
} from '../shared';
import { deltaPercent } from '../range';
import { buildPriorities, kpiFormula, pilotSay } from '../narrative';
import { GOAL_LABELS } from '../../../lib/goals';
import type { DashboardState } from '../useDashboard';

const GRADE_LABEL = {
  excellent: { fr: 'EXCELLENT', ht: 'EKSELAN' },
  solide:    { fr: 'SOLIDE',    ht: 'SOLID' },
  correct:   { fr: 'CORRECT',   ht: 'KORÈK' },
  fragile:   { fr: 'FRAGILE',   ht: 'FRAJIL' },
  critique:  { fr: 'CRITIQUE',  ht: 'KRITIK' },
} as const;

export function KwasansDashboard({ state, userName }: { state: DashboardState; userName: string }) {
  const { t } = useLanguage();
  const { can, canUse } = usePermissions();
  const { planKey } = useCompanyContext();
  const {
    core, modules, loadingCore, loadingModules,
    range, setRange, compare, setCompare, isFirstRun,
  } = state;

  const currency = core?.currency ?? 'HTG';
  const finance  = core?.finance ?? null;
  const baseline = core?.baseline ?? null;

  const level = dashboardLevel(planKey);
  const ctx   = { level, can, canUse };

  const greeting = new Date().getHours() < 12
    ? t({ fr: 'Bonjour', ht: 'Bonjou' })
    : t({ fr: 'Bonsoir', ht: 'Bonswa' });

  // ── §13 · L'en-tête, avec la comparaison ─────────────────────────────────
  const ranges = [
    { key: 'week'    as const, label: t({ fr: 'Semaine', ht: 'Semèn' }) },
    { key: 'month'   as const, label: t({ fr: 'Mois', ht: 'Mwa' }) },
    { key: 'quarter' as const, label: t({ fr: 'Trimestre', ht: 'Trimès' }) },
    { key: 'year'    as const, label: t({ fr: 'Année', ht: 'Ane' }) },
  ];
  const compares = [
    { key: 'previous' as const, label: t({ fr: 'Période précédente', ht: 'Peryòd anvan' }) },
    { key: 'lastYear' as const, label: t({ fr: 'Année précédente', ht: 'Ane anvan' }) },
  ];

  // ── §22 · Les recommandations ────────────────────────────────────────────
  const narrativeInput = useMemo(() => (core ? {
    currency,
    finance,
    baseline,
    alerts: core.alerts,
    topProducts: core.topProducts,
    inventory: modules?.inventory ?? null,
    customers: modules?.customers ?? null,
    team: modules?.team ?? null,
    healthScore: modules?.health?.score ?? null,
  } : null), [core, modules, currency, finance, baseline]);

  const recommendations = useMemo(
    () => (narrativeInput ? buildPriorities(t, narrativeInput, 4) : []),
    [narrativeInput, t],
  );

  const saying = useMemo(
    () => (narrativeInput ? pilotSay(t, 'advice', narrativeInput) : null),
    [narrativeInput, t],
  );

  // ── §15 · Les deux courbes, avec la période de comparaison ───────────────
  const chartSeries = useMemo(() => {
    if (!core) return [];
    return [
      {
        key: 'revenue',
        label: t({ fr: 'Chiffre d’affaires', ht: 'Chif afè' }),
        points: core.series.map((p) => ({ label: p.label, value: p.revenue })),
      },
      {
        key: 'profit',
        label: t({ fr: 'Profit', ht: 'Pwofi' }),
        points: core.series.map((p) => ({ label: p.label, value: p.profit })),
      },
    ];
  }, [core, t]);

  // ── §16 · La santé, en cinq dimensions et trois états ────────────────────
  const dimensions: HealthDimension[] = useMemo(() => {
    if (!modules?.health) return [];
    return modules.health.pillars.map((p) => ({
      key: p.key, label: p.label, score: p.score, max: p.max, comment: p.comment,
    }));
  }, [modules]);

  // ── §21 · Les objectifs ──────────────────────────────────────────────────
  const goals: GoalRow[] = useMemo(() => (modules?.goals ?? []).map((g) => ({
    id: g.id,
    label: GOAL_LABELS[g.metric] ?? g.metric,
    current: g.actualValue,
    target: g.targetValue,
    currency: g.currency,
    onTrack: g.onTrack,
    hint: g.daysLeft > 0
      ? t({
          fr: `Il reste ${g.daysLeft} jour${g.daysLeft > 1 ? 's' : ''} · ${new Intl.NumberFormat('fr-HT').format(g.dailyPaceNeeded)} ${g.currency} par jour`,
          ht: `Gen ${g.daysLeft} jou ki rete · ${new Intl.NumberFormat('fr-HT').format(g.dailyPaceNeeded)} ${g.currency} pa jou`,
        })
      : undefined,
  })), [modules, t]);

  // ── §17 · Performance des ventes ─────────────────────────────────────────
  const salesRows: SummaryItem[] = useMemo(() => {
    if (!finance) return [];
    return [
      {
        key: 'revenue', label: t({ fr: 'Chiffre d’affaires', ht: 'Chif afè' }),
        value: finance.revenue, currency,
        deltaPercent: baseline ? deltaPercent(finance.revenue, baseline.revenue) : null,
        href: '/sales',
      },
      {
        key: 'orders', label: t({ fr: 'Nombre de ventes', ht: 'Kantite vant' }),
        value: finance.salesCount, unit: 'count',
        deltaPercent: baseline ? deltaPercent(finance.salesCount, baseline.salesCount) : null,
        href: '/sales',
      },
      {
        key: 'aov', label: t({ fr: 'Panier moyen', ht: 'Mwayèn pa vant' }),
        value: finance.averageOrderValue, currency,
        deltaPercent: baseline ? deltaPercent(finance.averageOrderValue, baseline.averageOrderValue) : null,
      },
      {
        key: 'margin', label: t({ fr: 'Taux de marge', ht: 'To maj' }),
        value: finance.revenue > 0 ? (finance.grossMargin / finance.revenue) * 100 : 0,
        unit: 'percent',
        href: '/rentabilite',
      },
    ];
  }, [finance, baseline, currency, t]);

  // ── §18 · Le stock, et ce qu'il faut en faire ────────────────────────────
  const inventoryAlerts: AlertItem[] = useMemo(() => {
    const inv = modules?.inventory;
    if (!inv) return [];
    const list: AlertItem[] = [];
    if (inv.restock.length > 0) {
      list.push({
        id: 'restock',
        tone: 'warning',
        text: t({
          fr: `${inv.restock.length} produit${inv.restock.length > 1 ? 's doivent' : ' doit'} être réapprovisionné${inv.restock.length > 1 ? 's' : ''}.`,
          ht: `${inv.restock.length} pwodwi bezwen rekòmande.`,
        }),
        action: t({ fr: 'Commander', ht: 'Kòmande' }),
        href: '/purchases',
      });
    }
    if (inv.slowMovers.length > 0) {
      list.push({
        id: 'slow',
        tone: 'info',
        text: t({
          fr: `${inv.slowMovers.length} produit${inv.slowMovers.length > 1 ? 's n’ont' : ' n’a'} pas été vendu${inv.slowMovers.length > 1 ? 's' : ''} depuis ${inv.windowDays} jours.`,
          ht: `${inv.slowMovers.length} pwodwi pa vann depi ${inv.windowDays} jou.`,
        }),
        action: t({ fr: 'Voir', ht: 'Gade' }),
        href: '/inventory',
      });
    }
    return list;
  }, [modules, t]);

  const inventoryRows: SummaryItem[] = useMemo(() => {
    const inv = modules?.inventory;
    if (!inv) return [];
    const rows: SummaryItem[] = [
      { key: 'value', label: t({ fr: 'Valeur du stock', ht: 'Valè stòk la' }), value: inv.value, currency, href: '/inventory' },
      { key: 'low',   label: t({ fr: 'Stock faible', ht: 'Stòk ki ba' }),      value: inv.lowStock, unit: 'count', href: '/inventory' },
      { key: 'out',   label: t({ fr: 'En rupture', ht: 'Ki fini' }),           value: inv.outOfStock, unit: 'count', href: '/inventory' },
    ];
    if (inv.turnover !== null) {
      rows.push({ key: 'turnover', label: t({ fr: 'Rotation (30 j)', ht: 'Wotasyon (30 j)' }), value: inv.turnover, unit: 'count' });
    }
    return rows;
  }, [modules, currency, t]);

  // ── §19 · Les clients ────────────────────────────────────────────────────
  const customerRows: SummaryItem[] = useMemo(() => {
    const c = modules?.customers;
    if (!c) return [];
    return [
      { key: 'new',     label: t({ fr: 'Nouveaux clients', ht: 'Nouvo kliyan' }), value: c.newCustomers, unit: 'count', href: '/customers' },
      { key: 'return',  label: t({ fr: 'Clients fidèles', ht: 'Kliyan fidèl' }),  value: c.returning, unit: 'count', href: '/customers' },
      { key: 'total',   label: t({ fr: 'Clients au total', ht: 'Total kliyan' }), value: c.total, unit: 'count', deltaPercent: c.growthPct, href: '/customers' },
      { key: 'value',   label: t({ fr: 'Valeur moyenne', ht: 'Valè mwayèn' }),    value: c.averageValue, currency },
    ];
  }, [modules, currency, t]);

  // ── §20 · L'équipe — un outil de management, pas un classement ───────────
  const showTeam = moduleEnabled('team', ctx) && Boolean(core?.presence.hasTeam);

  // ── §43 · Le premier jour ────────────────────────────────────────────────
  if (isFirstRun) {
    return (
      <Stack>
        <DashboardHeader
          title={userName ? `${greeting}, ${userName}` : greeting}
          subtitle={t({
            fr: 'Voici les performances de votre entreprise.',
            ht: 'Men pèfòmans antrepriz ou.',
          })}
          companyName={core?.company.name ?? ''}
          showCompany={(core?.companyCount ?? 1) > 1}
          ranges={ranges}
          activeRange={range}
          onRangeChange={setRange}
        />
        <FirstRun
          title={t({
            fr: 'Vos performances s’afficheront ici',
            ht: 'Pèfòmans ou yo ap parèt isit la',
          })}
          hint={t({
            fr: 'Commencez par enregistrer vos premières ventes : comparaisons, santé et objectifs se calculent sur vos chiffres réels.',
            ht: 'Kòmanse anrejistre premye vant ou yo : konparezon, sante ak objektif kalkile sou chif reyèl ou yo.',
          })}
          pointsTo={t({ fr: 'Le bouton « Vente », en bas', ht: 'Bouton « Vant » a, anba' })}
        />
      </Stack>
    );
  }

  return (
    <Stack>
      {/* ── §13 · HEADER ─────────────────────────────────────────────────── */}
      <DashboardHeader
        title={userName ? `${greeting}, ${userName}` : greeting}
        subtitle={t({
          fr: 'Voici les performances de votre entreprise.',
          ht: 'Men pèfòmans antrepriz ou.',
        })}
        companyName={core?.company.name ?? ''}
        showCompany={(core?.companyCount ?? 1) > 1}
        live={!loadingCore}
        ranges={ranges}
        activeRange={range}
        onRangeChange={setRange}
        compares={compares}
        activeCompare={compare}
        onCompareChange={setCompare}
        compareLabel={t({ fr: 'Comparer à', ht: 'Konpare ak' })}
      />

      {/* ── Ce qui coûte de l'argent MAINTENANT ──────────────────────────
          Cette bannière ne vient pas des 61 points : elle vient du produit.
          « J'achète en dollars, je vends en gourdes, et le prix de vente ne
          bouge pas quand le taux monte » — c'est le piège n° 1 du marchand
          haïtien, et la refonte des dashboards n'a aucune raison de le faire
          disparaître de l'écran. Elle se place avant les indicateurs parce
          qu'elle périme les indicateurs. */}
      {canUse('rate_alerts') && <RateAlertBanner />}

      {/* ── §14 · CINQ KPI, chacun une porte ─────────────────────────────── */}
      {loadingCore && !core ? (
        <SkeletonKpis count={5} />
      ) : finance ? (
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
          <KpiCard
            emphasis
            label={t({ fr: 'Chiffre d’affaires', ht: 'Chif afè' })}
            value={finance.revenue} currency={currency}
            deltaPercent={baseline ? deltaPercent(finance.revenue, baseline.revenue) : null}
            formula={kpiFormula(t, 'revenue')} href="/sales"
          />
          <KpiCard
            label={t({ fr: 'Marge brute', ht: 'Maj brit' })}
            value={finance.grossMargin} currency={currency}
            deltaPercent={baseline ? deltaPercent(finance.grossMargin, baseline.grossMargin) : null}
            formula={kpiFormula(t, 'grossMargin')} href="/rentabilite"
          />
          <KpiCard
            label={t({ fr: 'Dépenses', ht: 'Depans' })}
            value={finance.expenses} currency={currency}
            deltaPercent={baseline ? deltaPercent(finance.expenses, baseline.expenses) : null}
            formula={kpiFormula(t, 'expenses')} href="/expenses"
          />
          <KpiCard
            label={t({ fr: 'Trésorerie', ht: 'Lajan kach' })}
            value={finance.cashFlow} currency={currency}
            deltaPercent={baseline ? deltaPercent(finance.cashFlow, baseline.cashFlow) : null}
            formula={kpiFormula(t, 'cashFlow')} href="/rapports"
          />
          <KpiCard
            label={t({ fr: 'Profit net', ht: 'Pwofi nèt' })}
            value={finance.netProfit} currency={currency}
            deltaPercent={baseline ? deltaPercent(finance.netProfit, baseline.netProfit) : null}
            formula={kpiFormula(t, 'netProfit')} href="/rapports"
          />
        </div>
      ) : null}

      {/* ── §15 · PERFORMANCE ────────────────────────────────────────────── */}
      <ModuleSection
        title={t({ fr: 'Performance', ht: 'Pèfòmans' })}
        loading={loadingCore && !core}
        empty={(core?.series.length ?? 0) < 2}
        emptyTitle={t({ fr: 'La courbe arrive avec les ventes', ht: 'Koub la ap vini ak vant yo' })}
        emptyHint={t({
          fr: 'Il faut au moins deux périodes enregistrées pour comparer.',
          ht: 'Fòk gen omwen de peryòd anrejistre pou n konpare.',
        })}
      >
        <TrendChart
          series={chartSeries}
          currency={currency}
          emptyLabel={t({ fr: 'Aucun mouvement sur cette période.', ht: 'Pa gen mouvman pou peryòd sa a.' })}
        />
      </ModuleSection>

      {/* ── §16 + §21 · SANTÉ ET OBJECTIFS, côte à côte ──────────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">
        {moduleEnabled('business_health', ctx) && (
          <ModuleSection
            title={t({ fr: 'Santé du commerce', ht: 'Sante komès la' })}
            loading={loadingModules && !modules}
            empty={!modules?.health}
            emptyTitle={t({ fr: 'Le score arrive avec vos ventes', ht: 'Nòt la ap vini ak vant ou yo' })}
            emptyHint={t({
              fr: 'Nous aurons besoin d’un mois de ventes pour noter la santé de votre commerce.',
              ht: 'N ap bezwen yon mwa vant pou n bay komès ou an yon nòt.',
            })}
          >
            {modules?.health && (
              <HealthScore
                score={modules.health.score}
                grade={t(GRADE_LABEL[modules.health.grade])}
                dimensions={dimensions}
                stateLabels={{
                  good:      t({ fr: 'Bon', ht: 'Bon' }),
                  attention: t({ fr: 'Attention', ht: 'Atansyon' }),
                  critical:  t({ fr: 'Critique', ht: 'Kritik' }),
                }}
                hint={kpiFormula(t, 'health')}
              />
            )}
          </ModuleSection>
        )}

        {moduleEnabled('goals', ctx) && (
          <ModuleSection
            title={t({ fr: 'Objectifs du mois', ht: 'Objektif mwa a' })}
            loading={loadingModules && !modules}
          >
            <GoalProgress
              goals={goals}
              emptyLabel={t({
                fr: 'Aucun objectif fixé pour ce mois.',
                ht: 'Pa gen objektif pou mwa sa a.',
              })}
              emptyAction={t({ fr: 'Fixer un objectif', ht: 'Mete yon objektif' })}
            />
          </ModuleSection>
        )}
      </div>

      {/* ── §17 + §18 · VENTES ET STOCK ──────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ModuleSection
          title={t({ fr: 'Performance des ventes', ht: 'Pèfòmans vant yo' })}
          loading={loadingCore && !core}
          empty={salesRows.length === 0}
        >
          <div className="space-y-4">
            <ExecutiveSummary items={salesRows} />
            <TopProducts
              rows={core?.topProducts ?? []}
              currency={currency}
              showMargin
              labels={{
                product: t({ fr: 'Produit', ht: 'Pwodwi' }),
                units:   t({ fr: 'Unités', ht: 'Inite' }),
                revenue: t({ fr: 'Ventes', ht: 'Vant' }),
                margin:  t({ fr: 'Marge', ht: 'Maj' }),
                empty:   t({ fr: 'Aucune vente de produit sur cette période.', ht: 'Pa gen vant pwodwi sou peryòd sa a.' }),
                emptyAction: t({ fr: 'Voir mes produits', ht: 'Gade pwodwi mwen yo' }),
              }}
            />
          </div>
        </ModuleSection>

        {moduleEnabled('inventory_intel', ctx) && (
          <ModuleSection
            title={t({ fr: 'Stock', ht: 'Stòk' })}
            loading={loadingModules && !modules}
            empty={!core?.presence.hasProducts}
            emptyTitle={t({ fr: 'Aucun produit enregistré', ht: 'Pa gen pwodwi anrejistre' })}
            emptyHint={t({
              fr: 'Ajoutez vos produits pour être prévenu avant la rupture.',
              ht: 'Ajoute pwodwi ou yo pou yo avèti w anvan stòk la fini.',
            })}
          >
            <div className="space-y-4">
              <ExecutiveSummary items={inventoryRows} />
              {inventoryAlerts.length > 0 && (
                <AlertCard
                  items={inventoryAlerts}
                  allClearLabel={t({ fr: 'Votre stock est sous contrôle.', ht: 'Stòk ou anba kontwòl.' })}
                />
              )}
            </div>
          </ModuleSection>
        )}
      </div>

      {/* ── §19 + §20 · CLIENTS ET ÉQUIPE ────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">
        {moduleEnabled('customer_insights', ctx) && (
          <ModuleSection
            title={t({ fr: 'Clients', ht: 'Kliyan' })}
            loading={loadingModules && !modules}
            empty={!core?.presence.hasCustomers}
            emptyTitle={t({ fr: 'Aucun client enregistré', ht: 'Pa gen kliyan anrejistre' })}
            emptyHint={t({
              fr: 'Nommez vos clients sur les ventes : vous saurez qui revient et qui vous doit.',
              ht: 'Mete non kliyan yo sou vant yo : w ap konnen kiyès ki tounen ak kiyès ki dwe ou.',
            })}
          >
            <div className="space-y-4">
              <ExecutiveSummary items={customerRows} />
              {modules?.customers && modules.customers.top.length > 0 && (
                <Card>
                  <p className="px-4 pt-4 text-note font-bold uppercase tracking-wide text-muted dark:text-dark-muted">
                    {t({ fr: 'Meilleurs clients', ht: 'Pi bon kliyan yo' })}
                  </p>
                  <ul className="divide-y divide-border dark:divide-dark-border">
                    {modules.customers.top.map((c) => (
                      <li key={c.id} className="flex min-h-touch items-center justify-between gap-4 px-4 py-2">
                        <span className="min-w-0 truncate text-body text-text2 dark:text-dark-text2">{c.name}</span>
                        <Money value={c.value} currency={currency} size="body" />
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </div>
          </ModuleSection>
        )}

        {showTeam && (
          <ModuleSection
            title={t({ fr: 'Équipe', ht: 'Ekip' })}
            loading={loadingModules && !modules}
            empty={!modules?.team || modules.team.members.length === 0}
            emptyTitle={t({ fr: 'Aucune activité d’équipe', ht: 'Pa gen aktivite ekip' })}
            emptyHint={t({
              fr: 'Les ventes enregistrées par vos employés apparaîtront ici.',
              ht: 'Vant anplwaye ou yo anrejistre ap parèt isit la.',
            })}
          >
            {modules?.team && <TeamCard team={modules.team} currency={currency} />}
          </ModuleSection>
        )}
      </div>

      {/* ── §22 · LES RECOMMANDATIONS DE PILOTAI ─────────────────────────── */}
      <ModuleSection
        title={t({ fr: 'PilotAI recommande', ht: 'PilotAI rekòmande' })}
        loading={loadingCore && !core}
        empty={recommendations.length === 0 && !saying}
        emptyTitle={t({ fr: 'Rien à signaler', ht: 'Pa gen anyen pou siyale' })}
        emptyHint={t({
          fr: 'Vos chiffres ne montrent aucun écart à corriger sur cette période.',
          ht: 'Chif ou yo pa montre okenn ekar pou korije sou peryòd sa a.',
        })}
      >
        <div className="space-y-4">
          <InsightCard
            title="PilotAI"
            saying={saying}
            askLabel={t({ fr: 'Demander à PilotAI', ht: 'Mande PilotAI' })}
            recommendedLabel={t({ fr: 'Action recommandée', ht: 'Aksyon rekòmande' })}
          />
          <RecommendationList
            items={recommendations}
            columns={2}
            impactLabel={t({ fr: 'Impact', ht: 'Enpak' })}
          />
        </div>
      </ModuleSection>

      {/* ── §23 · ACTIONS RAPIDES, en secondaire ─────────────────────────── */}
      <ModuleSection title={t({ fr: 'Actions rapides', ht: 'Aksyon rapid' })}>
        <QuickActions
          compact
          actions={[
            { key: 'sale',     label: t({ fr: 'Nouvelle vente', ht: 'Nouvo vant' }),   href: '/sales?new=1', primary: true },
            { key: 'product',  label: t({ fr: 'Ajouter produit', ht: 'Ajoute pwodwi' }), href: '/products?new=1' },
            { key: 'expense',  label: t({ fr: 'Ajouter dépense', ht: 'Ajoute depans' }), href: '/expenses?new=1' },
            { key: 'employee', label: t({ fr: 'Ajouter employé', ht: 'Ajoute anplwaye' }), href: '/employes' },
            { key: 'reports',  label: t({ fr: 'Voir les rapports', ht: 'Gade rapò yo' }), href: '/rapports' },
          ]}
        />
      </ModuleSection>
    </Stack>
  );
}

/**
 * §20 — « Ne pas transformer cela en classement agressif. Présenter comme un
 * outil de management. »
 *
 * D'où : pas de podium, pas de médaille, pas de dernière place soulignée. Le
 * total de l'équipe vient EN PREMIER, les personnes ensuite, dans l'ordre des
 * ventes — parce qu'il faut bien un ordre — et sans écart mis en scène.
 */
function TeamCard({
  team,
  currency,
}: {
  team: NonNullable<import('../../../app/actions/dashboard').DashboardModules['team']>;
  currency: string;
}) {
  const { t } = useLanguage();

  return (
    <Card>
      <div className="flex items-baseline justify-between gap-4 px-4 pt-4">
        <span className="text-note font-bold uppercase tracking-wide text-muted dark:text-dark-muted">
          {t({ fr: 'Ventes réalisées par l’équipe', ht: 'Vant ekip la fè' })}
        </span>
        <Money value={team.teamRevenue} currency={currency} size="card" />
      </div>

      <ul className="mt-2 divide-y divide-border dark:divide-dark-border">
        {team.members.map((m) => (
          <li key={m.id} className="flex min-h-touch items-center justify-between gap-4 px-4 py-2">
            <span className="min-w-0">
              <span className="block truncate text-body text-primary dark:text-dark-text">
                {m.name || t({ fr: 'Membre de l’équipe', ht: 'Manm ekip la' })}
              </span>
              <span className="block text-note text-muted dark:text-dark-muted">
                {m.salesCount} {t({ fr: 'ventes', ht: 'vant' })}
              </span>
            </span>
            <Money value={m.revenue} currency={currency} size="body" />
          </li>
        ))}
      </ul>
    </Card>
  );
}
