// ─────────────────────────────────────────────────────────────────────────────
// L'atelier des gabarits — les boutiques de DÉMONSTRATION
//
// Six boutiques fictives, une par gabarit métier, servies UNIQUEMENT à
// `/atelier` et uniquement hors production. Elles existent pour une seule
// raison : pouvoir regarder un gabarit en entier — bannière, rayons, grille,
// histoire, avis, pied de page — sans base de données et sans le catalogue
// d'un vrai marchand.
//
// ── Pourquoi c'est de la donnée inventée, et pourquoi c'est admis ici ───────
//
// La règle du produit est « aucune donnée fictive » : un avis inventé sur la
// vitrine d'un commerçant l'expose personnellement. Cette règle vise les
// vitrines RÉELLES. Ici, rien n'est présenté comme appartenant à quelqu'un :
// les six boutiques portent des noms manifestement fictifs, la route est
// fermée en production, et le bandeau de l'atelier le répète à l'écran.
//
// Ce que l'atelier NE remplace PAS : `/apercu/<gabarit>`, qui montre au
// marchand SES produits dans le gabarit visé. L'atelier sert à celui qui
// FABRIQUE les gabarits ; l'aperçu sert à celui qui en choisit un.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  StoreSettings, StoreProduct, StoreCategory,
} from '../../app/actions/store-public';
import type { TemplateId } from '../storeTheme';

/** Les six gabarits métier — ceux que l'atelier sert. */
export const ATELIER_TEMPLATES = [
  'proximite', 'social', 'artisan', 'services', 'agri', 'traiteur',
] as const;

const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();

/** Une photo de la banque du gabarit, pour que les cartes ne soient pas vides. */
const art = (id: string, slot: 'hero' | 'story' | 'band' | 'tile') =>
  `/gabarits/art/${id}-${slot}.webp`;

type Spec = {
  name:     string;
  tagline:  string;
  currency: string;
  categories: string[];
  /** nom, prix, prix barré, rayon, stock, attributs. */
  products: Array<[string, number, number | null, string, number, Record<string, string>?]>;
  theme: Record<string, unknown>;
};

function product(
  templateId: string,
  i: number,
  [name, price, compare, category, stock, attributes]: Spec['products'][number],
  categories: StoreCategory[],
): StoreProduct {
  const slot = (['tile', 'story', 'band', 'hero'] as const)[i % 4];
  return {
    id:   `demo-${templateId}-${i}`,
    name,
    description:
      'Fiche de démonstration. Le texte, le prix et la photo ne correspondent à '
      + 'aucun produit réel : ils servent à juger la mise en page du gabarit.',
    price,
    sale_price:  null,
    image_url:   art(templateId, slot),
    original_image_url: art(templateId, slot),
    images:      [art(templateId, slot), art(templateId, 'story')],
    category_id: categories.find((c) => c.name === category)?.id ?? null,
    category,
    stock,
    compare_at_price: compare,
    sku:  `DEMO-${i}`,
    tags: [],
    attributes: attributes ?? {},
    is_featured: i % 3 === 0,
    allow_backorders: false,
    is_new: i < 4,
    is_published: true,
    created_at: ago(i * 5),
  };
}

// ── Les six boutiques ───────────────────────────────────────────────────────

