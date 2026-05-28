# 🏗️ ProfitPilot — Architecture Backend v2.0
> Production-ready | Fintech-grade | Supabase PostgreSQL 15+

---

## 📐 Vue d'ensemble

```
┌──────────────────────────────────────────────────────────────────────┐
│                         PROFITPILOT BACKEND                          │
│                                                                      │
│  ┌─────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐           │
│  │  AUTH   │  │   CRM    │  │INVENTORY │  │  ACCOUNTING│           │
│  │ Supabase│  │Customers │  │ Products │  │ Double-    │           │
│  │  Auth   │  │Suppliers │  │Warehouses│  │  Entry     │           │
│  └────┬────┘  └────┬─────┘  └────┬─────┘  └─────┬──────┘           │
│       │            │             │               │                  │
│  ┌────▼────────────▼─────────────▼───────────────▼──────┐           │
│  │              BUSINESS TENANT (business_id)            │           │
│  │         Toutes les tables isolées par tenant          │           │
│  └───────────────────────────────────────────────────────┘           │
│                                                                      │
│  ┌─────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐           │
│  │  SALES  │  │PURCHASES │  │EXPENSES  │  │  BANKING   │           │
│  │POS+Inv. │  │ Supplier │  │Recurring │  │ Cash+Bank  │           │
│  │Payments │  │   AP     │  │Categories│  │ Reconcile  │           │
│  └─────────┘  └──────────┘  └──────────┘  └────────────┘           │
│                                                                      │
│  ┌─────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐           │
│  │PILOT AI │  │ REPORTS  │  │  NOTIF.  │  │SUBSCRIPTIONS│          │
│  │Insights │  │ PDF Gen  │  │ Alerts   │  │ Plans+Billing│         │
│  │Chat Bot │  │Snapshots │  │ Prefs    │  │  HTG + USD  │          │
│  └─────────┘  └──────────┘  └──────────┘  └────────────┘           │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 📊 Modules & Tables (55 tables)

### § 1 — Authentication & Businesses
| Table | Rôle |
|---|---|
| `profiles` | Extend auth.users (nom, avatar, langue, timezone) |
| `businesses` | Tenant principal — tout isolé par `business_id` |
| `business_members` | Map user ↔ business avec rôle (owner/admin/cashier/...) |
| `invitations` | Invitations par email avec token + expiry |
| `onboarding_states` | Machine à états d'onboarding |

### § 2 — Rôles & Permissions
| Table | Rôle |
|---|---|
| `permissions` | Registre de permissions (`sales.create`, `reports.view`, ...) |
| `custom_roles` | Rôles personnalisés par business |
| `custom_role_permissions` | Permissions assignées aux rôles |
| `member_permission_overrides` | Overrides individuels (grant/revoke) |

### § 3 — CRM Clients
| Table | Rôle |
|---|---|
| `customers` | Fiche client avec solde, crédit, lifetime value |
| `customer_addresses` | Adresses multiples par client |
| `customer_notes` | Notes CRM par interaction |

### § 4 — Fournisseurs
| Table | Rôle |
|---|---|
| `suppliers` | Fournisseurs avec AP balance + conditions de paiement |
| `supplier_contacts` | Contacts multiples par fournisseur |

### § 5 — Inventaire
| Table | Rôle |
|---|---|
| `units_of_measure` | Unités globales (pcs, kg, L, ctn...) |
| `product_categories` | Catégories hiérarchiques |
| `products` | Catalogue SKU avec prix achat/vente, barcode |
| `product_variants` | Variantes (couleur, taille, saveur...) |
| `warehouses` | Entrepôts / points de vente |
| `warehouse_stock` | Stock actuel par produit/entrepôt |
| `inventory_movements` | **Ledger immuable** de chaque mouvement stock |
| `stock_adjustments` | Ajustements manuels avec raison + approbation |
| `low_stock_alerts` | Alertes stock bas automatiques |

### § 6 — Ventes
| Table | Rôle |
|---|---|
| `sales` | Header de vente (une ligne = une transaction) |
| `sale_items` | Lignes articles avec COGS snapshot |
| `sale_payments` | Paiements partiels / multiples par vente |
| `sale_returns` | Retours clients |
| `sale_return_items` | Lignes de retour |

### § 7 — Achats
| Table | Rôle |
|---|---|
| `purchases` | PO header fournisseur |
| `purchase_items` | Lignes articles avec prix achat |
| `purchase_payments` | Paiements AP (comptabilité fournisseurs) |
| `purchase_returns` | Retours fournisseurs |
| `purchase_return_items` | Lignes de retour fournisseur |

### § 8 — Dépenses
| Table | Rôle |
|---|---|
| `expense_categories` | Catégories avec lien compte comptable |
| `expenses` | Dépenses avec pièce jointe + statut approbation |
| `recurring_expenses` | Templates dépenses récurrentes |

### § 9 — Comptabilité (Double Entrée)
| Table | Rôle |
|---|---|
| `fiscal_years` | Exercices comptables par business |
| `accounting_periods` | Périodes mensuelles (ouvert/fermé) |
| `chart_of_accounts` | Plan Comptable Général adapté Haïti |
| `journal_entries` | En-têtes d'écritures — DOIVENT balancer (DR=CR) |
| `journal_entry_lines` | Lignes débit/crédit |
| `account_period_balances` | Soldes par compte/période (running totals) |

### § 10 — Banque & Trésorerie
| Table | Rôle |
|---|---|
| `bank_accounts` | Comptes bancaires, caisses, wallets mobiles |
| `bank_transactions` | Historique transactions avec running balance |
| `cash_registers` | Sessions caisse POS (ouverture/fermeture) |
| `cash_movements` | Entrées/sorties dans une session caisse |
| `money_transfers` | Virements entre comptes internes |
| `bank_reconciliations` | Rapprochements bancaires |

### § 11 — Rapports Financiers
| Table | Rôle |
|---|---|
| `financial_reports` | Rapports générés (P&L, Bilan, Cashflow...) |
| `report_snapshots` | Snapshots historiques pour comparaisons |

### § 12 — IA (Pilot AI)
| Table | Rôle |
|---|---|
| `ai_conversations` | Sessions de chat avec contexte business |
| `ai_messages` | Messages user/assistant avec token count |
| `ai_insights` | Insights proactifs générés (anomalies, tendances) |
| `ai_recommendations` | Recommandations actionnables |

### § 13 — Notifications
| Table | Rôle |
|---|---|
| `notifications` | Toutes les notifications (par user ou broadcast) |
| `notification_preferences` | Préférences par user/business |

### § 14 — Abonnements & Facturation
| Table | Rôle |
|---|---|
| `plans` | Plans Ti Machann / Business Pilot / Expert |
| `business_subscriptions` | Abonnement actif par business |
| `billing_invoices` | Factures ProfitPilot → Business |
| `billing_payments` | Paiements reçus (MonCash, bank, card...) |

### § 15 — Fichiers
| Table | Rôle |
|---|---|
| `uploads` | Référence Supabase Storage (reçus, PDFs, logos...) |

---

## 🔒 Modèle de Sécurité (RLS)

### Hiérarchie des rôles
```
owner > admin > accountant > inventory_manager > cashier > viewer
```

### Matrice d'accès par module
| Module | owner | admin | accountant | inv_mgr | cashier | viewer |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Sales | CRUD | CRUD | R | R | CR | R |
| Purchases | CRUD | CRUD | CRUD | R | — | R |
| Expenses | CRUD | CRUD | CRUD | — | — | R |
| Inventory | CRUD | CRUD | R | CRUD | R | R |
| Accounting | CRUD | CRUD | CRUD | — | — | R |
| Reports | CRUD | CRUD | CRUD | — | — | R |
| Team | CRUD | CRUD | — | — | — | — |
| Settings | CRUD | CRUD | — | — | — | — |

### Fonctions RLS helpers
```sql
fn_is_member(business_id)            -- user est membre actif
fn_get_role(business_id)             -- rôle de l'user
fn_has_role(business_id, 'admin',…)  -- vérifie un ou plusieurs rôles
```

---

## ⚡ Automatisations (Triggers)

| Trigger | Table source | Action |
|---|---|---|
| `trg_updated_at_*` | Tous | Met à jour `updated_at` automatiquement |
| `trg_inventory_movement` | `inventory_movements` | Màj `warehouse_stock` + crée alerte si stock bas |
| `trg_sale_item_stock` | `sale_items` | Crée mouvement stock `-qty` à la vente |
| `trg_sale_payment_update` | `sale_payments` | Recalcule `paid_amount`, `payment_status`, solde client |
| `trg_purchase_payment_update` | `purchase_payments` | Recalcule AP purchases + solde fournisseur |
| `trg_auto_journal_sale` | `sales` | Écritures double-entrée automatiques DR/CR |
| `trg_auto_journal_expense` | `expenses` | Écritures double-entrée automatiques |
| `on_auth_user_created` | `auth.users` | Crée `profiles` automatiquement |

---

## 📈 Vues Analytics (SQL, pas JavaScript)

| Vue | Usage |
|---|---|
| `v_dashboard_kpi` | KPI mois/année courant (revenue, expenses, profit) |
| `v_top_products` | Top produits par revenus + marge |
| `v_customer_rankings` | Classement clients par LTV + solde dû |
| `v_supplier_debt_summary` | AP dettes fournisseurs + ancienneté |
| `v_stock_valuation` | Valeur stock coût/retail + alertes stock bas |
| `v_monthly_pnl` | P&L mensuel agrégé |

---

## 🏦 Comptabilité (Plan Comptable Haïti)

### Comptes clés
```
5310  Caisse HTG          → Actif
5320  Caisse USD          → Actif
5110  Banque HTG          → Actif
5121  MonCash             → Actif
4110  Clients             → Actif (AR)
3700  Stock marchandises  → Actif
4010  Fournisseurs        → Passif (AP)
4450  TVA/TCA collectée   → Passif
7010  Ventes              → Revenue
6010  Achats marchandises → Expense (COGS)
6410  Salaires            → Expense
```

### Exemple écriture vente Cash
```
DR 5310  Caisse HTG         5,000 HTG
  CR 7010  Ventes              5,000 HTG
