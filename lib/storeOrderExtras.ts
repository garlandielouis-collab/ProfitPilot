// ─────────────────────────────────────────────────────────────────────────────
// Ce que la fiche produit demande, et que le tunnel reprend
//
// Un gâteau se commande pour une date ; une séance se réserve à une heure ; une
// pièce se grave d'un prénom. Les maquettes posent ces questions sur la FICHE,
// au moment où l'acheteur y pense — pas trois écrans plus loin, quand il a déjà
// donné son adresse.
//
// Mais la commande, elle, part du tunnel : c'est lui qui connaît le panier, le
// mode de livraison et le paiement, et c'est sa fonction `composedNotes` qui
// range ces réponses dans les notes que le marchand lit sur sa fiche de
// commande. Le rôle de ce fichier est donc uniquement de les TRANSPORTER de
// l'une à l'autre.
//
// ── Pourquoi pas le panier ─────────────────────────────────────────────────
//
// Parce que ces réponses ne décrivent pas un article, elles décrivent la
// commande : « samedi 14 h » ne se multiplie pas par trois quand on met trois
// gâteaux au panier, et ne se dédouble pas quand on y ajoute autre chose. Les
// ranger dans une ligne de panier obligerait à décider laquelle des trois fait
// foi.
//
// ── Ce qui n'est pas ici ───────────────────────────────────────────────────
//
// Aucun prix. Rien de ce que l'acheteur répond sur la fiche ne modifie le
// montant : un total calculé à partir d'une case cochée serait un total que la
// caisse ne confirmerait pas (§6).
// ─────────────────────────────────────────────────────────────────────────────

export type OrderExtras = {
  /** ISO court, « 2026-09-26 » : la valeur d'un champ date, telle quelle. */
  wantedDate:    string;
  /** « 14:00 ». */
  wantedTime:    string;
  /** Gravure, message sur le gâteau, dimensions demandées. */
  customisation: string;
  /** L'identifiant du mode de livraison choisi sur la fiche, s'il l'a été. */
  shippingModeId: string;
  /** L'adresse dictée sur la fiche. Le tunnel la propose, l'acheteur la corrige. */
  address:       string;
};

const EMPTY: OrderExtras = {
  wantedDate: '', wantedTime: '', customisation: '', shippingModeId: '', address: '',
};

const KEY = (slug: string) => `pp_order_extras_${slug}`;

/**
 * Ce que la fiche a demandé, relu par le tunnel.
 *
 * Ne lève jamais : `localStorage` est refusé en navigation privée sur certains
 * navigateurs, et un tunnel qui refuse de s'afficher parce qu'il n'a pas pu
 * relire une date facultative serait un tunnel qui ne vend plus.
 */
export function readOrderExtras(slug: string): OrderExtras {
  try {
    const raw = window.localStorage.getItem(KEY(slug));
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<OrderExtras>;
    return {
      wantedDate:     str(parsed.wantedDate),
      wantedTime:     str(parsed.wantedTime),
      customisation:  str(parsed.customisation).slice(0, 400),
      shippingModeId: str(parsed.shippingModeId),
      address:        str(parsed.address).slice(0, 200),
    };
  } catch {
    return EMPTY;
  }
}

export function writeOrderExtras(slug: string, extras: Partial<OrderExtras>): void {
  try {
    const next = { ...readOrderExtras(slug), ...extras };
    window.localStorage.setItem(KEY(slug), JSON.stringify(next));
  } catch {
    // Stockage refusé : la fiche garde ses réponses à l'écran, le tunnel les
    // redemandera. Rien ne se perd silencieusement dans la commande.
  }
}

/** Après une commande partie : la date de la suivante n'est pas celle-ci. */
export function clearOrderExtras(slug: string): void {
  try {
    window.localStorage.removeItem(KEY(slug));
  } catch {
    // Voir `writeOrderExtras`.
  }
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}
