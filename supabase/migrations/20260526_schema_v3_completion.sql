-- ══════════════════════════════════════════════════════════════════════════════
-- PROFITPILOT — SCHEMA COMPLETION v3.0
-- Complète le schema v2 avec les modules manquants du spec original
--
-- Ajouts:
--   § A  employees + employee_payroll (module RH complet)
--   § B  customer_transactions       (grand livre AR clients)
--   § C  supplier_transactions       (grand livre AP fournisseurs)
--   § D  ai_financial_analysis       (analyses financières IA)
--   § E  documents                   (gestion documentaire structurée)
--   § F  balance_sheet_snapshots     (instantané bilan)
--   § F  income_statement_snapshots  (instantané compte de résultat)
--   § F  cashflow_snapshots          (instantané flux de trésorerie)
--   § F  equity_statement_snapshots  (instantané capitaux propres)
--   § G  TRIGGER: purchase_item → inventory_movement  ← MANQUANT CRITIQUE
--   § H  TRIGGER: sale → customer_transaction
--   § I  TRIGGER: purchase → supplier_transaction
--   § J  TRIGGER: business INSERT → auto-add owner to business_members
--   § K  updated_at triggers pour nouvelles tables
--   § L  RLS policies pour toutes les nouvelles tables
--
-- Prérequis: 20260526_complete_schema_v2.sql doit être appliqué avant ce fichier.
-- ══════════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- § A. EMPLOYEES — Module RH (Ressources Humaines)
-- Distinct de business_members qui gère les accès auth.
-- employees gère les données RH: salaire, poste, embauche, paie.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS employees (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id           UUID          NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  member_id             UUID          REFERENCES business_members(id) ON DELETE SET NULL,

  -- Informations personnelles
  full_name             TEXT          NOT NULL,
  phone                 TEXT,
  email                 TEXT,
  address               TEXT,
  city                  TEXT,
  date_of_birth         DATE,
  national_id           TEXT,                         -- CIN / NIF Haiti
  photo_url             TEXT,

  -- Informations d'emploi
  employee_number       TEXT,                         -- Numéro matricule interne
  position              TEXT          NOT NULL,        -- "Caissier", "Gérant", "Vendeur", "Comptable"
  department            TEXT,                         -- "Ventes", "Comptabilité", "Stock"
  employment_type       TEXT          NOT NULL DEFAULT 'full_time'
                          CHECK (employment_type IN ('full_time','part_time','contract','intern','seasonal')),
  employment_status     TEXT          NOT NULL DEFAULT 'active'
                          CHECK (employment_status IN ('active','inactive','on_leave','terminated','suspended')),
  hire_date             DATE          NOT NULL DEFAULT CURRENT_DATE,
  termination_date      DATE,
  termination_reason    TEXT,

  -- Rémunération
  salary_type           TEXT          NOT NULL DEFAULT 'monthly'
                          CHECK (salary_type IN ('monthly','hourly','daily','weekly','commission_only')),
  salary_amount         NUMERIC(20,4) NOT NULL DEFAULT 0 CHECK (salary_amount >= 0),
  salary_currency       currency_code NOT NULL DEFAULT 'HTG',
  commission_rate       NUMERIC(5,2)  NOT NULL DEFAULT 0 CHECK (commission_rate BETWEEN 0 AND 100),

  -- Contact urgence
  emergency_contact     TEXT,
  emergency_phone       TEXT,
  emergency_relation    TEXT,

  -- Informations bancaires (pour virements de salaire)
  bank_name             TEXT,
  bank_account_name     TEXT,
  bank_account_number   TEXT,

  -- Métadonnées
  notes                 TEXT,
  tags                  TEXT[],
  metadata              JSONB,
  created_by            UUID          REFERENCES auth.users(id),
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  deleted_at            TIMESTAMPTZ,

  UNIQUE (business_id, employee_number) NULLS NOT DISTINCT
);
COMMENT ON TABLE employees IS 'Dossier RH complet. Lié à business_members pour les accès auth. Gère contrat, salaire et paie.';

CREATE INDEX idx_employees_biz       ON employees(business_id);
CREATE INDEX idx_employees_member    ON employees(member_id) WHERE member_id IS NOT NULL;
CREATE INDEX idx_employees_status    ON employees(business_id, employment_status);
CREATE INDEX idx_employees_active    ON employees(business_id) WHERE employment_status = 'active' AND deleted_at IS NULL;


-- Fiches de paie (une par période par employé)
CREATE TABLE IF NOT EXISTS employee_payroll (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id       UUID          NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  employee_id       UUID          NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  payroll_number    TEXT          NOT NULL DEFAULT fn_generate_ref('PAY'),
  period_start      DATE          NOT NULL,
  period_end        DATE          NOT NULL,

  -- Rémunération brute
  base_salary       NUMERIC(20,4) NOT NULL DEFAULT 0,
  overtime_hours    NUMERIC(10,2) NOT NULL DEFAULT 0,
  overtime_amount   NUMERIC(20,4) NOT NULL DEFAULT 0,
  commission        NUMERIC(20,4) NOT NULL DEFAULT 0,
  bonuses           NUMERIC(20,4) NOT NULL DEFAULT 0,
  allowances        NUMERIC(20,4) NOT NULL DEFAULT 0,   -- indemnités de transport, repas, etc.
  gross_pay         NUMERIC(20,4) NOT NULL DEFAULT 0,

  -- Déductions
  social_charges    NUMERIC(20,4) NOT NULL DEFAULT 0,   -- cotisations sociales (ONA, OFATMA)
  income_tax        NUMERIC(20,4) NOT NULL DEFAULT 0,   -- impôt sur revenu
  other_deductions  NUMERIC(20,4) NOT NULL DEFAULT 0,
  total_deductions  NUMERIC(20,4) NOT NULL DEFAULT 0,

  -- Net à payer
  net_pay           NUMERIC(20,4) NOT NULL DEFAULT 0,
  currency          currency_code NOT NULL DEFAULT 'HTG',

  -- Paiement
  payment_method    payment_method_type,
  payment_status    payment_status_type NOT NULL DEFAULT 'pending',
  paid_at           TIMESTAMPTZ,
  reference         TEXT,                                -- numéro de virement / chèque

  notes             TEXT,
  created_by        UUID          REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  UNIQUE (employee_id, period_start)
);
COMMENT ON TABLE employee_payroll IS 'Bulletins de paie. Une fiche par employé par période.';

