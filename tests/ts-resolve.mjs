// Node résout les imports ESM à l'extension près ; le code de l'application
// écrit `from './currency'`, comme partout dans un projet TypeScript.
// Ce crochet ajoute l'extension manquante au moment de la résolution.
//
// C'est tout ce qui sépare le code du produit d'un test exécutable : Node 22+
// retire les types lui-même, il ne sait simplement pas deviner l'extension.
export async function resolve(specifier, context, next) {
  const bare = specifier.startsWith('.') && !/\.[cm]?[jt]sx?$/.test(specifier);
  if (bare) {
    for (const suffix of ['.ts', '.tsx', '/index.ts']) {
      try { return await next(specifier + suffix, context); } catch { /* suivant */ }
    }
  }
  return next(specifier, context);
}
