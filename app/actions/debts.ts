'use server';

import { supabaseServer } from '../../lib/supabaseServerClient';

type RecordDebtPaymentPayload = {
  purchase_id: string;
};

export async function recordDebtPayment(payload: RecordDebtPaymentPayload) {
  if (!payload.purchase_id) {
    throw new Error('ID d\'achat obligatoire');
  }

  // Bug fix #1: Always resolve owner from the authenticated session,
  // never trust a caller-supplied owner_id.
  const { data: { user }, error: authError } = await supabaseServer.auth.getUser();
  if (authError || !user) {
    throw new Error('Non authentifié');
  }

  // Bug fix #2: Fetch currency alongside the other fields so the expense
  // is recorded in the same currency as the original purchase (USD or HTG).
  const { data: purchase, error: fetchError } = await supabaseServer
    .from('purchases')
    .select('supplier_id, total_purchase_amount, purchase_date, payment_status, currency')
    .eq('id', payload.purchase_id)
    .single();

  if (fetchError || !purchase) {
    throw new Error('Achat non trouvé');
  }

  if (purchase.payment_status === 'Payé') {
    throw new Error('Cette dette est déjà payée');
  }

  // Update payment status to 'Payé'
  const { error: updateError } = await supabaseServer
    .from('purchases')
    .update({ payment_status: 'Payé' })
    .eq('id', payload.purchase_id);

  if (updateError) {
    throw new Error(updateError.message);
  }

  // Create expense record for the debt payment
  const { data: supplier, error: supplierError } = await supabaseServer
    .from('suppliers')
    .select('name')
    .eq('id', purchase.supplier_id)
    .single();

  if (supplierError) {
    throw new Error('Fournisseur non trouvé');
  }

  const { error: expenseError } = await supabaseServer
    .from('expenses')
    .insert({
      owner_id: user.id,                          // fix #1: from auth, not payload
      amount:   purchase.total_purchase_amount,
      currency: purchase.currency ?? 'HTG',       // fix #2: preserve original currency
      description: `Remboursement dette - ${supplier.name}`,
      category: 'Remboursements',
      date: new Date().toISOString().split('T')[0],
    });

  if (expenseError) {
    throw new Error(expenseError.message);
  }

  return true;
}
