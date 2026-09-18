// ─────────────────────────────────────────────────────────────────────────────
// Ce que Pilot AI sait de l'écran d'où on l'appelle
//
// Un chatbot s'ouvre sur un champ vide et demande « Comment puis-je vous
// aider ? ». C'est renvoyer la question au marchand, qui ne l'a pas posée : il
// regardait un écran, quelque chose l'a arrêté, et on lui demande de formuler
// ce qu'il ne comprend pas. La plupart referment la fenêtre.
//
// Un copilote, lui, sait où on l'appelle. Il arrive avec les deux ou trois
// questions que CET écran soulève, écrites à la place du marchand. Cliquer une
// question toute faite ne demande aucune formulation — c'est la différence
// entre une aide qu'on utilise et une aide qu'on ferme.
//
// ── Ce que ce fichier décide, et ce qu'il ne décide pas ──────────────────────
//
// Il décide, pour chaque écran : la phrase de la capsule, les questions
// proposées, et la destination suivante. Il ne rend rien et ne parle à personne
// — d'où sa place dans `lib/` et son test unitaire. Le panneau, lui, envoie ces
// questions à `/api/ai/chat` comme si le marchand les avait tapées.
//
// ── La règle qui tient tout le fichier : ne rien promettre ───────────────────
//
// L'assistant reçoit un résumé chiffré (ventes, dépenses, profit, dettes, stock
// critique, meilleurs produits, trésorerie — voir `buildContextBlock` dans
// `app/api/ai/chat/route.ts`). Une question proposée doit tomber DANS ce
// périmètre. « Explique-moi les droits de ce rôle » se lirait très bien dans
// une capsule et recevrait une réponse inventée, ce qui est pire que pas de
// question du tout : le marchand apprend à ne plus croire les réponses.
//
// Les écrans hors périmètre (réglages, rôles, sécurité, sauvegarde) retombent
// donc sur `DEFAULT`, qui ne promet rien d'autre qu'une conversation.
// ─────────────────────────────────────────────────────────────────────────────

import { isPublicAppPath } from './publicRoutes';

export type PilotRoute = {
  /**
   * Clé stable, indépendante de l'adresse : elle sert de mémoire au « déjà
   * montré » de la capsule. Changer une adresse ne doit pas remontrer à tout le
   * monde une capsule déjà congédiée.
   */
  key:     string;
  /** Ce que le panneau écrit sous « Pilot AI » quand il s'ouvre ici. */
  here:    string;
  /**
   * La phrase de la capsule, au-dessus de la bulle. Une question ou une offre,
   * jamais un slogan : elle doit donner envie d'appuyer, et tenir sur deux
   * lignes à 230 px de large.
   */
  capsule: string;
  /**
   * Les questions proposées, dans l'ordre. Deux ou trois, jamais plus : au-delà,
   * choisir coûte plus que taper.
   */
  prompts: string[];
  /**
   * L'écran d'après. Hérité du guide par page qui vivait dans
   * `components/PilotAIGuide.tsx` : c'était sa meilleure idée — dire où l'on va
   * ensuite — et elle n'avait pas à disparaître avec lui.
   */
  next?:   { label: string; href: string };
};

// ─────────────────────────────────────────────────────────────────────────────
// La table, par préfixe d'adresse
//
// L'ordre n'a aucune importance : la résolution prend le préfixe le PLUS LONG
// qui corresponde, donc `/rapports/comptabilite` gagne toujours sur
// `/rapports`, et `/products/42` hérite de `/products` sans qu'on l'écrive.
// ─────────────────────────────────────────────────────────────────────────────

