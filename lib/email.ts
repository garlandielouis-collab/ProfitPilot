import { Resend } from 'resend';

// Instancié à l'envoi, jamais au chargement du module : le constructeur lève
// sans clé, et `next build` charge les routes pour collecter leurs données —
// une variable absente ferait alors échouer tout le déploiement.
function client(): Resend {
  return new Resend(process.env.RESEND_API_KEY);
}

// Use verified Resend sender. Switch to noreply@profitpilot.ht once the domain
// is verified at https://resend.com/domains
const FROM = process.env.EMAIL_FROM ?? 'ProfitPilot <onboarding@resend.dev>';

export async function sendInvitationEmail({
  to,
  inviteeName,
  companyName,
  inviterName,
  acceptUrl,
  expiresInDays = 7,
}: {
  to:            string;
  inviteeName:   string;
  companyName:   string;
  inviterName:   string;
  acceptUrl:     string;
  expiresInDays?: number;
}) {
  const { error } = await client().emails.send({
    from:    FROM,
    to,
    subject: `Invitation à rejoindre ${companyName} sur ProfitPilot`,
    html:    buildInvitationHtml({ inviteeName, companyName, inviterName, acceptUrl, expiresInDays }),
  });

  if (error) throw new Error(`Erreur email : ${error.message}`);
}

function buildInvitationHtml({
  inviteeName, companyName, inviterName, acceptUrl, expiresInDays,
}: {
  inviteeName:   string;
  companyName:   string;
  inviterName:   string;
  acceptUrl:     string;
  expiresInDays: number;
}): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Invitation ProfitPilot</title>
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table width="560" cellpadding="0" cellspacing="0" role="presentation"
               style="background:#ffffff;border-radius:24px;border:1px solid #e2e8f0;overflow:hidden;max-width:560px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="background:#001F3F;padding:32px 40px;text-align:center;">
              <div style="font-size:28px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">
                Profit<span style="color:#50C878;">Pilot</span>
              </div>
              <div style="font-size:13px;color:rgba(255,255,255,0.6);margin-top:6px;">
                Gestion Financière Intelligente
              </div>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 32px;">
              <div style="font-size:22px;font-weight:700;color:#001F3F;margin-bottom:16px;">
                Vous avez été invité(e) 🎉
              </div>

              <p style="font-size:15px;color:#475569;line-height:1.7;margin:0 0 20px;">
                Bonjour <strong style="color:#001F3F;">${inviteeName}</strong>,
              </p>

              <p style="font-size:15px;color:#475569;line-height:1.7;margin:0 0 24px;">
                <strong style="color:#001F3F;">${inviterName}</strong> vous invite à rejoindre
                <strong style="color:#001F3F;">${companyName}</strong> sur ProfitPilot —
                la plateforme de gestion financière pour entrepreneurs haïtiens.
              </p>

              <!-- CTA -->
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td align="center" style="padding:8px 0 28px;">
                    <a href="${acceptUrl}"
                       style="display:inline-block;background:#001F3F;color:#ffffff;font-size:15px;font-weight:700;
                              text-decoration:none;padding:16px 40px;border-radius:16px;letter-spacing:0.3px;">
                      Accepter l'invitation →
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Info box -->
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td style="background:#f1f5f9;border-radius:14px;padding:16px 20px;">
                    <p style="font-size:13px;color:#64748b;margin:0 0 6px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;">
                      Ce que vous pouvez faire
                    </p>
                    <ul style="font-size:14px;color:#475569;margin:0;padding-left:20px;line-height:2;">
                      <li>Consulter les ventes et stocks en temps réel</li>
                      <li>Gérer les transactions de la journée</li>
                      <li>Accéder aux rapports de votre boutique</li>
                    </ul>
                  </td>
                </tr>
              </table>

              <p style="font-size:13px;color:#94a3b8;margin:24px 0 0;text-align:center;">
                Ce lien expire dans <strong>${expiresInDays} jours</strong>.
                Si vous n'attendiez pas cette invitation, ignorez cet email.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="border-top:1px solid #e2e8f0;padding:20px 40px;text-align:center;">
              <p style="font-size:12px;color:#94a3b8;margin:0;">
                ProfitPilot · Port-au-Prince, Haïti<br />
                <a href="${acceptUrl}" style="color:#64748b;text-decoration:underline;font-size:11px;
                   word-break:break-all;">${acceptUrl}</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
