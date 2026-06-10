export type CurrencyCode = 'HTG' | 'USD';

export type AccountClass = 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense';

export type AccountInfo = {
  code: string;
  name: string;
  name_ht: string;
  class: AccountClass;
  normalBalance: 'debit' | 'credit'; // solde normal
};

// ═════════════════════════════════════════════════════════════════════════════
// PLAN COMPTABLE HAÏTIEN (PCG-HT simplifié)
// ═════════════════════════════════════════════════════════════════════════════

export const CHART_OF_ACCOUNTS: Record<string, AccountInfo> = {
  // ── ACTIFS ────────────────────────────────────────────────────────────────
  '5310': { code: '5310', name: 'Caisse HTG',              name_ht: 'Kès HTG',              class: 'Asset',    normalBalance: 'debit' },
  '5320': { code: '5320', name: 'Caisse USD',              name_ht: 'Kès USD',              class: 'Asset',    normalBalance: 'debit' },
  '5110': { code: '5110', name: 'Banque HTG',              name_ht: 'Bank HTG',             class: 'Asset',    normalBalance: 'debit' },
  '5120': { code: '5120', name: 'Banque USD',              name_ht: 'Bank USD',             class: 'Asset',    normalBalance: 'debit' },
  '5121': { code: '5121', name: 'MonCash',                 name_ht: 'MonCash',              class: 'Asset',    normalBalance: 'debit' },
  '5122': { code: '5122', name: 'Natcash',                 name_ht: 'Natcash',              class: 'Asset',    normalBalance: 'debit' },
  '5123': { code: '5123', name: 'Carte Bancaire',          name_ht: 'Kat Bank',             class: 'Asset',    normalBalance: 'debit' },
  '4110': { code: '4110', name: 'Clients',                 name_ht: 'Kliyan',               class: 'Asset',    normalBalance: 'debit' },
  '3700': { code: '3700', name: 'Stock Marchandises',      name_ht: 'Stòk Machandiz',       class: 'Asset',    normalBalance: 'debit' },
  '2100': { code: '2100', name: 'Immobilisations',         name_ht: 'Ekipman',              class: 'Asset',    normalBalance: 'debit' },
  '2800': { code: '2800', name: 'Amortissements cumulés',  name_ht: 'Amòtisman kumile',     class: 'Asset',    normalBalance: 'credit' },
  '4710': { code: '4710', name: 'Avances et acomptes',     name_ht: 'Avans peye',           class: 'Asset',    normalBalance: 'debit' },

  // ── PASSIFS ───────────────────────────────────────────────────────────────
  '4010': { code: '4010', name: 'Fournisseurs',            name_ht: 'Founisè',              class: 'Liability', normalBalance: 'credit' },
  '4020': { code: '4020', name: 'Effets à payer',          name_ht: 'Biye peyab',           class: 'Liability', normalBalance: 'credit' },
  '4200': { code: '4200', name: 'Salaires à Payer',        name_ht: 'Salè pou Peye',        class: 'Liability', normalBalance: 'credit' },
  '4440': { code: '4440', name: 'Impôts à Payer',          name_ht: 'Taks pou Peye',        class: 'Liability', normalBalance: 'credit' },
  '4450': { code: '4450', name: 'TVA / TCA collectée',     name_ht: 'TCA kolekte',          class: 'Liability', normalBalance: 'credit' },
  '1640': { code: '1640', name: 'Emprunts bancaires',      name_ht: 'Prè Bank',             class: 'Liability', normalBalance: 'credit' },
  '4190': { code: '4190', name: 'Avances clients reçues',  name_ht: 'Avans kliyan',         class: 'Liability', normalBalance: 'credit' },

  // ── CAPITAUX PROPRES ──────────────────────────────────────────────────────
  '1010': { code: '1010', name: 'Capital social',          name_ht: 'Kapital sosyal',       class: 'Equity',   normalBalance: 'credit' },
  '1070': { code: '1070', name: 'Report à nouveau',        name_ht: 'Rezilta anvan',        class: 'Equity',   normalBalance: 'credit' },
  '1300': { code: '1300', name: 'Résultat Net',            name_ht: 'Pwofi ane a',          class: 'Equity',   normalBalance: 'credit' },
  '4580': { code: '4580', name: 'Prélèvements',            name_ht: 'Prelèvman',            class: 'Equity',   normalBalance: 'debit' },

  // ── REVENUS ───────────────────────────────────────────────────────────────
  '4100': { code: '4100', name: 'Ventes de marchandises',  name_ht: 'Vant machandiz',       class: 'Revenue',  normalBalance: 'credit' },
  '7010': { code: '7010', name: 'Ventes (ancien)',         name_ht: 'Vant (ansyen)',         class: 'Revenue',  normalBalance: 'credit' },
  '7020': { code: '7020', name: 'Prestations de services', name_ht: 'Sèvis',               class: 'Revenue',  normalBalance: 'credit' },
  '7090': { code: '7090', name: 'Autres revenus',          name_ht: 'Lòt revni',            class: 'Revenue',  normalBalance: 'credit' },
  '7091': { code: '7091', name: 'Revenus financiers',      name_ht: 'Revni finansye',       class: 'Revenue',  normalBalance: 'credit' },

  // ── CHARGES (6xxx PCG-HT) ─────────────────────────────────────────────────
  '6010': { code: '6010', name: 'Achats Marchandises',     name_ht: 'Acha Machandiz',       class: 'Expense',  normalBalance: 'debit' },
  '6020': { code: '6020', name: 'Variation de stocks',     name_ht: 'Chanjman stock',       class: 'Expense',  normalBalance: 'debit' },
  '6130': { code: '6130', name: 'Loyer',                   name_ht: 'Lwaye',                class: 'Expense',  normalBalance: 'debit' },
  '6150': { code: '6150', name: 'Entretien & Réparations', name_ht: 'Antretyen',            class: 'Expense',  normalBalance: 'debit' },
  '6160': { code: '6160', name: 'Eau & Électricité',       name_ht: 'Dlo & Elektrisite',    class: 'Expense',  normalBalance: 'debit' },
  '6170': { code: '6170', name: 'Assurance',               name_ht: 'Asirans',              class: 'Expense',  normalBalance: 'debit' },
  '6220': { code: '6220', name: 'Fournitures Bureau',      name_ht: 'Founiti Biwo',         class: 'Expense',  normalBalance: 'debit' },
  '6230': { code: '6230', name: 'Publicité & Marketing',   name_ht: 'Piblisite',            class: 'Expense',  normalBalance: 'debit' },
  '6240': { code: '6240', name: 'Transport',               name_ht: 'Transpò',              class: 'Expense',  normalBalance: 'debit' },
  '6250': { code: '6250', name: 'Carburant',               name_ht: 'Gaz',                  class: 'Expense',  normalBalance: 'debit' },
  '6260': { code: '6260', name: 'Téléphone & Internet',    name_ht: 'Telefòn',              class: 'Expense',  normalBalance: 'debit' },
  '6270': { code: '6270', name: 'Frais Bancaires',         name_ht: 'Frè Bank',             class: 'Expense',  normalBalance: 'debit' },
  '6350': { code: '6350', name: 'Impôts & Taxes',          name_ht: 'Enpo & Taks',          class: 'Expense',  normalBalance: 'debit' },
  '6410': { code: '6410', name: 'Salaires',                name_ht: 'Salè',                 class: 'Expense',  normalBalance: 'debit' },
  '6430': { code: '6430', name: 'Charges Sociales',        name_ht: 'Chaj Sosyal',          class: 'Expense',  normalBalance: 'debit' },
  '6500': { code: '6500', name: 'Autres Charges',          name_ht: 'Lòt Chaj',             class: 'Expense',  normalBalance: 'debit' },
  '6600': { code: '6600', name: 'Charges Financières',     name_ht: 'Enterè prè',           class: 'Expense',  normalBalance: 'debit' },
  '6810': { code: '6810', name: 'Dotations Amortissement', name_ht: 'Amòtisman',            class: 'Expense',  normalBalance: 'debit' },
};