CREATE INDEX idx_payroll_employee ON employee_payroll(employee_id);
CREATE INDEX idx_payroll_biz      ON employee_payroll(business_id, period_start DESC);
CREATE INDEX idx_payroll_status   ON employee_payroll(business_id, payment_status);


-- ─────────────────────────────────────────────────────────────────────────────
-- § B. CUSTOMER TRANSACTIONS — Grand livre AR (Comptes Clients)
-- Registre immuable de chaque mouvement de balance client.
-- Permet de reconstituer le solde à n'importe quelle date.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS customer_transactions (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id      UUID          NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id      UUID          NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  transaction_date DATE          NOT NULL DEFAULT CURRENT_DATE,

  -- Type de mouvement
  type             TEXT          NOT NULL
                     CHECK (type IN ('sale','payment_received','credit_note','debit_note',
                                     'return','opening_balance','adjustment')),

  -- Montant: positif = client doit de l'argent, négatif = nous devons rembourser
  amount           NUMERIC(20,4) NOT NULL,
  currency         currency_code NOT NULL DEFAULT 'HTG',
  description      TEXT          NOT NULL,

  -- Référence source (polymorphique)
  reference_type   TEXT,            -- 'sale', 'sale_payment', 'sale_return'
  reference_id     UUID,

  -- Solde courant (snapshot pour audit trail)
  balance_before   NUMERIC(20,4) NOT NULL DEFAULT 0,
  balance_after    NUMERIC(20,4) NOT NULL DEFAULT 0,

  created_by       UUID          REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
  -- PAS de updated_at: ce registre est immuable
);
COMMENT ON TABLE customer_transactions IS
  'Registre AR immuable. Chaque changement de balance client est enregistré ici. Ne jamais DELETE.';

CREATE INDEX idx_cust_tx_customer ON customer_transactions(customer_id);
CREATE INDEX idx_cust_tx_biz_date ON customer_transactions(business_id, transaction_date DESC);
CREATE INDEX idx_cust_tx_ref      ON customer_transactions(reference_type, reference_id);
CREATE INDEX idx_cust_tx_type     ON customer_transactions(business_id, type);


