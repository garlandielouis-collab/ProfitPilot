# Architecture du moteur comptable ProfitPilot

## Résumé

Cette architecture transforme ProfitPilot en un moteur comptable professionnel à double entrée.
Elle aligne le flux transactionnel avec un plan comptable, génère automatiquement des écritures comptables, alimente le journal général, le grand livre, la balance de vérification, le bilan, le compte de résultat et un reporting de flux de trésorerie.

Le cœur du moteur est déjà présent dans :
- `supabase/migrations/20260526_complete_schema_v2.sql`
- `app/actions/accounting.ts`

Cette documentation décrit la conception, le modèle de données, les règles comptables et le plan d’implémentation.

---

## 1. Objectif

Toutes les transactions saisies doivent automatiquement :
1. être identifiées
2. être catégorisées
3. être classifiées comptablement
4. générer des écritures comptables
5. alimenter le journal général
6. alimenter le grand livre
7. alimenter la balance de vérification
8. alimenter les états financiers

Sans intervention manuelle.

---

## 2. Architecture globale

### Couches

1. **Source transactionnelle**
   - `sales`
   - `purchases`
   - `expenses`
   - `customer_transactions`
   - `supplier_transactions`
   - éventuellement `bank_transactions`

2. **Couche comptable**
   - `chart_of_accounts`
   - `journal_entries`
   - `journal_entry_lines`
   - `account_period_balances`
   - `accounting_periods`
   - `fiscal_years`

3. **Couche reporting**
   - vues SQL : `v_grand_livre`, `v_balance_verification`, `v_bilan`, `v_income_statement`, `v_cash_flow` (à créer)
   - fonctions TypeScript de calcul : `getTrialBalance`, `getIncomeStatement`, `getBalanceSheet`

4. **Couche IA / classification**
   - `classifyFromText()`
   - `suggestJournalEntryFromText()`
   - règles métier textuelles et mappings vers comptes comptables

---

## 3. Modèle de données comptable

### Tables principales

#### `chart_of_accounts`
- `id`
- `business_id`
- `parent_id`
- `code`
- `name`
- `name_ht`
- `account_class` (`Asset`, `Liability`, `Equity`, `Revenue`, `Expense`)
- `is_system`
- `is_active`
- `description`
- `created_at`, `updated_at`, `deleted_at`

#### `journal_entries`
- `id`
- `business_id`
- `period_id`
- `entry_number`
- `entry_date`
- `reference`
- `reference_type` (`sale`, `purchase`, `expense`, `manual`)
- `reference_id`
- `description`
- `status` (`posted`, `void`)
- `currency`
- `exchange_rate`
- `total_debit`
- `total_credit`
- `is_auto`
- `notes`
- `created_by`, `voided_by`, `voided_at`, `voided_reason`
- `created_at`, `updated_at`

#### `journal_entry_lines`
- `id`
- `journal_entry_id`
- `business_id`
- `account_id`
- `description`
- `debit_amount`
- `credit_amount`
- `currency`
- `exchange_rate`
- `base_debit`
- `base_credit`
- `created_at`

#### `account_period_balances`
- `id`
- `business_id`
- `account_id`
- `period_id`
- `opening_balance`
- `total_debit`
- `total_credit`
- `closing_balance`
- `updated_at`

#### `accounting_periods`
- `id`
- `business_id`
- `fiscal_year_id`
- `name`
- `start_date`
- `end_date`
- `is_closed`
- `closed_at`
- `closed_by`

#### `fiscal_years`
- `id`
- `business_id`
- `name`
- `start_date`
- `end_date`
- `is_closed`
- `closed_at`
- `closed_by`

### Relations clés

- `journal_entries.business_id` → `businesses.id`
- `journal_entries.period_id` → `accounting_periods.id`
- `journal_entry_lines.journal_entry_id` → `journal_entries.id`
- `journal_entry_lines.account_id` → `chart_of_accounts.id`
- `account_period_balances.account_id` → `chart_of_accounts.id`
- `account_period_balances.period_id` → `accounting_periods.id`
- `chart_of_accounts.business_id` → `businesses.id`

---

## 4. Plan comptable recommandé

### Classes comptables

