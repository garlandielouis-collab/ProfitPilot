// ─────────────────────────────────────────────────────────────────────────────
// ProfitPilot — Palette
//
// Règle 60/30/10 (audit §4.1) :
//   60 %  neutre        → fonds, surfaces de cartes, séparations par l'espace
//   30 %  complémentaire→ bleu marine : texte, titres, structure
//   10 %  accent        → émeraude : l'action principale, un seul point par zone
//
// Rouge et vert vif sont des COULEURS SYSTÈME (audit §4.2) : erreur et succès,
// partout et seulement là. Toute couleur absente de ce fichier est hors palette.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Les familles hors palette, ramenées de force dans la palette (audit §4.2)
//
// « Rose #e91e8c, violet, bleu #0056b3, ambre — usage autorisé : aucun.
//   Ces quatre couleurs sortent de la palette. »
//
// 54 fichiers portaient encore ces classes : bg-amber-100, text-purple-700,
// bg-cyan-500, text-pink-700, bg-orange-50… Les reprendre à la main, c'était
// 54 occasions de se tromper. On redéfinit donc les familles elles-mêmes, une
// seule fois, comme on l'a fait pour les tailles de texte et les ombres :
//
//   ambre · jaune · orange   → warning   une échéance qui approche
//   rouge · rose(rose)       → danger    une erreur, une perte, un retard
//   vert · émeraude · teal   → success   une confirmation, un objectif tenu
//   bleu · ciel · indigo     → info      une information non actionnable
//   violet · pourpre · rose(pink) · fuchsia · cyan → neutre : ces teintes ne
//                                        portaient aucun sens, elles décoraient
//
// Une note sur le cran 400 : le code hérité s'en sert pour du TEXTE sur fond
// blanc (`text-emerald-400`, `text-red-400`). Un 400 clair y serait illisible
// en plein soleil (§5.2) ; chaque famille lui donne donc une valeur lisible.
// ─────────────────────────────────────────────────────────────────────────────

type Scale = Record<string, string>;

const WARNING: Scale = {
  DEFAULT: '#B45309',
  50: '#FDF3E4', 100: '#FAE6C4', 200: '#F3CE90', 300: '#E9B15C',
  400: '#B45309', 500: '#B45309', 600: '#A04A08', 700: '#8A3F07',
  800: '#6E3206', 900: '#522505', 950: '#2F1503',
};

// Rouge BRIQUE, pas rouge vif (masterclass §16). L'émeraude et le rouge vont
// cohabiter sur le même écran — créance en retard à côté d'un encaissement. Deux
// saturations maximales voisines « grésillent » : la frontière devient floue et
// agressive. Le rouge est donc désaturé, il vit en texte et en bordure fine, et
// il ne prend jamais un aplat plein à côté d'un aplat émeraude.
const DANGER: Scale = {
  DEFAULT: '#B23A2F',
  50: '#FBEEEC', 100: '#F6D9D5', 200: '#EBB2AA', 300: '#DC8377',
  400: '#B23A2F', 500: '#B23A2F', 600: '#9C3229', 700: '#822922',
  800: '#68201B', 900: '#4E1814', 950: '#2C0D0B',
};

// Le vert de confirmation, mesuré (masterclass §31). Le #0E9F6E d'origine ne
// donnait que 3,4:1 sur blanc — sous le plancher AA de 4,5:1 — et 3,0:1 sur son
// propre fond clair. C'était la seule paire figure/fond de la palette à échouer,
// et elle portait le message « l'argent est rentré » : celui qu'un marchand lit
// en plein soleil, au comptoir, avant de rendre la monnaie.
//
// « AA obtenu → c'est bon ; en dessous → on ajuste saturation ou luminosité de
//   l'une des deux. » La teinte (158°) et la saturation (84 %) sont conservées à
//   l'identique ; seule la luminosité descend de 34 à 27. Ratios obtenus :
//   5,0:1 sur blanc, 4,5:1 sur le fond de pastille.
const SUCCESS: Scale = {
  DEFAULT: '#0B7F54',
  50: '#E7F6F0', 100: '#D1F0E4', 200: '#A7E1CB', 300: '#6FCCAC',
  400: '#0B7F54', 500: '#0B7F54', 600: '#0A714B', 700: '#096745',
  800: '#08573D', 900: '#063F2D', 950: '#032418',
};

// L'émeraude de marque garde son 500 : c'est l'accent des 10 %.
const BRAND: Scale = {
  DEFAULT: '#50C878',
  50: '#EAF7EF', 100: '#D6EFDF', 200: '#B4E4C7', 300: '#86D3A5',
  400: '#3DAA62', 500: '#50C878', 600: '#3DAA62', 700: '#2E8C50',
  800: '#24703F', 900: '#1B5430', 950: '#0E2C19',
};

