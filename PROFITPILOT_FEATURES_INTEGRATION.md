# ProfitPilot — Intégration des fonctionnalités (9 diagnostics + 7 bonus)

Guide technique d'intégration du document stratégique produit dans le code existant.
Pour chaque module : **ce qui existait déjà**, **ce qui a été ajouté**, **comment le brancher**.

Migration SQL : [`supabase/migrations/20260821_profitpilot_features.sql`](supabase/migrations/20260821_profitpilot_features.sql)
Statut typecheck : `npm run typecheck` ✅ (0 erreur)

**État : les 9 diagnostics et les 7 bonus sont implémentés et branchés.** Restent ouverts, hors périmètre du document produit :

- l'envoi WhatsApp **automatique** (API WhatsApp Business) — aujourd'hui le digest hebdomadaire produit un lien `wa.me` à envoyer en un tap ;
- le découpage de `app/dashboard/page.tsx` (§2) ;
- `TRIAL_FALLBACK_PLAN` à passer de `'Expert'` à `null` au lancement commercial (§5) ;
- la refonte SQL de `forceRefreshAndRecalculate()` (§1).

---

## 0. Vue d'ensemble des fichiers

| Couche | Fichier | Rôle |
|---|---|---|
| SQL | `supabase/migrations/20260821_profitpilot_features.sql` | Tables, colonnes, vues, RLS |
| Domaine | [`lib/margin.ts`](lib/margin.ts) | Coût réel, marge nette, prix conseillé, impact taux, simulateur prix |
| Domaine | [`lib/healthScore.ts`](lib/healthScore.ts) | Score de santé /100 en 4 piliers |
| Domaine | [`lib/insights.ts`](lib/insights.ts) | Recommandations automatiques (règles déterministes) |
| Domaine | [`lib/whatsappReport.ts`](lib/whatsappReport.ts) | Résumé hebdo + message de relance + lien `wa.me` |
| Offres | [`lib/plans.ts`](lib/plans.ts) · [`lib/planFeatures.ts`](lib/planFeatures.ts) | Esansyel / Kwasans / Elit + feature flags |
| Offres | [`lib/entitlements.ts`](lib/entitlements.ts) | Gating **serveur** (`assertFeature`, `assertPermission`) |
| Actions | [`app/actions/receivables.ts`](app/actions/receivables.ts) | Créances : liste, échéance, paiement, relance |
| Actions | [`app/actions/goals.ts`](app/actions/goals.ts) | Objectifs mensuels + avancement |
| Actions | [`app/actions/profitability.ts`](app/actions/profitability.ts) | Classement produits, marge produit, simulateur |
| Actions | [`app/actions/pilotage.ts`](app/actions/pilotage.ts) | KPI MoM/YoY, score, insights, digest, dossier crédit |
| Actions | [`app/actions/exchangeRate.ts`](app/actions/exchangeRate.ts) | `refreshRateWithAlert()` (ajouté) |
| UI | [`components/margin/MarginCalculator.tsx`](components/margin/MarginCalculator.tsx) | Calculateur temps réel |
| UI | [`components/sales/QuickSaleForm.tsx`](components/sales/QuickSaleForm.tsx) | Vente en 10 secondes |
| UI | [`components/receivables/ReceivablesPanel.tsx`](components/receivables/ReceivablesPanel.tsx) | Registre de créances |
| UI | [`components/pricing/PriceSimulator.tsx`](components/pricing/PriceSimulator.tsx) | « Et si j'augmentais mes prix ? » |
| UI | [`components/goals/MonthlyGoalCard.tsx`](components/goals/MonthlyGoalCard.tsx) | Objectif du mois |
| UI | [`components/insights/InsightsFeed.tsx`](components/insights/InsightsFeed.tsx) | Recommandations |
| Domaine | [`lib/offlineQueue.ts`](lib/offlineQueue.ts) | File IndexedDB des ventes hors-ligne + clé d'idempotence |
| Domaine | [`lib/expenseScope.ts`](lib/expenseScope.ts) | Libellés et couleurs business / personnel / mixte |
| Infra | [`lib/cronAuth.ts`](lib/cronAuth.ts) | Authentification des routes cron |
| UI | [`components/pilotage/PilotageBand.tsx`](components/pilotage/PilotageBand.tsx) | Bande de pilotage du dashboard (alerte taux, objectif, MoM, insights) |
| UI | [`components/profitability/ProfitabilityTable.tsx`](components/profitability/ProfitabilityTable.tsx) | Classement des produits par marge générée |
| UI | [`components/credit/CreditFileReport.tsx`](components/credit/CreditFileReport.tsx) | Dossier crédit imprimable (`react-to-print`) |
| UI | [`components/reports/WeeklyDigestCard.tsx`](components/reports/WeeklyDigestCard.tsx) | Digest hebdo + envoi WhatsApp en un tap |
| UI | [`components/offline/OfflineSalesSync.tsx`](components/offline/OfflineSalesSync.tsx) | Rejeu de la file hors-ligne au retour du réseau |
| Page | [`app/creances/page.tsx`](app/creances/page.tsx) | Écran Créances (ajouté à la nav Finances) |
| Page | [`app/rentabilite/page.tsx`](app/rentabilite/page.tsx) | Classement des produits par rentabilité |
| Page | [`app/rapports/credit/page.tsx`](app/rapports/credit/page.tsx) | Dossier crédit / microfinance |
| Cron | [`app/api/cron/daily/route.ts`](app/api/cron/daily/route.ts) | Relances de créances + alertes de stock bas |
| Cron | [`app/api/cron/weekly-digest/route.ts`](app/api/cron/weekly-digest/route.ts) | Rapport hebdomadaire du dimanche |

