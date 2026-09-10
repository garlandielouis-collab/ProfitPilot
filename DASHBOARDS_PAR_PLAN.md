# Trois offres, trois tableaux de bord

Exécution du document **« ProfitPilot — Refonte des dashboards par plan »** (61 points).

Ce fichier est le §61 du document : l'audit du dépôt existant, l'architecture
retenue, et le journal de ce qui a été implémenté. Il complète
`REFONTE_DESIGN.md` (qui suit l'audit de design) et `CONSTITUTION_VISUELLE.md`
(qui pose les règles visuelles) — aucune règle n'est réécrite ici, elles sont
citées.

---

## 1. Audit de l'existant

### Ce qui était déjà là, et qui tient

| Sujet | État avant | Verdict |
|---|---|---|
| Registre des offres | `lib/planFeatures.ts` — 60 features, 3 offres, quotas, `requiredPlanFor()` | **Solide.** Il manquait seulement la notion de *niveau de dashboard* (§57). |
| Gating serveur | `lib/entitlements.ts` — `assertFeature()`, `hasFeature()`, aperçu d'offre | **Solide.** §57 « vérifié côté serveur » était déjà tenu. |
| Permissions RBAC | `lib/rbac.ts` — 7 rôles, 33 permissions | **Solide.** §52 « Plan + Permission = accès réel » était possible, mais le dashboard ne l'appliquait pas. |
| Contexte entreprise | `contexts/CompanyContext.tsx` + `getBusinessContext()` | **Solide.** §53 multi-entreprise déjà cadré par `business_id`. |
| Design system | `components/ds/` — 13 briques, tokens Tailwind | **Solide.** §3 « conserver le design system » est un non-sujet : tout part de là. |
| Données | 12 vues SQL (`v_monthly_kpis`, `v_receivables`, `v_product_profitability`, `v_customer_rankings`, `v_top_products_margin`…) | **Riche.** Aucune table nouvelle n'est nécessaire (voir §4). |
| États vides | `ds/EmptyState` — `FirstRun` / `NoResult` | **Conforme au §43** — pédagogiques, avec l'action. |
| Fausses données | purgées (vague 3 de la refonte design) | **Conforme au §51.** |

### Ce qui manquait

1. **Un seul dashboard pour trois offres.** `app/dashboard/page.tsx` (493 l.)
   affichait la même page à tout le monde, avec deux `PlanGate` qui
   remplaçaient deux cartes par un *teaser*. C'est exactement ce que le §1
   interdit : « il ne faut PAS simplement ajouter davantage de widgets ».
2. **Pas de niveau de dashboard** (§57). Rien ne traduisait offre → niveau.
3. **Aucune hiérarchie « quoi / pourquoi / que faire »** (§2). Les indicateurs
   donnaient la valeur et la variation ; la cause et l'action manquaient.
4. **Aucun cadrage par permission** (§52) : un caissier voyait le chiffre
   d'affaires et la trésorerie.
5. **Aucune adaptativité** (§42) : le bloc Stock s'affichait sans produit, et
   rien ne masquait Boutique ou Équipe quand ils n'existent pas.
6. **Aucune prévision** (§31), aucune **opportunité** (§32), aucun
   **Daily Brief** (§40), aucune **priorisation à 3** (§29).
7. **Six sections chargées d'un bloc** — pas de chargement différé des blocs
   secondaires (§49), pas de squelettes calqués sur la structure réelle (§50).
8. **La période** était mois / trimestre / semestre. Le §4 demande
   aujourd'hui / cette semaine / ce mois, et les §13 et §26 une comparaison.

---

## 2. Architecture retenue

> §55 : « Ne pas créer trois applications. » Un socle de briques partagées,
> trois compositions. §56 : une arborescence `shared/ esansyel/ kwasans/ elit/`.

```
lib/dashboardLevel.ts              le plan décide du niveau et des modules (§57)
components/dashboard/
  range.ts                         périodes + comparaisons (§4, §13, §26)
  forecast.ts                      régression linéaire + confiance (§31), pur
  narrative.ts                     chiffres → phrases bilingues (§2, §58, §59)
  shared/                          les briques des trois offres (§55)
    KpiCard.tsx    TrendChart.tsx   HealthScore.tsx   AlertCard.tsx
    InsightCard.tsx GoalProgress.tsx RecommendationCard.tsx
    ExecutiveSummary.tsx ForecastChart.tsx QuickActions.tsx
    TopProducts.tsx  ModuleSection.tsx (section + squelette + « pas encore
                                        assez de données », §42/§43/§50)
  esansyel/EsansyelDashboard.tsx   « Je comprends mon business »
  kwasans/KwasansDashboard.tsx     « Je pilote mon business »
  elit/ElitDashboard.tsx           « Business Command Center »
app/actions/dashboard.ts           UN aller-retour serveur par niveau (§49)
app/dashboard/page.tsx             orchestre : niveau → composition
```

### Le contrat serveur / client

**Le serveur renvoie des nombres, le client écrit les phrases.** C'est la règle
déjà tenue par `components/dashboard/insights.ts` : les libellés passent par
`t({ fr, ht })`, donc ils ne peuvent pas venir d'une server action. Un texte
français figé dans une réponse serveur serait intraduisible en créole — et le
créole est la moitié du produit.

Conséquence : `narrative.ts` transforme les nombres en phrases côté client, dans
les deux langues, avec la **profondeur décisionnelle du §58** (constat pour
Esansyel · recommandation pour Kwasans · raisonnement pour Elit).

### Le niveau de dashboard (§57)

```
Esansyel (Ti Machann)      → basic       comprendre
Kwasans  (Business Pilot)  → advanced    piloter
Elit     (Expert)          → executive   optimiser et développer
```

Le niveau ne se lit **jamais** en dur dans un composant : `dashboardLevel()`
le dérive de la clé d'offre, et `moduleEnabled()` répond « ce module est-il
disponible ? » en croisant **trois** conditions — l'offre (§57), la permission
RBAC (§52) et la présence réelle de données (§42).

### Le cadrage par permission (§52)

`Plan + Permission = accès réel.` Concrètement, `getDashboardData()` ne renvoie
`finance: null` que si `reports:read` manque — le caissier reçoit un tableau de
bord sans chiffre d'affaires, sans profit, sans trésorerie, **sans que le
serveur ait seulement lu ces lignes**. Le masquage n'est pas cosmétique.

---

## 3. Les briques partagées (§55)

| Brique | Esansyel | Kwasans | Elit |
|---|:--:|:--:|:--:|
| `KpiCard` | ● | ● | ● |
| `TrendChart` | ● | ● | ● |
| `AlertCard` | ● | ● | ● |
| `QuickActions` | ● | ● | · |
| `TopProducts` | ● | ● | ● |
| `InsightCard` | ● | ● | ● |
| `HealthScore` | · | ● | ● |
| `GoalProgress` | · | ● | ● |
| `RecommendationCard` | · | ● | ● |
| `ExecutiveSummary` | · | · | ● |
| `ForecastChart` | · | · | ● |

Onze briques, trois compositions. Aucune n'est dupliquée par offre.

---

## 4. Base de données

**Aucune table nouvelle.** Tout ce que les 61 points demandent se lit dans le
schéma existant :

| Besoin du document | Source |
|---|---|
| §5 §14 §27 KPI | `sales`, `expenses`, `purchases`, `v_monthly_kpis` |
| §16 §28 Business Health | `lib/healthScore.ts` + `financial_health_snapshots` |
| §18 §34 Inventory | `products`, `low_stock_alerts`, `sale_items`, `v_product_profitability` |
| §19 §33 Customers | `customers`, `v_customer_rankings` |
| §20 §37 Team | `business_members`, `sales.created_by`, `profiles` |
| §21 §38 Goals | `business_goals` + `getGoalProgress()` |
| §31 Forecast | `v_monthly_kpis` (12 mois d'historique) |
| §36 Online Store | `store_settings`, `orders` |
| §8 §29 Alerts | `v_receivables`, `low_stock_alerts` |

Aucune migration à appliquer à la main.

---

## 5. Risques identifiés, et ce qui les tient

| Risque | Parade |
|---|---|
| **Trois dashboards = trois dettes.** | §55 tenu par construction : les compositions n'ont pas de style propre, elles n'assemblent que des briques de `shared/`. |
| **Elit devient un mur de 20 cartes.** | §44 : progressive disclosure. Les blocs lourds sont des sections dépliables, fermées par défaut sauf les trois priorités. |
| **La prévision passe pour une certitude.** | §31 : `forecast.ts` renvoie toujours une confiance et le nombre de mois observés ; sous 4 mois d'historique il ne renvoie **rien** et l'écran affiche « pas encore assez de données ». |
| **Un chiffre sans source.** | §51 : chaque `KpiCard` porte sa formule, écrite une fois dans `narrative.ts`. |
| **Régression sur l'existant.** | Les composants réutilisés (`CashflowChart`, `LedgerSection`, `StockSection`, `HealthCard`) ne sont pas modifiés. `CashflowChart` sert aussi à `/analytics` — vérifié avant de toucher quoi que ce soit. |
| **Écran lent sur connexion haïtienne.** | §49 : un seul aller-retour pour le socle, les modules secondaires en second lot ; squelettes calqués (§50). |

---

## 6. Plan d'implémentation — fait

| Étape | Fichier | Points couverts | État |
|---|---|---|---|
| 1 | `lib/dashboardLevel.ts` | §42, §52, §57, §58 | **fait** |
| 2 | `components/dashboard/range.ts` | §4, §13, §26 | **fait** |
| 3 | `app/actions/dashboard.ts` | §49, §51, §52, §53 | **fait** |
| 4 | `forecast.ts` + `narrative.ts` | §2, §29, §31, §32, §39, §40, §51, §58, §59 | **fait** |
| 5 | `shared/` — 13 briques | §55 | **fait** |
| 6 | `esansyel/EsansyelDashboard.tsx` | §4 → §11 | **fait** |
| 7 | `kwasans/KwasansDashboard.tsx` | §12 → §24 | **fait** |
| 8 | `elit/ElitDashboard.tsx` | §25 → §41 | **fait** |
| 9 | `app/dashboard/page.tsx` | l'orchestrateur | **fait** |
| 10 | `tsc --noEmit` + `next build` | — | **vert** |

---

## 7. Les décisions qui méritent d'être écrites

Un document de 61 points ne peut pas anticiper tout ce que le code lui oppose.
Voici les quatre endroits où la mise en œuvre a tranché, et pourquoi.

### 7.1 · Un seul sélecteur de période sur Esansyel (§4 contre §6)

Le §4 demande « Aujourd'hui · Cette semaine · Ce mois » en tête d'écran ; le §6
demande « 7 jours · 30 jours · 3 mois » sur le graphique. Deux contrôles de
période sur un même écran posent au marchand, à chaque ouverture, la question
« laquelle des deux commande ? ».

Les deux listes disent presque la même chose. Il n'en reste donc **qu'un**,
celui du §4, avec la profondeur du §6 en quatrième position : *aujourd'hui ·
cette semaine · ce mois · trois mois*.

### 7.2 · PilotAI sur Esansyel : la lecture est offerte, la conversation non

Le §10 place une section PilotAI sur Esansyel. Or `ai_assistant` commence à
Kwasans dans `planFeatures.ts`, et `/api/ai/chat` renvoie 403 en dessous.

La section existe donc bien, avec sa phrase — celle-ci est **calculée par des
règles déterministes** (`narrative.ts`), elle ne coûte aucun jeton et n'a aucune
raison d'être payante. Seul le bouton change de libellé : « Découvrir PilotAI »
au lieu de « Demander à PilotAI », et il mène à l'écran de verrou qui explique
et vend. Un bouton qui promettrait une réponse pour la refuser en 403 vaudrait
moins que pas de bouton.

### 7.3 · L'alerte de taux de change, réintégrée

Elle ne figure dans aucun des 61 points, et l'ancien tableau de bord la portait
via `<PilotageBand/>`. C'est le piège n° 1 du marchand haïtien : on achète en
dollars, on vend en gourdes, et le prix de vente ne suit pas le taux. Une
prévision (§31) posée sur un taux périmé serait une prévision fausse.

Elle est donc **remise en tête de Kwasans et d'Elit**, avant les indicateurs,
parce qu'elle les périme. Elle reste gardée par `rate_alerts`.

### 7.4 · Les mouvements quittent le tableau de bord

L'ancien écran finissait par un journal des mouvements (`LedgerSection`). Les
trois structures du document — §11, §24, §41 — sont explicites et n'en
contiennent aucun : le tableau de bord répond à « comment ça va », pas à « que
s'est-il passé ligne à ligne ».

Le journal n'est pas supprimé du produit : `/sales`, `/expenses`, `/purchases`
et `/rapports` le portent, avec l'export. Le composant `LedgerSection` reste en
place, intact, prêt à resservir.

### 7.5 · Le score garde ses quatre piliers, pas cinq (§28)

Le §28 demande cinq dimensions : Financial · Sales · Inventory · Customers ·
Operations. `lib/healthScore.ts` en calcule quatre : marge, régularité,
trésorerie, recouvrement.

Le score n'est pas seulement affiché : il est **historisé** dans
`financial_health_snapshots`, mois après mois, et c'est cet historique qui
donne la pente. Changer la formule aujourd'hui rendrait les mois passés
incomparables aux mois à venir — un score de santé dont l'échelle bouge ne vaut
plus rien.

Les quatre piliers existants couvrent d'ailleurs quatre des cinq dimensions
(Financial, Sales via la régularité, Cash, Customers via le recouvrement). Le
cinquième — Operations — n'a pas encore de mesure honnête dans le schéma. **À
faire séparément** : concevoir la cinquième mesure, puis migrer le score et son
historique en une fois.

### 7.6 · Ce qui n'est pas fait, et se voit

- **§46 · « Customize dashboard »** — le document l'écrit au conditionnel
  (« Kwasans et Elit *peuvent* permettre »). La structure par défaut a été
  traitée en premier, comme le §46 l'exige lui-même (« le système doit
  conserver une structure par défaut excellente »). La personnalisation reste
  à construire ; elle demande une table de préférences par utilisateur.
- **§36 · Visiteurs, taux de conversion, paniers abandonnés** — ces trois
  mesures viennent de fonctions SQL (`store_funnel`, `store_abandoned_carts`)
  qui n'existent pas sur toutes les bases (`measurementReady` de
  `storeInsights.ts`). Le bloc Boutique affiche donc ce qui est mesurable
  partout : commandes payées, ventes en ligne, panier moyen, commandes en
  attente. Annoncer « 0 visiteur » à un marchand qui en a eu quarante serait
  un chiffre faux, et ce produit s'interdit les chiffres faux.
- **§45 · Le drill-down des indicateurs** ouvre l'écran concerné
  (`/sales`, `/rapports`, `/rentabilite`) plutôt qu'un panneau dépliant sur
  place. Le détail par jour, catégorie et produit y existe déjà : le recréer
  dans le tableau de bord ferait deux endroits pour une même réponse.
- **§13 et §26 · Le sélecteur d'entreprise** n'est pas dupliqué dans l'en-tête :
  il vit dans `AppShell` et suit le marchand sur tous les écrans. L'en-tête, lui,
  affiche le **nom de l'entreprise active** dès qu'il y en a plusieurs (§53).

### Ce qui a bougé hors du chantier

Une seule ligne, dans `app/actions/storeInsights.ts` (fichier antérieur, non
suivi) : un `as HealthProduct[]` que TypeScript refusait bloquait `next build`
pour tout le dépôt. Passé en `as unknown as HealthProduct[]`, avec le commentaire
qui dit pourquoi c'est sûr. Aucun comportement modifié.
