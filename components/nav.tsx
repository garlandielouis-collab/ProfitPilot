// ─────────────────────────────────────────────────────────────────────────────
// Le modèle de navigation — source unique pour la barre mobile, la page « Plus »
// et la barre latérale de bureau (§5.1).
//
// Avant : 25 entrées en barre latérale, 5 raccourcis arbitraires en bas.
// Une barre mobile accepte cinq entrées au maximum ; c'était vingt de trop, et
// aucune astuce visuelle ne les aurait fait tenir.
//
// Après : cinq entrées pour les tâches quotidiennes, et une page « Plus » qui
// regroupe tout le reste en sections hiérarchisées. La page « Plus » n'est pas
// un placard : chaque entrée y porte une icône, un libellé et une description
// d'une ligne. Les rapports, consultés le soir plutôt qu'entre deux clients,
// y sont parfaitement à leur place.
//
// Icônes : une seule bibliothèque (lucide), un seul style — contour, épaisseur
// constante, coins cohérents (§3.5). Aucune n'est laissée sans libellé.
// ─────────────────────────────────────────────────────────────────────────────

import {
  Activity, BarChart3, Bell, Boxes, Building2, Calculator, CalendarClock, ClipboardList, Code2, CreditCard, Database,
  FileText, FolderOpen, Gift, HandCoins, Home, Landmark, Layers, Lock, MessageSquare,
  MoreHorizontal, Package, Palette, PiggyBank, Plus,
  Receipt, Rocket, Scissors, Settings, ShieldCheck, ShoppingBag, ShoppingCart, Sparkles, Store,
  TrendingUp, Truck, UserCog, Users, Vault, Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { Feature } from '../lib/planFeatures';
import { showsServiceTools, showsStock, type Trade } from '../lib/kaye';

export type Entry = {
  href: string;
  label: { fr: string; ht: string };
  /** Une ligne. Elle dit ce qu'on y fait, pas ce que dit déjà le libellé (§4.5). */
  hint: { fr: string; ht: string };
  icon: LucideIcon;
};

// ── La barre du bas : cinq entrées, l'action la plus fréquente au centre ─────
// Chaque entrée a dû justifier sa place ; il n'y a pas de sixième candidate.

export const HOME: Entry = {
  href: '/dashboard',
  label: { fr: 'Accueil', ht: 'Akèy' },
  hint:  { fr: "L'état du commerce en un regard", ht: 'Eta komès la yon sèl kout je' },
  icon: Home,
};

export const SALES: Entry = {
  href: '/sales',
  label: { fr: 'Ventes', ht: 'Vant' },
  hint:  { fr: "L'historique de la journée", ht: 'Istorik jounen an' },
  icon: ShoppingCart,
};

export const RECEIVABLES: Entry = {
  href: '/creances',
  // « Créance » est un mot de comptable (§11.1 de l'étude) : le marchand dit
  // « crédit », et « sa yo dwe w ».
  label: { fr: 'Crédits', ht: 'Kredi' },
  // Le crédit informel est au cœur du commerce haïtien : il mérite un accès
  // direct, pas une entrée de sous-menu.
  hint:  { fr: 'Qui vous doit, et depuis combien de temps', ht: 'Kiyès ki dwe w, depi konbyen tan' },
  icon: HandCoins,
};

export const MORE: Entry = {
  href: '/plus',
  label: { fr: 'Plus', ht: 'Plis' },
  hint:  { fr: 'Tout le reste, organisé', ht: 'Tout rès la, byen ranje' },
  icon: MoreHorizontal,
};

/** Les quatre liens de la barre. La cinquième cible — « + Vente » — est une
 *  action, pas une destination : elle ouvre une feuille par-dessus l'écran. */
export const BOTTOM_BAR: [Entry, Entry, Entry, Entry] = [HOME, SALES, RECEIVABLES, MORE];

export const NEW_SALE_ICON = Plus;

export type MoreSection = { title: { fr: string; ht: string }; entries: Entry[] };

// ── La page « Plus » : trois sections, vingt entrées hiérarchisées ───────────
//
// `ALL_MORE_SECTIONS` est la liste complète ; `MORE_SECTIONS`, plus bas, celle
// qu'on montre — sans les modules que l'étude de marché inversée a retirés des
// offres (§12.1).

const ALL_MORE_SECTIONS: MoreSection[] = [
  {
    title: { fr: 'Gestion', ht: 'Jesyon' },
    entries: [
      // La caisse d'abord : « kès atandi, kès reyèl » est la question du soir
      // de tous les métiers (F08), et le salaire du patron y vit (F04).
      { href: '/caisse',    label: { fr: 'Caisse', ht: 'Kès' },
        hint: { fr: 'L’argent attendu, l’argent compté, votre salaire', ht: 'Kòb ki dwe la, kòb ou konte, salè w' }, icon: Vault },
      { href: '/travaux',   label: { fr: 'Fiches de travail', ht: 'Fich travay' },
        hint: { fr: 'Avance, solde, prêt ou pas', ht: 'Avans, balans, pare oswa pa pare' }, icon: Scissors },
      { href: '/prestations', label: { fr: 'Coût des services', ht: 'Pri sèvis yo' },
        hint: { fr: 'Le prix moins les produits utilisés', ht: 'Pri a mwens pwodui ou sèvi yo' }, icon: Calculator },
      { href: '/rendez-vous', label: { fr: 'Rendez-vous', ht: 'Randevou' },
        hint: { fr: 'Qui vient quand, rappel la veille', ht: 'Kiyès k ap vini ki lè, rapèl lavèy' }, icon: CalendarClock },
      { href: '/sol',       label: { fr: 'Sòl et sabotaj', ht: 'Sòl ak sabotaj' },
        hint: { fr: 'Cotisations, et la date de la main', ht: 'Kotizasyon, ak dat men an' }, icon: PiggyBank },
      { href: '/products',  label: { fr: 'Produits', ht: 'Pwodwi' },
        hint: { fr: 'Prix, marges et codes-barres', ht: 'Pri, maj ak kòd-ba' }, icon: Package },
      { href: '/inventory', label: { fr: 'Inventaire', ht: 'Envantè' },
        hint: { fr: 'Ce qui reste en boutique', ht: 'Sa ki rete nan boutik la' }, icon: Boxes },
      { href: '/purchases', label: { fr: 'Achats', ht: 'Acha' },
        hint: { fr: 'Ce que vous achetez pour revendre', ht: 'Sa w achte pou revann' }, icon: ShoppingBag },
      { href: '/suppliers', label: { fr: 'Fournisseurs', ht: 'Founisè' },
        hint: { fr: 'Chez qui vous vous approvisionnez', ht: 'Kote w achte' }, icon: Truck },
      { href: '/prix-achat', label: { fr: 'Prix d’achat suivis', ht: 'Pri acha yo' },
        hint: { fr: 'Quand le dollar monte, la marge qui reste', ht: 'Lè dola a monte, maj ki rete a' }, icon: TrendingUp },
      { href: '/expenses',  label: { fr: 'Dépenses', ht: 'Depans' },
        hint: { fr: 'Loyer, transport, salaires', ht: 'Lwaye, transpò, salè' }, icon: Receipt },
      { href: '/dettes',    label: { fr: 'Dettes', ht: 'Dèt' },
        hint: { fr: 'Ce que vous devez, et à qui', ht: 'Sa w dwe, ak kiyès' }, icon: Wallet },
      { href: '/customers', label: { fr: 'Clients', ht: 'Kliyan' },
        hint: { fr: 'Coordonnées et historique', ht: 'Kontak ak istorik acha' }, icon: Users },
      // UNE entrée, et douze destinations derrière. Le §2 du cahier des charges
      // documentaire en demandait douze au menu ; une barre latérale qui en
      // gagne douze d'un coup redevient exactement le placard que la refonte a
      // vidé. Les onze autres sont des onglets, des filtres et des actions à
      // l'intérieur de `/documents`.
      { href: '/documents', label: { fr: 'Documents', ht: 'Dokiman' },
        hint: { fr: 'Patente, contrats, papiers importants', ht: 'Patant, kontra, papye enpòtan' }, icon: FolderOpen },
    ],
  },
  {
    title: { fr: 'Analyse', ht: 'Analiz' },
    entries: [
      { href: '/rapports',              label: { fr: 'Rapport du mois', ht: 'Rapò mwa a' },
        hint: { fr: 'Vendu, dépensé, gagné : le mois, prêt à imprimer', ht: 'Vann, depanse, fè : mwa a, pare pou enprime' }, icon: FileText },
      { href: '/rapports/comptabilite', label: { fr: 'Comptabilité', ht: 'Kontablite' },
        hint: { fr: 'Journal, grand livre et balance', ht: 'Jounal, gran liv ak balans' }, icon: Landmark },
      { href: '/rentabilite',           label: { fr: 'Rentabilité', ht: 'Rantablite' },
        hint: { fr: 'Quel produit rapporte vraiment', ht: 'Ki pwodwi ki rapòte vre' }, icon: TrendingUp },
      { href: '/analytics',             label: { fr: 'Analyses avancées', ht: 'Analiz avanse' },
        hint: { fr: 'Tendances sur plusieurs mois', ht: 'Tandans sou plizyè mwa' }, icon: BarChart3 },
      { href: '/rapports/credit',       label: { fr: 'Dossier de financement', ht: 'Dosye finansman' },
        hint: { fr: 'Vos chiffres, à présenter à une microfinance', ht: 'Chif ou yo, pou prezante bay yon mikwofinans' }, icon: ClipboardList },
      { href: '/ai-assistant',          label: { fr: 'Pilot AI', ht: 'Pilot AI' },
        hint: { fr: 'Posez une question sur vos chiffres', ht: 'Poze yon kesyon sou chif ou yo' }, icon: Sparkles },
    ],
  },
];

ALL_MORE_SECTIONS.push({
  title: { fr: 'Compte', ht: 'Kont' },
  entries: [
    // Ouvert à toutes les offres, et c'est le but : c'est au marchand
    // d'Esansyel que le mois de Rapports offert profite le plus.
    { href: '/parrainage',    label: { fr: 'Parrainage', ht: 'Parennaj' },
      hint: { fr: 'Amenez un marchand, gagnez les Rapports', ht: 'Mennen yon machann, genyen Rapò yo' }, icon: Gift },
    { href: '/boutique',      label: { fr: 'Boutique en ligne', ht: 'Boutik anliy' },
      hint: { fr: 'Vendre en dehors du comptoir', ht: 'Vann deyò kontwa a' }, icon: Store },
    // Deux entrées pour la boutique, et c'est délibéré : « Boutique en ligne »
    // règle les paiements, la livraison et les commandes reçues ; celle-ci
    // décide de ce que le CLIENT voit — le gabarit, les couleurs, les produits
    // publiés, les photos. Deux tâches, deux moments, deux entrées. Les cacher
    // sous un seul écran est exactement ce qui a rendu le créateur de vitrine
    // introuvable jusqu'ici.
    { href: '/boutique/builder', label: { fr: 'Vitrine et gabarits', ht: 'Vitrin ak modèl' },
      hint: { fr: 'Design, produits publiés, Studio photo', ht: 'Desen, pwodwi pibliye, Estidyo foto' }, icon: Palette },
    // Une quatrième entrée, et la seule qui répond à « où en suis-je ? ». Le
    // §43 en fait la porte d'entrée du module : onze étapes tant que la boutique
    // se monte, une note et ses recommandations une fois qu'elle tourne.
    { href: '/boutique/lancement', label: { fr: 'Lancement et statistiques', ht: 'Lansman ak estatistik' },
      hint: { fr: 'Les 11 étapes, la note sur 100, puis les ventes', ht: '11 etap yo, nòt sou 100, apre vant yo' }, icon: Rocket },
    { href: '/boutique/merchandising', label: { fr: 'Merchandising', ht: 'Machandiz' },
      hint: { fr: 'Ce qui manque au catalogue, et les lots', ht: 'Sa ki manke nan katalòg la, ak pakè yo' }, icon: Layers },
    // Les avis ont leur entrée, et pas un onglet sous la vitrine : un avis en
    // attente est une tâche à faire, pas un réglage. Tant que personne ne le
    // relit, la note n'apparaît sur aucune fiche — la chaîne s'arrête là.
    { href: '/boutique/avis', label: { fr: 'Avis clients', ht: 'Avi kliyan' },
      hint: { fr: 'Relire, publier — les étoiles des fiches', ht: 'Reli, pibliye — zetwal fich yo' }, icon: MessageSquare },
    { href: '/entreprises',   label: { fr: 'Entreprises', ht: 'Antrepriz' },
      hint: { fr: 'Basculer entre vos commerces', ht: 'Chanje ant komès ou yo' }, icon: Building2 },
    { href: '/aides',         label: { fr: 'Mes aides', ht: 'Èd mwen yo' },
      hint: { fr: 'Qui vend pour vous, et combien le payer', ht: 'Kiyès k ap vann pou ou, ak konbyen pou peye l' }, icon: UserCog },
    { href: '/roles',         label: { fr: 'Rôles et permissions', ht: 'Wòl ak pèmisyon' },
      hint: { fr: 'Ce que chacun a le droit de voir', ht: 'Sa chak moun gen dwa wè' }, icon: ShieldCheck },
    { href: '/notifications', label: { fr: 'Notifications', ht: 'Notifikasyon' },
      hint: { fr: 'Alertes de stock et de créances', ht: 'Alèt stòk ak kredi' }, icon: Bell },
    { href: '/activity',      label: { fr: 'Activité', ht: 'Aktivite' },
      hint: { fr: 'Qui a modifié quoi, et quand', ht: 'Kiyès ki chanje kisa, ki lè' }, icon: Activity },
    { href: '/backup',        label: { fr: 'Sauvegardes', ht: 'Sovgad' },
      hint: { fr: "Vos données, à l'abri", ht: 'Done ou yo, an sekirite' }, icon: Database },
    { href: '/security',      label: { fr: 'Sécurité', ht: 'Sekirite' },
      hint: { fr: 'Mot de passe et appareils connectés', ht: 'Modpas ak aparèy konekte' }, icon: Lock },
    { href: '/automation',    label: { fr: 'Automatisation', ht: 'Otomatizasyon' },
      hint: { fr: 'Les rappels qui partent tout seuls', ht: 'Rapèl ki pati poukont yo' }, icon: Sparkles },
    // Le libellé dit où on va, l'indice dit ce qu'on y trouve — et on y trouve
    // « pas encore ouvert ». Promettre « Brancher un autre outil » à une entrée
    // qui mène à une liste d'attente, c'est faire le trajet pour rien.
    { href: '/api-access',    label: { fr: 'Accès API', ht: 'Aksè API' },
      hint: { fr: 'En préparation — demander un accès', ht: 'N ap prepare — mande yon aksè' }, icon: Code2 },
    // Sans cette entrée, la page de prix n'était atteignable que depuis un écran
    // verrouillé : changer d'offre ne doit pas attendre qu'on se heurte à un refus.
    { href: '/pricing',       label: { fr: 'Mon abonnement', ht: 'Abònman mwen' },
      hint: { fr: 'Votre offre, et en changer', ht: 'Ofr ou, ak chanje l' }, icon: CreditCard },
    { href: '/settings',      label: { fr: 'Paramètres', ht: 'Paramèt' },
      hint: { fr: 'Devise, taux de change, langue', ht: 'Deviz, to chanj, lang' }, icon: Settings },
  ],
});

// ─────────────────────────────────────────────────────────────────────────────
// Les modules retirés des offres (étude de marché inversée, §12.1)
//
// « Elles ajoutent des écrans et de la confusion sans résoudre l'une des dix
// douleurs principales. » Comptabilité en partie double, boutique en ligne,
// accès API, automatisations, rôles et permissions (remplacés par les comptes
// d'aides, F16), analyses à graphiques multiples (remplacées par 3 chiffres et
// 1 conseil).
//
// CACHÉS, pas supprimés : les pages restent en place et répondent à leur
// adresse — un lien de notification vers une commande de boutique ne doit pas
// tomber dans le vide. Ils ne sont plus proposés nulle part dans le menu. Pour
// les rendre de nouveau visibles, passer `RETIRED_MODULES_HIDDEN` à `false` :
// c'est le seul interrupteur.
// ─────────────────────────────────────────────────────────────────────────────

export const RETIRED_MODULES_HIDDEN = true;

export const RETIRED_ROUTES: readonly string[] = [
  '/rapports/comptabilite',
  '/boutique',
  '/api-access',
  '/automation',
  '/roles',
  '/analytics',
  // Le module RH complet : remplacé par « Mes aides » (/aides, F16).
  '/employes',
];

/** Vrai si l'adresse appartient à un module retiré (la sous-page aussi). */
export function isRetiredRoute(pathname: string | null | undefined): boolean {
  if (!RETIRED_MODULES_HIDDEN || !pathname) return false;
  return RETIRED_ROUTES.some((href) => pathname === href || pathname.startsWith(`${href}/`));
}

export const MORE_SECTIONS: MoreSection[] = ALL_MORE_SECTIONS
  .map((section) => ({ ...section, entries: section.entries.filter((e) => !isRetiredRoute(e.href)) }))
  .filter((section) => section.entries.length > 0);

// ── Un métier, un écran (§11.1, règle 11) ────────────────────────────────────
//
// « Un coiffeur ne voit jamais l'écran de stock d'une quincaillerie, et
// inversement. » Les pages restent ouvertes à leur adresse ; le menu, lui, ne
// propose que celles du métier choisi à l'installation (lib/kaye.ts). Tant que
// le métier n'est pas choisi, c'est le commerce — le segment le plus large.

const STOCK_ROUTES:   readonly string[] = ['/inventory', '/purchases', '/suppliers', '/rentabilite', '/prix-achat'];
const SERVICE_ROUTES: readonly string[] = ['/travaux', '/rendez-vous', '/prestations'];

export function entryFitsTrade(href: string, trade: Trade | null): boolean {
  if (STOCK_ROUTES.includes(href))   return showsStock(trade);
  if (SERVICE_ROUTES.includes(href)) return showsServiceTools(trade);
  return true;
}

/** Les sections de « Plus », taillées au métier du marchand. */
export function moreSectionsFor(trade: Trade | null): MoreSection[] {
  return MORE_SECTIONS
    .map((section) => ({ ...section, entries: section.entries.filter((e) => entryFitsTrade(e.href, trade)) }))
    .filter((section) => section.entries.length > 0);
}

/** Toutes les destinations connues — sert à savoir quelle entrée de la barre
 *  du bas doit s'allumer quand on est sur une page atteinte depuis « Plus ».
 *  Les modules cachés y restent : leur page s'ouvre encore par son adresse,
 *  et l'écran verrouillé doit pouvoir la titrer. */
export const ALL_ENTRIES: Entry[] = [
  HOME, SALES, RECEIVABLES, MORE,
  ...ALL_MORE_SECTIONS.flatMap((s) => s.entries),
];

// ─────────────────────────────────────────────────────────────────────────────
// Ce que chaque destination demande à l'offre
//
// Une seule table : la barre latérale, la page « Plus » et le verrou de l'écran
// lisent toutes les trois ICI. Trois listes séparées auraient fini par se
// contredire — un menu qui propose une page que l'écran refuse est pire qu'un
// menu qui ne la propose pas.
//
// Les destinations absentes de cette table sont dans le SOCLE : vendre, encaisser,
// suivre un crédit, tenir son stock, ses dépenses, ses clients. Elles ne se
// verrouillent jamais, quelle que soit l'offre — une limite posée là ne ferait
// pas monter le marchand d'un cran, elle le renverrait au cahier.
//
// Le nom de la fonctionnalité vient du registre (`planFeatures.ts`), qui décide
// seul de l'offre minimale. Ajouter une entrée ici ne donne donc aucun droit :
// ça branche un écran sur une règle qui existe déjà.
// ─────────────────────────────────────────────────────────────────────────────

export const ROUTE_FEATURE: Record<string, Feature> = {
  // ── Esansyel — le socle documentaire ──
  //
  // `documents` est ouverte à toutes les offres : ranger ses papiers n'est pas
  // une fonctionnalité avancée, c'est la raison pour laquelle le marchand ouvre
  // l'application un jour de contrôle. L'entrée est ici quand même, parce que
  // les écrans qui se grefferont sur `/documents/…` en Phase 5 — Studio IA,
  // plan d'affaires — devront s'y ajouter, et qu'une table où le cas simple
  // manque est une table qu'on oublie de compléter.
  '/documents':             'documents',
  // Écrire un document (§20) ne coûte pas d'offre : c'est la contrepartie du
  // dépôt, pas une fonctionnalité avancée. Le MODÈLE, lui, est ce qui fait
  // gagner l'heure de rédaction — d'où sa place dans la colonne Kwasans.
  '/documents/creer':       'documents',

  // ── Kwasans — comprendre pour grandir ──
  '/documents/modeles':     'document_templates',
  '/documents/conformite':  'document_compliance',
  '/documents/contrats':    'document_contracts',
  '/rapports':              'monthly_reports',
  '/rapports/comptabilite': 'advanced_reports',
  '/rentabilite':           'product_profitability',
  '/travaux':               'work_orders',
  '/rendez-vous':           'appointments',
  '/prestations':           'service_costing',
  '/prix-achat':            'supplier_price_history',
  '/sol':                   'sol',
  '/boutique':              'online_store',
  '/ai-assistant':          'ai_assistant',
  '/employes':              'employees',
  '/aides':                 'employees',
  '/activity':              'activity_log',

  // ── Elit — diriger comme un patron ──
  '/rapports/credit':       'credit_export',
  '/analytics':             'advanced_analytics',
  '/entreprises':           'multi_stores',
  '/roles':                 'multi_user_roles',
  '/automation':            'automation',
  '/api-access':            'api_access',
};

/**
 * La fonctionnalité exigée par une adresse — `/rapports/comptabilite` est jugée
 * sur elle-même, pas sur `/rapports` : c'est le chemin le PLUS long qui gagne,
 * sinon une sous-page hériterait toujours du verrou de sa parente.
 */
export function featureForPath(pathname: string | null | undefined): Feature | undefined {
  if (!pathname) return undefined;

  let best: { href: string; feature: Feature } | undefined;
  for (const [href, feature] of Object.entries(ROUTE_FEATURE)) {
    const match = pathname === href || pathname.startsWith(`${href}/`);
    if (match && (!best || href.length > best.href.length)) best = { href, feature };
  }
  return best?.feature;
}

/** L'entrée de menu correspondant à une adresse — pour titrer l'écran verrouillé. */
export function entryForPath(pathname: string | null | undefined): Entry | undefined {
  if (!pathname) return undefined;

  let best: Entry | undefined;
  for (const entry of ALL_ENTRIES) {
    const match = pathname === entry.href || pathname.startsWith(`${entry.href}/`);
    if (match && (!best || entry.href.length > best.href.length)) best = entry;
  }
  return best;
}
