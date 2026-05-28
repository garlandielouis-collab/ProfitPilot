# ProfitPilot — Architecture Base de Données
> PostgreSQL 15+ · Supabase · Multi-tenant SaaS · Fintech ERP Grade

---

## 📁 Fichiers à appliquer (dans l'ordre)

| Ordre | Fichier | Description |
|-------|---------|-------------|
| 1 | `schema.sql` | ⚠️ Schéma original (déprécié) |
| 2 | `migrations/20260526_complete_schema_v2.sql` | ✅ **BASE PRINCIPALE** — 55+ tables, 12 ENUMs, triggers, RLS |
| 3 | `migrations/20260526_schema_v3_completion.sql` | ✅ **COMPLETION** — 10 tables manquantes + triggers stock |
| 4 | `migrations/20260526_accounting_engine_v4.sql` | ✅ **MOTEUR COMPTABLE** — 20 fonctions, 5 triggers, 3 vues |
| 5 | `migrations/20260526_accounting_engine_v4_supplemental.sql` | ✅ **COMPTABLE v4.1** — Paie, virements, retours, aging, clôture |

**Appliquer dans l'ordre sur un projet Supabase vierge.**
**Après v2+v3: `SELECT fn_seed_chart_of_accounts('<business_id>');`**

---

## 🗺️ Vue d'ensemble des modules

```
┌─────────────────────────────────────────────────────────────────┐
│                        PROFITPILOT ERP                          │
├──────────────┬──────────────┬──────────────┬────────────────────┤
│  AUTH (§3)   │  RBAC (§4)   │  CRM (§5)    │  SUPPLIERS (§6)    │
│  profiles    │  permissions │  customers   │  suppliers         │
│  businesses  │  custom_roles│  cust_addr   │  supp_contacts     │
│  biz_members │  role_perms  │  cust_notes  │  supp_tx ← NEW     │
│  invitations │  member_ovrd │  cust_tx ←NEW│                    │
├──────────────┴──────────────┼──────────────┴────────────────────┤
│       INVENTORY (§7)        │         SALES ENGINE (§8)         │
│  products  warehouses       │  sales        sale_items          │
│  prod_categories  variants  │  sale_payments sale_returns       │
│  warehouse_stock            │  sale_return_items                │
│  inventory_movements        │  invoices (via sales)             │
│  stock_adjustments          │                                   │
│  low_stock_alerts           │                                   │
├─────────────────────────────┼───────────────────────────────────┤
│     PURCHASES ENGINE (§9)   │        EXPENSES (§10)             │
│  purchases   purchase_items │  expenses  expense_categories     │
│  purchase_payments          │  recurring_expenses               │
│  purchase_returns           │                                   │
├─────────────────────────────┼───────────────────────────────────┤
│   ACCOUNTING ENGINE (§11)   │      BANKING & CASHFLOW (§12)     │
│  fiscal_years               │  bank_accounts                    │
│  accounting_periods         │  bank_transactions                │
│  chart_of_accounts          │  cash_registers                   │
│  journal_entries            │  cash_movements                   │
│  journal_entry_lines        │  money_transfers                  │
│  account_period_balances    │  bank_reconciliations             │
├─────────────────────────────┼───────────────────────────────────┤
│  FINANCIAL REPORTS (§13)    │          HR MODULE ← NEW          │
│  financial_reports          │  employees                        │
│  report_snapshots           │  employee_payroll                 │
│  balance_sheet_snapshots ←  │                                   │
│  income_stmt_snapshots ←    │                                   │
│  cashflow_snapshots ←       │                                   │
│  equity_stmt_snapshots ←    │                                   │
├─────────────────────────────┼───────────────────────────────────┤
│       PILOT AI (§14)        │       NOTIFICATIONS (§15)         │
│  ai_conversations           │  notifications                    │
│  ai_messages                │  notification_preferences         │
│  ai_insights                │                                   │
│  ai_recommendations         │                                   │
│  ai_financial_analysis ←NEW │                                   │
├─────────────────────────────┼───────────────────────────────────┤
│   SUBSCRIPTIONS (§16)       │      FILE STORAGE (§17)           │
│  plans                      │  uploads                          │
│  business_subscriptions     │  documents ← NEW                  │
│  billing_invoices           │                                   │
│  billing_payments           │                                   │
└─────────────────────────────┴───────────────────────────────────┘
```

