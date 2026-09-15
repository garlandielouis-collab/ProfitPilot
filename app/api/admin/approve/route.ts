import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseService } from '../../../../lib/supabaseServiceClient';
import { settleReferralPayment } from '../../../actions/referrals';
import { getPlanLabel, normalizePlanKey } from '../../../../lib/plans';

// ─────────────────────────────────────────────────────────────────────────────
// Le lien d'approbation envoyé à l'administrateur
//
// Le GET n'écrit plus rien : il affiche le paiement et deux boutons. Un
// antivirus de messagerie ouvre les liens d'un e-mail avant l'humain — un GET
// qui approuvait accordait donc l'accès sans que personne n'ait regardé le
// virement. Seul le POST (un clic sur un formulaire) approuve ou refuse.
// ─────────────────────────────────────────────────────────────────────────────

const PLAN_DURATIONS: Record<string, number> = {
  starter:      30,
  pro:          30,
  enterprise:   30,
  starter_year: 365,
  pro_year:     365,
};

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isAuthorized(token: string | null): boolean {
  const secret = process.env.ADMIN_APPROVAL_SECRET;
  return Boolean(secret && token && token === secret);
}

/** `getPlanLabel` rend « Essai gratuit » pour une clé inconnue : faux sur un paiement. */
function planName(key: string | null | undefined): string {
  return normalizePlanKey(key) ? getPlanLabel(key) : String(key ?? '—');
}

async function findPayment(ref: string) {
  const db = getSupabaseService();
  const { data: payment, error } = await db
    .from('payments')
    // `*` : nommer `credit_ids` ferait échouer TOUTE approbation tant que la
    // migration des bons n'est pas jouée — et une approbation qui échoue,
    // c'est un marchand qui a payé et qui attend.
    .select('*')
    .eq('reference', ref)
    .maybeSingle();
  return { db, payment: error ? null : payment };
}

// ── GET : la page de confirmation ────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const ref   = searchParams.get('ref');
  const token = searchParams.get('token');

  if (!isAuthorized(token)) {
    return new NextResponse('Non autorisé', { status: 401 });
  }
  if (!ref) {
    return new NextResponse('Référence manquante', { status: 400 });
  }

  try {
    const { db, payment } = await findPayment(ref);

    if (!payment) {
      return new NextResponse(`Paiement introuvable pour la référence: ${ref}`, { status: 404 });
    }

    if (payment.status === 'approved') {
      return htmlResponse('✅ Déjà approuvé', `<p>Ce paiement (réf: <code>${escapeHtml(ref)}</code>) est déjà approuvé.</p>`, 'green');
    }

    const { data: { user } } = await db.auth.admin.getUserById(payment.user_id);
    const userEmail = user?.email ?? payment.user_id;

    const hidden = `<input type="hidden" name="ref" value="${escapeHtml(ref)}"/>`
      + `<input type="hidden" name="token" value="${escapeHtml(token)}"/>`;

    const body = `
      <p>Client : <strong>${escapeHtml(userEmail)}</strong><br/>
         Offre : <strong>${escapeHtml(planName(payment.plan_key))}</strong><br/>
         Montant : <strong>${escapeHtml(Number(payment.amount_htg ?? 0).toLocaleString('fr-FR'))} HTG</strong>${
           payment.discount_percent ? ` (−${escapeHtml(payment.discount_percent)} % parrainage)` : ''
         }<br/>
         Référence : <code>${escapeHtml(ref)}</code>
         ${payment.status === 'rejected' ? '<br/><strong>Ce paiement a déjà été refusé.</strong>' : ''}
      </p>
      <p>Vérifiez que le virement est bien arrivé avant d'approuver.</p>
      <div class="actions">
        <form method="post" action="/api/admin/approve">${hidden}
          <button type="submit" name="action" value="approve" class="approve">Approuver</button>
        </form>
        ${payment.status === 'rejected' ? '' : `<form method="post" action="/api/admin/approve">${hidden}
          <button type="submit" name="action" value="reject" class="reject">Refuser</button>
        </form>`}
      </div>`;

    return htmlResponse('Confirmer le paiement', body, 'neutral');
  } catch (err: any) {
    console.error('[Admin Approve]', err);
    return htmlResponse('❌ Erreur', `<p>${escapeHtml(err instanceof Error ? err.message : 'Erreur inconnue')}</p>`, 'red');
  }
}

