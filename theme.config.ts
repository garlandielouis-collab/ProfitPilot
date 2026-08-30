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

const DANGER: Scale = {
  DEFAULT: '#DC2626',
  50: '#FDECEC', 100: '#FBD5D5', 200: '#F7ADAD', 300: '#F08585',
  400: '#DC2626', 500: '#DC2626', 600: '#C41F1F', 700: '#A11818',
  800: '#7E1414', 900: '#5C0F0F', 950: '#340808',
};

const SUCCESS: Scale = {
  DEFAULT: '#0E9F6E',
  50: '#E7F6F0', 100: '#D1F0E4', 200: '#A7E1CB', 300: '#6FCCAC',
  400: '#0E9F6E', 500: '#0E9F6E', 600: '#0C8B60', 700: '#0A6F4D',
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
  };
}


export const themeColors = {
  // ── 30 % — Complémentaire : la structure ───────────────────
  primary:      '#001F3F',   // Bleu marine — texte, titres, éléments structurants
  'primary-h':  '#002D5B',   // survol
  'primary-a':  '#001428',   // enfoncé

  // ── 10 % — Accent : l'action principale ────────────────────
  accent:       '#50C878',   // Émeraude de marque — UN seul par zone d'écran
  'accent-h':   '#3DAA62',
  'accent-a':   '#2E8C50',
  'accent-sub': '#EAF7EF',   // fond de pastille d'accent

  // ── Couleurs système — réservées ───────────────────────────
  // success ≠ émeraude de marque : la confirmation ne doit pas se confondre
  // avec l'appel à l'action (audit §4.2).
  success:      '#0E9F6E',
  'success-sub':'#E7F6F0',
  danger:       '#DC2626',   // erreur · créance en retard · trésorerie en baisse
  'danger-sub': '#FDECEC',
  warning:      '#B45309',   // échéance proche — jamais une alerte
  'warning-sub':'#FDF3E4',
  info:         '#1D4ED8',   // information neutre, non actionnable
  'info-sub':   '#EAF0FD',

  // ── 60 % — Neutres ─────────────────────────────────────────
  white:        '#FFFFFF',
  anthracite:   '#0F172A',
  background:   '#FFFFFF',
  surface:      '#F8FAFC',   // fond de carte
  surface2:     '#F1F5F9',   // fond enfoncé / champ
  border:       '#E2E8F0',
  text:         '#0F172A',
  text2:        '#475569',   // texte secondaire — contraste AA sur blanc
  muted:        '#64748B',   // mentions ; jamais un montant
  'nav-active': '#EAF1F8',

  // ── Neutres — mode sombre ──────────────────────────────────
  'dark-bg':       '#020617',
  'dark-surface':  '#0F172A',
  'dark-surface2': '#1E293B',
  'dark-border':   '#334155',
  'dark-text':     '#F1F5F9',
  'dark-text2':    '#CBD5E1',
  'dark-muted':    '#94A3B8',

  // ── Rattrapage des familles hors palette ───────────────────
  // Voir `outOfPaletteScales` plus haut : les classes déjà écrites
  // (bg-amber-100, text-purple-700, bg-pink-500…) retombent sur la palette.
  ...outOfPaletteScales(),
};

// Teintes des séries de graphiques. Les données sont grises ; SEULE la période
// en cours prend l'accent (audit §6.2). Aucun dégradé dans les données.
export const chartColors = {
  data:    '#94A3B8',   // toutes les périodes sauf celle en cours
  current: '#50C878',   // la période en cours — le seul point d'accent
  down:    '#DC2626',   // une variation qui coûte de l'argent
  axis:    '#CBD5E1',
  grid:    '#EEF2F6',
  tick:    '#64748B',
};