const SPECS: Record<(typeof ATELIER_TEMPLATES)[number], Spec> = {

  proximite: {
    name: 'Lalou Store (démo)',
    tagline: 'Élégance au quotidien',
    currency: 'HTG',
    categories: ['Vêtements', 'Chaussures', 'Accessoires', 'Sacs', 'Beauté'],
    products: [
      ['Robe longue en lin', 3500, 4200, 'Vêtements', 8, { taille: 'M', couleur: 'Écru' }],
      ['Sandales tressées', 2400, null, 'Chaussures', 3, { taille: '38' }],
      ['Sac cabas en cuir', 5900, 6800, 'Sacs', 5],
      ['Foulard imprimé', 950, null, 'Accessoires', 14],
      ['Chemise en coton', 2800, null, 'Vêtements', 11, { taille: 'L' }],
      ['Baume lèvres karité', 450, null, 'Beauté', 26],
      ['Ceinture tressée', 1200, 1500, 'Accessoires', 9],
      ['Mocassins vernis', 4600, null, 'Chaussures', 2],
    ],
    theme: {
      hero: {
        headline: 'Élégance au quotidien',
        subheadline: 'Des pièces choisies une à une, livrées partout en Haïti.',
        ctaLabel: 'Découvrir la collection',
      },
      announcement: {
        enabled: true,
        text: 'Livraison rapide à Port-au-Prince et en province · MonCash, NatCash ou à la livraison',
      },
      trust: {
        enabled: true,
        badges: [
          { icon: 'truck',   label: 'Livraison 24–48 h', note: 'Port-au-Prince et province' },
          { icon: 'card',    label: 'MonCash & NatCash', note: 'Ou paiement à la livraison' },
          { icon: 'refresh', label: 'Échange sous 7 jours', note: 'Article non porté' },
          { icon: 'phone',   label: 'On répond sur WhatsApp', note: 'Du lundi au samedi' },
        ],
      },
      brandStory: {
        enabled: true,
        title: 'Plus qu\'une boutique, une passion.',
        body: 'Lalou est née d\'une envie simple : que s\'habiller bien ne demande ni voyage ni fortune. '
            + 'Chaque pièce est choisie à la main, essayée, et gardée seulement si elle tient la journée.',
        ctaLabel: 'En savoir plus',
      },
      socialProof: {
        enabled: true,
        items: [
          { author: 'Cliente (démo)', text: 'Commande reçue le lendemain, la robe tombe parfaitement.', rating: 5 },
          { author: 'Cliente (démo)', text: 'Le foulard est encore plus beau que sur la photo.', rating: 5 },
          { author: 'Client (démo)',  text: 'Échange fait sans discuter, je recommande.', rating: 4 },
        ],
      },
      whatsapp: { enabled: true, number: '+50900000000' },
      faq: {
        enabled: true,
        items: [
          { question: 'Livrez-vous en province ?', answer: 'Oui, sous 48 h dans les principales villes.' },
          { question: 'Puis-je échanger un article ?', answer: 'Sous 7 jours, non porté, avec le ticket.' },
        ],
      },
      newsletter: { enabled: true },
    },
  },

  social: {
    name: 'TrendX (démo)',
    tagline: 'Vu sur ton feed, livré chez toi',
    currency: 'HTG',
    categories: ['Nouveautés', 'Beauté', 'Gadgets', 'Accessoires'],
    products: [
      ['Lip gloss miroir', 650, 900, 'Beauté', 4],
      ['Coque téléphone transparente', 850, null, 'Gadgets', 18],
      ['Lunettes oversize', 1900, 2400, 'Accessoires', 6],
      ['Sérum éclat 30 ml', 2200, null, 'Beauté', 2],
      ['Écouteurs sans fil', 3400, 4500, 'Gadgets', 7],
      ['Chouchous satin ×5', 400, null, 'Accessoires', 31],
      ['Palette 12 teintes', 2800, null, 'Beauté', 5],
      ['Mini haut-parleur', 2600, 3200, 'Gadgets', 3],
    ],
    theme: {
      hero: { headline: 'Le drop de la semaine', subheadline: 'Stock limité. Quand c\'est parti, c\'est parti.', ctaLabel: 'Acheter maintenant' },
      announcement: { enabled: true, text: 'Nouveau drop chaque vendredi · Commande sur WhatsApp en 2 minutes' },
      whatsapp: { enabled: true, number: '+50900000000' },
      gallery: { enabled: true, title: 'Vu sur Instagram' },
      urgency: { enabled: true },
      socialProof: {
        enabled: true,
        items: [
          { author: '@cliente (démo)', text: 'Reçu en 2 jours, exactement comme sur la vidéo.', rating: 5 },
          { author: '@client (démo)',  text: 'La palette est folle pour le prix.', rating: 5 },
        ],
      },
    },
  },

  artisan: {
    name: 'Atelier Kreyòl (démo)',
    tagline: 'Fait main, à Jacmel',
    currency: 'HTG',
    categories: ['Bijoux', 'Décoration', 'Vannerie', 'Céramique'],
    products: [
      ['Collier corne et laiton', 4200, null, 'Bijoux', 1],
      ['Panier tressé latanier', 2800, null, 'Vannerie', 3],
      ['Bol en terre cuite', 1600, null, 'Céramique', 6],
      ['Boucles d\'oreilles gouttes', 1900, null, 'Bijoux', 4],
      ['Tenture murale coton', 5400, null, 'Décoration', 1],
      ['Set de 4 tasses', 3200, null, 'Céramique', 2],
    ],
    theme: {
      hero: { headline: 'Ce que la main sait faire', subheadline: 'Des pièces uniques, façonnées à Jacmel.', ctaLabel: 'Voir les créations' },
      announcement: { enabled: true, text: 'Chaque pièce est unique — les dimensions varient légèrement' },
      brandStory: {
        enabled: true,
        title: 'L\'atelier',
        body: 'Trois artisans, un four, et des matières trouvées à moins de trente kilomètres. '
            + 'Rien n\'est produit en série : ce qui sort de l\'atelier a été tenu en main.',
      },
      process: {
        enabled: true,
        title: 'Notre savoir-faire',
        steps: [
          { title: 'La matière', body: 'Corne, latanier, argile — collectés localement.' },
          { title: 'Le façonnage', body: 'À la main, sans moule, pièce par pièce.' },
          { title: 'La finition', body: 'Poncée, huilée, contrôlée avant emballage.' },
        ],
      },
      orderForm: { enabled: true, title: 'Une commande sur mesure' },
      whatsapp: { enabled: true, number: '+50900000000' },
    },
  },

  services: {
    name: 'ProCoach (démo)',
    tagline: 'Votre entreprise, structurée',
    currency: 'HTG',
    categories: ['Coaching', 'Formation', 'Audit'],
    products: [
      ['Séance de coaching individuel', 5000, null, 'Coaching', 99, { duree: '1 h' }],
      ['Audit de gestion complet', 25000, null, 'Audit', 99, { duree: '3 jours' }],
      ['Formation équipe — 1 journée', 18000, null, 'Formation', 99, { duree: '7 h' }],
      ['Suivi mensuel', 12000, null, 'Coaching', 99, { duree: '4 séances' }],
    ],
    theme: {
      hero: { headline: 'Reprenez la main sur vos chiffres', subheadline: 'Un accompagnement concret, pas une théorie.', ctaLabel: 'Réserver une séance' },
      stats: {
        enabled: true,
        items: [
          { value: '120', label: 'entreprises accompagnées' },
          { value: '8 ans', label: 'sur le terrain' },
          { value: '92 %', label: 'renouvellent' },
        ],
      },
      process: {
        enabled: true,
        title: 'Ma méthode',
        steps: [
          { title: 'Diagnostic', body: 'Une séance pour comprendre où l\'argent part.' },
          { title: 'Plan', body: 'Trois priorités, pas trente.' },
          { title: 'Suivi', body: 'On mesure tous les mois.' },
        ],
      },
      whatsapp: { enabled: true, number: '+50900000000' },
    },
  },

  agri: {
    name: 'HaitianFarm (démo)',
    tagline: 'Élevage et bétail, Plateau Central',
    currency: 'HTG',
    categories: ['Volailles', 'Porcins', 'Caprins', 'Bovins', 'Aliments'],
    products: [
      ['Poulet de chair — lot de 50', 22500, null, 'Volailles', 12, { unite: 'lot de 50', poids: '2,1 kg' }],
      ['Poulette pondeuse 16 sem.', 850, null, 'Volailles', 240, { unite: 'tête' }],
      ['Porcelet sevré', 6500, null, 'Porcins', 18, { poids: '12 kg', age: '8 semaines' }],
      ['Cabri créole', 9500, null, 'Caprins', 7, { age: '6 mois' }],
      ['Provende ponte — sac 50 kg', 3200, null, 'Aliments', 60, { unite: 'sac 50 kg' }],
      ['Génisse croisée', 78000, null, 'Bovins', 2, { age: '18 mois' }],
    ],
    theme: {
      hero: { headline: 'Des bêtes saines, des lots disponibles', subheadline: 'Vaccination à jour, retrait à la ferme ou livraison.', ctaLabel: 'Voir les disponibilités' },
      announcement: { enabled: true, text: 'Lots disponibles cette semaine · Devis sur WhatsApp' },
      trust: {
        enabled: true,
        badges: [
          { icon: 'shield', label: 'Vaccination à jour', note: 'Carnet remis à la vente' },
          { icon: 'truck',  label: 'Livraison possible', note: 'Plateau Central et Ouest' },
          { icon: 'clock',  label: 'Retrait à la ferme', note: '7 h – 17 h' },
          { icon: 'phone',  label: 'Devis en 24 h', note: 'Par téléphone ou WhatsApp' },
        ],
      },
      wholesale: { enabled: true, title: 'Vente en quantité' },
      whatsapp: { enabled: true, number: '+50900000000' },
    },
  },

  traiteur: {
    name: 'Délices & Saveurs (démo)',
    tagline: 'Des saveurs qui font plaisir',
    currency: 'HTG',
    categories: ['Plats', 'Pâtisserie', 'Buffets', 'Boissons'],
    products: [
      ['Griot complet — 1 pers.', 850, null, 'Plats', 40],
      ['Gâteau anniversaire 20 parts', 6500, null, 'Pâtisserie', 5],
      ['Buffet 30 personnes', 45000, null, 'Buffets', 3],
      ['Tassot cabri', 950, null, 'Plats', 25],
      ['Plateau mignardises ×24', 3800, null, 'Pâtisserie', 8],
      ['Jus de fruits 1 L', 350, null, 'Boissons', 60],
    ],
    theme: {
      hero: { headline: 'Des saveurs qui font plaisir.', subheadline: 'Commandez pour aujourd\'hui, ou réservez votre date.', ctaLabel: 'Commander maintenant' },
      announcement: { enabled: true, text: 'Commande la veille pour les gâteaux · Livraison ou retrait' },
      orderForm: { enabled: true, title: 'Gâteau personnalisé & buffets' },
      process: {
        enabled: true,
        title: 'Comment commander',
        steps: [
          { title: 'Choisissez', body: 'Un plat, un gâteau, ou un buffet complet.' },
          { title: 'Donnez la date', body: 'Et l\'heure de livraison ou de retrait.' },
          { title: 'On confirme', body: 'Par WhatsApp, avec le total.' },
        ],
      },
      whatsapp: { enabled: true, number: '+50900000000' },
    },
  },
};

