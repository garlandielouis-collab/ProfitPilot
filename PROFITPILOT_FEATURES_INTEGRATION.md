# ProfitPilot — Intégration des fonctionnalités (9 diagnostics + 7 bonus)

Guide technique d'intégration du document stratégique produit dans le code existant.
Pour chaque module : **ce qui existait déjà**, **ce qui a été ajouté**, **comment le brancher**.

Migration SQL : [`supabase/migrations/20260821_profitpilot_features.sql`](supabase/migrations/20260821_profitpilot_features.sql)
Statut typecheck : `npm run typecheck` ✅

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
| Page | [`app/creances/page.tsx`](app/creances/page.tsx) | Écran Créances (ajouté à la nav Finances) |

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

### À brancher
1. Dans le formulaire produit (`app/products/ProductsClient.tsx`) : ajouter les 4 champs de frais + `<MarginCalculator initial={...} onApplyPrice={...} />`.
2. Dans le dashboard : appeler `refreshRateWithAlert()` au montage (1×/jour) et afficher un bandeau si `shouldAlert`.

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

### Améliorations proposées sur l'existant
1. **Dashboard** : les `MOCK_CASHFLOW` / `MOCK_LEDGER` / `MOCK_PRODUCTS` servent de repli quand la requête ne renvoie rien — un compte vide affiche donc de fausses ventes. Remplacer par un état vide explicite (« Enregistrez votre première vente ») : la confiance dans les chiffres est le cœur du produit.
2. **Découper `app/dashboard/page.tsx`** en sections (`<CashflowSection/>`, `<LedgerSection/>`, `<HealthSection/>`) : à 1 780 lignes, chaque modification est risquée.
3. **Score de santé** : `computeHealthScore()` du dashboard est local et duplique la logique. Utiliser `lib/healthScore.ts` (4 piliers, commentaires en langage marchand) et `getHealthScore()` pour l'historisation.

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

### À brancher
- Faire pointer la section « créances clients » de `/dettes` vers `v_receivables` pour supprimer le calcul d'échéance en JS, ou rediriger vers `/creances`.
- Le rappel automatique (« l'app prévient le marchand ») : cron quotidien → `listReceivables()` → `notify()` pour les statuts `due_soon` / `overdue`. La table `notifications` existe déjà.

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

### À brancher
Dans `ExpensesPage`, ajouter un sélecteur à deux boutons (Business / Personnel) + un curseur `business_share_pct` visible seulement si `mixed`. Puis passer `scope` dans `ExpensePayload` → `upsertExpense`.

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

> ⚠️ Point de sécurité : avant cet ajout, le gating n'existait qu'en UI. Un appel direct de server action contournait l'offre. Toutes les nouvelles actions appellent `assertFeature()` ; il reste à en équiper les actions payantes existantes (`app/actions/ai.ts`, `reports.ts`, `stores.ts`, `employees.ts`).

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
| 1 | Rapport hebdo WhatsApp | `buildWeeklyReport()` → texte + `wa.me`, journalisé dans `report_deliveries` | Cron dimanche 19 h + API WhatsApp Business pour l'envoi automatique |
| 2 | Simulateur de prix | `simulateProductPrice()` + `<PriceSimulator />`, 3 niveaux d'élasticité | Brancher sur la fiche produit |
| 3 | Score de santé | `lib/healthScore.ts` + `getHealthScore()` (snapshot mensuel) + `getHealthHistory()` | Remplacer le score local du dashboard |
| 4 | Mode hors-ligne | `next-pwa` déjà configuré + `components/RegisterSW.tsx` | File d'attente des ventes hors-ligne (IndexedDB) puis rejeu à la reconnexion — voir §9 |
| 5 | Export crédit / microfinance | `getCreditFile(12)` : 12 mois de CA/marge, hors dépenses personnelles, + score | Rendu PDF via `react-to-print` (déjà en dépendance) |
| 6 | Alerte de stock bas | Table `low_stock_alerts` existante + `products.reorder_point` ajouté + insight `low-stock-*` | Trigger SQL sur `warehouse_stock` → `notifications` |
| 7 | Comparaison mois/mois | `v_monthly_kpis` + `getMonthComparison()` : MoM **et** YoY | Graphe comparatif dans `/analytics` |

### §9 — File d'attente hors-ligne (bonus 4)

Le PWA sert déjà les assets hors-ligne, mais une vente saisie sans réseau est perdue. Schéma recommandé :

```ts
// 1. Échec réseau → on met en file dans IndexedDB
await queueSale(payload);                    // idb: store 'pending_sales'
// 2. Au retour du réseau
window.addEventListener('online', flushQueue);
// 3. flushQueue() rejoue createSaleAction() dans l'ordre,
//    avec une clé d'idempotence (uuid client) stockée dans sales.metadata
//    pour qu'un double rejeu ne crée pas deux ventes.
```
La clé d'idempotence est le point critique : sans elle, un rejeu partiel duplique le chiffre d'affaires.

---

## 10. Ordre d'application

```bash
# 1. Migration (Supabase SQL Editor ou CLI)
supabase db push        # ou copier/coller 20260821_profitpilot_features.sql

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

v_receivables ──── app/actions/receivables.ts ─ ReceivablesPanel (/creances)

lib/plans.ts ─ lib/planFeatures.ts ─ lib/entitlements.ts (serveur)
                                   └─ CompanyContext ─ PermissionGate (client)
```

Règle d'or : **la logique métier reste dans `lib/`** (pure, testable, sans I/O), les `app/actions/` ne font que lire/écrire Supabase, les composants n'affichent. Un chiffre ne doit jamais être recalculé dans un composant.