- ACTIFS
  - Caisse
  - Banque
  - Comptes clients
  - Stocks
  - Fournitures
  - Équipements
  - Immobilisations

- PASSIFS
  - Comptes fournisseurs
  - Salaires à payer
  - Taxes à payer
  - Emprunts bancaires

- CAPITAUX PROPRES
  - Capital
  - Résultats non distribués

- REVENUS
  - Ventes
  - Services
  - Revenus divers

- CHARGES
  - Salaires
  - Loyer
  - Fournitures
  - Marketing
  - Internet
  - Transport
  - Intérêts
  - Charges diverses

### Compte de base existants

- `1110` Caisse
- `1120` Banque
- `1130` Comptes Clients
- `1140` Stocks
- `1150` Fournitures
- `1210` Équipements
- `2110` Comptes Fournisseurs
- `2120` Salaires à Payer
- `2130` Taxes à Payer
- `2200` Emprunts Bancaires
- `3100` Capital
- `3200` Résultats Non Distribués
- `4100` Ventes
- `4200` Services
- `4900` Revenus Divers
- `5100` Achats
- `5200` Salaires
- `5300` Loyer
- `5400` Fournitures de Bureau
- `5500` Marketing
- `5600` Internet
- `5700` Transport
- `5800` Intérêts
- `5900` Charges Diverses

---

## 5. Moteur de classification

### Règles textuelles actuelles

- `achat fournitures` → `Fournitures`
- `paiement salaire` → `Salaires`
- `paiement fournisseur` → `Comptes fournisseurs`
- `vente produit` → `Ventes`
- `encaissement client` → `Comptes clients`
- `emprunt bancaire` → `Emprunts bancaires`
- `remboursement prêt` → `Dette bancaire`
- `achat équipement` → `Immobilisation`
- `paiement loyer` → `Loyer`
- `dépôt propriétaire` → `Capital`
- `retrait propriétaire` → `Prélèvement`

### Composants IA

- `classifyFromText(text)`
- `suggestJournalEntryFromText(text, amount, currency)`

Résultat renvoyé :
- compte débit
- compte crédit
- catégorie comptable
- suggestion de libellé
- lignes d’écriture

### Algorithme

1. normaliser le texte en minuscule
2. détecter les mots-clés métier
3. associer la transaction à un compte de débit et un compte de crédit
4. produire une écriture équilibrée
5. proposer une écriture avant validation

### Exemple

Input : `Achat de fournitures de bureau 500 HTG`

Output :
- Catégorie : Fournitures
- Débit : Fournitures 500
- Crédit : Caisse 500

---

## 6. Règles comptables et flux

### Double entrée

Chaque transaction génère une écriture avec au moins deux lignes :
- un compte débité
- un compte crédité
- `total_debit == total_credit`

### Vérification automatique

- `journal_entries` inclut une contrainte `CHECK (status = 'void' OR ABS(total_debit - total_credit) < 0.001)`
- `journal_entry_lines` impose qu’une ligne soit soit débit soit crédit
- `getTrialBalance()` calcule `totalDebit`, `totalCredit` et `balanced`

### Clés opérationnelles

- Vente comptant : Débit Caisse / Crédit Ventes
- Vente crédit : Débit Clients / Crédit Ventes
- Achat payant : Débit Achats / Crédit Caisse/Banque
- Achat à crédit : Débit Achats / Crédit Fournisseurs
- Paiement fournisseur : Débit Fournisseurs / Crédit Caisse/Banque
- Salaire payé : Débit Salaires / Crédit Caisse/Banque
- Emprunt bancaire : Débit Banque / Crédit Emprunts
- Dépôt propriétaire : Débit Caisse / Crédit Capital

---

## 7. Tables de rapport

### Journal général

Source : `journal_entries` + `journal_entry_lines`

Contenu :
- date
- référence
- description
- compte débit
- compte crédit
- montant
- statut

### Grand Livre

Vue SQL : `v_grand_livre`

Chaque compte conserve :
- date
- description
- débit
- crédit
- solde cumulatif

### Balance de vérification

Vue SQL : `v_balance_verification`

Contenu :
- compte
- total débit
- total crédit
- solde

