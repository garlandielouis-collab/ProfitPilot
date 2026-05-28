/**
 * Chart of Accounts pour ProfitPilot
 * Adapté pour entreprises haïtiennes (HTG/USD multi-currency)
 * Structure simplifiée mais complète pour PMEs
 */

export type AccountType = 
  | 'ASSET' 
  | 'LIABILITY' 
  | 'EQUITY' 
  | 'REVENUE' 
  | 'EXPENSE' 
  | 'COST_OF_GOODS_SOLD';

export type TransactionType = 'Sale' | 'Purchase' | 'Expense' | 'Refund' | 'Payment';

export interface ChartAccount {
  code: string;
  name: string;
  type: AccountType;
  description: string;
  normal_balance: 'DEBIT' | 'CREDIT';
  category: string;
}

/**
 * Plan comptable standard (simplifié)
 * Codes: XXXX format où:
 * - 1XXX = Assets
 * - 2XXX = Liabilities
 * - 3XXX = Equity
 * - 4XXX = Revenue
 * - 5XXX = Expenses/COGS
 */
export const CHART_OF_ACCOUNTS: Record<string, ChartAccount> = {
  // ===== ASSETS (Actifs) =====
  '1000': {
    code: '1000',
    name: 'Cash - HTG',
    type: 'ASSET',
    description: 'Caisse en Gourde haïtienne',
    normal_balance: 'DEBIT',
    category: 'Liquid Assets',
  },
  '1010': {
    code: '1010',
    name: 'Cash - USD',
    type: 'ASSET',
    description: 'Caisse en Dollar américain',
    normal_balance: 'DEBIT',
    category: 'Liquid Assets',
  },
  '1020': {
    code: '1020',
    name: 'Bank Accounts - HTG',
    type: 'ASSET',
    description: 'Comptes bancaires en HTG',
    normal_balance: 'DEBIT',
    category: 'Liquid Assets',
  },
  '1030': {
    code: '1030',
    name: 'Bank Accounts - USD',
    type: 'ASSET',
    description: 'Comptes bancaires en USD',
    normal_balance: 'DEBIT',
    category: 'Liquid Assets',
  },
  '1100': {
    code: '1100',
    name: 'Accounts Receivable',
    type: 'ASSET',
    description: 'Clients à crédit',
    normal_balance: 'DEBIT',
    category: 'Current Assets',
  },
  '1200': {
    code: '1200',
    name: 'Inventory',
    type: 'ASSET',
    description: 'Stock de produits',
    normal_balance: 'DEBIT',
    category: 'Current Assets',
  },
  '1500': {
    code: '1500',
    name: 'Equipment',
    type: 'ASSET',
    description: 'Équipements et mobiliers',
    normal_balance: 'DEBIT',
    category: 'Fixed Assets',
  },
  '1510': {
    code: '1510',
    name: 'Accumulated Depreciation',
    type: 'ASSET',
    description: 'Amortissements cumulés',
    normal_balance: 'CREDIT',
    category: 'Fixed Assets',
  },

  // ===== LIABILITIES (Passifs) =====
  '2000': {
    code: '2000',
    name: 'Accounts Payable',
    type: 'LIABILITY',
    description: 'Fournisseurs à payer',
    normal_balance: 'CREDIT',
    category: 'Current Liabilities',
  },
  '2100': {
    code: '2100',
    name: 'Short-term Loans',
    type: 'LIABILITY',
    description: 'Emprunts à court terme',
    normal_balance: 'CREDIT',
    category: 'Current Liabilities',
  },
  '2200': {
    code: '2200',
    name: 'Taxes Payable',
    type: 'LIABILITY',
    description: 'Impôts à payer',
    normal_balance: 'CREDIT',
    category: 'Current Liabilities',
  },

  // ===== EQUITY (Capitaux propres) =====
  '3000': {
    code: '3000',
    name: "Owner's Capital",
    type: 'EQUITY',
    description: 'Capital du propriétaire',
    normal_balance: 'CREDIT',
    category: 'Equity',
  },
  '3100': {
    code: '3100',
    name: "Owner's Drawings",
    type: 'EQUITY',
    description: 'Retraits du propriétaire',
    normal_balance: 'DEBIT',
    category: 'Equity',
  },
  '3200': {
    code: '3200',
    name: 'Retained Earnings',
    type: 'EQUITY',
    description: 'Résultats accumulés',
    normal_balance: 'CREDIT',
    category: 'Equity',
  },

  // ===== REVENUE (Revenus) =====
  '4000': {
    code: '4000',
    name: 'Sales Revenue - HTG',
    type: 'REVENUE',
    description: 'Ventes en HTG',
    normal_balance: 'CREDIT',
    category: 'Operating Revenue',
  },
  '4010': {
    code: '4010',
    name: 'Sales Revenue - USD',
    type: 'REVENUE',
    description: 'Ventes en USD',
    normal_balance: 'CREDIT',
    category: 'Operating Revenue',
  },
  '4100': {
    code: '4100',
    name: 'Sales Refunds',
    type: 'REVENUE',
    description: 'Remboursements clients (contre-compte)',
    normal_balance: 'DEBIT',
    category: 'Operating Revenue',
  },
  '4200': {
    code: '4200',
    name: 'Other Income',
    type: 'REVENUE',
    description: 'Autres revenus',
    normal_balance: 'CREDIT',
    category: 'Non-Operating Revenue',
  },

  // ===== COST OF GOODS SOLD (COGS) =====
  '5000': {
    code: '5000',
    name: 'Cost of Goods Sold',
    type: 'COST_OF_GOODS_SOLD',
    description: 'Coût des biens vendus',
    normal_balance: 'DEBIT',
    category: 'COGS',
  },
  '5100': {
    code: '5100',
    name: 'Purchase Returns',
    type: 'COST_OF_GOODS_SOLD',
    description: 'Retours fournisseurs (contre-compte)',
    normal_balance: 'CREDIT',
    category: 'COGS',
  },

  // ===== OPERATING EXPENSES (Dépenses d'exploitation) =====
  '5500': {
    code: '5500',
    name: 'Salary Expenses',
    type: 'EXPENSE',
    description: 'Salaires et rémunérations',
    normal_balance: 'DEBIT',
    category: 'Personnel Expenses',
  },
  '5600': {
    code: '5600',
    name: 'Rent Expenses',
    type: 'EXPENSE',
    description: 'Loyer local commercial',
    normal_balance: 'DEBIT',
    category: 'Occupancy Expenses',
  },
  '5700': {
    code: '5700',
    name: 'Utilities',
    type: 'EXPENSE',
    description: 'Électricité, eau, internet',
    normal_balance: 'DEBIT',
    category: 'Utilities',
  },
  '5800': {
    code: '5800',
    name: 'Marketing & Advertising',
    type: 'EXPENSE',
    description: 'Marketing et publicité',
    normal_balance: 'DEBIT',
    category: 'Marketing',
  },
  '5900': {
    code: '5900',
    name: 'Transportation',
    type: 'EXPENSE',
    description: 'Transport et livraison',
    normal_balance: 'DEBIT',
    category: 'Logistics',
  },
  '6000': {
    code: '6000',
    name: 'Office Supplies',
    type: 'EXPENSE',
    description: 'Fournitures de bureau',
    normal_balance: 'DEBIT',
    category: 'Office Expenses',
  },
  '6100': {
    code: '6100',
    name: 'Professional Services',
    type: 'EXPENSE',
    description: 'Services professionnels (comptable, avocat)',
    normal_balance: 'DEBIT',
    category: 'Professional',
  },
  '6200': {
    code: '6200',
    name: 'Insurance',
    type: 'EXPENSE',
    description: 'Assurances',
    normal_balance: 'DEBIT',
    category: 'Insurance',
  },
  '6300': {
    code: '6300',
    name: 'Maintenance & Repairs',
    type: 'EXPENSE',
    description: 'Maintenance et réparations',
    normal_balance: 'DEBIT',
    category: 'Maintenance',
  },
  '6400': {
    code: '6400',
    name: 'Other Operating Expenses',
    type: 'EXPENSE',
    description: 'Autres dépenses d\'exploitation',
    normal_balance: 'DEBIT',
    category: 'Other',
  },
  '6500': {
    code: '6500',
    name: 'Depreciation Expense',
    type: 'EXPENSE',
    description: 'Amortissements',
    normal_balance: 'DEBIT',
    category: 'Depreciation',
  },
  '6600': {
    code: '6600',
    name: 'Interest Expense',
    type: 'EXPENSE',
    description: 'Intérêts sur emprunts',
    normal_balance: 'DEBIT',
    category: 'Financial',
  },
};

