// ─────────────────────────────────────────────────────────────────────────────
// Les deux courriels d'une commande en ligne
//
//   Au MARCHAND : « Nouvelle commande » — au même moment que la cloche
//   (`queueStoreOrderNotification`). La cloche ne sonne que pour qui a
//   l'application ouverte ; une commande qui attend jusqu'au soir est un client
//   qui rappelle, ou qui annule.
//
//   À L'ACHETEUR : « Votre commande est confirmée » — quand la commande passe à
//   `confirmed`, à la main par le marchand ou au règlement MonCash / NatCash
//   vérifié. Pas à la création : une commande à la livraison n'est pas encore
//   acceptée, et une commande par passerelle n'est pas encore payée.
//
// ── Une seule confirmation par commande ─────────────────────────────────────
//
// Les deux chemins de confirmation peuvent se croiser (le marchand confirme à la
// main une commande que MonCash règle ensuite). `orders.confirmation_email_sent_at`
// est posée AVANT l'envoi, par une mise à jour conditionnelle : un seul des deux
// la pose, un seul envoie. Même choix que la relance d'avis — un courriel perdu
// vaut mieux qu'un courriel en double. Sans la colonne (migration
// `20260930_order_confirmation_email` non collée), la mise à jour échoue et rien
// ne part : c'est voulu, sans elle on ne sait pas dédoublonner.
//
// ── Jamais au détriment de la commande ──────────────────────────────────────
//
// Tout est planifié avec `after()` et avale ses erreurs. Une clé Resend absente
// ou un refus d'envoi se lisent dans le journal, jamais dans la caisse.
// ─────────────────────────────────────────────────────────────────────────────

import { after } from 'next/server';
import { Resend } from 'resend';
import { getSupabaseService } from './supabaseServiceClient';
import { storePublicUrl } from './storeTheme';

// `||` et non `??` : `.env.example` livre `EMAIL_FROM=` vide, et `??` laisse
// passer la chaîne vide — Resend refuse alors l'envoi faute d'expéditeur.
const FROM = process.env.EMAIL_FROM?.trim() || 'ProfitPilot <onboarding@resend.dev>';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const money = (n: number, currency: string) =>
  `${new Intl.NumberFormat('fr-HT', { maximumFractionDigits: 2 }).format(n)} ${currency}`;

/** `after()` hors requête lève : on retombe alors sur un envoi non attendu. */
function schedule(task: () => Promise<void>): void {
  try {
    after(task);
  } catch {
    void task();
  }
}

/** Envoie, ou dit pourquoi pas. Ne lève jamais. */
async function send(tag: string, to: string, subject: string, html: string, replyTo?: string | null) {
  if (!process.env.RESEND_API_KEY) {
    console.warn(`[${tag}] RESEND_API_KEY absente — courriel non envoyé.`);
    return;
  }
  try {
    // Instancié ici, après le test de la clé : au chargement du module, le
    // constructeur lèverait pendant `next build`.
    const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: FROM,
      to,
      subject,
      html,
      ...(replyTo ? { replyTo } : {}),
    });
    if (error) console.error(`[${tag}] envoi refusé`, { to, error: error.message });
  } catch (err) {
    console.error(`[${tag}] envoi impossible`, { to, error: (err as Error).message });
  }
}

type OrderForEmail = {
  id:              string;
  business_id:     string;
  order_number:    string;
  customer_name:   string | null;
  customer_email:  string | null;
  customer_phone:  string | null;
  payment_method:  string | null;
  total:           number | string | null;
  currency:        string | null;
  order_items:     Array<{ product_name: string; quantity: number; total_price: number | string }> | null;
};

async function readOrder(orderId: string): Promise<OrderForEmail | null> {
  const { data } = await getSupabaseService()
    .from('orders')
    .select(
      'id, business_id, order_number, customer_name, customer_email, customer_phone, ' +
      'payment_method, total, currency, order_items(product_name, quantity, total_price)',
    )
    .eq('id', orderId)
    .maybeSingle();
  // Passage par `unknown` : PostgREST type la relation imbriquée comme une union
  // avec son cas d'erreur. Les champs sont relus défensivement plus bas.
  return (data as unknown as OrderForEmail | null) ?? null;
}