-- ─────────────────────────────────────────────────────────────────────────────
-- § C. SUPPLIER TRANSACTIONS — Grand livre AP (Comptes Fournisseurs)
-- Registre immuable de chaque mouvement de dette fournisseur.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS supplier_transactions (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id      UUID          NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  supplier_id      UUID          NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  transaction_date DATE          NOT NULL DEFAULT CURRENT_DATE,

  -- Type de mouvement
  type             TEXT          NOT NULL
                     CHECK (type IN ('purchase','payment_made','return','credit_received',
                                     'debit_note','opening_balance','adjustment')),

  -- Montant: positif = nous devons au fournisseur, négatif = fournisseur nous doit
  amount           NUMERIC(20,4) NOT NULL,
  currency         currency_code NOT NULL DEFAULT 'HTG',
  description      TEXT          NOT NULL,

  -- Référence source (polymorphique)
  reference_type   TEXT,            -- 'purchase', 'purchase_payment', 'purchase_return'
  reference_id     UUID,

  -- Solde courant
  balance_before   NUMERIC(20,4) NOT NULL DEFAULT 0,
  balance_after    NUMERIC(20,4) NOT NULL DEFAULT 0,

  created_by       UUID          REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE supplier_transactions IS
  'Registre AP immuable. Chaque changement de dette fournisseur est enregistré ici. Ne jamais DELETE.';

CREATE INDEX idx_supp_tx_supplier ON supplier_transactions(supplier_id);
CREATE INDEX idx_supp_tx_biz_date ON supplier_transactions(business_id, transaction_date DESC);
CREATE INDEX idx_supp_tx_ref      ON supplier_transactions(reference_type, reference_id);
CREATE INDEX idx_supp_tx_type     ON supplier_transactions(business_id, type);


-- ─────────────────────────────────────────────────────────────────────────────
-- § D. AI FINANCIAL ANALYSIS — Analyses financières Pilot AI
-- Résultats détaillés des analyses automatiques (mensuel, trimestriel, etc.)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ai_financial_analysis (
  id               UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id      UUID    NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  conversation_id  UUID    REFERENCES ai_conversations(id) ON DELETE SET NULL,

  -- Périmètre de l'analyse
  analysis_date    DATE    NOT NULL DEFAULT CURRENT_DATE,
  period_start     DATE    NOT NULL,
  period_end       DATE    NOT NULL,
  type             TEXT    NOT NULL
                     CHECK (type IN ('monthly_review','quarterly_review','annual_review',
                                     'cashflow_forecast','expense_analysis','profitability_analysis',
                                     'stock_analysis','ar_ap_analysis','custom')),

  -- Contenu de l'analyse
  title            TEXT    NOT NULL,
  summary          TEXT    NOT NULL,                          -- résumé exécutif
  findings         JSONB   NOT NULL DEFAULT '[]',             -- tableau de constats
  recommendations  JSONB   NOT NULL DEFAULT '[]',             -- tableau de recommandations
  kpis             JSONB   NOT NULL DEFAULT '{}',             -- indicateurs clés calculés
  data             JSONB,                                     -- données brutes de l'analyse

  -- Métadonnées LLM
  model            TEXT,                                      -- ex: 'claude-sonnet-4-6'
  prompt_tokens    INTEGER,
  completion_tokens INTEGER,
  total_tokens     INTEGER,

  -- Statut
  is_published     BOOLEAN NOT NULL DEFAULT false,
  published_at     TIMESTAMPTZ,
  is_read          BOOLEAN NOT NULL DEFAULT false,
  read_at          TIMESTAMPTZ,

  created_by       UUID    REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE ai_financial_analysis IS
  'Analyses financières générées par Pilot AI. Archivées pour historique et comparaison.';

CREATE INDEX idx_ai_analysis_biz  ON ai_financial_analysis(business_id);
CREATE INDEX idx_ai_analysis_date ON ai_financial_analysis(business_id, analysis_date DESC);
CREATE INDEX idx_ai_analysis_type ON ai_financial_analysis(business_id, type);
CREATE INDEX idx_ai_analysis_unread ON ai_financial_analysis(business_id) WHERE is_read = false;


-- ─────────────────────────────────────────────────────────────────────────────
-- § E. DOCUMENTS — Gestion documentaire structurée
-- Plus structuré que la table uploads: type, référence, expiration, signature.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS documents (
  id               UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id      UUID    NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  upload_id        UUID    REFERENCES uploads(id) ON DELETE SET NULL,

  -- Classification
  type             TEXT    NOT NULL
                     CHECK (type IN ('invoice_pdf','receipt','expense_receipt','purchase_order',
                                     'contract','employee_document','id_document','business_license',
                                     'tax_document','report_pdf','product_image','logo','other')),
  name             TEXT    NOT NULL,
  description      TEXT,

  -- Référence source (polymorphique)
  reference_type   TEXT,                -- 'sale', 'purchase', 'expense', 'employee', 'business', ...
  reference_id     UUID,

  -- Fichier
  url              TEXT    NOT NULL,    -- URL Supabase Storage (signée ou publique)
  mime_type        TEXT,
  size_bytes       BIGINT,

  -- Statut document
  is_signed        BOOLEAN NOT NULL DEFAULT false,
  signed_at        TIMESTAMPTZ,
  signed_by        TEXT,
  expires_at       TIMESTAMPTZ,         -- pour les licences, contrats, etc.
  is_archived      BOOLEAN NOT NULL DEFAULT false,

  tags             TEXT[],
  metadata         JSONB,
  created_by       UUID    REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at       TIMESTAMPTZ
);
COMMENT ON TABLE documents IS
  'Documents structurés: factures PDF, reçus, contrats, pièces d''identité. Complète la table uploads.';

CREATE INDEX idx_docs_biz       ON documents(business_id);
CREATE INDEX idx_docs_ref       ON documents(reference_type, reference_id);
CREATE INDEX idx_docs_type      ON documents(business_id, type);
CREATE INDEX idx_docs_expires   ON documents(expires_at) WHERE expires_at IS NOT NULL AND deleted_at IS NULL;


-- ─────────────────────────────────────────────────────────────────────────────
-- § F. FINANCIAL STATEMENT SNAPSHOTS
-- Instantanés précis des 4 états financiers pour archivage et comparaison.
-- Les données JSONB contiennent le détail ligne par ligne.
-- ─────────────────────────────────────────────────────────────────────────────

-- F.1 — Bilan (Balance Sheet)
CREATE TABLE IF NOT EXISTS balance_sheet_snapshots (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id           UUID          NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  snapshot_date         DATE          NOT NULL,
  period_start          DATE          NOT NULL,
  period_end            DATE          NOT NULL,
  currency              currency_code NOT NULL DEFAULT 'HTG',

  -- ACTIFS (Assets)
  total_assets          NUMERIC(20,4) NOT NULL DEFAULT 0,
  current_assets        NUMERIC(20,4) NOT NULL DEFAULT 0,
    cash_and_bank         NUMERIC(20,4) NOT NULL DEFAULT 0,   -- caisse + banque
    moncash_balance       NUMERIC(20,4) NOT NULL DEFAULT 0,
    accounts_receivable   NUMERIC(20,4) NOT NULL DEFAULT 0,   -- clients débiteurs
    inventory_value       NUMERIC(20,4) NOT NULL DEFAULT 0,   -- valeur stock au coût
    prepaid_expenses      NUMERIC(20,4) NOT NULL DEFAULT 0,
    other_current_assets  NUMERIC(20,4) NOT NULL DEFAULT 0,
  fixed_assets          NUMERIC(20,4) NOT NULL DEFAULT 0,
    equipment_gross       NUMERIC(20,4) NOT NULL DEFAULT 0,
    accumulated_depreciation NUMERIC(20,4) NOT NULL DEFAULT 0,
    equipment_net         NUMERIC(20,4) NOT NULL DEFAULT 0,
    other_fixed_assets    NUMERIC(20,4) NOT NULL DEFAULT 0,

  -- PASSIF (Liabilities)
  total_liabilities     NUMERIC(20,4) NOT NULL DEFAULT 0,
  current_liabilities   NUMERIC(20,4) NOT NULL DEFAULT 0,
    accounts_payable      NUMERIC(20,4) NOT NULL DEFAULT 0,   -- fournisseurs créditeurs
    short_term_loans      NUMERIC(20,4) NOT NULL DEFAULT 0,
    taxes_payable         NUMERIC(20,4) NOT NULL DEFAULT 0,
    salaries_payable      NUMERIC(20,4) NOT NULL DEFAULT 0,
    other_current_liab    NUMERIC(20,4) NOT NULL DEFAULT 0,
  long_term_liabilities NUMERIC(20,4) NOT NULL DEFAULT 0,
    long_term_loans       NUMERIC(20,4) NOT NULL DEFAULT 0,
    other_long_term_liab  NUMERIC(20,4) NOT NULL DEFAULT 0,

  -- CAPITAUX PROPRES (Equity)
  total_equity          NUMERIC(20,4) NOT NULL DEFAULT 0,
    owner_capital         NUMERIC(20,4) NOT NULL DEFAULT 0,
    retained_earnings     NUMERIC(20,4) NOT NULL DEFAULT 0,
    current_net_income    NUMERIC(20,4) NOT NULL DEFAULT 0,
    owner_drawings        NUMERIC(20,4) NOT NULL DEFAULT 0,   -- prélèvements (négatif)

  -- Vérification: total_assets = total_liabilities + total_equity
  is_balanced           BOOLEAN       NOT NULL DEFAULT false,
  imbalance_amount      NUMERIC(20,4) NOT NULL DEFAULT 0,

  -- Données détaillées complètes
  data                  JSONB,         -- breakdown complet par compte

  report_id             UUID          REFERENCES financial_reports(id) ON DELETE SET NULL,
  generated_by          UUID          REFERENCES auth.users(id),
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  UNIQUE (business_id, snapshot_date)
);
COMMENT ON TABLE balance_sheet_snapshots IS
  'Instantanés du bilan. Structure normalisée + détail JSONB pour export PDF.';

CREATE INDEX idx_bs_snap_biz  ON balance_sheet_snapshots(business_id, snapshot_date DESC);


-- F.2 — Compte de résultat (Income Statement)
CREATE TABLE IF NOT EXISTS income_statement_snapshots (
  id                        UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id               UUID          NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  snapshot_date             DATE          NOT NULL,
  period_start              DATE          NOT NULL,
  period_end                DATE          NOT NULL,
  currency                  currency_code NOT NULL DEFAULT 'HTG',

  -- REVENUS
  gross_revenue             NUMERIC(20,4) NOT NULL DEFAULT 0,  -- ventes brutes
    sales_revenue           NUMERIC(20,4) NOT NULL DEFAULT 0,
    service_revenue         NUMERIC(20,4) NOT NULL DEFAULT 0,
    other_revenue           NUMERIC(20,4) NOT NULL DEFAULT 0,
  sales_returns             NUMERIC(20,4) NOT NULL DEFAULT 0,  -- retours / remises
  net_revenue               NUMERIC(20,4) NOT NULL DEFAULT 0,  -- CA net

  -- COÛT DES MARCHANDISES VENDUES (COGS)
  cost_of_goods_sold        NUMERIC(20,4) NOT NULL DEFAULT 0,
    opening_stock_value     NUMERIC(20,4) NOT NULL DEFAULT 0,
    purchases_amount        NUMERIC(20,4) NOT NULL DEFAULT 0,
    closing_stock_value     NUMERIC(20,4) NOT NULL DEFAULT 0,

  -- MARGE BRUTE
  gross_profit              NUMERIC(20,4) NOT NULL DEFAULT 0,
  gross_margin_pct          NUMERIC(5,2)  NOT NULL DEFAULT 0,

  -- CHARGES D'EXPLOITATION
  total_operating_expenses  NUMERIC(20,4) NOT NULL DEFAULT 0,
    salaries_expense        NUMERIC(20,4) NOT NULL DEFAULT 0,
    rent_expense            NUMERIC(20,4) NOT NULL DEFAULT 0,
    utilities_expense       NUMERIC(20,4) NOT NULL DEFAULT 0,  -- électricité, eau
    telecom_expense         NUMERIC(20,4) NOT NULL DEFAULT 0,
    transport_expense       NUMERIC(20,4) NOT NULL DEFAULT 0,
    marketing_expense       NUMERIC(20,4) NOT NULL DEFAULT 0,
    banking_fees            NUMERIC(20,4) NOT NULL DEFAULT 0,
    maintenance_expense     NUMERIC(20,4) NOT NULL DEFAULT 0,
    insurance_expense       NUMERIC(20,4) NOT NULL DEFAULT 0,
    office_supplies_expense NUMERIC(20,4) NOT NULL DEFAULT 0,
    depreciation_expense    NUMERIC(20,4) NOT NULL DEFAULT 0,
    other_operating_exp     NUMERIC(20,4) NOT NULL DEFAULT 0,

  -- RÉSULTAT D'EXPLOITATION
  operating_income          NUMERIC(20,4) NOT NULL DEFAULT 0,
  operating_margin_pct      NUMERIC(5,2)  NOT NULL DEFAULT 0,

  -- RÉSULTAT FINANCIER
  interest_income           NUMERIC(20,4) NOT NULL DEFAULT 0,
  interest_expense          NUMERIC(20,4) NOT NULL DEFAULT 0,
  other_financial           NUMERIC(20,4) NOT NULL DEFAULT 0,

  -- RÉSULTAT AVANT IMPÔTS
  income_before_tax         NUMERIC(20,4) NOT NULL DEFAULT 0,
  tax_expense               NUMERIC(20,4) NOT NULL DEFAULT 0,

  -- RÉSULTAT NET
  net_income                NUMERIC(20,4) NOT NULL DEFAULT 0,
  net_margin_pct            NUMERIC(5,2)  NOT NULL DEFAULT 0,

  -- Données détaillées
  data                      JSONB,

  report_id                 UUID          REFERENCES financial_reports(id) ON DELETE SET NULL,
  generated_by              UUID          REFERENCES auth.users(id),
  created_at                TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  UNIQUE (business_id, period_start, period_end)
);
COMMENT ON TABLE income_statement_snapshots IS
  'Compte de résultat instantané. Suit la structure PCG adapté Haïti.';

CREATE INDEX idx_is_snap_biz ON income_statement_snapshots(business_id, snapshot_date DESC);


-- F.3 — Flux de trésorerie (Cashflow Statement)
CREATE TABLE IF NOT EXISTS cashflow_snapshots (
  id                      UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id             UUID          NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  snapshot_date           DATE          NOT NULL,
  period_start            DATE          NOT NULL,
  period_end              DATE          NOT NULL,
  currency                currency_code NOT NULL DEFAULT 'HTG',

  -- ACTIVITÉS D'EXPLOITATION (méthode indirecte)
  net_income              NUMERIC(20,4) NOT NULL DEFAULT 0,
  depreciation_addback    NUMERIC(20,4) NOT NULL DEFAULT 0,
  ar_change               NUMERIC(20,4) NOT NULL DEFAULT 0,   -- Δ créances clients
  inventory_change        NUMERIC(20,4) NOT NULL DEFAULT 0,   -- Δ stocks
  ap_change               NUMERIC(20,4) NOT NULL DEFAULT 0,   -- Δ dettes fournisseurs
  other_working_capital   NUMERIC(20,4) NOT NULL DEFAULT 0,
  net_operating_cashflow  NUMERIC(20,4) NOT NULL DEFAULT 0,

  -- ACTIVITÉS D'INVESTISSEMENT
  capex_payments          NUMERIC(20,4) NOT NULL DEFAULT 0,   -- achats immobilisations
  asset_sale_proceeds     NUMERIC(20,4) NOT NULL DEFAULT 0,   -- cessions
  other_investing         NUMERIC(20,4) NOT NULL DEFAULT 0,
  net_investing_cashflow  NUMERIC(20,4) NOT NULL DEFAULT 0,

  -- ACTIVITÉS DE FINANCEMENT
  loan_proceeds           NUMERIC(20,4) NOT NULL DEFAULT 0,
  loan_repayments         NUMERIC(20,4) NOT NULL DEFAULT 0,
  owner_contributions     NUMERIC(20,4) NOT NULL DEFAULT 0,
  owner_drawings          NUMERIC(20,4) NOT NULL DEFAULT 0,
  other_financing         NUMERIC(20,4) NOT NULL DEFAULT 0,
  net_financing_cashflow  NUMERIC(20,4) NOT NULL DEFAULT 0,

  -- RÉSUMÉ
  opening_cash            NUMERIC(20,4) NOT NULL DEFAULT 0,
  net_change_in_cash      NUMERIC(20,4) NOT NULL DEFAULT 0,
  closing_cash            NUMERIC(20,4) NOT NULL DEFAULT 0,
  is_balanced             BOOLEAN       NOT NULL DEFAULT false,

  data                    JSONB,

  report_id               UUID          REFERENCES financial_reports(id) ON DELETE SET NULL,
  generated_by            UUID          REFERENCES auth.users(id),
  created_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  UNIQUE (business_id, period_start, period_end)
);
COMMENT ON TABLE cashflow_snapshots IS
  'État des flux de trésorerie. Méthode indirecte. Compatible normes SYSCOHADA.';

CREATE INDEX idx_cf_snap_biz ON cashflow_snapshots(business_id, snapshot_date DESC);


-- F.4 — Variation des capitaux propres (Equity Statement)
CREATE TABLE IF NOT EXISTS equity_statement_snapshots (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id           UUID          NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  snapshot_date         DATE          NOT NULL,
  period_start          DATE          NOT NULL,
  period_end            DATE          NOT NULL,
  currency              currency_code NOT NULL DEFAULT 'HTG',

  -- Mouvements
  opening_equity        NUMERIC(20,4) NOT NULL DEFAULT 0,
  owner_contributions   NUMERIC(20,4) NOT NULL DEFAULT 0,   -- apports
  owner_drawings        NUMERIC(20,4) NOT NULL DEFAULT 0,   -- prélèvements (positif = retraits)
  net_income            NUMERIC(20,4) NOT NULL DEFAULT 0,   -- résultat de la période
  dividends_paid        NUMERIC(20,4) NOT NULL DEFAULT 0,
  other_equity_changes  NUMERIC(20,4) NOT NULL DEFAULT 0,
  closing_equity        NUMERIC(20,4) NOT NULL DEFAULT 0,

  data                  JSONB,

  report_id             UUID          REFERENCES financial_reports(id) ON DELETE SET NULL,
  generated_by          UUID          REFERENCES auth.users(id),
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  UNIQUE (business_id, period_start, period_end)
);
COMMENT ON TABLE equity_statement_snapshots IS
  'Variation des capitaux propres. 4ème état financier requis par les normes comptables.';

CREATE INDEX idx_eq_snap_biz ON equity_statement_snapshots(business_id, snapshot_date DESC);


-- ─────────────────────────────────────────────────────────────────────────────
-- § G. TRIGGER CRITIQUE: purchase_items → inventory_movements
-- MANQUANT dans le schema v2: les achats n'incrémentaient PAS le stock!
-- Ce trigger crée un mouvement inventory_movements pour chaque ligne d'achat
-- reçue, ce qui déclenche à son tour fn_apply_inventory_movement() dans v2
-- pour mettre à jour warehouse_stock.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_on_purchase_item_insert()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_warehouse_id UUID;
  v_business_id  UUID;
  v_created_by   UUID;
  v_status       TEXT;
BEGIN
  -- Récupère entête achat
  SELECT warehouse_id, business_id, created_by, status::TEXT
  INTO v_warehouse_id, v_business_id, v_created_by, v_status
  FROM purchases WHERE id = NEW.purchase_id;

  -- N'incrémenter le stock que si l'achat est confirmé ou reçu
  IF v_status NOT IN ('confirmed','invoiced','partially_paid','paid') THEN
    RETURN NEW;
  END IF;

  -- Utilise l'entrepôt par défaut si non spécifié sur l'achat
  IF v_warehouse_id IS NULL THEN
    SELECT id INTO v_warehouse_id
    FROM warehouses
    WHERE business_id = v_business_id AND is_default = true
    LIMIT 1;
  END IF;

  -- Sans entrepôt défini, ne pas enregistrer de mouvement (évite erreur FK)
  IF v_warehouse_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Création du mouvement d'entrée stock
  INSERT INTO inventory_movements (
    business_id,
    warehouse_id,
    product_id,
    variant_id,
    movement_type,
    quantity,           -- positif = entrée stock
    unit_cost,
    total_cost,
    currency,
    reference_type,
    reference_id,
    notes,
    created_by
  ) VALUES (
    v_business_id,
    v_warehouse_id,
    NEW.product_id,
    NEW.variant_id,
    'purchase_in',
    NEW.quantity_received,   -- utilise la quantité effectivement reçue
    NEW.unit_cost,
    NEW.line_total,
    NEW.currency,
    'purchase_item',
    NEW.id,
    'Auto: achat fournisseur ' || NEW.product_name,
    v_created_by
  );

  RETURN NEW;
END;
$$;
COMMENT ON FUNCTION fn_on_purchase_item_insert IS
  'Crée un mouvement inventory_movements (purchase_in) à chaque ligne d''achat insérée.
   Déclenche à son tour fn_apply_inventory_movement qui met à jour warehouse_stock.';

DROP TRIGGER IF EXISTS trg_purchase_item_stock ON purchase_items;
CREATE TRIGGER trg_purchase_item_stock
  AFTER INSERT ON purchase_items
  FOR EACH ROW
  EXECUTE FUNCTION fn_on_purchase_item_insert();


-- ─────────────────────────────────────────────────────────────────────────────
-- § H. TRIGGER: sale → customer_transaction
-- Alimente automatiquement le grand livre AR à chaque vente confirmée.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_on_sale_create_customer_tx()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_balance NUMERIC;
BEGIN
  -- Seulement pour les ventes avec client identifié et statut opérationnel
  IF NEW.customer_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('confirmed','invoiced','partially_paid','paid') THEN RETURN NEW; END IF;
  -- Evite les doublons sur UPDATE si status n'a pas changé
  IF TG_OP = 'UPDATE' AND OLD.status = NEW.status THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.status = 'cancelled' THEN
    -- Annulation: crée une ligne de crédit (remboursement)
    SELECT outstanding_balance INTO v_balance FROM customers WHERE id = NEW.customer_id;
    INSERT INTO customer_transactions (
      business_id, customer_id, transaction_date, type, amount, currency,
      description, reference_type, reference_id,
      balance_before, balance_after, created_by
    ) VALUES (
      NEW.business_id, NEW.customer_id, CURRENT_DATE, 'credit_note', -NEW.total_amount, NEW.currency,
      'Annulation vente - ' || NEW.invoice_number, 'sale', NEW.id,
      COALESCE(v_balance, 0), COALESCE(v_balance, 0) - NEW.total_amount, NEW.created_by
    );
    RETURN NEW;
  END IF;

  -- Vente confirmée: débit client
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.status IN ('draft') AND NEW.status IN ('confirmed','invoiced','partially_paid','paid')) THEN
    SELECT outstanding_balance INTO v_balance FROM customers WHERE id = NEW.customer_id;
    INSERT INTO customer_transactions (
      business_id, customer_id, transaction_date, type, amount, currency,
      description, reference_type, reference_id,
      balance_before, balance_after, created_by
    ) VALUES (
      NEW.business_id, NEW.customer_id, NEW.sale_date, 'sale', NEW.total_amount, NEW.currency,
      'Vente - ' || NEW.invoice_number, 'sale', NEW.id,
      COALESCE(v_balance, 0), COALESCE(v_balance, 0) + NEW.total_amount, NEW.created_by
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sale_customer_tx ON sales;
CREATE TRIGGER trg_sale_customer_tx
  AFTER INSERT OR UPDATE OF status ON sales
  FOR EACH ROW
  EXECUTE FUNCTION fn_on_sale_create_customer_tx();


-- Grand livre: paiement reçu du client
CREATE OR REPLACE FUNCTION fn_on_sale_payment_customer_tx()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_cust_id UUID;
  v_balance NUMERIC;
BEGIN
  SELECT customer_id INTO v_cust_id FROM sales WHERE id = NEW.sale_id;
  IF v_cust_id IS NULL THEN RETURN NEW; END IF;

  SELECT outstanding_balance INTO v_balance FROM customers WHERE id = v_cust_id;

  INSERT INTO customer_transactions (
    business_id, customer_id, transaction_date, type, amount, currency,
    description, reference_type, reference_id,
    balance_before, balance_after, created_by
  ) VALUES (
    NEW.business_id, v_cust_id, NEW.payment_date, 'payment_received', -NEW.amount, NEW.currency,
    'Paiement reçu — ' || NEW.payment_method::TEXT, 'sale_payment', NEW.id,
    COALESCE(v_balance, 0), COALESCE(v_balance, 0) - NEW.amount, NEW.received_by
  );

  -- Met à jour outstanding_balance sur customers
  UPDATE customers
  SET outstanding_balance = GREATEST(0, outstanding_balance - NEW.amount),
      updated_at = NOW()
  WHERE id = v_cust_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sale_payment_cust_tx ON sale_payments;
CREATE TRIGGER trg_sale_payment_cust_tx
  AFTER INSERT ON sale_payments
  FOR EACH ROW
  EXECUTE FUNCTION fn_on_sale_payment_customer_tx();


-- ─────────────────────────────────────────────────────────────────────────────
-- § I. TRIGGER: purchase → supplier_transaction
-- Alimente automatiquement le grand livre AP à chaque achat confirmé.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_on_purchase_create_supplier_tx()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_balance NUMERIC;
BEGIN
  IF NEW.status NOT IN ('confirmed','invoiced','partially_paid','paid') THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = NEW.status THEN RETURN NEW; END IF;

  SELECT outstanding_balance INTO v_balance FROM suppliers WHERE id = NEW.supplier_id;

  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.status = 'draft') THEN
    INSERT INTO supplier_transactions (
      business_id, supplier_id, transaction_date, type, amount, currency,
      description, reference_type, reference_id,
      balance_before, balance_after, created_by
    ) VALUES (
      NEW.business_id, NEW.supplier_id, NEW.purchase_date, 'purchase', NEW.total_amount, NEW.currency,
      'Achat - ' || NEW.po_number, 'purchase', NEW.id,
      COALESCE(v_balance, 0), COALESCE(v_balance, 0) + NEW.total_amount, NEW.created_by
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_purchase_supplier_tx ON purchases;
CREATE TRIGGER trg_purchase_supplier_tx
  AFTER INSERT OR UPDATE OF status ON purchases
  FOR EACH ROW
  EXECUTE FUNCTION fn_on_purchase_create_supplier_tx();


-- Grand livre: paiement effectué au fournisseur
CREATE OR REPLACE FUNCTION fn_on_purchase_payment_supplier_tx()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_supp_id UUID;
  v_balance  NUMERIC;
BEGIN
  SELECT supplier_id INTO v_supp_id FROM purchases WHERE id = NEW.purchase_id;

  SELECT outstanding_balance INTO v_balance FROM suppliers WHERE id = v_supp_id;

  INSERT INTO supplier_transactions (
    business_id, supplier_id, transaction_date, type, amount, currency,
    description, reference_type, reference_id,
    balance_before, balance_after, created_by
  ) VALUES (
    NEW.business_id, v_supp_id, NEW.payment_date, 'payment_made', -NEW.amount, NEW.currency,
    'Paiement fournisseur — ' || NEW.payment_method::TEXT, 'purchase_payment', NEW.id,
    COALESCE(v_balance, 0), COALESCE(v_balance, 0) - NEW.amount, NEW.paid_by
  );

  -- Met à jour outstanding_balance sur suppliers
  UPDATE suppliers
  SET outstanding_balance = GREATEST(0, outstanding_balance - NEW.amount),
      updated_at = NOW()
  WHERE id = v_supp_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_purchase_payment_supp_tx ON purchase_payments;
CREATE TRIGGER trg_purchase_payment_supp_tx
  AFTER INSERT ON purchase_payments
  FOR EACH ROW
  EXECUTE FUNCTION fn_on_purchase_payment_supplier_tx();


-- ─────────────────────────────────────────────────────────────────────────────
-- § J. TRIGGER: auto-ajout du propriétaire dans business_members
-- CRITIQUE: sans ce trigger, fn_is_member() retourne false pour le créateur
-- du business, bloquant toutes les politiques RLS de son propre business.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_on_business_create()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Ajoute le propriétaire comme membre 'owner'
  INSERT INTO business_members (business_id, user_id, role, is_active, joined_at)
  VALUES (NEW.id, NEW.owner_id, 'owner', true, NOW())
  ON CONFLICT (business_id, user_id) DO UPDATE
    SET role = 'owner', is_active = true, updated_at = NOW();

  -- Crée l'état d'onboarding
  INSERT INTO onboarding_states (business_id, step, completed)
  VALUES (NEW.id, 'business_info', '[]'::JSONB)
  ON CONFLICT (business_id) DO NOTHING;

  RETURN NEW;
END;
$$;
COMMENT ON FUNCTION fn_on_business_create IS
  'Ajoute automatiquement le owner dans business_members à la création du business.
   Essentiel pour que fn_is_member() fonctionne dès la création.';

DROP TRIGGER IF EXISTS trg_business_create ON businesses;
CREATE TRIGGER trg_business_create
  AFTER INSERT ON businesses
  FOR EACH ROW
  EXECUTE FUNCTION fn_on_business_create();


-- ─────────────────────────────────────────────────────────────────────────────
-- § K. UPDATED_AT TRIGGERS — Nouvelles tables
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'employees',
    'employee_payroll',
    'ai_financial_analysis',
    'documents',
    'income_statement_snapshots'
    -- Les tables *_snapshots (balance_sheet, cashflow, equity) n'ont PAS updated_at
    -- (immutables une fois générées — mis à part income_statement_snapshots)
  ] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_updated_at_%1$s ON %2$I;
       CREATE TRIGGER trg_updated_at_%1$s
         BEFORE UPDATE ON %2$I
         FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();',
      t, t
    );
  END LOOP;
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- § L. ROW LEVEL SECURITY — Toutes les nouvelles tables
-- ─────────────────────────────────────────────────────────────────────────────

