import type { Config } from 'tailwindcss';
import { themeColors } from './theme.config';

// ─────────────────────────────────────────────────────────────────────────────
// ProfitPilot — Tokens d'interface
//
// Ce fichier est le point de passage obligé de l'audit (§4.3, §4.4, §3.2, §3.4).
// Les échelles par défaut de Tailwind y sont REDÉFINIES, pas seulement étendues :
// c'est ce qui fait migrer mécaniquement les ~1 800 classes déjà écrites dans
// l'application vers le système, sans réécrire chaque fichier.
//
//   Typographie  14 tailles → 4 rôles (+ 1 variante montants)   §4.3
//   Graisses      6         → 2                                  §4.3
//   Ombres        6 niveaux → 2 tokens                           §3.2
//   Rayons        7         → 3                                  §3.4
//   Espacement    grille de 8 (4 pour les micro-ajustements)     §4.4
// ─────────────────────────────────────────────────────────────────────────────

// ── Typographie : 4 tailles ──────────────────────────────────
// Plancher absolu 13 px : sous cette taille, un texte n'existe pas en plein
// soleil sur un Android d'entrée de gamme (§5.2). Il est promu, ou supprimé.
const NOTE: [string, { lineHeight: string }]   = ['0.8125rem', { lineHeight: '1.125rem' }];  // 13 — mentions
const BODY: [string, { lineHeight: string }]   = ['0.9375rem', { lineHeight: '1.375rem' }];  // 15 — corps
const CARD: [string, { lineHeight: string }]   = ['1.0625rem', { lineHeight: '1.5rem'   }];  // 17 — titre de carte
const SCREEN: [string, { lineHeight: string }] = ['1.375rem',  { lineHeight: '1.75rem'  }];  // 22 — titre d'écran

// ── Ombres : 2 seulement ─────────────────────────────────────
// Une carte qui a besoin d'une ombre dure pour se détacher manque de contraste ;
// l'ombre ne ferait que le masquer (§3.2).
const SHADOW_CARD = '0 1px 2px rgba(15,23,42,0.04), 0 4px 12px rgba(15,23,42,0.05)';
const SHADOW_POP  = '0 2px 4px rgba(15,23,42,0.06), 0 16px 40px rgba(15,23,42,0.14)';

const config: Config = {
  darkMode: 'class',
  content: ['./app/**/*.{js,ts,jsx,tsx}', './components/**/*.{js,ts,jsx,tsx}'],
  theme: {
    // ── Espacement — grille de 8 points ──────────────────────
    // Les quatre crans hors grille de Tailwind sont ramenés sur la grille.
    // Un seul édit ici corrige les ~1 070 valeurs fautives comptées dans le
    // code (py-2.5, gap-1.5, mt-0.5, py-3.5…) sans toucher aux écrans.
    extend: {
      spacing: {
        '0.5': '0.25rem',   // 2  → 4
        '1.5': '0.5rem',    // 6  → 8
        '2.5': '0.75rem',   // 10 → 12
        '3.5': '1rem',      // 14 → 16
        '4.5': '1.25rem',   // 18 → 20
        '13':  '3.25rem',   // 52 — hauteur de cible confortable
        'touch': '2.75rem', // 44 — cible tactile minimale (§5.9)
        'nav':   '4.5rem',  // 72 — hauteur de la barre de navigation mobile
      },

      colors: themeColors,

      fontFamily: {
        sans:    ['var(--font-inter)', 'Inter', 'system-ui', 'sans-serif'],
        display: ['var(--font-jakarta)', 'Plus Jakarta Sans', 'Inter', 'system-ui', 'sans-serif'],
        // Chasse fixe pour les montants : « 1 111 HTG » et « 8 888 HTG »
        // occupent la même largeur, la carte ne saute plus (§4.3).
        amount:  ['var(--font-inter)', 'Inter', 'system-ui', 'sans-serif'],
      },

      // ── Rayons : 3 ───────────────────────────────────────────
      borderRadius: {
        control: '0.5rem',    //  8 — petits contrôles
        surface: '0.75rem',   // 12 — cartes, feuilles, champs
        pill:    '9999px',    //      pastilles et étiquettes
      },

      boxShadow: {
        card: SHADOW_CARD,
        pop:  SHADOW_POP,
        nav:  '0 -1px 0 0 rgba(226,232,240,1)',
      },

      transitionTimingFunction: {
        // Une seule courbe pour toute l'application : entrées et sorties se
        // reconnaissent d'un écran à l'autre.
        pp: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      transitionDuration: {
        press: '90ms',    // retour au doigt — sous les 100 ms exigés (§3.7)
        move:  '220ms',   // transitions d'écran
        moment:'680ms',   // les six moments chorégraphiés (§7)
      },
    },

    // ── Redéfinitions (hors `extend`) : elles remplacent l'échelle Tailwind ──

    fontSize: {
      // Les quatre rôles, nommés par leur usage.
      note:   NOTE,
      body:   BODY,
      card:   CARD,
      screen: SCREEN,

      // Variante montants — toujours associée à `.amount` (chasse fixe).
      amount:      ['1.375rem', { lineHeight: '1.5rem'  }],   // 22
      'amount-lg': ['1.75rem',  { lineHeight: '1.875rem'}],   // 28

      // Alias hérités : les classes déjà écrites retombent sur les 4 rôles.
      xs:     NOTE,     // 696 usages — toutes les mentions
      sm:     BODY,     // 773 usages — le corps de l'application
      base:   BODY,
      lg:     CARD,
      xl:     SCREEN,
      '2xl':  SCREEN,

      // Tailles d'affichage — réservées aux pages publiques (landing, prix).
      // Interdites dans le produit : un écran a UN titre, en 22 px.
      '3xl': ['1.75rem', { lineHeight: '2rem'    }],
      '4xl': ['2.25rem', { lineHeight: '2.5rem'  }],
      '5xl': ['3rem',    { lineHeight: '3.25rem' }],
      '6xl': ['3.75rem', { lineHeight: '4rem'    }],
    },

    // ── Graisses : 2 ─────────────────────────────────────────
    // La hiérarchie se fait par la taille et la couleur, pas par six graisses.
    fontWeight: {
      normal:    '400',
      medium:    '400',
      semibold:  '700',
      bold:      '700',
      extrabold: '700',
      black:     '700',
    },

    // ── Rayons : 3, alias hérités compris ────────────────────
    borderRadius: {
      none:    '0',
      control: '0.5rem',
      sm:      '0.5rem',
      md:      '0.5rem',
      DEFAULT: '0.75rem',
      surface: '0.75rem',
      lg:      '0.75rem',
      xl:      '0.75rem',
      '2xl':   '0.75rem',
      '3xl':   '1rem',      // pages publiques uniquement
      pill:    '9999px',
      full:    '9999px',
    },

    // ── Ombres : 2, alias hérités compris ────────────────────
    boxShadow: {
      none:    'none',
      card:    SHADOW_CARD,
      sm:      SHADOW_CARD,
      DEFAULT: SHADOW_CARD,
      md:      SHADOW_CARD,
      pop:     SHADOW_POP,
      lg:      SHADOW_POP,
      xl:      SHADOW_POP,
      '2xl':   SHADOW_POP,
      inner:   'inset 0 1px 2px rgba(15,23,42,0.06)',
      nav:     '0 -1px 0 0 rgba(226,232,240,1)',
    },
  },
  plugins: [],
};

export default config;