export const ACCOUNT_CODES = {
  CAISSE:           '5310',
  BANQUE:           '5110',
  CLIENTS:          '4110',
  STOCK:            '3700',
  FOURNITURES_ACT:  '4710',
  EQUIPEMENTS:      '2100',
  MOBILIER:         '2410',
  VEHICULES:        '2500',
  BATIMENTS:        '2200',
  TERRAINS:         '2100',
  AMORT_CUMUL:      '2800',
  FOURNISSEURS:     '4010',
  SALAIRES_PASSIF:  '4200',
  TAXES_PASSIF:     '4440',
  DETTES_SOCIALES:  '6430',
  EMPRUNTS:         '1640',
  CAPITAL:          '1010',
  PRELEVEMENTS:     '4580',
  RESERVES:         '1070',
  RESULTAT:         '1300',
  VENTES:           '4100',
  SERVICES:         '7020',
  REVENUS_DIVERS:   '7090',
  ACHATS:           '6010',
  LOYER:            '6130',
  ENTRETIEN:        '6150',
  EAU_ELECTRICITE:  '6160',
  ASSURANCE:        '6170',
  FOURNITURES_BR:   '6220',
  MARKETING:        '6230',
  TRANSPORT:        '6240',
  DEPLACEMENTS:     '6240',
  TELECOM:          '6260',
  BANCAIRE:         '6270',
  IMPOTS:           '6350',
  SALAIRES:         '6410',
  SOCIALES:         '6430',
  AUTRES_CHARGES:   '6500',
  FRAIS_FIN:        '6600',
  DOT_AMORT:        '6810',
} as const;

