export type AccountCode =
  | '1110'
  | '1120'
  | '1130'
  | '1140'
  | '1150'
  | '1210'
  | '2110'
  | '2120'
  | '2130'
  | '2200'
  | '3100'
  | '3200'
  | '4100'
  | '4200'
  | '4900'
  | '5100'
  | '5200'
  | '5300'
  | '5400'
  | '5500'
  | '5600'
  | '5700'
  | '5800'
  | '5900';

export type JournalEntryLine = {
  account_code: string;
  description: string;
  debit: number;
  credit: number;
};

export type JournalSuggestion = {
  description: string;
  category: string;
  suggestion: string;
  currency: 'HTG' | 'USD';
  lines: JournalEntryLine[];
};

export const ACCOUNT_CODES = {
  CAISSE:           '1110',
  BANQUE:           '1120',
  CLIENTS:          '1130',
  STOCK:            '1140',
  FOURNITURES_ACT:  '1150',
  EQUIPEMENTS:      '1210',
  FOURNISSEURS:     '2110',
  SALAIRES_PASSIF:  '2120',
  TAXES_PASSIF:     '2130',
  EMPRUNTS:         '2200',
  CAPITAL:          '3100',
  RETAINED:         '3200',
  VENTES:           '4100',
  SERVICES:         '4200',
  REVENUS_DIVERS:   '4900',
  ACHATS:           '5100',
  SALAIRES:         '5200',
  LOYER:            '5300',
  FOURNITURES_CH:   '5400',
  MARKETING:        '5500',
  INTERNET:         '5600',
  TRANSPORT:        '5700',
  INTERETS:         '5800',
  CHARGES_DIVERSES: '5900',
} as const;

export function classifyExpenseCategory(category: string): AccountCode {
  const c = category.toLowerCase();
  if (c.includes('salaire') || c.includes('salary') || c.includes('salè'))
    return ACCOUNT_CODES.SALAIRES;
  if (c.includes('loyer') || c.includes('rent') || c.includes('lwaye'))
    return ACCOUNT_CODES.LOYER;
  if (c.includes('fourniture') || c.includes('bureau') || c.includes('founitì'))
    return ACCOUNT_CODES.FOURNITURES_CH;
  if (c.includes('marketing') || c.includes('publicité') || c.includes('pub') || c.includes('makèting'))
    return ACCOUNT_CODES.MARKETING;
  if (c.includes('internet') || c.includes('téléphone') || c.includes('mobile') || c.includes('entènèt'))
    return ACCOUNT_CODES.INTERNET;
  if (c.includes('transport') || c.includes('livraison') || c.includes('transpò'))
    return ACCOUNT_CODES.TRANSPORT;
  if (c.includes('intérêt') || c.includes('enterè') || c.includes('intérêts'))
    return ACCOUNT_CODES.INTERETS;
  if (c.includes('stock') || c.includes('acha') || c.includes('achat') || c.includes('marchandise'))
    return ACCOUNT_CODES.ACHATS;
  if (c.includes('équipement') || c.includes('matériel') || c.includes('ekipman'))
    return ACCOUNT_CODES.EQUIPEMENTS;
  return ACCOUNT_CODES.CHARGES_DIVERSES;
}