**Charte** : navy `#001F3F` (structure, en-têtes, actions principales), émeraude `#50C878` (gain, validation, progression), rouge/ambre réservés aux alertes. Aucune couleur nouvelle : ce sont déjà `theme.config.ts`.

---

## 1. Calculateur de marge temps réel + alerte taux (Diagnostics 1 & 4)

### Existant
- `lib/currency.ts` : conversion USD↔HTG.
- `hooks/useExchangeRate.ts` + `app/actions/exchangeRate.ts` : récupération du taux, stockage dans `businesses.exchange_rate`, recalcul des écritures.
- **Manquait** : aucun historique de taux, aucune notion de coût complet (livraison/commission/emballage), aucune marge nette par vente.

### Ajouté

**SQL**
```sql
-- historique + variation
CREATE TABLE exchange_rate_history (business_id, rate, previous_rate, variation_pct, source, captured_at);
ALTER TABLE businesses ADD COLUMN rate_alert_threshold NUMERIC(5,2) DEFAULT 3.0;

-- coût réel produit
ALTER TABLE products
  ADD COLUMN delivery_cost, packaging_cost, other_cost,
  ADD COLUMN commission_percent, target_margin_percent, reorder_point;

-- enregistre + calcule la variation en une transaction
SELECT * FROM fn_record_exchange_rate('<business_id>', 132.50, 'api');
```

**Domaine** — `lib/margin.ts` :

```ts
const m = computeMargin({
  purchasePrice: 12, costCurrency: 'USD',
  deliveryCost: 1.5, commissionPercent: 5,
  salePrice: 2200, saleCurrency: 'HTG',
  exchangeRate: 132.5, displayCurrency: 'HTG',
});
// → { landedCost, netMargin, marginPercent, isLoss, breakEvenPrice }

suggestSalePrice(cost, { exchangeRate, displayCurrency: 'HTG', targetMarginPercent: 30 });
computeRateImpact(input, 128, 135);   // marge avant/après, becomesLoss
```

**UI** — `<MarginCalculator exchangeRate={rate} displayCurrency="HTG" onApplyPrice={setPrice} />`
Recalcul à chaque frappe, frais annexes repliés par défaut, prix conseillé applicable en un clic.