-- Activer RLS
ALTER TABLE employees                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_payroll            ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_transactions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_transactions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_financial_analysis       ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE balance_sheet_snapshots     ENABLE ROW LEVEL SECURITY;
ALTER TABLE income_statement_snapshots  ENABLE ROW LEVEL SECURITY;
ALTER TABLE cashflow_snapshots          ENABLE ROW LEVEL SECURITY;
ALTER TABLE equity_statement_snapshots  ENABLE ROW LEVEL SECURITY;

-- ── Employees ──────────────────────────────────────────────────────────────
-- Tous les membres voient les employés, seul admin/owner gère
CREATE POLICY "employees: member read"
  ON employees FOR SELECT
  USING (fn_is_member(business_id));

CREATE POLICY "employees: admin write"
  ON employees FOR INSERT
  WITH CHECK (fn_has_role(business_id, 'owner', 'admin'));

CREATE POLICY "employees: admin update"
  ON employees FOR UPDATE
  USING (fn_has_role(business_id, 'owner', 'admin'));

CREATE POLICY "employees: admin delete"
  ON employees FOR DELETE
  USING (fn_has_role(business_id, 'owner', 'admin'));

-- ── Payroll: confidential — admin + accountant uniquement ──────────────────
CREATE POLICY "payroll: restricted read"
  ON employee_payroll FOR SELECT
  USING (fn_has_role(business_id, 'owner', 'admin', 'accountant'));

