const { chromium } = require('playwright-core');
const PATHS = ['', '/products', '/collections/bijoux', '/products/dafca435-7ddb-4425-923e-954c714d913b', '/cart', '/favoris'];
(async () => {
  const b = await chromium.launch({ channel: 'msedge', args: ['--disable-dev-shm-usage'] });
  for (const width of [360, 768, 1280]) {
    const ctx = await b.newContext({ viewport: { width, height: 900 } });
    const page = await ctx.newPage();
    const navs = [];
    page.on('framenavigated', f => { if (f === page.mainFrame()) navs.push(f.url()); });
    for (const p of PATHS) {
      const url = `http://localhost:3111/store/laloustore${p}`;
      navs.length = 0;
      try { await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }); }
      catch { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }); }
      await page.waitForTimeout(400);
      const login = await page.evaluate(() => document.body.innerText.includes('Créer mon compte'));
      if (login || page.url() !== url) {
        console.log(`!! ${width}px ${p || '/'} -> ${page.url()}`);
        console.log('   navigations:', navs.join(' => '));
      }
    }
    await ctx.close();
    console.log(`${width}px terminé`);
  }
  await b.close();
})();
