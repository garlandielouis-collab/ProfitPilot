// ─────────────────────────────────────────────────────────────────────────────
// La relance « donnez votre avis »
//
// ── Pourquoi elle existe ────────────────────────────────────────────────────
//
// Le formulaire de la page de confirmation attrape ceux qui notent dans la
// minute. Ce n'est pas la majorité : on vient de payer, on veut d'abord recevoir
// le colis. Or l'avis qui compte est justement celui d'après — celui de
// quelqu'un qui a le produit en main.
//
// ── Le timing, et la raison du délai ────────────────────────────────────────
//
// Trois jours après LIVRAISON, pas après commande. Demander son avis à
// quelqu'un qui n'a rien reçu est la meilleure façon d'obtenir une mauvaise
// note pour un produit qui n'est pas en cause.
//
// Une seule relance par commande, jamais deux : `orders.review_email_sent_at`
// est posée avant l'envoi et ne se remet pas à zéro. Un client qui ignore la
// demande n'est pas relancé — un commerce qui redemande n'obtient pas d'avis,
// il obtient une désinscription.
//
// ── Ce que le courriel n'est pas ────────────────────────────────────────────
//
// Ce n'est pas une promotion. Aucun code, aucune offre, aucun « et découvrez
// nos nouveautés ». Un message qui demande un service et vend dans le même
// souffle n'obtient ni l'un ni l'autre. Il porte le nom de la boutique, la
// commande, les produits, et un lien.
//
// Il est envoyé au nom du MARCHAND, pas de ProfitPilot : c'est chez lui que le
// client a acheté. Le pied de page dit d'où vient le message, parce qu'un
// courriel dont on ne comprend pas l'origine finit en indésirable.
// ─────────────────────────────────────────────────────────────────────────────

import { Resend } from 'resend';

// Même expéditeur vérifié que le reste du produit. À basculer sur le domaine du
// marchand le jour où l'on saura le vérifier pour lui — c'est ce qui ferait
// vraiment arriver ce message en boîte principale.
// `||` et non `??` : `.env.example` livre `EMAIL_FROM=` vide, et `??` laisse
// passer la chaîne vide — Resend refuse alors l'envoi faute d'expéditeur.
const FROM = process.env.EMAIL_FROM?.trim() || 'ProfitPilot <onboarding@resend.dev>';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export type ReviewRequestInput = {
  to:          string;
  storeName:   string;
  customerName: string;
  orderNumber: string;
  productNames: string[];
  /** L'adresse de la page de confirmation, jeton compris. */
  reviewUrl:   string;
};

/**
 * Envoie la relance. Lève si Resend refuse — l'appelant décide quoi en faire.
 *
 * Elle ne lève PAS quand la clé manque : elle ne fait rien et le dit. Un
 * balayage nocturne qui s'arrête parce qu'une variable d'environnement n'est pas
 * posée en développement ferait échouer les autres tâches de la nuit.
 */
export async function sendReviewRequestEmail(input: ReviewRequestInput): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[avis] RESEND_API_KEY absente — relance non envoyée.');
    return false;
  }

  // Le client naît ici, après le test de la clé : instancié au chargement du
  // module, son constructeur lèverait pendant `next build` et ferait échouer
  // le déploiement de tout projet où la variable n'est pas posée.
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from:    FROM,
    to:      input.to,
    subject: `${input.storeName} — votre avis sur la commande ${input.orderNumber}`,
    html:    buildHtml(input),
  });

  if (error) throw new Error(`Erreur email : ${error.message}`);
  return true;
}

function buildHtml({
  storeName, customerName, orderNumber, productNames, reviewUrl,
}: ReviewRequestInput): string {
  const store = escapeHtml(storeName);
  const who   = escapeHtml(customerName.trim() || 'Bonjour');
  const url   = escapeHtml(reviewUrl);

  // Au-delà de quatre produits la liste devient un inventaire : on en nomme
  // quatre et on compte le reste. Le lien mène à la commande entière de toute
  // façon.
  const shown = productNames.slice(0, 4).map(escapeHtml);
  const rest  = productNames.length - shown.length;

  const items = shown
    .map((n) => `<li style="margin:0 0 6px;">${n}</li>`)
    .join('')
    + (rest > 0
      ? `<li style="margin:0;color:#94a3b8;">et ${rest} autre${rest > 1 ? 's' : ''} article${rest > 1 ? 's' : ''}</li>`
      : '');

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Votre avis</title>
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table width="560" cellpadding="0" cellspacing="0" role="presentation"
               style="background:#ffffff;border-radius:24px;border:1px solid #e2e8f0;overflow:hidden;max-width:560px;width:100%;">

          <tr>
            <td style="background:#001F3F;padding:28px 40px;text-align:center;">
              <div style="font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.2px;">${store}</div>
            </td>
          </tr>

          <tr>
            <td style="padding:36px 40px 28px;">
              <div style="font-size:21px;font-weight:700;color:#001F3F;margin-bottom:14px;">
                Votre commande vous a-t-elle plu ?
              </div>

              <p style="font-size:15px;color:#475569;line-height:1.7;margin:0 0 18px;">
                ${who},
              </p>

              <p style="font-size:15px;color:#475569;line-height:1.7;margin:0 0 20px;">
                Vous avez reçu votre commande <strong style="color:#001F3F;">${orderNumber}</strong>.
                Si vous avez deux minutes, votre note aiderait les prochains acheteurs à choisir —
                c'est la seule chose qu'ils n'ont pas, et que vous avez.
              </p>

              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td style="background:#f1f5f9;border-radius:14px;padding:16px 20px;">
                    <p style="font-size:12px;color:#64748b;margin:0 0 8px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;">
                      Ce que vous avez commandé
                    </p>
                    <ul style="font-size:14px;color:#475569;margin:0;padding-left:20px;line-height:1.6;">
                      ${items}
                    </ul>
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td align="center" style="padding:26px 0 20px;">
                    <a href="${url}"
                       style="display:inline-block;background:#50C878;color:#07210F;font-size:15px;font-weight:700;
                              text-decoration:none;padding:16px 38px;border-radius:16px;">
                      Donner mon avis →
                    </a>
                  </td>
                </tr>
              </table>

              <p style="font-size:13px;color:#94a3b8;margin:0;text-align:center;line-height:1.6;">
                Aucun compte à créer, aucun mot de passe. Le lien vous reconnaît.<br />
                ${store} relit les avis avant publication.
              </p>
            </td>
          </tr>

          <tr>
            <td style="border-top:1px solid #e2e8f0;padding:18px 40px;text-align:center;">
              <p style="font-size:12px;color:#94a3b8;margin:0;line-height:1.6;">
                Vous recevez ce message parce que vous avez commandé chez ${store}.
                C'est le seul envoi de ce type pour cette commande.<br />
                <a href="${url}" style="color:#64748b;text-decoration:underline;font-size:11px;word-break:break-all;">${url}</a>
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
