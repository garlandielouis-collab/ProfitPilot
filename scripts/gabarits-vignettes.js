// ─────────────────────────────────────────────────────────────────────────────
// Les vignettes des gabarits de rayon
//
//   node scripts/gabarits-vignettes.js            # les cinq presets de rayon
//   node scripts/gabarits-vignettes.js tech food  # ceux-là seulement
//
// ── Pourquoi cet outil existe ───────────────────────────────────────────────
//
// Quatorze gabarits ont une maquette photographique. Cinq n'en avaient pas :
// retail, fashion, beauty, tech, food. L'éditeur posait alors trois aplats de
// leur palette à la place — honnête, mais muet : le marchand choisissait à
// l'aveugle sur un tiers de la liste, là où ailleurs une image lui disait en
// une seconde où va la bannière et à quoi ressemble la grille.
//
// ── Ce que ces vignettes montrent, et ce qu'elles ne montrent pas ──────────
//
// Elles sont DESSINÉES, pas photographiées, et la différence se voit : posées
// à côté des quatorze autres, ce sont des schémas en aplats. C'est un choix
// assumé plutôt qu'un pastiche raté — une maquette photographique demande des
// photographies, et inventer des photos de produits pour un gabarit reviendrait
// à montrer une boutique qui n'existe pas.
//
// Elles ne portent AUCUN texte : pas un nom de marque, pas un prix, pas une
// note, pas un nom de produit. C'est la règle du produit — aucune donnée
// fictive — appliquée à la lettre : ce qu'on dessine ici, c'est une STRUCTURE,
// et une structure n'a pas besoin de chiffres pour se lire.
//
// ── D'où viennent les formes ────────────────────────────────────────────────
//
// De nulle part ailleurs que du gabarit lui-même. Le nombre de colonnes, le
// rayon des angles, le cadrage des photos, la forme des rayons, la hauteur des
// titres, l'ordre des sections : tout est lu dans `designFor`, `presetFor` et
// `brandPresetFor`. Une vignette ne peut donc pas mentir sur la page qu'elle
// annonce — si le gabarit change, elle se regénère et change avec lui.
//
// ── Comment ────────────────────────────────────────────────────────────────
//
// Edge déjà installé pilote le rendu (aucun navigateur téléchargé, comme
// `pp_shots.js`), à deux fois la taille finale pour que les filets d'un pixel
// restent nets ; `sharp` réduit et encode en WebP au format des quatorze
// autres — 600 × 450, soit le 4/3 que l'éditeur réserve.
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { chromium } = require('playwright-core');
const { load } = require('./ts-require');

const { designFor } = load('lib/storeDesign.ts');
const { brandPresetFor } = load('lib/storeTheme.ts');
const { presetFor } = load('lib/storeSections.ts');

const W = 600;
const H = 450;
const SCALE = 2;
const OUT = path.join(__dirname, '..', 'public', 'gabarits');

/** Les cinq presets de rayon — les seuls sans maquette photographique. */
const DEFAULT_IDS = ['retail', 'fashion', 'beauty', 'tech', 'food'];

// ── Couleurs dérivées ───────────────────────────────────────────────────────
//
// Une maquette en aplats a besoin de plus de valeurs que les cinq de la
// palette : le gris d'un filet, celui d'une ligne de texte simulée, celui d'un
// bloc photo. Les inventer en dur donnerait le même gris sur les cinq
// gabarits — donc cinq schémas qui se ressemblent. On les MÉLANGE avec l'encre
// du gabarit : le filet d'un gabarit sombre est sombre, celui d'un gabarit
// crème est crème.

function hex(c) {
  const s = c.replace('#', '');
  const full = s.length === 3 ? s.split('').map((x) => x + x).join('') : s;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
}

function mix(a, b, ratio) {
  const [ar, ag, ab] = hex(a);
  const [br, bg, bb] = hex(b);
  const m = (x, y) => Math.round(x + (y - x) * ratio);
  return `rgb(${m(ar, br)},${m(ag, bg)},${m(ab, bb)})`;
}

// ── Les briques ─────────────────────────────────────────────────────────────

/** Une ligne de texte simulée. Jamais un mot : une barre. */
function bar(width, height, color, radius = 3, extra = '') {
  return `<i style="display:block;width:${width};height:${height}px;background:${color};border-radius:${radius}px;${extra}"></i>`;
}

/**
 * L'image de gabarit d'un emploi, embarquée en base64.
 *
 * La vignette est rendue par `setContent` : elle n'a pas d'adresse de base, et
 * un chemin `/gabarits/art/…` n'y résoudrait rien.
 *
 * Ce n'est pas de la décoration. Depuis que la vitrine pose l'image du gabarit
 * derrière une bannière sans photo, une vignette qui montrerait un aplat gris à
 * cet endroit annoncerait une page que le marchand n'obtiendra pas.
 */