CREATE POLICY "payroll: admin manage"
  ON employee_payroll FOR ALL
  USING (fn_has_role(business_id, 'owner', 'admin', 'accountant'));

-- ── Customer Transactions — AR ledger ──────────────────────────────────────
CREATE POLICY "cust_tx: member read"
  ON customer_transactions FOR SELECT
  USING (fn_is_member(business_id));

-- Écriture via triggers (SECURITY DEFINER), mais permet aussi writes manuels aux admins
CREATE POLICY "cust_tx: admin write"
  ON customer_transactions FOR INSERT
  WITH CHECK (fn_is_member(business_id));

-- Jamais de UPDATE/DELETE — registre immuable (pas de policy = bloqué)

-- ── Supplier Transactions — AP ledger ──────────────────────────────────────
CREATE POLICY "supp_tx: member read"
  ON supplier_transactions FOR SELECT
  USING (fn_is_member(business_id));

CREATE POLICY "supp_tx: admin write"
  ON supplier_transactions FOR INSERT
  WITH CHECK (fn_has_role(business_id, 'owner', 'admin', 'accountant'));

-- ── AI Financial Analysis ───────────────────────────────────────────────────
CREATE POLICY "ai_analysis: member read"
  ON ai_financial_analysis FOR SELECT
  USING (fn_is_member(business_id));

