// ─────────────────────────────────────────────────────────────────────────────
// npm run mobile:sync — prépare le projet Android avant un build
//
// 1. écrit `mobile/www/app-url.js` : l'adresse que la coque charge, pour que
//    la page « pas de réseau » sache où revenir (elle n'a pas accès à la
//    configuration Capacitor) ;
// 2. lance `cap sync android` : copie `mobile/www` et la configuration dans le
//    projet Android, et branche les modules natifs installés.
//
// L'adresse vient de `CAP_SERVER_URL` (par défaut la production), exactement
// comme dans capacitor.config.ts : les deux ne peuvent pas diverger.
// ─────────────────────────────────────────────────────────────────────────────

import { writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const server = (process.env.CAP_SERVER_URL || 'https://profitpilot-ten.vercel.app').replace(/\/$/, '');
if (!/^https:\/\//.test(server)) {
  console.error(`CAP_SERVER_URL doit commencer par https:// (reçu : ${server})`);
  process.exit(1);
}

writeFileSync(
  'mobile/www/app-url.js',
  `// Généré par scripts/mobile-sync.mjs — ne pas modifier à la main.\nwindow.PP_APP_URL = ${JSON.stringify(`${server}/dashboard`)};\n`,
);
console.log(`Coque → ${server}/dashboard`);

execSync('npx cap sync android', { stdio: 'inherit' });
