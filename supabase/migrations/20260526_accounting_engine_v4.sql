-- ══════════════════════════════════════════════════════════════════════════════
-- PROFITPILOT — MOTEUR COMPTABLE COMPLET v4.0
-- Double-entry accounting engine · SYSCOHADA Haiti · IFRS-Inspired
-- ══════════════════════════════════════════════════════════════════════════════
-- Ce fichier contient:
--   § 1  Plan comptable complet Haïti (seeder par business)
--   § 2  Résolution des comptes (helper fn_resolve_account)
--   § 3  Fonctions journal automatique par type de transaction
--   § 4  Fonctions de génération des états financiers
--   § 5  Vues analytiques temps réel (dashboard KPIs)
--   § 6  Score de santé financière
--   § 7  Détection d'anomalies (Pilot AI feed)
-- ══════════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- § 1. PLAN COMPTABLE GÉNÉRAL HAÏTI — SEEDER COMPLET
-- Appeler après création d'un business: SELECT fn_seed_chart_of_accounts(id)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_seed_chart_of_accounts(p_biz UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO chart_of_accounts
    (business_id, code, name, name_ht, account_class, is_system)
  VALUES

  -- ══════════════════════════════════════════
  -- CLASSE 1 — RESSOURCES DURABLES / CAPITAUX
  -- ══════════════════════════════════════════
  (p_biz,'1010','Capital social',             'Kapital sosyal',           'Equity',    true),
  (p_biz,'1020','Apports propriétaire',       'Apò pwopriyetè',           'Equity',    true),
  (p_biz,'1070','Réserves légales',           'Rezèv legal',              'Equity',    true),
  (p_biz,'1080','Report à nouveau',           'Rezilta ane anvan yo',     'Equity',    true),
  (p_biz,'1300','Résultat de l''exercice',    'Pwofi/Pèt ane a',          'Equity',    true),
  (p_biz,'1610','Emprunts bancaires LT',      'Prè bank alontèm',         'Liability', true),
  (p_biz,'1620','Prêts long terme',           'Prè alontèm',              'Liability', true),
  (p_biz,'1630','Dettes sur immobilisations', 'Det sou ekipman',          'Liability', true),

  -- ══════════════════════════════════════════
  -- CLASSE 2 — IMMOBILISATIONS (Actif fixe)
  -- ══════════════════════════════════════════
  (p_biz,'2100','Terrains',                   'Tèren',                    'Asset',     true),
  (p_biz,'2200','Bâtiments et constructions', 'Bilding ak konstriksyon',  'Asset',     true),
  (p_biz,'2300','Installations techniques',   'Enstalasyon teknik',       'Asset',     true),
  (p_biz,'2350','Matériel et outillage',       'Zouti ak ekipman',         'Asset',     true),
  (p_biz,'2410','Mobilier de bureau',         'Mèb biwo',                 'Asset',     true),
  (p_biz,'2420','Matériel informatique',      'Òdinatè ak pòtatif',       'Asset',     true),
  (p_biz,'2430','Téléphones professionnels',  'Telefòn biznis',           'Asset',     true),
  (p_biz,'2440','Équipements de magasin',     'Ekipman magazen',          'Asset',     true),
  (p_biz,'2500','Véhicules',                  'Machin ak moto',           'Asset',     true),
  (p_biz,'2800','Amortissements cumulés',     'Amotisman kimilatif',      'Asset',     true),  -- contra asset

  -- ══════════════════════════════════════════
  -- CLASSE 3 — STOCKS
  -- ══════════════════════════════════════════
  (p_biz,'3100','Matières premières',         'Matye premyè',             'Asset',     true),
  (p_biz,'3200','Emballages consommables',    'Pakaj',                    'Asset',     true),
  (p_biz,'3700','Stocks de marchandises',     'Stock machandiz',          'Asset',     true),
  (p_biz,'3800','Produits finis',             'Pwodui fini',              'Asset',     true),
  (p_biz,'3900','Dépréciation des stocks',    'Depresiasyon stock',       'Asset',     true),  -- contra asset

  -- ══════════════════════════════════════════
  -- CLASSE 4 — COMPTES DE TIERS (AR / AP)
  -- ══════════════════════════════════════════
  -- AP — Dettes fournisseurs
  (p_biz,'4010','Fournisseurs — Dettes AP',   'Founisè yo dwe nou',       'Liability', true),
  (p_biz,'4020','Fournisseurs — Effets',      'Biye peyab',               'Liability', true),
  -- AR — Créances clients
  (p_biz,'4110','Clients — Créances AR',      'Kliyan ki dwe nou',        'Asset',     true),
  (p_biz,'4120','Clients douteux',            'Kliyan doutè',             'Asset',     true),
  (p_biz,'4190','Avances reçues clients',     'Avans kliyan resevwa',     'Liability', true),
  -- Personnel
  (p_biz,'4200','Personnel — Salaires à payer','Salè pou peye',           'Liability', true),
  (p_biz,'4300','ONA / OFATMA à payer',       'ONA/OFATMA pou peye',      'Liability', true),
  -- État / Taxes
  (p_biz,'4440','Impôts et taxes à payer',    'Taks pou peye',            'Liability', true),
  (p_biz,'4450','TCA collectée',              'TCA kolekte',              'Liability', true),
  (p_biz,'4460','TCA déductible',             'TCA dediktib',             'Asset',     true),
  -- Propriétaire
  (p_biz,'4580','Prélèvements propriétaire',  'Prelèvman pwopriyetè',     'Equity',    true),  -- contra equity
  -- Divers tiers
  (p_biz,'4710','Avances versées fournisseurs','Avans peye founisè',      'Asset',     true),
  (p_biz,'4810','Charges à payer',            'Chaj pou regle',           'Liability', true),
  (p_biz,'4820','Produits constatés d''avance','Revni avanse',            'Liability', true),

  -- ══════════════════════════════════════════
  -- CLASSE 5 — TRÉSORERIE (Cash & Banking)
  -- ══════════════════════════════════════════
  (p_biz,'5110','Banque — Compte HTG',        'Bank HTG',                 'Asset',     true),
  (p_biz,'5120','Banque — Compte USD',        'Bank USD',                 'Asset',     true),
  (p_biz,'5121','MonCash',                    'MonCash',                  'Asset',     true),
  (p_biz,'5122','Natcash',                    'Natcash',                  'Asset',     true),
  (p_biz,'5123','Carte bancaire (débit)',      'Kat bank',                 'Asset',     true),
  (p_biz,'5124','Zelle / Virement USD',       'Zelle / Vire USD',         'Asset',     true),
  (p_biz,'5310','Caisse HTG',                 'Kès HTG',                  'Asset',     true),
  (p_biz,'5320','Caisse USD',                 'Kès USD',                  'Asset',     true),
  (p_biz,'5330','Petite caisse',              'Ti kès',                   'Asset',     true),
  (p_biz,'5900','Virements internes',         'Transfè entèn',            'Asset',     true),

  -- ══════════════════════════════════════════
  -- CLASSE 6 — CHARGES (Expenses)
  -- ══════════════════════════════════════════
  -- COGS
  (p_biz,'6010','Achats de marchandises',     'Acha machandiz',           'Expense',   true),
  (p_biz,'6020','Variation de stocks',        'Chanjman stock',           'Expense',   true),
  (p_biz,'6030','Achats matières premières',  'Acha matye premyè',        'Expense',   true),
  (p_biz,'6100','Transport sur achats',       'Frè transpò sou acha',     'Expense',   true),
  (p_biz,'6900','Coût marchandises vendues',  'Koù machandiz vann (COGS)','Expense',   true),
  -- Charges locatives
  (p_biz,'6130','Loyers et charges locatives','Lwaye ak chaj lokasyon',   'Expense',   true),
  (p_biz,'6140','Charges locatives diverses', 'Lòt chaj lokasyon',        'Expense',   true),
  -- Charges d'exploitation
  (p_biz,'6150','Entretien et réparations',   'Antretyen ak reparasyon',  'Expense',   true),
  (p_biz,'6160','Primes d''assurances',       'Asirans',                  'Expense',   true),
  (p_biz,'6220','Fournitures de bureau',      'Founiti biwo',             'Expense',   true),
  (p_biz,'6230','Publicité et marketing',     'Piblisite ak maketing',    'Expense',   true),
  (p_biz,'6240','Transport et déplacements',  'Transpò ak deplasман',     'Expense',   true),
  (p_biz,'6250','Carburant et énergie',       'Gaz ak enèji',             'Expense',   true),
  (p_biz,'6260','Téléphone et Internet',      'Telefòn ak entènèt',       'Expense',   true),
  (p_biz,'6270','Frais bancaires',            'Frè bank ak finansye',     'Expense',   true),
  (p_biz,'6280','Commissions digitales',      'Komisyon dijital',         'Expense',   true),
  (p_biz,'6290','Charges diverses',           'Lòt depans divès',         'Expense',   true),
  -- Impôts & Taxes
  (p_biz,'6300','Impôts et taxes directs',    'Taks dirèk',               'Expense',   true),
  (p_biz,'6350','Patente et licences',        'Patant ak lisans',         'Expense',   true),
  -- Personnel
  (p_biz,'6410','Salaires et traitements',    'Salè anplwaye',            'Expense',   true),
  (p_biz,'6420','Rémunérations dirigeants',   'Salè dirigean',            'Expense',   true),
  (p_biz,'6430','Charges sociales ONA',       'Chaj sosyal ONA/OFATMA',   'Expense',   true),
  -- Autres
  (p_biz,'6500','Autres charges opérat.',     'Lòt depans operasyonèl',   'Expense',   true),
  (p_biz,'6600','Charges financières',        'Enterè ak chaj finansye',  'Expense',   true),
  (p_biz,'6700','Charges exceptionnelles',    'Depans eksepsyonèl',       'Expense',   true),
  (p_biz,'6810','Dotations amortissements',   'Amotisman chak mwa',       'Expense',   true),

  -- ══════════════════════════════════════════
  -- CLASSE 7 — PRODUITS (Revenue)
  -- ══════════════════════════════════════════
  (p_biz,'7010','Ventes de marchandises',     'Vant machandiz',           'Revenue',   true),
  (p_biz,'7020','Prestations de services',    'Sèvis bay',                'Revenue',   true),
  (p_biz,'7030','Revenus de livraison',       'Revni livrezon',           'Revenue',   true),
  (p_biz,'7040','Commissions et honoraires',  'Komisyon ak onorè',        'Revenue',   true),
  (p_biz,'7050','Ventes en ligne',            'Vant sou entènèt',         'Revenue',   true),
  (p_biz,'7090','Autres revenus',             'Lòt revni',                'Revenue',   true),
  (p_biz,'7091','Revenus financiers',         'Revni finansye',           'Revenue',   true),
  (p_biz,'7600','Produits exceptionnels',     'Revni eksepsyonèl',        'Revenue',   true),
  (p_biz,'7090R','Retours sur ventes',        'Retou sou vant',           'ContraRevenue', true)

  ON CONFLICT (business_id, code) DO UPDATE SET
    name    = EXCLUDED.name,
    name_ht = EXCLUDED.name_ht;
