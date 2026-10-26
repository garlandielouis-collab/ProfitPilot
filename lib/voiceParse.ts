// ─────────────────────────────────────────────────────────────────────────────
// « Pale ak kaye a » — comprendre une phrase dite au comptoir (F02)
//
// « M vann 2 kola 150 goud » → une vente de 150 gourdes, deux kola.
// « M depanse 500 goud transpò » → une dépense de transport.
// « Jean pran 1000 goud kredi » → un crédit au nom de Jean.
//
// L'application PROPOSE, le marchand confirme d'un tap (§11.1, règle 3) : rien
// de ce qui est compris ici n'est enregistré sans passer par la feuille de
// saisie, montant visible. Ce module est pur : le schéma, les consignes, et un
// lecteur de secours sans IA pour le montant.
// ─────────────────────────────────────────────────────────────────────────────

export type VoiceKind = 'sale' | 'expense' | 'credit' | 'unknown';
export type VoiceUnit = 'HTG' | 'DOLA' | 'USD';

export type VoiceIntent = {
  kind: VoiceKind;
  /** 0 = pas de montant entendu. */
  amount: number;
  unit: VoiceUnit;
  quantity: number;
  /** Le produit ou le service nommé, tel qu'il a été dit. */
  item: string;
  /** Le client nommé (pour un crédit). */
  customer: string;
  /** La catégorie de dépense (valeurs de components/expenses/QuickExpenseForm). */
  category: string;
  /** Faux si la phrase ne parle ni d'une vente, ni d'une dépense, ni d'un crédit. */
  understood: boolean;
};

export const EXPENSE_CATEGORY_VALUES = [
  'Stock', 'Transport', 'Électricité', 'Téléphone', 'Loyer', 'Salaire', 'Fournitures', 'Autre', 'Retrait personnel',
] as const;

/** Le schéma de sortie structurée — strict, sans champ facultatif. */
export const VOICE_INTENT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'amount', 'unit', 'quantity', 'item', 'customer', 'category', 'understood'],
  properties: {
    kind:       { type: 'string', enum: ['sale', 'expense', 'credit', 'unknown'] },
    amount:     { type: 'number', description: 'Montant total dit, 0 si aucun.' },
    unit:       { type: 'string', enum: ['HTG', 'DOLA', 'USD'] },
    quantity:   { type: 'integer', description: 'Quantité dite, 1 par défaut.' },
    item:       { type: 'string', description: 'Produit ou service nommé, vide si aucun.' },
    customer:   { type: 'string', description: 'Nom du client, vide si aucun.' },
    category:   { type: 'string', enum: [...EXPENSE_CATEGORY_VALUES, ''] },
    understood: { type: 'boolean' },
  },
};

export const VOICE_SYSTEM_PROMPT = `Tu lis une phrase dite par un marchand ou un prestataire haïtien à son téléphone, transcrite en texte. Elle est presque toujours en kreyòl, parfois en français, souvent avec des fautes de transcription.

Tu en tires UNE opération :
- sale : il a vendu ou fait un service et a été payé (« m vann », « m fè », « yon kliyan achte », « m koupe 2 tèt »).
- expense : il a dépensé (« m depanse », « m achte machandiz », « m peye transpò », « m pran pou lakay »).
- credit : un client lui doit, il a vendu à crédit (« kredi », « li dwe m », « l ap peye pita »).
- unknown : la phrase ne décrit aucune de ces opérations.

Le montant est le total dit, en nombre. Unités : « goud » ou rien = HTG ; « dola » seul, en Haïti, veut dire dola ayisyen (5 gourdes) = DOLA ; « dola ameriken », « dola US », « $ » = USD. Ne convertis rien : rends le nombre dit et son unité.

Pour une dépense, choisis la catégorie : Stock (marchandise, réassort), Transport, Électricité (kouran, EDH), Téléphone (kat, rechaj), Loyer (lwaye), Salaire (peye èd, peye anplwaye), Fournitures (pwodui pou travay), Retrait personnel (pou lakay, pou kay la, lekòl timoun), sinon Autre. Pour une vente ou un crédit, la catégorie est vide.

N'invente rien : un champ qui n'a pas été dit reste vide (texte) ou 0 (montant), la quantité vaut 1 par défaut. Si tu n'es pas sûr de l'opération, understood = false.`;

