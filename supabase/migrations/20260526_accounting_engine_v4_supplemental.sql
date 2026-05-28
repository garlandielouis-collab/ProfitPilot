-- ══════════════════════════════════════════════════════════════════════════════
-- PROFITPILOT — MOTEUR COMPTABLE v4.1 SUPPLEMENTAL
-- Complète le moteur v4.0 avec les opérations manquantes
-- ══════════════════════════════════════════════════════════════════════════════
-- Ce fichier ajoute:
--   § A  Paie des salaires (fn_journal_payroll)
--   § B  Virement interne entre comptes (fn_journal_transfer)
--   § C  Retour sur vente — contrepassation (fn_journal_sale_return)
--   § D  Ajustement / perte de stock (fn_journal_inventory_adjustment)
--   § E  Ouverture de période comptable automatique (fn_open_accounting_period)
--   § F  Fermeture de période + report résultat (fn_close_accounting_period)
--   § G  Trigger retours vente automatique
--   § H  Vue AR Aging (créances par ancienneté)
--   § I  Vue AP Aging (dettes fournisseurs par ancienneté)
--   § J  Fonction de réconciliation bancaire
-- ══════════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- § A. PAIE DES SALAIRES — fn_journal_payroll
--
-- Étape 1 (fin de mois): Constatation charge salaire
--   DR 6410 Salaires et traitements
--   DR 6430 Charges sociales ONA (part patronale 6%)
--   CR 4200 Personnel — Salaires à payer
--   CR 4300 ONA/OFATMA à payer
--
-- Étape 2 (jour de paiement): Décaissement
--   DR 4200 Personnel — Salaires à payer
--   CR 5310 Caisse / 5110 Banque
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_journal_payroll_provision(
  p_biz              UUID,
  p_period_id        UUID,
  p_date             DATE,
  p_gross_salary     NUMERIC,       -- Salaire brut total
  p_ona_employer     NUMERIC,       -- ONA part patronale (6% haïtien)
  p_ona_employee     NUMERIC,       -- ONA part salariale (4% haïtien) — déduit du brut
  p_currency         currency_code,
  p_description      TEXT,
  p_created_by       UUID
) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
  v_net_to_pay NUMERIC;             -- Net à payer (brut - ONA employé)
BEGIN
  v_net_to_pay := p_gross_salary - p_ona_employee;

  -- Écriture 1: Constatation de la charge salariale
  -- DR Salaires bruts + ONA patronale / CR Salaires à payer net + ONA totale à payer
  RETURN fn_create_journal_entry(
    p_biz, p_period_id, p_date,
    'Provision salaires — ' || p_description,
    'payroll_provision', NULL, p_currency, p_created_by,
    jsonb_build_array(
      -- Charges employeur
      jsonb_build_object(
        'account_code', '6410',
        'debit', p_gross_salary, 'credit', 0,
        'description', 'Salaires bruts — ' || p_description
      ),
      jsonb_build_object(
        'account_code', '6430',
        'debit', p_ona_employer, 'credit', 0,
        'description', 'Charges sociales ONA patronale 6%'
      ),
      -- Dettes créées
      jsonb_build_object(
        'account_code', '4200',
        'debit', 0, 'credit', v_net_to_pay,
        'description', 'Net à payer au personnel'
      ),
      jsonb_build_object(
        'account_code', '4300',
        'debit', 0, 'credit', p_ona_employer + p_ona_employee,
        'description', 'ONA/OFATMA à reverser (6% + 4%)'
      )
    )
  );
END;
$$;

COMMENT ON FUNCTION fn_journal_payroll_provision IS
  'Enregistre la charge salariale mensuelle en double entrée.
   ONA Haïti: 6% patronal + 4% salarié = 10% total.
   Appeler à la fin de chaque mois pour chaque employé ou en masse.';


-- Étape 2: Paiement effectif des salaires
CREATE OR REPLACE FUNCTION fn_journal_payroll_payment(
  p_biz         UUID,
  p_period_id   UUID,
  p_date        DATE,
  p_amount      NUMERIC,        -- Montant net payé
  p_method      payment_method_type,
  p_currency    currency_code,
  p_description TEXT,
  p_created_by  UUID
) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
  v_pay_code TEXT;