(débit = crédit = équilibre)
```

### Exemple écriture vente à crédit
```
DR 4110  Clients             5,000 HTG
  CR 7010  Ventes              5,000 HTG
```

---

## 🚀 Démarrage rapide

### 1. Appliquer le schéma
```sql
-- Dans Supabase Dashboard → SQL Editor
-- Coller le contenu de: supabase/migrations/20260526_complete_schema_v2.sql
```

### 2. Seeder le plan comptable pour un business
```sql
SELECT fn_seed_chart_of_accounts('your-business-id-here');
```

### 3. Créer les buckets Supabase Storage
```
product-images   → public
expense-receipts → private (authenticated)
invoice-pdfs     → private (authenticated)
business-logos   → public
```

### 4. Variables d'environnement
```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

---

## 📐 Conventions

| Convention | Valeur |
|---|---|
| PK | `UUID DEFAULT gen_random_uuid()` |
| Timestamps | `TIMESTAMPTZ NOT NULL DEFAULT NOW()` |
| Soft delete | `deleted_at TIMESTAMPTZ NULL` (NULL = actif) |
| Montants | `NUMERIC(20,4)` — 4 décimales, 20 chiffres max |
| Taux | `NUMERIC(10,6)` — taux de change, pourcentages |
| Snapshots | Données copiées au moment de la transaction (ne pas JOIN) |
| Tenant key | `business_id UUID` sur toutes les tables de données |
| Indexes | FK + colonnes filtrées fréquemment + colonnes de date |

---

*Architecture conçue pour rivaliser avec QuickBooks, Zoho Books, et Odoo — adapté au contexte haïtien (HTG/USD, MonCash, Natcash).*