const ROUTES: Record<string, PilotRoute> = {
  '/dashboard': {
    key:     'dashboard',
    here:    'Votre cockpit',
    capsule: 'Je peux vous aider à comprendre vos chiffres.',
    prompts: [
      'Qu’est-ce qui a changé cette semaine ?',
      'Mon profit est-il bon pour mon volume de ventes ?',
      'Quel est le chiffre que je devrais surveiller en premier ?',
    ],
    next: { label: 'Mes produits', href: '/products' },
  },

  '/products': {
    key:     'products',
    here:    'Vos produits',
    capsule: 'Besoin d’aide pour organiser vos produits ?',
    prompts: [
      'Quels produits me rapportent le plus ?',
      'Sur quels produits ma marge est-elle trop faible ?',
      'Quels prix devrais-je revoir ?',
    ],
    next: { label: "L'inventaire", href: '/inventory' },
  },

  '/inventory': {
    key:     'inventory',
    here:    'Votre stock',
    capsule: 'Vous voulez savoir quels produits surveiller ?',
    prompts: [
      'Quels produits vais-je manquer bientôt ?',
      'Qu’est-ce que je dois recommander cette semaine ?',
      'Mon stock dort-il quelque part ?',
    ],
    next: { label: 'Les ventes', href: '/sales' },
  },

  '/sales': {
    key:     'sales',
    here:    'Vos ventes',
    capsule: 'Je peux vous aider à analyser vos ventes.',
    prompts: [
      'Comment mes ventes évoluent-elles ?',
      'Quel produit tire mon chiffre d’affaires ?',
      'Vends-je assez pour couvrir mes dépenses ?',
    ],
    next: { label: 'Les dépenses', href: '/expenses' },
  },

  '/purchases': {
    key:     'purchases',
    here:    'Vos achats',
    capsule: 'Je peux regarder ce que vos achats vous coûtent.',
    prompts: [
      'Mes achats sont-ils proportionnés à mes ventes ?',
      'Où part mon argent en ce moment ?',
    ],
    next: { label: 'Les fournisseurs', href: '/suppliers' },
  },

  '/expenses': {
    key:     'expenses',
    here:    'Vos dépenses',
    capsule: 'Je peux vous dire où part votre argent.',
    prompts: [
      'Quelles dépenses pèsent le plus sur mon profit ?',
      'Mes dépenses sont-elles trop élevées pour mes ventes ?',
    ],
    next: { label: 'Les rapports', href: '/rapports' },
  },

  '/rapports': {
    key:     'rapports',
    here:    'Vos états financiers',
    capsule: 'Je peux vous expliquer ce rapport simplement.',
    prompts: [
      'Expliquez-moi ce rapport en mots simples.',
      'Est-ce que je gagne de l’argent, oui ou non ?',
      'Qu’est-ce qui explique mon profit ce mois-ci ?',
    ],
    next: { label: 'Pilot AI', href: '/ai-assistant' },
  },

  '/rapports/comptabilite': {
    key:     'comptabilite',
    here:    'Votre comptabilité',
    capsule: 'Je peux traduire ces écritures en français courant.',
    prompts: [
      'Que veut dire ce solde pour mon commerce ?',
      'Expliquez-moi mon résultat en mots simples.',
    ],
  },

  '/rentabilite': {
    key:     'rentabilite',
    here:    'Votre rentabilité',
    capsule: 'Je peux vous dire ce qui rapporte et ce qui coûte.',
    prompts: [
      'Qu’est-ce qui rapporte vraiment chez moi ?',
      'Comment améliorer ma marge sans augmenter mes prix ?',
    ],
  },

  '/analytics': {
    key:     'analytics',
    here:    'Vos analyses',
    capsule: 'Je peux vous aider à lire ces courbes.',
    prompts: [
      'Que dit cette tendance de mon commerce ?',
      'Sur quoi devrais-je agir en premier ?',
    ],
  },

  '/creances': {
    key:     'creances',
    here:    'Vos créances',
    capsule: 'Je peux regarder qui vous doit de l’argent.',
    prompts: [
      'Mes créances mettent-elles ma trésorerie en danger ?',
      'Quel retard devrais-je réclamer en premier ?',
    ],
    next: { label: 'Les clients', href: '/customers' },
  },

  '/dettes': {
    key:     'dettes',
    here:    'Vos dettes',
    capsule: 'Je peux vous dire si vos dettes tiennent.',
    prompts: [
      'Mes dettes sont-elles trop lourdes pour mes ventes ?',
      'Ai-je de quoi payer ce que je dois ce mois-ci ?',
    ],
  },

  '/customers': {
    key:     'customers',
    here:    'Vos clients',
    capsule: 'Je peux vous aider à voir qui compte vraiment.',
    prompts: [
      'Quels clients me rapportent le plus ?',
      'Qui me doit encore de l’argent ?',
    ],
    next: { label: 'Les fournisseurs', href: '/suppliers' },
  },

  '/suppliers': {
    key:     'suppliers',
    here:    'Vos fournisseurs',
    capsule: 'Je peux regarder ce que vous devez, et à qui.',
    prompts: [
      'À qui dois-je le plus en ce moment ?',
      'Quelle dette fournisseur est en retard ?',
    ],
    next: { label: 'Les dettes', href: '/dettes' },
  },

  '/boutique': {
    key:     'boutique',
    here:    'Votre boutique en ligne',
    capsule: 'Je peux vous aider à décider quoi mettre en avant.',
    prompts: [
      'Quels produits mettre en avant dans ma boutique ?',
      'Qu’est-ce qui se vend le mieux en ce moment ?',
    ],
  },

  '/documents': {
    key:     'documents',
    here:    'Vos documents',
    capsule: 'Je peux vous expliquer ce que ce document dit de vos chiffres.',
    prompts: [
      'Que disent ces montants de mon commerce ?',
      'Ce document change-t-il quelque chose à mon profit ?',
    ],
  },

  '/plus': {
    key:     'plus',
    here:    'Tout ProfitPilot',
    capsule: 'Vous cherchez quelque chose ? Je connais les écrans.',
    prompts: [
      'Où est-ce que je vois mes marges ?',
      'Par où commencer pour tenir mes comptes ?',
    ],
  },
};