---

## 🔢 Comptage final

| Catégorie | v2 | +v3 | Total |
|-----------|-----|-----|-------|
| Tables | 55 | +10 | **65** |
| ENUMs | 12 | 0 | **12** |
| Functions | 12 | +8 | **20** |
| Triggers | 8 | +6 | **14** |
| Views | 5 | +3 | **8** |
| RLS Policies | 60+ | +20 | **80+** |
| Indexes | 45+ | +15 | **60+** |

---

## 🔑 Multi-tenancy : Isolation par `business_id`

Chaque table métier porte un `business_id` FK vers `businesses`.

**RBAC via `business_members`** :

```
auth.users
    │
    ├── profiles (1:1)
    │
    └── business_members ─── businesses
            │                     │
            role ──────────┐      ├── employees
            (owner/admin/  │      ├── products
             accountant/   │      ├── sales
             cashier/      │      ├── ...
             viewer)       │
                           ▼
                    fn_is_member()    → SELECT sur toutes les tables
                    fn_has_role()     → INSERT/UPDATE/DELETE selon rôle
```

**Rôles et permissions** :

| Rôle | Ventes | Stocks | Achats | Dépenses | Comptabilité | RH | Paramètres |
|------|--------|--------|--------|----------|--------------|----|------------|
| `owner` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `admin` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `accountant` | 👁 | 👁 | ✅ | ✅ | ✅ | 💰 | ❌ |
| `inventory_manager` | 👁 | ✅ | 👁 | ❌ | ❌ | ❌ | ❌ |
| `cashier` | ✅ | 👁 | ❌ | ❌ | ❌ | ❌ | ❌ |
| `viewer` | 👁 | 👁 | 👁 | ❌ | ❌ | ❌ | ❌ |

> 👁 = lecture · ✅ = lecture + écriture · 💰 = paie seulement

---

## 📊 Plan comptable (Chart of Accounts)

Seeder: `fn_seed_chart_of_accounts(business_id)` — appeler à la création du business.

```
1xxx / 5xxx  ACTIFS      Caisse HTG (5310), Banque (5110), MonCash (5121)
                          Clients AR (4110), Stocks (3700), Immobilisations (2100)

2xxx / 4xxx  PASSIFS     Fournisseurs AP (4010), Salaires à payer (4200)
                          Taxes (4440), TVA (4450), Emprunts (1640)

3xxx         CAPITAUX    Capital (1010), Résultat (1300), Prélèvements (4580)

7xxx         REVENUS     Ventes (7010), Services (7020), Autres (7090)

6xxx         CHARGES     Achats (6010), Salaires (6410), Loyer (6130)
                          Transport (6240), Marketing (6230), Frais bank (6270)
```

---

## ⚡ Triggers automatiques

| Trigger | Événement | Effet |
|---------|-----------|-------|
| `trg_business_create` | `INSERT businesses` | Ajoute owner dans `business_members` + crée `onboarding_states` |
| `trg_sale_item_stock` | `INSERT sale_items` | Crée mouvement `sale_out` → réduit `warehouse_stock` |
| `trg_purchase_item_stock` | `INSERT purchase_items` | Crée mouvement `purchase_in` → **incrémente** `warehouse_stock` |
| `trg_inventory_movement` | `INSERT inventory_movements` | Met à jour `warehouse_stock` + alerte stock bas |
| `trg_sale_payment_update` | `INSERT sale_payments` | Met à jour `sales.paid_amount` + `payment_status` |
| `trg_purchase_payment_update` | `INSERT purchase_payments` | Met à jour `purchases.paid_amount` + `payment_status` |
| `trg_sale_customer_tx` | `INSERT/UPDATE sales` | Crée entrée dans `customer_transactions` (AR ledger) |
| `trg_sale_payment_cust_tx` | `INSERT sale_payments` | Crée remboursement dans `customer_transactions` |
| `trg_purchase_supplier_tx` | `INSERT/UPDATE purchases` | Crée entrée dans `supplier_transactions` (AP ledger) |
| `trg_purchase_payment_supp_tx` | `INSERT purchase_payments` | Crée remboursement dans `supplier_transactions` |
| `trg_auto_journal_sale` | `INSERT/UPDATE sales` | Génère écriture comptable DR caisse / CR revenus |
| `trg_auto_journal_expense` | `INSERT expenses` | Génère écriture comptable DR charges / CR caisse |
| `trg_updated_at_*` | `UPDATE` (toutes tables) | Met à jour `updated_at = NOW()` |

