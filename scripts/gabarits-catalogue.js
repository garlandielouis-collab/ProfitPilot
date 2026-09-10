// ─────────────────────────────────────────────────────────────────────────────
// Fabrique la migration qui remet `store_templates` en accord avec le registre
//
//   node scripts/gabarits-catalogue.js supabase/migrations/<date>_xxx.sql
//
// Le registre (`components/store/templates/registry.ts`) fait autorité : c'est
// lui que l'éditeur, l'aperçu et la vitrine lisent. La table `store_templates`
// est une table de référence publique — lisible par `anon` — que plus personne
// ne lit côté code. Elle ne doit pas pour autant CONTREDIRE le produit : elle
// annonçait encore trois gabarits actifs (luxe, modern, flash) qui sont
// justement les trois retirés de la création.
//
// D'où cet outil plutôt qu'un fichier écrit à la main : recopier vingt-deux
// libellés à la main, c'est garantir qu'ils divergeront au premier changement
// de nom. Ici, la migration se regénère.
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs');
const path = require('path');
const { load } = require('./ts-require');

const { TEMPLATES, TEMPLATE_LIST } = load('components/store/templates/registry.ts');

/** Une chaîne SQL, ou NULL. */
function lit(value) {
  if (value === null || value === undefined || value === '') return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

/** Un TEXT[] SQL. */
function arr(values) {
  return `ARRAY[${values.map(lit).join(',')}]`;
}

// L'ordre d'affichage de la table est celui de l'éditeur, pour que quiconque
// lise la table retrouve la liste que le marchand voit. Les gabarits non
// proposés passent derrière, dans l'ordre du registre.
const order = new Map(TEMPLATE_LIST.map((t, i) => [t.id, i + 1]));
const rows = Object.values(TEMPLATES).sort(
  (a, b) => (order.get(a.id) ?? 900) - (order.get(b.id) ?? 900),
);

const values = rows
  .map((t, i) => {
    const sort = order.get(t.id) ?? 900 + i;
    return (
      `  (${lit(t.id)}, ${lit(t.name)}, ${lit(t.tagline)}, ${lit(t.family)},\n` +
      `   ${arr(t.bestFor)},\n` +
      `   ${lit(t.preview)}, ${t.offered ? 'TRUE' : 'FALSE'}, ${sort})`
    );
  })
  .join(',\n');

const offered  = rows.filter((t) => t.offered).length;
const retired  = rows.length - offered;
const previews = rows.filter((t) => t.preview).length;

const sql = `-- ─────────────────────────────────────────────────────────────────────────────
-- Le catalogue des gabarits, remis en accord avec le produit
--
-- FICHIER GÉNÉRÉ — ne pas modifier à la main.
--   node scripts/gabarits-catalogue.js supabase/migrations/<ce fichier>
--
-- ── Ce qui n'allait pas ─────────────────────────────────────────────────────
--
-- \`store_templates\` a été semée en septembre avec trois gabarits : luxe,
-- modern, flash. Ce sont exactement les trois que le produit ne propose PLUS à
-- la création. La table publique — \`GRANT SELECT ... TO anon\` — annonçait donc
-- trois gabarits retirés comme seuls gabarits actifs, et ignorait les
-- ${offered} réellement offerts.
--
-- ── Où vit la vérité ────────────────────────────────────────────────────────
--
-- Dans \`components/store/templates/registry.ts\`, et nulle part ailleurs :
-- c'est ce fichier que lisent l'éditeur (\`/boutique/builder\`), l'aperçu
-- (\`/apercu/[template]\`) et la vitrine. Aucune ligne de code ne lit
-- \`store_templates\` aujourd'hui.
--
-- Cette table reste néanmoins la référence PUBLIQUE du catalogue. Une table de
-- référence qui contredit le produit est pire qu'une table absente : le jour
-- où quelque chose la lira — un site vitrine, un export, un tableau de bord
-- d'administration — elle donnera une réponse fausse sans prévenir. On la
-- remet donc en accord, et on note ici la règle : **le registre change, une
-- migration suit.** L'outil ci-dessus la regénère en une commande.
--
-- ── Ce que la migration fait ────────────────────────────────────────────────
--
--   1. Ajoute \`family\`, le groupe sous lequel l'éditeur range le gabarit.
--   2. Insère les ${rows.length} gabarits du registre (${offered} proposés, ${retired} historiques).
--   3. Passe les ${retired} historiques à \`is_active = FALSE\` — sans les supprimer :
--      des vitrines en production portent leur identifiant, et \`template_id\`
--      est du texte libre sans clé étrangère. Les retirer de la table ne
--      casserait rien aujourd'hui, mais effacerait la trace de ce que ces
--      boutiques-là portent.
--   4. Ne touche pas à \`description\` : c'est une colonne héritée que le
--      registre ne remplit plus (il porte \`tagline\` et \`highlights\`). Les
--      trois lignes historiques gardent la prose qu'elles avaient.
--
-- ${previews} des ${rows.length} gabarits ont une maquette dans \`preview_image\`.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE store_templates
  ADD COLUMN IF NOT EXISTS family TEXT NOT NULL DEFAULT 'rayon';

COMMENT ON COLUMN store_templates.family IS
  'metier | marque | rayon | historique — le groupe sous lequel l''éditeur range le gabarit.';

INSERT INTO store_templates
  (id, name, tagline, family, best_for, preview_image, is_active, sort_order)
VALUES
${values}
ON CONFLICT (id) DO UPDATE SET
  name          = EXCLUDED.name,
  tagline       = EXCLUDED.tagline,
  family        = EXCLUDED.family,
  best_for      = EXCLUDED.best_for,
  preview_image = EXCLUDED.preview_image,
  is_active     = EXCLUDED.is_active,
  sort_order    = EXCLUDED.sort_order;

-- Un gabarit qui aurait été semé par une migration antérieure et qui ne serait
-- plus dans le registre ne doit pas rester proposé. Il n'est pas supprimé —
-- une vitrine peut le porter — il est désactivé.
UPDATE store_templates
   SET is_active = FALSE
 WHERE id NOT IN (${rows.map((t) => lit(t.id)).join(', ')});
`;

const out = process.argv[2];
if (!out) {
  process.stdout.write(sql);
} else {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, sql, 'utf8');
  console.log(`${out} — ${rows.length} gabarits (${offered} proposés, ${retired} historiques)`);
}
