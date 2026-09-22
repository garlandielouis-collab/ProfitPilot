// ─────────────────────────────────────────────────────────────────────────────
// Masquer ce qui n'a pas besoin d'être lu en entier
//
// Trois données sensibles circulent dans ce module : le numéro d'encaissement du
// marchand, le numéro de l'expéditeur d'un versement, et les identifiants de
// transaction. Le §47 demande de ne pas les exposer inutilement.
//
// ── Ce qui est masqué, et ce qui ne l'est PAS ──────────────────────────────
//
// Le numéro du MARCHAND sur la page de paiement n'est pas masqué, et ne doit
// jamais l'être : l'acheteur doit le recopier dans son téléphone. Un numéro
// masqué là serait un écran qui promet un paiement impossible. Il est masqué
// ailleurs — dans la liste des moyens de paiement, dans les journaux, dans les
// notifications — parce qu'ailleurs, personne n'a besoin de le lire.
//
// Le numéro de l'EXPÉDITEUR est masqué partout sauf sur la fiche d'un paiement
// non rapproché, où il est le seul indice permettant au marchand de reconnaître
// son client. Masquer là rendrait le rattachement manuel impossible — donc
// supprimerait la fonctionnalité qu'on essaie d'offrir.
//
// La règle derrière ces deux exceptions : on masque quand la donnée est AFFICHÉE
// EN PASSANT, on la montre quand elle est l'OBJET de l'écran.
//
// ── Pourquoi les quatre derniers chiffres ──────────────────────────────────
//
// Un numéro haïtien a huit chiffres après l'indicatif. Quatre suffisent à
// reconnaître son propre numéro parmi trois, et ne suffisent pas à le composer.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `+509 3712 3456` devient `•••• 3456`.
 *
 * Un numéro trop court pour être masqué utilement est rendu entièrement masqué
 * plutôt que montré : mieux vaut un écran inutile qu'une fuite.
 */
export function maskPhone(raw: string | null | undefined): string {
  if (typeof raw !== 'string') return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 0) return '';
  if (digits.length <= 4) return '••••';
  return `•••• ${digits.slice(-4)}`;
}

/**
 * `MC8837451` devient `MC•••451`.
 *
 * Un identifiant de transaction n'est pas un secret — il figure dans le SMS du
 * client et dans le relevé du marchand. Il est néanmoins masqué dans les listes,
 * pour une raison pratique plus que de confidentialité : entier, il occupe la
 * largeur d'une carte sur un téléphone et pousse le montant hors de l'écran.
 * Trois caractères de tête et trois de queue suffisent à distinguer deux
 * transactions.
 */
export function maskReference(raw: string | null | undefined): string {
  if (typeof raw !== 'string') return '';
  const clean = raw.trim();
  if (clean.length === 0) return '';
  if (clean.length <= 6) return clean;
  return `${clean.slice(0, 2)}•••${clean.slice(-3)}`;
}

/**
 * Le numéro tel que l'acheteur doit le RECOPIER.
 *
 * Groupé par quatre après l'indicatif — `+509 3712 3456` — parce qu'un numéro de
 * huit chiffres à la file se recopie de travers. C'est la seule fonction de ce
 * fichier qui ne masque rien, et elle est ici pour qu'on voie les deux
 * traitements côte à côte : celui de l'écran de paiement, et celui du reste.
 */
export function formatHaitianPhone(raw: string | null | undefined): string {
  if (typeof raw !== 'string') return '';
  const digits = raw.replace(/\D/g, '');
  const local = digits.startsWith('509') ? digits.slice(3) : digits;
  if (local.length !== 8) return raw.trim();
  return `+509 ${local.slice(0, 4)} ${local.slice(4)}`;
}

/**
 * Ce qu'un journal technique a le droit de contenir.
 *
 * `console.error` finit chez Vercel, dans une console partagée, conservée. Le §47
 * interdit d'y écrire des données sensibles — et un journal est justement
 * l'endroit où elles s'écrivent par distraction, parce qu'on y jette « l'objet
 * entier pour voir ».
 *
 * Cette fonction est le format à utiliser dans TOUT appel à `console` de ce
 * module : jamais d'objet brut, jamais de numéro, jamais de référence complète.
 */
export function logSafe(input: {
  businessId?: string | null;
  intentId?:   string | null;
  receiptId?:  string | null;
  provider?:   string | null;
  amount?:     number | null;
  reason?:     string | null;
}): Record<string, unknown> {
  return {
    // Les identifiants techniques restent entiers : ce sont des UUID, ils ne
    // disent rien de personne, et sans eux un journal ne sert à rien.
    business:  input.businessId ?? null,
    intent:    input.intentId ?? null,
    receipt:   input.receiptId ?? null,
    provider:  input.provider ?? null,
    // Le montant est conservé : c'est la donnée qui permet de retrouver la
    // transaction, et elle ne désigne personne à elle seule.
    amount:    input.amount ?? null,
    reason:    input.reason ?? null,
  };
}