**Alerte taux** — `refreshRateWithAlert()` retourne `{ variationPercent, shouldAlert, productsAtLoss[] }`.

### Branché ✅
1. `app/products/ProductsClient.tsx` porte les champs de frais annexes et le `<MarginCalculator />`, avec application du prix conseillé en un clic.
2. `<RateAlertBanner />` (dans `<PilotageBand />`) appelle `refreshRateWithAlert()` et affiche le bandeau quand `shouldAlert`.

### Amélioration proposée sur l'existant
`forceRefreshAndRecalculate()` boucle en `await` séquentiel sur chaque dépense/vente puis sur chaque ligne d'écriture → O(n) allers-retours réseau. À remplacer par une fonction SQL `UPDATE … FROM` unique, ou un `rpc()` qui fait le recalcul côté base. Gain : de plusieurs secondes à quelques millisecondes sur un compte chargé.

---

## 2. Vente en 10 secondes + tableau de bord (Diagnostic 2)

### Existant
- `components/NewSaleForm.tsx` : POS complet (panier, remise, scan code-barres, CRM, facture).
- `app/dashboard/page.tsx` : dashboard riche (1 780 lignes) avec cashflow, ledger, score de santé calculé localement.

### Ajouté
`components/sales/QuickSaleForm.tsx` — le chemin court : **produit → quantité → mode de paiement**, trois taps, avec la marge affichée avant validation. Réutilise `createSaleAction` : mêmes validations, même comptabilité, aucune duplication de logique métier.

```tsx
<QuickSaleForm onSaved={() => refetchDashboard()} />
```

### Améliorations sur l'existant
1. ✅ **Dashboard** : les `MOCK_CASHFLOW` / `MOCK_LEDGER` / `MOCK_PRODUCTS` ont été retirés. Un compte vide affichait de fausses ventes — sur un produit dont l'argument est « enfin des chiffres vrais », c'était le pire repli possible.
2. ✅ **Score de santé** : le dashboard consomme `getHealthScore()` (`lib/healthScore.ts`, 4 piliers, historisé). Le `computeHealthScore()` local ne sert plus que de repli tant que le serveur n'a pas répondu.
3. ⏳ **Découper `app/dashboard/page.tsx`** en sections (`<CashflowSection/>`, `<LedgerSection/>`, `<HealthSection/>`) : le fichier reste long et chaque modification y est risquée. Seule amélioration structurelle encore ouverte sur cet écran.

---

## 3. Registre de créances (Diagnostic 3)

### Existant
- `app/dettes/page.tsx` agrège trois sources : dettes fournisseurs (`purchases`), créances clients (`sales` où `payment_status = 'credit'`), dépenses à crédit.
- **Limite** : l'échéance était **déduite** en JS (`created_at + 30 j`), non stockée, non modifiable ; aucune relance, aucun paiement partiel.

### Ajouté

**SQL** — la créance vit sur la vente (source de vérité déjà utilisée par `/dettes`) :
```sql
ALTER TABLE sales ADD COLUMN last_reminder_at, reminder_count;
-- trigger : toute vente à crédit sans échéance ⇒ +30 jours
CREATE TRIGGER trg_sale_default_due_date BEFORE INSERT ON sales …;

CREATE TABLE receivable_reminders (sale_id, channel, message, sent_by, sent_at);

CREATE VIEW v_receivables AS …  -- balance_due, days_overdue, status calculés
-- status ∈ open | due_soon | overdue | critical | paid
```

**Actions** — `app/actions/receivables.ts` :
```ts
listReceivables();                              // triées par urgence + totaux
setReceivableDueDate(saleId, '2026-09-15');
recordReceivablePayment(saleId, 5000, 'MonCash'); // partiel → sale_payments
markReceivablePaid(saleId);
prepareReceivableReminder(saleId);              // message + lien wa.me + journal
```

