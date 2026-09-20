// ─────────────────────────────────────────────────────────────────────────────
// Les photographies de bannière, une par gabarit
//
//   node scripts/gabarits-photos.js                  # les 23 gabarits
//   node scripts/gabarits-photos.js traiteur agri    # ceux-là seulement
//   node scripts/gabarits-photos.js --pick tech 3    # prendre le 3ᵉ candidat
//   node scripts/gabarits-photos.js --list food      # voir les candidats
//   node scripts/gabarits-photos.js --pick chic:band 2   # un seul emploi
//
// ── Pourquoi des photographies ─────────────────────────────────────────────
//
// Les compositions abstraites de `gabarits-art.js` habillent une page sans
// mentir sur rien, mais elles ne font pas ce qu'une bannière fait : donner
// envie. Une boutique en ligne se juge en une seconde sur son premier écran, et
// une seconde ne suffit pas à lire un dégradé.
//
// ── Ce que ces photos sont, et ce qu'elles ne sont pas ─────────────────────
//
// Ce sont des IMAGES DE DÉPART, au sens où tous les créateurs de sites en
// livrent avec leurs thèmes : elles montrent un rayon, une matière, un métier —
// jamais LA boutique du marchand. Trois règles les tiennent :
//
//   1. L'image du marchand passe toujours devant (`lib/storeArt.ts`). Dès qu'il
//      téléverse sa bannière, la photo de gabarit disparaît.
//   2. L'éditeur le dit en toutes lettres, à l'endroit où il pose sa photo.
//      Une image de départ qu'on prendrait pour la sienne serait un mensonge ;
//      une image de départ annoncée comme telle est un point de départ.
//   3. Aucune ne porte de marque, d'enseigne, de prix ni de texte. Une vitrine
//      photographiée avec le nom d'un autre commerce sur la devanture ferait
//      exactement ce que le produit s'interdit.
//
// Et jamais de photo de PRODUIT : le catalogue est le seul endroit où une image
// engage un achat, et celles-là n'appartiennent qu'au marchand.
//
// ── D'où elles viennent ─────────────────────────────────────────────────────
//
// D'Unsplash, sous licence Unsplash : usage commercial libre, sans attribution
// obligatoire, modification permise. Le crédit du photographe est tout de même
// enregistré dans `credits.json` — il ne coûte rien, et il permet de retrouver
// l'origine d'une image le jour où quelqu'un le demande.
//
// La recherche est faite ici, pas à l'exécution : la vitrine d'un marchand ne
// doit jamais dépendre d'un service tiers pour afficher sa bannière. Les
// fichiers sont dans le dépôt, servis par nous.
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { load } = require('./ts-require');

const { TEMPLATES } = load('components/store/templates/registry.ts');

const OUT = path.join(__dirname, '..', 'public', 'gabarits', 'photo');
const MANIFEST = path.join(__dirname, '..', 'lib', 'storeArtManifest.ts');
const CREDITS = path.join(OUT, 'credits.json');

/**
 * Les cadres livrés : la bannière large, le panneau vertical, et — pour les
 * gabarits dont la promotion est une photo à côté du texte (« split ») — le
 * panneau de la promotion.
 */
const FORMATS = {
  hero:  { w: 1600, h: 900 },
  story: { w: 1000, h: 1250 },
  band:  { w: 1200, h: 800 },
};

/**
 * Ce que chaque gabarit cherche.
 *
 * La requête décrit le MÉTIER, pas une esthétique : un traiteur veut une table
 * dressée, un éleveur une basse-cour. Là où une personne est au cadre, la
 * requête le dit — une vitrine haïtienne dont la bannière ne montre que des
 * visages européens dit au visiteur qu'elle n'a pas été faite pour lui.
 */
const QUERIES = {
  proximite:   'black woman shopping bags boutique street',
  social:      'young black woman smartphone fashion colorful',
  artisan:     'artisan hands workshop handmade jewelry',
  services:    'black professional consulting meeting office',
  agri:        'poultry farm chickens countryside',
  traiteur:    'catering buffet table dishes celebration',
  wellness:    'vitamins capsules white background wellness',
  skincare:    'skincare serum bottle natural botanical',
  animalerie:  'happy dog and cat pet',
  magazine:    'fashion editorial studio model',
  sport:       'athlete training gym effort',
  maker:       'handmade weaving craft workshop hands',
  naturel:     'botanical herbs natural ingredients',
  monoproduit: 'single product bottle studio minimal',
  retail:      'modern retail store shelves interior',
  fashion:     'clothing rack boutique interior',
  beauty:      'cosmetics makeup products flat lay',
  tech:        'electronics gadgets desk technology',
  food:        'fresh market vegetables produce',
  luxe:        'perfume bottle luxury minimal elegant',
  modern:      'minimal boutique interior shelves neutral',
  flash:       'colorful sneakers accessories flat lay',
  // Une photo PAR EMPLOI : la maquette de « Style Chic » montre trois images
  // différentes — un portrait en bannière, une cliente en boutique pour
  // l'histoire, un second portrait dans la promotion. Choisies à l'œil sur
  // planche et épinglées par identifiant : le rang d'un résultat de
  // recherche change d'un mois à l'autre, l'identifiant jamais.
  chic: {
    // La bannière pose son texte à gauche : le portrait est retourné pour que
    // le visage passe à droite, et cadré par le haut pour garder la tête.
    hero:  { photo: 'x9R5l5eU020', query: 'african woman sunglasses fashion', crop: 'top', flop: true },
    // La cliente est à gauche de l'image : le cadre vertical se centre sur elle.
    story: { photo: 'zoWuHiPJYHc', query: 'boutique clothing store interior', crop: 'focalpoint&fp-x=0.44&fp-y=0.5' },
    band:  { photo: 'lj8ev5hDVLk', query: 'african woman sunglasses fashion' },
  },
};

