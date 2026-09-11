const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ channel: 'msedge' });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const reqs = [];
  page.on('response', r => { if (r.status() >= 400) reqs.push(`${r.status()} ${r.url()}`); });
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push(String(e)));

  await page.goto('http://localhost:3111/store/laloustore/products/dafca435-7ddb-4425-923e-954c714d913b', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  const small = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('a[href], button')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.height < 40) out.push({
        txt: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30),
        h: Math.round(r.height),
        cls: el.className.toString().slice(0, 80),
        parent: el.parentElement?.className?.toString().slice(0, 60),
      });
    }
    return out;
  });
  console.log('PETITES CIBLES:', JSON.stringify(small, null, 1));
  console.log('REQUETES EN ERREUR:', reqs.join('\n'));
  console.log('ERREURS:', [...new Set(errs)].slice(0, 6).join('\n'));
  await b.close();
})();