/**
 * Mappeur de types de transactions vers comptes comptables
 * Chaque transaction type déclenche une entrée DEBIT et CREDIT
 */
export interface JournalEntry {
  account_code: string;
  account_name: string;
  debit: number;
  credit: number;
  currency: 'HTG' | 'USD';
}

export interface TransactionPosting {
  entries: JournalEntry[];
  description: string;
  transaction_type: TransactionType;
}

/**
 * Fonction pour générer les écritures comptables (journal) selon le type de transaction
 * Principes de base:
 * - Sales: DEBIT Cash/Bank, CREDIT Sales Revenue
 * - Purchases: DEBIT Inventory, CREDIT Accounts Payable (ou Cash si paiement immédiat)
 * - Expenses: DEBIT Expense, CREDIT Cash/Bank
 */
export function getTransactionPosting(
  transactionType: TransactionType,
  amount: number,
  currency: 'HTG' | 'USD',
  paymentMethod?: string,
  expenseCategory?: string
): TransactionPosting {
  const cashAccount = currency === 'HTG' ? '1000' : '1010';
  const revenueAccount = currency === 'HTG' ? '4000' : '4010';
  const inventoryAccount = '1200';
  const payableAccount = '2000';

  // Déterminer le compte de dépense selon la catégorie
  let expenseAccount = '6400'; // Par défaut: Other Operating Expenses
  if (expenseCategory) {
    const categoryMap: Record<string, string> = {
      'Salary': '5500',
      'Rent': '5600',
      'Utilities': '5700',
      'Marketing': '5800',
      'Transport': '5900',
      'Office': '6000',
      'Professional': '6100',
      'Insurance': '6200',
      'Maintenance': '6300',
      'Depreciation': '6500',
      'Interest': '6600',
      'COGS': '5000',
    };
    expenseAccount = categoryMap[expenseCategory] || '6400';
  }

  const entries: JournalEntry[] = [];

  switch (transactionType) {
    case 'Sale':
      // DEBIT Cash/Bank, CREDIT Sales Revenue
      entries.push({
        account_code: cashAccount,
        account_name: CHART_OF_ACCOUNTS[cashAccount]?.name || 'Cash',
        debit: amount,
        credit: 0,
        currency,
      });
      entries.push({
        account_code: revenueAccount,
        account_name: CHART_OF_ACCOUNTS[revenueAccount]?.name || 'Sales Revenue',
        debit: 0,
        credit: amount,
        currency,
      });
      return {
        entries,
        description: `Vente en ${currency}`,
        transaction_type: transactionType,
      };

    case 'Refund':
      // DEBIT Sales Refunds (contra-revenue), CREDIT Cash
      entries.push({
        account_code: '4100',
        account_name: CHART_OF_ACCOUNTS['4100'].name,
        debit: amount,
        credit: 0,
        currency,
      });
      entries.push({
        account_code: cashAccount,
        account_name: CHART_OF_ACCOUNTS[cashAccount]?.name || 'Cash',
        debit: 0,
        credit: amount,
        currency,
      });
      return {
        entries,
        description: `Remboursement client en ${currency}`,
        transaction_type: transactionType,
      };

    case 'Purchase':
      // DEBIT Inventory, CREDIT Accounts Payable (ou Cash si paiement immédiat)
      entries.push({
        account_code: inventoryAccount,
        account_name: CHART_OF_ACCOUNTS[inventoryAccount].name,
        debit: amount,
        credit: 0,
        currency,
      });
      const creditAccount = paymentMethod === 'Payé' ? cashAccount : payableAccount;
      const creditAccountName = 
        paymentMethod === 'Payé' 
          ? CHART_OF_ACCOUNTS[cashAccount]?.name 
          : CHART_OF_ACCOUNTS[payableAccount].name;
      
      entries.push({
        account_code: creditAccount,
        account_name: creditAccountName,
        debit: 0,
        credit: amount,
        currency,
      });
      return {
        entries,
        description: `Achat d'inventaire en ${currency}`,
        transaction_type: transactionType,
      };

    case 'Expense':
      // DEBIT Expense Account, CREDIT Cash
      entries.push({
        account_code: expenseAccount,
        account_name: CHART_OF_ACCOUNTS[expenseAccount]?.name || 'Other Operating Expenses',
        debit: amount,
        credit: 0,
        currency,
      });
      entries.push({
        account_code: cashAccount,
        account_name: CHART_OF_ACCOUNTS[cashAccount]?.name || 'Cash',
        debit: 0,
        credit: amount,
        currency,
      });
      return {
        entries,
        description: `Dépense: ${expenseCategory || 'Autre'} en ${currency}`,
        transaction_type: transactionType,
      };

    case 'Payment':
      // DEBIT Accounts Payable, CREDIT Cash
      entries.push({
        account_code: payableAccount,
        account_name: CHART_OF_ACCOUNTS[payableAccount].name,
        debit: amount,
        credit: 0,
        currency,
      });
      entries.push({
        account_code: cashAccount,
        account_name: CHART_OF_ACCOUNTS[cashAccount]?.name || 'Cash',
        debit: 0,
        credit: amount,
        currency,
      });
      return {
        entries,
        description: `Paiement fournisseur en ${currency}`,
        transaction_type: transactionType,
      };

    default:
      throw new Error(`Transaction type non reconnue: ${transactionType}`);
  }
}

/**
 * Fonction utilitaire pour récupérer un compte par code
 */
export function getAccountByCode(code: string): ChartAccount | null {
  return CHART_OF_ACCOUNTS[code] || null;
}

/**
 * Fonction utilitaire pour récupérer tous les comptes d'un type donné
 */
export function getAccountsByType(type: AccountType): ChartAccount[] {
  return Object.values(CHART_OF_ACCOUNTS).filter((account) => account.type === type);
}

/**
 * Fonction pour générer un rapport de vérification (Trial Balance)
 */
export function generateTrialBalance(
  postings: Map<string, { debit: number; credit: number }>
): Array<{ account_code: string; account_name: string; debit: number; credit: number }> {
  const result: Array<{ account_code: string; account_name: string; debit: number; credit: number }> = [];

  postings.forEach((balance, accountCode) => {
    const account = getAccountByCode(accountCode);
    if (account) {
      result.push({
        account_code: accountCode,
        account_name: account.name,
        debit: balance.debit,
        credit: balance.credit,
      });
    }
  });

  return result.sort((a, b) => a.account_code.localeCompare(b.account_code));
}
