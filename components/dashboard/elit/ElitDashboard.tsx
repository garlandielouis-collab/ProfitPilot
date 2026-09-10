'use client';

// ─────────────────────────────────────────────────────────────────────────────
// ELIT — « Business Command Center » (§25 à §41)
//
// L'ordre du §41 :
//
//   HEADER → DAILY BRIEF → EXECUTIVE SUMMARY → BUSINESS HEALTH →
//   WHAT MATTERS NOW → FINANCIAL PERFORMANCE → FORECAST →
//   GROWTH OPPORTUNITIES → CUSTOMERS + INVENTORY → SALES + ONLINE STORE →
//   TEAM → STRATEGIC GOALS → PILOTAI EXECUTIVE ADVISOR
//
// « Elit doit être radicalement différent. Il ne doit pas ressembler à un
//   dashboard comptable classique. » (§25)
//
// ── Comment Elit affiche plus SANS être plus dense (§44) ───────────────────
//
// « Elit = haute intelligence, PAS haute densité visuelle. » La différence se
// joue sur une seule décision : les quatre premières sections sont OUVERTES —
// elles répondent à « comment ça va » et « que dois-je faire maintenant » — et
// tout le reste est REPLIÉ. Le marchand déplie ce qu'il veut creuser. À
// l'ouverture, il voit donc moins qu'un dashboard Kwasans, alors qu'il en a
// davantage sous la main.
//
// « Ne jamais mettre toutes les données sur l'écran simultanément. »
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo } from 'react';

import { useLanguage } from '../../LanguageWrapper';
import { usePermissions } from '../../../hooks/usePermissions';
import { useCompanyContext } from '../../../contexts/CompanyContext';
import { Button, Card, FirstRun, Money, Stack } from '../../ds';
import { RateAlertBanner } from '../../pilotage/RateAlertBanner';
import { dashboardLevel, moduleEnabled } from '../../../lib/dashboardLevel';
import {
  DailyBrief, DashboardHeader, ExecutiveSummary, ForecastChart, GoalProgress,
  HealthScore, InsightCard, ModuleSection, RecommendationList, SkeletonKpis,
  TopProducts, TrendChart,
  type GoalRow, type HealthDimension, type SummaryItem,
} from '../shared';
import { deltaPercent } from '../range';
import { forecastNext, MIN_MONTHS } from '../forecast';
import {
  buildDailyBrief, buildOpportunities, buildPriorities, kpiFormula, pilotSay,
} from '../narrative';
import { GOAL_LABELS } from '../../../lib/goals';
import type { DashboardState } from '../useDashboard';
import Link from 'next/link';

const GRADE_LABEL = {
  excellent: { fr: 'EXCELLENT', ht: 'EKSELAN' },
  solide:    { fr: 'SOLIDE',    ht: 'SOLID' },
  correct:   { fr: 'CORRECT',   ht: 'KORÈK' },
  fragile:   { fr: 'FRAGILE',   ht: 'FRAJIL' },
  critique:  { fr: 'CRITIQUE',  ht: 'KRITIK' },
} as const;

