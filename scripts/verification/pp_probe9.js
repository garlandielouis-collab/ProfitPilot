const { chromium } = require('playwright-core');
const B = 'http://localhost:3111/store/laloustore';
(async () => {
  const b = await chromium.launch({ channel: 'msedge', args: ['--disable-dev-shm-usage'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') console.log('  [console]', m.text().slice(0, 100)); });
  page.on('pageerror', e => console.log('  [pageerror]', String(e).slice(0, 140)));
  page.on('framenavigated', f => { if (f === page.mainFrame()) console.log('  [nav]', f.url().slice(-55)); });
  page.on('response', r => {
    const s = r.status();
    if (s >= 300) console.log(`  [resp] ${s} ${r.url().slice(-60)} -> ${r.headers()['location'] || ''}`);
  });

  const steps = ['/collections/bijoux', '/products/dafca435-7ddb-4425-923e-954c714d913b'];
  for (const p of steps) {
    console.log(`=== goto ${p}`);
    try { await page.goto(B + p, { waitUntil: 'networkidle', timeout: 45000 }); }
    catch (e) { console.log('  networkidle KO'); await page.goto(B + p, { waitUntil: 'domcontentloaded', timeout: 45000 }); }
    await page.waitForTimeout(400);
    console.log('  overflow eval');
    await page.evaluate(() => { const d = document.documentElement; return { doc: d.scrollWidth, view: d.clientWidth }; });
    console.log('  small eval');
    await page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll('a[href], button')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.height < 40) out.push((el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40));
      }
      return out.slice(0, 6);
    });
    console.log('  screenshot');
    await page.screenshot({ path: require('path').join(require('os').tmpdir(), `p9${p.replace(/\W/g,'')}.png`), fullPage: false });
    console.log('  url apres etape:', page.url().slice(-50));
  }
  console.log('cookies:', (await ctx.cookies()).map(c => c.name).join(', ') || 'aucun');
  await b.close();
})();
