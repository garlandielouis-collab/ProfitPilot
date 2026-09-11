// ─────────────────────────────────────────────────────────────────────────────
// Rapports WhatsApp — Bonus 1 (résumé hebdo) + Diagnostic 3 (relance créance)
//
// Construit uniquement le TEXTE et le lien wa.me. L'envoi réel (API WhatsApp
// Business ou clic manuel du marchand) reste décidé par l'appelant : c'est ce
// qui permet de démarrer sans compte WhatsApp Business.
// ─────────────────────────────────────────────────────────────────────────────

import type { Insight } from './insights';

const money = (n: number, currency: string): string =>
  `${new Intl.NumberFormat('fr-HT', { maximumFractionDigits: 0 }).format(Math.round(n))} ${currency}`;

const shortDate = (iso: string): string =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });

/**
 * Normalise un numéro haïtien au format international attendu par wa.me.
 * Accepte "3712 3456", "+509 37123456", "50937123456".
 */
export function toWhatsAppNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('509')) return digits;
  if (digits.length === 8) return `509${digits}`;      // numéro local haïtien
  return digits;                                        // déjà international
}

/** Lien cliquable qui ouvre WhatsApp avec le message pré-rempli. */
export function buildWhatsAppLink(phone: string | null | undefined, message: string): string {
  const number = toWhatsAppNumber(phone);
  const text = encodeURIComponent(message);
  return number ? `https://wa.me/${number}?text=${text}` : `https://wa.me/?text=${text}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Résumé hebdomadaire (dimanche soir)
// ─────────────────────────────────────────────────────────────────────────────

export type WeeklyDigestInput = {
  businessName: string;
  currency: string;
  periodStart: string;   // YYYY-MM-DD
  periodEnd: string;     // YYYY-MM-DD
  revenue: number;
  grossMargin: number;
  salesCount: number;
  previousRevenue: number;
  topProduct?: { name: string; grossMargin: number } | null;
  receivablesDue: Array<{ clientName: string; balanceDue: number; daysOverdue: number }>;
  insights?: Insight[];
};

/**
 * Message hebdo : ventes, marge, top produit, créances à relancer.
 * Format court et lisible sur un téléphone, sans jargon comptable.
 */
export function buildWeeklyDigest(input: WeeklyDigestInput): string {
  const cur = input.currency;
  const lines: string[] = [];

  lines.push(`📊 *ProfitPilot — ${input.businessName}*`);
  lines.push(`Semaine du ${shortDate(input.periodStart)} au ${shortDate(input.periodEnd)}`);
  lines.push('');
  lines.push(`💰 Ventes : *${money(input.revenue, cur)}* (${input.salesCount} vente${input.salesCount > 1 ? 's' : ''})`);

  const marginPct = input.revenue > 0 ? (input.grossMargin / input.revenue) * 100 : 0;
  lines.push(`📈 Marge : *${money(input.grossMargin, cur)}* (${marginPct.toFixed(0)}%)`);

  if (input.previousRevenue > 0) {
    const delta = ((input.revenue - input.previousRevenue) / input.previousRevenue) * 100;
    const arrow = delta >= 0 ? '🔼' : '🔽';
    lines.push(`${arrow} vs semaine passée : ${delta >= 0 ? '+' : ''}${delta.toFixed(0)}%`);
  }

  if (input.topProduct) {
    lines.push('');
    lines.push(`🏆 Top produit : *${input.topProduct.name}* — ${money(input.topProduct.grossMargin, cur)} de marge`);
  }

  if (input.receivablesDue.length > 0) {
    const total = input.receivablesDue.reduce((s, r) => s + r.balanceDue, 0);
    lines.push('');
    lines.push(`⏳ Créances à relancer : *${money(total, cur)}*`);
    for (const r of input.receivablesDue.slice(0, 5)) {
      const late = r.daysOverdue > 0 ? ` — ${r.daysOverdue} j de retard` : '';
      lines.push(`   • ${r.clientName} : ${money(r.balanceDue, cur)}${late}`);
    }
    if (input.receivablesDue.length > 5) {
      lines.push(`   • …et ${input.receivablesDue.length - 5} autre(s)`);
    }
  }

  const actionable = (input.insights ?? []).filter(
    (i) => i.severity === 'critical' || i.severity === 'warning',
  );
  if (actionable.length > 0) {
    lines.push('');
    lines.push('⚠️ À regarder cette semaine :');
    for (const i of actionable.slice(0, 3)) lines.push(`   • ${i.message}`);
  }

  // L'adresse réelle du déploiement, même repli que `app/actions/payments.ts`.
  // Sans URL absolue connue, pas de ligne du tout : un lien vers localhost dans
  // un WhatsApp ne mène nulle part.
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL?.trim()
    || (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : '')).replace(/\/$/, '');
  if (appUrl) {
    lines.push('');
    lines.push(`👉 Ouvrir le tableau de bord : ${appUrl}/dashboard`);
  }

  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Relance de créance
// ─────────────────────────────────────────────────────────────────────────────

export type ReminderInput = {
  businessName: string;
  clientName: string;
  amount: number;
  currency: string;
  dueDate: string | null;
  daysOverdue: number;
  invoiceNumber?: string | null;
};

/**
 * Message de relance prêt à envoyer — ton respectueux, jamais accusateur :
 * le marchand doit pouvoir l'envoyer sans abîmer la relation client.
 */
export function buildReminderMessage(input: ReminderInput): string {
  const amount = money(input.amount, input.currency);
  const ref = input.invoiceNumber ? ` (facture ${input.invoiceNumber})` : '';

  if (input.daysOverdue > 0) {
    return [
      `Bonjour ${input.clientName}, c'est ${input.businessName}.`,
      ``,
      `Petit rappel amical : il reste *${amount}*${ref} à régler${input.dueDate ? `, échéance du ${shortDate(input.dueDate)}` : ''}.`,
      ``,
      `Dites-moi ce qui vous arrange pour le paiement. Merci pour votre confiance 🙏`,
    ].join('\n');
  }

  return [
    `Bonjour ${input.clientName}, c'est ${input.businessName}.`,
    ``,
    `Juste pour information : le montant de *${amount}*${ref} arrive à échéance${input.dueDate ? ` le ${shortDate(input.dueDate)}` : ''}.`,
    ``,
    `Merci beaucoup 🙏`,
  ].join('\n');
}
