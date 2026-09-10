// Les briques des trois tableaux de bord (§55).
//
// « Les trois dashboards doivent utiliser les mêmes composants fondamentaux
//   lorsque possible. […] Mais chaque plan possède sa propre composition. »
//
// Rien de ce qui vit ici ne connaît l'offre : ces composants reçoivent des
// données et des libellés, ils ne décident de rien. La décision est dans
// `lib/dashboardLevel.ts` ; la composition est dans esansyel/, kwasans/, elit/.

export { KpiCard, DeltaPill, type KpiUnit } from './KpiCard';
export { TrendChart, type TrendSeries } from './TrendChart';
export { HealthScore, stateOf, type HealthDimension, type HealthState } from './HealthScore';
export { AlertCard, type AlertItem, type AlertTone } from './AlertCard';
export { InsightCard } from './InsightCard';
export { GoalProgress, type GoalRow } from './GoalProgress';
export { RecommendationCard, RecommendationList } from './RecommendationCard';
export { ExecutiveSummary, DailyBrief, type SummaryItem } from './ExecutiveSummary';
export { ForecastChart } from './ForecastChart';
export { QuickActions, type QuickAction } from './QuickActions';
export { TopProducts } from './TopProducts';
export { ModuleSection, NotEnoughData, SkeletonBlock, SkeletonKpis } from './ModuleSection';
export { DashboardHeader, Segmented } from './DashboardHeader';