// ── Le lecteur de secours ────────────────────────────────────────────────────
//
// Sans IA (clé absente, réseau lent), on lit au moins le montant et le genre :
// le marchand n'aura qu'à choisir la catégorie.

const SALE_WORDS    = /\b(vann|vant|fè|koupe|sèvis|kliyan peye)\b/i;
const EXPENSE_WORDS = /\b(depanse|depans|achte|peye|lakay|transp[oò])\b/i;
const CREDIT_WORDS  = /\b(kredi|dwe|pita)\b/i;

export function parseSpokenFallback(text: string): VoiceIntent {
  const clean = text.toLowerCase().replace(/(\d)[\s  .](?=\d{3}\b)/g, '$1');
  const numbers = [...clean.matchAll(/\d+(?:[.,]\d+)?/g)].map((m) => Number(m[0].replace(',', '.')));
  // La quantité vient avant le produit (« 2 kola »), le montant après : le plus
  // grand nombre dit est presque toujours le montant.
  const amount = numbers.length > 0 ? Math.max(...numbers) : 0;
  const quantity = numbers.length > 1 && Number.isInteger(numbers[0]) && numbers[0] < amount ? numbers[0] : 1;

  const unit: VoiceUnit = /dola\s*(ameriken|us)|\$|usd/i.test(clean) ? 'USD'
    : /\bdola\b/i.test(clean) ? 'DOLA'
    : 'HTG';

  const kind: VoiceKind = CREDIT_WORDS.test(clean) ? 'credit'
    : EXPENSE_WORDS.test(clean) ? 'expense'
    : SALE_WORDS.test(clean) ? 'sale'
    : 'unknown';

  const category = kind !== 'expense' ? ''
    : /lakay|kay la|lekòl/i.test(clean) ? 'Retrait personnel'
    : /transp[oò]|taksi|moto/i.test(clean) ? 'Transport'
    : /kouran|edh|limyè/i.test(clean) ? 'Électricité'
    : /machandiz|stòk|stock/i.test(clean) ? 'Stock'
    : /kat|rechaj|telefòn/i.test(clean) ? 'Téléphone'
    : /lwaye/i.test(clean) ? 'Loyer'
    : 'Autre';

  return {
    kind,
    amount,
    unit,
    quantity,
    item: '',
    customer: '',
    category,
    understood: kind !== 'unknown' && amount > 0,
  };
}

/** Garde une réponse de Claude dans les bornes, quoi qu'elle contienne. */
export function sanitizeIntent(raw: Partial<VoiceIntent> | null, transcript: string): VoiceIntent {
  if (!raw) return parseSpokenFallback(transcript);
  const kinds: VoiceKind[] = ['sale', 'expense', 'credit', 'unknown'];
  const units: VoiceUnit[] = ['HTG', 'DOLA', 'USD'];
  const amount = Number(raw.amount);
  const quantity = Number(raw.quantity);
  const category = String(raw.category ?? '');
  return {
    kind:       kinds.includes(raw.kind as VoiceKind) ? (raw.kind as VoiceKind) : 'unknown',
    amount:     Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : 0,
    unit:       units.includes(raw.unit as VoiceUnit) ? (raw.unit as VoiceUnit) : 'HTG',
    quantity:   Number.isInteger(quantity) && quantity > 0 && quantity < 10_000 ? quantity : 1,
    item:       String(raw.item ?? '').trim().slice(0, 80),
    customer:   String(raw.customer ?? '').trim().slice(0, 80),
    category:   (EXPENSE_CATEGORY_VALUES as readonly string[]).includes(category) ? category : '',
    understood: raw.understood === true,
  };
}
