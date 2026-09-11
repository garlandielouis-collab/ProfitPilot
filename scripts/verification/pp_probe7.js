const { chromium } = require('playwright-core');
const URL = 'http://localhost:3111/store/laloustore/products/dafca435-7ddb-4425-923e-954c714d913b';
(async () => {
  const b = await chromium.launch({ channel: 'msedge', args: ['--disable-dev-shm-usage'] });
  let redirects = 0;
  for (let i = 0; i < 10; i++) {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const errs = [];
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 90)); });
    page.on('pageerror', e => errs.push(String(e).slice(0, 90)));
    try { await page.goto(URL, { waitUntil: 'networkidle', timeout: 45000 }); }
    catch { await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 }); }
    await page.waitForTimeout(400);
    const u = page.url();
    if (u !== URL) { redirects++; console.log(`#${i} REDIRIGÉ -> ${u}`); console.log('   erreurs:', [...new Set(errs)].join(' | ')); }
    await ctx.close();
  }
  console.log(`redirections: ${redirects}/10`);
  await b.close();
})();