// ═════════════════════════════════════════════════════════════════════════════
// RÈGLES DE COMPTABILISATION — toutes les transactions possibles
// ═════════════════════════════════════════════════════════════════════════════

export type TransactionRule = {
  id: string;
  keywords: string[];      // mots-clés pour le matching
  debit: string;           // code compte débit
  credit: string;          // code compte crédit
  label: string;           // description FR
  label_ht: string;        // description HT
  category: string;        // catégorie pour affichage
  confidence: 'high' | 'medium' | 'low';
};

export const TRANSACTION_RULES: TransactionRule[] = [
  // ── VENTES ──────────────────────────────────────────────────────────────────
  {
    id: 'vente_cash',
    keywords: ['vente', 'vann', 'vant', 'encaissement', 'cash', 'comptant', 'kach'],
    debit: '5310', credit: '4100',
    label: 'Vente comptant — Débit Caisse / Crédit Ventes',
    label_ht: 'Vant kach — Debite Kès / Kredite Vant',
    category: 'Ventes', confidence: 'high',
  },
  {
    id: 'vente_credit',
    keywords: ['vente', 'vann', 'crédit', 'kredi', 'client', 'kliyan'],
    debit: '4110', credit: '4100',
    label: 'Vente à crédit — Débit Clients / Crédit Ventes',
    label_ht: 'Vant a kredi — Debite Kliyan / Kredite Vant',
    category: 'Ventes crédit', confidence: 'high',
  },
  {
    id: 'vente_service',
    keywords: ['service', 'sèvis', 'prestation', 'honoraire', 'konsiltasyon', 'consultation'],
    debit: '5310', credit: '7020',
    label: 'Prestation service — Débit Caisse / Crédit Services',
    label_ht: 'Sèvis — Debite Kès / Kredite Sèvis',
    category: 'Services', confidence: 'medium',
  },

  // ── ENCAISSEMENT CLIENTS ────────────────────────────────────────────────────
  {
    id: 'encaissement_client',
    keywords: ['encaissement', 'paiement', 'client', 'kliyan', 'ranbousman', 'règlement'],
    debit: '5310', credit: '4110',
    label: 'Encaissement client — Débit Caisse / Crédit Clients',
    label_ht: 'Peman kliyan — Debite Kès / Kredite Kliyan',
    category: 'Encaissement', confidence: 'medium',
  },

  // ── ACHATS STOCK ────────────────────────────────────────────────────────────
  {
    id: 'achat_cash',
    keywords: ['achat', 'acha', 'stock', 'marchandise', 'machandiz', 'fournisseur'],
    debit: '6010', credit: '5310',
    label: 'Achat stock comptant — Débit Achats / Crédit Caisse',
    label_ht: 'Acha kach — Debite Acha / Kredite Kès',
    category: 'Achats stock', confidence: 'high',
  },
  {
    id: 'achat_credit',
    keywords: ['achat', 'acha', 'stock', 'crédit', 'kredi', 'fournisseur', 'founisè'],
    debit: '6010', credit: '4010',
    label: 'Achat stock à crédit — Débit Achats / Crédit Fournisseurs',
    label_ht: 'Acha a kredi — Debite Acha / Kredite Founisè',
    category: 'Achats stock', confidence: 'high',
  },

  // ── PAIEMENT FOURNISSEUR ────────────────────────────────────────────────────
  {
    id: 'paiement_fournisseur',
    keywords: ['paiement', 'règlement', 'founisè', 'fournisseur', 'peman', 'faktì'],
    debit: '4010', credit: '5110',
    label: 'Paiement fournisseur — Débit Fournisseurs / Crédit Banque',
    label_ht: 'Peman founisè — Debite Founisè / Kredite Labank',
    category: 'Paiement fournisseur', confidence: 'high',
  },

  // ── SALAIRES ────────────────────────────────────────────────────────────────
  {
    id: 'salaire',
    keywords: ['salaire', 'salè', 'salary', 'personnel', 'anplwaye', 'employé'],
    debit: '6410', credit: '5110',
    label: 'Salaires — Débit Salaires / Crédit Banque',
    label_ht: 'Salè — Debite Salè / Kredite Labank',
    category: 'Salaires', confidence: 'high',
  },
  {
    id: 'salaire_cash',
    keywords: ['salaire', 'salè', 'employé', 'anplwaye', 'espèces', 'kach', 'cash'],
    debit: '6410', credit: '5310',
    label: 'Salaires espèces — Débit Salaires / Crédit Caisse',
    label_ht: 'Salè kach — Debite Salè / Kredite Kès',
    category: 'Salaires', confidence: 'high',
  },

  // ── LOYER ───────────────────────────────────────────────────────────────────
  {
    id: 'loyer',
    keywords: ['loyer', 'lwaye', 'rent', 'local', 'bail'],
    debit: '6130', credit: '5310',
    label: 'Loyer — Débit Loyer / Crédit Caisse',
    label_ht: 'Lwaye — Debite Lwaye / Kredite Kès',
    category: 'Loyer', confidence: 'high',
  },

  // ── FOURNITURES BUREAU ──────────────────────────────────────────────────────
  {
    id: 'fourniture_bureau_cash',
    keywords: ['fourniture', 'bureau', 'founiti', 'biwo'],
    debit: '6220', credit: '5310',
    label: 'Fournitures bureau — Débit Fournitures Bureau / Crédit Caisse',
    label_ht: 'Founiti biwo — Debite Founiti Biwo / Kredite Kès',
    category: 'Fournitures', confidence: 'high',
  },
  {
    id: 'fourniture_bureau_credit',
    keywords: ['fourniture', 'bureau', 'founiti', 'biwo', 'crédit', 'kredi'],
    debit: '6220', credit: '4010',
    label: 'Fournitures bureau à crédit — Débit Fournitures Bureau / Crédit Fournisseurs',
    label_ht: 'Founiti biwo a kredi — Debite Founiti Biwo / Kredite Founisè',
    category: 'Fournitures', confidence: 'medium',
  },

  // ── MARKETING — PUBLICITÉ ───────────────────────────────────────────────────
  {
    id: 'marketing',
    keywords: ['marketing', 'publicité', 'piblisite', 'pub', 'makèting', 'reklam'],
    debit: '6230', credit: '5310',
    label: 'Publicité — Débit Marketing / Crédit Caisse',
    label_ht: 'Piblisite — Debite Maketing / Kredite Kès',
    category: 'Marketing', confidence: 'high',
  },

  // ── TRANSPORT ───────────────────────────────────────────────────────────────
  {
    id: 'transport',
    keywords: ['transport', 'transpò', 'livraison', 'veyikil', 'véhicule', 'vehicule'],
    debit: '6240', credit: '5310',
    label: 'Transport — Débit Transport / Crédit Caisse',
    label_ht: 'Transpò — Debite Transpò / Kredite Kès',
    category: 'Transport', confidence: 'high',
  },

  // ── DÉPLACEMENTS ────────────────────────────────────────────────────────────
  {
    id: 'deplacement',
    keywords: ['déplacement', 'deplasman', 'voyage', 'vwajaj', 'mission'],
    debit: '6250', credit: '5310',
    label: 'Déplacements — Débit Déplacements / Crédit Caisse',
    label_ht: 'Deplasman — Debite Deplasman / Kredite Kès',
    category: 'Déplacements', confidence: 'medium',
  },

  // ── TÉLÉPHONE / INTERNET ────────────────────────────────────────────────────
  {
    id: 'telecom',
    keywords: ['internet', 'téléphone', 'telephone', 'telefòn', 'mobile', 'entènèt', 'télécom', 'telecom', 'abonnement'],
    debit: '6260', credit: '5310',
    label: 'Télécom/Internet — Débit Télécommunications / Crédit Caisse',
    label_ht: 'Telefòn/Entènèt — Debite Telekom / Kredite Kès',
    category: 'Télécommunications', confidence: 'high',
  },

  // ── EAU — ÉLECTRICITÉ ───────────────────────────────────────────────────────
  {
    id: 'eau_electricite',
    keywords: ['électricité', 'electricite', 'elektrisite', 'ed', 'eau', 'dlo', 'faktè'],
    debit: '6160', credit: '5310',
    label: 'Eau/Électricité — Débit Eau-Électricité / Crédit Caisse',
    label_ht: 'Dlo/Elektrisite — Debite Dlo-Elektrisite / Kredite Kès',
    category: 'Services publics', confidence: 'medium',
  },

  // ── ASSURANCE ───────────────────────────────────────────────────────────────
  {
    id: 'assurance',
    keywords: ['assurance', 'asirans', 'polis'],
    debit: '6170', credit: '5310',
    label: 'Assurance — Débit Assurance / Crédit Caisse',
    label_ht: 'Asirans — Debite Asirans / Kredite Kès',
    category: 'Assurance', confidence: 'medium',
  },

  // ── ENTRETIEN — RÉPARATIONS ─────────────────────────────────────────────────
  {
    id: 'entretien',
    keywords: ['entretien', 'antretyen', 'réparation', 'reparation', 'maintenance'],
    debit: '6150', credit: '5310',
    label: 'Entretien — Débit Entretien / Crédit Caisse',
    label_ht: 'Antretyen — Debite Antretyen / Kredite Kès',
    category: 'Entretien', confidence: 'medium',
  },

  // ── SERVICES BANCAIRES ───────────────────────────────────────────────────────
  {
    id: 'frais_bancaire',
    keywords: ['bancaire', 'banque', 'labank', 'frais', 'frè', 'compte', 'kont'],
    debit: '6270', credit: '5110',
    label: 'Frais bancaires — Débit Services Bancaires / Crédit Banque',
    label_ht: 'Frè labank — Debite Sèvis Labank / Kredite Labank',
    category: 'Frais bancaires', confidence: 'medium',
  },

  // ── IMPÔTS — TAXES ──────────────────────────────────────────────────────────
  {
    id: 'impot_taxe',
    keywords: ['impôt', 'enpo', 'taxe', 'taks', 'tca', 'dgi'],
    debit: '6350', credit: '5310',
    label: 'Impôts/Taxes — Débit Impôts / Crédit Caisse',
    label_ht: 'Enpo/Taks — Debite Enpo / Kredite Kès',
    category: 'Impôts', confidence: 'high',
  },

  // ── CHARGES SOCIALES ─────────────────────────────────────────────────────────
  {
    id: 'charge_sociale',
    keywords: ['social', 'ona', 'ofatma', 'sosyal'],
    debit: '6430', credit: '5310',
    label: 'Charges sociales — Débit Sociales / Crédit Caisse',
    label_ht: 'Chaj sosyal — Debite Sosyal / Kredite Kès',
    category: 'Charges sociales', confidence: 'medium',
  },

  // ── ACHAT ACTIF / IMMOBILISATION ─────────────────────────────────────────────
  {
    id: 'achat_equipement',
    keywords: ['équipement', 'ekipman', 'machine', 'matériel', 'materiel'],
    debit: '2100', credit: '5310',
    label: 'Achat équipement — Débit Immobilisations / Crédit Caisse',
    label_ht: 'Acha ekipman — Debite Ekipman / Kredite Kès',
    category: 'Immobilisations', confidence: 'high',
  },
  {
    id: 'achat_equipement_credit',
    keywords: ['équipement', 'ekipman', 'machine', 'fournisseur', 'founisè'],
    debit: '2100', credit: '4010',
    label: 'Équipement à crédit — Débit Immobilisations / Crédit Fournisseurs',
    label_ht: 'Ekipman a kredi — Debite Ekipman / Kredite Founisè',
    category: 'Immobilisations', confidence: 'medium',
  },
  {
    id: 'achat_vehicule',
    keywords: ['véhicule', 'vehicule', 'veyikil', 'voiture', 'vwati'],
    debit: '2500', credit: '5310',
    label: 'Achat véhicule — Débit Véhicules / Crédit Caisse',
    label_ht: 'Acha veyikil — Debite Veyikil / Kredite Kès',
    category: 'Immobilisations', confidence: 'high',
  },
  {
    id: 'achat_terrain',
    keywords: ['terrain', 'tèren', 'tè', 'land'],
    debit: '2100', credit: '5110',
    label: 'Achat terrain — Débit Terrains / Crédit Banque',
    label_ht: 'Acha tè — Debite Tèren / Kredite Labank',
    category: 'Immobilisations', confidence: 'high',
  },
  {
    id: 'achat_batiment',
    keywords: ['bâtiment', 'batiment', 'batisman', 'building', 'bilding'],
    debit: '2200', credit: '5110',
    label: 'Achat bâtiment — Débit Bâtiments / Crédit Banque',
    label_ht: 'Acha bilding — Debite Bilding / Kredite Labank',
    category: 'Immobilisations', confidence: 'high',
  },
  {
    id: 'achat_mobilier',
    keywords: ['mobilier', 'mèb', 'meuble', 'furniture'],
    debit: '2410', credit: '5310',
    label: 'Achat mobilier — Débit Mobilier / Crédit Caisse',
    label_ht: 'Acha mèb — Debite Mèb / Kredite Kès',
    category: 'Immobilisations', confidence: 'medium',
  },

  // ── FINANCEMENT ──────────────────────────────────────────────────────────────
  {
    id: 'apport_capital',
    keywords: ['capital', 'apport', 'depot', 'depo', 'kapital', 'investissement', 'envestisman'],
    debit: '5310', credit: '1010',
    label: 'Apport capital — Débit Caisse / Crédit Capital',
    label_ht: 'Apò kapital — Debite Kès / Kredite Kapital',
    category: 'Capital', confidence: 'high',
  },
  {
    id: 'apport_capital_banque',
    keywords: ['capital', 'apport', 'banque', 'labank', 'virement'],
    debit: '5110', credit: '1010',
    label: 'Apport capital banque — Débit Banque / Crédit Capital',
    label_ht: 'Apò kapital labank — Debite Labank / Kredite Kapital',
    category: 'Capital', confidence: 'high',
  },
  {
    id: 'prelevement',
    keywords: ['prélèvement', 'prelevman', 'retrait', 'retrè', 'propriétaire', 'pwopriyetè', 'owner'],
    debit: '4580', credit: '5310',
    label: 'Prélèvement propriétaire — Débit Prélèvements / Crédit Caisse',
    label_ht: 'Retrè pwopriyetè — Debite Retrè / Kredite Kès',
    category: 'Capital', confidence: 'medium',
  },

  // ── EMPRUNTS ─────────────────────────────────────────────────────────────────
  {
    id: 'emprunt',
    keywords: ['emprunt', 'prêt', 'prè', 'loan', 'kredi bank'],
    debit: '5110', credit: '1640',
    label: 'Emprunt reçu — Débit Banque / Crédit Emprunts',
    label_ht: 'Prè resevwa — Debite Labank / Kredite Prè',
    category: 'Emprunt', confidence: 'high',
  },
  {
    id: 'remboursement_emprunt',
    keywords: ['remboursement', 'ranbousman', 'prèt', 'prè', 'emprunt'],
    debit: '1640', credit: '5110',
    label: 'Remboursement emprunt — Débit Emprunts / Crédit Banque',
    label_ht: 'Ranbousman prè — Debite Prè / Kredite Labank',
    category: 'Remboursement', confidence: 'high',
  },

  // ── INTÉRÊTS ─────────────────────────────────────────────────────────────────
  {
    id: 'interet',
    keywords: ['intérêt', 'enterè', 'financier', 'finansye'],
    debit: '6600', credit: '5110',
    label: 'Intérêts payés — Débit Frais Financiers / Crédit Banque',
    label_ht: 'Enterè peye — Debite Frè Finansye / Kredite Labank',
    category: 'Intérêts', confidence: 'medium',
  },

  // ── AMORTISSEMENT ────────────────────────────────────────────────────────────
  {
    id: 'amortissement',
    keywords: ['amortissement', 'amòtisman', 'depreciation', 'depresyasyon'],
    debit: '6810', credit: '2800',
    label: 'Dotation amortissement — Débit Amortissement / Crédit Amort cumulés',
    label_ht: 'Amòtisman — Debite Amòtisman / Kredite Amòtisman Kumile',
    category: 'Amortissement', confidence: 'medium',
  },

  // ── VIREMENT INTERNE ─────────────────────────────────────────────────────────
  {
    id: 'virement_banque_caisse',
    keywords: ['virement', 'transfer', 'transfè', 'retrait', 'banque', 'labank', 'caisse', 'kès'],
    debit: '5310', credit: '5110',
    label: 'Virement Banque→Caisse — Débit Caisse / Crédit Banque',
    label_ht: 'Transfè Labank→Kès — Debite Kès / Kredite Labank',
    category: 'Virement interne', confidence: 'medium',
  },
  {
    id: 'virement_caisse_banque',
    keywords: ['dépôt', 'depo', 'banque', 'labank', 'caisse', 'kès'],
    debit: '5110', credit: '5310',
    label: 'Dépôt Banque — Débit Banque / Crédit Caisse',
    label_ht: 'Depo Labank — Debite Labank / Kredite Kès',
    category: 'Virement interne', confidence: 'medium',
  },

  // ── REVENUS DIVERS ──────────────────────────────────────────────────────────
  {
    id: 'revenu_divers',
    keywords: ['revenu', 'revni', 'divers', 'divès', 'autre', 'lòt', 'intérêt reçu', 'enterè resevwa', 'lwaye resevwa'],
    debit: '5310', credit: '7090',
    label: 'Revenu divers — Débit Caisse / Crédit Revenus Divers',
    label_ht: 'Revni divès — Debite Kès / Kredite Revni Divès',
    category: 'Revenus divers', confidence: 'medium',
  },

  // ── CHARGES DIVERSES ─────────────────────────────────────────────────────────
  {
    id: 'charge_diverse',
    keywords: ['charge', 'chaj', 'dépense', 'depans', 'diverse', 'divès'],
    debit: '6500', credit: '5310',
    label: 'Charge diverse — Débit Autres Charges / Crédit Caisse',
    label_ht: 'Chaj divès — Debite Lòt Chaj / Kredite Kès',
    category: 'Charges diverses', confidence: 'low',
  },
];