async function readStore(businessId: string) {
  const { data } = await getSupabaseService()
    .from('store_settings')
    .select('store_name, slug, custom_domain, contact_email')
    .eq('business_id', businessId)
    .maybeSingle();
  return data as {
    store_name: string | null; slug: string; custom_domain: string | null; contact_email: string | null;
  } | null;
}

// ─── Au marchand ─────────────────────────────────────────────────────────────

/**
 * Le courriel « Nouvelle commande » au propriétaire. Appelée par
 * `sendStoreOrderNotification`, déjà planifiée et déjà limitée à un seul moment
 * par commande — d'où l'absence de dédoublonnage ici.
 */
export async function sendMerchantOrderEmail(orderId: string, event: 'placed' | 'paid'): Promise<void> {
  try {
    const order = await readOrder(orderId);
    if (!order) return;

    const svc = getSupabaseService();
    const { data: biz } = await svc
      .from('businesses')
      .select('owner_id')
      .eq('id', order.business_id)
      .maybeSingle();
    if (!biz?.owner_id) return;

    const { data: owner } = await svc.auth.admin.getUserById(biz.owner_id as string);
    const to = owner?.user?.email?.trim();
    if (!to) return;

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL?.trim()
      || (process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : '')).replace(/\/$/, '');

    const currency = order.currency || 'HTG';
    const total    = money(Number(order.total ?? 0), currency);
    const subject  = event === 'paid'
      ? `💰 Commande payée ${order.order_number} — ${total}`
      : `🛒 Nouvelle commande ${order.order_number} — ${total}`;

    await send('commande:marchand', to, subject, buildHtml({
      header:  'ProfitPilot',
      title:   event === 'paid' ? 'Une commande vient d’être payée' : 'Vous avez une nouvelle commande',
      intro:   event === 'paid'
        ? `<strong>${escapeHtml(order.customer_name || 'Un client')}</strong> a réglé sa commande en ligne. Elle est confirmée : il ne reste qu’à la préparer.`
        : `<strong>${escapeHtml(order.customer_name || 'Un client')}</strong> vient de commander sur votre boutique, paiement à la livraison. Confirmez-la pour prévenir le client.`,
      order,
      extra:   order.customer_phone
        ? `Téléphone du client : <strong style="color:#001F3F;">${escapeHtml(order.customer_phone)}</strong>`
        : null,
      cta:     appUrl ? { label: 'Voir la commande →', url: `${appUrl}/boutique/commandes` } : null,
      footer:  'Vous recevez ce message parce que vous êtes propriétaire de cette boutique sur ProfitPilot.',
    }));
  } catch (err) {
    console.error('[commande:marchand] courriel non préparé', { orderId, error: (err as Error).message });
  }
}

// ─── À l'acheteur ────────────────────────────────────────────────────────────

/**
 * Planifie le courriel « Votre commande est confirmée ». À appeler APRÈS que la
 * commande est passée à `confirmed` ; sans effet si le courriel est déjà parti.
 */
export function queueOrderConfirmedEmail(orderId: string): void {
  schedule(() => sendOrderConfirmedEmail(orderId));
}

async function sendOrderConfirmedEmail(orderId: string): Promise<void> {
  try {
    const order = await readOrder(orderId);
    const to = order?.customer_email?.trim();
    if (!order || !to) return;

    const store = await readStore(order.business_id);
    if (!store) return;

    // AVANT l'envoi — voir l'en-tête.
    const { data: claimed, error } = await getSupabaseService()
      .from('orders')
      .update({ confirmation_email_sent_at: new Date().toISOString() })
      .eq('id', order.id)
      .is('confirmation_email_sent_at', null)
      .select('id');

    if (error) {
      console.warn('[commande:client] confirmation non envoyée — migration 20260930 collée ?', error.message);
      return;
    }
    if (!claimed || claimed.length === 0) return;

    const storeName = store.store_name || 'Votre boutique';
    const cod = order.payment_method !== 'moncash' && order.payment_method !== 'natcash';

    await send('commande:client', to, `${storeName} — votre commande ${order.order_number} est confirmée`, buildHtml({
      header: storeName,
      title:  'Votre commande est confirmée ✓',
      intro:  `${escapeHtml(order.customer_name?.trim() || 'Bonjour')}, ${escapeHtml(storeName)} a bien validé votre commande
               <strong style="color:#001F3F;">${escapeHtml(order.order_number)}</strong>. Elle est en préparation.`,
      order,
      extra:  cod ? 'Paiement à la livraison : prévoyez le montant exact à la réception.' : 'Paiement reçu. Merci !',
      cta:    { label: 'Suivre ma commande →', url: `${storePublicUrl(store)}/confirmation?id=${encodeURIComponent(order.id)}` },
      footer: `Vous recevez ce message parce que vous avez commandé chez ${escapeHtml(storeName)}.`
        + (store.contact_email ? ' Une question ? Répondez simplement à ce courriel.' : ''),
    }), store.contact_email);
  } catch (err) {
    console.error('[commande:client] courriel non préparé', { orderId, error: (err as Error).message });
  }
}

