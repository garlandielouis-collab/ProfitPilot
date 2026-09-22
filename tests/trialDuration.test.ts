import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { TRIAL_DAYS, TRIAL_PLAN_KEY, getPlanLabel } from '../lib/plans';

// ─────────────────────────────────────────────────────────────────────────────
// Une seule durée d'essai, et elle sort d'une seule constante.
//
// Le produit a longtemps annoncé trois durées à la fois : 72 heures à
// l'installation et sur l'écran d'essai terminé, 14 jours dans le robot de la
// page d'accueil, 3 jours dans le pied de l'inscription — pendant que
// `lib/trial.ts` en écrivait 30 dans `subscriptions`. Ce n'est pas un défaut
// d'affichage : c'est un chiffre de vente qui contredit ce que le compte reçoit,
// et le marchand qui compte 72 heures revient le quatrième jour croire qu'on
// lui a coupé l'accès.
//
// Ce fichier interdit d'en réécrire une à la main.
// ─────────────────────────────────────────────────────────────────────────────

const RACINES = ['app', 'components', 'hooks', 'lib'];
const EXTENSIONS = ['.ts', '.tsx'];

/** Tous les fichiers de source, sans les dossiers de construction. */
function sources(dir: string, out: string[] = []): string[] {
  for (const nom of readdirSync(dir)) {
    if (nom === 'node_modules' || nom.startsWith('.')) continue;
    const chemin = join(dir, nom);
    if (statSync(chemin).isDirectory()) sources(chemin, out);
    else if (EXTENSIONS.some(e => nom.endsWith(e))) out.push(chemin);
  }
  return out;
}

/** Une ligne de commentaire explique, elle n'est jamais servie au marchand. */
function estCommentaire(ligne: string): boolean {
  const t = ligne.trimStart();
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*');
}

const DUREE = String.raw`\d+\s*(?:h\b|heures?|èdtan|jours?\b|jou\b|days?\b)`;
const ESSAI = String.raw`essai|esè|trial|gratuit|gratis`;

// « 72 heures d'essai », et « essai de 72 heures » : les deux ordres.
const EN_DUR = [
  new RegExp(String.raw`(?:${ESSAI})[^\n]{0,40}?${DUREE}`, 'i'),
  new RegExp(String.raw`${DUREE}[^\n]{0,30}?(?:${ESSAI})`, 'i'),
];

describe("la durée de l'essai n'est écrite qu'à un seul endroit", () => {
  test('aucun écran ne l’annonce avec un nombre en dur', () => {
    const fautes: string[] = [];

    for (const racine of RACINES) {
      for (const fichier of sources(racine)) {
        const lignes = readFileSync(fichier, 'utf8').split(/\r?\n/);
        lignes.forEach((ligne, i) => {
          if (estCommentaire(ligne)) return;
          if (EN_DUR.some(r => r.test(ligne))) {
            fautes.push(`${fichier}:${i + 1} — ${ligne.trim().slice(0, 120)}`);
          }
        });
      }
    }

    assert.deepEqual(
      fautes,
      [],
      `Durée d'essai écrite en dur. Utiliser \`TRIAL_DAYS\` (lib/plans.ts) :\n${fautes.join('\n')}`,
    );
  });

  test('la constante reste celle que le compte reçoit vraiment', () => {
    // `lib/trial.ts` écrit `TRIAL_DAYS` dans `subscriptions`, et
    // `hooks/useSubscription.ts` en déduit ses heures : une seule source.
    assert.equal(typeof TRIAL_DAYS, 'number');
    assert.ok(TRIAL_DAYS > 0);
  });

  test("l'offre de l'essai porte un nom que le marchand voit ailleurs", () => {
    // Le pied de l'inscription promettait « 3 jours Premium » — une offre qui
    // n'existe nulle part dans `PLAN_LABELS`.
    const nom = getPlanLabel(TRIAL_PLAN_KEY);
    assert.notEqual(nom, 'Essai gratuit', "l'offre d'essai doit être une offre connue");
    assert.ok(['Esansyel', 'Kwasans', 'Elit'].includes(nom));
  });
});