/** Les emplois d'un gabarit et leur requête. Une chaîne vaut pour les deux premiers. */
function queriesFor(id) {
  const q = QUERIES[id];
  if (!q) return null;
  return typeof q === 'string' ? { hero: q, story: q } : q;
}

// ── Unsplash ────────────────────────────────────────────────────────────────

/** Une photo précise, par son identifiant Unsplash. */
async function photoById(id) {
  const res = await fetch(`https://unsplash.com/napi/photos/${id}`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`photo « ${id} » : HTTP ${res.status}`);
  const r = await res.json();
  // Unsplash+ n'est pas sous licence Unsplash : payante, jamais dans le dépôt.
  if (r.premium) throw new Error(`photo « ${id} » : Unsplash+, licence payante`);
  return {
    id:     r.id,
    raw:    r.urls?.raw,
    alt:    r.alt_description ?? '',
    author: r.user?.name ?? '',
    link:   r.links?.html ?? `https://unsplash.com/photos/${r.id}`,
  };
}

async function search(query) {
  const url = `https://unsplash.com/napi/search/photos?query=${encodeURIComponent(query)}&per_page=24`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`recherche « ${query} » : HTTP ${res.status}`);
  const json = await res.json();

  return (json.results ?? [])
    // Une bannière est large. Une photo verticale, recadrée en 16/9, ne garde
    // qu'une bande du sujet — et c'est en général la mauvaise.
    .filter((r) => r.width / r.height >= 1.3)
    // Unsplash+ se mêle aux résultats gratuits : sa licence est payante, et
    // ses photos n'ont rien à faire dans le dépôt.
    .filter((r) => !r.premium)
    .map((r) => ({
      id:     r.id,
      raw:    r.urls?.raw,
      alt:    r.alt_description ?? '',
      author: r.user?.name ?? '',
      link:   r.links?.html ?? `https://unsplash.com/photos/${r.id}`,
    }))
    .filter((r) => r.raw);
}

