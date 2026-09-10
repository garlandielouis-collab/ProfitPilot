// ─────────────────────────────────────────────────────────────────────────────
// Charger un module TypeScript du dépôt depuis un script Node
//
// Les outils de `scripts/` qui fabriquent quelque chose À PARTIR du code —
// le catalogue SQL des gabarits, leurs vignettes — doivent lire les tableaux
// qui font autorité (`registry.ts`, `storeDesign.ts`, `storeTheme.ts`) et non
// une copie recopiée à la main. Une copie diverge au premier changement de
// nom, en silence, et personne ne s'en aperçoit avant qu'un marchand voie
// deux libellés différents pour le même gabarit.
//
// Le dépôt n'a ni `ts-node` ni `esbuild` ; il a `typescript`. On pose donc un
// crochet minimal sur `require` : chaque `.ts`/`.tsx` est transpilé en
// CommonJS à la volée, sans vérification de types — c'est `npm run typecheck`
// qui vérifie, pas cet outil.
//
// Les chemins d'import du dépôt sont tous relatifs : aucun alias à résoudre.
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const EXTENSIONS = ['.ts', '.tsx'];

function compile(module_, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.React,
      esModuleInterop: true,
    },
  });
  module_._compile(outputText, filename);
}

for (const ext of EXTENSIONS) {
  require.extensions[ext] = compile;
}

/** Charge un module du dépôt par son chemin relatif à la racine. */
function load(relative) {
  return require(path.join(__dirname, '..', relative));
}

module.exports = { load };