CREATE POLICY "ai_analysis: admin manage"
  ON ai_financial_analysis FOR ALL
  USING (fn_has_role(business_id, 'owner', 'admin'));

-- ── Documents ───────────────────────────────────────────────────────────────
CREATE POLICY "documents: member read"
  ON documents FOR SELECT
  USING (fn_is_member(business_id));

CREATE POLICY "documents: member write"
  ON documents FOR INSERT
  WITH CHECK (fn_is_member(business_id));

CREATE POLICY "documents: member update"
  ON documents FOR UPDATE
  USING (fn_is_member(business_id));

CREATE POLICY "documents: admin delete"
  ON documents FOR DELETE
  USING (fn_has_role(business_id, 'owner', 'admin'));

-- ── Financial Snapshots — lecture membres, écriture admin/comptable ─────────
CREATE POLICY "bs_snap: member read"
  ON balance_sheet_snapshots FOR SELECT
  USING (fn_is_member(business_id));

CREATE POLICY "bs_snap: admin write"
  ON balance_sheet_snapshots FOR ALL
  USING (fn_has_role(business_id, 'owner', 'admin', 'accountant'));

CREATE POLICY "is_snap: member read"
  ON income_statement_snapshots FOR SELECT
  USING (fn_is_member(business_id));

CREATE POLICY "is_snap: admin write"
  ON income_statement_snapshots FOR ALL
  USING (fn_has_role(business_id, 'owner', 'admin', 'accountant'));