async function download(raw, { w, h }, crop = 'entropy') {
  // `fit=crop&crop=entropy` : Unsplash recadre sur la zone la plus dense de
  // l'image plutôt qu'au centre. Sur une photo de rayon, c'est la différence
  // entre le rayon et le plafond.
  const url = `${raw}&w=${w}&h=${h}&fit=crop&crop=${crop}&q=85&fm=jpg`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`téléchargement : HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// ── Le manifeste ────────────────────────────────────────────────────────────
//
// La vitrine ne peut pas interroger le disque à chaque rendu : elle lit cette
// liste, écrite ici. Un gabarit absent retombe sur sa composition dessinée —
// une page sans bannière ne doit jamais être la conséquence d'un fichier
// manquant.

function writeManifest(ids, withBand) {
  const sorted = [...ids].sort();
  const body = sorted.map((id) => `  '${id}',`).join('\n');
  const band = [...withBand].sort().map((id) => `  '${id}',`).join('\n');
  const source = `// ─────────────────────────────────────────────────────────────────────────────
// FICHIER GÉNÉRÉ — ne pas modifier à la main.
//   node scripts/gabarits-photos.js
//
// Les gabarits qui ont une photographie de bannière dans \`public/gabarits/photo\`.
// Ceux qui n'y sont pas retombent sur leur composition dessinée : une bannière
// absente ne doit jamais être la conséquence d'un fichier qui manque.
// ─────────────────────────────────────────────────────────────────────────────

export const TEMPLATES_WITH_PHOTO: readonly string[] = [
${body}
];

export function hasPhoto(templateId: string): boolean {
  return TEMPLATES_WITH_PHOTO.includes(templateId);
}

/** Ceux qui ont AUSSI une photographie de promotion (\`<id>-band.webp\`). */
export const TEMPLATES_WITH_BAND_PHOTO: readonly string[] = [
${band}
];

export function hasBandPhoto(templateId: string): boolean {
  return TEMPLATES_WITH_BAND_PHOTO.includes(templateId);
}
`;
  fs.writeFileSync(MANIFEST, source, 'utf8');
}

// ── Le rendu ────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const listAt = args.indexOf('--list');
  const pickAt = args.indexOf('--pick');

  if (listAt >= 0) {
    const [id, slot] = args[listAt + 1].split(':');
    const queries = queriesFor(id);
    const q = (queries && (queries[slot] ?? queries.hero)) ?? id;
    const candidates = await search(typeof q === 'string' ? q : q.query);
    candidates.slice(0, 12).forEach((c, i) => console.log(`${i + 1}. ${c.id}  ${c.alt.slice(0, 70)}`));
    return;
  }

  // `--pick <gabarit> <rang>` : le premier résultat n'est pas toujours le bon,
  // et c'est l'œil qui trie. Le rang choisi est enregistré dans les crédits,
  // pour que la prochaine exécution reprenne la même photo.
  // `--pick chic:band 2` ne vise qu'un emploi d'un gabarit à requêtes séparées.
  const picks = {};
  if (pickAt >= 0) picks[args[pickAt + 1]] = Number(args[pickAt + 2]) || 1;

  const previous = fs.existsSync(CREDITS) ? JSON.parse(fs.readFileSync(CREDITS, 'utf8')) : {};
  // Les deux arguments de `--pick` ne sont pas des gabarits à traiter — mais
  // ils ne sont à écarter QUE si l'option est là : sans elle, `pickAt` vaut −1
  // et les deux premiers gabarits de la ligne de commande disparaissaient.
  const skip = pickAt >= 0 ? [pickAt, pickAt + 1, pickAt + 2] : [];
  const ids = args.filter((a, i) => !a.startsWith('--') && !skip.includes(i))
    .concat(pickAt >= 0 ? [args[pickAt + 1].split(':')[0]] : [])
    .filter((id, i, all) => all.indexOf(id) === i);
  const targets = ids.length ? ids : Object.keys(TEMPLATES);

  fs.mkdirSync(OUT, { recursive: true });
  const credits = { ...previous };

  for (const id of targets) {
    const query = QUERIES[id];
    if (!query) throw new Error(`aucune requête pour le gabarit « ${id} »`);

    // Un gabarit à requêtes séparées : une photo par emploi, chacune avec son
    // rang et son crédit.
    if (typeof query !== 'string') {
      const before = previous[id]?.slots ?? {};
      const slots = {};
      for (const [slot, q] of Object.entries(query)) {
        const pinned = typeof q === 'object' && !picks[`${id}:${slot}`] && !picks[id];
        const text = typeof q === 'string' ? q : q.query;
        const rank = pinned ? null : picks[`${id}:${slot}`] ?? picks[id] ?? before[slot]?.rank ?? 1;
        let chosen;
        if (pinned) {
          chosen = await photoById(q.photo);
        } else {
          const candidates = await search(text);
          if (candidates.length === 0) throw new Error(`aucune photo pour « ${text} »`);
          chosen = candidates[Math.min(rank, candidates.length) - 1];
        }
        const jpg = await download(chosen.raw, FORMATS[slot], q.crop);
        const file = path.join(OUT, `${id}-${slot}.webp`);
        // `flop` : le miroir horizontal, que la licence Unsplash permet.
        await sharp(jpg).flop(Boolean(q.flop)).webp({ quality: 76, effort: 5 }).toFile(file);
        const { size } = fs.statSync(file);
        console.log(`${(id + '-' + slot).padEnd(22)} ${(size / 1024).toFixed(0).padStart(4)} ko  ${chosen.alt.slice(0, 46)}`);
        slots[slot] = {
          rank, query: text, photo: chosen.id, alt: chosen.alt,
          author: chosen.author, link: chosen.link, source: 'Unsplash',
        };
      }
      credits[id] = { slots };
      continue;
    }

    const rank = picks[id] ?? 1;
    const candidates = await search(query);
    if (candidates.length === 0) throw new Error(`aucune photo pour « ${query} »`);
    const chosen = candidates[Math.min(rank, candidates.length) - 1];

    for (const [slot, format] of Object.entries(FORMATS)) {
      const jpg = await download(chosen.raw, format);
      const file = path.join(OUT, `${id}-${slot}.webp`);
      await sharp(jpg).webp({ quality: 76, effort: 5 }).toFile(file);
      const { size } = fs.statSync(file);
      console.log(`${(id + '-' + slot).padEnd(22)} ${(size / 1024).toFixed(0).padStart(4)} ko  ${chosen.alt.slice(0, 46)}`);
    }

    credits[id] = {
      rank,
      query,
      photo:  chosen.id,
      alt:    chosen.alt,
      author: chosen.author,
      link:   chosen.link,
      source: 'Unsplash',
    };
  }

  fs.writeFileSync(CREDITS, `${JSON.stringify(credits, null, 2)}\n`, 'utf8');
  writeManifest(
    Object.keys(credits),
    Object.keys(credits).filter((id) => credits[id].slots?.band),
  );
  console.log(`\n${targets.length} gabarits — crédits dans ${path.relative(process.cwd(), CREDITS)}`);
}

main();
