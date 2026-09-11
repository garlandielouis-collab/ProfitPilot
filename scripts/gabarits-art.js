// ─────────────────────────────────────────────────────────────────────────────
// Les images de gabarit
//
//   node scripts/gabarits-art.js              # les 22 gabarits, 4 images chacun
//   node scripts/gabarits-art.js tech food    # ceux-là seulement
//   node scripts/gabarits-art.js --slot hero  # un seul emploi
//
// ── Pourquoi cet outil existe ───────────────────────────────────────────────
//
// Une vitrine neuve n'a aucune photo. Le marchand vient de créer sa boutique :
// pas de bannière, rien derrière son histoire, rien sous sa bande d'appel. Ces
// endroits-là tombaient sur un aplat de couleur — correct, et exactement ce qui
// faisait qu'une page ressemblait à un gabarit vide plutôt qu'à une boutique.
//
// ── Ce que ces images sont ──────────────────────────────────────────────────
//
// Des compositions ABSTRAITES : des masses de couleur, des courbes, de la
// lumière. Aucune ne montre une boutique, un atelier, un plat, un produit, un
// visage ni un lieu. Ce n'est pas une limite de l'outil, c'est la règle du
// produit — une photo de vitrine posée par défaut donnerait à voir un commerce
// qui n'est pas celui du marchand, au même titre qu'un chiffre d'affaires
// inventé sur son tableau de bord.
//
// Et jamais, sous aucun emploi, une image de produit : le catalogue est le seul
// endroit de la vitrine où une image engage un achat.
//
// ── D'où viennent les formes ────────────────────────────────────────────────
//
// De la palette du gabarit (`brandPresetFor`) et de sa direction artistique
// (`designFor`) : le rayon des angles, la lumière, la densité. Chaque gabarit
// reçoit en plus un MOTIF — arcs, strates, halo, trame — choisi pour ce qu'il
// vend. Deux gabarits ne peuvent donc pas rendre la même image, et une image ne
// peut pas contredire la page qu'elle habille.
//
// ── Quatre emplois ──────────────────────────────────────────────────────────
//
//   hero   1600×900   la bannière : sombre, du texte clair se pose dessus
//   band   1600×600   les bandes larges : appel final, promotion, vidéo
//   story  1000×1250  « notre histoire » : claire, verticale
//   tile     800×800  la vignette d'un rayon sans photo
//
// ── Trois pièges de palette, et comment ils sont tenus ─────────────────────
//
// Les vingt-deux palettes ne se ressemblent pas, et une composition écrite pour
// l'une casse sur l'autre. Trois cas réels :
//
//   « Sport » a une SURFACE presque noire. Une forme claire tirée de la surface
//   y était invisible. Les formes de lumière ne viennent donc pas de la palette
//   mais du blanc sur les fonds sombres, et de l'encre sur les fonds clairs.
//
//   « Mode éditoriale » a un ACCENT noir, égal à sa couleur de structure. Une
//   lueur d'accent sur un fond sombre n'y éclairait rien. L'accent est donc
//   éclairci — ou assombri sur fond clair — jusqu'à ce qu'il se voie.
//
//   Un fond clair ne supporte pas les mêmes opacités qu'un fond sombre : ce qui
//   donne une masse élégante sur du noir donne une tache sur du crème. D'où le
//   coefficient `k`, appliqué à toutes les opacités de structure.
//
// ── Comment ─────────────────────────────────────────────────────────────────
//
// Edge déjà installé pilote le rendu — aucun navigateur téléchargé, comme
// `verification/pp_shots.js` et `gabarits-vignettes.js` — à deux fois la taille finale ;
// `sharp` encode en WebP.
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { chromium } = require('playwright-core');
const { load } = require('./ts-require');

const { designFor } = load('lib/storeDesign.ts');
const { brandPresetFor } = load('lib/storeTheme.ts');
const { TEMPLATES } = load('components/store/templates/registry.ts');

const OUT = path.join(__dirname, '..', 'public', 'gabarits', 'art');
const SCALE = 2;

/** Les quatre emplois, et la place qu'ils occupent à l'écran. */
const SLOTS = {
  hero:  { w: 800, h: 450, tone: 'dark'  },
  band:  { w: 800, h: 300, tone: 'deep'  },
  story: { w: 500, h: 625, tone: 'light' },
  tile:  { w: 400, h: 400, tone: 'pale'  },
};

// ── Couleur ─────────────────────────────────────────────────────────────────