export async function classifyFromText(text: string): Promise<{
  debitCode: AccountCode;
  creditCode: AccountCode;
  category: string;
  suggestion: string;
}> {
  const t = text.toLowerCase();

  if (t.includes('vente') && (t.includes('cash') || t.includes('espèces') || t.includes('comptant')))
    return { debitCode: ACCOUNT_CODES.CAISSE, creditCode: ACCOUNT_CODES.VENTES, category: 'Ventes', suggestion: 'Débit Caisse / Crédit Ventes' };
  if (t.includes('vente') && (t.includes('crédit') || t.includes('client')))
    return { debitCode: ACCOUNT_CODES.CLIENTS, creditCode: ACCOUNT_CODES.VENTES, category: 'Ventes crédit', suggestion: 'Débit Clients / Crédit Ventes' };
  if (t.includes('vente') || t.includes('vann'))
    return { debitCode: ACCOUNT_CODES.CAISSE, creditCode: ACCOUNT_CODES.VENTES, category: 'Ventes', suggestion: 'Débit Caisse / Crédit Ventes' };
  if (t.includes('fournisseur') || t.includes('founisè'))
    return { debitCode: ACCOUNT_CODES.ACHATS, creditCode: ACCOUNT_CODES.FOURNISSEURS, category: 'Achats', suggestion: 'Débit Achats / Crédit Fournisseurs' };
  if (t.includes('paiement') && t.includes('fournisseur'))
    return { debitCode: ACCOUNT_CODES.FOURNISSEURS, creditCode: ACCOUNT_CODES.BANQUE, category: 'Paiement fournisseur', suggestion: 'Débit Fournisseurs / Crédit Banque' };
  if (t.includes('salaire') || t.includes('salè'))
    return { debitCode: ACCOUNT_CODES.SALAIRES, creditCode: ACCOUNT_CODES.BANQUE, category: 'Salaires', suggestion: 'Débit Salaires / Crédit Banque' };
  if (t.includes('loyer') || t.includes('lwaye'))
    return { debitCode: ACCOUNT_CODES.LOYER, creditCode: ACCOUNT_CODES.CAISSE, category: 'Loyer', suggestion: 'Débit Loyer / Crédit Caisse' };
  if (t.includes('fourniture') || t.includes('bureau'))
    return { debitCode: ACCOUNT_CODES.FOURNITURES_CH, creditCode: ACCOUNT_CODES.CAISSE, category: 'Fournitures', suggestion: 'Débit Fournitures / Crédit Caisse' };
  if (t.includes('emprunt') || t.includes('prêt') || t.includes('prè'))
    return { debitCode: ACCOUNT_CODES.BANQUE, creditCode: ACCOUNT_CODES.EMPRUNTS, category: 'Emprunt bancaire', suggestion: 'Débit Banque / Crédit Emprunts' };
  if (t.includes('remboursement') || t.includes('ranbousman'))
    return { debitCode: ACCOUNT_CODES.EMPRUNTS, creditCode: ACCOUNT_CODES.BANQUE, category: 'Remboursement', suggestion: 'Débit Emprunts / Crédit Banque' };
  if (t.includes('équipement') || t.includes('matériel') || t.includes('machine'))
    return { debitCode: ACCOUNT_CODES.EQUIPEMENTS, creditCode: ACCOUNT_CODES.CAISSE, category: 'Immobilisation', suggestion: 'Débit Équipements / Crédit Caisse' };
  if (t.includes('capital') || t.includes('dépôt propriétaire'))
    return { debitCode: ACCOUNT_CODES.CAISSE, creditCode: ACCOUNT_CODES.CAPITAL, category: 'Capital', suggestion: 'Débit Caisse / Crédit Capital' };

  return { debitCode: ACCOUNT_CODES.CHARGES_DIVERSES, creditCode: ACCOUNT_CODES.CAISSE, category: 'Charge diverse', suggestion: 'Débit Charges diverses / Crédit Caisse' };
}

export async function suggestJournalEntryFromText(text: string, amount: number, currency: 'HTG' | 'USD' = 'HTG'): Promise<JournalSuggestion> {
  const classification = await classifyFromText(text);
  const lines: JournalEntryLine[] = [
    { account_code: classification.debitCode, description: `${classification.category} — ${text}`, debit: amount, credit: 0 },
    { account_code: classification.creditCode, description: `${classification.category} — ${text}`, debit: 0, credit: amount },
  ];

  return {
    description: text,
    category: classification.category,
    suggestion: classification.suggestion,
    currency,
    lines,
  };
}

export function isBankPaymentMethod(method?: string) {
  if (!method) return false;
  const normalized = method.toLowerCase();
  return ['moncash', 'natcash', 'card', 'virement', 'transfer', 'bank'].some((term) => normalized.includes(term));
}