// ── POST : la décision ───────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return new NextResponse('Requête invalide', { status: 400 });
  }

  const field  = (name: string) => {
    const value = form.get(name);
    return typeof value === 'string' ? value : null;
  };
  const ref    = field('ref');
  const token  = field('token');
  const action = field('action');

  // ── Auth check ─────────────────────────────────────────────────────────────
  if (!isAuthorized(token)) {
    return new NextResponse('Non autorisé', { status: 401 });
  }
  if (!ref) {
    return new NextResponse('Référence manquante', { status: 400 });
  }
  if (action !== 'approve' && action !== 'reject') {
    return new NextResponse('Action inconnue', { status: 400 });
  }

  try {
    const { db, payment } = await findPayment(ref);

    if (!payment) {
      return new NextResponse(`Paiement introuvable pour la référence: ${ref}`, { status: 404 });
    }

    if (payment.status === 'approved') {
      return htmlResponse('✅ Déjà approuvé', `<p>Ce paiement (réf: <code>${escapeHtml(ref)}</code>) est déjà approuvé.</p>`, 'green');
    }

    // ── Refus ──────────────────────────────────────────────────────────────
    // `rejected` fait partie de l'énum `payment_status` (001_payment_tables.sql).
    // Rien d'autre ne bouge : aucun abonnement, aucun bon consommé.
    if (action === 'reject') {
      if (payment.status !== 'rejected') {
        const { error: rejectErr } = await db
          .from('payments')
          .update({ status: 'rejected' })
          .eq('id', payment.id);
        if (rejectErr) throw rejectErr;
      }
      return htmlResponse(
        'Paiement refusé',
        `<p>Le paiement (réf: <code>${escapeHtml(ref)}</code>) est marqué refusé. Aucun accès n'a été accordé.</p>`,
        'red'
      );
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

    // ── Les bons de réduction retenus au devis ─────────────────────────────
    //
    // C'est ICI qu'ils se décomptent, et nulle part ailleurs : entre
    // l'enregistrement du paiement et ce clic, le virement pouvait ne jamais
    // arriver. Un bon brûlé sur un paiement refusé est un cadeau repris.
    //
    // `credits_settled_at` garde la porte : rouvrir ce lien deux fois ne doit
    // pas consommer deux mois de bon. (Le premier test sur `status` couvre déjà
    // le cas courant ; celui-ci couvre un paiement approuvé à la main en base.)
    const creditIds = (payment.credit_ids ?? []) as string[];
    if (creditIds.length > 0 && !payment.credits_settled_at) {
      await db.rpc('consume_upgrade_credits', { p_ids: creditIds });
      await db
        .from('payments')
        .update({ credits_settled_at: new Date().toISOString() })
        .eq('id', payment.id);
    }

    // ── Le barreau 3 du parrainage ─────────────────────────────────────────
    //
    // Le filleul vient de payer son premier mois : c'est le seul moment où le
    // parrain gagne de l'argent. La fonction est idempotente — `referrals.paid_at`
    // est sa garde — donc une approbation rejouée n'émet pas un second bon.
    // Attendu, pas lancé en arrière-plan : une route serverless est coupée dès
    // qu'elle a répondu, et un parrain aurait perdu sa récompense une fois sur
    // deux sans qu'aucune trace n'en reste.
    try {
      await settleReferralPayment(payment.user_id, payment.plan_key);
    } catch (referralErr) {
      console.error('[Admin Approve] parrainage non soldé (non fatal):', referralErr);
    }

    // ── Get user info for confirmation ─────────────────────────────────────
    const { data: { user } } = await db.auth.admin.getUserById(payment.user_id);
    const userEmail = user?.email ?? payment.user_id;

    return htmlResponse(
      '✅ Abonnement activé',
      `<p>L'accès a été accordé à <strong>${escapeHtml(userEmail)}</strong><br/>
       Plan: <strong>${escapeHtml(planName(payment.plan_key))}</strong> · Expire le: <strong>${new Date(expiresAt).toLocaleDateString('fr-FR')}</strong><br/>
       Encaissé: <strong>${escapeHtml(Number(payment.amount_htg ?? 0).toLocaleString('fr-FR'))} HTG</strong>${
         payment.discount_percent ? ` (−${escapeHtml(payment.discount_percent)} % parrainage)` : ''
       }<br/>
       Référence: <code>${escapeHtml(ref)}</code></p>`,
      'green'
    );

  } catch (err: any) {
    console.error('[Admin Approve]', err);
    return htmlResponse('❌ Erreur', `<p>${escapeHtml(err instanceof Error ? err.message : 'Erreur inconnue')}</p>`, 'red');
  }
}

/** `body` est du HTML déjà échappé par l'appelant ; `title` est toujours une constante. */
function htmlResponse(title: string, body: string, color: 'green' | 'red' | 'neutral') {
  const bg = color === 'green' ? '#d1fae5' : color === 'red' ? '#fee2e2' : '#ffffff';
  const border = color === 'green' ? '#86d3a5' : color === 'red' ? '#fca5a5' : '#e5e7eb';
  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <meta name="robots" content="noindex"/>
  <title>${escapeHtml(title)}</title>
  <style>body{font-family:Inter,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f8fafc;margin:0;padding:0 16px}
  .box{background:${bg};border:1px solid ${border};border-radius:16px;padding:32px 40px;max-width:480px;text-align:center}
  h1{font-size:24px;margin:0 0 12px}p{color:#374151;line-height:1.6}code{background:#e5e7eb;padding:2px 6px;border-radius:4px;font-size:13px}
  a{display:inline-block;margin-top:20px;background:#001F3F;color:#fff;padding:10px 24px;border-radius:10px;text-decoration:none;font-weight:600}
  .actions{display:flex;gap:12px;justify-content:center;margin-top:20px}
  button{border:0;border-radius:10px;padding:10px 24px;font-weight:600;font-size:15px;cursor:pointer}
  .approve{background:#001F3F;color:#fff}.reject{background:#fff;color:#b91c1c;border:1px solid #fca5a5}
  </style></head>
  <body><div class="box"><h1>${escapeHtml(title)}</h1>${body}<a href="https://supabase.com/dashboard">Ouvrir Supabase</a></div></body></html>`;
  return new NextResponse(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
