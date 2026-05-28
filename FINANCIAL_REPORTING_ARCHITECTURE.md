# Financial Reporting Engine - ProfitPilot
## Architecture & Implementation Guide

---

## 📊 Vue d'ensemble

Le Financial Reporting Engine génère trois rapports comptables fondamentaux en temps réel:
1. **P&L (Compte de Résultat)** - Revenues vs Expenses
2. **Balance Sheet (Bilan)** - Assets vs Liabilities vs Equity
3. **Cash Flow Statement (État des Flux de Trésorerie)** - Cash movements

### ✨ Caractéristiques principales
- ✅ Support multi-devise (HTG ↔ USD avec conversion automatique)
- ✅ Memoization/Caching (5 min TTL par défaut)
- ✅ Mapping automatique transactions → comptes comptables
- ✅ Architecture en 3 couches: Chart of Accounts → Transactions → Reports

---

## 🏗️ Architecture en 3 couches

```
┌─────────────────────────────────────────────────────────┐
│  CLIENT LAYER (React Components)                        │
│  - RapportsPage, SettingsPage                           │
│  - Display P&L, Balance Sheet, Cash Flow reports        │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ↓
┌─────────────────────────────────────────────────────────┐
│  SERVER ACTION LAYER (Next.js Server Actions)           │
│  - app/actions/financialReporting.ts                    │
│  - Fetch business context, call reporting engine       │
│  - Return structured JSON for UI rendering             │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ↓
┌─────────────────────────────────────────────────────────┐
│  REPORTING ENGINE LAYER (lib/financialReporting.ts)     │
│  - generateProfitAndLoss(businessId, dates, currency)  │
│  - generateBalanceSheet(businessId, asOfDate, currency)│
│  - generateCashFlow(businessId, dates, currency)        │
│  - Cache management & multi-currency conversion        │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ↓
┌─────────────────────────────────────────────────────────┐
│  CHART OF ACCOUNTS LAYER (lib/chartOfAccounts.ts)       │
│  - CHART_OF_ACCOUNTS: 30+ comptes standardisés          │
│  - getTransactionPosting(): Transaction → Journal Entry │
│  - getAccountByCode(), getAccountsByType(), etc.        │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ↓
┌─────────────────────────────────────────────────────────┐
│  DATABASE LAYER (Supabase)                              │
│  - sales, purchases, expenses tables                    │
│  - Transactions = base de tous les rapports             │
└─────────────────────────────────────────────────────────┘
```

---

## 📚 Chart of Accounts (Plan Comptable)

### Codes de comptes standardisés

| Code | Compte | Type | Description |
|------|--------|------|-------------|
| **1000** | Cash - HTG | Asset | Caisse HTG |
| **1010** | Cash - USD | Asset | Caisse USD |
| **1020-1030** | Bank Accounts | Asset | Comptes bancaires |
| **1100** | Accounts Receivable | Asset | Clients à crédit |
| **1200** | Inventory | Asset | Stock de produits |
| **1500** | Equipment | Asset | Équipements |
| **2000** | Accounts Payable | Liability | Fournisseurs à payer |
| **2100** | Short-term Loans | Liability | Emprunts CT |
| **3000** | Owner's Capital | Equity | Capital initial |
| **3100** | Owner's Drawings | Equity | Retraits propriétaire |
| **4000** | Sales Revenue - HTG | Revenue | Ventes HTG |
| **4010** | Sales Revenue - USD | Revenue | Ventes USD |
| **4100** | Sales Refunds | Revenue | Remboursements (contra) |
| **5000** | COGS | Expense | Coût des produits vendus |
| **5500** | Salaries | Expense | Salaires |
| **5600** | Rent | Expense | Loyer |
| **5700** | Utilities | Expense | Services publics |
| **5800** | Marketing | Expense | Marketing & Pub |
| **5900** | Transport | Expense | Transport |
| **6000** | Office Supplies | Expense | Fournitures bureau |
| **6100** | Professional Services | Expense | Services professionnels |
| **6200** | Insurance | Expense | Assurances |
| **6300** | Maintenance | Expense | Maintenance & Réparations |
| **6400** | Other Operating Expenses | Expense | Autres dépenses |

### Principes de débit/crédit

```
ACTIFS           : Débit ↑ = Augmentation  | Crédit ↓ = Diminution
PASSIFS          : Crédit ↑ = Augmentation | Débit ↓ = Diminution
CAPITAUX PROPRES : Crédit ↑ = Augmentation | Débit ↓ = Diminution
REVENUS          : Crédit ↑ = Augmentation | Débit ↓ = Diminution
DÉPENSES         : Débit ↑ = Augmentation  | Crédit ↓ = Diminution
```