export function ElitDashboard({ state, userName }: { state: DashboardState; userName: string }) {
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

  // ── §31 · La prévision, sur l'historique mensuel réel ────────────────────
  const revenueForecast = useMemo(() => {
    if (!modules?.history?.length) return null;
    return forecastNext(
      modules.history.map((h) => ({ periodStart: h.periodStart, value: h.revenue })),
    );
  }, [modules]);

  const narrativeInput = useMemo(() => (core ? {
    currency,
    finance,
    baseline,
    alerts: core.alerts,
    topProducts: core.topProducts,
    inventory: modules?.inventory ?? null,
    customers: modules?.customers ?? null,
    team: modules?.team ?? null,
    store: modules?.store ?? null,
    forecast: revenueForecast,
    healthScore: modules?.health?.score ?? null,
  } : null), [core, modules, currency, finance, baseline, revenueForecast]);

  // ── §29 · Trois priorités. Jamais dix. ───────────────────────────────────
  const priorities = useMemo(
    () => (narrativeInput ? buildPriorities(t, narrativeInput, 3) : []),
    [narrativeInput, t],
  );

  // ── §32 · Les opportunités, dans leur propre registre ────────────────────
  const opportunities = useMemo(
    () => (narrativeInput ? buildOpportunities(t, narrativeInput) : []),
    [narrativeInput, t],
  );

  // ── §39 · Le conseiller ──────────────────────────────────────────────────
  const saying = useMemo(
    () => (narrativeInput ? pilotSay(t, 'strategy', narrativeInput) : null),
    [narrativeInput, t],
  );

  // ── §40 · Le brief du jour ───────────────────────────────────────────────
  const brief = useMemo(
    () => (narrativeInput ? buildDailyBrief(t, narrativeInput) : []),
    [narrativeInput, t],
  );

  // ── §27 · Business at a glance — six indicateurs, pas douze ─────────────
  const summary: SummaryItem[] = useMemo(() => {
    if (!finance) return [];
    const rows: SummaryItem[] = [
      { key: 'revenue', label: t({ fr: 'Chiffre d’affaires', ht: 'Chif afè' }),
        value: finance.revenue, currency,
        deltaPercent: baseline ? deltaPercent(finance.revenue, baseline.revenue) : null, href: '/sales' },
      { key: 'profit', label: t({ fr: 'Profit net', ht: 'Pwofi nèt' }),
        value: finance.netProfit, currency,
        deltaPercent: baseline ? deltaPercent(finance.netProfit, baseline.netProfit) : null, href: '/rapports' },
      { key: 'cash', label: t({ fr: 'Trésorerie', ht: 'Lajan kach' }),
        value: finance.cashFlow, currency,
        deltaPercent: baseline ? deltaPercent(finance.cashFlow, baseline.cashFlow) : null, href: '/rapports' },
      { key: 'orders', label: t({ fr: 'Ventes', ht: 'Vant' }),
        value: finance.salesCount, unit: 'count',
        deltaPercent: baseline ? deltaPercent(finance.salesCount, baseline.salesCount) : null, href: '/sales' },
    ];
    if (modules?.customers) {
      rows.push({
        key: 'customers', label: t({ fr: 'Clients actifs', ht: 'Kliyan aktif' }),
        value: modules.customers.total, unit: 'count',
        deltaPercent: modules.customers.growthPct, href: '/customers',
      });
    }
    // La croissance n'apparaît que si la comparaison a une base : sans elle,
    // ce serait une flèche sans origine (§51).
    const growth = baseline ? deltaPercent(finance.revenue, baseline.revenue) : null;
    if (growth !== null) {
      rows.push({
        key: 'growth', label: t({ fr: 'Croissance', ht: 'Kwasans' }),
        value: growth, unit: 'percent',
      });
    }
    return rows;
  }, [finance, baseline, modules, currency, t]);

  const dimensions: HealthDimension[] = useMemo(() => {
    if (!modules?.health) return [];
    return modules.health.pillars.map((p) => ({
      key: p.key, label: p.label, score: p.score, max: p.max, comment: p.comment,
    }));
  }, [modules]);

  const goals: GoalRow[] = useMemo(() => (modules?.goals ?? []).map((g) => ({
    id: g.id,
    label: GOAL_LABELS[g.metric] ?? g.metric,
    current: g.actualValue,
    target: g.targetValue,
    currency: g.currency,
    onTrack: g.onTrack,
    // §38 · la quatrième colonne : la projection de fin de mois au rythme tenu.
    forecast: g.daysLeft > 0 && g.actualValue > 0
      ? g.actualValue + projectedRest(g)
      : g.actualValue,
    hint: g.daysLeft > 0
      ? t({
          fr: `Il reste ${g.daysLeft} jour${g.daysLeft > 1 ? 's' : ''}`,
          ht: `Gen ${g.daysLeft} jou ki rete`,
        })
      : undefined,
  })), [modules, t]);

  const chartSeries = useMemo(() => {
    if (!core) return [];
    return [
      { key: 'revenue', label: t({ fr: 'Chiffre d’affaires', ht: 'Chif afè' }),
        points: core.series.map((p) => ({ label: p.label, value: p.revenue })) },
      { key: 'profit', label: t({ fr: 'Profit', ht: 'Pwofi' }),
        points: core.series.map((p) => ({ label: p.label, value: p.profit })) },
      { key: 'expenses', label: t({ fr: 'Dépenses', ht: 'Depans' }),
        points: core.series.map((p) => ({ label: p.label, value: p.expenses })) },
    ];
  }, [core, t]);

  const financialRows: SummaryItem[] = useMemo(() => {
    if (!finance) return [];
    return [
      { key: 'gross', label: t({ fr: 'Marge brute', ht: 'Maj brit' }), value: finance.grossMargin, currency, href: '/rentabilite' },
      { key: 'grossPct', label: t({ fr: 'Taux de marge brute', ht: 'To maj brit' }),
        value: finance.revenue > 0 ? (finance.grossMargin / finance.revenue) * 100 : 0, unit: 'percent' },
      { key: 'netPct', label: t({ fr: 'Taux de marge nette', ht: 'To maj nèt' }),
        value: finance.revenue > 0 ? (finance.netProfit / finance.revenue) * 100 : 0, unit: 'percent' },
      { key: 'expenses', label: t({ fr: 'Dépenses', ht: 'Depans' }), value: finance.expenses, currency, href: '/expenses' },
      { key: 'debt', label: t({ fr: 'Dettes fournisseurs', ht: 'Dèt founisè' }), value: finance.supplierDebt, currency, href: '/dettes' },
      { key: 'receivables', label: t({ fr: 'Crédits clients', ht: 'Kredi kliyan' }), value: core?.alerts.openReceivables ?? 0, currency, href: '/creances' },
    ];
  }, [finance, core, currency, t]);

  const showTeam  = moduleEnabled('team', ctx) && Boolean(core?.presence.hasTeam);
  const showStore = moduleEnabled('online_store', ctx) && Boolean(core?.presence.hasStore);

  // ── §43 · Le premier jour ────────────────────────────────────────────────
  if (isFirstRun) {
    return (
      <Stack>
        <DashboardHeader
          title={t({ fr: 'Business Command Center', ht: 'Business Command Center' })}
          subtitle={userName
            ? t({ fr: `${greeting}, ${userName}`, ht: `${greeting}, ${userName}` })
            : greeting}
          companyName={core?.company.name ?? ''}
          showCompany={(core?.companyCount ?? 1) > 1}
          ranges={ranges}
          activeRange={range}
          onRangeChange={setRange}
        />
        <FirstRun
          title={t({
            fr: 'Votre centre de commande s’allumera ici',
            ht: 'Sant kòmandman ou an ap limen isit la',
          })}
          hint={t({
            fr: 'Prévisions, opportunités et santé financière se calculent sur vos ventes réelles. Enregistrez les premières, le reste suit.',
            ht: 'Previzyon, opòtinite ak sante finansye kalkile sou vant reyèl ou yo. Anrejistre premye yo, rès la ap swiv.',
          })}
          pointsTo={t({ fr: 'Le bouton « Vente », en bas', ht: 'Bouton « Vant » a, anba' })}
        />
      </Stack>
    );
  }

  return (
    <Stack>
      {/* ── §26 · HEADER ─────────────────────────────────────────────────── */}
      <DashboardHeader
        title={t({ fr: 'Business Command Center', ht: 'Business Command Center' })}
        subtitle={userName
          ? `${greeting}, ${userName}`
          : t({ fr: 'Voici les opportunités et les risques à surveiller.', ht: 'Men opòtinite ak risk pou siveye.' })}
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
          Hors des 61 points, et pourtant devant tout le reste : quand le taux
          gourde/dollar bouge, la marge d'hier n'est plus celle d'aujourd'hui.
          Une prévision posée sur un taux périmé serait une prévision fausse. */}
      {canUse('rate_alerts') && <RateAlertBanner />}

      {/* ── §40 · DAILY BRIEF — l'état du commerce en 15 secondes ────────── */}
      <DailyBrief lines={brief} loading={loadingCore && !core} />

      {/* ── §27 · EXECUTIVE SUMMARY ──────────────────────────────────────── */}
      <ModuleSection
        title={t({ fr: 'Vue d’ensemble', ht: 'Gade an gwo' })}
        loading={loadingCore && !core}
        skeleton={<SkeletonKpis count={4} />}
        empty={summary.length === 0}
      >
        <ExecutiveSummary items={summary} />
      </ModuleSection>

      {/* ── §28 · BUSINESS HEALTH ────────────────────────────────────────── */}
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
              variant="hero"
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

      {/* ── §29 · WHAT NEEDS YOUR ATTENTION — trois, au maximum ──────────── */}
      <ModuleSection
        title={t({ fr: 'Ce qui demande votre attention', ht: 'Sa ki mande atansyon ou' })}
        loading={loadingCore && !core}
        empty={priorities.length === 0}
        emptyTitle={t({ fr: 'Rien d’urgent aujourd’hui', ht: 'Pa gen anyen ijan jodi a' })}
        emptyHint={t({
          fr: 'Aucun écart ne réclame de décision sur cette période.',
          ht: 'Pa gen okenn ekar ki mande yon desizyon sou peryòd sa a.',
        })}
      >
        <RecommendationList
          items={priorities}
          columns={3}
          impactLabel={t({ fr: 'Impact', ht: 'Enpak' })}
        />
      </ModuleSection>

      {/* ── §30 · FINANCIAL PERFORMANCE (repliable, §44) ─────────────────── */}
      {moduleEnabled('financial_center', ctx) && (
        <ModuleSection
          collapsible
          defaultOpen={false}
          title={t({ fr: 'Performance financière', ht: 'Pèfòmans finansye' })}
          loading={loadingCore && !core}
          empty={!finance}
        >
          <div className="space-y-4">
            <TrendChart
              series={chartSeries}
              currency={currency}
              emptyLabel={t({ fr: 'Aucun mouvement sur cette période.', ht: 'Pa gen mouvman pou peryòd sa a.' })}
            />
            <ExecutiveSummary items={financialRows} />
          </div>
        </ModuleSection>
      )}

      {/* ── §31 · FORECAST ───────────────────────────────────────────────── */}
      {moduleEnabled('forecast', ctx) && (
        <ModuleSection
          title={t({ fr: 'Prévision', ht: 'Previzyon' })}
          loading={loadingModules && !modules}
          empty={!revenueForecast}
          emptyTitle={t({ fr: 'Pas encore assez d’historique', ht: 'Poko gen ase istorik' })}
          emptyHint={t({
            fr: `Nous aurons besoin d’au moins ${MIN_MONTHS} mois de ventes pour calculer une tendance fiable. Une droite tirée sur deux mois n’est pas une prévision.`,
            ht: `N ap bezwen omwen ${MIN_MONTHS} mwa vant pou n kalkile yon tandans serye. Yon liy sou de mwa se pa yon previzyon.`,
          })}
        >
          {revenueForecast && modules && (
            <ForecastChart
              history={modules.history.map((h) => ({ label: h.periodStart.slice(5, 7), value: h.revenue }))}
              forecast={revenueForecast}
              currency={currency}
              labels={{
                title:      t({ fr: 'Chiffre d’affaires du mois prochain', ht: 'Chif afè mwa pwochen' }),
                confidence: t({ fr: 'Confiance', ht: 'Konfyans' }),
                range:      t({ fr: 'Fourchette', ht: 'Ekar' }),
                basis:      t({
                  fr: `Calculée sur ${revenueForecast.monthsObserved} mois observés. C’est une projection, pas une promesse.`,
                  ht: `Kalkile sou ${revenueForecast.monthsObserved} mwa obsève. Se yon pwojeksyon, se pa yon pwomès.`,
                }),
                bands: {
                  low:    t({ fr: 'faible', ht: 'fèb' }),
                  medium: t({ fr: 'moyenne', ht: 'mwayen' }),
                  high:   t({ fr: 'élevée', ht: 'wo' }),
                },
              }}
            />
          )}
        </ModuleSection>
      )}

      {/* ── §32 · GROWTH OPPORTUNITIES ───────────────────────────────────── */}
      <ModuleSection
        title={t({ fr: 'Opportunités de croissance', ht: 'Opòtinite pou grandi' })}
        loading={loadingModules && !modules}
        empty={opportunities.length === 0}
        emptyTitle={t({ fr: 'Aucune opportunité détectée', ht: 'Pa gen opòtinite detekte' })}
        emptyHint={t({
          fr: 'Vos chiffres ne montrent pas d’écart exploitable pour l’instant. Ce n’est pas une mauvaise nouvelle.',
          ht: 'Chif ou yo pa montre okenn ekar pou eksplwate kounye a. Sa se pa yon move nouvèl.',
        })}
      >
        <RecommendationList
          items={opportunities}
          columns={3}
          impactLabel={t({ fr: 'Impact potentiel', ht: 'Enpak posib' })}
        />
      </ModuleSection>

      {/* ── §33 + §34 · CLIENTS ET STOCK (repliables) ────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">
        {moduleEnabled('customer_insights', ctx) && (
          <ModuleSection
            collapsible
            defaultOpen={false}
            title={t({ fr: 'Clients', ht: 'Kliyan' })}
            loading={loadingModules && !modules}
            empty={!modules?.customers || !core?.presence.hasCustomers}
            emptyTitle={t({ fr: 'Aucun client enregistré', ht: 'Pa gen kliyan anrejistre' })}
            emptyHint={t({
              fr: 'Nommez vos clients sur les ventes : fidélité, valeur et réveil des dormants se calculent là-dessus.',
              ht: 'Mete non kliyan yo sou vant yo : fidelite, valè ak reveye moun k ap dòmi kalkile sou sa.',
            })}
          >
            {modules?.customers && (
              <div className="space-y-4">
                <ExecutiveSummary
                  items={[
                    { key: 'new',    label: t({ fr: 'Nouveaux clients', ht: 'Nouvo kliyan' }), value: modules.customers.newCustomers, unit: 'count', href: '/customers' },
                    { key: 'return', label: t({ fr: 'Clients fidèles', ht: 'Kliyan fidèl' }),  value: modules.customers.returning, unit: 'count' },
                    { key: 'total',  label: t({ fr: 'Clients au total', ht: 'Total kliyan' }), value: modules.customers.total, unit: 'count', deltaPercent: modules.customers.growthPct },
                    { key: 'value',  label: t({ fr: 'Valeur moyenne', ht: 'Valè mwayèn' }),    value: modules.customers.averageValue, currency },
                  ]}
                />
                {modules.customers.dormant > 0 && (
                  <Card className="p-4">
                    <p className="text-note font-bold uppercase tracking-wide text-muted dark:text-dark-muted">
                      {t({ fr: 'Opportunité client', ht: 'Opòtinite kliyan' })}
                    </p>
                    <p className="mt-2 text-body text-text2 dark:text-dark-text2">
                      {t({
                        fr: `${modules.customers.dormant} clients n’ont pas acheté depuis 60 jours.`,
                        ht: `${modules.customers.dormant} kliyan pa achte depi 60 jou.`,
                      })}
                    </p>
                    <Link href="/customers" className="mt-3 inline-block">
                      <Button variant="soft" size="sm">
                        {t({ fr: 'Voir les clients', ht: 'Gade kliyan yo' })}
                      </Button>
                    </Link>
                  </Card>
                )}
              </div>
            )}
          </ModuleSection>
        )}

        {moduleEnabled('inventory_intel', ctx) && (
          <ModuleSection
            collapsible
            defaultOpen={false}
            title={t({ fr: 'Stock', ht: 'Stòk' })}
            loading={loadingModules && !modules}
            empty={!modules?.inventory || !core?.presence.hasProducts}
            emptyTitle={t({ fr: 'Aucun produit enregistré', ht: 'Pa gen pwodwi anrejistre' })}
            emptyHint={t({
              fr: 'Ajoutez vos produits pour suivre la valeur du stock, la rotation et les ruptures à venir.',
              ht: 'Ajoute pwodwi ou yo pou swiv valè stòk la, wotasyon an ak stòk k ap fini.',
            })}
          >
            {modules?.inventory && (
              <ExecutiveSummary
                items={[
                  { key: 'value', label: t({ fr: 'Valeur du stock', ht: 'Valè stòk la' }), value: modules.inventory.value, currency, href: '/inventory' },
                  { key: 'low',   label: t({ fr: 'Stock faible', ht: 'Stòk ki ba' }),      value: modules.inventory.lowStock, unit: 'count', href: '/inventory' },
                  { key: 'out',   label: t({ fr: 'En rupture', ht: 'Ki fini' }),           value: modules.inventory.outOfStock, unit: 'count', href: '/inventory' },
                  { key: 'dead',  label: t({ fr: 'Sans vente (30 j)', ht: 'San vant (30 j)' }), value: modules.inventory.slowMovers.length, unit: 'count' },
                  ...(modules.inventory.turnover !== null
                    ? [{ key: 'turnover', label: t({ fr: 'Rotation (30 j)', ht: 'Wotasyon (30 j)' }), value: modules.inventory.turnover, unit: 'count' as const }]
                    : []),
                ]}
              />
            )}
          </ModuleSection>
        )}
      </div>

      {/* ── §35 + §36 · VENTES ET BOUTIQUE EN LIGNE ──────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ModuleSection
          collapsible
          defaultOpen={false}
          title={t({ fr: 'Ventes', ht: 'Vant' })}
          loading={loadingCore && !core}
          empty={(core?.topProducts.length ?? 0) === 0}
          emptyTitle={t({ fr: 'Aucune vente de produit', ht: 'Pa gen vant pwodwi' })}
          emptyHint={t({
            fr: 'Le classement par produit apparaît dès la première vente enregistrée avec un produit.',
            ht: 'Klasman pa pwodwi a parèt depi premye vant ki gen yon pwodwi ladan.',
          })}
        >
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
        </ModuleSection>

        {/* §42 — la boutique n'apparaît QUE si elle est activée. */}
        {showStore && (
          <ModuleSection
            collapsible
            defaultOpen={false}
            title={t({ fr: 'Boutique en ligne', ht: 'Boutik anliy' })}
            loading={loadingModules && !modules}
            empty={!modules?.store}
            action={
              <Link
                href="/boutique"
                className="pressable inline-flex min-h-touch items-center text-note font-bold text-primary underline underline-offset-4 dark:text-dark-text"
              >
                {t({ fr: 'Ouvrir la boutique', ht: 'Louvri boutik la' })}
              </Link>
            }
          >
            {modules?.store && (
              <ExecutiveSummary
                items={[
                  { key: 'orders',  label: t({ fr: 'Commandes payées', ht: 'Kòmand ki peye' }), value: modules.store.orders, unit: 'count', href: '/boutique/commandes' },
                  { key: 'revenue', label: t({ fr: 'Ventes en ligne', ht: 'Vant anliy' }),      value: modules.store.revenue, currency },
                  { key: 'aov',     label: t({ fr: 'Panier moyen', ht: 'Mwayèn pa kòmand' }),   value: modules.store.averageOrderValue, currency },
                  { key: 'pending', label: t({ fr: 'Commandes en attente', ht: 'Kòmand k ap tann' }), value: modules.store.pendingOrders, unit: 'count', href: '/boutique/commandes' },
                ]}
              />
            )}
          </ModuleSection>
        )}
      </div>

      {/* ── §37 · ÉQUIPE ─────────────────────────────────────────────────── */}
      {showTeam && (
        <ModuleSection
          collapsible
          defaultOpen={false}
          title={t({ fr: 'Équipe', ht: 'Ekip' })}
          loading={loadingModules && !modules}
          empty={!modules?.team || modules.team.members.length === 0}
        >
          {modules?.team && (
            <div className="space-y-4">
              <Card className="p-4">
                <p className="text-note font-bold uppercase tracking-wide text-muted dark:text-dark-muted">
                  {t({ fr: 'Lecture d’équipe', ht: 'Lekti ekip la' })}
                </p>
                {/* §37 — « Ne pas afficher uniquement les performances
                    individuelles. Le contexte est plus important que le
                    classement. » Le total vient donc avant les personnes. */}
                <p className="mt-2 text-body text-text2 dark:text-dark-text2">
                  {modules.team.teamRevenueDeltaPct !== null
                    ? t({
                        fr: `Les ventes réalisées par l’équipe évoluent de ${modules.team.teamRevenueDeltaPct > 0 ? '+' : ''}${modules.team.teamRevenueDeltaPct.toFixed(1)} % sur la période.`,
                        ht: `Vant ekip la fè yo chanje ${modules.team.teamRevenueDeltaPct > 0 ? '+' : ''}${modules.team.teamRevenueDeltaPct.toFixed(1)} % sou peryòd la.`,
                      })
                    : t({
                        fr: 'Nous aurons besoin d’une période de comparaison pour situer l’équipe.',
                        ht: 'N ap bezwen yon peryòd konparezon pou n sitiye ekip la.',
                      })}
                </p>
                <div className="mt-3">
                  <Money value={modules.team.teamRevenue} currency={currency} size="card" />
                </div>
              </Card>

              <Card>
                <ul className="divide-y divide-border dark:divide-dark-border">
                  {modules.team.members.map((m) => (
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
            </div>
          )}
        </ModuleSection>
      )}

      {/* ── §38 · OBJECTIFS STRATÉGIQUES ─────────────────────────────────── */}
      {moduleEnabled('goals', ctx) && (
        <ModuleSection
          title={t({ fr: 'Objectifs stratégiques', ht: 'Objektif estratejik' })}
          loading={loadingModules && !modules}
        >
          <GoalProgress
            goals={goals}
            forecastLabel={t({ fr: 'Projection', ht: 'Pwojeksyon' })}
            emptyLabel={t({ fr: 'Aucun objectif fixé pour ce mois.', ht: 'Pa gen objektif pou mwa sa a.' })}
            emptyAction={t({ fr: 'Fixer un objectif', ht: 'Mete yon objektif' })}
          />
        </ModuleSection>
      )}

      {/* ── §39 · PILOTAI EXECUTIVE ADVISOR ──────────────────────────────── */}
      <ModuleSection
        title={t({ fr: 'PilotAI · Conseiller', ht: 'PilotAI · Konseye' })}
        loading={loadingCore && !core}
        empty={!saying}
      >
        <InsightCard
          title={t({ fr: 'PilotAI Executive Advisor', ht: 'PilotAI Executive Advisor' })}
          saying={saying}
          askLabel={t({ fr: 'Analyser avec PilotAI', ht: 'Analize ak PilotAI' })}
          recommendedLabel={t({ fr: 'Action recommandée', ht: 'Aksyon rekòmande' })}
        />
      </ModuleSection>
    </Stack>
  );
}

/**
 * §38 — la projection de fin de mois d'un objectif : ce qui est déjà réalisé,
 * plus le même rythme quotidien sur les jours restants. Aucune hypothèse
 * d'accélération : projeter une amélioration qu'on n'a pas observée, ce serait
 * fabriquer une donnée (§51).
 */
function projectedRest(goal: {
  actualValue: number;
  daysLeft: number;
  periodStart: string;
}): number {
  const start = new Date(`${goal.periodStart}T00:00:00`);
  const total = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
  const elapsed = Math.max(1, total - goal.daysLeft);
  return (goal.actualValue / elapsed) * goal.daysLeft;
}