// ── L'assemblage ────────────────────────────────────────────────────────────

export function isAtelierTemplate(v: unknown): v is (typeof ATELIER_TEMPLATES)[number] {
  return typeof v === 'string' && (ATELIER_TEMPLATES as readonly string[]).includes(v);
}

export function atelierStore(templateId: (typeof ATELIER_TEMPLATES)[number]): {
  settings:   StoreSettings;
  products:   StoreProduct[];
  categories: StoreCategory[];
} {
  const spec = SPECS[templateId];

  const categories: StoreCategory[] = spec.categories.map((name, i) => ({
    id: `demo-cat-${templateId}-${i}`,
    name,
    count: spec.products.filter((p) => p[3] === name).length,
  }));

  const products = spec.products.map((p, i) => product(templateId, i, p, categories));

  const settings: StoreSettings = {
    id:          `demo-${templateId}`,
    business_id: `demo-business-${templateId}`,
    slug:        templateId,
    is_active:   true,
    template_id: templateId,
    theme_config: spec.theme,
    custom_domain:   null,
    whatsapp_number: '+50900000000',
    published_at:    ago(30),
    store_name:  spec.name,
    tagline:     spec.tagline,
    logo_url:    null,
    banner_url:  null,
    banner_text: null,
    primary_color:   '#111111',
    secondary_color: '#666666',
    show_prices: true,
    show_stock:  true,
    currency:    spec.currency,
    payment_methods: ['MonCash', 'NatCash', 'Espèces à la livraison'],
    shipping_modes: [
      { id: 'pap',      label: 'Port-au-Prince',  price: 250, days: '24 h' },
      { id: 'province', label: 'Province',        price: 500, days: '48 h' },
      { id: 'retrait',  label: 'Retrait sur place', price: 0, days: 'Immédiat' },
    ],
    meta_title: null,
    meta_description: null,
    contact_email:   'contact@demo.test',
    contact_phone:   '+509 00 00 0000',
    contact_address: 'Rue de la Démonstration, Les Cayes',
    social_links: { instagram: 'demo', facebook: 'demo' },
  };

  return { settings, products, categories };
}

export const ATELIER_TEMPLATE_IDS: TemplateId[] = [...ATELIER_TEMPLATES];