/**
 * Le repli. Il ne promet rien d'autre qu'une conversation — précisément parce
 * qu'on ne sait pas ce que le marchand regarde.
 */
export const DEFAULT_PILOT_ROUTE: PilotRoute = {
  key:     'default',
  here:    'ProfitPilot',
  capsule: 'Besoin d’aide ? Dites-moi ce que vous cherchez.',
  prompts: [
    'Comment va mon commerce cette semaine ?',
    'Quel est mon problème le plus urgent ?',
  ],
};

/**
 * Ce que dit la capsule quand l'essai est terminé.
 *
 * Elle passe AVANT l'écran : un marchand dont l'accès est expiré n'a pas de
 * question sur son stock, il a une question sur son accès. Repris de
 * `PilotAIGuide`, où c'était déjà la bonne décision.
 */
export const EXPIRED_PILOT_ROUTE: PilotRoute = {
  key:     'expired',
  here:    'Votre essai est terminé',
  capsule: 'Votre essai de 72 h est terminé. Souscrivez pour continuer.',
  prompts: [],
  next:    { label: 'Voir les abonnements', href: '/pricing' },
};

// ─────────────────────────────────────────────────────────────────────────────
// Résolution
// ─────────────────────────────────────────────────────────────────────────────

/**
 * L'écran sur lequel on se trouve, par le préfixe le plus long.
 *
 * Le préfixe le plus long, et non le premier trouvé : `/rapports/comptabilite`
 * et `/rapports` cohabitent dans la table, et l'ordre de déclaration d'un objet
 * ne doit pas décider lequel gagne. Une adresse profonde (`/products/42`,
 * `/documents/7/apercu`) hérite de son parent sans avoir à être écrite.
 */
export function pilotRouteFor(pathname: string | null | undefined): PilotRoute {
  if (!pathname) return DEFAULT_PILOT_ROUTE;

  const normalized = pathname.startsWith('/') ? pathname : `/${pathname}`;

  let best: PilotRoute | null = null;
  let bestLength = -1;

  for (const [prefix, route] of Object.entries(ROUTES)) {
    const matches = normalized === prefix || normalized.startsWith(`${prefix}/`);
    if (matches && prefix.length > bestLength) {
      best = route;
      bestLength = prefix.length;
    }
  }

  return best ?? DEFAULT_PILOT_ROUTE;
}

/**
 * `true` là où la bulle a sa place.
 *
 * Trois exclusions, chacune pour sa raison :
 *
 *   · les pages publiques (accueil, tarifs, blog, caisse, authentification) —
 *     `isPublicAppPath` tient déjà cette liste pour `Providers`, et deux listes
 *     de pages publiques finiraient par diverger ;
 *   · la vitrine d'un marchand (`/store/...`) et les aperçus de gabarit : ce
 *     sont les pages de SES clients, où un assistant de gestion n'a rien à
 *     faire ;
 *   · `/ai-assistant` lui-même — une bulle qui flotte au-dessus de la
 *     conversation plein écran propose d'ouvrir ce qui est déjà ouvert.
 */
export function isPilotSurface(pathname: string | null | undefined): boolean {
  if (!pathname) return false;

  const normalized = pathname.startsWith('/') ? pathname : `/${pathname}`;

  if (normalized === '/ai-assistant' || normalized.startsWith('/ai-assistant/')) return false;
  if (isPublicAppPath(normalized)) return false;

  return true;
}
