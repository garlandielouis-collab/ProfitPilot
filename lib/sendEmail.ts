/**
 * sendEmail.ts — Email notification via Resend HTTP API
 * No package needed — uses native fetch (Node 18+)
 *
 * Setup:
 *   1. Create a free account at https://resend.com
 *   2. Get your API key from https://resend.com/api-keys
 *   3. Add  RESEND_API_KEY=re_xxxxxxxxxx  to .env.local
 *
 * Free tier: 3,000 emails/month, 100/day
 */

const RESEND_API = 'https://api.resend.com/emails';
const NOTIFY_TO  = 'garlandielouis@gmail.com';

// Plan labels for the email
const PLAN_LABELS: Record<string, string> = {
  starter:      'Starter — 500 HTG/mois',
  pro:          'Pro — 1 500 HTG/mois',
  enterprise:   'Enterprise — 3 000 HTG/mois',
  starter_year: 'Starter Annuel — 5 000 HTG/an',
  pro_year:     'Pro Annuel — 15 000 HTG/an',
};

const METHOD_LABELS: Record<string, string> = {
  moncash: 'MonCash',
  natcash: 'NatCash',
  visa:    'Carte Visa / Mastercard',
};

export interface PaymentNotificationData {
  userEmail:  string;
  userName:   string;
  planKey:    string;
  reference:  string;
  method:     string;
  amountHtg:  number;
}

export async function sendPaymentNotification(data: PaymentNotificationData): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.warn('[ProfitPilot] RESEND_API_KEY not configured — email notification skipped');
    return;
  }

  const planLabel   = PLAN_LABELS[data.planKey]   ?? data.planKey;
  const methodLabel = METHOD_LABELS[data.method]  ?? data.method;
  const now         = new Date().toLocaleString('fr-FR', { timeZone: 'America/Port-au-Prince' });

  const html = `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:Inter,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;padding:32px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:#0F172A;padding:24px 32px;">
            <div style="display:flex;align-items:center;gap:12px;">
              <span style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">ProfitPilot</span>
              <span style="background:#12B981;color:#ffffff;font-size:11px;font-weight:700;padding:3px 10px;border-radius:99px;letter-spacing:0.5px;text-transform:uppercase;">Nouveau paiement</span>
            </div>
            <p style="margin:6px 0 0;color:#94A3B8;font-size:13px;">Validation requise</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 24px;font-size:15px;color:#334155;">
              Un utilisateur vient de soumettre un paiement en attente de validation.
            </p>

            <!-- Info card -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;border-radius:12px;border:1px solid #E2E8F0;overflow:hidden;margin-bottom:24px;">
              <tr>
                <td style="padding:20px 24px;">
                  <table width="100%" cellpadding="4" cellspacing="0">
                    <tr>
                      <td style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:#94A3B8;width:140px;">Utilisateur</td>
                      <td style="font-size:14px;font-weight:600;color:#0F172A;">${escHtml(data.userName)}</td>
                    </tr>
                    <tr>
                      <td style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:#94A3B8;">Email</td>
                      <td style="font-size:14px;color:#0F172A;">${escHtml(data.userEmail)}</td>
                    </tr>
                    <tr>
                      <td style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:#94A3B8;">Plan</td>
                      <td style="font-size:14px;font-weight:600;color:#12B981;">${escHtml(planLabel)}</td>
                    </tr>
                    <tr>
                      <td style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:#94A3B8;">Montant</td>
                      <td style="font-size:14px;font-weight:700;color:#0F172A;">${data.amountHtg.toLocaleString('fr-FR')} HTG</td>
                    </tr>
                    <tr>
                      <td style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:#94A3B8;">Méthode</td>
                      <td style="font-size:14px;color:#0F172A;">${escHtml(methodLabel)}</td>
                    </tr>
                    <tr>
                      <td style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:#94A3B8;">Date</td>
                      <td style="font-size:13px;color:#64748B;">${now} (HAT)</td>
                    </tr>
                  </table>
                </td>
              </tr>
              <!-- Reference highlight -->
              <tr>
                <td style="background:#0F172A;padding:14px 24px;">
                  <span style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;color:#94A3B8;">Référence de paiement</span>
                  <div style="font-size:20px;font-weight:800;color:#12B981;letter-spacing:0.05em;margin-top:4px;font-family:monospace;">${escHtml(data.reference)}</div>
                </td>
              </tr>
            </table>

            <p style="margin:0;font-size:13px;color:#94A3B8;text-align:center;">
              Connectez-vous au tableau de bord Supabase pour approuver ou rejeter ce paiement.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#F1F5F9;padding:16px 32px;text-align:center;">
            <p style="margin:0;font-size:11px;color:#94A3B8;">
              ProfitPilot · Système de notification automatique · Ne pas répondre à cet email
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>
`.trim();

  try {
    const res = await fetch(RESEND_API, {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        from:    'ProfitPilot <onboarding@resend.dev>',
        to:      [NOTIFY_TO],
        subject: `💳 Paiement en attente — ${planLabel} — Réf: ${data.reference}`,
        html,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[ProfitPilot] Email send failed (${res.status}):`, body);
    } else {
      console.log(`[ProfitPilot] Payment notification sent → ${NOTIFY_TO} (ref: ${data.reference})`);
    }
  } catch (err) {
    // Never let email failure break the payment flow
    console.error('[ProfitPilot] Email send error (non-fatal):', err);
  }
}

/** Minimal HTML escaping to prevent injection in template literals */
function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
