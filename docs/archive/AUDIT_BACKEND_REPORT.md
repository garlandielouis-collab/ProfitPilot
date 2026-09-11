# 🔍 Rapò Odit Backend ProfitPilot
**Dat:** 26 Mai 2026  
**Anviwonnman:** Supabase + Next.js 14 (App Router)  
**Fichye analize:** `supabase/schema.sql`, `supabase/migrations/*`, `lib/financialReporting.ts`, `app/actions/*`

---

## 📊 Rezime Egzekitif

| Domèn | Eta | Priyorite |
|---|---|---|
| Foreign Keys (FK) | ⚠️ Pasyèlman bon | Mwayen |
| Sekirite RLS | ⚠️ Duplikat + mankan | Wo |
| Indexes | ❌ Grav — prèske pa gen | Kritik |
| Kalkil Pwofi | ❌ Tout nan JavaScript | Kritik |
| Bugs Lojik | ❌ 4 bugs enpòtan | Kritik |

---

## 1️⃣ FOREIGN KEYS (Relasyon ant tab yo)

### ✅ FK ki bon yo
| Tab | Kolòn | Referans | Konpòtman |
|---|---|---|---|
| `sales` | `product_id` | `products(id)` | RESTRICT ✅ |
| `sales` | `client_id` | `clients(id)` | SET NULL ✅ |
| `purchases` | `supplier_id` | `suppliers(id)` | RESTRICT ✅ |
| `purchases` | `product_id` | `products(id)` | RESTRICT ✅ |
| `client_credits` | `sale_id` | `sales(id)` | SET NULL ✅ |
| `client_credits` | `client_id` | `clients(id)` | SET NULL ✅ |
| `expenses` | `supplier_id` | `suppliers(id)` | SET NULL ✅ |
| `employees` | `business_id` | `businesses(id)` | CASCADE ✅ |

### ⚠️ FK ak Pwoblèm

#### 1. Tab `clients` pa gen `business_id`
```sql
-- Tab AKTYÈL: manke business_id
CREATE TABLE clients (
  id UUID, owner_id UUID, name TEXT, phone TEXT, email TEXT, total_credit NUMERIC, created_at TIMESTAMPTZ
);
-- PWOBLÈM: Pa kapab filtre kliyan pa business nan yon kont multi-tenant
```
**Enpak:** Si yon user gen plizyè business, kliyan yo ap melanje. Filtre pa `owner_id` sèlman se pa ase.

#### 2. Tab `client_credits` pa gen `business_id`
Menm pwoblèm ke `clients`. Tout kreyans yo rantre ansanm san distinction pa business.

#### 3. Tab `customer_transactions` pa gen `business_id`
Istwa tranzaksyon kliyan yo pa asoye ak yon business espesifik.

#### 4. Pa gen yon tab `debts` dedye
Dèt yo divize ant 2 kote:
- **Dèt founisè** → `purchases` (filtre `payment_status = 'À Crédit'`)
- **Dèt kliyan** → `client_credits` (filtre `payment_status = 'À Crédit'`)

Sa a fonksyonèl, men pa gen yon vue SQL ki regroupe yo tout.

**✅ Koreksyon nan migration:** `20260526_audit_fixes.sql` — Section 2 ak Sections 3E/3F

---

## 2️⃣ ROW LEVEL SECURITY (RLS)

### ✅ Tab ki gen RLS aktive
| Tab | RLS | Politik |
|---|---|---|
| `profiles` | ✅ | SELECT, INSERT, UPDATE, DELETE |
| `products` | ✅ | Pwopriyetè + Ekip |
| `sales` | ✅ | Pwopriyetè + Ekip |
| `expenses` | ✅ | Admin sèlman |
| `suppliers` | ✅ | Admin sèlman |
| `purchases` | ✅ | Admin sèlman |
| `businesses` | ✅ | Pwopriyetè |
| `employees` | ✅ | Admin jere, vendè wè pwòp |
| `subscriptions` | ✅ | Pwopriyetè |
| `clients` | ✅ | Pwopriyetè (`FOR ALL`) |
| `client_credits` | ✅ | Pwopriyetè (`FOR ALL`) |
| `customer_transactions` | ✅ | Pwopriyetè (`FOR ALL`) |

### ❌ Pwoblèm Grav: Politik DOUBLE sou `suppliers` ak `purchases`

```sql
-- SCHEMA.SQL kreye PREMYE seri (liy 266-288):
CREATE POLICY suppliers_select_own ON suppliers FOR SELECT USING (owner_id = auth.uid());
CREATE POLICY purchases_select_own ON purchases FOR SELECT USING (owner_id = auth.uid());

-- APRE A, menm schema.sql kreye DEZYÈM seri (liy 510-594):
CREATE POLICY suppliers_select_admin ON suppliers FOR SELECT USING (
  owner_id = auth.uid() OR business_id IN (SELECT business_id FROM employees WHERE user_id = auth.uid() AND role = 'admin')
);
```

