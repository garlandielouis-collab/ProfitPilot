const { chromium } = require('playwright-core');
const PATHS = ['', '/products', '/collections/bijoux', '/products/dafca435-7ddb-4425-923e-954c714d913b'];
(async () => {
  const b = await chromium.launch({ channel: 'msedge', args: ['--disable-dev-shm-usage'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(() => {
    const orig = window.location.replace.bind(window.location);
    // On capture la pile de l'appelant avant de laisser la redirection partir.
    Object.defineProperty(window.location, 'replace', {
      configurable: true,
      value: function (u) {
        console.warn('[PP-REDIRECT] location.replace -> ' + u + '\n' + new Error().stack);
        return orig(u);
      },
    });
    const push = history.pushState.bind(history);
    const rep = history.replaceState.bind(history);
    history.replaceState = function (...a) { if (String(a[2]||'').includes('auth')) console.warn('[PP-REDIRECT] history.replaceState -> ' + a[2] + '\n' + new Error().stack); return rep(...a); };
    history.pushState = function (...a) { if (String(a[2]||'').includes('auth')) console.warn('[PP-REDIRECT] history.pushState -> ' + a[2] + '\n' + new Error().stack); return push(...a); };
  });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.text().includes('PP-REDIRECT')) console.log(m.text()); });
  for (const p of PATHS) {
    const url = `http://localhost:3111/store/laloustore${p}`;
    try { await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }); }
    catch { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }); }
    await page.waitForTimeout(600);
    console.log(`${p || '/'} -> ${page.url()}`);
  }
  await b.close();
})();