function hex(c) {
  const s = String(c || '#000000').replace('#', '');
  const full = s.length === 3 ? s.split('').map((x) => x + x).join('') : s;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) || 0);
}

/**
 * Le mélange de deux couleurs, rendu en HEXADÉCIMAL.
 *
 * Il rendait `rgb(…)`, et c'était un piège : `hex()`, `lum()` et `alpha()`
 * lisent de l'hexadécimal. Une couleur mélangée puis repassée à l'une d'elles
 * ressortait donc noire et de luminance nulle — les masses d'ombre étaient
 * toutes noires quelle que soit la palette, et le plafond de luminance des
 * bandes ne se déclenchait jamais. Le format de sortie n'est pas un détail
 * d'écriture ici : c'est la seule chose qui garde la chaîne cohérente.
 */
function mix(a, b, ratio) {
  const [ar, ag, ab] = hex(a);
  const [br, bg, bb] = hex(b);
  const m = (x, y) => Math.round(x + (y - x) * ratio).toString(16).padStart(2, '0');
  return `#${m(ar, br)}${m(ag, bg)}${m(ab, bb)}`;
}

function alpha(c, a) {
  const [r, g, b] = hex(c);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, a)).toFixed(3)})`;
}

/** La luminance relative, celle du calcul de contraste. */
function lum(c) {
  const [r, g, b] = hex(c).map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** La saturation, au sens HSV : 0 pour un gris, 1 pour une couleur pure. */
function sat(c) {
  const [r, g, b] = hex(c);
  const max = Math.max(r, g, b);
  return max === 0 ? 0 : (max - Math.min(r, g, b)) / max;
}

/**
 * L'accent, rendu visible sur le fond qu'il éclaire.
 *
 * « Mode éditoriale » a un accent noir, égal à sa couleur de structure : sur
 * une bannière sombre, il ne dessinait rien. On l'éclaircit.
 *
 * Mais on ne touche PAS à un accent sombre et coloré — le fuchsia de la
 * boutique de proximité, le rouge du traiteur. Les éclaircir les délavait en
 * rose poussiéreux : la couleur de la marque partait, et c'est justement la
 * seule chose que ces images ont à porter. Un accent saturé se voit sur un fond
 * sombre même quand sa luminance est basse ; un gris, non.
 */
function visibleGlow(accent, onDark) {
  const l = lum(accent);
  if (onDark  && l < 0.20 && sat(accent) < 0.3) return mix(accent, '#FFFFFF', 0.55);
  if (!onDark && l > 0.62 && sat(accent) < 0.3) return mix(accent, '#000000', 0.4);
  return accent;
}

/**
 * Un fond assombri jusqu'à ce que du texte clair y tienne.
 *
 * La bande d'appel et la bannière de promotion portent du texte clair. Or le
 * fond de bande se construit en poussant la couleur de structure vers l'accent
 * — et l'accent d'un gabarit de sport est un citron vif : la bande devenait un
 * aplat clair sur lequel le texte blanc de la page disparaissait.
 *
 * On plafonne donc la luminance du fond. Le résultat garde la teinte de la
 * marque et perd seulement ce qui la rendait illisible.
 */
function darkenTo(color, maxLum) {
  let out = color;
  for (let i = 0; i < 12 && lum(out) > maxLum; i += 1) out = mix(out, '#000000', 0.12);
  return out;
}

/**
 * Le sol et les trois encres d'un motif.
 *
 *   base / lift / deep   le dégradé de fond, tiré de la couleur de structure
 *   glow                 ce qui éclaire — l'accent, rendu visible
 *   soft                 ce qui structure — blanc sur fond sombre, encre sinon
 *   k                    le coefficient d'opacité de ce fond
 */
function colorsFor(palette, tone) {
  const { primary, accent, surface2, ink } = palette;
  const onDark = tone === 'dark' || tone === 'deep';

  // Chaque emploi porte ses formes à sa propre intensité. Ce n'est pas un
  // réglage esthétique : une bannière est un tableau de 900 pixels de haut sur
  // lequel une accroche se pose en grand, une bande d'appel fait 600 pixels et
  // porte une phrase entière, une image d'histoire vit à côté d'un texte, une
  // vignette de rayon derrière un nom. Au même contraste, la bande dévore son
  // texte et la vignette dévore le nom du rayon.
  const INTENSITY = {
    dark:  { k: 1,    glow: 1   },
    deep:  { k: 0.6,  glow: 0.7 },
    light: { k: 0.42, glow: 0.9 },
    pale:  { k: 0.3,  glow: 0.6 },
  }[tone];

  const common = {
    onDark,
    glow: visibleGlow(accent, onDark),
    soft: onDark ? '#FFFFFF' : ink,
    k:    INTENSITY.k,
    kGlow: INTENSITY.glow,
  };

  if (tone === 'dark') {
    return {
      ...common,
      base: darkenTo(mix(primary, '#000000', 0.08), 0.06),
      lift: darkenTo(mix(primary, accent, 0.18), 0.12),
      deep: '#000000',
    };
  }
  if (tone === 'deep') {
    return {
      ...common,
      base: darkenTo(mix(primary, accent, 0.28), 0.075),
      lift: darkenTo(mix(primary, accent, 0.52), 0.14),
      deep: mix(primary, '#000000', 0.4),
    };
  }
  if (tone === 'light') {
    return {
      ...common,
      base: surface2,
      lift: mix(surface2, accent, 0.14),
      deep: mix(primary, surface2, 0.5),
    };
  }
  return {
    ...common,
    base: mix(surface2, '#FFFFFF', 0.4),
    lift: mix(surface2, accent, 0.08),
    deep: mix(primary, surface2, 0.68),
  };
}

/**
 * Les trois pinceaux d'un motif.
 *
 * Un motif ne nomme jamais une couleur : il demande de la lumière (`G`), de la
 * structure (`S`) ou de l'ombre (`D`), à telle intensité. C'est ce qui lui
 * permet de tenir sur les vingt-deux palettes sans être réécrit, et c'est ce
 * qui manquait à la première version — écrite pour une palette claire, elle
 * rendait des images vides sur les quatre gabarits sombres.
 */
function pens(c) {
  return {
    G: (a) => alpha(c.glow, a * c.kGlow),
    S: (a) => alpha(c.soft, a * c.k),
    D: (a) => alpha(c.deep, a * (c.onDark ? 1 : 0.5)),
  };
}

// ── Les motifs ──────────────────────────────────────────────────────────────
//
// Douze compositions, en pourcentages : la même fonction sert pour une bannière
// en 16/9 et pour une vignette carrée.
//
// Une règle tenue partout : au plus UNE forme nette de la couleur d'accent. Le
// reste est de la lumière — des masses floutées, des dégradés qui s'éteignent.
// Deux aplats saturés côte à côte donnent une bannière publicitaire, pas une
// image de marque.

const MOTIFS = {
  // Une lumière qui monte d'un point — la promesse, le bien-être, l'unique.
  halo: ({ G, S, D }) => `
    <i style="position:absolute;left:52%;top:36%;width:86%;aspect-ratio:1;transform:translate(-50%,-50%);
      border-radius:999px;background:${G(0.42)};filter:blur(72px)"></i>
    <i style="position:absolute;left:52%;top:38%;width:26%;aspect-ratio:1;transform:translate(-50%,-50%);
      border-radius:999px;background:${G(0.5)};filter:blur(24px)"></i>
    <i style="position:absolute;left:52%;top:38%;width:52%;aspect-ratio:1;transform:translate(-50%,-50%);
      border-radius:999px;border:1px solid ${S(0.18)}"></i>
    <i style="position:absolute;left:0;right:0;bottom:0;height:52%;
      background:linear-gradient(${D(0)}, ${D(0.72)})"></i>`,

  // Des arcs concentriques : le mouvement, la répétition d'un geste.
  arcs: ({ G, S }) => `
    ${[1.34, 1.06, 0.8, 0.56].map((s, i) => `
      <i style="position:absolute;right:-16%;bottom:-48%;width:${s * 98}%;aspect-ratio:1;border-radius:999px;
        border:${i === 1 ? 2 : 1}px solid ${i === 1 ? G(0.55) : S(0.2)}"></i>`).join('')}
    <i style="position:absolute;right:-10%;bottom:-34%;width:52%;aspect-ratio:1;border-radius:999px;
      background:radial-gradient(circle at 40% 34%, ${G(0.5)}, ${G(0)} 70%);filter:blur(10px)"></i>
    <i style="position:absolute;left:6%;top:10%;width:26%;height:2px;background:${S(0.28)}"></i>`,

  // Des colonnes : la collection, la série, le rayon qui s'aligne.
  columns: ({ G, S }) => `
    ${[[3, 9, 88], [15, 6, 62], [25, 15, 94], [44, 5, 50], [54, 12, 80], [70, 7, 96], [81, 15, 68]]
      .map(([left, w, h], i) => {
        const on = i === 4;
        return `<i style="position:absolute;left:${left}%;${i % 2 ? 'bottom:-6%' : 'top:-4%'};
          width:${w}%;height:${h}%;
          background:linear-gradient(${i % 2 ? '180deg' : '0deg'},
            ${on ? G(0.46) : S(0.24)}, ${on ? G(0) : S(0)})"></i>`;
      }).join('')}
    <i style="position:absolute;left:0;right:0;top:0;height:100%;
      background:radial-gradient(80% 60% at 20% 30%, ${G(0.16)}, transparent 70%)"></i>`,

  // Des strates : la terre, la matière, ce qui se dépose avec le temps.
  strata: ({ G, S }) => `
    ${[[0, 17, 0.14], [21, 9, 0.24], [33, 21, 0.08], [57, 6, 0.55], [65, 13, 0.14], [82, 18, 0.26]]
      .map(([top, h, a], i) => `
        <i style="position:absolute;left:-4%;right:-4%;top:${top}%;height:${h}%;
          background:linear-gradient(90deg, ${i === 3 ? G(a) : S(a)}, ${i === 3 ? G(a * 0.25) : S(a * 0.22)})"></i>`).join('')}
    <i style="position:absolute;left:0;right:0;top:56.4%;height:1px;background:${S(0.4)}"></i>
    <i style="position:absolute;inset:0;background:radial-gradient(90% 70% at 78% 22%, ${G(0.2)}, transparent 68%)"></i>`,

  // Un maillage flou : le soin, la texture, ce qui se fond.
  mesh: ({ G, S, D }) => `
    <i style="position:absolute;left:-12%;top:-24%;width:72%;aspect-ratio:1;border-radius:999px;
      background:${G(0.5)};filter:blur(60px)"></i>
    <i style="position:absolute;right:-18%;top:12%;width:68%;aspect-ratio:1;border-radius:999px;
      background:${S(0.34)};filter:blur(66px)"></i>
    <i style="position:absolute;left:20%;bottom:-36%;width:68%;aspect-ratio:1;border-radius:999px;
      background:${D(0.5)};filter:blur(58px)"></i>
    <i style="position:absolute;left:30%;top:26%;width:40%;aspect-ratio:1;border-radius:999px;
      border:1px solid ${S(0.18)}"></i>`,

  // Une trame : la précision, la comparaison, la fiche technique.
  grid: ({ G, S }) => `
    <i style="position:absolute;left:36%;top:20%;width:58%;aspect-ratio:1;border-radius:999px;
      background:${G(0.36)};filter:blur(58px)"></i>
    <i style="position:absolute;inset:0;background:
      repeating-linear-gradient(90deg, ${S(0.14)} 0 1px, transparent 1px 10%),
      repeating-linear-gradient(0deg, ${S(0.14)} 0 1px, transparent 1px 16.6%);
      -webkit-mask-image:linear-gradient(118deg, #000 6%, transparent 72%)"></i>
    <i style="position:absolute;left:60%;top:33.2%;width:10%;height:16.6%;background:${G(0.5)}"></i>
    <i style="position:absolute;left:20%;top:16.6%;width:30%;height:49.8%;border:1px solid ${S(0.22)}"></i>
    <i style="position:absolute;left:20%;top:66.4%;width:50%;height:1px;background:${S(0.3)}"></i>`,

  // Des diagonales : la vitesse, la campagne, l'éditorial.
  diagonal: ({ G, S, D }) => `
    <i style="position:absolute;inset:-30%;background:repeating-linear-gradient(
      34deg, ${S(0.18)} 0 1.5%, transparent 1.5% 9%)"></i>
    <i style="position:absolute;inset:-30%;background:linear-gradient(
      34deg, transparent 40%, ${G(0.5)} 40%, ${G(0.5)} 42.5%, transparent 42.5%);filter:blur(1px)"></i>
    <i style="position:absolute;right:-10%;top:-20%;width:52%;aspect-ratio:1;border-radius:999px;
      background:${G(0.24)};filter:blur(52px)"></i>
    <i style="position:absolute;inset:0;background:linear-gradient(124deg, ${D(0.6)} 4%, transparent 58%)"></i>`,

  // Un éventail : l'effort, la performance, l'élan.
  fan: ({ G, S }) => `
    ${Array.from({ length: 11 }, (_, i) => `
      <i style="position:absolute;left:6%;bottom:-14%;width:${i === 5 ? 3 : 1.6}%;height:150%;
        transform-origin:50% 100%;transform:rotate(${6 + i * 7.5}deg);
        background:linear-gradient(${i === 5 ? G(0) : S(0)}, ${i === 5 ? G(0.66) : S(0.3)})"></i>`).join('')}
    <i style="position:absolute;left:-10%;bottom:-32%;width:48%;aspect-ratio:1;border-radius:999px;
      background:${G(0.34)};filter:blur(48px)"></i>
    <i style="position:absolute;right:6%;top:12%;width:22%;height:1px;background:${S(0.3)}"></i>`,

  // Des terrasses : le commerce qui s'organise, le rayon qui s'empile.
  terraces: ({ G, S, D }, k) => `
    <i style="position:absolute;left:-16%;top:-24%;width:62%;aspect-ratio:1;border-radius:999px;
      background:${D(0.55)};filter:blur(44px)"></i>
    ${[[-18, -30, 92, 118, 0.12], [2, -22, 54, 92, 0.55], [30, 6, 46, 70, 0.14]]
      .map(([right, bottom, w, h, a], i) => `
        <i style="position:absolute;right:${right}%;bottom:${bottom}%;width:${w}%;height:${h}%;
          border-radius:${k}px;transform:rotate(${i === 1 ? -11 : -3}deg);
          background:linear-gradient(150deg, ${i === 1 ? G(a) : S(a)}, ${i === 1 ? G(a * 0.2) : S(a * 0.16)})"></i>`).join('')}`,

  // Des vagues : l'artisanat, la main, ce qui n'est pas droit.
  waves: ({ G, S }) => `
    <i style="position:absolute;right:2%;top:4%;width:32%;aspect-ratio:1;border-radius:999px;
      background:${S(0.2)};filter:blur(28px)"></i>
    ${[[-34, -64, 168, 118, 0.16], [-18, -50, 150, 96, 0.12], [-6, -40, 132, 82, 0.4]]
      .map(([left, bottom, w, h, a], i) => `
        <i style="position:absolute;left:${left}%;bottom:${bottom}%;width:${w}%;height:${h}%;border-radius:50%;
          background:linear-gradient(160deg, ${i === 2 ? G(a) : S(a)}, ${i === 2 ? G(a * 0.24) : S(a * 0.2)})"></i>`).join('')}`,

  // Des anneaux : le luxe, la mesure, le vide assumé.
  rings: ({ G, S }) => `
    <i style="position:absolute;left:56%;top:16%;width:42%;aspect-ratio:1;border-radius:999px;
      background:${G(0.26)};filter:blur(44px)"></i>
    <i style="position:absolute;left:50%;top:8%;width:56%;aspect-ratio:1;border-radius:999px;
      border:1px solid ${S(0.42)}"></i>
    <i style="position:absolute;left:34%;top:36%;width:36%;aspect-ratio:1;border-radius:999px;
      border:2px solid ${G(0.58)}"></i>
    <i style="position:absolute;left:4%;top:14%;width:24%;aspect-ratio:1;border-radius:999px;
      background:${S(0.16)};filter:blur(12px)"></i>
    <i style="position:absolute;left:8%;bottom:14%;width:34%;height:1px;background:${S(0.3)}"></i>`,

  // Une pluie de points : le flux social, l'abondance, le mouvement rapide.
  dots: ({ G, S }) => `
    <i style="position:absolute;inset:0;background:radial-gradient(${S(0.42)} 1.6px, transparent 1.8px);
      background-size:22px 22px;-webkit-mask-image:linear-gradient(155deg, #000 4%, transparent 76%)"></i>
    <i style="position:absolute;right:0%;top:2%;width:48%;aspect-ratio:1;border-radius:999px;
      background:${G(0.44)};filter:blur(42px)"></i>
    <i style="position:absolute;right:16%;top:18%;width:14%;aspect-ratio:1;border-radius:999px;
      background:${G(0.55)};filter:blur(8px)"></i>`,
};

