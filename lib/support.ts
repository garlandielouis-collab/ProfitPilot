// ─────────────────────────────────────────────────────────────────────────────
// Le support humain — « Ekri nou » (F25 de l'étude de marché inversée)
//
// Un seul numéro, à un seul endroit. Il était recopié en dur dans la FAQ, le
// guide, le pied de page et la page API : le jour où il change, trois écrans
// sur quatre auraient continué d'envoyer les marchands vers l'ancien.
//
// « Bloqué, il abandonne » (§12, F25) : l'aide doit être à un tap, en kreyòl,
// et par vocal s'il le préfère — WhatsApp fait tout cela sans rien installer.
// ─────────────────────────────────────────────────────────────────────────────

/** Le numéro WhatsApp du support, au format international sans « + ». */
export const SUPPORT_WHATSAPP_NUMBER = '50935045946';

/** Le même, écrit pour être lu. */
export const SUPPORT_WHATSAPP_DISPLAY = '+509 3504-5946';

/**
 * Le lien qui ouvre la conversation avec le support, message prérempli.
 * Le message part en kreyòl : c'est la langue dans laquelle on lui répondra.
 */
export function supportWhatsAppLink(message?: string): string {
  const base = `https://wa.me/${SUPPORT_WHATSAPP_NUMBER}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

/**
 * Le premier mot d'une demande d'aide, selon l'écran d'où elle part. Un client
 * Elit est marqué « priyorite » : c'est le support prioritaire de son offre
 * (F25), et c'est ce mot que l'équipe lit en premier dans WhatsApp.
 */
export function supportMessage(context?: string, priority = false): string {
  const tag = priority ? '[Elit · priyorite] ' : '';
  return context
    ? `${tag}Bonjou ProfitPilot, mwen bezwen èd (${context}).`
    : `${tag}Bonjou ProfitPilot, mwen bezwen èd.`;
}

/** La revue mensuelle de 30 minutes avec un conseiller (F24, Elit). */
export function coachRequestMessage(businessName: string): string {
  return `[Elit · revizyon mwa a] Bonjou ProfitPilot, se ${businessName}. Mwen vle pran randevou pou revizyon 30 minit mwa sa a.`;
}