**UI** — `<ReceivablesPanel />` sur `/creances` : statut coloré, échéance éditable en ligne, bouton « Relancer » (WhatsApp) et « Payé ».

### Branché ✅
- La section « créances clients » de `/dettes` lit désormais `v_receivables`. Elle affiche le **solde restant dû** (`balance_due`) et l'**échéance stockée**, au lieu du montant total et d'un `created_at + 30 j` calculé en JS. Deux conséquences concrètes : un client ayant payé la moitié n'apparaît plus comme devant la totalité, et un paiement partiel (`payment_status = 'partial'`) ne disparaît plus de l'écran — l'ancien filtre `payment_status = 'credit'` le faisait sortir de la liste.
- Rappel automatique : `/api/cron/daily` (11 h UTC) parcourt `v_receivables` et notifie les statuts `due_soon` / `overdue` / `critical`, avec au plus **une relance par créance et par jour** (`last_reminder_at`).

---

## 4. Dépenses business vs personnel (Diagnostic 6)

### Existant
`expenses` + `expense_categories` (avec `account_code` relié au plan comptable), UI dans `components/ExpensesPage.tsx`. Aucune séparation privé / professionnel.

### Ajouté
```sql
CREATE TYPE expense_scope AS ENUM ('business','personal','mixed');
ALTER TABLE expenses ADD COLUMN scope expense_scope DEFAULT 'business',
                     ADD COLUMN business_share_pct NUMERIC(5,2) DEFAULT 100;
ALTER TABLE expense_categories ADD COLUMN default_scope expense_scope DEFAULT 'business';
-- trigger : la dépense hérite du scope de sa catégorie
-- + catégories personnelles créées d'office (Dépenses maison, Écolage, Santé famille…)
```

`business_share_pct` traite le cas réel du forfait téléphone à 60 % professionnel — sans forcer le marchand à créer deux dépenses.

La vue `v_monthly_kpis` exclut le personnel du résultat business :
```sql
SUM(amount * business_share_pct / 100) FILTER (WHERE scope <> 'personal') AS business_expenses,
SUM(amount)                            FILTER (WHERE scope  = 'personal') AS personal_expenses
```

### Branché ✅
`components/ExpensesPage.tsx` porte le sélecteur Business / Personnel / Mixte et le curseur `business_share_pct` (visible uniquement en `mixed`) ; `scope` transite par `ExpensePayload` → `upsertExpense` (`lib/expenseScope.ts` centralise libellés et couleurs).

---

## 5. Offres et rôles multi-utilisateurs (Diagnostic 8 + structure des offres)

### Existant
- `lib/rbac.ts` : 7 rôles × 33 permissions, `ROLE_PERMISSIONS` complet.
- `lib/planFeatures.ts` + `PermissionGate` / `FeatureGate` : gating **côté client**.
- Clés en base : `'Ti Machann' | 'Business Pilot' | 'Expert'` (prix 1 000 / 2 500 / 7 500 HTG — identiques au document).

### Ajouté
1. **Noms commerciaux** — `lib/plans.ts` expose `label` (Esansyel / Kwasans / Elit), `PLAN_LABELS`, `getPlanLabel()` et `normalizePlanKey()` qui accepte les deux nomenclatures. **Aucune migration de données** : les clés en base ne changent pas.
2. **Feature flags alignés sur le discours de vente** — `lib/planFeatures.ts` : `quick_sale`, `margin_calculator`, `receivables`, `product_profitability`, `monthly_goals`, `weekly_whatsapp_report`, `credit_export`, `health_score`, `auto_recommendations`, `multi_user_roles`… composés en cascade `ESANSYEL ⊂ KWASANS ⊂ ELIT`.
3. **Gating serveur** — `lib/entitlements.ts` :

```ts
export async function getProductProfitability() {
  await assertFeature('product_profitability');   // ← offre
  await assertPermission('reports:read');         // ← rôle
  …
}
```