### États financiers

- Bilan : actifs / passifs / capitaux propres
- Compte de résultat : revenus / charges / résultat net
- Flux de trésorerie : opérations d’exploitation, d’investissement, de financement

---

## 8. Algorithmes de calcul

### Bilan

Pour chaque ligne de journal :
- Actifs = somme(débit - crédit)
- Passifs = somme(crédit - débit)
- Capitaux propres = somme(crédit - débit)

### Compte de résultat

Pour chaque ligne de journal :
- Revenus = somme(crédit - débit) des comptes de classe `Revenue`
- Charges = somme(débit - crédit) des comptes de classe `Expense`
- Résultat net = Revenus - Charges

### Flux de trésorerie

À implémenter avec `bank_transactions` + écritures de trésorerie :
- opérations d’exploitation
- investissements
- financement

---

## 9. Implémentation TypeScript recommandée

### Fichier principal
- `app/actions/accounting.ts`

### Fonctions clés
- `createJournalEntry(payload)`
- `recordSaleEntry()`
- `recordPurchaseEntry()`
- `recordExpenseEntry()`
- `classifyFromText(text)`
- `suggestJournalEntryFromText(text, amount, currency)`
- `getChartOfAccounts()`
- `getJournalEntries()`
- `getTrialBalance()`
- `getIncomeStatement(year, month?)`
- `getBalanceSheet()`

### Actions métier connectées
- `app/actions/sales.ts` → `recordSaleEntry(...)`
- `app/actions/purchases.ts` → `recordPurchaseEntry(...)`
- `app/actions/expenses.ts` → `recordExpenseEntry(...)`

### Intégration IA
- exposer `suggestJournalEntryFromText()` en API ou composant React
- afficher la suggestion avant validation finale
- autoriser la modification manuelle de la suggestion

---

## 10. Plan d’implémentation

1. **Schema**
   - déployer `supabase/migrations/20260526_complete_schema_v2.sql`
   - vérifier que `chart_of_accounts`, `journal_entries`, `journal_entry_lines`, `accounting_periods`, `fiscal_years`, `account_period_balances` existent

2. **Seed du plan comptable**
   - appeler `fn_seed_chart_of_accounts(business_id)` après création de business
   - ou utiliser `init_chart_of_accounts` si déjà en place

3. **Créer l’engagement automatique**
   - intégrer `recordSaleEntry` dans la création de ventes
   - intégrer `recordPurchaseEntry` dans la création d’achats
   - intégrer `recordExpenseEntry` dans la création de dépenses

4. **Ajouter la classification IA**
   - utiliser `classifyFromText` pour proposer une écriture
   - sur le formulaire, pré-remplir le journal suggestion

5. **Construire les rapports**
   - ajouter des pages / vues PDF pour : journal général, grand livre, balance, bilan, compte de résultat, flux de trésorerie
   - utiliser les vues SQL existantes : `v_grand_livre`, `v_balance_verification`, `v_bilan`

6. **Audit & validation**
   - tester la balance de vérification après chaque transaction
   - comparer le bilan aux totaux passifs + capitaux propres
   - ajouter contrôles de cohérence `total_debit == total_credit`

7. **Améliorations**
   - tracker les écritures de TVA
   - gestion multi-devises réelle avec conversions
   - automatisation des amortissements
   - comptabilité analytique / centres de coût

---

## 11. Fichiers SQL clés

- `supabase/migrations/20260526_complete_schema_v2.sql` : schéma complet du moteur comptable
- `supabase_accounting_engine.sql` : fonctions et vues SQL du moteur
- `supabase/schema.sql` : schéma principal de la base, à étendre avec le moteur

---

## 12. Recommandations spécifiques

- Garder `journal_entries` et `journal_entry_lines` comme source de vérité comptable.
- Ne jamais inscrire une transaction métier directement dans un résultat financier sans passer par le journal.
- Toute modification d’une transaction doit être historisée et répercutée dans le grand livre.
- Conserver le découplage entre la logique métier (ventes, achats, dépenses) et la logique comptable (écritures).
- Déployer les vues SQL en production pour servir les rapports financiers et les tests d’équilibrage.