**Enpak:**  
- Supabase politik yo se **OR** — si nenpòt youn pase, aksè otorize.
- Dezyèm seri (admin) inklut premye seri a (own), kidonk `_own` yo se redundant.
- Si yo pa retire yo, yo ap kreye konfizyon ak potansyèlman pèmèt aksè endezire.
- Si mitigasyon `20260407_add_purchases_suppliers.sql` te aplike ANVAN schema.sql, Supabase ta lanse erè "policy already exists".

**✅ Koreksyon:** `20260526_audit_fixes.sql` — Section 4 retire politik `_own` duplike yo.

### ⚠️ Vue `stock_value_htg` san RLS espesifik
```sql
CREATE OR REPLACE VIEW stock_value_htg AS
SELECT p.id, p.name, ... FROM products p LEFT JOIN businesses b ON p.business_id = b.id
WHERE p.stock_quantity > 0;
-- Pa gen WHERE owner_id = auth.uid() nan vue a!
```
**Analiz:** Vue a fonksyone kòrèkteman paske PostgreSQL aplike RLS sou `products` anba chapèl, men **si Supabase gen `security_definer` aktive oswa si ou fè yon `SECURITY DEFINER` fonksyon ki rele view sa a**, RLS ka koupe. Rekòmande ajoute `WITH (security_invoker = true)` ann Supabase.

---

## 3️⃣ INDEXES — SITIYASYON KRITIK ❌

### Tab ki gen Indexes (sèlman 2!)
| Tab | Index | Kolòn |
|---|---|---|
| `customer_transactions` | `idx_ct_client_id` | `client_id` |
| `customer_transactions` | `idx_ct_invoice_no` | `invoice_number` |
| `customer_transactions` | `idx_ct_owner_date` | `owner_id, created_at` |
| `products` | UNIQUE constraint | `barcode` |

### ❌ Indexes ki MANKE (kritik pou pèfòmans)

#### Tab `sales` — 0 Index, tout rechèch slow
```sql
-- RECHÈCH KI FÈT CHAK JOU ANEK, PA GEN INDEX:
SELECT * FROM sales WHERE owner_id = ?            -- RLS chak rechèch
SELECT * FROM sales WHERE created_at >= ?         -- Rapò dat
SELECT * FROM sales WHERE client_id = ?           -- Istorik kliyan
SELECT * FROM sales WHERE invoice_number = ?      -- Rechèch fakti
SELECT * FROM sales WHERE payment_status = 'À Crédit'  -- Dèt kliyan
```
**Enpak:** Sèk FULL TABLE SCAN sou chak rechèch. Ak 10,000 vant, chak rechèch ta pran 500ms+.

#### Tab `expenses` — 0 Index
```sql
SELECT * FROM expenses WHERE owner_id = ?         -- RLS
SELECT * FROM expenses WHERE date BETWEEN ? AND ? -- Rapò
SELECT * FROM expenses WHERE category = ?         -- Kategori
```

#### Tab `purchases` — 0 Index
```sql
SELECT * FROM purchases WHERE payment_status = 'À Crédit'  -- Dèt yo
SELECT * FROM purchases WHERE supplier_id = ?    -- Pa founisè
SELECT * FROM purchases WHERE business_id = ?    -- Multi-tenant
```

#### Tab `products` — Sèlman barcode UNIQUE
```sql
SELECT * FROM products WHERE owner_id = ?         -- RLS chak rechèch
SELECT * FROM products WHERE business_id = ?      -- Multi-tenant
SELECT * FROM products WHERE stock_quantity <= 5  -- Alèt stock ba
```

**✅ Koreksyon:** `20260526_audit_fixes.sql` — Section 1 kreye 30+ index enpòtan

---

## 4️⃣ KALKIL PWOFI — TOUT NAN JAVASCRIPT ❌

### Kòman li fèt kounye a (PWOBLÈM)

#### Nan `lib/financialReporting.ts`
```typescript
// Pran TOUT vant, TOUT depans, TOUT achats ← FULL TABLE LOAD
const { data: sales }    = await supabase.from('sales').select('...');
const { data: purchases } = await supabase.from('purchases').select('...');
const { data: expenses }  = await supabase.from('expenses').select('...');

// Kalkile nan JavaScript ← AGREJE NAN MEMWA SERVEUR
for (const txn of transactions) {
  report.revenues.salesRevenue += convertedAmount;  // Loop JS
}
report.profitBeforeTax = report.revenues.totalRevenue - report.expenses.totalExpenses;
```

