const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ channel: 'msedge' });
  for (const [name, url] of [
    ['accueil', 'http://localhost:3111/store/laloustore'],
    ['catalogue', 'http://localhost:3111/store/laloustore/products'],
  ]) {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    const errs = [];
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    page.on('pageerror', e => errs.push(String(e)));
    const bad = [];
    page.on('response', r => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url().slice(0, 110)}`); });
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    console.log(`--- ${name} ---`);
    console.log('erreurs:', [...new Set(errs)].slice(0, 5).join(' || ') || 'aucune');
    console.log('req>=400:', [...new Set(bad)].join(' || ') || 'aucune');
    await ctx.close();
  }
  await b.close();
})();
