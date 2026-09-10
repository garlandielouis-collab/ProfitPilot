// Captures d'écran de la vitrine aux points de rupture du §25.
// Pilote l'Edge déjà installé — aucun navigateur téléchargé.

const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE || 'http://localhost:3111';
const SLUG = process.env.SLUG || 'laloustore';
const OUT  = process.env.OUT  || path.join(__dirname, 'shots');

const WIDTHS = [1280];

const PAGES = [
  { name: 'accueil',    path: '' },
  { name: 'catalogue',  path: '/products' },
  { name: 'collection', path: '/collections/bijoux' },
  { name: 'fiche',      path: process.env.PDP || '/products' },
  { name: 'panier',     path: '/cart' },
  { name: 'favoris',    path: '/favoris' },
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    channel: 'msedge',
    args: ['--disable-dev-shm-usage'],
  });

  const problems = [];

  for (const width of WIDTHS) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      deviceScaleFactor: 1,
    });
    await context.addInitScript(() => {
      const o = window.location.replace.bind(window.location);
      try { Object.defineProperty(window.location, 'replace', { configurable: true, value: function (u) { console.warn('PPTRAP replace ' + u + ' :: ' + new Error().stack); return o(u); } }); } catch (e) {}
      const a = window.location.assign.bind(window.location);
      try { Object.defineProperty(window.location, 'assign', { configurable: true, value: function (u) { console.warn('PPTRAP assign ' + u + ' :: ' + new Error().stack); return a(u); } }); } catch (e) {}
    });
    const page = await context.newPage();
    page.on('console', (m) => { if (m.text().includes('PPTRAP')) console.log(m.text()); });
    page.on('request', (r) => { if (r.isNavigationRequest()) console.log('  [req] ' + r.method() + ' ' + r.url().slice(-55)); });
    page.on('response', (r) => { if (r.request().isNavigationRequest() || r.status() >= 300) console.log('  [resp] ' + r.status() + ' ' + r.url().slice(-55) + ' -> ' + (r.headers()['location'] || '')); });

    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(String(e)));

    for (const p of PAGES.filter(x => !process.env.ONLY || process.env.ONLY.split(",").includes(x.name))) {
      const url = `${BASE}/store/${SLUG}${p.path}`;
      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
      } catch {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      }
      await page.waitForTimeout(400);
      console.log(`[apres] ${p.name} -> ${page.url().slice(-45)}`);

      // Débordement horizontal : la page ne doit jamais défiler latéralement.
      const overflow = await page.evaluate(() => {
        const d = document.documentElement;
        return { doc: d.scrollWidth, view: d.clientWidth };
      });
      if (overflow.doc > overflow.view + 1) {
        problems.push(`${p.name} @${width}px : débordement horizontal ${overflow.doc} > ${overflow.view}`);
      }

      // Cibles tactiles sous 44 px, hors éléments cachés.
      const small = await page.evaluate(() => {
        const out = [];
        for (const el of document.querySelectorAll('a[href], button')) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          if (r.height < 40) out.push((el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40));
        }
        return out.slice(0, 6);
      });
      if (small.length) problems.push(`${p.name} @${width}px : cibles < 40px → ${small.join(' | ')}`);

      await page.screenshot({
        path: path.join(OUT, `${p.name}-${width}.png`),
        fullPage: width <= 430,
      });
    }

    if (errors.length) problems.push(`@${width}px : erreurs console → ${[...new Set(errors)].slice(0, 3).join(' | ')}`);
    await context.close();
  }

  await browser.close();
  fs.writeFileSync(path.join(OUT, 'rapport.txt'), problems.join('\n') || 'aucun problème détecté');
  console.log(problems.length ? problems.join('\n') : 'AUCUN PROBLEME');
})().catch((e) => { console.error('ECHEC', e); process.exit(1); });