// ═════════════════════════════════════════════════════════════════════════════
// CLASSIFICATEUR UNIFIÉ
// ═════════════════════════════════════════════════════════════════════════════

export function classifyTransaction(text: string): TransactionRule {
  const t = text.toLowerCase();

  // Parcourir toutes les règles, trouver la meilleure correspondance
  let bestMatch: TransactionRule | null = null;
  let bestScore = 0;

  for (const rule of TRANSACTION_RULES) {
    let score = 0;
    for (const kw of rule.keywords) {
      if (t.includes(kw)) score += 1;
    }
    if (score > 0) {
      // Bonus si le texte contient plusieurs mots-clés de la même règle
      if (score > bestScore) {
        bestScore = score;
        bestMatch = rule;
      }
    }
  }

  return bestMatch ?? TRANSACTION_RULES.find(r => r.id === 'charge_diverse')!;
}

// ═════════════════════════════════════════════════════════════════════════════
// FONCTIONS EXISTANTES PRÉSERVÉES (mais utilisant le nouveau système)
// ═════════════════════════════════════════════════════════════════════════════

export function isAssetCategory(category: string): boolean {
  const c = category.toLowerCase();
  return (
    c.includes('équipement') || c.includes('ekipman') ||
    c.includes('matériel') || c.includes('materiel') ||
    c.includes('machine') ||
    c.includes('immobilisation') || c.includes('imobilizasyon') ||
    c.includes('terrain') || c.includes('tèren') ||
    c.includes('bâtiment') || c.includes('batiment') || c.includes('batisman') ||
    c.includes('immobilier') || c.includes('imobilye') ||
    c.includes('véhicule') || c.includes('vehicule') || c.includes('veyikil') ||
    c.includes('bureau') ||
    c.includes('fourniture') || c.includes('founiti') ||
    c.includes('transport') || c.includes('transpò') ||
    c.includes('déplacement') || c.includes('deplasman')
  );
}