function art(id, slot) {
  const dir = path.join(__dirname, '..', 'public', 'gabarits');
  // L'ordre est celui de la vitrine (`lib/storeArt.ts`) : la photographie du
  // gabarit d'abord, la composition dessinée ensuite. Une maquette qui
  // montrerait le dégradé là où la page montre une photo annoncerait une
  // boutique que le marchand n'obtiendra pas.
  const file = [
    path.join(dir, 'photo', `${id}-${slot}.webp`),
    path.join(dir, 'art', `${id}-${slot}.webp`),
  ].find((f) => fs.existsSync(f));

  return file ? `data:image/webp;base64,${fs.readFileSync(file).toString('base64')}` : null;
}

/** Vrai quand cet emploi porte une PHOTOGRAPHIE et non une composition dessinée. */
function hasPhoto(id, slot) {
  return fs.existsSync(
    path.join(__dirname, '..', 'public', 'gabarits', 'photo', `${id}-${slot}.webp`),
  );
}

/**
 * Le fond d'un bloc : l'image du gabarit quand elle existe, un aplat sinon.
 *
 * Le voile est celui de la vitrine (`heroOverlay`) et il n'est pas cosmétique :
 * sans lui, la maquette montre un titre blanc sur des poivrons jaunes, que
 * personne ne peut lire — alors que la page, elle, assombrit la photo. Une
 * maquette plus jolie que la page ment ; une maquette moins lisible que la page
 * ment aussi.
 */
function fill(src, fallback, scrim = 0) {
  if (!src) return `background:${fallback}`;
  const veil = scrim > 0
    ? `linear-gradient(rgba(12,18,24,${scrim}), rgba(12,18,24,${scrim})), `
    : '';
  return `background:${veil}url('${src}') center/cover no-repeat`;
}

/**
 * La rangée de notes d'une carte produit.
 *
 * Cinq marques IDENTIQUES, et aucun nombre. Une maquette qui remplirait quatre
 * étoiles sur cinq annoncerait une note — sur la vitrine d'un marchand qui n'a
 * pas encore un seul avis publié, ce serait un chiffre inventé, et la carte
 * n'affiche justement rien tant qu'aucun client n'a noté. Ce qui se montre ici,
 * c'est la PLACE que ce gabarit réserve aux avis, pas un résultat.
 */
function ratingRow(color) {
  return (
    `<div style="display:flex;gap:3px;align-items:center">`
    + Array.from({ length: 5 }, () =>
      `<i style="display:block;width:6px;height:6px;background:${color};`
      + `clip-path:polygon(50% 0,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)"></i>`)
      .join('')
    + `</div>`
  );
}

/**
 * Un bloc photo.
 *
 * `contain` dessine le produit détouré : un galet centré, avec l'air que le
 * gabarit prescrit autour. `cover` remplit le cadre — c'est une photographie
 * de mise en scène, elle n'a pas d'air.
 */
function media(rule, radius, tone, blob) {
  const inner = rule.fit === 'contain'
    ? `<i style="position:absolute;inset:${rule.pad + 8}%;background:${blob};border-radius:${Math.max(4, radius - 2)}px"></i>`
    : '';
  return (
    `<i style="position:relative;display:block;width:100%;aspect-ratio:${rule.ratio};`
    + `background:${tone};border-radius:${radius}px;overflow:hidden">${inner}</i>`
  );
}

