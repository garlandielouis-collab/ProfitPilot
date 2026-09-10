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

// ── Typographie : 4 tailles — l'échelle du §12, à la lettre ──────────────────
//
// « Échelle cible de ProfitPilot, quatre tailles : 12 (métadonnées : dates,
//   mentions), 14 (corps : lignes de liste, descriptions), 16 (contenu
//   important : montants de liste, libellés de boutons), 24 (titres d'écran).
//   Plus 32 pour l'unique montant héro du tableau de bord. »
//
// L'échelle précédente — 13 / 15 / 17 / 22 — était un compromis : plancher
// relevé d'un point pour le plein soleil, titre abaissé de deux. Elle respectait
// le NOMBRE de tailles mais aucune de ses VALEURS. Or le §12 ne donne pas une
// fourchette, il donne quatre nombres ; et une échelle inventée, même
// raisonnable, redevient un jugement personnel — exactement ce que « UI is not
// art » (§5) demande de retirer du travail.
//
// Ce que le passage change vraiment : le corps descend de 15 à 14 et les
// mentions de 13 à 12, mais le titre d'écran monte de 22 à 24. L'écart entre la
// plus petite et la plus grande passe de 9 à 12 points : la hiérarchie se lit
// MIEUX, pas moins bien. Le §12 le dit autrement — « quand le texte ne rentre
// pas, on raccourcit le texte, on ne rétrécit pas la police » — et c'est le
// titre, pas la mention, qui porte cette hiérarchie.
//
// Les 12 px sont désormais le plancher du produit. Le §12 les autorise
// explicitement pour les métadonnées ; les deux seuls refuges SOUS 12 qu'il
// concède — labels d'onglets et pastille de notification — restent inutilisés.
//
// Interlignes : la règle du §13 (1,3 à 1,4 × la taille), arrondie au multiple
// de 4 pour que le rythme vertical retombe sur la grille du §1. Le corps de 14
// prend 20, la valeur que le cours donne lui-même en exemple.
const NOTE: [string, { lineHeight: string }]   = ['0.75rem', { lineHeight: '1rem'   }];  // 12/16 — mentions, dates
const BODY: [string, { lineHeight: string }]   = ['0.875rem',{ lineHeight: '1.25rem'}];  // 14/20 — corps
const CARD: [string, { lineHeight: string }]   = ['1rem',    { lineHeight: '1.5rem' }];  // 16/24 — contenu important
const SCREEN: [string, { lineHeight: string }] = ['1.5rem',  { lineHeight: '2rem'   }];  // 24/32 — titre d'écran