export function classifyAssetCategory(_category: string): string {
  return '2100';
}

export function classifyExpenseCategory(category: string): string {
  const c = category.toLowerCase();
  if (c.includes('salaire') || c.includes('salary') || c.includes('salè'))
    return '6410';
  if (c.includes('loyer') || c.includes('rent') || c.includes('lwaye'))
    return '6130';
  if (c.includes('fourniture') || c.includes('bureau') || c.includes('founitì'))
    return '6220';
  if (c.includes('marketing') || c.includes('publicité') || c.includes('pub') || c.includes('makèting'))
    return '6230';
  if (c.includes('internet') || c.includes('téléphone') || c.includes('mobile') || c.includes('entènèt'))
    return '6260';
  if (c.includes('transport') || c.includes('livraison') || c.includes('transpò') || c.includes('vehicule') || c.includes('véhicule') || c.includes('veyikil') || c.includes('deplasman') || c.includes('déplacement'))
    return '6240';
  if (c.includes('intérêt') || c.includes('enterè') || c.includes('intérêts'))
    return '6600';
  if (c.includes('stock') || c.includes('acha') || c.includes('achat') || c.includes('marchandise'))
    return '6010';
  if (c.includes('équipement') || c.includes('matériel') || c.includes('ekipman'))
    return '2100';
  if (c.includes('électricité') || c.includes('electricite') || c.includes('elektrisite') || c.includes('eau') || c.includes('dlo'))
    return '6160';
  if (c.includes('assurance') || c.includes('asirans'))
    return '6170';
  if (c.includes('entretien') || c.includes('antretyen') || c.includes('reparation') || c.includes('réparation'))
    return '6150';
  return '6500';
}

