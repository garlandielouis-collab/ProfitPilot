#!/usr/bin/env node
/**
 * Diagnostic Supabase — répond en 3 secondes à « pourquoi le login ne marche pas ? »
 *
 *   npm run check:supabase
 *
 * Vérifie, dans l'ordre :
 *   1. les variables d'environnement sont présentes
 *   2. les clés (JWT) appartiennent bien au projet pointé par l'URL
 *   3. le nom de domaine du projet se résout (DNS)
 *   4. l'API auth répond
 */

const fs  = require('fs');
const dns = require('dns').promises;
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const RED = '\x1b[31m', GREEN = '\x1b[32m', YELLOW = '\x1b[33m', DIM = '\x1b[2m', OFF = '\x1b[0m';

const ok   = (m) => console.log(`${GREEN}✓${OFF} ${m}`);
const bad  = (m) => console.log(`${RED}✗${OFF} ${m}`);
const warn = (m) => console.log(`${YELLOW}!${OFF} ${m}`);
const hint = (m) => console.log(`  ${DIM}${m}${OFF}`);

function loadEnv() {
  const env = {};
  for (const file of ['.env.local', '.env']) {
    const p = path.join(ROOT, file);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const i = line.indexOf('=');
      if (i > 0 && !line.trim().startsWith('#')) {
        const key = line.slice(0, i).trim();
        if (!(key in env)) env[key] = line.slice(i + 1).trim();
      }
    }
  }
  return env;
}

function jwtPayload(token) {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
  } catch {
    return null;
  }
}

(async () => {
  console.log('\n── Diagnostic Supabase ────────────────────────────────\n');

  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // 1. Variables présentes
  if (!url || !key) {
    bad('Variables manquantes dans .env.local');
    hint('NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY sont requis.');
    process.exit(1);
  }
  ok('Variables présentes');

  let host;
  try {
    host = new URL(url).hostname;
  } catch {
    bad(`URL invalide : ${url}`);
    process.exit(1);
  }
  const urlRef = host.split('.')[0];

  // 2. Cohérence clé ↔ URL
  const payload = jwtPayload(key);
  if (!payload) {
    bad("La clé anon n'est pas un JWT valide");
  } else if (payload.ref !== urlRef) {
    bad(`La clé appartient au projet "${payload.ref}" mais l'URL pointe vers "${urlRef}"`);
    hint(`Corrigez NEXT_PUBLIC_SUPABASE_URL en https://${payload.ref}.supabase.co`);
    process.exit(1);
  } else {
    ok(`Clé et URL cohérentes (projet ${urlRef})`);
    if (payload.exp * 1000 < Date.now()) bad('…mais la clé est expirée — régénérez-la.');
  }

  // 3. DNS
  try {
    const { address } = await dns.lookup(host);
    ok(`DNS résolu : ${host} → ${address}`);
  } catch (err) {
    bad(`DNS : ${host} est introuvable (${err.code})`);
    console.log('');
    hint('Le projet Supabase est en pause, supprimé, ou le ref est erroné.');
    hint('1. Ouvrez https://supabase.com/dashboard');
    hint(`2. Cherchez le projet "${urlRef}"`);
    hint('   • présent et « Paused » → cliquez sur Restore, attendez ~2 min');
    hint('   • absent → il a été supprimé : créez-en un nouveau, rejouez');
    hint('     les migrations de supabase/migrations/, puis mettez à jour');
    hint('     NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY / SERVICE_ROLE_KEY');
    console.log('');
    process.exit(1);
  }

  // 4. API auth
  try {
    const res = await fetch(`${url}/auth/v1/health`, {
      headers: { apikey: key },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) ok(`API auth joignable (HTTP ${res.status})`);
    else {
      warn(`API auth : HTTP ${res.status}`);
      if (res.status === 401 || res.status === 403) hint('Clé anon refusée — régénérez-la dans Settings → API.');
      if (res.status >= 500) hint('Projet en pause ou incident Supabase — voir status.supabase.com');
    }
  } catch (err) {
    bad(`API auth injoignable : ${err.message}`);
    process.exit(1);
  }

  console.log(`\n${GREEN}Configuration Supabase opérationnelle.${OFF}\n`);
})();