/**
 * Le motif de chaque gabarit.
 *
 * Il n'est pas décoratif : il dit la même chose que la page. Un prestataire
 * reçoit une trame — la méthode, l'organisation ; un artisan des vagues — la
 * main, l'irrégularité ; une marque de sport un éventail — l'élan. Le jour où
 * un gabarit change de propos, c'est ici qu'il change d'image.
 */
const MOTIF_OF = {
  proximite: 'terraces', social: 'dots',      artisan: 'waves',     services: 'grid',
  agri:      'strata',   traiteur: 'arcs',
  wellness:  'halo',     skincare: 'mesh',    animalerie: 'dots',   magazine: 'diagonal',
  sport:     'fan',      maker:    'waves',   naturel: 'strata',    monoproduit: 'halo',
  retail:    'terraces', fashion:  'columns', beauty: 'mesh',       tech: 'grid',
  food:      'arcs',
  luxe:      'rings',    modern:   'diagonal', flash: 'fan',
};

// ── La page rendue ──────────────────────────────────────────────────────────

function build(templateId, slot) {
  const { w, h, tone } = SLOTS[slot];
  const design  = designFor(templateId);
  const palette = brandPresetFor(templateId).palette;
  const c       = colorsFor(palette, tone);
  const motif   = MOTIFS[MOTIF_OF[templateId] ?? 'terraces'];

  // Le rayon des angles vient du gabarit : une marque de mode aux angles vifs
  // n'a pas des masses arrondies dans son image ; un commerce de proximité aux
  // cartes très arrondies, si.
  const radius = Math.round((design.radius?.card ?? 12) * 1.8);

  // Un fond plat sous des formes plates donne une image morte. Le sol est donc
  // lui-même un dégradé — éclairci d'un côté, creusé de l'autre.
  // Le sol d'un fond clair ne descend pas jusqu'à la couleur de structure : il
  // s'y teinte à peine. Une histoire de marque se lit sur du clair, et un
  // dégradé qui finit dans le sombre ramène le regard en bas de l'image.
  const floor = c.onDark ? c.deep : mix(c.base, c.deep, 0.28);
  const ground = `linear-gradient(148deg, ${c.lift} 0%, ${c.base} 52%, ${floor} 100%)`;

  // Le voile : franc sur les fonds sombres, où du texte clair se pose ; à peine
  // marqué sur les fonds clairs, qui n'en portent pas.
  const vignette = c.onDark
    ? `radial-gradient(130% 106% at 34% 44%, transparent 24%, ${alpha('#000000', 0.42)} 100%)`
    : `radial-gradient(130% 106% at 50% 40%, transparent 50%, ${alpha('#000000', 0.07)} 100%)`;

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{margin:0;padding:0;box-sizing:border-box}
    html,body{width:${w}px;height:${h}px;overflow:hidden}
    body{background:${ground};position:relative;font-size:0}
    i{display:block}
  </style></head><body>
    ${motif(pens(c), radius)}
    <i style="position:absolute;inset:0;background:${vignette}"></i>
  </body></html>`;
}

// Rendu réutilisable : une planche de contrôle peut dessiner les douze motifs
// côte à côte pour les comparer d'un coup d'œil.
module.exports = { build, MOTIFS, MOTIF_OF, SLOTS, colorsFor, pens };

// ── Le rendu ────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const slotArg = args.indexOf('--slot');
  const slots = slotArg >= 0 ? [args[slotArg + 1]] : Object.keys(SLOTS);
  const ids = args.filter((a, i) => !a.startsWith('--') && i !== slotArg + 1);
  const targets = ids.length ? ids : Object.keys(TEMPLATES);

  for (const slot of slots) {
    if (!SLOTS[slot]) throw new Error(`emploi inconnu : ${slot}`);
  }

  fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch({ channel: 'msedge', args: ['--disable-dev-shm-usage'] });
  let total = 0;

  for (const slot of slots) {
    const { w, h } = SLOTS[slot];
    const context = await browser.newContext({
      viewport: { width: w, height: h },
      deviceScaleFactor: SCALE,
    });
    const page = await context.newPage();

    for (const id of targets) {
      if (!TEMPLATES[id]) throw new Error(`gabarit inconnu : ${id}`);
      await page.setContent(build(id, slot), { waitUntil: 'domcontentloaded' });
      const png = await page.screenshot({ type: 'png' });
      const file = path.join(OUT, `${id}-${slot}.webp`);
      await sharp(png).webp({ quality: 78, effort: 5 }).toFile(file);
      const { size } = fs.statSync(file);
      console.log(`${(id + '-' + slot).padEnd(24)} ${(size / 1024).toFixed(1)} ko`);
      total += size;
    }

    await context.close();
  }

  await browser.close();
  console.log(`\n${targets.length * slots.length} images — ${(total / 1024 / 1024).toFixed(2)} Mo`);
}

if (require.main === module) main();
