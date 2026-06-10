-- Migration: Correct account codes to strict PCG compliance
-- Old code → New code (reason)
-- 4100 → 7010  (Ventes: Class 4 = tiers, revenue must be Class 7)
-- 4580 → 1080  (Prélèvements: Class 4 = tiers, owner drawings = Class 1)
-- 4710 → 4090  (Avances fournisseurs: 409x is the PCG standard)
-- 4020 → 4030  (Effets à payer: 403x is the PCG standard)
-- 4200 → 4210  (Salaires à payer: 421x is the PCG standard)
-- 4450 → 4457  (TVA collectée: 4457 is the PCG standard)
-- 6430 → 6450  (Charges sociales: 645x is the PCG standard)
-- 7091 → 7600  (Revenus financiers: 76xx is the PCG standard)

UPDATE journal_entry_lines SET account_code = '7010' WHERE account_code = '4100';
UPDATE journal_entry_lines SET account_code = '1080' WHERE account_code = '4580';
UPDATE journal_entry_lines SET account_code = '4090' WHERE account_code = '4710';
UPDATE journal_entry_lines SET account_code = '4030' WHERE account_code = '4020';
UPDATE journal_entry_lines SET account_code = '4210' WHERE account_code = '4200';
UPDATE journal_entry_lines SET account_code = '4457' WHERE account_code = '4450';
UPDATE journal_entry_lines SET account_code = '6450' WHERE account_code = '6430';
UPDATE journal_entry_lines SET account_code = '7600' WHERE account_code = '7091';
