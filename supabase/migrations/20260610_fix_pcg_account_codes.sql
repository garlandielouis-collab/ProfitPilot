-- Migration: Fix Ventes account code 4100 → 7010 in journal_entry_lines
-- account_id is a UUID FK to chart_of_accounts, so we must join to find by code.
-- Only 4100 (Ventes) was wrong — all other codes (4580, 4200, 4450, 6430) are
-- already correct in the seeded chart_of_accounts.

UPDATE journal_entry_lines jel
SET account_id = new_acct.id
FROM chart_of_accounts old_acct
JOIN chart_of_accounts new_acct
  ON new_acct.business_id = old_acct.business_id
 AND new_acct.code = '7010'
WHERE jel.account_id = old_acct.id
  AND old_acct.code = '4100';