const INFO: Scale = {
  DEFAULT: '#1D4ED8',
  50: '#EAF0FD', 100: '#D6E1FB', 200: '#AFC4F6', 300: '#85A4F0',
  400: '#1D4ED8', 500: '#1D4ED8', 600: '#1840B0', 700: '#133389',
  800: '#0E2665', 900: '#0A1C4B', 950: '#071436',
};

// Ce qui ne veut rien dire redevient neutre. Une teinte sans message est du
// bruit : mieux vaut du gris que du violet (§3.6).
const NEUTRAL: Scale = {
  DEFAULT: '#64748B',
  50: '#F8FAFC', 100: '#F1F5F9', 200: '#E2E8F0', 300: '#CBD5E1',
  400: '#64748B', 500: '#64748B', 600: '#475569', 700: '#334155',
  800: '#1E293B', 900: '#0F172A', 950: '#020617',
};

// ── Les gris, teintés marine (masterclass §15) ────────────────────────────────
// « Prendre les gris tout faits du framework : ils sont neutres par
//   construction, donc étrangers à la palette marine/émeraude. »
//
// Le code hérité porte 1 532 classes slate-* : les reprendre à la main, c'est
// 1 532 occasions de se tromper. La famille elle-même est redéfinie, une seule
// fois, sur la teinte 210° du #001F3F — seules la saturation et la luminosité
// varient. Aucun écran n'est touché ; tous changent.
//
// Les crans 400 et 500 sont ceux que le code hérité pose en TEXTE sur fond
// blanc. Ils valent donc 4,8:1 : AA, pas un cran plus clair.
const MARINE_GRAY: Scale = {
  DEFAULT: '#607383',
  50: '#F6F8FA', 100: '#EDF1F5', 200: '#D9E0E8', 300: '#B4C1CE',
  400: '#607383', 500: '#607383', 600: '#4F6274', 700: '#3C4B5A',
  800: '#2A3846', 900: '#1B2836', 950: '#0E1822',
};

// Le bleu marine de la marque, décliné — pour les rares classes numérotées.
const NAVY: Scale = {
  DEFAULT: '#001F3F',
  50: '#EAF1F8', 100: '#D3E1F0', 200: '#A6C0DC', 300: '#6E93BC',
  400: '#002D5B', 500: '#001F3F', 600: '#001B37', 700: '#00162C',
  800: '#001122', 900: '#000C19', 950: '#00060D',
};

function outOfPaletteScales() {
  return {
    emerald: BRAND,
    navy:    NAVY,
    green:   SUCCESS,
    teal:    SUCCESS,
    lime:    SUCCESS,
    red:     DANGER,
    rose:    DANGER,
    amber:   WARNING,
    yellow:  WARNING,
    orange:  WARNING,
    blue:    INFO,
    sky:     INFO,
    indigo:  INFO,
    violet:  NEUTRAL,
    purple:  NEUTRAL,
    fuchsia: NEUTRAL,
    pink:    NEUTRAL,
    cyan:    NEUTRAL,
    // Les gris du framework — neutres par construction, donc étrangers à la
    // marque — retombent sur la teinte marine (§15).
    slate:   MARINE_GRAY,
    gray:    MARINE_GRAY,
    zinc:    MARINE_GRAY,
    neutral: MARINE_GRAY,
    stone:   MARINE_GRAY,
  };
}


