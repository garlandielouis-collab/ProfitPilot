'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Le tableau de bord — « un écran = une tâche = un fichier » (§5.6)
//
// Avant : 1 836 lignes dans un seul fichier, douze cartes d'indicateurs dont
// huit portaient une courbe fabriquée à coups de `Math.sin()`, deux graphiques
// qui disaient la même chose, une grille de six raccourcis que la barre de
// navigation offre déjà, quatre cartes de rapports qui vivent dans « Plus »,
// un flux d'activité qui répétait les huit lignes du tableau juste en dessous,
// et sept couleurs hors palette dans une constante nommée `C`.
//
// Après : cet écran a UNE tâche — lire l'état du commerce — et il l'orchestre.
// Chaque section est un fichier court de components/dashboard/, avec son état
// vide et son état de chargement propres. Le découpage simplifie l'interface ET
// le code : c'est le même geste.
//
// L'ordre des sections répond à « qu'est-ce que le marchand doit voir en
// premier ? » : la santé du jour, puis la trésorerie, puis ce qui réclame une
// action, puis le détail. Une seule direction de défilement par section (§5.3).
// ─────────────────────────────────────────────────────────────────────────────

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import { ProtectedRoute } from '../../components/ProtectedRoute';
import { CockpitWelcome } from '../../components/CockpitWelcome';
import { useLanguage } from '../../components/LanguageWrapper';
import { supabase } from '../../lib/supabaseClient';
import { FirstRun, ScreenHeader, Section, Stack } from '../../components/ds';
import { PilotageBand } from '../../components/pilotage/PilotageBand';
import { PlanGate, PlanTeaser } from '../../components/PlanLock';

import { PeriodPicker } from '../../components/dashboard/PeriodPicker';
import { KpiSection, type SecondaryRow } from '../../components/dashboard/KpiSection';
import { CashflowChart } from '../../components/dashboard/CashflowChart';
import { HealthCard, type HealthPillar } from '../../components/dashboard/HealthCard';
import { InsightsCard, type Insight } from '../../components/dashboard/InsightsCard';
import { buildInsights } from '../../components/dashboard/insights';
import { StockSection, type StockItem } from '../../components/dashboard/StockSection';
import { LedgerSection } from '../../components/dashboard/LedgerSection';
import {
  isCurrentPeriod, labelOf, monthRangeOf,
  type Period,
} from '../../components/dashboard/period';

import {
  getDashboardV2Action,
  type CashflowPoint,
  type DashboardExtra,
  type LedgerRow,
} from '../actions/ai';
import { getPilotageBundle, type HealthSnapshot, type PilotageBundle } from '../actions/pilotage';
import type { HealthResult } from '../../lib/healthScore';

// ─────────────────────────────────────────────────────────────────────────────

type DashboardProduct = {
  id: string;
  name: string;
  stock_quantity: number;
  reorder_point: number;
  selling_price: number;
  purchase_price?: number;
  category: string | null;
};

const EMPTY_TOTALS = { cashIn: 0, cashOut: 0, profit: 0, debtTotal: 0 };

const GRADE_LABEL: Record<HealthResult['grade'], string> = {
  excellent: 'EXCELLENT',
  solide:    'SOLIDE',
  correct:   'CORRECT',
  fragile:   'FRAGILE',
  critique:  'CRITIQUE',
};

function safeFlow(points: CashflowPoint[]): CashflowPoint[] {
  return (points ?? []).map((p) => ({
    label:   p.label   ?? '',
    cashIn:  p.cashIn  ?? 0,
    cashOut: p.cashOut ?? 0,
    profit:  p.profit  ?? 0,
  }));
}

/** Repli local le temps que le score du serveur arrive. Il ne doit jamais
 *  afficher un chiffre différent une fois la réponse là. */
function localScore(cashIn: number, cashOut: number, profit: number, debt: number): number {
  const margin = cashIn > 0 ? profit / cashIn : 0;
  const spend  = cashIn > 0 ? cashOut / cashIn : 1;
  const load   = cashIn > 0 ? debt / cashIn : 1;

  let score = 0;
  if (margin >= 0.30) score += 30;
  else if (margin >= 0.20) score += 24;
  else if (margin >= 0.10) score += 15;
  else if (margin >= 0.05) score += 8;
  if (cashIn > 0) score += 20;
  if (spend < 0.60) score += 25;
  else if (spend < 0.70) score += 20;
  else if (spend < 0.80) score += 12;
  else if (spend < 0.90) score += 6;
  if (load < 0.20) score += 25;
  else if (load < 0.40) score += 18;
  else if (load < 0.60) score += 10;
  else if (load < 0.80) score += 4;

  return Math.min(100, Math.max(0, score));
}