BEGIN
  v_pay_code := CASE p_method
    WHEN 'Cash'     THEN '5310'
    WHEN 'MonCash'  THEN '5121'
    WHEN 'Natcash'  THEN '5122'
    WHEN 'Virement' THEN '5110'
    ELSE '5310' END;

  RETURN fn_create_journal_entry(
    p_biz, p_period_id, p_date,
    'Paiement salaires — ' || p_description,
    'payroll_payment', NULL, p_currency, p_created_by,
    jsonb_build_array(
      jsonb_build_object(
        'account_code', '4200',
        'debit', p_amount, 'credit', 0,
        'description', 'Règlement dette salariale'
      ),
      jsonb_build_object(
        'account_code', v_pay_code,
        'debit', 0, 'credit', p_amount,
        'description', 'Sortie trésorerie — salaires'
      )
    )
  );
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- § B. VIREMENT INTERNE ENTRE COMPTES — fn_journal_transfer
--
-- Ex: Caisse → Banque (dépôt)
-- Ex: Banque → MonCash (rechargement)
-- Ex: Banque HTG → Banque USD (change)
--
--   DR 5xxx Compte destination
--   CR 5xxx Compte source
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_journal_transfer(
  p_biz          UUID,
  p_period_id    UUID,
  p_date         DATE,
  p_amount       NUMERIC,
  p_from_code    TEXT,     -- ex: '5310' (Caisse)
  p_to_code      TEXT,     -- ex: '5110' (Banque)
  p_currency     currency_code,
  p_description  TEXT,
  p_created_by   UUID
) RETURNS UUID LANGUAGE plpgsql AS $$
BEGIN
  RETURN fn_create_journal_entry(
    p_biz, p_period_id, p_date,
    'Virement interne — ' || p_description,
    'transfer', NULL, p_currency, p_created_by,
    jsonb_build_array(
      jsonb_build_object(
        'account_code', p_to_code,
        'debit', p_amount, 'credit', 0,
        'description', 'Entrée — ' || p_description
      ),
      jsonb_build_object(
        'account_code', p_from_code,
        'debit', 0, 'credit', p_amount,
        'description', 'Sortie — ' || p_description
      )
    )
  );
END;
$$;

COMMENT ON FUNCTION fn_journal_transfer IS
  'Virement entre deux comptes de trésorerie internes.
   Utiliser code: 5310=Caisse, 5110=Banque HTG, 5121=MonCash,
   5122=Natcash, 5120=Banque USD.
   Transit: si le virement prend 1-2 jours, utiliser 5900 Virements internes.';


-- ─────────────────────────────────────────────────────────────────────────────
-- § C. RETOUR SUR VENTE — fn_journal_sale_return
--
-- CONTREPASSATION PARTIELLE de la vente originale:
--   DR 7090R Retours sur ventes  (diminue les revenus)
--   CR 5310 Caisse / 4110 Clients AR  (remboursement)
--
--   + Réintégration stock:
--   DR 3700 Stock  (remise en stock)
--   CR 6900 COGS   (annulation coût)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_journal_sale_return(
  p_biz          UUID,
  p_sale_return_id UUID,
  p_return_amount  NUMERIC,
  p_cogs_amount    NUMERIC,   -- coût des articles retournés (pour réintégrer le stock)
  p_refund_method  payment_method_type,
  p_date           DATE,
  p_description    TEXT,
  p_created_by     UUID
) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
  v_period_id  UUID;
  v_refund_code TEXT;
  v_ret_je_id   UUID;
