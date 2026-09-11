const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ channel: 'msedge' });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const bad = [];
  page.on('response', r => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url().slice(0,120)}`); });
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0,120)); });
  const B = 'http://localhost:3111/store/laloustore';
  for (const p of ['', '/products', '/collections/bijoux', '/products/dafca435-7ddb-4425-923e-954c714d913b', '/cart', '/favoris']) {
    await page.goto(B + p, { waitUntil: 'networkidle' }).catch(()=>page.goto(B+p,{waitUntil:'domcontentloaded'}));
    await page.waitForTimeout(500);
    console.log(`${p || '/'}  ->  ${page.url()}  |  titre: ${(await page.title()).slice(0,50)}`);
  }
  console.log('REQ>=400:', [...new Set(bad)].join('\n  '));
  console.log('ERREURS:', [...new Set(errs)].join('\n  '));
  await b.close();
})();
