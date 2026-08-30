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
  Activity, BarChart3, Bell, Boxes, Building2, ClipboardList, Code2, Database,
  FileText, HandCoins, Home, Landmark, Lock, MoreHorizontal, Package, Plus,
  Receipt, Settings, ShieldCheck, ShoppingBag, ShoppingCart, Sparkles, Store,
  TrendingUp, Truck, UserCog, Users, Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { Feature } from '../lib/planFeatures';

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
  label: { fr: 'Créances', ht: 'Kredi' },
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

export const MORE_SECTIONS: MoreSection[] = [
  {
    title: { fr: 'Gestion', ht: 'Jesyon' },
    entries: [
      { href: '/products',  label: { fr: 'Produits', ht: 'Pwodwi' },
        hint: { fr: 'Prix, marges et codes-barres', ht: 'Pri, maj ak kòd-ba' }, icon: Package },
      { href: '/inventory', label: { fr: 'Inventaire', ht: 'Envantè' },
        hint: { fr: 'Ce qui reste en boutique', ht: 'Sa ki rete nan boutik la' }, icon: Boxes },
      { href: '/purchases', label: { fr: 'Achats', ht: 'Acha' },
        hint: { fr: 'Ce que vous achetez pour revendre', ht: 'Sa w achte pou revann' }, icon: ShoppingBag },
      { href: '/suppliers', label: { fr: 'Fournisseurs', ht: 'Founisè' },
        hint: { fr: 'Chez qui vous vous approvisionnez', ht: 'Kote w achte' }, icon: Truck },
      { href: '/expenses',  label: { fr: 'Dépenses', ht: 'Depans' },
        hint: { fr: 'Loyer, transport, salaires', ht: 'Lwaye, transpò, salè' }, icon: Receipt },
      { href: '/dettes',    label: { fr: 'Dettes', ht: 'Dèt' },
        hint: { fr: 'Ce que vous devez, et à qui', ht: 'Sa w dwe, ak kiyès' }, icon: Wallet },
      { href: '/customers', label: { fr: 'Clients', ht: 'Kliyan' },
        hint: { fr: 'Coordonnées et historique', ht: 'Kontak ak istorik acha' }, icon: Users },
    ],
  },
  {
    title: { fr: 'Analyse', ht: 'Analiz' },
    entries: [
      { href: '/rapports',              label: { fr: 'Rapports', ht: 'Rapò' },
        hint: { fr: 'Le bilan du mois, prêt à imprimer', ht: 'Bilan mwa a, pare pou enprime' }, icon: FileText },
      { href: '/rapports/comptabilite', label: { fr: 'Comptabilité', ht: 'Kontablite' },
        hint: { fr: 'Journal, grand livre et balance', ht: 'Jounal, gran liv ak balans' }, icon: Landmark },
      { href: '/rentabilite',           label: { fr: 'Rentabilité', ht: 'Rantablite' },
        hint: { fr: 'Quel produit rapporte vraiment', ht: 'Ki pwodwi ki rapòte vre' }, icon: TrendingUp },
      { href: '/analytics',             label: { fr: 'Analyses avancées', ht: 'Analiz avanse' },
        hint: { fr: 'Tendances sur plusieurs mois', ht: 'Tandans sou plizyè mwa' }, icon: BarChart3 },
      { href: '/rapports/credit',       label: { fr: 'Dossier crédit', ht: 'Dosye kredi' },
        hint: { fr: 'Le dossier à présenter à une banque', ht: 'Dosye pou prezante nan yon bank' }, icon: ClipboardList },
      { href: '/ai-assistant',          label: { fr: 'Pilot AI', ht: 'Pilot AI' },
        hint: { fr: 'Posez une question sur vos chiffres', ht: 'Poze yon kesyon sou chif ou yo' }, icon: Sparkles },
    ],
  },
];

MORE_SECTIONS.push({
  title: { fr: 'Compte', ht: 'Kont' },
  entries: [
    { href: '/boutique',      label: { fr: 'Boutique en ligne', ht: 'Boutik anliy' },
      hint: { fr: 'Vendre en dehors du comptoir', ht: 'Vann deyò kontwa a' }, icon: Store },
    { href: '/entreprises',   label: { fr: 'Entreprises', ht: 'Antrepriz' },
      hint: { fr: 'Basculer entre vos commerces', ht: 'Chanje ant komès ou yo' }, icon: Building2 },
    { href: '/employes',      label: { fr: 'Employés', ht: 'Anplwaye' },
      hint: { fr: 'Qui travaille, et qui est payé', ht: 'Kiyès k ap travay ak peye' }, icon: UserCog },
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
    { href: '/api-access',    label: { fr: 'Accès API', ht: 'Aksè API' },
      hint: { fr: 'Brancher un autre outil', ht: 'Konekte yon lòt zouti' }, icon: Code2 },
    { href: '/settings',      label: { fr: 'Paramètres', ht: 'Paramèt' },
      hint: { fr: 'Devise, taux de change, langue', ht: 'Deviz, to chanj, lang' }, icon: Settings },
  ],
});

/** Toutes les destinations connues — sert à savoir quelle entrée de la barre
 *  du bas doit s'allumer quand on est sur une page atteinte depuis « Plus ». */
export const ALL_ENTRIES: Entry[] = [
  HOME, SALES, RECEIVABLES, MORE,
  ...MORE_SECTIONS.flatMap((s) => s.entries),
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
  // ── Kwasans — comprendre pour grandir ──
  '/rapports':              'monthly_reports',
  '/rapports/comptabilite': 'advanced_reports',
  '/rentabilite':           'product_profitability',
  '/boutique':              'online_store',
  '/employes':              'employees',
  // Même écran, ancienne adresse : elle n'est plus au menu mais reste
  // atteignable, donc elle se verrouille comme l'autre.
  '/employees':             'employees',
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
 *
 * Pilot AI n'est volontairement pas dans la table : les trois questions
 * offertes d'Esansyel se dosent par quota dans l'écran, pas par une porte
 * fermée. Personne n'achète une fonction qu'il n'a jamais vue tourner sur ses
 * propres chiffres.
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