> ⚠️ Point de sécurité : avant cet ajout, le gating n'existait qu'en UI. Un appel direct de server action contournait l'offre.

**Actions existantes désormais équipées** ✅

| Action | Garde | Comportement hors offre |
|---|---|---|
| `ai.getDashboardV2Action` | `hasFeature('basic_dashboard')` | renvoie vide |
| `ai.getWeeklySummaryAction` | `hasFeature('ai_assistant')` | renvoie vide |
| `reports.getReportsDataAction` | `hasFeature('advanced_reports')` | renvoie `emptyReports()` |
| `api/ai/chat` | abonnement actif ∈ `plansWithFeature('ai_assistant')` **ou** paquet de questions gagné par parrainage, puis `consume_ai_question()` | `403` sans porte, `429` quota épuisé |
| `products.createProductAction` | `productAllowance()` = `PLAN_MAX_PRODUCTS` + bonus parrainage | lève `PlanLimitError` |
| `employees.inviteEmployee` | `assertFeature('employees')` + `assertSeatAvailable()` | lève |
| `employees.updateEmployeeRole` | `assertFeature('multi_user_roles')` | lève |
| `invitations.sendHrInvitation` | `assertFeature('employees')` + `assertSeatAvailable()` | lève |
| `stores.createStore` | `assertStoreAvailable()` | lève |

Deux régimes volontairement distincts :

- **Lectures** → `hasFeature()`, qui renvoie un résultat vide. Une offre incomplète ne doit pas casser une page : l'écran s'affiche, simplement sans chiffres, et le `FeatureGate` client porte l'upsell.
- **Écritures et appels facturés** → `assertFeature()` / `assert*Available()`, qui lèvent. `api/ai/chat` va plus loin et exige un abonnement **réellement actif**, sans le repli d'essai : chaque appel consomme des jetons payants.

**Trois verrous distincts sur la délégation** (Diagnostic 8), à ne pas confondre :

| Verrou | Offre | Ce qu'il autorise |
|---|---|---|
| `employees` | Kwasans | ajouter des mains supplémentaires |
| `PLAN_MAX_MEMBERS` | 1 / 3 / 25 | **combien** de sièges |
| `multi_user_roles` | Elit | choisir un **rôle précis** plutôt que le rôle par défaut |

Gater l'invitation elle-même sur `multi_user_roles` rendrait les 3 sièges de Kwasans inutilisables : sur Kwasans on invite, l'arrivant entre en `cashier` ; c'est la différenciation fine des rôles qui est vendue avec Elit, pas la délégation.

**Quotas** — `PLAN_MAX_MEMBERS` était déclaré mais jamais vérifié : toute offre pouvait inviter sans limite. `assertSeatAvailable()` compte les membres actifs **et les invitations en attente** (sinon dix invitations tiennent dans trois sièges) et s'applique aux deux chemins d'invitation. `createStore` a perdu son calcul local, qui ignorait `expires_at` et retombait sur « Ti Machann » — le même compte pouvait donc se voir refuser une boutique ici et l'obtenir ailleurs.

`api/ai/chat` ne recopie plus la liste des offres autorisées : `plansWithFeature('ai_assistant')` la dérive du registre, pour qu'ajouter Pilot AI à une offre reste une modification à un seul endroit.

4. **Limites d'équipe** — `PLAN_MAX_MEMBERS` (1 / 3 / 25) à vérifier dans `app/actions/invitations.ts`.

### Amélioration proposée
`getClientTenantContext()` et `listCompanies()` retombent sur `'Expert'` quand aucun abonnement actif n'est trouvé (`// temp — revert after testing`). Tout est donc déverrouillé par défaut. Le repli est désormais centralisé dans `TRIAL_FALLBACK_PLAN` (`lib/entitlements.ts`) : le passer à `null` (ou `'Ti Machann'`) au lancement commercial, en un seul endroit.

---

## 6. Classement des produits par rentabilité (Diagnostic 5)