END;
$$;

COMMENT ON FUNCTION fn_seed_chart_of_accounts IS
  'Initialise le Plan Comptable Général Haïti (PCG-HT) pour un business.
   Appeler une seule fois à la création du business.
   Standards: SYSCOHADA adapté + contexte haïtien (MonCash, TCA, ONA).';


-- ─────────────────────────────────────────────────────────────────────────────
-- § 2. RÉSOLUTION DES COMPTES — fn_resolve_account
-- Trouve l'ID d'un compte par son code pour un business donné.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_resolve_account(p_biz UUID, p_code TEXT)
RETURNS UUID LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_id UUID;
BEGIN
  SELECT id INTO v_id
  FROM chart_of_accounts
  WHERE business_id = p_biz AND code = p_code AND is_active = true
  LIMIT 1;
  RETURN v_id;  -- retourne NULL si compte non trouvé (non bloquant)
END;
$$;

-- Résoudre compte de caisse/banque selon méthode de paiement
CREATE OR REPLACE FUNCTION fn_payment_account(p_biz UUID, p_method payment_method_type)
RETURNS UUID LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN fn_resolve_account(p_biz,
    CASE p_method
      WHEN 'Cash'     THEN '5310'   -- Caisse HTG
      WHEN 'MonCash'  THEN '5121'   -- MonCash
      WHEN 'Natcash'  THEN '5122'   -- Natcash
      WHEN 'Card'     THEN '5123'   -- Carte bancaire
      WHEN 'Virement' THEN '5110'   -- Banque HTG
      WHEN 'Cheque'   THEN '5110'   -- Banque HTG
      WHEN 'Credit'   THEN '4110'   -- Compte client AR (à recevoir)
      ELSE                 '5310'   -- Caisse par défaut
    END
  );
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- § 3. FONCTIONS JOURNAL AUTOMATIQUE — Une par type de transaction
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Helper: Créer une écriture avec ses lignes en une seule fois ─────────────
CREATE OR REPLACE FUNCTION fn_create_journal_entry(
  p_biz         UUID,
  p_period_id   UUID,
  p_date        DATE,
  p_description TEXT,
  p_ref_type    TEXT,
  p_ref_id      UUID,
  p_currency    currency_code,
  p_created_by  UUID,
  p_lines       JSONB    -- [{"account_code":"5310","debit":1500,"credit":0},...]
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_je_id      UUID;
  v_total_dr   NUMERIC := 0;
  v_total_cr   NUMERIC := 0;
  v_line       JSONB;
  v_acct_id    UUID;
BEGIN
  -- Calcul des totaux
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_total_dr := v_total_dr + COALESCE((v_line->>'debit')::NUMERIC, 0);
    v_total_cr := v_total_cr + COALESCE((v_line->>'credit')::NUMERIC, 0);
  END LOOP;

  -- Validation équilibre (arrondi 4 décimales)
  IF ABS(v_total_dr - v_total_cr) > 0.0001 THEN
    RAISE EXCEPTION 'Écriture déséquilibrée: DR=% CR=% pour %', v_total_dr, v_total_cr, p_description;
  END IF;

  -- Création entête
  INSERT INTO journal_entries (
    business_id, period_id, entry_number, entry_date,
    reference_type, reference_id, description,
    status, currency, total_debit, total_credit,
    is_auto, created_by
  ) VALUES (
    p_biz, p_period_id, fn_gen_ref('JE'), p_date,
    p_ref_type, p_ref_id, p_description,
    'posted', p_currency, v_total_dr, v_total_cr,
    true, p_created_by
  ) RETURNING id INTO v_je_id;

  -- Création des lignes
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_acct_id := fn_resolve_account(p_biz, v_line->>'account_code');
    IF v_acct_id IS NOT NULL THEN
      INSERT INTO journal_entry_lines (
        journal_entry_id, business_id, account_id, description,
        debit_amount, credit_amount, currency,
        base_debit, base_credit
      ) VALUES (
        v_je_id, p_biz, v_acct_id,
        COALESCE(v_line->>'description', ''),
        COALESCE((v_line->>'debit')::NUMERIC,  0),
        COALESCE((v_line->>'credit')::NUMERIC, 0),
        p_currency,
        COALESCE((v_line->>'debit')::NUMERIC,  0),
        COALESCE((v_line->>'credit')::NUMERIC, 0)
      );
    END IF;
  END LOOP;

  RETURN v_je_id;
END;
$$;


-- ── RÈGLE 1+2: VENTE (Cash ou Crédit) ────────────────────────────────────────
-- Déclenché par trigger sur sales (INSERT ou status → confirmed/paid)
CREATE OR REPLACE FUNCTION fn_auto_journal_sale()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_period_id   UUID;
  v_pay_code    TEXT;
  v_ar_code     TEXT  := '4110';   -- Clients AR
  v_rev_code    TEXT  := '7010';   -- Ventes marchandises
  v_cogs_code   TEXT  := '6900';   -- COGS
  v_stock_code  TEXT  := '3700';   -- Stock marchandises
  v_cogs_amount NUMERIC;
BEGIN
  -- Ignorer drafts et annulations
  IF NEW.status NOT IN ('confirmed','invoiced','partially_paid','paid') THEN RETURN NEW; END IF;
  -- Éviter doublons sur UPDATE
  IF TG_OP = 'UPDATE' AND OLD.status = NEW.status THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IN ('confirmed','invoiced','partially_paid','paid') THEN RETURN NEW; END IF;

  -- Trouver période comptable ouverte
  SELECT id INTO v_period_id
  FROM accounting_periods
  WHERE business_id = NEW.business_id
    AND start_date <= NEW.sale_date
    AND end_date   >= NEW.sale_date
    AND is_closed  = false
  LIMIT 1;
  IF v_period_id IS NULL THEN RETURN NEW; END IF;

  -- Compte de débit selon méthode de paiement
  v_pay_code := CASE NEW.payment_method
    WHEN 'Cash'     THEN '5310'
    WHEN 'MonCash'  THEN '5121'
    WHEN 'Natcash'  THEN '5122'
    WHEN 'Card'     THEN '5123'
    WHEN 'Virement' THEN '5110'
    WHEN 'Cheque'   THEN '5110'
    WHEN 'Credit'   THEN '4110'   -- Vente à crédit: DR Clients
    ELSE                 '4110'   -- Par défaut: crédit → AR
  END;

  -- ÉCRITURE 1: Reconnaissance du revenu
  PERFORM fn_create_journal_entry(
    NEW.business_id, v_period_id, NEW.sale_date,
    'Vente - ' || NEW.invoice_number,
    'sale', NEW.id, NEW.currency, NEW.created_by,
    jsonb_build_array(
      jsonb_build_object('account_code', v_pay_code,
                         'debit', NEW.total_amount, 'credit', 0,
                         'description', 'Encaissement vente'),
      jsonb_build_object('account_code', v_rev_code,
                         'debit', 0, 'credit', NEW.total_amount,
                         'description', 'Revenu ventes')
    )
  );

  -- ÉCRITURE 2: COGS (calcul coût des marchandises vendues)
  SELECT COALESCE(SUM(si.cost_price * si.quantity), 0)
  INTO v_cogs_amount
  FROM sale_items si WHERE si.sale_id = NEW.id;

  IF v_cogs_amount > 0 THEN
    PERFORM fn_create_journal_entry(
      NEW.business_id, v_period_id, NEW.sale_date,
      'COGS - ' || NEW.invoice_number,
      'sale_cogs', NEW.id, NEW.currency, NEW.created_by,
      jsonb_build_array(
        jsonb_build_object('account_code', v_cogs_code,
                           'debit', v_cogs_amount, 'credit', 0,
                           'description', 'Coût marchandises vendues'),
        jsonb_build_object('account_code', v_stock_code,
                           'debit', 0, 'credit', v_cogs_amount,
                           'description', 'Sortie stock')
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_journal_sale ON sales;
CREATE TRIGGER trg_journal_sale
  AFTER INSERT OR UPDATE OF status ON sales
  FOR EACH ROW EXECUTE FUNCTION fn_auto_journal_sale();


-- ── RÈGLE 3: PAIEMENT CLIENT (Règlement créance) ──────────────────────────────
-- Déclenché quand un paiement est reçu sur une vente à crédit
CREATE OR REPLACE FUNCTION fn_auto_journal_sale_payment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_period_id  UUID;
  v_sale_date  DATE;
  v_sale_inv   TEXT;
  v_pay_method payment_method_type;
  v_pay_code   TEXT;
  v_orig_method payment_method_type;
BEGIN
  -- Cherche la vente pour connaître le mode de paiement original
  SELECT sale_date, invoice_number, payment_method
  INTO v_sale_date, v_sale_inv, v_orig_method
  FROM sales WHERE id = NEW.sale_id;

  -- N'écrire que si la vente était à crédit (sinon déjà écrite dans fn_auto_journal_sale)
  IF v_orig_method != 'Credit' THEN RETURN NEW; END IF;

  SELECT id INTO v_period_id
  FROM accounting_periods
  WHERE business_id = NEW.business_id
    AND start_date <= NEW.payment_date
    AND end_date   >= NEW.payment_date
    AND is_closed  = false LIMIT 1;
  IF v_period_id IS NULL THEN RETURN NEW; END IF;

  v_pay_code := CASE NEW.payment_method
    WHEN 'Cash'     THEN '5310'
    WHEN 'MonCash'  THEN '5121'
    WHEN 'Natcash'  THEN '5122'
    WHEN 'Card'     THEN '5123'
    ELSE '5110' END;

  -- DR Caisse / CR Clients AR
  PERFORM fn_create_journal_entry(
    NEW.business_id, v_period_id, NEW.payment_date,
    'Paiement client - ' || v_sale_inv,
    'sale_payment', NEW.id, NEW.currency, NEW.received_by,
    jsonb_build_array(
      jsonb_build_object('account_code', v_pay_code,
                         'debit', NEW.amount, 'credit', 0,
                         'description', 'Encaissement'),
      jsonb_build_object('account_code', '4110',
                         'debit', 0, 'credit', NEW.amount,
                         'description', 'Règlement créance client')
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_journal_sale_payment ON sale_payments;
CREATE TRIGGER trg_journal_sale_payment
  AFTER INSERT ON sale_payments
  FOR EACH ROW EXECUTE FUNCTION fn_auto_journal_sale_payment();


-- ── RÈGLE 4+5: ACHAT STOCK (Cash ou Crédit) ──────────────────────────────────
CREATE OR REPLACE FUNCTION fn_auto_journal_purchase()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_period_id UUID;
  v_cr_code   TEXT;   -- compte à créditer (caisse ou fournisseurs)
BEGIN
  IF NEW.status NOT IN ('confirmed','invoiced','partially_paid','paid') THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = NEW.status THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IN ('confirmed','invoiced','partially_paid','paid') THEN RETURN NEW; END IF;

  SELECT id INTO v_period_id
  FROM accounting_periods
  WHERE business_id = NEW.business_id
    AND start_date <= NEW.purchase_date
    AND end_date   >= NEW.purchase_date
    AND is_closed  = false LIMIT 1;
  IF v_period_id IS NULL THEN RETURN NEW; END IF;

  -- Détermine si paiement cash ou à crédit
  v_cr_code := CASE NEW.payment_status
    WHEN 'paid'    THEN CASE NEW.payment_method
                          WHEN 'Cash'     THEN '5310'
                          WHEN 'MonCash'  THEN '5121'
                          WHEN 'Natcash'  THEN '5122'
                          ELSE '5110' END
    WHEN 'credit'  THEN '4010'   -- Fournisseurs AP
    WHEN 'partial' THEN '4010'   -- Traiter comme crédit, paiements séparés
    ELSE '4010'
  END;

  -- DR Stock / CR Caisse ou Fournisseurs
  PERFORM fn_create_journal_entry(
    NEW.business_id, v_period_id, NEW.purchase_date,
    'Achat - ' || NEW.po_number,
    'purchase', NEW.id, NEW.currency, NEW.created_by,
    jsonb_build_array(
      jsonb_build_object('account_code', '3700',
                         'debit', NEW.total_amount, 'credit', 0,
                         'description', 'Entrée stock marchandises'),
      jsonb_build_object('account_code', v_cr_code,
                         'debit', 0, 'credit', NEW.total_amount,
                         'description', CASE WHEN v_cr_code = '4010'
                                             THEN 'Dette fournisseur créée'
                                             ELSE 'Paiement achat' END)
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_journal_purchase ON purchases;
CREATE TRIGGER trg_journal_purchase
  AFTER INSERT OR UPDATE OF status ON purchases
  FOR EACH ROW EXECUTE FUNCTION fn_auto_journal_purchase();


-- ── RÈGLE 6: PAIEMENT FOURNISSEUR ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_auto_journal_purchase_payment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_period_id UUID;
  v_pay_code  TEXT;
  v_po_num    TEXT;
BEGIN
  SELECT po_number INTO v_po_num FROM purchases WHERE id = NEW.purchase_id;

  SELECT id INTO v_period_id
  FROM accounting_periods
  WHERE business_id = NEW.business_id
    AND start_date <= NEW.payment_date
    AND end_date   >= NEW.payment_date
    AND is_closed  = false LIMIT 1;
  IF v_period_id IS NULL THEN RETURN NEW; END IF;

  v_pay_code := CASE NEW.payment_method
    WHEN 'Cash'     THEN '5310'
    WHEN 'MonCash'  THEN '5121'
    WHEN 'Natcash'  THEN '5122'
    WHEN 'Card'     THEN '5123'
    ELSE '5110' END;

  -- DR Fournisseurs / CR Caisse/Banque
  PERFORM fn_create_journal_entry(
    NEW.business_id, v_period_id, NEW.payment_date,
    'Paiement fournisseur - ' || v_po_num,
    'purchase_payment', NEW.id, NEW.currency, NEW.paid_by,
    jsonb_build_array(
      jsonb_build_object('account_code', '4010',
                         'debit', NEW.amount, 'credit', 0,
                         'description', 'Règlement dette fournisseur'),
      jsonb_build_object('account_code', v_pay_code,
                         'debit', 0, 'credit', NEW.amount,
                         'description', 'Sortie trésorerie')
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_journal_purch_payment ON purchase_payments;
CREATE TRIGGER trg_journal_purch_payment
  AFTER INSERT ON purchase_payments
  FOR EACH ROW EXECUTE FUNCTION fn_auto_journal_purchase_payment();


-- ── RÈGLE 7+8: DÉPENSE (Cash ou À payer) ──────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_auto_journal_expense()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_period_id UUID;
  v_exp_code  TEXT;
  v_cr_code   TEXT;
BEGIN
  SELECT id INTO v_period_id
  FROM accounting_periods
  WHERE business_id = NEW.business_id
    AND start_date <= NEW.expense_date
    AND end_date   >= NEW.expense_date
    AND is_closed  = false LIMIT 1;
  IF v_period_id IS NULL THEN RETURN NEW; END IF;

  -- Résoudre le compte de charge à partir de la catégorie
  SELECT coa.code INTO v_exp_code
  FROM chart_of_accounts coa
  JOIN expense_categories ec
    ON ec.account_code = coa.code AND ec.business_id = NEW.business_id
  WHERE ec.id = NEW.category_id LIMIT 1;

  -- Fallback: charge diverse
  v_exp_code := COALESCE(v_exp_code, '6500');

  -- Compte à créditer selon statut paiement
  v_cr_code := CASE
    WHEN NEW.payment_status IN ('paid')   THEN
      CASE NEW.payment_method
        WHEN 'Cash'     THEN '5310'
        WHEN 'MonCash'  THEN '5121'
        WHEN 'Natcash'  THEN '5122'
        ELSE '5110' END
    WHEN NEW.payment_status = 'credit'    THEN '4810'  -- Charges à payer
    WHEN NEW.payment_status = 'pending'   THEN '4810'
    ELSE '5310'
  END;

  PERFORM fn_create_journal_entry(
    NEW.business_id, v_period_id, NEW.expense_date,
    'Dépense - ' || NEW.description,
    'expense', NEW.id, NEW.currency, NEW.created_by,
    jsonb_build_array(
      jsonb_build_object('account_code', v_exp_code,
                         'debit', NEW.amount, 'credit', 0,
                         'description', NEW.description),
      jsonb_build_object('account_code', v_cr_code,
                         'debit', 0, 'credit', NEW.amount,
                         'description', CASE WHEN v_cr_code = '4810'
                                             THEN 'Charge à payer'
                                             ELSE 'Paiement dépense' END)
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_journal_expense ON expenses;
CREATE TRIGGER trg_journal_expense
  AFTER INSERT ON expenses
  FOR EACH ROW EXECUTE FUNCTION fn_auto_journal_expense();


-- ── RÈGLE 11: PRÉLÈVEMENT PROPRIÉTAIRE ────────────────────────────────────────
-- Appelée manuellement (pas de trigger automatique — action délibérée)
CREATE OR REPLACE FUNCTION fn_journal_owner_withdrawal(
  p_biz        UUID,
  p_amount     NUMERIC,
  p_currency   currency_code,
  p_method     payment_method_type,
  p_date       DATE,
  p_notes      TEXT,
  p_created_by UUID
) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
  v_period_id UUID;
  v_pay_code  TEXT;
  v_je_id     UUID;
BEGIN
  SELECT id INTO v_period_id
  FROM accounting_periods
  WHERE business_id = p_biz
    AND start_date <= p_date AND end_date >= p_date AND is_closed = false LIMIT 1;

  v_pay_code := CASE p_method WHEN 'Cash' THEN '5310' ELSE '5110' END;

  v_je_id := fn_create_journal_entry(
    p_biz, v_period_id, p_date,
    'Prélèvement propriétaire - ' || COALESCE(p_notes,''),
    'owner_withdrawal', NULL, p_currency, p_created_by,
    jsonb_build_array(
      jsonb_build_object('account_code','4580',
                         'debit',p_amount,'credit',0,
                         'description','Prélèvement personnel'),
      jsonb_build_object('account_code',v_pay_code,
                         'debit',0,'credit',p_amount,
                         'description','Sortie caisse/banque')
    )
  );
  RETURN v_je_id;
END;
$$;


-- ── RÈGLE 9: PRÊT REÇU ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_journal_loan_received(
  p_biz        UUID,
  p_amount     NUMERIC,
  p_currency   currency_code,
  p_date       DATE,
  p_description TEXT,
  p_created_by UUID
) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE v_period_id UUID; BEGIN
  SELECT id INTO v_period_id FROM accounting_periods
  WHERE business_id = p_biz AND start_date <= p_date AND end_date >= p_date
    AND is_closed = false LIMIT 1;

  RETURN fn_create_journal_entry(
    p_biz, v_period_id, p_date,
    'Prêt reçu - ' || p_description,
    'loan_received', NULL, p_currency, p_created_by,
    jsonb_build_array(
      jsonb_build_object('account_code','5110','debit',p_amount,'credit',0,
                         'description','Fonds reçus banque'),
      jsonb_build_object('account_code','1610','debit',0,'credit',p_amount,
                         'description','Emprunt bancaire créé')
    )
  );
END;
$$;


-- ── RÈGLE 10: REMBOURSEMENT PRÊT ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_journal_loan_repayment(
  p_biz          UUID,
  p_principal    NUMERIC,
  p_interest     NUMERIC,
  p_currency     currency_code,
  p_date         DATE,
  p_description  TEXT,
  p_created_by   UUID
) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE v_period_id UUID; v_total NUMERIC;
BEGIN
  v_total := p_principal + p_interest;
  SELECT id INTO v_period_id FROM accounting_periods
  WHERE business_id = p_biz AND start_date <= p_date AND end_date >= p_date
    AND is_closed = false LIMIT 1;

  RETURN fn_create_journal_entry(
    p_biz, v_period_id, p_date,
    'Remboursement prêt - ' || p_description,
    'loan_repayment', NULL, p_currency, p_created_by,
    jsonb_build_array(
      jsonb_build_object('account_code','1610','debit',p_principal,'credit',0,
                         'description','Remboursement capital'),
      jsonb_build_object('account_code','6600','debit',p_interest,'credit',0,
                         'description','Charges intérêts'),
      jsonb_build_object('account_code','5110','debit',0,'credit',v_total,
                         'description','Paiement banque')
    )
  );
END;
$$;


-- ── RÈGLE 13: ACHAT IMMOBILISATION ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_journal_asset_purchase(
  p_biz         UUID,
  p_amount      NUMERIC,
  p_currency    currency_code,
  p_asset_code  TEXT,   -- ex: '2420' pour ordinateur
  p_method      payment_method_type,
  p_date        DATE,
  p_description TEXT,
  p_created_by  UUID
) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
  v_period_id UUID;
  v_pay_code  TEXT;
BEGIN
  SELECT id INTO v_period_id FROM accounting_periods
  WHERE business_id = p_biz AND start_date <= p_date AND end_date >= p_date
    AND is_closed = false LIMIT 1;

  v_pay_code := CASE p_method WHEN 'Cash' THEN '5310'
                               WHEN 'MonCash' THEN '5121'
                               ELSE '5110' END;

  RETURN fn_create_journal_entry(
    p_biz, v_period_id, p_date,
    'Acquisition immobilisation - ' || p_description,
    'asset_purchase', NULL, p_currency, p_created_by,
    jsonb_build_array(
      jsonb_build_object('account_code', p_asset_code,
                         'debit', p_amount, 'credit', 0,
                         'description', 'Immobilisation acquise'),
      jsonb_build_object('account_code', v_pay_code,
                         'debit', 0, 'credit', p_amount,
                         'description', 'Paiement immobilisation')
    )
  );
END;
$$;


-- ── RÈGLE 14: AMORTISSEMENT MENSUEL AUTOMATIQUE ───────────────────────────────
CREATE OR REPLACE FUNCTION fn_journal_depreciation(
  p_biz         UUID,
  p_period_id   UUID,
  p_asset_id    UUID,   -- ID dans chart_of_accounts
  p_amount      NUMERIC,
  p_currency    currency_code,
  p_date        DATE,
  p_description TEXT,
  p_created_by  UUID
) RETURNS UUID LANGUAGE plpgsql AS $$
BEGIN
  RETURN fn_create_journal_entry(
    p_biz, p_period_id, p_date,
    'Amortissement - ' || p_description,
    'depreciation', p_asset_id, p_currency, p_created_by,
    jsonb_build_array(
      jsonb_build_object('account_code','6810','debit',p_amount,'credit',0,
                         'description','Dotation amortissement'),
      jsonb_build_object('account_code','2800','debit',0,'credit',p_amount,
                         'description','Amortissement cumulé')
    )
  );
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- § 4. GÉNÉRATION DES ÉTATS FINANCIERS
-- Fonctions de calcul en temps réel à partir des journal_entry_lines
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Solde d'un compte pour une période ───────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_account_balance(
  p_biz      UUID,
  p_code     TEXT,
  p_from     DATE,
  p_to       DATE
) RETURNS NUMERIC LANGUAGE plpgsql STABLE AS $$
DECLARE v_balance NUMERIC := 0;
BEGIN
  SELECT COALESCE(SUM(jel.debit_amount - jel.credit_amount), 0)
  INTO v_balance
  FROM journal_entry_lines jel
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  JOIN chart_of_accounts coa ON coa.id = jel.account_id
  WHERE je.business_id = p_biz
    AND coa.code = p_code
    AND je.entry_date BETWEEN p_from AND p_to
    AND je.status = 'posted';
  RETURN v_balance;
END;
$$;

-- ── Somme d'une classe de comptes ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_class_balance(
  p_biz        UUID,
  p_class      account_class_type,
  p_from       DATE,
  p_to         DATE,
  p_code_like  TEXT DEFAULT '%'   -- filtre optionnel ex: '7%' pour tout class 7
) RETURNS NUMERIC LANGUAGE plpgsql STABLE AS $$
DECLARE v_balance NUMERIC := 0;
BEGIN
  SELECT COALESCE(SUM(jel.debit_amount - jel.credit_amount), 0)
  INTO v_balance
  FROM journal_entry_lines jel
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  JOIN chart_of_accounts coa ON coa.id = jel.account_id
  WHERE je.business_id  = p_biz
    AND coa.account_class = p_class
    AND coa.code LIKE p_code_like
    AND je.entry_date BETWEEN p_from AND p_to
    AND je.status = 'posted';
  RETURN v_balance;
END;
$$;

-- ── ÉTAT DES RÉSULTATS (P&L) ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_income_statement(
  p_biz  UUID,
  p_from DATE,
  p_to   DATE
) RETURNS TABLE (
  label              TEXT,
  code               TEXT,
  amount             NUMERIC,
  category           TEXT,
  is_subtotal        BOOLEAN
) LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_gross_rev    NUMERIC;
  v_returns      NUMERIC;
  v_net_rev      NUMERIC;
  v_cogs         NUMERIC;
  v_gross_profit NUMERIC;
  v_op_exp       NUMERIC;
  v_op_income    NUMERIC;
  v_fin_exp      NUMERIC;
  v_fin_inc      NUMERIC;
  v_ebt          NUMERIC;
  v_taxes        NUMERIC;
  v_net_income   NUMERIC;
BEGIN
  -- Revenus (classe 7 = signe négatif en DR-CR car normal_balance=credit)
  v_gross_rev    := -fn_class_balance(p_biz, 'Revenue', p_from, p_to, '%');
  v_returns      :=  fn_class_balance(p_biz, 'ContraRevenue', p_from, p_to, '%');
  v_net_rev      := v_gross_rev - v_returns;

  -- COGS
  v_cogs         :=  fn_class_balance(p_biz, 'Expense', p_from, p_to, '6%');
  v_gross_profit := v_net_rev - v_cogs;

  -- Charges d'exploitation (6xxx sauf 6600 et 6810 et 6900)
  v_op_exp       :=  fn_class_balance(p_biz, 'Expense', p_from, p_to, '6[0-5]%')
                   + fn_class_balance(p_biz, 'Expense', p_from, p_to, '67%')
                   + fn_class_balance(p_biz, 'Expense', p_from, p_to, '68%');
  v_op_income    := v_gross_profit - v_op_exp;

  -- Charges financières
  v_fin_exp      :=  fn_class_balance(p_biz, 'Expense', p_from, p_to, '66%');
  v_fin_inc      := -fn_class_balance(p_biz, 'Revenue', p_from, p_to, '7091%');

  v_ebt          := v_op_income - v_fin_exp + v_fin_inc;
  v_taxes        :=  fn_class_balance(p_biz, 'Expense', p_from, p_to, '63%');
  v_net_income   := v_ebt - v_taxes;

  RETURN QUERY VALUES
    ('Ventes marchandises',               '7010', -fn_account_balance(p_biz,'7010',p_from,p_to),    'revenue',       false),
    ('Prestations de services',           '7020', -fn_account_balance(p_biz,'7020',p_from,p_to),    'revenue',       false),
    ('Autres revenus',                    '7090',  -fn_account_balance(p_biz,'7090',p_from,p_to),   'revenue',       false),
    ('(−) Retours sur ventes',            '7090R', fn_account_balance(p_biz,'7090R',p_from,p_to),   'contra_revenue',false),
    ('REVENUS NETS',                      '---',   v_net_rev,                                         'subtotal',      true),
    ('Coût marchandises vendues',         '6900',  fn_account_balance(p_biz,'6900',p_from,p_to),    'cogs',          false),
    ('MARGE BRUTE',                       '---',   v_gross_profit,                                    'subtotal',      true),
    ('Salaires',                          '6410',  fn_account_balance(p_biz,'6410',p_from,p_to),    'opex',          false),
    ('Loyer',                             '6130',  fn_account_balance(p_biz,'6130',p_from,p_to),    'opex',          false),
    ('Téléphone/Internet',                '6260',  fn_account_balance(p_biz,'6260',p_from,p_to),    'opex',          false),
    ('Marketing',                         '6230',  fn_account_balance(p_biz,'6230',p_from,p_to),    'opex',          false),
    ('Transport',                         '6240',  fn_account_balance(p_biz,'6240',p_from,p_to),    'opex',          false),
    ('Frais bancaires',                   '6270',  fn_account_balance(p_biz,'6270',p_from,p_to),    'opex',          false),
    ('Autres charges',                    '6500',  fn_account_balance(p_biz,'6500',p_from,p_to),    'opex',          false),
    ('Amortissements',                    '6810',  fn_account_balance(p_biz,'6810',p_from,p_to),    'opex',          false),
    ('RÉSULTAT D''EXPLOITATION',          '---',   v_op_income,                                       'subtotal',      true),
    ('Charges financières (intérêts)',    '6600',  fn_account_balance(p_biz,'6600',p_from,p_to),    'financial',     false),
    ('Revenus financiers',                '7091', -fn_account_balance(p_biz,'7091',p_from,p_to),    'financial',     false),
    ('RÉSULTAT AVANT IMPÔTS',             '---',   v_ebt,                                             'subtotal',      true),
    ('Impôts et taxes',                   '6300',  fn_account_balance(p_biz,'6300',p_from,p_to),    'tax',           false),
    ('RÉSULTAT NET',                      '===',   v_net_income,                                      'total',         true);
END;
$$;


-- ── BILAN (Balance Sheet) ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_balance_sheet(
  p_biz    UUID,
  p_as_of  DATE
) RETURNS JSONB LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_from     DATE  := '2000-01-01';  -- depuis l'origine
  v_to       DATE  := p_as_of;

  -- ACTIF
  v_caisse       NUMERIC;
  v_moncash      NUMERIC;
  v_banque       NUMERIC;
  v_clients_ar   NUMERIC;
  v_stock        NUMERIC;
  v_avances      NUMERIC;
  v_tca_ded      NUMERIC;
  v_total_ca     NUMERIC;
  v_immob        NUMERIC;
  v_amort        NUMERIC;
  v_total_ai     NUMERIC;
  v_total_actif  NUMERIC;

  -- PASSIF
  v_fournis      NUMERIC;
  v_salaires     NUMERIC;
  v_taxes        NUMERIC;
  v_charges_pay  NUMERIC;
  v_avances_clt  NUMERIC;
  v_total_pc     NUMERIC;
  v_emprunts     NUMERIC;
  v_total_plt    NUMERIC;
  v_total_passif NUMERIC;

  -- CAPITAUX PROPRES
  v_capital      NUMERIC;
  v_apports      NUMERIC;
  v_report       NUMERIC;
  v_resultat     NUMERIC;
  v_prelevements NUMERIC;
  v_total_cp     NUMERIC;
BEGIN
  -- ACTIF COURANT
  v_caisse     :=  fn_account_balance(p_biz,'5310',v_from,v_to)
                 + fn_account_balance(p_biz,'5320',v_from,v_to)
                 + fn_account_balance(p_biz,'5330',v_from,v_to);
  v_moncash    :=  fn_account_balance(p_biz,'5121',v_from,v_to)
                 + fn_account_balance(p_biz,'5122',v_from,v_to)
                 + fn_account_balance(p_biz,'5123',v_from,v_to);
  v_banque     :=  fn_account_balance(p_biz,'5110',v_from,v_to)
                 + fn_account_balance(p_biz,'5120',v_from,v_to);
  v_clients_ar :=  fn_account_balance(p_biz,'4110',v_from,v_to);
  v_stock      :=  fn_account_balance(p_biz,'3700',v_from,v_to)
                 + fn_account_balance(p_biz,'3100',v_from,v_to)
                 + fn_account_balance(p_biz,'3800',v_from,v_to);
  v_avances    :=  fn_account_balance(p_biz,'4710',v_from,v_to);
  v_tca_ded    :=  fn_account_balance(p_biz,'4460',v_from,v_to);
  v_total_ca   := v_caisse + v_moncash + v_banque + v_clients_ar + v_stock + v_avances + v_tca_ded;

  -- ACTIF IMMOBILISÉ
  v_immob := fn_class_balance(p_biz,'Asset',v_from,v_to,'2[^8]%');
  v_amort := fn_account_balance(p_biz,'2800',v_from,v_to);  -- contra (negatif normal)
  v_total_ai := v_immob + v_amort;  -- amort est déjà négatif

  v_total_actif := v_total_ca + v_total_ai;

  -- PASSIF COURANT
  v_fournis     := -fn_account_balance(p_biz,'4010',v_from,v_to);
  v_salaires    := -fn_account_balance(p_biz,'4200',v_from,v_to);
  v_taxes       := -fn_account_balance(p_biz,'4440',v_from,v_to)
                 + (-fn_account_balance(p_biz,'4450',v_from,v_to));
  v_charges_pay := -fn_account_balance(p_biz,'4810',v_from,v_to);
  v_avances_clt := -fn_account_balance(p_biz,'4190',v_from,v_to);
  v_total_pc    := v_fournis + v_salaires + v_taxes + v_charges_pay + v_avances_clt;

  -- PASSIF LONG TERME
  v_emprunts    := -fn_account_balance(p_biz,'1610',v_from,v_to)
                 + (-fn_account_balance(p_biz,'1620',v_from,v_to));
  v_total_plt   := v_emprunts;
  v_total_passif := v_total_pc + v_total_plt;

  -- CAPITAUX PROPRES
  v_capital      := -fn_account_balance(p_biz,'1010',v_from,v_to);
  v_apports      := -fn_account_balance(p_biz,'1020',v_from,v_to);
  v_report       := -fn_account_balance(p_biz,'1080',v_from,v_to);
  v_resultat     := (-fn_class_balance(p_biz,'Revenue',v_from,v_to,'%'))
                  - fn_class_balance(p_biz,'Expense',v_from,v_to,'%');
  v_prelevements :=  fn_account_balance(p_biz,'4580',v_from,v_to);  -- contra equity, positif
  v_total_cp     := v_capital + v_apports + v_report + v_resultat - v_prelevements;

  RETURN jsonb_build_object(
    'as_of_date',           p_as_of,
    'currency',             'HTG',
    'actif', jsonb_build_object(
      'actif_courant', jsonb_build_object(
        'caisse',           ROUND(v_caisse,2),
        'moncash_natcash',  ROUND(v_moncash,2),
        'banque',           ROUND(v_banque,2),
        'clients_ar',       ROUND(v_clients_ar,2),
        'stock',            ROUND(v_stock,2),
        'avances_fournis',  ROUND(v_avances,2),
        'tca_deductible',   ROUND(v_tca_ded,2),
        'total',            ROUND(v_total_ca,2)
      ),
      'actif_immobilise', jsonb_build_object(
        'immobilisations_brutes', ROUND(v_immob,2),
        'amortissements',         ROUND(v_amort,2),
        'total',                  ROUND(v_total_ai,2)
      ),
      'total_actif',  ROUND(v_total_actif,2)
    ),
    'passif', jsonb_build_object(
      'passif_courant', jsonb_build_object(
        'fournisseurs_ap',  ROUND(v_fournis,2),
        'salaires_a_payer', ROUND(v_salaires,2),
        'taxes_a_payer',    ROUND(v_taxes,2),
        'charges_a_payer',  ROUND(v_charges_pay,2),
        'avances_clients',  ROUND(v_avances_clt,2),
        'total',            ROUND(v_total_pc,2)
      ),
      'passif_lt', jsonb_build_object(
        'emprunts_bancaires', ROUND(v_emprunts,2),
        'total',              ROUND(v_total_plt,2)
      ),
      'total_passif', ROUND(v_total_passif,2)
    ),
    'capitaux_propres', jsonb_build_object(
      'capital_social',     ROUND(v_capital,2),
      'apports',            ROUND(v_apports,2),
      'report_a_nouveau',   ROUND(v_report,2),
      'resultat_exercice',  ROUND(v_resultat,2),
      'prelevements',       ROUND(-v_prelevements,2),
      'total',              ROUND(v_total_cp,2)
    ),
    'equilibre', jsonb_build_object(
      'total_actif',   ROUND(v_total_actif,2),
      'total_pcp',     ROUND(v_total_passif + v_total_cp,2),
      'est_equilibre', ABS(v_total_actif - (v_total_passif + v_total_cp)) < 1
    )
  );
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- § 5. VUES ANALYTIQUES — DASHBOARD KPIs TEMPS RÉEL
-- ─────────────────────────────────────────────────────────────────────────────

-- Vue: P&L mensuel agrégé
CREATE OR REPLACE VIEW v_monthly_pnl AS
SELECT
  s.business_id,
  DATE_TRUNC('month', s.sale_date)::DATE          AS month,
  COALESCE(SUM(s.total_amount)
    FILTER (WHERE s.payment_status != 'cancelled'
              AND s.deleted_at IS NULL), 0)         AS gross_revenue,
  COALESCE((
    SELECT SUM(si.cost_price * si.quantity)
    FROM sale_items si
    JOIN sales ss ON ss.id = si.sale_id
    WHERE ss.business_id = s.business_id
      AND DATE_TRUNC('month', ss.sale_date) = DATE_TRUNC('month', s.sale_date)
      AND ss.deleted_at IS NULL
  ), 0)                                             AS cogs,
  COALESCE((
    SELECT SUM(e.amount)
    FROM expenses e
    WHERE e.business_id = s.business_id
      AND DATE_TRUNC('month', e.expense_date) = DATE_TRUNC('month', s.sale_date)
      AND e.deleted_at IS NULL
  ), 0)                                             AS total_expenses,
  COUNT(DISTINCT s.id)
    FILTER (WHERE s.deleted_at IS NULL)             AS nb_sales
FROM sales s
WHERE s.deleted_at IS NULL
GROUP BY s.business_id, DATE_TRUNC('month', s.sale_date);

-- Vue: Top produits par marge brute
CREATE OR REPLACE VIEW v_top_products_margin AS
SELECT
  si.business_id,
  si.product_id,
  si.product_name,
  SUM(si.quantity)                                        AS units_sold,
  SUM(si.line_total)                                      AS total_revenue,
  SUM(si.cost_price * si.quantity)                        AS total_cogs,
  SUM(si.line_total) - SUM(si.cost_price * si.quantity)   AS gross_profit,
  CASE WHEN SUM(si.line_total) > 0
    THEN ROUND((SUM(si.line_total) - SUM(si.cost_price * si.quantity))
               / SUM(si.line_total) * 100, 1)
    ELSE 0 END                                            AS margin_pct,
  COUNT(DISTINCT si.sale_id)                              AS nb_orders
FROM sale_items si
JOIN sales s ON s.id = si.sale_id
WHERE s.deleted_at IS NULL
  AND s.payment_status != 'cancelled'
GROUP BY si.business_id, si.product_id, si.product_name;

-- Vue: KPIs dashboard instantanés
CREATE OR REPLACE VIEW v_dashboard_kpis AS
WITH
  sales_month AS (
    SELECT business_id,
           SUM(total_amount) FILTER (WHERE payment_status != 'cancelled') AS revenue,
           SUM(paid_amount)  FILTER (WHERE payment_status != 'cancelled') AS collected,
           COUNT(*)          FILTER (WHERE payment_status != 'cancelled') AS nb_sales
    FROM sales
    WHERE deleted_at IS NULL
      AND sale_date >= DATE_TRUNC('month', CURRENT_DATE)
    GROUP BY business_id
  ),
  expenses_month AS (
    SELECT business_id, SUM(amount) AS total_expenses
    FROM expenses
    WHERE deleted_at IS NULL
      AND expense_date >= DATE_TRUNC('month', CURRENT_DATE)
    GROUP BY business_id
  ),
  cogs_month AS (
    SELECT si.business_id, SUM(si.cost_price * si.quantity) AS total_cogs
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    WHERE s.deleted_at IS NULL
      AND s.payment_status != 'cancelled'
      AND s.sale_date >= DATE_TRUNC('month', CURRENT_DATE)
    GROUP BY si.business_id
  ),
  cash_now AS (
    SELECT business_id, SUM(current_balance) AS total_cash
    FROM bank_accounts
    WHERE is_active = true AND deleted_at IS NULL
    GROUP BY business_id
  ),
  stock_val AS (
    SELECT ws.business_id,
           SUM(ws.quantity * p.purchase_price) AS stock_value,
           SUM(ws.quantity) AS total_units
    FROM warehouse_stock ws
    JOIN products p ON p.id = ws.product_id
    WHERE p.deleted_at IS NULL AND p.track_inventory = true
    GROUP BY ws.business_id
  ),
  ar_bal AS (
    SELECT business_id, SUM(balance_due) AS total_ar
    FROM sales
    WHERE deleted_at IS NULL
      AND payment_status IN ('credit','partial','pending','overdue')
    GROUP BY business_id
  ),
  ap_bal AS (
    SELECT business_id, SUM(balance_due) AS total_ap
    FROM purchases
    WHERE deleted_at IS NULL
      AND payment_status IN ('credit','partial','pending','overdue')
    GROUP BY business_id
  )
SELECT
  COALESCE(sm.business_id, em.business_id, cn.business_id) AS business_id,
  COALESCE(sm.revenue,            0) AS revenue_this_month,
  COALESCE(sm.collected,          0) AS collected_this_month,
  COALESCE(cm.total_cogs,         0) AS cogs_this_month,
  COALESCE(em.total_expenses,     0) AS expenses_this_month,
  COALESCE(sm.revenue,0) - COALESCE(cm.total_cogs,0) AS gross_profit_month,
  COALESCE(sm.revenue,0) - COALESCE(cm.total_cogs,0)
    - COALESCE(em.total_expenses,0)  AS net_profit_month,
  CASE WHEN COALESCE(sm.revenue,0) > 0
    THEN ROUND((COALESCE(sm.revenue,0) - COALESCE(cm.total_cogs,0))
               / sm.revenue * 100, 1)
    ELSE 0 END                        AS gross_margin_pct,
  COALESCE(cn.total_cash,         0) AS total_cash,
  COALESCE(sv.stock_value,        0) AS stock_value,
  COALESCE(sv.total_units,        0) AS stock_units,
  COALESCE(ar.total_ar,           0) AS accounts_receivable,
  COALESCE(ap.total_ap,           0) AS accounts_payable,
  COALESCE(sm.nb_sales,           0) AS sales_count_month
FROM sales_month sm
FULL JOIN expenses_month em  USING (business_id)
FULL JOIN cogs_month     cm  USING (business_id)
FULL JOIN cash_now       cn  USING (business_id)
FULL JOIN stock_val      sv  USING (business_id)
FULL JOIN ar_bal         ar  USING (business_id)
FULL JOIN ap_bal         ap  USING (business_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- § 6. SCORE DE SANTÉ FINANCIÈRE (0-100)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_health_score(p_biz UUID)
RETURNS TABLE (
  score           INTEGER,
  label           TEXT,
  color           TEXT,
  liquidite       INTEGER,
  rentabilite     INTEGER,
  endettement     INTEGER,
  collecte_ar     INTEGER,
  rotation_stock  INTEGER,
  details         JSONB
) LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_total_cash     NUMERIC;
  v_monthly_exp    NUMERIC;
  v_net_margin     NUMERIC;
  v_revenue_month  NUMERIC;
  v_net_income_m   NUMERIC;
  v_total_assets   NUMERIC;
  v_total_liab     NUMERIC;
  v_total_ar       NUMERIC;
  v_avg_daily_rev  NUMERIC;
  v_stock_val      NUMERIC;
  v_cogs_annual    NUMERIC;
  v_score_liq      INTEGER := 0;
  v_score_rent     INTEGER := 0;
  v_score_dette    INTEGER := 0;
  v_score_ar       INTEGER := 0;
  v_score_stock    INTEGER := 0;
  v_score_total    INTEGER := 0;
  v_label          TEXT;
  v_color          TEXT;
  v_p_from         DATE := DATE_TRUNC('month', CURRENT_DATE)::DATE;
  v_p_to           DATE := CURRENT_DATE;
BEGIN
  -- Données depuis la vue KPIs
  SELECT total_cash, expenses_this_month, revenue_this_month, net_profit_month
  INTO v_total_cash, v_monthly_exp, v_revenue_month, v_net_income_m
  FROM v_dashboard_kpis WHERE business_id = p_biz;

  -- Ratio de liquidité: cash / charges mensuelles
  IF COALESCE(v_monthly_exp,0) > 0 THEN
    v_score_liq := CASE
      WHEN v_total_cash >= v_monthly_exp * 2  THEN 20  -- 2 mois de charges = parfait
      WHEN v_total_cash >= v_monthly_exp      THEN 15  -- 1 mois
      WHEN v_total_cash >= v_monthly_exp * 0.5 THEN 8  -- 2 semaines
      ELSE 2
    END;
  ELSE v_score_liq := 20; END IF;

  -- Rentabilité: marge nette
  IF COALESCE(v_revenue_month,0) > 0 THEN
    v_net_margin := v_net_income_m / v_revenue_month * 100;
    v_score_rent := CASE
      WHEN v_net_margin >= 20  THEN 20
      WHEN v_net_margin >= 10  THEN 15
      WHEN v_net_margin >= 5   THEN 8
      WHEN v_net_margin >= 0   THEN 4
      ELSE 0
    END;
  ELSE v_score_rent := 0; END IF;

  -- Endettement: dettes / actif total
  SELECT SUM(current_balance) INTO v_total_assets
  FROM bank_accounts WHERE business_id = p_biz AND is_active = true;

  SELECT COALESCE(SUM(balance_due),0) INTO v_total_liab
  FROM purchases WHERE business_id = p_biz AND deleted_at IS NULL
    AND payment_status IN ('credit','partial','pending');

  IF COALESCE(v_total_assets,0) > 0 AND v_total_liab IS NOT NULL THEN
    v_score_dette := CASE
      WHEN v_total_liab / NULLIF(v_total_assets,0) < 0.30 THEN 20
      WHEN v_total_liab / NULLIF(v_total_assets,0) < 0.50 THEN 15
      WHEN v_total_liab / NULLIF(v_total_assets,0) < 0.70 THEN 8
      ELSE 2
    END;
  ELSE v_score_dette := 20; END IF;

  -- Collecte AR: DSO (Days Sales Outstanding)
  SELECT COALESCE(SUM(balance_due),0) INTO v_total_ar
  FROM sales WHERE business_id = p_biz AND deleted_at IS NULL
    AND payment_status IN ('credit','partial','pending','overdue');

  v_avg_daily_rev := COALESCE(v_revenue_month,0) / 30;
  IF v_avg_daily_rev > 0 THEN
    v_score_ar := CASE
      WHEN (v_total_ar / v_avg_daily_rev) <= 7   THEN 20  -- < 7 jours = excellent
      WHEN (v_total_ar / v_avg_daily_rev) <= 15  THEN 15
      WHEN (v_total_ar / v_avg_daily_rev) <= 30  THEN 8
      ELSE 2
    END;
  ELSE v_score_ar := 20; END IF;

  -- Rotation des stocks
  SELECT COALESCE(SUM(ws.quantity * p.purchase_price),0) INTO v_stock_val
  FROM warehouse_stock ws JOIN products p ON p.id = ws.product_id
  WHERE ws.business_id = p_biz AND p.deleted_at IS NULL;

  SELECT COALESCE(SUM(si.cost_price * si.quantity),0) INTO v_cogs_annual
  FROM sale_items si JOIN sales s ON s.id = si.sale_id
  WHERE s.business_id = p_biz AND s.deleted_at IS NULL
    AND s.sale_date >= CURRENT_DATE - 365;

  IF v_stock_val > 0 THEN
    v_score_stock := CASE
      WHEN v_cogs_annual / v_stock_val >= 8   THEN 20  -- rotation > 8x/an
      WHEN v_cogs_annual / v_stock_val >= 4   THEN 15
      WHEN v_cogs_annual / v_stock_val >= 2   THEN 8
      ELSE 2
    END;
  ELSE v_score_stock := 20; END IF;

  v_score_total := v_score_liq + v_score_rent + v_score_dette + v_score_ar + v_score_stock;

  v_label := CASE
    WHEN v_score_total >= 80 THEN 'Entreprise saine 🟢'
    WHEN v_score_total >= 60 THEN 'Attention requise 🟡'
    ELSE                          'Intervention urgente 🔴'
  END;
  v_color := CASE WHEN v_score_total >= 80 THEN 'green'
                  WHEN v_score_total >= 60 THEN 'yellow' ELSE 'red' END;

  RETURN QUERY SELECT
    v_score_total, v_label, v_color,
    v_score_liq, v_score_rent, v_score_dette, v_score_ar, v_score_stock,
    jsonb_build_object(
      'cash_mois_charges',  ROUND(COALESCE(v_total_cash,0) / NULLIF(v_monthly_exp,0),2),
      'marge_nette_pct',    ROUND(COALESCE(v_net_margin,0),1),
      'ratio_endettement',  ROUND(COALESCE(v_total_liab,0) / NULLIF(v_total_assets,0),2),
      'dso_jours',          ROUND(v_total_ar / NULLIF(v_avg_daily_rev,0),0),
      'rotation_stock_x',   ROUND(COALESCE(v_cogs_annual,0) / NULLIF(v_stock_val,0),1)
    );
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- § 7. DÉTECTION D'ANOMALIES — FEED PILOT AI
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_detect_anomalies(p_biz UUID)
RETURNS TABLE (
  anomaly_type  TEXT,
  severity      notif_priority_type,
  title         TEXT,
  message_fr    TEXT,
  message_ht    TEXT,
  metric_value  NUMERIC,
  threshold     NUMERIC,
  action_url    TEXT
) LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_kpi                v_dashboard_kpis%ROWTYPE;
  v_exp_prev_month     NUMERIC;
  v_exp_this_month     NUMERIC;
  v_exp_growth         NUMERIC;
  v_monthly_charges    NUMERIC;
  v_cash_days          NUMERIC;
BEGIN
  SELECT * INTO v_kpi FROM v_dashboard_kpis WHERE business_id = p_biz;

  -- ── ANOMALIE 1: Trésorerie critique ─────────────────────────────────────────
  v_monthly_charges := COALESCE(v_kpi.expenses_this_month, 0);
  IF v_monthly_charges > 0 THEN
    v_cash_days := COALESCE(v_kpi.total_cash, 0) / (v_monthly_charges / 30);
    IF v_cash_days < 7 THEN
      RETURN NEXT (
        'low_cash', 'critical',
        '⚠️ Trésorerie critique',
        'Il vous reste moins de ' || ROUND(v_cash_days) || ' jours de trésorerie. Cash disponible: '
          || ROUND(COALESCE(v_kpi.total_cash,0)) || ' HTG.',
        'Kès ou a mwens pase ' || ROUND(v_cash_days) || ' jou. Cash disponib: '
          || ROUND(COALESCE(v_kpi.total_cash,0)) || ' HTG.',
        ROUND(v_cash_days), 7, '/cashflow'
      );
    ELSIF v_cash_days < 15 THEN
      RETURN NEXT (
        'low_cash', 'high',
        '⚠️ Trésorerie faible',
        'Vous avez ' || ROUND(v_cash_days) || ' jours de cash. Anticipez vos paiements.',
        'Ou gen ' || ROUND(v_cash_days) || ' jou cash. Prepare peman ou yo.',
        ROUND(v_cash_days), 15, '/cashflow'
      );
    END IF;
  END IF;

  -- ── ANOMALIE 2: Marge brute très faible (<15%) ────────────────────────────
  IF COALESCE(v_kpi.gross_margin_pct, 0) < 15 AND COALESCE(v_kpi.revenue_this_month,0) > 0 THEN
    RETURN NEXT (
      'low_margin', 'high',
      '📉 Marge brute très faible',
      'Votre marge brute est de ' || v_kpi.gross_margin_pct || '%. '
        || 'Vérifiez vos prix de vente et coûts d''achat.',
      'Majan bènèfis ou se ' || v_kpi.gross_margin_pct || '%. '
        || 'Verifye pri vant ak pri acha ou yo.',
      v_kpi.gross_margin_pct, 15, '/reports'
    );
  END IF;

  -- ── ANOMALIE 3: Créances impayées élevées ─────────────────────────────────
  IF COALESCE(v_kpi.accounts_receivable,0) > COALESCE(v_kpi.revenue_this_month,0) * 0.30 THEN
    RETURN NEXT (
      'high_ar', 'medium',
      '📋 Créances clients élevées',
      'Vos clients vous doivent ' || ROUND(v_kpi.accounts_receivable) || ' HTG. '
        || 'Relancez les paiements en attente.',
      'Kliyan yo dwe ou ' || ROUND(v_kpi.accounts_receivable) || ' HTG. '
        || 'Rele yo pou peye.',
      ROUND(v_kpi.accounts_receivable), 0, '/customers'
    );
  END IF;

  -- ── ANOMALIE 4: Dettes fournisseurs élevées ───────────────────────────────
  IF COALESCE(v_kpi.accounts_payable,0) > COALESCE(v_kpi.total_cash,0) * 1.5 THEN
    RETURN NEXT (
      'high_ap', 'high',
      '🔴 Dettes fournisseurs supérieures au cash',
      'Vous devez payer ' || ROUND(v_kpi.accounts_payable) || ' HTG à vos fournisseurs, '
        || 'mais votre cash est de ' || ROUND(v_kpi.total_cash) || ' HTG.',
      'Ou dwe founisè ' || ROUND(v_kpi.accounts_payable) || ' HTG, '
        || 'men kès ou se ' || ROUND(v_kpi.total_cash) || ' HTG.',
      ROUND(v_kpi.accounts_payable), ROUND(v_kpi.total_cash), '/suppliers'
    );
  END IF;

  -- ── ANOMALIE 5: Stock élevé vs CA ─────────────────────────────────────────
  IF COALESCE(v_kpi.stock_value,0) > COALESCE(v_kpi.revenue_this_month,0) * 3 THEN
    RETURN NEXT (
      'high_stock', 'medium',
      '📦 Surstock détecté',
      'Votre stock vaut ' || ROUND(v_kpi.stock_value) || ' HTG, soit '
        || ROUND(v_kpi.stock_value / NULLIF(v_kpi.revenue_this_month,0),1)
        || ' mois de CA. Capital immobilisé.',
      'Stock ou vo ' || ROUND(v_kpi.stock_value) || ' HTG. '
        || 'Kòb bloke nan machandiz.',
      ROUND(v_kpi.stock_value), 0, '/inventory'
    );
  END IF;

  -- ── ANOMALIE 6: Augmentation dépenses vs mois précédent ──────────────────
  SELECT COALESCE(SUM(amount), 0) INTO v_exp_prev_month
  FROM expenses
  WHERE business_id = p_biz
    AND deleted_at IS NULL
    AND expense_date BETWEEN DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')::DATE
                         AND (DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 day')::DATE;

  v_exp_this_month := COALESCE(v_kpi.expenses_this_month, 0);

  IF v_exp_prev_month > 0 THEN
    v_exp_growth := (v_exp_this_month - v_exp_prev_month) / v_exp_prev_month * 100;
    IF v_exp_growth > 30 THEN
      RETURN NEXT (
        'expense_spike', 'medium',
        '📊 Augmentation des dépenses +' || ROUND(v_exp_growth) || '%',
        'Vos dépenses ont augmenté de ' || ROUND(v_exp_growth) || '% par rapport au mois dernier. '
          || 'Ce mois: ' || ROUND(v_exp_this_month) || ' HTG vs ' || ROUND(v_exp_prev_month) || ' HTG.',
        'Depans ou ogmante ' || ROUND(v_exp_growth) || '% pa rapò ak mwa pase.',
        ROUND(v_exp_growth), 30, '/expenses'
      );
    END IF;
  END IF;

  -- ── ANOMALIE 7: Résultat net négatif ──────────────────────────────────────
  IF COALESCE(v_kpi.net_profit_month, 0) < 0 THEN
    RETURN NEXT (
      'negative_profit', 'critical',
      '🔴 Vous perdez de l''argent ce mois',
      'Résultat net: ' || ROUND(v_kpi.net_profit_month) || ' HTG. '
        || 'Vos charges (' || ROUND(v_kpi.expenses_this_month) || ' HTG) '
        || 'dépassent vos revenus (' || ROUND(v_kpi.revenue_this_month) || ' HTG).',
      'Ou pèdi kòb mwa sa a: ' || ROUND(v_kpi.net_profit_month) || ' HTG.',
      ROUND(v_kpi.net_profit_month), 0, '/reports'
    );
  END IF;

END;
$$;

COMMENT ON FUNCTION fn_detect_anomalies IS
  'Détecte les anomalies financières pour alimenter le Pilot AI.
   Retourne des messages en français ET en créole haïtien.
   À appeler quotidiennement via cron ou à la demande de l''utilisateur.';


-- ═════════════════════════════════════════════════════════════════════════════
-- RÉSUMÉ DU MOTEUR COMPTABLE v4.0
-- ═════════════════════════════════════════════════════════════════════════════
-- Fonctions créées (13):
--   fn_seed_chart_of_accounts    → 50+ comptes PCG-HT par business
--   fn_resolve_account           → Résolution code → UUID
--   fn_payment_account           → Compte trésorerie par méthode paiement
--   fn_create_journal_entry      → Création écriture validée (débit=crédit)
--   fn_auto_journal_sale         → Trigger vente → JE revenus + JE COGS
--   fn_auto_journal_sale_payment → Règlement créance client
--   fn_auto_journal_purchase     → Trigger achat → JE stock + AP
--   fn_auto_journal_purchase_payment → Règlement AP fournisseur
--   fn_auto_journal_expense      → Trigger dépense → JE charges
--   fn_journal_owner_withdrawal  → Prélèvement propriétaire
--   fn_journal_loan_received     → Réception prêt bancaire
--   fn_journal_loan_repayment    → Remboursement prêt (capital + intérêts)
--   fn_journal_asset_purchase    → Achat immobilisation
--   fn_journal_depreciation      → Dotation amortissement mensuel
--   fn_account_balance           → Solde compte pour période
--   fn_class_balance             → Solde classe de comptes
--   fn_income_statement          → Compte de résultat complet
--   fn_balance_sheet             → Bilan complet en JSONB
--   fn_health_score              → Score santé 0-100 (5 ratios)
--   fn_detect_anomalies          → 7 détecteurs d'anomalies (FR + Kreyòl)
--
-- Triggers créés (4):
--   trg_journal_sale             → sales (INSERT/UPDATE status)
--   trg_journal_sale_payment     → sale_payments (INSERT)
--   trg_journal_purchase         → purchases (INSERT/UPDATE status)
--   trg_journal_purch_payment    → purchase_payments (INSERT)
--   trg_journal_expense          → expenses (INSERT)
--
-- Vues créées (3):
--   v_monthly_pnl                → P&L agrégé par mois
--   v_top_products_margin        → Classement produits par marge
--   v_dashboard_kpis             → KPIs temps réel pour dashboard
-- ═════════════════════════════════════════════════════════════════════════════