#### Nan `app/actions/reports.ts` — ENCORE PWOBLÈM
```typescript
// Pran TOUT done san filtre dat nan SQL ← CRITIK
const salesData    = await supabase.from('sales').select('total_amount, created_at');
const expensesData = await supabase.from('expenses').select('amount, date');

// Filtre nan JavaScript ← O(n) nan memwa
const salesTotal = sales
  .filter(s => new Date(s.created_at) >= startDate)  // Tout done chaje nan JS!
  .reduce((sum, s) => sum + Number(s.total_amount), 0);
```

**Enpak:** Ak 50,000 vant nan baz done a:
- 50,000 rejis chaje nan memwa serveur
- Agrege an JavaScript (CPU pou chak rechèch)
- Nenpòt rapò pran 3-10 sèkond
- Pap eskale

### ✅ Solisyon — SQL Views ak Fonksyon SQL

**Vue `v_profit_by_period`** (kreye nan migration):
```sql
-- Kounye a, yon sèl rechèch SQL fè tout kalkil la
SELECT * FROM v_profit_by_period WHERE owner_id = auth.uid();
-- Retounen sèlman rezime, pa tout done yo
```

**Fonksyon `get_profit_and_loss()`** (kreye nan migration):
```sql
-- Remplace 100+ liy JavaScript
SELECT * FROM get_profit_and_loss(
  p_business_id := 'uuid...',
  p_start_date  := '2026-01-01',
  p_end_date    := '2026-05-26',
  p_currency    := 'HTG'
);
-- Retounen: total_revenue, cogs, total_expenses, gross_profit, net_profit
```

---

## 5️⃣ BUGS LOJIK — KRITIK ❌

### 🐛 Bug #1: DOUBLE DEKREMAN STOCK (KRITIK)

**Lokasyon:** `app/actions/sales.ts` liy 121-126

```typescript
// TRIGGER decrement_product_stock_trigger ap fè sa a OTOMATIKMAN
// (schema.sql liy 119-122)

// MEN, app/actions/sales.ts FÈLE MENM CHO MANYÈLMAN:
const { error: stErr } = await supabaseServer
  .from('products')
  .update({ stock_quantity: product.stock_quantity - item.quantity })
  .eq('id', item.product_id);
// STOCK DEKREMENTE DE FWA!
```

**Enpak:** Chak vant retire 2x kantite pwodwi nan stock. Yon vant 5 inite retire 10 nan stock!

**Koreksyon:** Retire update manyèl la oswa deaktive trigger la — pa ka fè toulede.

```typescript
// RETIRE blòk sa a nan createSaleAction() (liy 121-126):
// const { error: stErr } = await supabaseServer
//   .from('products')
//   .update({ stock_quantity: product.stock_quantity - item.quantity })
//   .eq('id', item.product_id);
// if (stErr) throw new Error(stErr.message);
```

### 🐛 Bug #2: RISK SEKIRITE nan `debts.ts` — owner_id soti nan payload kliyan

**Lokasyon:** `app/actions/debts.ts` liy 51-59

```typescript
// DANGERÈ: owner_id soti nan payload k ap vini nan kliyan
const insertPayload: any = {
  amount: purchase.total_purchase_amount,
  ...
};
if (payload.owner_id) {
  insertPayload.owner_id = payload.owner_id;  // ← Kliyan ka bay nenpòt owner_id!
}
// Si owner_id pa bay, expense ka kreye san owner_id (NULL) ← DB erè
```

**Enpak:** Yon itilizatè mal-entansyone ka kreye depans sou kont yon lòt itilizatè.

**Koreksyon:**
```typescript
// TOUJOU pran owner_id nan auth.uid()
const { data: { user } } = await supabaseServer.auth.getUser();
if (!user) throw new Error('Non authentifié');

const insertPayload = {
  owner_id: user.id,  // ← TOUJOU sèvi auth.uid()
  amount: purchase.total_purchase_amount,
  currency: 'HTG',   // ← ajoute currency (obligatwa apre migration)
  description: `Remboursement dette - ${supplier.name}`,
  category: 'Remboursements',
  date: new Date().toISOString().split('T')[0],
};
```

### 🐛 Bug #3: MANKE `currency` nan expense kontra dèt

**Lokasyon:** `app/actions/debts.ts` liy 51-59

Apre migration `20260522_expenses_enhancements.sql`, kolòn `currency` nan `expenses` se `NOT NULL DEFAULT 'HTG'`. Men si achè a te an USD, depans la ap anrejistre an HTG san konvèsyon.

```typescript
// PWOBLÈM: Achè USD anrejistre kòm HTG
const insertPayload = {
  amount: purchase.total_purchase_amount,  // ← Montant USD!
  // currency: pa bay!                     ← Pran DEFAULT 'HTG'
};
// Rezilta: 100 USD anrejistre kòm 100 HTG (pa konvèti)
```

### 🐛 Bug #4: Nimewo Fakti pa garanti Unik