// ─── Le gabarit ──────────────────────────────────────────────────────────────

function buildHtml({
  header, title, intro, order, extra, cta, footer,
}: {
  header: string;
  title:  string;
  /** HTML déjà échappé. */
  intro:  string;
  order:  OrderForEmail;
  /** HTML déjà échappé. */
  extra:  string | null;
  cta:    { label: string; url: string } | null;
  /** HTML déjà échappé. */
  footer: string;
}): string {
  const currency = order.currency || 'HTG';

  // Au-delà de six lignes, la liste devient un inventaire : on en montre six et
  // on compte le reste. Le détail complet est derrière le lien.
  const items = order.order_items ?? [];
  const shown = items.slice(0, 6);
  const rest  = items.length - shown.length;
  const rows  = shown.map((i) => `
    <tr>
      <td style="padding:6px 0;font-size:14px;color:#475569;">${escapeHtml(i.product_name)} × ${i.quantity}</td>
      <td style="padding:6px 0;font-size:14px;color:#475569;text-align:right;white-space:nowrap;">${money(Number(i.total_price ?? 0), currency)}</td>
    </tr>`).join('')
    + (rest > 0
      ? `<tr><td colspan="2" style="padding:6px 0;font-size:13px;color:#94a3b8;">et ${rest} autre${rest > 1 ? 's' : ''} article${rest > 1 ? 's' : ''}</td></tr>`
      : '');

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table width="560" cellpadding="0" cellspacing="0" role="presentation"
               style="background:#ffffff;border-radius:24px;border:1px solid #e2e8f0;overflow:hidden;max-width:560px;width:100%;">

          <tr>
            <td style="background:#001F3F;padding:28px 40px;text-align:center;">
              <div style="font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.2px;">${escapeHtml(header)}</div>
            </td>
          </tr>

          <tr>
            <td style="padding:36px 40px 28px;">
              <div style="font-size:21px;font-weight:700;color:#001F3F;margin-bottom:14px;">${escapeHtml(title)}</div>

              <p style="font-size:15px;color:#475569;line-height:1.7;margin:0 0 20px;">${intro}</p>

              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td style="background:#f1f5f9;border-radius:14px;padding:16px 20px;">
                    <p style="font-size:12px;color:#64748b;margin:0 0 8px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;">
                      Commande ${escapeHtml(order.order_number)}
                    </p>
                    <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                      ${rows}
                      <tr>
                        <td style="padding:10px 0 0;border-top:1px solid #e2e8f0;font-size:15px;font-weight:700;color:#001F3F;">Total</td>
                        <td style="padding:10px 0 0;border-top:1px solid #e2e8f0;font-size:15px;font-weight:700;color:#001F3F;text-align:right;white-space:nowrap;">${money(Number(order.total ?? 0), currency)}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              ${extra ? `<p style="font-size:14px;color:#475569;line-height:1.6;margin:18px 0 0;">${extra}</p>` : ''}

              ${cta ? `
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td align="center" style="padding:26px 0 4px;">
                    <a href="${escapeHtml(cta.url)}"
                       style="display:inline-block;background:#50C878;color:#07210F;font-size:15px;font-weight:700;
                              text-decoration:none;padding:16px 38px;border-radius:16px;">
                      ${escapeHtml(cta.label)}
                    </a>
                  </td>
                </tr>
              </table>` : ''}
            </td>
          </tr>

          <tr>
            <td style="border-top:1px solid #e2e8f0;padding:18px 40px;text-align:center;">
              <p style="font-size:12px;color:#94a3b8;margin:0;line-height:1.6;">${footer}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
