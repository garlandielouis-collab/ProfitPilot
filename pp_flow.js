// ─────────────────────────────────────────────────────────────────────────────
// Le parcours d'achat, de bout en bout (§38)
//
//   Accueil → Rayon → Fiche → Ajout au panier → Tiroir → Panier → Checkout
//
// Il s'arrête AVANT l'envoi de la commande, et c'est délibéré : la base visée
// est celle du marchand, en production. Valider le bouton créerait une vraie
// commande, une vraie ligne de client et un vrai mouvement de stock dans son
// tableau de bord. On vérifie donc que le formulaire est complet, valide et
// prêt à partir — pas qu'on sait écrire dans les données de quelqu'un d'autre.
//
// Sont vérifiés au passage : la quantité, la suppression, le passage mobile, et
// la persistance du panier après rechargement.
// ─────────────────────────────────────────────────────────────────────────────

const { chromium } = require('playwright-core');

const BASE = process.env.BASE || 'http://localhost:3000';
const STORE = `${BASE}/store/laloustore`;

const results = [];
function check(label, ok, detail = '') {
  results.push(`${ok ? 'OK  ' : 'ÉCHEC'} ${label}${detail ? ' — ' + detail : ''}`);
}

(async () => {
  const b = await chromium.launch({ channel: 'msedge', args: ['--disable-dev-shm-usage'] });

  // ── Parcours principal, sur un écran d'ordinateur ──────────────────────────
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 120)));

  await page.goto(STORE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  check('Accueil rendu', (await page.locator('h1').first().textContent()).trim().length > 0);

  // Rayon depuis la navigation.
  await page.locator('nav[aria-label="Rayons"] a').first().click();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(600);
  check('Rayon ouvert depuis la navigation', /\/collections\//.test(page.url()), page.url().replace(BASE, ''));

  const gridCount = await page.locator('a[href*="/products/"]').count();
  check('Le rayon contient des produits', gridCount > 0, `${gridCount} liens`);

  // Fiche produit. On suit le premier lien du rayon, puis on vérifie que la
  // fiche est bien commandable : un article épuisé n'a pas de sélecteur de
  // quantité, et ce n'est pas le parcours qu'on teste ici.
  await page.locator('a[href*="/products/"]').first().click();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(700);
  if ((await page.locator('button[aria-label="Augmenter la quantité"]').count()) === 0) {
    await page.goto(`${STORE}/products/dafca435-7ddb-4425-923e-954c714d913b`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
  }
  check('Fiche produit ouverte', /\/products\//.test(page.url()));
  check('Galerie présente', await page.locator('button[aria-label="Agrandir l\'image"]').count() > 0);

  // Quantité + ajout au panier.
  await page.locator('button[aria-label="Augmenter la quantité"]').click();
  await page.waitForTimeout(200);
  const qty = (await page.locator('button[aria-label="Augmenter la quantité"]')
    .locator('xpath=preceding-sibling::span[1]').textContent()).trim();
  check('Quantité incrémentée', qty === '2', `affiche ${qty}`);

  await page.locator('button[aria-label^="Ajouter"]').first().click();
  await page.waitForTimeout(900);
  const badge = await page.locator('button[aria-label^="Panier"]').textContent();
  check('Compteur du panier mis à jour', /2/.test(badge || ''), `badge « ${(badge || '').trim()} »`);

  // Tiroir.
  await page.locator('button[aria-label^="Panier"]').click();
  await page.waitForTimeout(600);
  check('Tiroir ouvert', await page.locator('button[aria-label="Fermer le panier"]').isVisible());

  // Persistance après rechargement.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
  const badge2 = await page.locator('button[aria-label^="Panier"]').textContent();
  check('Panier conservé après rechargement', /2/.test(badge2 || ''), `badge « ${(badge2 || '').trim()} »`);

  // Page panier.
  await page.goto(`${STORE}/cart`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  check('Panier rendu', (await page.locator('h1').first().textContent()).includes('panier'));
  const total = await page.locator('text=/Total/').first().isVisible().catch(() => false);
  check('Total affiché', total);

  // Diminution de quantité.
  await page.locator('button[aria-label="Diminuer la quantité"]').first().click();
  await page.waitForTimeout(500);
  const badge3 = await page.locator('button[aria-label^="Panier"]').textContent();
  check('Quantité modifiable depuis le panier', /1/.test(badge3 || ''), `badge « ${(badge3 || '').trim()} »`);

  // Checkout.
  await page.goto(`${STORE}/checkout`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
  const fields = await page.locator('input[required]').count();
  check('Checkout : champs obligatoires présents', fields >= 4, `${fields} champs`);

  await page.fill('input[placeholder="Nom complet *"]', 'Test Vérification');
  await page.fill('input[placeholder="Téléphone *"]', '50937000000');
  await page.fill('input[placeholder="Adresse *"]', 'Rue de Test 1');
  await page.fill('input[placeholder="Ville *"]', 'Port-au-Prince');
  await page.waitForTimeout(300);

  const valid = await page.evaluate(() => document.querySelector('form')?.checkValidity() ?? false);
  check('Checkout : formulaire valide, prêt à envoyer', valid);
  check('Checkout : commande NON envoyée (base de production)', true, 'arrêt volontaire');

  // Suppression complète → état vide.
  await page.goto(`${STORE}/cart`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  const removeBtn = page.locator('button[aria-label^="Retirer"]').first();
  if (await removeBtn.count()) {
    await removeBtn.click();
    await page.waitForTimeout(700);
  }
  const empty = await page.locator('text=Votre panier est vide').isVisible().catch(() => false);
  check('État vide du panier', empty);

  await ctx.close();

  // ── Le même achat, sur un téléphone ───────────────────────────────────────
  const mctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const m = await mctx.newPage();
  await m.goto(STORE, { waitUntil: 'domcontentloaded' });
  await m.waitForTimeout(700);

  await m.locator('button[aria-label="Ouvrir le menu"]').click();
  await m.waitForTimeout(400);
  check('Menu mobile ouvert', await m.locator('#store-mobile-menu').isVisible());
  const menuLinks = await m.locator('#store-mobile-menu nav[aria-label="Rayons"] a').count();
  check('Menu mobile : rayons listés', menuLinks > 1, `${menuLinks} entrées`);
  await m.keyboard.press('Escape');
  await m.waitForTimeout(400);
  check('Menu mobile fermé par Échap', (await m.locator('#store-mobile-menu').count()) === 0);

  await m.goto(`${STORE}/products/dafca435-7ddb-4425-923e-954c714d913b`, { waitUntil: 'domcontentloaded' });
  await m.waitForTimeout(800);
  await m.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await m.waitForTimeout(900);
  const sticky = await m.locator('button:has-text("Ajouter au panier")').last().isVisible().catch(() => false);
  check('Barre d\'achat collante en bas de fiche (mobile)', sticky);

  await mctx.close();
  await b.close();

  console.log(results.join('\n'));
  console.log('\nerreurs JS:', errors.length ? [...new Set(errors)].join(' | ') : 'aucune');
  const failed = results.filter((r) => r.startsWith('ÉCHEC')).length;
  console.log(`\n${results.length - failed}/${results.length} vérifications passées`);
})().catch((e) => { console.error('ECHEC HARNAIS', e); process.exit(1); });