export async function classifyFromText(text: string): Promise<{
  debitCode: string;
  creditCode: string;
  category: string;
  suggestion: string;
}> {
  const rule = classifyTransaction(text);
  return {
    debitCode: rule.debit,
    creditCode: rule.credit,
    category: rule.category,
    suggestion: rule.label,
  };
}

export async function suggestJournalEntryFromText(
  text: string,
  amount: number,
  currency: 'HTG' | 'USD' = 'HTG'
): Promise<{
  description: string;
  category: string;
  suggestion: string;
  currency: CurrencyCode;
  lines: { account_code: string; description: string; debit: number; credit: number }[];
}> {
  const classification = await classifyFromText(text);
  const lines = [
    { account_code: classification.debitCode, description: `${classification.category} — ${text}`, debit: amount, credit: 0 },
    { account_code: classification.creditCode, description: `${classification.category} — ${text}`, debit: 0, credit: amount },
  ];
  return {
    description: text,
    category: classification.category,
    suggestion: classification.suggestion,
    currency,
    lines,
  };
}

export function convertCurrency(amount: number, from: CurrencyCode, to: CurrencyCode, rate: number): number {
  if (from === to) return amount;
  if (from === 'USD' && to === 'HTG') return amount * rate;
  if (from === 'HTG' && to === 'USD') return amount / rate;
  return amount;
}

