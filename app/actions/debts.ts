'use server';

import { markPurchasePaid } from './suppliers';

type RecordDebtPaymentPayload = {
  purchase_id: string;
};

export async function recordDebtPayment(payload: RecordDebtPaymentPayload) {
  if (!payload.purchase_id) throw new Error('ID acha obligatwa.');
  // Delegate to markPurchasePaid which handles everything correctly:
  // - marks purchase as paid
  // - updates supplier outstanding_balance
  // - records supplier_transaction
  return markPurchasePaid(payload.purchase_id);
}