```sql
CREATE VIEW v_product_profitability AS  -- marge TOTALE générée, pas le volume
SELECT business_id, product_id, units_sold, revenue, cost, gross_margin, margin_pct, last_sold_at …
```

```ts
const report = await getProductProfitability();
// items[] triés par gross_margin, chacun avec un verdict :
//   'pousser' | 'surveiller' | 'reduire' | 'dormant'
// + top3SharePercent : concentration de la marge
```

Les produits **en stock jamais vendus** sont réintégrés dans le classement avec le verdict `dormant` : c'est le capital immobilisé que le marchand ne voit jamais.

---

## 7. Objectifs et indicateurs mensuels (Diagnostic 7)

```sql
CREATE TABLE business_goals (business_id, metric, period_start, target_value, currency, …);
-- metric ∈ revenue | margin | customers | sales_count
```

```ts
await upsertGoal({ metric: 'revenue', targetValue: 150000 });
const [goal] = await getGoalProgress();
// { actualValue, progressPercent, daysLeft, dailyPaceNeeded, onTrack }
```

`<MonthlyGoalCard metric="revenue" />` affiche la barre de progression et **le rythme quotidien restant** — la donnée qui rend l'objectif actionnable plutôt que décoratif.

---

## 8. Les 7 bonus

| # | Bonus | Implémentation | Reste à faire |
|---|---|---|---|
| 1 | Rapport hebdo WhatsApp | `buildWeeklyReport()` → texte + `wa.me`, journalisé dans `report_deliveries` · cron dimanche 23 h UTC (`/api/cron/weekly-digest`) · `<WeeklyDigestCard />` sur `/rapports` | API WhatsApp Business pour l'envoi **automatique** (aujourd'hui : lien `wa.me` en un tap) |
| 2 | Simulateur de prix | `simulateProductPrice()` + `<PriceSimulator />` sur la fiche produit (`ProductsClient`) | — |
| 3 | Score de santé | `lib/healthScore.ts` + `getHealthScore()` (snapshot mensuel) + `getHealthHistory()` · le dashboard consomme le score serveur | — |
| 4 | Mode hors-ligne | `lib/offlineQueue.ts` (IndexedDB) + `<OfflineSalesSync />` monté dans `app/layout.tsx` · rejeu idempotent via `sales.metadata->>client_ref` | — |
| 5 | Export crédit / microfinance | `getCreditFile(12)` + `<CreditFileReport />` sur `/rapports/credit`, impression PDF via `react-to-print` | — |
| 6 | Alerte de stock bas | `products.reorder_point` + cron quotidien `/api/cron/daily` → `notifications`, désactivable par `businesses.low_stock_alerts_enabled` | — |
| 7 | Comparaison mois/mois | `v_monthly_kpis` + `getMonthComparison()` (MoM **et** YoY) + `<MonthComparisonCard />` dans la bande de pilotage du dashboard | — |

### §9 — File d'attente hors-ligne (bonus 4)

Le PWA servait déjà les assets hors-ligne, mais une vente saisie sans réseau était perdue. Implémenté ✅ :

| Pièce | Rôle |
|---|---|
| [`lib/offlineQueue.ts`](lib/offlineQueue.ts) | File IndexedDB (`pending_sales`), clé primaire = `clientRef` |
| [`components/sales/QuickSaleForm.tsx`](components/sales/QuickSaleForm.tsx) | Génère `clientRef` **avant** l'appel ; si `navigator.onLine === false`, met en file au lieu d'échouer |
| [`components/offline/OfflineSalesSync.tsx`](components/offline/OfflineSalesSync.tsx) | Monté dans `app/layout.tsx` ; rejoue la file sur l'événement `online` |
| [`app/actions/sales.ts`](app/actions/sales.ts) | Reconnaît `metadata->>client_ref` et renvoie la vente existante au lieu d'en créer une seconde |