export function normalizeToBaseCurrency(
  amount: number, currency: CurrencyCode, baseCurrency: CurrencyCode, exchangeRate: number
): { amountInBase: number; exchangeRate: number } {
  return {
    amountInBase: convertCurrency(amount, currency, baseCurrency, exchangeRate),
    exchangeRate,
  };
}

export function mapCategoryToAccountCode(category: string): string {
  const c = category.toLowerCase();
  if (c.includes('salaire') || c.includes('salary') || c.includes('salè') || c.includes('personnel'))
    return '6410';
  if (c.includes('loyer') || c.includes('rent') || c.includes('lwaye') || c.includes('local'))
    return '6130';
  if (c.includes('marketing') || c.includes('publicité') || c.includes('pub') || c.includes('makèting'))
    return '6230';
  if (c.includes('internet') || c.includes('téléphone') || c.includes('telephone') || c.includes('mobile') || c.includes('entènèt') || c.includes('télécom') || c.includes('telecom'))
    return '6260';
  if (c.includes('électricité') || c.includes('electricite') || c.includes('elektrisite') || c.includes('eau') || c.includes('dlo'))
    return '6160';
  if (c.includes('transport') || c.includes('livraison') || c.includes('transpò') || c.includes('vehicule') || c.includes('véhicule') || c.includes('veyikil') || c.includes('deplasman') || c.includes('déplacement'))
    return '6240';
  if (c.includes('bancaire') || c.includes('bank') || c.includes('banque'))
    return '6270';
  if (c.includes('fourniture') || c.includes('bureau') || c.includes('founitì') || c.includes('matériel') || c.includes('materiel'))
    return '6220';
  if (c.includes('intérêt') || c.includes('enterè') || c.includes('intérêts') || c.includes('financier'))
    return '6600';
  if (c.includes('équipement') || c.includes('ekipman') || c.includes('machine') || c.includes('immobilisation'))
    return '2100';
  if (c.includes('impôt') || c.includes('taxe') || c.includes('tca') || c.includes('enpo') || c.includes('tax'))
    return '6350';
  if (c.includes('social') || c.includes('ona') || c.includes('ofatma'))
    return '6430';
  if (c.includes('assurance') || c.includes('asirans'))
    return '6170';
  if (c.includes('amortissement') || c.includes('amòtisman') || c.includes('depreciation'))
    return '6810';
  if (c.includes('stock') || c.includes('acha') || c.includes('achat') || c.includes('marchandise'))
    return '6010';
  if (c.includes('maintenance') || c.includes('entretien') || c.includes('reparation') || c.includes('réparation') || c.includes('antretyen'))
    return '6150';
  if (c.includes('remboursement') || c.includes('ranbousman') || c.includes('pret') || c.includes('prè'))
    return '6600';
  if (c.includes('terrain') || c.includes('batiment') || c.includes('bâtiment') || c.includes('tèren') || c.includes('batisman') || c.includes('immobilier'))
    return '1210';
  if (c.includes('véhicule') || c.includes('vehicule') || c.includes('veyikil') || c.includes('voiture'))
    return '2500';
  return '6500';
}

export function isBankPaymentMethod(method?: string): boolean {
  if (!method) return false;
  const normalized = method.toLowerCase();
  return ['moncash', 'natcash', 'card', 'virement', 'transfer', 'bank'].some((term) => normalized.includes(term));
}