// ─────────────────────────────────────────────────────────────────────────────

function DashboardInner() {
  const { t } = useLanguage();
  const searchParams = useSearchParams();
  const showWelcome  = searchParams.get('welcome') === '1';

  const now  = useMemo(() => new Date(), []);
  const year = now.getFullYear();

  const [period, setPeriod] = useState<Period>({
    mode: 'mois',
    month: now.getMonth(),
    quarter: Math.floor(now.getMonth() / 3),
    semester: now.getMonth() < 6 ? 0 : 1,
  });

  const [loading, setLoading] = useState(true);
  // `isEmpty` remplace l'ancien mode démo : rien à afficher est un état
  // légitime, pas une occasion d'inventer des ventes (§5.10).
  const [isEmpty, setIsEmpty] = useState(false);
  const [flow,     setFlow]     = useState<CashflowPoint[]>([]);
  const [ledger,   setLedger]   = useState<LedgerRow[]>([]);
  const [totals,   setTotals]   = useState(EMPTY_TOTALS);
  const [extra,    setExtra]    = useState<DashboardExtra | null>(null);
  const [products, setProducts] = useState<DashboardProduct[]>([]);
  const [userName, setUserName] = useState('');
  const [companyName, setCompanyName] = useState(t({ fr: 'votre entreprise', ht: 'antrepriz ou a' }));
  const [health,   setHealth]   = useState<HealthSnapshot | null>(null);
  const [pilotage, setPilotage] = useState<PilotageBundle | null>(null);

  const [monthFrom, monthTo] = monthRangeOf(period);
  const periodLabel = labelOf(period, year);
  const currency = extra?.currency ?? 'HTG';

  // ── Chargement ────────────────────────────────────────────────────────────
  const load = useCallback(async (mode: Period['mode'], from: number, to: number) => {
    const cacheKey = `pp_dash_${year}_${mode}_${from}_${to}`;

    // ① Le cache de session s'affiche sans attendre le réseau : sur une
    //    connexion irrégulière, l'écran ne reste jamais blanc.
    try {
      const raw = sessionStorage.getItem(cacheKey);
      if (raw) {
        const cached = JSON.parse(raw);
        if (cached.ledger?.length > 0 || cached.totals?.cashIn > 0) {
          setIsEmpty(false);
          setFlow(safeFlow(cached.cashflow));
          setLedger(cached.ledger);
          setTotals(cached.totals);
          if (Array.isArray(cached.products)) setProducts(cached.products.map(toProduct));
          setLoading(false);
        }
      }
    } catch { /* sessionStorage indisponible */ }

    // ② Les vrais chiffres remplacent le cache dès qu'ils arrivent.
    try {
      const data = await getDashboardV2Action(mode === 'mois' ? 'month' : 'range', year, from, to);

      if (Array.isArray(data.products)) setProducts(data.products.map(toProduct));
      if (data.extra) {
        setExtra(data.extra);
        if (data.extra.companyName) setCompanyName(data.extra.companyName);
      }

      if (data.ledger.length === 0 && data.totals.cashIn === 0) {
        setIsEmpty(true);
        setFlow([]);
        setLedger([]);
        setTotals(EMPTY_TOTALS);
      } else {
        setIsEmpty(false);
        setFlow(safeFlow(data.cashflow));
        setLedger(data.ledger);
        setTotals(data.totals);
        try {
          sessionStorage.setItem(cacheKey, JSON.stringify({ ...data, _ts: Date.now() }));
        } catch { /* stockage plein */ }
      }
    } catch {
      // Réseau coupé : on ne remplace pas les chiffres du marchand par des
      // chiffres inventés. Un état vide honnête vaut mieux qu'une fausse donnée.
      setIsEmpty(true);
    }
    setLoading(false);
  }, [year]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }: any) => {
      const meta = session?.user?.user_metadata;
      setUserName(meta?.full_name ?? meta?.name ?? session?.user?.email?.split('@')[0] ?? '');
    });
  }, []);

  useEffect(() => {
    load(period.mode, monthFrom, monthTo);
  }, [period.mode, monthFrom, monthTo, load]);

  // Un seul aller-retour pour le score de santé et les quatre blocs de la bande.
  useEffect(() => {
    let cancelled = false;
    getPilotageBundle(5)
      .then((res) => {
        if (cancelled) return;
        setPilotage(res);
        setHealth(res.health);
      })
      .catch(() => {
        if (!cancelled) setPilotage({ rateAlert: null, goals: [], comparison: null, insights: [], health: null });
      });
    return () => { cancelled = true; };
  }, []);

  // ── Données dérivées ──────────────────────────────────────────────────────
  const marginPct = totals.cashIn > 0 ? (totals.profit / totals.cashIn) * 100 : 0;

  const outOfStock = products.filter((p) => p.stock_quantity === 0).length;
  const lowStock   = products.filter((p) => p.stock_quantity > 0 && p.stock_quantity <= (p.reorder_point ?? 0)).length;
  const stockValue = products.reduce(
    (sum, p) => sum + p.stock_quantity * (p.purchase_price ?? p.selling_price ?? 0),
    0,
  );

  // Les courbes viennent du flux RÉEL de la période. Aucune n'est fabriquée :
  // s'il n'y a pas de points, il n'y a pas de courbe (§9, contrôle n° 2).
  const trend = useMemo(() => {
    let balance = 0;
    return {
      revenue: flow.map((p) => p.cashIn),
      profit:  flow.map((p) => p.profit),
      cash:    flow.map((p) => { balance += p.profit; return balance; }),
    };
  }, [flow]);

  const stockItems: StockItem[] = useMemo(
    () => [...products]
      .sort((a, b) => a.stock_quantity - b.stock_quantity)
      .slice(0, 5)
      .map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        quantity: p.stock_quantity,
        reorderPoint: p.reorder_point ?? 0,
      })),
    [products],
  );

  const secondary: SecondaryRow[] = useMemo(() => {
    const rows: SecondaryRow[] = [
      { label: t({ fr: 'Dépenses', ht: 'Depans' }), value: totals.cashOut, currency, href: '/expenses' },
      { label: t({ fr: 'Dettes fournisseurs', ht: 'Dèt founisè' }), value: totals.debtTotal, currency, href: '/dettes',
        alert: totals.debtTotal > totals.cashIn * 0.5 && totals.debtTotal > 0 },
    ];
    if (extra) {
      rows.push(
        { label: t({ fr: 'Ventes du jour', ht: 'Vant jodi a' }), value: extra.todaySalesTotal, currency, href: '/sales' },
        { label: t({ fr: 'Clients', ht: 'Kliyan' }), value: extra.clientsCount, href: '/customers' },
      );
    }
    if (products.length > 0) {
      rows.push({
        label: t({ fr: 'Produits en rupture', ht: 'Pwodwi ki fini' }),
        value: outOfStock,
        href: '/products',
        alert: outOfStock > 0,
      });
    }
    return rows;
  }, [t, totals, currency, extra, products.length, outOfStock]);

  const score = health ? health.score : localScore(totals.cashIn, totals.cashOut, totals.profit, totals.debtTotal);
  const grade = health
    ? GRADE_LABEL[health.grade]
    : score >= 70 ? t({ fr: 'EXCELLENT', ht: 'EKSELAN' })
    : score >= 40 ? t({ fr: 'CORRECT', ht: 'KORÈK' })
    : t({ fr: 'FRAGILE', ht: 'FRAJIL' });

  const pillars: HealthPillar[] = health
    ? health.pillars.map((p) => ({ label: p.label, score: p.score, max: p.max, comment: p.comment }))
    : [];

  // Les recommandations sortent des chiffres réels de la période. La règle
  // vit dans components/dashboard/insights.ts : cet écran orchestre, il ne
  // calcule pas (§5.6).
  const insights: Insight[] = useMemo(
    () => buildInsights(t, {
      marginPct,
      cashIn: totals.cashIn,
      debtTotal: totals.debtTotal,
      outOfStock,
    }),
    [t, marginPct, totals.cashIn, totals.debtTotal, outOfStock],
  );

  const greeting = now.getHours() < 12
    ? t({ fr: 'Bonjour', ht: 'Bonjou' })
    : t({ fr: 'Bonsoir', ht: 'Bonswa' });

  // La barre en cours est la dernière du flux quand la période sélectionnée est
  // celle qu'on vit. Sinon aucune barre ne porte l'accent : rien n'est « en
  // cours » dans un mois déjà terminé (§6.2).
  const currentIndex = isCurrentPeriod(period, now) && flow.length > 0 ? flow.length - 1 : undefined;

  return (
    <div className="min-h-screen bg-background text-text dark:bg-dark-bg dark:text-dark-text">
      {showWelcome && <CockpitWelcome companyName={companyName} />}

      <div className="mx-auto max-w-5xl px-4 pb-32 pt-6 sm:px-6">
        <ScreenHeader
          title={userName ? `${greeting}, ${userName}` : greeting}
          subtitle={periodLabel}
          live={!isEmpty && !loading}
        />

        <div className="mt-6">
          <Stack>
            {/* La période est établie ICI, une fois pour toutes. */}
            <PeriodPicker period={period} onChange={setPeriod} />

            <PilotageBand initial={pilotage} />

            {/* ── PREMIER ACCUEIL — la correction la plus urgente de l'audit ──
                Un compte neuf ne voit plus de fausses ventes ni un faux flux de
                trésorerie : il voit une phrase et la flèche qui désigne le
                bouton « + Vente » de la barre du bas (§5.10). */}
            {isEmpty && !loading && (
              <FirstRun
                title={t({
                  fr: "Votre commerce s'affichera ici",
                  ht: 'Komès ou an ap parèt isit la',
                })}
                hint={t({
                  fr: 'Enregistrez votre première vente : les chiffres de cet écran seront les vôtres, et rien que les vôtres.',
                  ht: 'Anrejistre premye vant ou : chif ekran sa a ap pou ou, e pou ou sèlman.',
                })}
                pointsTo={t({ fr: 'Le bouton « Vente », en bas', ht: 'Bouton « Vant » a, anba' })}
              />
            )}

            {/* Tout ce qui suit n'a de sens que si les chiffres existent. Un
                compte neuf ne voit pas une grille d'indicateurs à zéro doublée
                d'un état vide : il voit l'état vide, et rien d'autre. */}
            {!isEmpty && (
              <>
                <KpiSection
                  totals={totals}
                  marginPct={marginPct}
                  currency={currency}
                  trend={trend}
                  secondary={secondary}
                  loading={loading}
                  labels={{
                    revenue: t({ fr: 'Ventes', ht: 'Vant' }),
                    profit:  t({ fr: 'Profit net', ht: 'Pwofi nèt' }),
                    cash:    t({ fr: 'Trésorerie', ht: 'Lajan kach' }),
                    margin:  t({ fr: 'Marge', ht: 'Maj' }),
                    spent:   t({ fr: 'Sur la période', ht: 'Sou peryòd la' }),
                    rest:    t({ fr: 'Le reste', ht: 'Rès la' }),
                  }}
                />

                <Section title={t({ fr: 'Trésorerie', ht: 'Lajan kach' })}>
                  <CashflowChart
                    data={flow}
                    currency={currency}
                    currentIndex={currentIndex}
                    labels={{
                      in:    t({ fr: 'Entrées', ht: 'Antre' }),
                      out:   t({ fr: 'Sorties', ht: 'Sòti' }),
                      empty: t({ fr: 'Aucun mouvement sur cette période.', ht: 'Pa gen mouvman pou peryòd sa a.' }),
                    }}
                  />
                </Section>

                {/* ── Ce que l'offre change SUR CET ÉCRAN ───────────────────
                    Le socle montre les chiffres : ventes, trésorerie, stock,
                    mouvements. Ils ne se verrouillent jamais — ce sont les
                    siens. Ce qui se paie, c'est le travail fait DESSUS : le
                    score de santé et la lecture de ce qui ressort. D'où deux
                    blocs, et deux seulement, qui changent d'une offre à
                    l'autre. La place, elle, ne bouge pas : le bloc absent est
                    remplacé, jamais retiré, sinon l'écran se recompose sous
                    l'œil du marchand et il croit à un bogue. */}
                <div className="grid gap-6 lg:grid-cols-2">
                  <Section title={t({ fr: 'Santé du commerce', ht: 'Sante komès la' })}>
                    <PlanGate
                      feature="health_score"
                      fallback={
                        <PlanTeaser
                          feature="health_score"
                          title={t({ fr: 'Score financier', ht: 'Skò finansye' })}
                          hint={t({
                            fr: 'Une note sur votre marge, vos dépenses, vos ventes et vos dettes — et ce qu’il faut corriger en premier.',
                            ht: 'Yon nòt sou maj ou, depans ou, vant ou ak dèt ou — ak sa pou korije anvan.',
                          })}
                        />
                      }
                    >
                      <HealthCard
                        score={score}
                        grade={grade}
                        pillars={pillars}
                        loading={loading && !health}
                        labels={{
                          title: t({ fr: 'Score financier', ht: 'Skò finansye' }),
                          hint: t({
                            fr: 'Calculé sur votre marge, vos dépenses, vos ventes et vos dettes.',
                            ht: 'Kalkile sou maj ou, depans ou, vant ou ak dèt ou.',
                          }),
                        }}
                      />
                    </PlanGate>
                  </Section>

                  <PlanGate
                    feature="advanced_dashboard"
                    fallback={
                      <Section title={t({ fr: 'À regarder', ht: 'Pou gade' })}>
                        <PlanTeaser
                          feature="advanced_dashboard"
                          title={t({ fr: 'Ce qui ressort de vos chiffres', ht: 'Sa chif ou yo di' })}
                          hint={t({
                            fr: 'Les écarts du mois, les produits qui décrochent, les clients qui tardent à payer — repérés pour vous.',
                            ht: 'Chanjman mwa a, pwodwi k ap bese, kliyan ki pran tan peye — nou jwenn yo pou ou.',
                          })}
                        />
                      </Section>
                    }
                  >
                    {insights.length > 0 && (
                      <Section title={t({ fr: 'À regarder', ht: 'Pou gade' })}>
                        <InsightsCard
                          insights={insights}
                          loading={loading}
                          title={t({ fr: 'Ce qui ressort de vos chiffres', ht: 'Sa chif ou yo di' })}
                        />
                      </Section>
                    )}
                  </PlanGate>
                </div>

                <Section title={t({ fr: 'Stock', ht: 'Stòk' })}>
                  <StockSection
                    items={stockItems}
                    outOfStock={outOfStock}
                    lowStock={lowStock}
                    totalValue={stockValue}
                    currency={currency}
                    loading={loading}
                    labels={{
                      empty:            t({ fr: 'Aucun produit enregistré.', ht: 'Pa gen pwodwi anrejistre.' }),
                      emptyAction:      t({ fr: 'Ajouter un produit', ht: 'Ajoute yon pwodwi' }),
                      outOfStock:       t({ fr: 'en rupture', ht: 'fini' }),
                      lowStock:         t({ fr: 'stock bas', ht: 'stòk ba' }),
                      totalValue:       t({ fr: 'Valeur du stock', ht: 'Valè stòk la' }),
                      fallbackCategory: t({ fr: 'Sans catégorie', ht: 'San kategori' }),
                    }}
                  />
                </Section>

                <Section title={t({ fr: 'Mouvements', ht: 'Mouvman' })}>
                  <LedgerSection
                    rows={ledger}
                    loading={loading}
                    periodLabel={periodLabel}
                    labels={{
                      all:         t({ fr: 'Tout', ht: 'Tout' }),
                      sales:       t({ fr: 'Ventes', ht: 'Vant' }),
                      purchases:   t({ fr: 'Achats', ht: 'Acha' }),
                      debts:       t({ fr: 'Dettes', ht: 'Dèt' }),
                      search:      t({ fr: 'Rechercher un mouvement', ht: 'Chèche yon mouvman' }),
                      export:      t({ fr: 'CSV', ht: 'CSV' }),
                      empty:       t({ fr: 'Aucun mouvement sur cette période.', ht: 'Pa gen mouvman pou peryòd sa a.' }),
                      noun:        t({ fr: 'mouvement', ht: 'mouvman' }),
                      date:        t({ fr: 'Date', ht: 'Dat' }),
                      description: t({ fr: 'Description', ht: 'Deskripsyon' }),
                      type:        t({ fr: 'Type', ht: 'Tip' }),
                      method:      t({ fr: 'Paiement', ht: 'Peman' }),
                      amount:      t({ fr: 'Montant', ht: 'Montan' }),
                      previous:    t({ fr: 'Précédent', ht: 'Anvan' }),
                      next:        t({ fr: 'Suivant', ht: 'Apre' }),
                    }}
                  />
                </Section>
              </>
            )}
          </Stack>
        </div>
      </div>
    </div>
  );
}

function toProduct(p: any): DashboardProduct {
  return {
    id: p.id,
    name: p.name,
    stock_quantity: p.stock_quantity ?? 0,
    reorder_point: p.reorder_point ?? 5,
    selling_price: p.sale_price ?? p.selling_price ?? 0,
    purchase_price: p.purchase_price,
    category: p.category ?? null,
  };
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