export const themeColors = {
  // ── 30 % — Complémentaire : la structure ───────────────────
  primary:      '#001F3F',   // Bleu marine — texte, titres, éléments structurants
  'primary-h':  '#002D5B',   // survol
  'primary-a':  '#001428',   // enfoncé

  // ── 10 % — Accent : l'action principale ────────────────────
  //
  // Le contraste, mesuré (masterclass §31). Le blanc sur l'émeraude de marque
  // donne 2,1:1 — très en dessous du plancher AA de 4,5:1. Ce n'était pas
  // visible sur un écran de bureau ; ça l'est sur un Android à midi, dehors.
  // Le cours pose l'alternative : assombrir le fond, ou passer le texte en
  // marine. ProfitPilot choisit le marine — la couleur de marque reste
  // exactement celle de la marque, et le contraste monte à 7,7:1 (AAA), ce que
  // méritent les boutons qui portent un montant.
  accent:       '#50C878',   // Émeraude de marque — UN seul aplat par écran
  'accent-h':   '#3DAA62',
  'accent-a':   '#2E8C50',
  'accent-ink': '#001F3F',   // le texte POSÉ SUR l'émeraude — 7,7:1
  // L'émeraude assombrie, pour les rares surfaces où le texte doit rester
  // blanc (une pastille sur photo, un graphique imprimé) — 5,3:1.
  'accent-strong': '#1F7A47',
  'accent-sub': '#EAF7EF',   // fond de pastille d'accent, et FOND DU BOUTON
                             // SECONDAIRE : la paire du §21 se fait par la
                             // luminosité d'une seule teinte, pas par une
                             // bordure fantôme illisible au soleil.

  // ── Couleurs système — réservées ───────────────────────────
  // success ≠ émeraude de marque : la confirmation ne doit pas se confondre
  // avec l'appel à l'action (audit §4.2).
  // 5,0:1 sur blanc, 4,5:1 sur son fond — voir SUCCESS plus haut (§31).
  success:      '#0B7F54',
  'success-sub':'#E7F6F0',
  // Rouge BRIQUE (masterclass §16), la même valeur que la famille `red` — un
  // `bg-danger` et un `bg-red-600` voisins doivent être le MÊME rouge, sinon la
  // règle « une couleur, une fonction » (§17) se dilue dans deux rouges.
  // #DC2626 était le rouge vif de Tailwind : posé à côté de l'émeraude, la
  // frontière grésille. Contraste avec le blanc : 5,9:1 (AA).
  danger:       '#B23A2F',   // erreur · créance en retard · trésorerie en baisse
  'danger-sub': '#FBEEEC',
  warning:      '#B45309',   // échéance proche — jamais une alerte
  'warning-sub':'#FDF3E4',
  info:         '#1D4ED8',   // information neutre, non actionnable
  'info-sub':   '#EAF0FD',

  // ── 60 % — Neutres ─────────────────────────────────────────
  white:        '#FFFFFF',
  // « Le noir #000000 saute de la page. » Il n'existe plus comme couleur
  // d'interface : `text-black`, `bg-black` et surtout les vingt-cinq
  // voiles `bg-black/50` des modales deviennent marine — ce que le §30 demande
  // justement pour un voile (« la couleur d'accent assombrie et translucide »).
  black:        '#001F3F',
  anthracite:   '#1B2836',
  background:   '#FFFFFF',
  surface:      '#F6F8FA',   // fond de carte
  surface2:     '#EDF1F5',   // fond enfoncé / champ
  border:       '#D9E0E8',
  // Jamais de noir pur, jamais un gris de framework (masterclass §15). Les trois
  // gris du texte sont TEINTÉS MARINE : même teinte que #001F3F (210°), la
  // saturation et la luminosité seules changent. Un gris neutre de Tailwind ne
  // connaît pas la marque ; posé à côté du marine, il tire vers le violet.
  //
  // La recette du cours descend le texte secondaire à 55–60 de luminosité. À
  // cette valeur il tombe à 2,9:1 sur blanc et échoue AA. Le §31 — « le
  // contraste ne se négocie pas » — l'emporte : la teinte vient du cours, la
  // luminosité vient du vérificateur. Ratios sur blanc : 12,4 · 7,0 · 4,8.
  text:         '#2A3846',   // hsl(210 25% 22%) — le texte principal
  text2:        '#47596B',   // hsl(210 20% 35%) — libellés, texte secondaire
  muted:        '#607383',   // hsl(210 16% 45%) — mentions ; jamais un montant
  'nav-active': '#EAF1F8',

  // ── Neutres — mode sombre ──────────────────────────────────
  'dark-bg':       '#0E1822',
  'dark-surface':  '#1B2836',
  'dark-surface2': '#2A3846',
  'dark-border':   '#3C4B5A',
  'dark-text':     '#EDF1F5',
  'dark-text2':    '#B4C1CE',
  'dark-muted':    '#93A4B4',

  // ── Rattrapage des familles hors palette ───────────────────
  // Voir `outOfPaletteScales` plus haut : les classes déjà écrites
  // (bg-amber-100, text-purple-700, bg-pink-500…) retombent sur la palette.
  ...outOfPaletteScales(),
};

// Teintes des séries de graphiques. Les données sont grises ; SEULE la période
// en cours prend l'accent (audit §6.2). Aucun dégradé dans les données.
export const chartColors = {
  // Le dernier gris neutre du fichier : slate-400, hérité de Tailwind. Sur un
  // graphique posé à côté d'un texte marine, il tire vers le violet (§15).
  data:    '#93A4B4',   // toutes les périodes sauf celle en cours — teinte 210°
  current: '#50C878',   // la période en cours — le seul point d'accent
  down:    '#B23A2F',   // une variation qui coûte de l'argent — brique (§16)
  axis:    '#B4C1CE',
  grid:    '#EDF1F5',
  tick:    '#607383',
};