function build(id) {
  const d = designFor(id);
  const p = brandPresetFor(id).palette;
  const sections = presetFor(id);

  const line   = mix(p.surface, p.ink, 0.14);   // un filet
  const text   = mix(p.surface, p.ink, 0.72);   // une ligne de texte
  const faint  = mix(p.surface, p.ink, 0.30);   // une ligne secondaire
  const tone   = p.surface2;                    // le fond d'un cadre photo
  const blob   = mix(p.surface2, p.ink, 0.22);  // le produit détouré
  const serif  = brandPresetFor(id).typography.heading === 'serif';

  const pad = 22;
  const gap = Math.max(6, Math.round(d.grid.gap * 0.55));

  // Les images du gabarit, telles que la vitrine les posera à ces endroits-là.
  const heroSlot = d.hero === 'split' || d.hero === 'social' ? 'story' : 'hero';
  const heroArt  = art(id, heroSlot);
  const storyArt = art(id, 'story');

  // Le voile de la vitrine : franc sur une photographie, presque nul sur une
  // composition dessinée. Il ne s'applique qu'aux bannières dont le texte se
  // pose SUR l'image — pas au panneau d'à-côté d'une bannière en deux colonnes.
  const heroScrim = hasPhoto(id, heroSlot) ? 0.52 : 0.12;

  // La rangée de notes n'apparaît que sur les gabarits qui l'affichent
  // (`design.showRating`). Elle manquait aux cinq maquettes de rayon : trois
  // d'entre elles réservent pourtant cette place sur chaque carte.
  const stars = () => (d.showRating ? ratingRow(mix(p.surface, p.accent, 0.75)) : '');

  // Le titre d'une section, à la hauteur que le gabarit donne aux titres.
  const heading = (width = 132) => {
    const h = Math.round(d.type.h2 * 0.52);
    const eyebrow = d.type.eyebrow
      ? bar('38px', 5, mix(p.surface, p.accent, 0.65), 3, 'margin-bottom:6px')
      : '';
    return `<div style="margin-bottom:10px">${eyebrow}${bar(`${width}px`, h, text, serif ? 2 : 3)}</div>`;
  };

  // ── L'en-tête ─────────────────────────────────────────────────────────────
  const headerBg  = d.headerDark ? p.primary : p.surface;
  const headerInk = d.headerDark ? mix(p.primary, p.surface, 0.85) : text;
  const logo = bar('62px', 11, headerInk, serif ? 2 : 3);
  const links = `<div style="display:flex;gap:12px;align-items:center">`
    + [30, 24, 28, 22].map((w) => bar(`${w}px`, 5, mix(headerBg, headerInk, 0.55))).join('')
    + `</div>`;
  const icons = `<div style="display:flex;gap:8px;align-items:center">`
    + `<i style="display:block;width:9px;height:9px;border:1.5px solid ${mix(headerBg, headerInk, 0.6)};border-radius:50%"></i>`
    + `<i style="display:block;width:10px;height:9px;background:${mix(headerBg, headerInk, 0.6)};border-radius:2px"></i>`
    + `</div>`;

  const header = d.nav === 'centered'
    ? `<div style="display:flex;flex-direction:column;align-items:center;gap:7px;padding:11px ${pad}px;background:${headerBg};border-bottom:1px solid ${d.headerDark ? 'transparent' : line}">
         ${logo}${links}
       </div>`
    : `<div style="display:flex;align-items:center;justify-content:space-between;padding:12px ${pad}px;background:${headerBg};border-bottom:1px solid ${d.headerDark ? 'transparent' : line}">
         ${logo}${links}${icons}
       </div>`;

  // ── La bannière ───────────────────────────────────────────────────────────
  //
  // Cinq compositions, et c'est ce que la vignette doit rendre visible d'un
  // coup d'œil : c'est la première chose qui sépare deux gabarits.

  const cta = bar('66px', 17, p.accent, d.radius.button === 999 ? 9 : Math.min(8, d.radius.button + 2));
  const titleH = Math.round(d.type.h1Lg * 0.32);

  // Le discours de la bannière. `onArt` retourne l'encre : posé sur l'image du
  // gabarit — qui est sombre — le texte de la vitrine est clair, et une
  // maquette qui le dessinerait sombre montrerait une bannière illisible que
  // personne n'obtiendra.
  const speech = (align = 'left', onArt = false) => {
    const ink   = onArt ? 'rgba(255,255,255,.88)' : text;
    const light = onArt ? 'rgba(255,255,255,.55)' : faint;
    return `
    <div style="display:flex;flex-direction:column;gap:7px;align-items:${align === 'center' ? 'center' : 'flex-start'}">
      ${bar(align === 'center' ? '210px' : '78%', titleH, ink, serif ? 2 : 3, d.type.upper ? 'opacity:.92' : '')}
      ${bar(align === 'center' ? '150px' : '56%', titleH, ink, serif ? 2 : 3)}
      ${bar(align === 'center' ? '180px' : '64%', 6, light)}
      <div style="margin-top:5px">${cta}</div>
    </div>`;
  };

  const heroes = {
    // Une carte posée dans la page : les produits restent visibles dessous.
    card: `
      <div style="padding:${pad}px">
        <div style="display:flex;gap:16px;align-items:center;padding:18px;border-radius:${d.radius.card}px;${fill(heroArt, tone, heroScrim)}">
          <div style="flex:1.15">${speech('left', Boolean(heroArt))}</div>
          ${heroArt
            // L'image EST le fond de la carte : lui poser un second bloc photo
            // à côté dessinerait une bannière que le gabarit ne rend pas.
            ? ''
            : `<i style="flex:1;height:98px;border-radius:${d.radius.media}px;background:${mix(tone, p.ink, 0.16)}"></i>`}
        </div>
      </div>`,
    // Pleine largeur, discours centré : la campagne d'une maison de mode.
    editorial: `
      <div style="height:186px;${fill(heroArt, mix(p.surface2, p.primary, 0.28), heroScrim)};display:flex;flex-direction:column;justify-content:center;align-items:center;gap:8px">
        ${speech('center', Boolean(heroArt))}
      </div>`,
    // Deux colonnes : le discours à gauche, l'image à droite.
    split: `
      <div style="display:flex;gap:20px;align-items:center;padding:26px ${pad}px;background:${tone}">
        <div style="flex:1.1">${speech()}</div>
        <i style="flex:.9;height:126px;border-radius:${d.radius.media}px;${fill(heroArt, mix(tone, p.ink, 0.15))}"></i>
      </div>`,
    // Une photographie qui occupe tout, le discours posé dessus.
    immersive: `
      <div style="height:170px;${fill(heroArt, mix(p.surface2, p.primary, 0.42), heroScrim)};display:flex;align-items:flex-end;padding:20px ${pad}px">
        <div style="width:64%">${speech('left', Boolean(heroArt))}</div>
      </div>`,
    compact: `
      <div style="padding:18px ${pad}px;background:${tone}">${speech()}</div>`,
  };

  // ── Les sections qui suivent ──────────────────────────────────────────────

  const draw = {
    benefits: () => `
      <div style="display:flex;gap:${gap}px;padding:14px ${pad}px;border-top:1px solid ${line};border-bottom:1px solid ${line}">
        ${[0, 1, 2, 3].map(() => `
          <div style="flex:1;display:flex;gap:7px;align-items:center">
            <i style="width:13px;height:13px;flex:none;border:1.5px solid ${mix(p.surface, p.accent, 0.75)};border-radius:${d.radius.button === 999 ? '50%' : '3px'}"></i>
            <div style="flex:1;display:flex;flex-direction:column;gap:4px">
              ${bar('78%', 5, text)}${bar('54%', 4, faint)}
            </div>
          </div>`).join('')}
      </div>`,

    categories: () => {
      if (d.categories === 'chips') {
        return `<div style="padding:16px ${pad}px 4px">
          ${heading(104)}
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            ${[62, 48, 74, 54, 66].map((w, i) =>
              bar(`${w}px`, 20, i === 0 ? p.primary : tone, 10)).join('')}
          </div>
        </div>`;
      }
      if (d.categories === 'circles') {
        return `<div style="padding:16px ${pad}px 4px">
          ${heading(104)}
          <div style="display:flex;gap:${gap}px">
            ${[0, 1, 2, 3, 4].map(() => `
              <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:6px">
                <i style="width:100%;aspect-ratio:1/1;background:${tone};border-radius:50%"></i>
                ${bar('62%', 5, faint)}
              </div>`).join('')}
          </div>
        </div>`;
      }
      if (d.categories === 'tabs') {
        return `<div style="padding:14px ${pad}px 4px">
          <div style="display:flex;gap:16px;border-bottom:1px solid ${line};padding-bottom:8px">
            ${[44, 38, 52, 40].map((w, i) =>
              bar(`${w}px`, 6, i === 0 ? p.accent : faint)).join('')}
          </div>
        </div>`;
      }
      return `<div style="padding:16px ${pad}px 4px">
        ${heading(104)}
        <div style="display:flex;gap:${gap}px">
          ${[0, 1, 2, 3].map(() => `
            <div style="flex:1;display:flex;flex-direction:column;gap:6px">
              <i style="width:100%;aspect-ratio:4/3;background:${tone};border-radius:${d.radius.media}px"></i>
              ${bar('66%', 5, faint)}
            </div>`).join('')}
        </div>
      </div>`;
    },

    grid: () => {
      const cols = d.grid.desktop;
      const framed = d.shadow !== 'none';
      return `<div style="padding:16px ${pad}px 4px">
        ${heading()}
        <div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:${gap}px">
          ${Array.from({ length: cols }).map(() => `
            <div style="display:flex;flex-direction:column;gap:7px;padding:${framed ? '7px' : '0'};background:${framed ? p.surface : 'transparent'};border:${framed ? `1px solid ${line}` : 'none'};border-radius:${d.radius.card}px">
              ${media(d.media, d.radius.media, tone, blob)}
              ${bar('82%', 6, text)}
              ${stars()}
              ${bar('44%', 7, mix(p.surface, p.ink, 0.85))}
            </div>`).join('')}
        </div>
      </div>`;
    },

    // Un article mis en avant : la fiche, à plat, au milieu de la page.
    featured_product: () => `
      <div style="padding:16px ${pad}px 4px">
        <div style="display:flex;gap:16px;padding:14px;border:1px solid ${line};border-radius:${d.radius.card}px">
          <i style="width:118px;flex:none;aspect-ratio:1/1;background:${tone};border-radius:${d.radius.media}px"></i>
          <div style="flex:1;display:flex;flex-direction:column;gap:7px;justify-content:center">
            ${bar('72%', 9, text)}${bar('92%', 5, faint)}${bar('84%', 5, faint)}
            ${bar('38%', 10, mix(p.surface, p.ink, 0.85))}
            <div style="margin-top:3px">${cta}</div>
          </div>
        </div>
      </div>`,

    brand_story: () => `
      <div style="display:flex;gap:18px;align-items:center;padding:16px ${pad}px 4px">
        <i style="flex:1;height:84px;border-radius:${d.radius.media}px;${fill(storyArt, tone)}"></i>
        <div style="flex:1;display:flex;flex-direction:column;gap:6px">
          ${heading(92)}${bar('100%', 5, faint)}${bar('88%', 5, faint)}${bar('62%', 5, faint)}
        </div>
      </div>`,

    promotion: () => `
      <div style="margin:14px ${pad}px 4px;padding:14px 16px;border-radius:${d.radius.card}px;background:${mix(p.surface, p.accent, 0.16)};display:flex;align-items:center;justify-content:space-between;gap:14px">
        <div style="flex:1;display:flex;flex-direction:column;gap:6px">
          ${bar('58%', 8, text)}${bar('40%', 5, faint)}
        </div>
        ${cta}
      </div>`,

    testimonials: () => `
      <div style="padding:16px ${pad}px 4px">
        ${heading(112)}
        <div style="display:flex;gap:${gap}px">
          ${[0, 1, 2].map(() => `
            <div style="flex:1;display:flex;flex-direction:column;gap:6px;padding:10px;border:1px solid ${line};border-radius:${d.radius.card}px">
              ${bar('52%', 5, mix(p.surface, p.accent, 0.7))}
              ${bar('100%', 4, faint)}${bar('76%', 4, faint)}
            </div>`).join('')}
        </div>
      </div>`,
  };

  // Les sections de produits se dessinent toutes de la même façon : ce qui
  // les distingue en ligne est leur contenu, et une maquette n'en a pas.
  const asGrid = ['featured', 'bestsellers', 'new_arrivals', 'catalog', 'bundles'];

  const body = [];
  let used = 0;
  for (const key of sections) {
    if (key === 'announcement' || key === 'hero') continue;
    const render = asGrid.includes(key) ? draw.grid : draw[key];
    if (!render) continue;
    body.push(render());
    // Deux sections après la bannière suffisent à remplir le cadre ; une
    // troisième serait coupée en deux par le bord et ne dirait plus rien.
    used += 1;
    if (used >= 3) break;
  }

  const announcement = sections.includes('announcement')
    ? `<div style="height:15px;background:${p.primary};display:flex;align-items:center;justify-content:center">
         ${bar('158px', 4, mix(p.primary, p.surface, 0.55))}
       </div>`
    : '';

  const hero = sections.includes('hero') ? (heroes[d.hero] ?? heroes.card) : '';

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{margin:0;padding:0;box-sizing:border-box}
    html,body{width:${W}px;height:${H}px;overflow:hidden}
    body{background:${p.surface};font-size:0;-webkit-font-smoothing:antialiased}
  </style></head><body>
    ${announcement}${header}${hero}${body.join('')}
  </body></html>`;
}

// ── Le rendu ────────────────────────────────────────────────────────────────

(async () => {
  const ids = process.argv.slice(2);
  const targets = ids.length ? ids : DEFAULT_IDS;

  fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch({
    channel: 'msedge',
    args: ['--disable-dev-shm-usage'],
  });
  const context = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: SCALE,
  });
  const page = await context.newPage();

  for (const id of targets) {
    await page.setContent(build(id), { waitUntil: 'domcontentloaded' });
    const png = await page.screenshot({ type: 'png' });
    const file = path.join(OUT, `${id}.webp`);
    await sharp(png)
      .resize(W, H, { fit: 'cover' })
      .webp({ quality: 88 })
      .toFile(file);
    const { size } = fs.statSync(file);
    console.log(`${id.padEnd(12)} ${file}  ${(size / 1024).toFixed(1)} ko`);
  }

  await browser.close();
})();
