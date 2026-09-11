const { chromium } = require('playwright-core');
const PAGES = [
  ['accueil', ''], ['catalogue', '/products'], ['collection', '/collections/bijoux'],
  ['fiche', '/products/dafca435-7ddb-4425-923e-954c714d913b'], ['panier', '/cart'], ['favoris', '/favoris'],
];
(async () => {
  const b = await chromium.launch({ channel: 'msedge', args: ['--disable-dev-shm-usage'] });
  for (const width of [1280]) {
    const ctx = await b.newContext({ viewport: { width, height: 900 } });
    const page = await ctx.newPage();
    for (const [name, p] of PAGES) {
      const url = `http://localhost:3111/store/laloustore${p}`;
      try { await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }); }
      catch (e) { console.log(`  [${name}] networkidle a échoué: ${String(e).slice(0,60)}`); await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }); }
      await page.waitForTimeout(400);
      const has = await page.evaluate(() => document.body.innerText.includes('Créer mon compte'));
      console.log(`${name}: url=${page.url().slice(-40)} login=${has}`);
    }
    await ctx.close();
  }
  await b.close();
})();