**Lokasyon:** `app/actions/sales.ts` liy 37-40

```typescript
function generateInvoiceNumber(): string {
  const year = new Date().getFullYear();
  const rand = Math.floor(Math.random() * 900000) + 100000;
  return `PP-${year}-${rand}`;  // ← Math.random() ka repete!
}
```

**Enpak:** Yon ti chans (1/900,000) de fakti gen menm nimewo. Nan yon gwo volume vant, sa a ap rive.

**Koreksyon:** Sèvi ak `generate_invoice_number()` SQL sequence (kreye nan migration).

```typescript
// Rele fonksyon SQL la
const { data } = await supabase.rpc('generate_invoice_number');
const invoiceNumber = data; // ← Garanti unik
```

---

## 6️⃣ ENKONPLETE SCHEMA.SQL

### ⚠️ Tab `profiles` pa kreye nan schema.sql

`schema.sql` refere `profiles` nan trigger ak politik, men pa gen `CREATE TABLE profiles`:
```sql
-- Fonksyon ki rete nan schema.sql (liy 29-35):
create or replace function public.handle_new_user() returns trigger as $$
begin
  insert into public.profiles (owner_id)  -- ← Tab "profiles" existe?
  values (new.id);
  return new;
end;

-- Liy 125: Politik sou profiles
alter table profiles enable row level security;
-- ← Pa gen CREATE TABLE profiles avan sa!
```

**Enpak:** Si yon moun eseye aplike `schema.sql` sou yon baz vit, li ap echwe. Tab `profiles` dwe te kreye nan yon ansyen migration ki pa nan repo a.

---

## 📋 Plan Aksyon — Ranje Pa Priyorite

### 🔴 KRITIK — Fè kounye a

| # | Aksyon | Fichye | Enpak |
|---|---|---|---|
| 1 | **Retire double dekreman stock** | `app/actions/sales.ts:121-126` | Bug pwoduksyon aktif |
| 2 | **Sekirize owner_id nan debts.ts** | `app/actions/debts.ts:51-59` | Risk sekirite |
| 3 | **Aplike migration indexes** | `supabase/migrations/20260526_audit_fixes.sql` | Pèfòmans kritik |
| 4 | **Ajoute currency nan debts.ts** | `app/actions/debts.ts` | Done finansyè fò |

### 🟡 ENPÒTAN — Fè nan 1-2 semèn

| # | Aksyon | Fichye | Enpak |
|---|---|---|---|
| 5 | **Ranplase kalkil JS P&L ak SQL Views** | `lib/financialReporting.ts` | Pèfòmans eskalabl |
| 6 | **Sèvi ak `generate_invoice_number()` SQL** | `app/actions/sales.ts:37-40` | Integriti done |
| 7 | **Retire politik RLS duplike** | Supabase Dashboard | Sekirite klè |
| 8 | **Ajoute `business_id` sou clients/client_credits** | Migration 20260526 | Multi-tenant |

### 🟢 PITA — Amelyorasyon

| # | Aksyon | Seksyon |
|---|---|---|
| 9 | Kreye `profiles` tab nan yon migration | Schema entegriti |
| 10 | Ajoute `security_invoker` sou `stock_value_htg` | Sekirite vue |
| 11 | Ranplase `reports.ts` kalkil JS ak `v_dashboard_kpi` vue | Pèfòmans rapò |
| 12 | Ajoute fonksyon `get_profit_and_loss()` RPC nan frontend | Efisyans |

---

## 🗂️ Fichye Migration Kreye

**`supabase/migrations/20260526_audit_fixes.sql`** — Aplike sou Supabase Dashboard → SQL Editor

Kontni:
- **Section 1:** 30+ Indexes sou sales, expenses, purchases, products, clients
- **Section 2:** Kolòn `business_id` sou clients, client_credits, customer_transactions
- **Section 3:** 6 SQL Views (v_profit_by_period, v_dashboard_kpi, v_supplier_debts, v_client_receivables, etc.)
- **Section 4:** Retire politik RLS duplike
- **Section 5:** Fonksyon `get_profit_and_loss()` SQL
- **Section 6:** Sekans nimewo fakti unik

---

## 📊 Pwofi Pèfòmans Espere

| Operasyon | Anvan | Apre Indexes | Amelyorasyon |
|---|---|---|---|
| Chaje rapò mwa | ~3-8 sèk | ~200ms | **15-40x rapid** |
| Rechèch dèt founisè | ~2 sèk | ~50ms | **40x rapid** |
| Dashboard KPI | ~5-10 sèk | ~100ms | **50-100x rapid** |
| Rechèch pa kliyan | ~1 sèk | ~20ms | **50x rapid** |

---

*Rapò jenere pa analiz estatik done fichye yo. Verifye sou Supabase Dashboard pou konfime eta aktyèl baz done a.*