// ── Ombres : 2 seulement, et la recette du §24 ───────────────
// « L'ombre par défaut est toujours laide. » La recette de la masterclass, à la
// lettre : couleur = l'accent assombri, jamais du noir pur ; X = 0 ; blur = 2×Y
// (Y 4 → blur 8) ; spread légèrement négatif ; opacité ajustée ensuite.
//
// Ces deux ombres étaient teintées anthracite (15,23,42) — le gris neutre que
// le §15 chasse par ailleurs du texte — et leur flou ne suivait aucune règle
// (1/2, puis 4/12, puis 16/40). Elles sont désormais marine (0,31,63), la
// couleur de la marque assombrie, et leur géométrie se lit d'un coup d'œil.
//
// Le spread négatif est ce qui empêche l'ombre de « baver » sous la carte : elle
// se resserre à l'aplomb de l'objet au lieu de le border.
//
// Une carte qui a besoin d'une ombre dure pour se détacher manque de contraste ;
// l'ombre ne ferait que le masquer (§3.2). D'où le choix, partout où l'écran est
// dense : la bordure fine OU l'ombre, jamais les deux.
const SHADOW_CARD = '0 4px 8px -2px rgba(0,31,63,0.10)';                          // Y 4  · blur 8
const SHADOW_POP  = '0 8px 16px -4px rgba(0,31,63,0.18), 0 2px 4px -1px rgba(0,31,63,0.08)'; // Y 8 · blur 16

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
        // ── Trois hauteurs de bouton, pas plus (masterclass §8) ──────────
        // « Un bouton fait au minimum 40 de haut ; 44 est optimal, 48 mieux
        //   encore, et le cours choisit 56 pour ses actions principales.
        //   Au-delà de 60, le bouton devient grotesque. » La plage utile est
        //   étroite et connue : trois valeurs se retiennent, six se subissent.
        'touch':  '2.75rem', // 44 — cible tactile minimale (§5.9) · contrôle contextuel
        'action': '3rem',    // 48 — action secondaire
        'hero':   '3.5rem',  // 56 — l'action principale de l'écran, une par écran
        'nav':   '4.5rem',  // 72 — hauteur de la barre de navigation mobile
      },

      colors: themeColors,

      // ── Une seule police (masterclass §10) ───────────────────
      // `display` pointait sur une seconde famille (Plus Jakarta Sans) que
      // personne n'utilisait. Les trois alias mènent à Inter : les titres se
      // distinguent par la TAILLE et la GRAISSE, pas par une autre police.
      fontFamily: {
        sans:    ['var(--font-inter)', 'Inter', 'system-ui', 'sans-serif'],
        display: ['var(--font-inter)', 'Inter', 'system-ui', 'sans-serif'],
        // Chasse fixe pour les montants : « 1 111 HTG » et « 8 888 HTG »
        // occupent la même largeur, la carte ne saute plus (§4.3).
        amount:  ['var(--font-inter)', 'Inter', 'system-ui', 'sans-serif'],
      },

      // ── Rayons : 3 ───────────────────────────────────────────
      // ── Rayons : 3, en ÉCHELLE DESCENDANTE (masterclass §23) ───────────
      // « Un élément arrondi DANS un élément arrondi prend un rayon plus petit,
      //   pour que le liseré entre les deux reste uniforme. »
      // La carte (12) contient le contrôle (8) qui contient l'image (4). Jamais
      // égal, jamais l'inverse : deux rayons identiques emboîtés font un liseré
      // qui s'épaissit dans les angles, et c'est ce qui « fait cheap ».
      borderRadius: {
        surface: '0.75rem',   // 12 — cartes, feuilles, modales
        control: '0.5rem',    //  8 — boutons, champs, pastilles
        inner:   '0.25rem',   //  4 — ce qui est POSÉ DANS un contrôle : photo,
                              //      vignette produit, aperçu, code-barres
        pill:    '9999px',    //      étiquettes et pastilles rondes
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
      // Elle REPREND la taille du titre d'écran : le §12 veut quatre tailles,
      // pas quatre tailles plus deux pour les chiffres. Seul l'interligne
      // change, resserré parce qu'un montant tient sur une ligne.
      amount:      ['1.5rem',   { lineHeight: '1.75rem'}],   // 24
      // Le montant héro — 32, une seule fois par écran (masterclass §12).
      // « L'essentiel de l'interface vit entre 12 et 24 ; 32–40 sont réservés
      //   aux informations capitales. » Le montant du jour en est une.
      'amount-lg': ['2rem',     { lineHeight: '2.25rem' }],   // 32 — le héro

      // Alias hérités : les classes déjà écrites retombent sur les 4 rôles.
      xs:     NOTE,     // 696 usages — toutes les mentions
      sm:     BODY,     // 773 usages — le corps de l'application
      base:   BODY,
      lg:     CARD,
      xl:     SCREEN,
      '2xl':  SCREEN,

      // Tailles d'affichage — réservées aux pages publiques (landing, prix).
      // Interdites dans le produit : un écran a UN titre, en 24 px.
      '3xl': ['1.75rem', { lineHeight: '2rem'    }],
      '4xl': ['2.25rem', { lineHeight: '2.5rem'  }],
      '5xl': ['3rem',    { lineHeight: '3.25rem' }],
      '6xl': ['3.75rem', { lineHeight: '4rem'    }],
    },

    // ── Graisses : 2, et une exception nommée (masterclass §11) ──────────
    // « Regular (400) pour tout le contenu, semibold (600) pour les titres, les
    //   montants importants et les libellés de boutons. Bold (700) toléré
    //   uniquement pour le montant héro du tableau de bord. »
    //
    // Les six noms de Tailwind retombaient tous sur 400 ou 700. Deux valeurs
    // dans la configuration, oui — mais UNE SEULE graisse lourde à l'écran, et
    // 1 151 classes la portaient. « Si tout est en gras, rien n'est en gras » :
    // le piège du §11, écrit dans le fichier de tokens.
    //
    // Le 700 quitte donc les alias hérités et devient un token nommé,
    // font-hero, qu'on ne peut plus écrire par distraction.
    fontWeight: {
      normal:    '400',
      medium:    '400',
      semibold:  '600',
      bold:      '600',
      extrabold: '600',
      black:     '600',
      hero:      '700',   // le montant héro, une fois par écran — pas davantage
    },

    // ── Rayons : 3, alias hérités compris, EN ÉCHELLE (masterclass §23) ──
    //
    // Les alias hérités écrasaient la règle qu'ils étaient censés servir :
    // `lg`, `xl` et `2xl` retombaient tous sur 12 px. La carte, le bouton
    // qu'elle contient et la pastille posée dessus portaient donc EXACTEMENT le
    // même rayon — or « un élément arrondi DANS un élément arrondi prend un
    // rayon plus petit, pour que le liseré entre les deux reste uniforme ».
    // Trois rayons dans la configuration ne font pas un système s'ils sont
    // servis à plat.
    //
    // L'échelle, du contenant au contenu :
    //   2xl / 3xl / surface   12   la carte, la feuille, la modale
    //   xl / lg / control      8   ce qu'elle contient : bouton, champ, pastille
    //   md / sm / inner        4   ce qui est posé DEDANS : photo, vignette
    borderRadius: {
      none:    '0',
      inner:   '0.25rem',   //  4 — la photo dans le bouton, la vignette
      sm:      '0.25rem',
      md:      '0.25rem',
      control: '0.5rem',    //  8 — boutons, champs, badges
      lg:      '0.5rem',
      xl:      '0.5rem',
      surface: '0.75rem',   // 12 — cartes, feuilles, modales
      DEFAULT: '0.75rem',
      '2xl':   '0.75rem',
      '3xl':   '0.75rem',
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
