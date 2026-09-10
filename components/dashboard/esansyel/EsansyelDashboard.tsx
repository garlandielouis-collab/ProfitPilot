'use client';

// ─────────────────────────────────────────────────────────────────────────────
// ESANSYEL — « Je comprends mon business » (§4 à §11)
//
// L'ordre du §11, à la lettre :
//
//   HEADER → 4 KPI → Sales Chart → Quick Actions → Alerts → Top Products →
//   PilotAI Insight
//
// « L'utilisateur doit pouvoir comprendre son entreprise en moins de dix
//   secondes. » Sept blocs, jamais huit. Ce qui n'est pas là n'est pas perdu :
// c'est dans l'écran qui le porte, à un geste de distance.
//
// ── Une décision à expliquer : un seul sélecteur de période ────────────────
//
// Le §4 demande « Aujourd'hui · Cette semaine · Ce mois » en tête d'écran, et
// le §6 demande « 7 jours · 30 jours · 3 mois » sur le graphique. Deux
// contrôles de période sur un même écran, c'est la question « laquelle des deux
// commande ? » posée au marchand à chaque ouverture.
//
// Les deux listes disent presque la même chose : cette semaine, ce sont sept
// jours ; ce mois, une trentaine. On garde donc UN contrôle, celui du §4, avec
// la profondeur du §6 ajoutée en quatrième position — aujourd'hui, cette
// semaine, ce mois, trois mois. La période est établie une fois, en tête, et
// tout l'écran la suit.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo } from 'react';

import { useLanguage } from '../../LanguageWrapper';
import { usePermissions } from '../../../hooks/usePermissions';
import { FirstRun, Stack } from '../../ds';
import {
  AlertCard, DashboardHeader, InsightCard, KpiCard, ModuleSection,
  QuickActions, SkeletonKpis, TopProducts, TrendChart,
  type AlertItem,
} from '../shared';
import { deltaPercent } from '../range';
import { buildPriorities, kpiFormula, pilotSay } from '../narrative';
import type { DashboardState } from '../useDashboard';