La clé d'idempotence est le point critique : sans elle, un rejeu partiel gonfle le chiffre d'affaires — exactement le chiffre auquel le marchand doit pouvoir se fier. `crypto.randomUUID()` n'existant pas sur tous les WebView Android, `newClientRef()` porte un repli.

---

### §9 bis — Fuite multi-tenant sur les vues (corrigée)

Migration : [`supabase/migrations/20260826_views_security_invoker.sql`](supabase/migrations/20260826_views_security_invoker.sql)

Une vue PostgreSQL s'exécute par défaut avec les droits de son **propriétaire**, pas de celui qui l'interroge. Créées par le rôle `postgres` puis ouvertes par `GRANT SELECT … TO authenticated`, les trois vues du module contournaient donc la RLS de `sales`, `products` et `expenses`.

Conséquence : n'importe quel utilisateur connecté pouvait lire les créances, les marges et les KPI de **tous** les commerces en changeant le filtre `business_id` — les server actions filtrent bien par entreprise, mais rien n'oblige un appelant à passer par elles.

```sql
ALTER VIEW v_receivables           SET (security_invoker = on);
ALTER VIEW v_product_profitability SET (security_invoker = on);
ALTER VIEW v_monthly_kpis          SET (security_invoker = on);
```

La RLS déjà en place sur les tables suffit alors : aucune politique supplémentaire n'est nécessaire. Le cron continue de fonctionner, il interroge les vues avec le `service_role`, qui n'est pas soumis à la RLS.

> À vérifier après application : `SELECT * FROM v_receivables;` depuis un compte de test ne doit renvoyer que ses propres lignes.

---

## 10. Ordre d'application

```bash
# 1. Migrations (Supabase SQL Editor ou CLI), dans cet ordre
#    20260821_profitpilot_features.sql   — tables, colonnes, vues, RLS
#    20260826_views_security_invoker.sql — RLS de l'appelant sur les vues
supabase db push

# 2. Vérifier
npm run typecheck
npm run dev
```

La migration est **idempotente** (`IF NOT EXISTS`, `CREATE OR REPLACE`, `DO $$` gardés) : elle peut être rejouée sans effet de bord.

### Vérifications post-migration

```sql
SELECT * FROM v_receivables            WHERE business_id = '…';
SELECT * FROM v_product_profitability  WHERE business_id = '…' ORDER BY gross_margin DESC;
SELECT * FROM v_monthly_kpis           WHERE business_id = '…' ORDER BY period_start DESC LIMIT 6;
SELECT * FROM fn_record_exchange_rate('…', 132.50, 'manual');
```

---

## 11. Dépendances entre modules

```
lib/currency.ts
      └─ lib/margin.ts ──┬─ MarginCalculator, QuickSaleForm
                         ├─ app/actions/profitability.ts ─ PriceSimulator
                         └─ app/actions/exchangeRate.ts (alerte taux)

v_monthly_kpis ──┬─ app/actions/goals.ts ──── MonthlyGoalCard
                 ├─ lib/healthScore.ts ────── getHealthScore
                 └─ lib/insights.ts ───────── InsightsFeed
                                    └─ lib/whatsappReport.ts ─ digest hebdo

v_receivables ──┬─ app/actions/receivables.ts ─ ReceivablesPanel (/creances)
                 ├─ app/dettes/page.tsx (section « créances clients »)
                 └─ app/api/cron/daily ─── notify() (relances + stock bas)

lib/offlineQueue.ts ─┬─ QuickSaleForm (mise en file)
                     └─ OfflineSalesSync ─ createSaleAction (rejeu idempotent)

lib/plans.ts ─ lib/planFeatures.ts ─ lib/entitlements.ts (serveur)
                                   └─ CompanyContext ─ PermissionGate (client)
```

Règle d'or : **la logique métier reste dans `lib/`** (pure, testable, sans I/O), les `app/actions/` ne font que lire/écrire Supabase, les composants n'affichent. Un chiffre ne doit jamais être recalculé dans un composant.
