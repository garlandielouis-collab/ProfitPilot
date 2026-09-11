const { chromium } = require('playwright-core');
const PAGES = [
  ['accueil', ''], ['catalogue', '/products'], ['collection', '/collections/bijoux'],
  ['fiche', '/products/dafca435-7ddb-4425-923e-954c714d913b'], ['panier', '/cart'], ['favoris', '/favoris'],
];
(async () => {
  const b = await chromium.launch({ channel: 'msedge', args: ['--disable-dev-shm-usage'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  page.on('response', r => {
    if (r.request().isNavigationRequest() || r.status() >= 300 && r.status() < 400) {
      console.log(`  [resp] ${r.status()} ${r.url().slice(-60)} loc=${r.headers()['location'] || '-'}`);
    }
  });
  for (const [name, p] of PAGES) {
    const url = `http://localhost:3111/store/laloustore${p}`;
    console.log(`--- ${name} -> ${url.slice(-50)}`);
    let resp = null;
    try { resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }); }
    catch (e) { console.log('   networkidle KO:', String(e).slice(0, 70)); resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }); }
    await page.waitForTimeout(400);
    console.log(`   goto status=${resp && resp.status()} final=${page.url().slice(-50)}`);
    // On imite shots.js : deux evaluate puis une capture.
    await page.evaluate(() => ({ doc: document.documentElement.scrollWidth }));
    await page.evaluate(() => document.querySelectorAll('a[href], button').length);
    await page.screenshot({ path: require('path').join(require('os').tmpdir(), `p8-${name}.png`) });
  }
  console.log('erreurs:', [...new Set(errors)].slice(0, 5).join(' | '));
  await b.close();
})();