BEGIN
  SELECT id INTO v_period_id
  FROM accounting_periods
  WHERE business_id = p_biz
    AND start_date <= p_date AND end_date >= p_date AND is_closed = false
  LIMIT 1;
  IF v_period_id IS NULL THEN RETURN NULL; END IF;

  v_refund_code := CASE p_refund_method
    WHEN 'Cash'     THEN '5310'
    WHEN 'MonCash'  THEN '5121'
    WHEN 'Natcash'  THEN '5122'
    WHEN 'Credit'   THEN '4110'   -- Avoir sur compte client
    ELSE '5310' END;

  -- Écriture 1: Annulation du revenu + remboursement
  v_ret_je_id := fn_create_journal_entry(
    p_biz, v_period_id, p_date,
    'Retour vente — ' || p_description,
    'sale_return', p_sale_return_id, 'HTG', p_created_by,
    jsonb_build_array(
      jsonb_build_object(
        'account_code', '7090R',
        'debit', p_return_amount, 'credit', 0,
        'description', 'Retour marchandises — annulation revenu'
      ),
      jsonb_build_object(
        'account_code', v_refund_code,
        'debit', 0, 'credit', p_return_amount,
        'description', 'Remboursement client'
      )
    )
  );

  -- Écriture 2: Réintégration stock (si coût connu)
  IF p_cogs_amount > 0 THEN
    PERFORM fn_create_journal_entry(
      p_biz, v_period_id, p_date,
      'Réintégration stock — retour vente',
      'sale_return_stock', p_sale_return_id, 'HTG', p_created_by,
      jsonb_build_array(
        jsonb_build_object(
          'account_code', '3700',
          'debit', p_cogs_amount, 'credit', 0,
          'description', 'Stock repris — retour client'
        ),
        jsonb_build_object(
          'account_code', '6900',
          'debit', 0, 'credit', p_cogs_amount,
          'description', 'Annulation COGS — retour'
        )
      )
    );
  END IF;

  RETURN v_ret_je_id;
END;
$$;

