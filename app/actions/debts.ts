'use server';

import { markPurchasePaid } from './suppliers';
import { attempt, UserFacingError, type ActionResult } from '../../lib/actionResult';
import type { PurchaseSettlement } from './suppliers';

type RecordDebtPaymentPayload = {
  purchase_id: string;
};

export async function recordDebtPayment(
  payload: RecordDebtPaymentPayload,
): Promise<ActionResult<PurchaseSettlement>> {
  return attempt(async () => {
    if (!payload.purchase_id) throw new UserFacingError('ID acha obligatwa.');

    // Delegate to markPurchasePaid which handles everything correctly:
    // - marks purchase as paid
    // - updates supplier outstanding_balance
    // - records supplier_transaction
    //
    // Elle est enveloppée elle aussi : on l'ouvre ici, dans notre `attempt`.
    // Un refus qu'elle LÈVE remonte avec son message ; un refus qu'elle
    // RENVOIE (`settled: false`) reste une valeur, comme avant.
    const res = await markPurchasePaid(payload.purchase_id);
    if (!res.ok) throw new UserFacingError(res.message);
    return res.data;
  });
}
