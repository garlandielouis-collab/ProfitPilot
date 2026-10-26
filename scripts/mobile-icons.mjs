// ─────────────────────────────────────────────────────────────────────────────
// npm run mobile:icons — l'icône et l'écran de démarrage Android, depuis le logo
//
// Source : public/profitpilot-logo.png (le P marine et la flèche émeraude, sur
// fond blanc). On en découpe le carré du logo, puis on produit :
//   · les icônes classiques (ic_launcher, ic_launcher_round) des 5 densités ;
//   · le premier plan de l'icône adaptative (Android 8+), logo dans la zone
//     sûre de 66 dp sur 108 ;
//   · le logo de l'écran de démarrage, une seule image en xxhdpi.
// Le fond est blanc : sur un fond marine, le P marine disparaîtrait.
//
// `sharp` est déjà dans le projet (dépendance de Next) : aucune dépendance de
// plus pour ce script, qui ne tourne que sur le poste de développement.
// ─────────────────────────────────────────────────────────────────────────────

import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const SOURCE = 'public/profitpilot-logo.png';
const RES = 'mobile/android/app/src/main/res';
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };

// Le carré du logo dans l'image source (1536 × 1024), mesuré à l'œil sur le
// fichier : le P et la flèche tiennent entre x 440–1075 et y 220–750.
const CROP = { left: 437, top: 167, width: 640, height: 640 };

const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

const mark = () => sharp(SOURCE).extract(CROP);

/** Le logo à `inner` px, centré sur un carré blanc de `size` px. */
async function onWhite(size, inner, round = false) {
  const logo = await mark().resize(inner, inner).png().toBuffer();
  let img = sharp({ create: { width: size, height: size, channels: 4, background: WHITE } })
    .composite([{ input: logo, gravity: 'center' }]);
  if (round) {
    const r = size / 2;
    const mask = Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${r}" cy="${r}" r="${r}"/></svg>`);
    img = sharp(await img.png().toBuffer()).composite([{ input: mask, blend: 'dest-in' }]);
  }
  return img.png({ compressionLevel: 9, palette: true, colors: 64 }).toBuffer();
}

for (const [name, scale] of Object.entries(DENSITIES)) {
  const dir = `${RES}/mipmap-${name}`;
  mkdirSync(dir, { recursive: true });
  const legacy = Math.round(48 * scale);
  const adaptive = Math.round(108 * scale);
  // Icône classique : le logo occupe 80 % du carré.
  await sharp(await onWhite(legacy, Math.round(legacy * 0.8))).toFile(`${dir}/ic_launcher.png`);
  await sharp(await onWhite(legacy, Math.round(legacy * 0.8), true)).toFile(`${dir}/ic_launcher_round.png`);
  // Icône adaptative : 60 % du carré, dans la zone sûre de 66 dp sur 108.
  await sharp(await onWhite(adaptive, Math.round(adaptive * 0.6))).toFile(`${dir}/ic_launcher_foreground.png`);
}

// L'écran de démarrage : 128 dp de logo en xxhdpi (384 px), Android le réduit.
// En PNG à palette : le logo n'a que quelques couleurs, et chaque kilo-octet
// de l'APK se paie en données mobiles au téléchargement.
mkdirSync(`${RES}/drawable-nodpi`, { recursive: true });
await mark().resize(384, 384).png({ compressionLevel: 9, palette: true, colors: 64 }).toFile(`${RES}/drawable-nodpi/splash_logo.png`);

console.log('Icônes et logo de démarrage générés dans', RES);
