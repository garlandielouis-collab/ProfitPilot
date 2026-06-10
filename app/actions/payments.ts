'use server';

import { getSupabaseServer } from '../../lib/supabaseServerClient';
import { sendPaymentNotification } from '../../lib/sendEmail';

export type PaymentMethod = 'moncash' | 'natcash' | 'visa';
export type PaymentStatus = 'pending' | 'approved' | 'rejected';

export type CreatePaymentInput = {
  planKey: string;
  method: PaymentMethod;
  userId: string;
  userEmail?: string;
  userName?: string;
  amountHtg: number;
  reference: string;
};

export async function createPendingPayment(input: CreatePaymentInput): Promise<{
  id: string;
  reference: string;
  status: PaymentStatus;
}> {
  const supabase = await getSupabaseServer();

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

  // ── Send email notification (non-blocking, never fails the payment) ──
  try {
    const userEmail  = input.userEmail ?? input.userId;
    const userName   = input.userName  ?? userEmail.split('@')[0];
    const adminSecret = process.env.ADMIN_APPROVAL_SECRET;
    const appUrl      = process.env.NEXT_PUBLIC_APP_URL
      ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : undefined)
      ?? 'http://localhost:3000';
    const approveUrl  = adminSecret
      ? `${appUrl}/api/admin/approve?ref=${encodeURIComponent(input.reference)}&token=${adminSecret}`
      : undefined;

    await sendPaymentNotification({
      userEmail,
      userName,
      planKey:    input.planKey,
      reference:  input.reference,
      method:     input.method,
      amountHtg:  input.amountHtg,
      approveUrl,
    });
  } catch (emailErr) {
    console.error('[ProfitPilot] Failed to send payment notification (non-fatal):', emailErr);
  }

  return data as { id: string; reference: string; status: PaymentStatus };
}

export async function getActiveSubscription(userId: string) {
  const supabase = await getSupabaseServer();

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