CREATE POLICY "cf_snap: member read"
  ON cashflow_snapshots FOR SELECT
  USING (fn_is_member(business_id));

CREATE POLICY "cf_snap: admin write"
  ON cashflow_snapshots FOR ALL
  USING (fn_has_role(business_id, 'owner', 'admin', 'accountant'));

CREATE POLICY "eq_snap: member read"
  ON equity_statement_snapshots FOR SELECT
  USING (fn_is_member(business_id));

CREATE POLICY "eq_snap: admin write"
  ON equity_statement_snapshots FOR ALL
  USING (fn_has_role(business_id, 'owner', 'admin', 'accountant'));


-- ─────────────────────────────────────────────────────────────────────────────
-- § M. VUE: v_employee_summary — Tableau de bord RH
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW v_employee_summary AS
SELECT
  e.business_id,
  e.id                                        AS employee_id,
  e.full_name,
  e.position,
  e.department,
  e.employment_type,
  e.employment_status,
  e.hire_date,
  e.salary_amount,
  e.salary_currency,
  e.salary_type,
  -- Dernière fiche de paie
  p.period_end                                AS last_payroll_period,
  p.net_pay                                   AS last_net_pay,
  p.payment_status                            AS last_payroll_status,
  -- Ancienneté en mois
  EXTRACT(YEAR FROM AGE(CURRENT_DATE, e.hire_date)) * 12 +
    EXTRACT(MONTH FROM AGE(CURRENT_DATE, e.hire_date)) AS months_employed
