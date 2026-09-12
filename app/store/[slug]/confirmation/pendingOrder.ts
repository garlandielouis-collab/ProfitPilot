// ─────────────────────────────────────────────────────────────────────────────
// La commande partie chez une passerelle, en attente de paiement
//
// Le panier ne se vide plus AVANT la redirection vers MonCash ou NatCash : un
// paiement annulé ou refusé ramenait l'acheteur sur « Votre panier est vide »,
// sans l'erreur et sans rien pour réessayer. Il se vide quand le paiement est
// confirmé — et pour savoir QUELLE commande confirme CE panier, la page de
// commande note son identifiant ici avant de partir.
//
// Sans ce repère, la page de confirmation viderait le panier de quiconque
// rouvre un ancien lien de commande payée, y compris un panier tout neuf.
//
// Clé par boutique, comme le panier (`pp_cart_<slug>`). localStorage est propre
// à chaque origine : un acheteur parti du sous-domaine revient sur le domaine de
// l'application, où ce repère n'existe pas. La page de commande du sous-domaine
// fait alors le rapprochement au passage suivant (CheckoutClient).
// ─────────────────────────────────────────────────────────────────────────────

const KEY = (slug: string) => `pp_cart_pending_${slug}`;

export function rememberPendingOrder(slug: string, orderId: string): void {
  try { localStorage.setItem(KEY(slug), orderId); } catch {}
}

export function readPendingOrder(slug: string): string | null {
  try { return localStorage.getItem(KEY(slug)); } catch { return null; }
}

export function forgetPendingOrder(slug: string): void {
  try { localStorage.removeItem(KEY(slug)); } catch {}
}