---

## 🔄 Mapping Transactions → Journal Entries

### Chaque type de transaction génère une paire DEBIT/CREDIT équilibrée:

#### 1️⃣ SALE (Vente produit)
```
Scénario: Vente de 100G en espèces
DEBIT:  1000 (Cash - HTG)      100
CREDIT: 4000 (Sales Revenue)   100
```

#### 2️⃣ PURCHASE (Achat de fournisseur)
```
Scénario: Achat de 50G à crédit
DEBIT:  1200 (Inventory)       50
CREDIT: 2000 (Payable)         50
```

#### 3️⃣ EXPENSE (Dépense opérationnelle)
```
Scénario: Paiement loyer 30G
DEBIT:  5600 (Rent)            30
CREDIT: 1000 (Cash)            30
```

#### 4️⃣ REFUND (Remboursement client)
```
Scénario: Remboursement 20G
DEBIT:  4100 (Sales Refunds)   20
CREDIT: 1000 (Cash)            20
```

---

## 📈 Rapports & Formules

### 1. Profit & Loss (Compte de Résultat)

```
Total Revenues
  = Sales Revenue (HTG + USD)
  - Sales Refunds
  + Other Income

Total Expenses
  = COGS + Salaries + Rent + Utilities + Marketing + Transport 
    + Office Supplies + Professional Services + Insurance 
    + Maintenance + Depreciation + Interest + Other

Profit Before Tax = Total Revenues - Total Expenses
Estimated Tax (30%) = Profit Before Tax × 30%
Net Profit = Profit Before Tax - Estimated Tax
```

### 2. Balance Sheet (Bilan)

```
ASSETS
  Liquid Assets (Cash HTG + USD + Bank Accounts)
  + Current Assets (Accounts Receivable + Inventory)
  + Fixed Assets (Equipment - Accumulated Depreciation)
  = TOTAL ASSETS

LIABILITIES
  Current Liabilities (Accounts Payable + Short-term Loans)
  + Long-term Liabilities
  = TOTAL LIABILITIES

EQUITY
  Owner's Capital
  - Owner's Drawings
  + Retained Earnings (cumulative profits)
  = TOTAL EQUITY

EQUATION: Assets = Liabilities + Equity
```

### 3. Cash Flow (État des Flux de Trésorerie)

```
OPERATING ACTIVITIES
  Net Income
  + Depreciation Adjustments
  - Increase in Receivables
  + Increase in Payables
  = Net Cash from Operations

INVESTING ACTIVITIES
  - Capital Expenditures
  - Equipment Purchases
  = Net Cash from Investing

FINANCING ACTIVITIES
  + Loan Proceeds
  - Loan Repayments
  - Owner Drawings
  = Net Cash from Financing

NET CHANGE IN CASH = Operating + Investing + Financing
ENDING CASH = Beginning Cash + Net Change
```

---

## 💾 Caching Strategy

### Cache Layer (lib/financialReporting.ts)

```typescript
// Cache structure
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // 5 minutes by default
}

// Cache key format
`${reportType}:${businessId}:${hash(params)}`

// Example keys
"P&L:business-uuid:abc123def456..."
"BalanceSheet:business-uuid:xyz789..."
"CashFlow:business-uuid:aabbccdd..."
```

### Invalidation Strategy

- ✅ **Automatic TTL**: Reports expire after 5 minutes
- ✅ **Manual Invalidation**: Call `invalidateFinancialCacheAction()` after:
  - New sale created
  - New expense recorded
  - Purchase completed
- ✅ **Selective Invalidation**: Only invalidate cache for affected business

---

## 🌍 Multi-Currency Support

### Exchange Rate Management

```typescript
// Fetch from businesses table
const exchangeRate = await getExchangeRate(businessId);

// Convert amounts between HTG and USD
function convertCurrency(
  amount: number,
  from: 'HTG' | 'USD',
  to: 'HTG' | 'USD',
  exchangeRate: number
): number {
  if (from === 'HTG' && to === 'USD') {
    return amount / exchangeRate;
  }
  if (from === 'USD' && to === 'HTG') {
    return amount * exchangeRate;
  }
  return amount;
}

// All transactions are stored with their original currency
// Reports convert to requested currency using stored exchange rate
```

### Report Currency Options
- `'HTG'` - All amounts in Haitian Gourde
- `'USD'` - All amounts in US Dollar
- `'BOTH'` - Show both currencies side-by-side (future enhancement)