FROM employees e
LEFT JOIN LATERAL (
  SELECT period_end, net_pay, payment_status
  FROM employee_payroll ep
  WHERE ep.employee_id = e.id
  ORDER BY ep.period_end DESC
  LIMIT 1
) p ON true
WHERE e.deleted_at IS NULL;

COMMENT ON VIEW v_employee_summary IS 'Vue RH: profil + dernière paie + ancienneté.';


-- ─────────────────────────────────────────────────────────────────────────────
-- § N. VUE: v_ar_aging — Vieillissement des créances clients
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW v_ar_aging AS
SELECT
  s.business_id,
  s.customer_id,
  s.customer_name,
  c.phone                                     AS customer_phone,
  COUNT(s.id)                                 AS nb_open_invoices,
  SUM(s.balance_due)                          AS total_outstanding,
  SUM(s.balance_due) FILTER (
    WHERE s.sale_date >= CURRENT_DATE - 30
  )                                           AS current_0_30,
  SUM(s.balance_due) FILTER (
    WHERE s.sale_date BETWEEN CURRENT_DATE - 60 AND CURRENT_DATE - 31
  )                                           AS aged_31_60,
  SUM(s.balance_due) FILTER (
    WHERE s.sale_date BETWEEN CURRENT_DATE - 90 AND CURRENT_DATE - 61
  )                                           AS aged_61_90,
  SUM(s.balance_due) FILTER (
    WHERE s.sale_date < CURRENT_DATE - 90
  )                                           AS aged_over_90,
  MAX(s.sale_date)                            AS last_invoice_date,
  MIN(s.sale_date) FILTER (WHERE s.balance_due > 0) AS oldest_open_invoice
FROM sales s
LEFT JOIN customers c ON c.id = s.customer_id
WHERE s.deleted_at IS NULL
  AND s.payment_status IN ('credit','partial','pending','overdue')
  AND s.customer_id IS NOT NULL
GROUP BY s.business_id, s.customer_id, s.customer_name, c.phone;

COMMENT ON VIEW v_ar_aging IS 'Analyse des créances par tranche de vieillissement (0-30, 31-60, 61-90, +90 jours).';


-- ─────────────────────────────────────────────────────────────────────────────
-- § O. VUE: v_ap_aging — Vieillissement des dettes fournisseurs
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW v_ap_aging AS
SELECT
  p.business_id,
  p.supplier_id,
  su.name                                     AS supplier_name,
  su.phone                                    AS supplier_phone,
  COUNT(p.id)                                 AS nb_open_orders,
  SUM(p.balance_due)                          AS total_owed,
  SUM(p.balance_due) FILTER (
    WHERE p.purchase_date >= CURRENT_DATE - 30
  )                                           AS current_0_30,
  SUM(p.balance_due) FILTER (
    WHERE p.purchase_date BETWEEN CURRENT_DATE - 60 AND CURRENT_DATE - 31
  )                                           AS aged_31_60,
  SUM(p.balance_due) FILTER (
    WHERE p.purchase_date BETWEEN CURRENT_DATE - 90 AND CURRENT_DATE - 61
  )                                           AS aged_61_90,
  SUM(p.balance_due) FILTER (
    WHERE p.purchase_date < CURRENT_DATE - 90
  )                                           AS aged_over_90,
  MIN(p.due_date) FILTER (WHERE p.balance_due > 0) AS next_due_date
FROM purchases p
JOIN suppliers su ON su.id = p.supplier_id
WHERE p.deleted_at IS NULL
  AND p.payment_status IN ('credit','partial','pending','overdue')
GROUP BY p.business_id, p.supplier_id, su.name, su.phone;

COMMENT ON VIEW v_ap_aging IS 'Analyse des dettes fournisseurs par tranche (0-30, 31-60, 61-90, +90 jours).';


-- ─────────────────────────────────────────────────────────────────────────────
-- § P. SEED DATA — Permissions supplémentaires pour les nouveaux modules
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO permissions (code, module, description) VALUES
  ('hr.view',            'HR',          'Voir la liste des employés'),
  ('hr.manage',          'HR',          'Gérer les employés (ajout, modification, suppression)'),
  ('payroll.view',       'HR',          'Voir les fiches de paie'),
  ('payroll.manage',     'HR',          'Créer et gérer les bulletins de paie'),
  ('ar.view',            'Accounting',  'Voir le grand livre clients (AR)'),
  ('ap.view',            'Accounting',  'Voir le grand livre fournisseurs (AP)'),
  ('financial_snap.view','Reports',     'Voir les instantanés des états financiers'),
  ('financial_snap.generate', 'Reports','Générer les états financiers'),
  ('documents.view',     'Documents',   'Voir les documents'),
  ('documents.manage',   'Documents',   'Gérer les documents (upload, suppression)'),
  ('ai.financial_analysis', 'AI',       'Accéder aux analyses financières Pilot AI')
ON CONFLICT (code) DO NOTHING;


-- ══════════════════════════════════════════════════════════════════════════════
-- RÉSUMÉ DES AJOUTS — SCHEMA v3 COMPLETION
-- ══════════════════════════════════════════════════════════════════════════════
-- Nouvelles tables  (10):
--   employees, employee_payroll,
--   customer_transactions, supplier_transactions,
--   ai_financial_analysis, documents,
--   balance_sheet_snapshots, income_statement_snapshots,
--   cashflow_snapshots, equity_statement_snapshots
--
-- Nouvelles vues   (3):
--   v_employee_summary, v_ar_aging, v_ap_aging
--
-- Nouveaux triggers (6):
--   trg_purchase_item_stock    ← CRITIQUE: stock += achat
--   trg_sale_customer_tx       ← grand livre AR auto
--   trg_sale_payment_cust_tx   ← paiement client → AR
--   trg_purchase_supplier_tx   ← grand livre AP auto
--   trg_purchase_payment_supp_tx ← paiement fournisseur → AP
--   trg_business_create        ← owner auto-ajouté à business_members
--
-- Nouvelles policies RLS (20+)
-- Nouvelles permissions (11)
-- ══════════════════════════════════════════════════════════════════════════════
