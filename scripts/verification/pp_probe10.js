// La vitrine servie sur le sous-domaine du marchand : c'est là que
// `usePathname()` ne dit PAS « /store/… », et que le garde-fou d'AppShell
// pouvait éjecter le client vers l'écran de connexion.
const { chromium } = require('playwright-core');
const B = 'http://laloustore.localhost:3000';
(async () => {
  const b = await chromium.launch({ channel: 'msedge', args: ['--disable-dev-shm-usage'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  for (const p of ['/', '/products', '/collections/bijoux', '/products/dafca435-7ddb-4425-923e-954c714d913b', '/cart']) {
    try { await page.goto(B + p, { waitUntil: 'networkidle', timeout: 40000 }); }
    catch { await page.goto(B + p, { waitUntil: 'domcontentloaded', timeout: 40000 }); }
    await page.waitForTimeout(700);
    const login = await page.evaluate(() => document.body.innerText.includes('Créer mon compte'));
    const h1 = await page.evaluate(() => (document.querySelector('h1')?.textContent || '').trim().slice(0, 40));
    console.log(`${p.padEnd(48)} url=${page.url().replace(B,'') || '/'}  login=${login}  h1="${h1}"`);
  }
  await b.close();
})();
