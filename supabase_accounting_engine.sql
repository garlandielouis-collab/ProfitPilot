-- ============================================================
-- ProfitPilot — Moteur Comptable Complet (Double Entrée)
-- Colle dans Supabase SQL Editor et exécute
-- ============================================================

-- ── 1. Permissions chart_of_accounts ─────────────────────────────────────────
GRANT ALL ON TABLE public.chart_of_accounts      TO authenticated, service_role;
GRANT ALL ON TABLE public.journal_entries        TO authenticated, service_role;
GRANT ALL ON TABLE public.journal_entry_lines    TO authenticated, service_role;
GRANT ALL ON TABLE public.account_period_balances TO authenticated, service_role;
GRANT ALL ON TABLE public.accounting_periods     TO authenticated, service_role;
GRANT ALL ON TABLE public.fiscal_years           TO authenticated, service_role;

-- ── 2. RLS Policies ──────────────────────────────────────────────────────────
ALTER TABLE public.chart_of_accounts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entry_lines    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_period_balances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "coa_all"    ON public.chart_of_accounts;
DROP POLICY IF EXISTS "je_all"     ON public.journal_entries;
DROP POLICY IF EXISTS "jel_all"    ON public.journal_entry_lines;
DROP POLICY IF EXISTS "apb_all"    ON public.account_period_balances;

CREATE POLICY "coa_all" ON public.chart_of_accounts
  USING (is_business_owner(business_id)) WITH CHECK (is_business_owner(business_id));
CREATE POLICY "je_all"  ON public.journal_entries
  USING (is_business_owner(business_id)) WITH CHECK (is_business_owner(business_id));
CREATE POLICY "jel_all" ON public.journal_entry_lines
  USING (is_business_owner(business_id)) WITH CHECK (is_business_owner(business_id));
CREATE POLICY "apb_all" ON public.account_period_balances
  USING (is_business_owner(business_id)) WITH CHECK (is_business_owner(business_id));