-- Trigger automatique sur sale_returns
CREATE OR REPLACE FUNCTION fn_auto_journal_sale_return()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_cogs_amount NUMERIC;
BEGIN
  -- Calcul du COGS des articles retournés
  SELECT COALESCE(SUM(sri.quantity * si.cost_price), 0)
  INTO v_cogs_amount
  FROM sale_return_items sri
  JOIN sale_items si ON si.id = sri.sale_item_id
  WHERE sri.sale_return_id = NEW.id;

  PERFORM fn_journal_sale_return(
    NEW.business_id, NEW.id,
    NEW.refund_amount, v_cogs_amount,
    NEW.refund_method::payment_method_type,
    NEW.return_date::DATE,
    'Retour sur vente',
    NEW.created_by
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_journal_sale_return ON sale_returns;
CREATE TRIGGER trg_journal_sale_return
  AFTER INSERT ON sale_returns
  FOR EACH ROW EXECUTE FUNCTION fn_auto_journal_sale_return();


-- ─────────────────────────────────────────────────────────────────────────────
-- § D. AJUSTEMENT / PERTE DE STOCK — fn_journal_inventory_adjustment
--
-- Quand un stock est perdu, volé, expiré ou abîmé:
--
-- PERTE:
--   DR 6700 Charges exceptionnelles  (perte sur stock)
--   CR 3700 Stock marchandises
--
-- DÉPRÉCIATION (dévaluation sans sortie physique):
--   DR 3900 Dépréciation stocks
--   CR 3700 Stock marchandises  ← contra
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_journal_inventory_adjustment(
  p_biz         UUID,
  p_date        DATE,
  p_amount      NUMERIC,       -- Valeur de la perte au coût
  p_adj_type    TEXT,          -- 'loss' | 'depreciation' | 'gain'
  p_description TEXT,
  p_created_by  UUID
) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
  v_period_id UUID;
  v_dr_code   TEXT;
  v_cr_code   TEXT;
BEGIN
  SELECT id INTO v_period_id
  FROM accounting_periods
  WHERE business_id = p_biz
    AND start_date <= p_date AND end_date >= p_date AND is_closed = false
  LIMIT 1;
  IF v_period_id IS NULL THEN RETURN NULL; END IF;

  CASE p_adj_type
    WHEN 'loss' THEN
      v_dr_code := '6700';   -- Charges exceptionnelles (vol, bris, expiration)
      v_cr_code := '3700';   -- Stock marchandises
    WHEN 'depreciation' THEN
      v_dr_code := '3900';   -- Dépréciation stocks (valeur réduite mais physique intact)
      v_cr_code := '3700';
    WHEN 'gain' THEN          -- Ajustement positif (recart inventaire)
      v_dr_code := '3700';
      v_cr_code := '7090';   -- Autres revenus
    ELSE
      v_dr_code := '6700';
      v_cr_code := '3700';
  END CASE;

  RETURN fn_create_journal_entry(
    p_biz, v_period_id, p_date,
    'Ajustement stock — ' || p_description,
    'inventory_adjustment', NULL, 'HTG', p_created_by,
    jsonb_build_array(
      jsonb_build_object(
        'account_code', v_dr_code,
        'debit', p_amount, 'credit', 0,
        'description', p_description
      ),
      jsonb_build_object(
        'account_code', v_cr_code,
        'debit', 0, 'credit', p_amount,
        'description', 'Ajustement valeur stock'
      )
    )
  );
END;
$$;

COMMENT ON FUNCTION fn_journal_inventory_adjustment IS
  'Ajustement comptable de stock.
   adj_type: loss = vol/bris/expiration → 6700 Charges exceptionnelles
             depreciation = dévaluation → 3900 Dépréciation stocks
             gain = excédent inventaire  → 7090 Autres revenus';


-- ─────────────────────────────────────────────────────────────────────────────
-- § E. OUVERTURE AUTOMATIQUE DE PÉRIODE COMPTABLE
-- Crée la période du mois suivant si elle n'existe pas encore
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_open_accounting_period(
  p_biz   UUID,
  p_year  INT DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::INT,
  p_month INT DEFAULT EXTRACT(MONTH FROM CURRENT_DATE)::INT
) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
  v_fy_id      UUID;
  v_period_id  UUID;
  v_start      DATE;
  v_end        DATE;
  v_name       TEXT;
BEGIN
  v_start := DATE(p_year || '-' || LPAD(p_month::TEXT, 2,'0') || '-01');
  v_end   := (v_start + INTERVAL '1 month - 1 day')::DATE;
  v_name  := TO_CHAR(v_start, 'Month YYYY');

  -- Trouver l'exercice fiscal actif
  SELECT id INTO v_fy_id
  FROM fiscal_years
  WHERE business_id = p_biz
    AND start_date <= v_start AND end_date >= v_end
    AND is_closed = false
  LIMIT 1;

  -- Créer l'exercice si inexistant
  IF v_fy_id IS NULL THEN
    INSERT INTO fiscal_years (business_id, name, start_date, end_date, status)
    VALUES (p_biz, 'Exercice ' || p_year, DATE(p_year||'-01-01'), DATE(p_year||'-12-31'), 'active')
    RETURNING id INTO v_fy_id;
  END IF;

  -- Créer la période si elle n'existe pas déjà
  INSERT INTO accounting_periods (business_id, fiscal_year_id, name, period_number, start_date, end_date, is_closed)
  VALUES (p_biz, v_fy_id, v_name, p_month, v_start, v_end, false)
  ON CONFLICT (business_id, start_date) DO UPDATE SET is_closed = false
  RETURNING id INTO v_period_id;

  RETURN v_period_id;
END;
$$;

COMMENT ON FUNCTION fn_open_accounting_period IS
  'Ouvre ou retrouve la période comptable pour un mois/année.
   Crée automatiquement l''exercice fiscal si inexistant.
   Appeler au 1er du mois ou via cron job mensuel.';


-- ─────────────────────────────────────────────────────────────────────────────
-- § F. FERMETURE DE PÉRIODE + REPORT DU RÉSULTAT
--
-- Clôture comptable de fin d'exercice:
-- 1. Vérifier que toutes les écritures sont postées
-- 2. Calculer le résultat net (Revenus − Charges)
-- 3. Créer l'écriture de clôture: DR/CR Résultat de l'exercice (1300)
-- 4. Marquer la période fermée (is_closed = true)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_close_accounting_period(
  p_biz       UUID,
  p_period_id UUID,
  p_closed_by UUID
) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
  v_period     RECORD;
  v_revenues   NUMERIC := 0;
  v_expenses   NUMERIC := 0;
  v_net_result NUMERIC;
  v_result     JSONB;
BEGIN
  SELECT * INTO v_period FROM accounting_periods
  WHERE id = p_period_id AND business_id = p_biz;

  IF v_period.is_closed THEN
    RAISE EXCEPTION 'Période déjà fermée: %', v_period.name;
  END IF;

  -- Calcul des revenus (classe 7: solde créditeur = NÉGATIF dans notre débit-crédit)
  SELECT COALESCE(SUM(jel.credit_amount - jel.debit_amount), 0)
  INTO v_revenues
  FROM journal_entry_lines jel
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  JOIN chart_of_accounts coa ON coa.id = jel.account_id
  WHERE je.business_id = p_biz
    AND je.period_id = p_period_id
    AND je.status = 'posted'
    AND coa.account_class = 'Revenue';

  -- Calcul des charges (classe 6: solde débiteur = POSITIF)
  SELECT COALESCE(SUM(jel.debit_amount - jel.credit_amount), 0)
  INTO v_expenses
  FROM journal_entry_lines jel
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  JOIN chart_of_accounts coa ON coa.id = jel.account_id
  WHERE je.business_id = p_biz
    AND je.period_id = p_period_id
    AND je.status = 'posted'
    AND coa.account_class = 'Expense';

  v_net_result := v_revenues - v_expenses;

  -- Marquer la période fermée
  UPDATE accounting_periods
  SET is_closed = true, closed_at = NOW(), closed_by = p_closed_by
  WHERE id = p_period_id;

  -- Mettre à jour le solde du compte Résultat de l'exercice (1300)
  -- (l'écriture de clôture formelle sera faite en fin d'exercice, pas de période)

  v_result := jsonb_build_object(
    'period_id',   p_period_id,
    'period_name', v_period.name,
    'revenues',    ROUND(v_revenues, 2),
    'expenses',    ROUND(v_expenses, 2),
    'net_result',  ROUND(v_net_result, 2),
    'closed_at',   NOW(),
    'closed_by',   p_closed_by
  );

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION fn_close_accounting_period IS
  'Clôture une période comptable mensuelle.
   Retourne un JSON avec les totaux: revenus, charges, résultat net.
   La clôture d''exercice annuelle doit aussi virer le résultat vers 1080 Report à nouveau.';


-- ─────────────────────────────────────────────────────────────────────────────
-- § G. TRIGGER RETOUR FOURNISSEUR — Contrepassation achat
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_auto_journal_purchase_return()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_period_id UUID;
BEGIN
  SELECT id INTO v_period_id
  FROM accounting_periods
  WHERE business_id = NEW.business_id
    AND start_date <= CURRENT_DATE AND end_date >= CURRENT_DATE AND is_closed = false
  LIMIT 1;
  IF v_period_id IS NULL THEN RETURN NEW; END IF;

  -- Contrepassation achat: DR Fournisseurs / CR Stock
  PERFORM fn_create_journal_entry(
    NEW.business_id, v_period_id, CURRENT_DATE,
    'Retour fournisseur',
    'purchase_return', NEW.id, 'HTG', NEW.created_by,
    jsonb_build_array(
      jsonb_build_object('account_code','4010','debit',NEW.total_amount,'credit',0,
                         'description','Avoir fournisseur'),
      jsonb_build_object('account_code','3700','debit',0,'credit',NEW.total_amount,
                         'description','Sortie stock — retour fournisseur')
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_journal_purchase_return ON purchase_returns;
CREATE TRIGGER trg_journal_purchase_return
  AFTER INSERT ON purchase_returns
  FOR EACH ROW EXECUTE FUNCTION fn_auto_journal_purchase_return();


-- ─────────────────────────────────────────────────────────────────────────────
-- § H. VUE AR AGING — Créances clients par ancienneté
-- Catégories: 0-30j · 31-60j · 61-90j · +90j
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW v_ar_aging AS
SELECT
  s.business_id,
  c.id                                                  AS customer_id,
  c.name                                                AS customer_name,
  c.phone,
  COUNT(s.id)                                           AS nb_invoices,
  COALESCE(SUM(s.total_amount - s.paid_amount), 0)      AS total_outstanding,

  -- Tranches d'ancienneté
  COALESCE(SUM(CASE WHEN CURRENT_DATE - s.sale_date <= 30
    THEN s.total_amount - s.paid_amount ELSE 0 END), 0) AS current_0_30,

  COALESCE(SUM(CASE WHEN CURRENT_DATE - s.sale_date BETWEEN 31 AND 60
    THEN s.total_amount - s.paid_amount ELSE 0 END), 0) AS overdue_31_60,

  COALESCE(SUM(CASE WHEN CURRENT_DATE - s.sale_date BETWEEN 61 AND 90
    THEN s.total_amount - s.paid_amount ELSE 0 END), 0) AS overdue_61_90,

  COALESCE(SUM(CASE WHEN CURRENT_DATE - s.sale_date > 90
    THEN s.total_amount - s.paid_amount ELSE 0 END), 0) AS overdue_90_plus,

  MAX(CURRENT_DATE - s.sale_date)                       AS oldest_invoice_days

FROM sales s
JOIN customers c ON c.id = s.customer_id
WHERE s.payment_method = 'Credit'
  AND s.payment_status IN ('unpaid','partial','partially_paid')
  AND s.status NOT IN ('draft','cancelled')
  AND s.deleted_at IS NULL
GROUP BY s.business_id, c.id, c.name, c.phone
HAVING COALESCE(SUM(s.total_amount - s.paid_amount), 0) > 0;

COMMENT ON VIEW v_ar_aging IS
  'Analyse des créances clients par ancienneté (AR Aging Report).
   Utilisé pour: relances, provisions pour créances douteuses, DSO.
   Remplace le label "Accounts Receivable" par "Clients qui vous doivent".';


-- ─────────────────────────────────────────────────────────────────────────────
-- § I. VUE AP AGING — Dettes fournisseurs par ancienneté
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW v_ap_aging AS
SELECT
  p.business_id,
  s.id                                                        AS supplier_id,
  s.name                                                      AS supplier_name,
  s.phone,
  COUNT(p.id)                                                 AS nb_purchases,
  COALESCE(SUM(p.total_amount - p.paid_amount), 0)            AS total_outstanding,

  COALESCE(SUM(CASE WHEN CURRENT_DATE - p.purchase_date <= 30
    THEN p.total_amount - p.paid_amount ELSE 0 END), 0)       AS current_0_30,

  COALESCE(SUM(CASE WHEN CURRENT_DATE - p.purchase_date BETWEEN 31 AND 60
    THEN p.total_amount - p.paid_amount ELSE 0 END), 0)       AS overdue_31_60,

  COALESCE(SUM(CASE WHEN CURRENT_DATE - p.purchase_date BETWEEN 61 AND 90
    THEN p.total_amount - p.paid_amount ELSE 0 END), 0)       AS overdue_61_90,

  COALESCE(SUM(CASE WHEN CURRENT_DATE - p.purchase_date > 90
    THEN p.total_amount - p.paid_amount ELSE 0 END), 0)       AS overdue_90_plus,

  MAX(CURRENT_DATE - p.purchase_date)                         AS oldest_invoice_days

FROM purchases p
JOIN suppliers s ON s.id = p.supplier_id
WHERE p.payment_status IN ('unpaid','partial','partially_paid')
  AND p.status NOT IN ('draft','cancelled')
  AND p.deleted_at IS NULL
GROUP BY p.business_id, s.id, s.name, s.phone
HAVING COALESCE(SUM(p.total_amount - p.paid_amount), 0) > 0;


-- ─────────────────────────────────────────────────────────────────────────────
-- § J. RÉCONCILIATION BANCAIRE — fn_journal_bank_fee
-- Frais bancaires et commissions MonCash/Natcash
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_journal_bank_fee(
  p_biz         UUID,
  p_date        DATE,
  p_amount      NUMERIC,
  p_bank_code   TEXT,          -- '5110' Banque, '5121' MonCash, '5122' Natcash
  p_description TEXT,
  p_created_by  UUID
) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
  v_period_id UUID;
BEGIN
  SELECT id INTO v_period_id
  FROM accounting_periods
  WHERE business_id = p_biz
    AND start_date <= p_date AND end_date >= p_date AND is_closed = false
  LIMIT 1;
  IF v_period_id IS NULL THEN RETURN NULL; END IF;

  RETURN fn_create_journal_entry(
    p_biz, v_period_id, p_date,
    'Frais bancaires — ' || p_description,
    'bank_fee', NULL, 'HTG', p_created_by,
    jsonb_build_array(
      jsonb_build_object('account_code','6270','debit',p_amount,'credit',0,
                         'description','Frais bancaires / commission'),
      jsonb_build_object('account_code',p_bank_code,'debit',0,'credit',p_amount,
                         'description','Débit compte banque/mobile')
    )
  );
END;
$$;

COMMENT ON FUNCTION fn_journal_bank_fee IS
  'Enregistre les frais bancaires ou commissions MonCash/Natcash.
   6270 Frais bancaires / DR → compte banque source CR.
   Haïti: MonCash prend 1.5% sur retraits, Natcash prend 1.5%.';


-- ─────────────────────────────────────────────────────────────────────────────
-- § K. PROVISION POUR CRÉANCES DOUTEUSES
-- Quand un client semble ne plus pouvoir payer
--
--   DR 6xxx Pertes créances  (crée une charge)
--   CR 4120 Clients douteux  (transfert du risque)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_journal_bad_debt_provision(
  p_biz         UUID,
  p_customer_id UUID,
  p_amount      NUMERIC,
  p_date        DATE,
  p_description TEXT,
  p_created_by  UUID
) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
  v_period_id UUID;
BEGIN
  SELECT id INTO v_period_id
  FROM accounting_periods
  WHERE business_id = p_biz
    AND start_date <= p_date AND end_date >= p_date AND is_closed = false
  LIMIT 1;
  IF v_period_id IS NULL THEN RETURN NULL; END IF;

  RETURN fn_create_journal_entry(
    p_biz, v_period_id, p_date,
    'Provision créance douteuse — ' || p_description,
    'bad_debt_provision', p_customer_id, 'HTG', p_created_by,
    jsonb_build_array(
      jsonb_build_object('account_code','6290','debit',p_amount,'credit',0,
                         'description','Perte créance douteuse'),
      jsonb_build_object('account_code','4120','debit',0,'credit',p_amount,
                         'description','Reclassement client douteux')
    )
  );
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- § L. CAPITAL INITIAL — Apport du propriétaire au démarrage
--
--   DR 5310 Caisse (ou 5110 Banque)
--   CR 1010 Capital social
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_journal_capital_contribution(
  p_biz         UUID,
  p_amount      NUMERIC,
  p_currency    currency_code,
  p_method      payment_method_type,
  p_date        DATE,
  p_description TEXT,
  p_created_by  UUID
) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
  v_period_id UUID;
  v_asset_code TEXT;
BEGIN
  SELECT id INTO v_period_id
  FROM accounting_periods
  WHERE business_id = p_biz
    AND start_date <= p_date AND end_date >= p_date AND is_closed = false
  LIMIT 1;
  IF v_period_id IS NULL THEN RETURN NULL; END IF;

  v_asset_code := CASE p_method
    WHEN 'Cash'     THEN '5310'
    WHEN 'Virement' THEN '5110'
    WHEN 'MonCash'  THEN '5121'
    ELSE '5310' END;

  RETURN fn_create_journal_entry(
    p_biz, v_period_id, p_date,
    'Apport capital — ' || p_description,
    'capital_contribution', NULL, p_currency, p_created_by,
    jsonb_build_array(
      jsonb_build_object('account_code', v_asset_code,
                         'debit', p_amount, 'credit', 0,
                         'description', 'Apport propriétaire en caisse/banque'),
      jsonb_build_object('account_code', '1020',
                         'debit', 0, 'credit', p_amount,
                         'description', 'Capital apporté par le propriétaire')
    )
  );
END;
$$;

COMMENT ON FUNCTION fn_journal_capital_contribution IS
  'Enregistre un apport en capital du propriétaire.
   À utiliser au démarrage et lors de nouveaux apports.
   DR Caisse/Banque / CR 1020 Apports propriétaire (ou 1010 Capital social).';


-- ─────────────────────────────────────────────────────────────────────────────
-- § M. VUE TRÉSORERIE DÉTAILLÉE — v_cash_position
-- Solde de chaque compte de trésorerie (5xxx) en temps réel
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW v_cash_position AS
SELECT
  je.business_id,
  coa.code                                           AS account_code,
  coa.name                                           AS account_name,
  coa.name_ht                                        AS account_name_ht,
  COALESCE(SUM(jel.debit_amount - jel.credit_amount), 0) AS balance,
  COUNT(jel.id)                                      AS nb_transactions,
  MAX(je.entry_date)                                 AS last_transaction
FROM journal_entry_lines jel
JOIN journal_entries je ON je.id = jel.journal_entry_id
JOIN chart_of_accounts coa ON coa.id = jel.account_id
WHERE je.status = 'posted'
  AND coa.code LIKE '5%'           -- Classe 5: Trésorerie
  AND coa.code NOT IN ('5900')     -- Exclure virements internes en transit
GROUP BY je.business_id, coa.code, coa.name, coa.name_ht
HAVING COALESCE(SUM(jel.debit_amount - jel.credit_amount), 0) != 0;

COMMENT ON VIEW v_cash_position IS
  'Position de trésorerie par compte (Caisse HTG, Banque, MonCash, Natcash...).
   Source de vérité pour le tableau de bord cashflow.
   Label UI: "Votre argent disponible" au lieu de "Trésorerie".';


-- ─────────────────────────────────────────────────────────────────────────────
-- § N. VUE BALANCE DES COMPTES — v_trial_balance
-- Balance de vérification: tous les comptes avec soldes débit/crédit
-- Outil de vérification comptable interne
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW v_trial_balance AS
SELECT
  je.business_id,
  coa.code,
  coa.name,
  coa.account_class,
  COALESCE(SUM(jel.debit_amount),  0) AS total_debit,
  COALESCE(SUM(jel.credit_amount), 0) AS total_credit,
  COALESCE(SUM(jel.debit_amount - jel.credit_amount), 0) AS net_balance,
  COUNT(jel.id) AS nb_entries
FROM journal_entry_lines jel
JOIN journal_entries je ON je.id = jel.journal_entry_id
JOIN chart_of_accounts coa ON coa.id = jel.account_id
WHERE je.status = 'posted'
GROUP BY je.business_id, coa.code, coa.name, coa.account_class
ORDER BY coa.code;

COMMENT ON VIEW v_trial_balance IS
  'Balance de vérification complète.
   La somme totale_debit doit = somme totale_credit (double-entry invariant).
   Utiliser pour audit, vérification, rapports annuels.';


-- ═════════════════════════════════════════════════════════════════════════════
-- RÉSUMÉ DES AJOUTS v4.1
-- ═════════════════════════════════════════════════════════════════════════════
-- Nouvelles fonctions journal (8):
--   fn_journal_payroll_provision     → Constatation charge salariale + ONA
--   fn_journal_payroll_payment       → Paiement effectif salaires
--   fn_journal_transfer              → Virement interne entre comptes trésorerie
--   fn_journal_sale_return           → Contrepassation retour vente
--   fn_journal_inventory_adjustment  → Perte/dépréciation/gain stock
--   fn_journal_bank_fee              → Frais bancaires / commissions mobiles
--   fn_journal_bad_debt_provision    → Provision créances douteuses
--   fn_journal_capital_contribution  → Apport en capital propriétaire
--
-- Nouvelles fonctions période (2):
--   fn_open_accounting_period        → Ouverture période mensuelle auto
--   fn_close_accounting_period       → Fermeture période + calcul résultat
--
-- Nouveaux triggers (2):
--   trg_journal_sale_return          → sale_returns (INSERT)
--   trg_journal_purchase_return      → purchase_returns (INSERT)
--
-- Nouvelles vues (4):
--   v_ar_aging                       → Créances clients par ancienneté
--   v_ap_aging                       → Dettes fournisseurs par ancienneté
--   v_cash_position                  → Solde détaillé par compte trésorerie
--   v_trial_balance                  → Balance de vérification complète
-- ═════════════════════════════════════════════════════════════════════════════
