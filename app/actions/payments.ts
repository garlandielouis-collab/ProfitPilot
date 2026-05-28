'use server';

import { getSupabaseServer } from '../../lib/supabaseServerClient';

export type PaymentMethod = 'moncash' | 'natcash' | 'visa';
export type PaymentStatus = 'pending' | 'approved' | 'rejected';

export type CreatePaymentInput = {
  planKey: string;
  method: PaymentMethod;
  userId: string;
  amountHtg: number;
  reference: string;
};

export async function createPendingPayment(input: CreatePaymentInput): Promise<{
  id: string;
  reference: string;
  status: PaymentStatus;
}> {
  const supabase = getSupabaseServer();

  const { data, error } = await supabase
    .from('payments')
    .insert({
      user_id: input.userId,
      plan_key: input.planKey,
      payment_method: input.method,
      amount_htg: input.amountHtg,
      status: 'pending',
      reference: input.reference,
    })
    .select('id, reference, status')
    .single();

  if (error) throw new Error(error.message);
  return data as { id: string; reference: string; status: PaymentStatus };
}

export async function getActiveSubscription(userId: string) {
  const supabase = getSupabaseServer();

  const { data, error } = await supabase
    .from('subscriptions')
    .select('id, plan_key, status, expires_at, created_at')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}
