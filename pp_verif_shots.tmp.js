const { chromium } = require('playwright-core');
const path = require('path');
const OUT = process.argv[2];
const IDS = process.argv.slice(3);
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', args: ['--disable-dev-shm-usage'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1500 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  for (const id of IDS) {
    await page.goto('http://localhost:3111/store/zzverif/' + id, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(OUT, id + '.png') });
    console.log(id, 'capturé');
  }
  if (errs.length) console.log('ERREURS JS :', errs.slice(0, 5).join(' | '));
  else console.log('aucune erreur JavaScript');
  await browser.close();
})();