-- ── 3. Fonction: initialiser plan comptable pour un nouveau business ──────────
CREATE OR REPLACE FUNCTION public.init_chart_of_accounts(p_business_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  -- Actifs
  a_id       uuid; a_cur_id  uuid; a_ncur_id uuid;
  caisse_id  uuid; banque_id uuid; clients_id uuid;
  stock_id   uuid; fourni_id uuid; equip_id  uuid;
  -- Passifs
  p_id       uuid; fournisseurs_id uuid; salaires_p_id uuid;
  taxes_p_id uuid; emprunts_id    uuid;
  -- Capitaux
  eq_id      uuid; capital_id uuid; retained_id uuid;
  -- Revenus
  rev_id     uuid; ventes_id  uuid; services_id uuid; rev_div_id uuid;
  -- Charges
  ch_id      uuid; sal_ch_id  uuid; loyer_id   uuid; fourni_ch_id uuid;
  mkt_id     uuid; internet_id uuid; transport_id uuid; int_ch_id uuid; ch_div_id uuid;
BEGIN
  -- ── ACTIFS (1xx) ─────────────────────────────────────────
  INSERT INTO public.chart_of_accounts(business_id,code,name,name_ht,account_class,is_system,is_active)
    VALUES(p_business_id,'1000','Actifs','Aktif','Asset',true,true) RETURNING id INTO a_id;

  INSERT INTO public.chart_of_accounts(business_id,parent_id,code,name,name_ht,account_class,is_system,is_active)
    VALUES(p_business_id,a_id,'1100','Actifs Courants','Aktif Kouran','Asset',true,true) RETURNING id INTO a_cur_id;

  INSERT INTO public.chart_of_accounts(business_id,parent_id,code,name,name_ht,account_class,is_system,is_active)
    VALUES(p_business_id,a_cur_id,'1110','Caisse','Kès','Asset',true,true) RETURNING id INTO caisse_id;
  INSERT INTO public.chart_of_accounts(business_id,parent_id,code,name,name_ht,account_class,is_system,is_active)
    VALUES(p_business_id,a_cur_id,'1120','Banque','Bank','Asset',true,true) RETURNING id INTO banque_id;
  INSERT INTO public.chart_of_accounts(business_id,parent_id,code,name,name_ht,account_class,is_system,is_active)
    VALUES(p_business_id,a_cur_id,'1130','Comptes Clients','Kont Kliyan','Asset',true,true) RETURNING id INTO clients_id;
  INSERT INTO public.chart_of_accounts(business_id,parent_id,code,name,name_ht,account_class,is_system,is_active)
    VALUES(p_business_id,a_cur_id,'1140','Stocks','Estòk','Asset',true,true) RETURNING id INTO stock_id;
  INSERT INTO public.chart_of_accounts(business_id,parent_id,code,name,name_ht,account_class,is_system,is_active)
    VALUES(p_business_id,a_cur_id,'1150','Fournitures','Founitì','Asset',true,true) RETURNING id INTO fourni_id;

  INSERT INTO public.chart_of_accounts(business_id,parent_id,code,name,name_ht,account_class,is_system,is_active)
    VALUES(p_business_id,a_id,'1200','Actifs Non Courants','Aktif Ki Pa Kouran','Asset',true,true) RETURNING id INTO a_ncur_id;
  INSERT INTO public.chart_of_accounts(business_id,parent_id,code,name,name_ht,account_class,is_system,is_active)
    VALUES(p_business_id,a_ncur_id,'1210','Équipements','Ekipman','Asset',true,true) RETURNING id INTO equip_id;

  -- ── PASSIFS (2xx) ─────────────────────────────────────────
  INSERT INTO public.chart_of_accounts(business_id,code,name,name_ht,account_class,is_system,is_active)
    VALUES(p_business_id,'2000','Passifs','Pasif','Liability',true,true) RETURNING id INTO p_id;
  INSERT INTO public.chart_of_accounts(business_id,parent_id,code,name,name_ht,account_class,is_system,is_active)
    VALUES(p_business_id,p_id,'2110','Comptes Fournisseurs','Kont Founisè','Liability',true,true) RETURNING id INTO fournisseurs_id;
  INSERT INTO public.chart_of_accounts(business_id,parent_id,code,name,name_ht,account_class,is_system,is_active)
    VALUES(p_business_id,p_id,'2120','Salaires à Payer','Salè pou Peye','Liability',true,true) RETURNING id INTO salaires_p_id;
  INSERT INTO public.chart_of_accounts(business_id,parent_id,code,name,name_ht,account_class,is_system,is_active)
    VALUES(p_business_id,p_id,'2130','Taxes à Payer','Taks pou Peye','Liability',true,true) RETURNING id INTO taxes_p_id;
  INSERT INTO public.chart_of_accounts(business_id,parent_id,code,name,name_ht,account_class,is_system,is_active)
    VALUES(p_business_id,p_id,'2200','Emprunts Bancaires','Prè Bank','Liability',true,true) RETURNING id INTO emprunts_id;

  -- ── CAPITAUX PROPRES (3xx) ────────────────────────────────
  INSERT INTO public.chart_of_accounts(business_id,code,name,name_ht,account_class,is_system,is_active)
    VALUES(p_business_id,'3000','Capitaux Propres','Kapital Pwòp','Equity',true,true) RETURNING id INTO eq_id;
  INSERT INTO public.chart_of_accounts(business_id,parent_id,code,name,name_ht,account_class,is_system,is_active)
    VALUES(p_business_id,eq_id,'3100','Capital','Kapital','Equity',true,true) RETURNING id INTO capital_id;
  INSERT INTO public.chart_of_accounts(business_id,parent_id,code,name,name_ht,account_class,is_system,is_active)
    VALUES(p_business_id,eq_id,'3200','Résultats Non Distribués','Benefis Ki Pa Distribye','Equity',true,true) RETURNING id INTO retained_id;

  -- ── REVENUS (4xx) ─────────────────────────────────────────
  INSERT INTO public.chart_of_accounts(business_id,code,name,name_ht,account_class,is_system,is_active)
    VALUES(p_business_id,'4000','Revenus','Revni','Revenue',true,true) RETURNING id INTO rev_id;
  INSERT INTO public.chart_of_accounts(business_id,parent_id,code,name,name_ht,account_class,is_system,is_active)
    VALUES(p_business_id,rev_id,'4100','Ventes de Marchandises','Vant Machandiz','Revenue',true,true) RETURNING id INTO ventes_id;
  INSERT INTO public.chart_of_accounts(business_id,parent_id,code,name,name_ht,account_class,is_system,is_active)
    VALUES(p_business_id,rev_id,'4200','Revenus de Services','Revni Sèvis','Revenue',true,true) RETURNING id INTO services_id;
  INSERT INTO public.chart_of_accounts(business_id,parent_id,code,name,name_ht,account_class,is_system,is_active)
    VALUES(p_business_id,rev_id,'4900','Revenus Divers','Lòt Revni','Revenue',true,true) RETURNING id INTO rev_div_id;

  -- ── CHARGES (5xx) ─────────────────────────────────────────
  INSERT INTO public.chart_of_accounts(business_id,code,name,name_ht,account_class,is_system,is_active)
    VALUES(p_business_id,'5000','Charges','Chaj','Expense',true,true) RETURNING id INTO ch_id;
  INSERT INTO public.chart_of_accounts(business_id,parent_id,code,name,name_ht,account_class,is_system,is_active)
    VALUES(p_business_id,ch_id,'5100','Achats de Marchandises','Acha Machandiz','Expense',true,true);
  INSERT INTO public.chart_of_accounts(business_id,parent_id,code,name,name_ht,account_class,is_system,is_active)
    VALUES(p_business_id,ch_id,'5200','Salaires','Salè','Expense',true,true) RETURNING id INTO sal_ch_id;
  INSERT INTO public.chart_of_accounts(business_id,parent_id,code,name,name_ht,account_class,is_system,is_active)
    VALUES(p_business_id,ch_id,'5300','Loyer','Lwaye','Expense',true,true) RETURNING id INTO loyer_id;
  INSERT INTO public.chart_of_accounts(business_id,parent_id,code,name,name_ht,account_class,is_system,is_active)
    VALUES(p_business_id,ch_id,'5400','Fournitures de Bureau','Founitì Biwo','Expense',true,true) RETURNING id INTO fourni_ch_id;
  INSERT INTO public.chart_of_accounts(business_id,parent_id,code,name,name_ht,account_class,is_system,is_active)
    VALUES(p_business_id,ch_id,'5500','Marketing & Publicité','Makèting','Expense',true,true) RETURNING id INTO mkt_id;
  INSERT INTO public.chart_of_accounts(business_id,parent_id,code,name,name_ht,account_class,is_system,is_active)
    VALUES(p_business_id,ch_id,'5600','Internet & Téléphone','Entènèt & Telefòn','Expense',true,true) RETURNING id INTO internet_id;
  INSERT INTO public.chart_of_accounts(business_id,parent_id,code,name,name_ht,account_class,is_system,is_active)
    VALUES(p_business_id,ch_id,'5700','Transport','Transpò','Expense',true,true) RETURNING id INTO transport_id;
  INSERT INTO public.chart_of_accounts(business_id,parent_id,code,name,name_ht,account_class,is_system,is_active)
    VALUES(p_business_id,ch_id,'5800','Intérêts','Enterè','Expense',true,true) RETURNING id INTO int_ch_id;
  INSERT INTO public.chart_of_accounts(business_id,parent_id,code,name,name_ht,account_class,is_system,is_active)
    VALUES(p_business_id,ch_id,'5900','Charges Diverses','Lòt Chaj','Expense',true,true) RETURNING id INTO ch_div_id;

END;
$$;

GRANT EXECUTE ON FUNCTION public.init_chart_of_accounts(uuid) TO authenticated, service_role;

-- ── 4. Fonction: obtenir ou créer la période comptable courante ───────────────
CREATE OR REPLACE FUNCTION public.get_or_create_current_period(p_business_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_period_id  uuid;
  v_fy_id      uuid;
  v_today      date := CURRENT_DATE;
  v_year       int  := EXTRACT(year FROM v_today);
BEGIN
  -- Try existing open period
  SELECT id INTO v_period_id
    FROM public.accounting_periods
   WHERE business_id = p_business_id
     AND start_date <= v_today
     AND end_date   >= v_today
     AND is_closed  = false
   LIMIT 1;

  IF v_period_id IS NOT NULL THEN RETURN v_period_id; END IF;

  -- Get or create fiscal year
  SELECT id INTO v_fy_id
    FROM public.fiscal_years
   WHERE business_id = p_business_id
     AND EXTRACT(year FROM start_date) = v_year
   LIMIT 1;

  IF v_fy_id IS NULL THEN
    INSERT INTO public.fiscal_years(business_id, name, start_date, end_date)
    VALUES(p_business_id, 'Ane Fiskal '||v_year, (v_year||'-01-01')::date, (v_year||'-12-31')::date)
    RETURNING id INTO v_fy_id;
  END IF;

  -- Create current month period
  INSERT INTO public.accounting_periods(business_id, fiscal_year_id, name, start_date, end_date)
  VALUES(
    p_business_id, v_fy_id,
    to_char(v_today, 'Month YYYY'),
    date_trunc('month', v_today)::date,
    (date_trunc('month', v_today) + interval '1 month - 1 day')::date
  )
  RETURNING id INTO v_period_id;

  RETURN v_period_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_or_create_current_period(uuid) TO authenticated, service_role;

-- ── 5. Vue: Grand Livre ───────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_grand_livre AS
SELECT
  jel.id,
  jel.business_id,
  je.entry_date            AS date,
  je.entry_number,
  je.description           AS journal_description,
  jel.description          AS line_description,
  coa.code                 AS account_code,
  coa.name                 AS account_name,
  coa.account_class,
  jel.debit_amount,
  jel.credit_amount,
  je.reference,
  je.reference_type,
  je.reference_id,
  je.status,
  SUM(jel.debit_amount - jel.credit_amount)
    OVER (PARTITION BY jel.account_id ORDER BY je.entry_date, je.entry_number
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
    AS running_balance
FROM public.journal_entry_lines  jel
JOIN public.journal_entries       je  ON je.id = jel.journal_entry_id
JOIN public.chart_of_accounts     coa ON coa.id = jel.account_id
WHERE je.status = 'posted';

-- ── 6. Vue: Balance de Vérification ──────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_balance_verification AS
SELECT
  jel.business_id,
  coa.code                         AS account_code,
  coa.name                         AS account_name,
  coa.account_class,
  SUM(jel.debit_amount)            AS total_debit,
  SUM(jel.credit_amount)           AS total_credit,
  SUM(jel.debit_amount - jel.credit_amount) AS solde
FROM public.journal_entry_lines  jel
JOIN public.journal_entries       je  ON je.id = jel.journal_entry_id
JOIN public.chart_of_accounts     coa ON coa.id = jel.account_id
WHERE je.status = 'posted'
GROUP BY jel.business_id, coa.code, coa.name, coa.account_class
ORDER BY coa.code;

-- ── 7. Vue: Bilan simplifié ───────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_bilan AS
SELECT
  business_id,
  account_class,
  SUM(CASE WHEN account_class = 'Asset'     THEN solde ELSE 0 END) AS total_actifs,
  SUM(CASE WHEN account_class = 'Liability' THEN -solde ELSE 0 END) AS total_passifs,
  SUM(CASE WHEN account_class = 'Equity'    THEN -solde ELSE 0 END) AS total_capitaux
FROM public.v_balance_verification
GROUP BY business_id, account_class;

SELECT 'Moteur comptable configuré avec succès ✓' AS status;
