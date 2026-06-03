#!/usr/bin/env node
// scripts/convert_transactions.js
// Usage:
//  SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/convert_transactions.js
//  To apply updates: set APPLY=true (dangerous - updates live DB)

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
// Also load .env.local used by Next.js if present
try {
  const localPath = path.join(process.cwd(), '.env.local');
  if (fs.existsSync(localPath)) {
    require('dotenv').config({ path: localPath });
  }
} catch (e) {
  // ignore
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const APPLY = process.env.APPLY === 'true' || process.env.APPLY === '1' || process.argv.includes('--apply');

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in environment.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

function toReportCurrency(amount, fromCurrency, reportCurrency, rate) {
  if (!fromCurrency) fromCurrency = reportCurrency;
  if (fromCurrency.toUpperCase() === reportCurrency) return Number(amount || 0);
  if (reportCurrency === 'HTG' && fromCurrency.toUpperCase() === 'USD') return Number(amount || 0) * Number(rate || 130);
  if (reportCurrency === 'USD' && fromCurrency.toUpperCase() === 'HTG') return Number(amount || 0) / Number(rate || 130);
  return Number(amount || 0);
}

(async () => {
  try {
    const { data: businesses, error: be } = await supabase.from('businesses').select('id,exchange_rate,default_currency');
    if (be) throw be;
    if (!businesses || businesses.length === 0) {
      console.log('No businesses found.');
      return;
    }

    for (const biz of businesses) {
      const bizId = biz.id;
      const rate = Number(biz.exchange_rate || 130);
      const reportCurrency = (biz.default_currency || 'HTG').toUpperCase();
      console.log(`Processing business ${bizId} (report currency=${reportCurrency}, rate=${rate})`);

      const tables = [
        { name: 'sales', amountField: 'total_amount', dateField: 'created_at', hasDeletedAt: true },
        { name: 'expenses', amountField: 'amount', dateField: 'expense_date', hasDeletedAt: true },
        { name: 'purchases', amountField: 'total_amount', dateField: 'purchase_date', hasDeletedAt: true },
        { name: 'customer_transactions', amountField: 'amount', dateField: 'transaction_date', hasDeletedAt: false },
        { name: 'inventory_movements', amountField: 'total_cost', dateField: 'created_at', hasDeletedAt: false },
      ];

      const outDir = path.join(process.cwd(), 'tmp', 'converted', bizId);
      fs.mkdirSync(outDir, { recursive: true });

      for (const t of tables) {
        console.log('  Fetching', t.name);
        let query = supabase
          .from(t.name)
          .select(`id, ${t.amountField}, currency, ${t.dateField}`)
          .eq('business_id', bizId)
          .limit(10000);
        if (t.hasDeletedAt) {
          query = query.is('deleted_at', null);
        }
        const { data, error } = await query;
        if (error) {
          console.warn(`    Skipping ${t.name}: ${error.message}`);
          continue;
        }
        const rows = data || [];
        if (rows.length === 0) continue;

        const csvLines = [];
        csvLines.push(['table','id','original_amount','original_currency','converted_amount','report_currency','date'].join(','));

        for (const r of rows) {
          const orig = Number(r[t.amountField] || 0);
          const origCur = (r.currency || reportCurrency).toUpperCase();
          const converted = toReportCurrency(orig, origCur, reportCurrency, rate);
          csvLines.push([t.name, r.id, orig, origCur, converted, reportCurrency, r[t.dateField] || ''].join(','));

          if (APPLY) {
            // Try updating a 'converted_amount' column if it exists
            try {
              const upd = {};
              upd['converted_amount'] = converted;
              upd['converted_currency'] = reportCurrency;
              // this will error if columns do not exist
              const { error: uerr } = await supabase.from(t.name).update(upd).eq('id', r.id);
              if (uerr) {
                // If update fails because column missing, throw to stop applying further
                throw uerr;
              }
            } catch (uErr) {
              console.error('Apply failed for', t.name, r.id, uErr.message);
              console.error('Stopping APPLY mode. You can create converted_amount/converted_currency columns or run with APPLY=false to generate CSV only.');
              process.exit(2);
            }
          }
        }

        const outPath = path.join(outDir, `${t.name}.csv`);
        fs.writeFileSync(outPath, csvLines.join('\n'));
        console.log(`    Wrote ${outPath} (${rows.length} rows)`);
      }

      // Also calculate stock value per product
      try {
        const { data: products } = await supabase.from('products').select('id, stock_quantity, purchase_price, currency').eq('business_id', bizId).limit(10000);
        if (products && products.length) {
          const prodLines = [];
          prodLines.push(['product_id','stock_quantity','unit_price','unit_currency','stock_value_converted','report_currency'].join(','));
          for (const p of products) {
            const q = Number(p.stock_quantity || 0);
            const unit = Number(p.purchase_price || 0);
            const unitCur = (p.currency || reportCurrency).toUpperCase();
            const stockVal = toReportCurrency(unit, unitCur, reportCurrency, rate) * q;
            prodLines.push([p.id, q, unit, unitCur, stockVal, reportCurrency].join(','));
          }
          const outPath = path.join(outDir, `products_stock.csv`);
          fs.writeFileSync(outPath, prodLines.join('\n'));
          console.log(`    Wrote ${outPath} (${products.length} products)`);
        }
      } catch (pe) {
        console.warn('  products check failed', pe.message);
      }

      console.log(`Finished business ${bizId}. CSVs in ${outDir}`);
    }

    console.log('All done.');
  } catch (err) {
    console.error('Error:', err.message || err);
    process.exit(1);
  }
})();