---

## 🔌 Integration Points

### 1. Server Action Usage (from Client Components)

```typescript
// In a React component (rapports/page.tsx)
'use client';
import { getProfitAndLossAction } from '../actions/financialReporting';

const [pnlReport, setPnlReport] = useState<ProfitAndLossReport | null>(null);

// Call the server action
const report = await getProfitAndLossAction(
  '2025-01-01',
  '2025-12-31',
  'HTG'
);
setPnlReport(report);
```

### 2. Data Display (Recharts + Tables)

```typescript
// P&L data formatted for Recharts BarChart
const chartData = [
  { name: 'Revenues', value: pnlReport.revenues.totalRevenue },
  { name: 'Expenses', value: pnlReport.expenses.totalExpenses },
  { name: 'Net Profit', value: pnlReport.netProfit },
];

// Balance Sheet data for table
<table>
  <tr>
    <td>Total Assets</td>
    <td>{balanceSheet.assets.totalAssets}</td>
  </tr>
  {/* ... */}
</table>
```

### 3. Cache Invalidation (after transactions)

```typescript
// In createSaleAction, after inserting sale
await invalidateFinancialCacheAction();

// This triggers cache clear for the user's business
// Next report generation will fetch fresh data
```

---

## 🚀 Performance Considerations

### Query Optimization
- ✅ Indexed lookups by `business_id` and `created_at`
- ✅ Aggregation at DB level (sum(), group by) where possible
- ✅ Selective field selection (only needed columns)

### Memory Management
- ✅ Cache limited to 5-minute TTL
- ✅ Selective cache invalidation per business
- ✅ No infinite cache growth

### Database Efficiency
- ✅ Single query per transaction type per period
- ✅ Avoid N+1 queries using `select()` projections
- ✅ Batch calculations after data retrieval

---

## 📝 Usage Examples

### Example 1: Generate Monthly P&L

```typescript
const report = await generateProfitAndLoss(
  businessId,
  '2025-01-01',
  '2025-01-31',
  'HTG'
);

console.log(report);
// {
//   period: { start: '2025-01-01', end: '2025-01-31' },
//   currency: 'HTG',
//   revenues: { salesRevenue: 500000, totalRevenue: 500000, ... },
//   expenses: { ... },
//   netProfit: 150000,
// }
```

### Example 2: Generate Balance Sheet as of Today

```typescript
const today = new Date().toISOString().split('T')[0];
const balanceSheet = await generateBalanceSheet(
  businessId,
  today,
  'USD'
);

console.log(balanceSheet.assets.totalAssets);
// 250000 (in USD)
```

### Example 3: Multi-Currency Reporting

```typescript
// Generate same report in both currencies
const pnlHTG = await generateProfitAndLoss(businessId, start, end, 'HTG');
const pnlUSD = await generateProfitAndLoss(businessId, start, end, 'USD');

// For analytics
const usdEquiv = pnlHTG.netProfit / exchangeRate;
// Verify conversion accuracy
console.assert(
  Math.abs(usdEquiv - pnlUSD.netProfit) < 1,
  'Currency conversion mismatch'
);
```

---

## 🔍 Testing the Engine

### Test Data Setup
1. Create a business
2. Create test products with various prices (HTG/USD)
3. Create test sales, purchases, expenses across multiple dates
4. Call reporting functions and verify calculations

### Validation Checklist
- ✅ Balance sheet: Assets = Liabilities + Equity
- ✅ P&L: netProfit = (totalRevenue - totalExpenses) × (1 - tax_rate)
- ✅ Cash flow: netChangeInCash = Operating + Investing + Financing
- ✅ Multi-currency: Currency conversions are symmetric
- ✅ Cache: Same query within 5 min returns cached result
- ✅ Date filtering: Reports respect date boundaries

---

## 📌 Next Steps

1. **Display Integration**: Update `app/rapports/page.tsx` to use new reporting engine
2. **Enhance Dashboard**: Show P&L summary on dashboard
3. **Export Features**: Add PDF/Excel export using report data
4. **Real-time Updates**: Add WebSocket updates when transactions are created
5. **Advanced Filtering**: Support filtering by category, department, cost center
6. **Budget Comparison**: Compare actual vs budgeted expenses
7. **Forecasting**: Project future cash flow based on trends

---

**Architecture Designed**: May 20, 2026  
**Built for**: ProfitPilot - Haitian SME Financial Management Platform  
**Tech Stack**: Next.js, TypeScript, Supabase, Recharts
