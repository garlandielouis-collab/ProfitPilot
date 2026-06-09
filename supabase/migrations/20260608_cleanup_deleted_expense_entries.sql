-- Netwaye tout ekriti kontab pou depans ki deja efase
-- (ansyen deleteExpense te kreye ANNULATION ak montan, sa netwaye tout)

UPDATE journal_entry_lines
SET debit_amount = 0, credit_amount = 0, base_debit = 0, base_credit = 0
WHERE journal_entry_id IN (
  SELECT je.id FROM journal_entries je
  JOIN expenses e ON e.id = je.reference_id
  WHERE je.business_id = je.business_id
    AND je.reference_type = 'expense'
    AND e.deleted_at IS NOT NULL
);

UPDATE journal_entries
SET status = 'void', total_debit = 0, total_credit = 0,
    voided_reason = 'Dépense annulée (nettoyage)'
WHERE id IN (
  SELECT je.id FROM journal_entries je
  JOIN expenses e ON e.id = je.reference_id
  WHERE je.reference_type = 'expense'
    AND e.deleted_at IS NOT NULL
);