---

## 🏦 Flux de données — Vente à crédit

```
1. INSERT sales (status='confirmed', payment_method='Crédit')
   └─► trg_auto_journal_sale
       DR 4110 Clients        1 500 HTG
       CR 7010 Ventes                   1 500 HTG

2. INSERT sale_items (product_id, quantity=5, cost_price=200)
   └─► trg_sale_item_stock
       INSERT inventory_movements (sale_out, qty=-5)
       └─► trg_inventory_movement
           UPDATE warehouse_stock SET quantity -= 5
           IF quantity <= reorder_point → INSERT low_stock_alerts

3. INSERT sale_payments (amount=700)
   └─► trg_sale_payment_update
       UPDATE sales SET paid_amount=700, payment_status='partial'
   └─► trg_sale_payment_cust_tx
       INSERT customer_transactions (type='payment_received', amount=-700)
       UPDATE customers SET outstanding_balance -= 700
```

---

## 🔄 Flux de données — Achat fournisseur

```
1. INSERT purchases (supplier_id, status='confirmed')
   └─► trg_purchase_supplier_tx
       INSERT supplier_transactions (type='purchase', amount=+5000)

2. INSERT purchase_items (product_id, quantity=20, unit_cost=250)
   └─► trg_purchase_item_stock  ← AJOUTÉ EN v3 (manquait en v2!)
       INSERT inventory_movements (purchase_in, qty=+20)
       └─► trg_inventory_movement
           UPDATE warehouse_stock SET quantity += 20

3. INSERT purchase_payments (amount=5000)
   └─► trg_purchase_payment_update
       UPDATE purchases SET paid_amount=5000, payment_status='paid'
   └─► trg_purchase_payment_supp_tx
       INSERT supplier_transactions (type='payment_made', amount=-5000)
       UPDATE suppliers SET outstanding_balance -= 5000
```

---

## 📈 Vues analytiques disponibles

| Vue | Description |
|-----|-------------|
| `v_dashboard_kpi` | Revenus, dépenses, profit — mois et année en cours |
| `v_top_products` | Meilleurs produits par CA, unités vendues, marge brute |
| `v_customer_rankings` | Clients par valeur lifetime, solde outstanding |
| `v_supplier_debt_summary` | Dettes fournisseurs par ancienneté |
| `v_stock_valuation` | Valeur inventaire par entrepôt (coût + retail) |
| `v_monthly_pnl` | P&L mensuel agrégé (revenus − dépenses) |
| `v_employee_summary` | Profil RH + dernière paie + ancienneté |
| `v_ar_aging` | Créances clients par tranches 0-30/31-60/61-90/+90j |
| `v_ap_aging` | Dettes fournisseurs par tranches |

---

## 🛡️ Sécurité

- **RLS activé** sur 100% des tables
- **Isolation tenant** : chaque requête filtrée par `business_id` via `fn_is_member()`
- **SECURITY DEFINER** sur les fonctions critiques (pas d'escalade de privilèges)
- **Soft delete** (`deleted_at`) sur les tables principales
- **Registres immuables** : `inventory_movements`, `customer_transactions`, `supplier_transactions`, `journal_entry_lines` — pas de politique UPDATE/DELETE

---

## 🚀 Checklist déploiement

```bash
# 1. Nouveau projet Supabase → appliquer dans l'ordre:
psql $DATABASE_URL -f migrations/20260526_complete_schema_v2.sql
psql $DATABASE_URL -f migrations/20260526_schema_v3_completion.sql

# 2. À la création de chaque business (appel API ou trigger):
SELECT fn_seed_chart_of_accounts('<business_uuid>');

# 3. Variables d'environnement requises:
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...   # pour les triggers SECURITY DEFINER
```

---

*Schéma conçu pour ProfitPilot — Business Management SaaS pour entrepreneurs haïtiens*
*Architecture: QuickBooks intelligence · Stripe-level security · Odoo-style ERP*
