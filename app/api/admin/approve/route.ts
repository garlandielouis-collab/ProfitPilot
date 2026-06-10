import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseService } from '../../../../lib/supabaseServiceClient';

const PLAN_DURATIONS: Record<string, number> = {
  starter:      30,
  pro:          30,
  enterprise:   30,
  starter_year: 365,
  pro_year:     365,
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const ref    = searchParams.get('ref');
  const token  = searchParams.get('token');
  const secret = process.env.ADMIN_APPROVAL_SECRET;

  // ── Auth check ─────────────────────────────────────────────────────────────
  if (!secret || !token || token !== secret) {
    return new NextResponse('Non autorisé', { status: 401 });
  }
  if (!ref) {
    return new NextResponse('Référence manquante', { status: 400 });
  }

  try {
    const db = getSupabaseService();

    // ── Find payment by reference ──────────────────────────────────────────
    const { data: payment, error: payErr } = await db
      .from('payments')
      .select('id, user_id, plan_key, amount_htg, status')
      .eq('reference', ref)
      .maybeSingle();

    if (payErr || !payment) {
      return new NextResponse(`Paiement introuvable pour la référence: ${ref}`, { status: 404 });
    }

    if (payment.status === 'approved') {
      return htmlResponse('✅ Déjà approuvé', `Ce paiement (réf: ${ref}) est déjà approuvé.`, 'green');
    }

    // ── Calculate expiry ───────────────────────────────────────────────────
    const days = PLAN_DURATIONS[payment.plan_key] ?? 30;
    const expiresAt = new Date(Date.now() + days * 86_400_000).toISOString();

    // ── Mark payment as approved ──────────────────────────────────────────
    await db
      .from('payments')
      .update({ status: 'approved' })
      .eq('id', payment.id);

    // ── Insert or update subscription ─────────────────────────────────────
    await db
      .from('subscriptions')
      .upsert(
        {
          user_id:    payment.user_id,
          plan_key:   payment.plan_key,
          status:     'active',
          expires_at: expiresAt,
        },
        { onConflict: 'user_id' }
      );

    // ── Get user info for confirmation ─────────────────────────────────────
    const { data: { user } } = await db.auth.admin.getUserById(payment.user_id);
    const userEmail = user?.email ?? payment.user_id;

    return htmlResponse(
      '✅ Abonnement activé',
      `L'accès a été accordé à <strong>${userEmail}</strong><br/>
       Plan: <strong>${payment.plan_key}</strong> · Expire le: <strong>${new Date(expiresAt).toLocaleDateString('fr-FR')}</strong><br/>
       Référence: <code>${ref}</code>`,
      'green'
    );

  } catch (err: any) {
    console.error('[Admin Approve]', err);
    return htmlResponse('❌ Erreur', err?.message ?? 'Erreur inconnue', 'red');
  }
}

function htmlResponse(title: string, body: string, color: 'green' | 'red') {
  const bg = color === 'green' ? '#d1fae5' : '#fee2e2';
  const border = color === 'green' ? '#6ee7b7' : '#fca5a5';
  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"/>
  <title>${title}</title>
  <style>body{font-family:Inter,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f8fafc;margin:0}
  .box{background:${bg};border:1px solid ${border};border-radius:16px;padding:32px 40px;max-width:480px;text-align:center}
  h1{font-size:24px;margin:0 0 12px}p{color:#374151;line-height:1.6}code{background:#e5e7eb;padding:2px 6px;border-radius:4px;font-size:13px}
  a{display:inline-block;margin-top:20px;background:#001F3F;color:#fff;padding:10px 24px;border-radius:10px;text-decoration:none;font-weight:600}
  </style></head>
  <body><div class="box"><h1>${title}</h1><p>${body}</p><a href="https://supabase.com/dashboard">Ouvrir Supabase</a></div></body></html>`;
  return new NextResponse(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