export function EsansyelDashboard({ state, userName }: { state: DashboardState; userName: string }) {
  const { t } = useLanguage();
  const { canUse } = usePermissions();
  const { core, loadingCore, range, setRange, isFirstRun } = state;

  const currency = core?.currency ?? 'HTG';
  const finance  = core?.finance ?? null;
  const baseline = core?.baseline ?? null;

  const greeting = new Date().getHours() < 12
    ? t({ fr: 'Bonjour', ht: 'Bonjou' })
    : t({ fr: 'Bonsoir', ht: 'Bonswa' });

  // ── §4 · L'en-tête ────────────────────────────────────────────────────────
  const ranges = [
    { key: 'today' as const, label: t({ fr: "Aujourd'hui", ht: 'Jodi a' }) },
    { key: 'week'  as const, label: t({ fr: 'Cette semaine', ht: 'Semèn sa a' }) },
    { key: 'month' as const, label: t({ fr: 'Ce mois', ht: 'Mwa sa a' }) },
    { key: 'quarter' as const, label: t({ fr: '3 mois', ht: '3 mwa' }) },
  ];

  // ── §8 · Le centre d'attention ────────────────────────────────────────────
  const alerts: AlertItem[] = useMemo(() => {
    if (!core) return [];
    const list: AlertItem[] = [];
    const a = core.alerts;

    if (a.lowStock > 0) {
      list.push({
        id: 'low-stock',
        tone: 'warning',
        text: t({
          fr: `${a.lowStock} produit${a.lowStock > 1 ? 's ont' : ' a'} un stock faible`,
          ht: `${a.lowStock} pwodwi gen stòk ki ba`,
        }),
        action: t({ fr: 'Voir', ht: 'Gade' }),
        href: '/inventory',
      });
    }
    if (a.outOfStock > 0) {
      list.push({
        id: 'out-of-stock',
        tone: 'danger',
        text: t({
          fr: `${a.outOfStock} produit${a.outOfStock > 1 ? 's sont épuisés' : ' est épuisé'}`,
          ht: `${a.outOfStock} pwodwi fini`,
        }),
        action: t({ fr: 'Voir', ht: 'Gade' }),
        href: '/inventory',
      });
    }
    if (a.overdueInvoices > 0) {
      list.push({
        id: 'overdue',
        tone: 'danger',
        text: t({
          fr: `${a.overdueInvoices} crédit${a.overdueInvoices > 1 ? 's sont' : ' est'} en retard de paiement`,
          ht: `${a.overdueInvoices} kredi an reta`,
        }),
        action: t({ fr: 'Relancer', ht: 'Fè rapèl' }),
        href: '/creances',
      });
    } else if (a.unpaidInvoices > 0) {
      list.push({
        id: 'unpaid',
        tone: 'info',
        text: t({
          fr: `${a.unpaidInvoices} crédit${a.unpaidInvoices > 1 ? 's' : ''} en cours`,
          ht: `${a.unpaidInvoices} kredi ki an kou`,
        }),
        action: t({ fr: 'Voir', ht: 'Gade' }),
        href: '/creances',
      });
    }
    return list;
  }, [core, t]);

  // ── §10 · La phrase de PilotAI, au registre « constat » (§58) ─────────────
  const saying = useMemo(() => {
    if (!core) return null;
    return pilotSay(t, 'observation', {
      currency,
      finance,
      baseline,
      alerts: core.alerts,
      topProducts: core.topProducts,
    });
  }, [core, t, currency, finance, baseline]);

  // Une seule priorité pour Esansyel : le §1 veut que cet écran reste
  // « extrêmement simple ». Le tri, lui, est le même que partout.
  const topPriority = useMemo(() => {
    if (!core) return [];
    return buildPriorities(t, {
      currency, finance, baseline,
      alerts: core.alerts,
      topProducts: core.topProducts,
    }, 1);
  }, [core, t, currency, finance, baseline]);

  const chartSeries = useMemo(() => {
    if (!core) return [];
    return [{
      key: 'revenue',
      label: t({ fr: 'Évolution des ventes', ht: 'Evolisyon vant yo' }),
      points: core.series.map((p) => ({ label: p.label, value: p.revenue })),
    }];
  }, [core, t]);

  // ── §43 · Le premier jour ─────────────────────────────────────────────────
  if (isFirstRun) {
    return (
      <Stack>
        <DashboardHeader
          title={userName ? `${greeting}, ${userName}` : greeting}
          subtitle={t({
            fr: 'Voici comment se porte votre entreprise.',
            ht: 'Men kijan antrepriz ou ap mache.',
          })}
          companyName={core?.company.name ?? ''}
          showCompany={(core?.companyCount ?? 1) > 1}
          ranges={ranges}
          activeRange={range}
          onRangeChange={setRange}
        />
        <FirstRun
          title={t({
            fr: "Votre commerce s'affichera ici",
            ht: 'Komès ou an ap parèt isit la',
          })}
          hint={t({
            fr: 'Commencez par enregistrer vos premières ventes : les chiffres de cet écran seront les vôtres, et rien que les vôtres.',
            ht: 'Kòmanse anrejistre premye vant ou yo : chif ekran sa a ap pou ou, e pou ou sèlman.',
          })}
          pointsTo={t({ fr: 'Le bouton « Vente », en bas', ht: 'Bouton « Vant » a, anba' })}
        />
      </Stack>
    );
  }

  return (
    <Stack>
      {/* ── §4 · HEADER ──────────────────────────────────────────────────── */}
      <DashboardHeader
        title={userName ? `${greeting}, ${userName}` : greeting}
        subtitle={t({
          fr: 'Voici comment se porte votre entreprise.',
          ht: 'Men kijan antrepriz ou ap mache.',
        })}
        companyName={core?.company.name ?? ''}
        showCompany={(core?.companyCount ?? 1) > 1}
        live={!loadingCore}
        ranges={ranges}
        activeRange={range}
        onRangeChange={setRange}
      />

      {/* ── §5 · QUATRE KPI, pas cinq ────────────────────────────────────── */}
      {loadingCore && !core ? (
        <SkeletonKpis count={4} />
      ) : finance ? (
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <KpiCard
            emphasis
            label={t({ fr: 'Ventes', ht: 'Vant' })}
            value={finance.revenue}
            currency={currency}
            deltaPercent={baseline ? deltaPercent(finance.revenue, baseline.revenue) : null}
            formula={kpiFormula(t, 'revenue')}
            href="/sales"
          />
          <KpiCard
            label={t({ fr: 'Dépenses', ht: 'Depans' })}
            value={finance.expenses}
            currency={currency}
            deltaPercent={baseline ? deltaPercent(finance.expenses, baseline.expenses) : null}
            formula={kpiFormula(t, 'expenses')}
            href="/expenses"
          />
          <KpiCard
            label={t({ fr: 'Profit', ht: 'Pwofi' })}
            value={finance.netProfit}
            currency={currency}
            deltaPercent={baseline ? deltaPercent(finance.netProfit, baseline.netProfit) : null}
            formula={kpiFormula(t, 'netProfit')}
            href="/rapports"
          />
          <KpiCard
            label={t({ fr: 'Trésorerie', ht: 'Lajan kach' })}
            value={finance.cashFlow}
            currency={currency}
            deltaPercent={baseline ? deltaPercent(finance.cashFlow, baseline.cashFlow) : null}
            formula={kpiFormula(t, 'cashFlow')}
            href="/rapports"
          />
        </div>
      ) : null}

      {/* ── §6 · UNE SEULE visualisation ─────────────────────────────────── */}
      <ModuleSection
        title={t({ fr: 'Évolution des ventes', ht: 'Evolisyon vant yo' })}
        loading={loadingCore && !core}
        empty={(chartSeries[0]?.points.length ?? 0) < 2}
        emptyTitle={t({
          fr: 'La courbe arrive avec les ventes',
          ht: 'Koub la ap vini ak vant yo',
        })}
        emptyHint={t({
          fr: 'Il faut au moins deux journées de ventes pour dessiner une tendance.',
          ht: 'Fòk gen omwen de jou vant pou n desine yon tandans.',
        })}
      >
        <TrendChart
          series={chartSeries}
          currency={currency}
          emptyLabel={t({
            fr: 'Aucun mouvement sur cette période.',
            ht: 'Pa gen mouvman pou peryòd sa a.',
          })}
        />
      </ModuleSection>

      {/* ── §7 · ACTIONS RAPIDES ─────────────────────────────────────────── */}
      <ModuleSection title={t({ fr: 'Actions rapides', ht: 'Aksyon rapid' })}>
        <QuickActions
          actions={[
            { key: 'sale',     label: t({ fr: 'Nouvelle vente', ht: 'Nouvo vant' }),        href: '/sales?new=1',      primary: true },
            { key: 'product',  label: t({ fr: 'Ajouter produit', ht: 'Ajoute pwodwi' }),     href: '/products?new=1' },
            { key: 'expense',  label: t({ fr: 'Ajouter dépense', ht: 'Ajoute depans' }),     href: '/expenses?new=1' },
            { key: 'customer', label: t({ fr: 'Ajouter client', ht: 'Ajoute kliyan' }),      href: '/customers?new=1' },
            { key: 'supplier', label: t({ fr: 'Ajouter fournisseur', ht: 'Ajoute founisè' }), href: '/suppliers?new=1' },
          ]}
        />
      </ModuleSection>

      {/* ── §8 · À SURVEILLER ────────────────────────────────────────────── */}
      <ModuleSection
        title={t({ fr: 'À surveiller', ht: 'Pou siveye' })}
        loading={loadingCore && !core}
      >
        <AlertCard
          items={alerts}
          allClearLabel={t({
            fr: 'Aucun problème urgent aujourd’hui.',
            ht: 'Pa gen pwoblèm ijan jodi a.',
          })}
        />
      </ModuleSection>

      {/* ── §9 · PRODUITS LES PLUS VENDUS ────────────────────────────────── */}
      <ModuleSection
        title={t({ fr: 'Produits les plus vendus', ht: 'Pwodwi ki pi vann' })}
        loading={loadingCore && !core}
      >
        <TopProducts
          rows={core?.topProducts ?? []}
          currency={currency}
          labels={{
            product: t({ fr: 'Produit', ht: 'Pwodwi' }),
            units:   t({ fr: 'Unités', ht: 'Inite' }),
            revenue: t({ fr: 'Ventes', ht: 'Vant' }),
            margin:  t({ fr: 'Marge', ht: 'Maj' }),
            empty:   t({
              fr: 'Aucune vente de produit sur cette période.',
              ht: 'Pa gen vant pwodwi sou peryòd sa a.',
            }),
            emptyAction: t({ fr: 'Voir mes produits', ht: 'Gade pwodwi mwen yo' }),
          }}
        />
      </ModuleSection>

      {/* ── §10 · PILOTAI, une petite section ────────────────────────────── */}
      <ModuleSection title="PilotAI" loading={loadingCore && !core}>
        <InsightCard
          title="PilotAI"
          saying={
            saying && topPriority.length > 0
              ? { ...saying, recommend: topPriority[0].detail, action: { label: topPriority[0].action, href: topPriority[0].href } }
              : saying
          }
          /* L'assistant commence à Kwasans. Plutôt que de promettre un bouton
             qui reviendrait en 403, le libellé dit la vérité : ici on découvre
             PilotAI, on ne l'interroge pas encore. La lecture des chiffres,
             elle, reste gratuite — elle ne coûte aucun jeton. */
          askLabel={canUse('ai_assistant')
            ? t({ fr: 'Demander à PilotAI', ht: 'Mande PilotAI' })
            : t({ fr: 'Découvrir PilotAI', ht: 'Dekouvri PilotAI' })}
        />
      </ModuleSection>
    </Stack>
  );
}
