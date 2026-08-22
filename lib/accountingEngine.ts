export type CurrencyCode = 'HTG' | 'USD';

export type AccountClass = 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'ContraRevenue' | 'Expense';

export type AccountInfo = {
  code: string;
  name: string;
  name_ht: string;
  class: AccountClass;
  normalBalance: 'debit' | 'credit'; // solde normal
};

// ═════════════════════════════════════════════════════════════════════════════
// PLAN COMPTABLE HAÏTIEN (PCG-HT simplifié)
//
// SOURCE DE VÉRITÉ UNIQUE. Ce tableau doit refléter EXACTEMENT ce que
// fn_seed_chart_of_accounts() insère dans chart_of_accounts (migrations
// 20260526_accounting_engine_v4.sql + 20260817_accounting_plan_alignment.sql).
//
// Pourquoi c'est vital : createJournalEntry() résout un code → un account_id en
// base. Si le code existe en base sous un AUTRE nom, l'écriture part quand même
// — dans le mauvais compte, en silence. C'est ainsi qu'une dépense « Transport »
// se retrouvait débitée en 2100 Terrains. Ne jamais ajouter un code ici sans
// l'ajouter au seed SQL, et inversement.
// ═════════════════════════════════════════════════════════════════════════════

export const CHART_OF_ACCOUNTS: Record<string, AccountInfo> = {
  // ── CLASSE 1 — CAPITAUX PROPRES & DETTES FINANCIÈRES ──────────────────────
  '1010': { code: '1010', name: 'Capital social',              name_ht: 'Kapital sosyal',        class: 'Equity',    normalBalance: 'credit' },
  '1020': { code: '1020', name: 'Apports propriétaire',        name_ht: 'Apò pwopriyetè',        class: 'Equity',    normalBalance: 'credit' },
  '1070': { code: '1070', name: 'Réserves légales',            name_ht: 'Rezèv legal',           class: 'Equity',    normalBalance: 'credit' },
  '1080': { code: '1080', name: 'Report à nouveau',            name_ht: 'Rezilta ane anvan yo',  class: 'Equity',    normalBalance: 'credit' },
  '1300': { code: '1300', name: "Résultat de l'exercice",      name_ht: 'Pwofi/Pèt ane a',       class: 'Equity',    normalBalance: 'credit' },
  '1610': { code: '1610', name: 'Emprunts bancaires LT',       name_ht: 'Prè bank alontèm',      class: 'Liability', normalBalance: 'credit' },
  '1620': { code: '1620', name: 'Prêts long terme',            name_ht: 'Prè alontèm',           class: 'Liability', normalBalance: 'credit' },
  '1630': { code: '1630', name: 'Dettes sur immobilisations',  name_ht: 'Dèt sou ekipman',       class: 'Liability', normalBalance: 'credit' },

  // ── CLASSE 2 — IMMOBILISATIONS ────────────────────────────────────────────
  '2100': { code: '2100', name: 'Terrains',                    name_ht: 'Tèren',                 class: 'Asset',     normalBalance: 'debit' },
  '2200': { code: '2200', name: 'Bâtiments et constructions',  name_ht: 'Bilding ak konstriksyon', class: 'Asset',   normalBalance: 'debit' },
  '2300': { code: '2300', name: 'Installations techniques',    name_ht: 'Enstalasyon teknik',    class: 'Asset',     normalBalance: 'debit' },
  '2350': { code: '2350', name: 'Matériel et outillage',       name_ht: 'Zouti ak ekipman',      class: 'Asset',     normalBalance: 'debit' },
  '2410': { code: '2410', name: 'Mobilier de bureau',          name_ht: 'Mèb biwo',              class: 'Asset',     normalBalance: 'debit' },
  '2420': { code: '2420', name: 'Matériel informatique',       name_ht: 'Òdinatè ak pòtatif',    class: 'Asset',     normalBalance: 'debit' },
  '2430': { code: '2430', name: 'Téléphones professionnels',   name_ht: 'Telefòn biznis',        class: 'Asset',     normalBalance: 'debit' },
  '2440': { code: '2440', name: 'Équipements de magasin',      name_ht: 'Ekipman magazen',       class: 'Asset',     normalBalance: 'debit' },
  '2500': { code: '2500', name: 'Véhicules',                   name_ht: 'Machin ak moto',        class: 'Asset',     normalBalance: 'debit' },
  // Contra-actif : solde créditeur, vient en déduction des immobilisations.
  '2800': { code: '2800', name: 'Amortissements cumulés',      name_ht: 'Amòtisman kimilatif',   class: 'Asset',     normalBalance: 'credit' },

  // ── CLASSE 3 — STOCKS ─────────────────────────────────────────────────────
  '3100': { code: '3100', name: 'Matières premières',          name_ht: 'Matyè premyè',          class: 'Asset',     normalBalance: 'debit' },
  '3200': { code: '3200', name: 'Emballages consommables',     name_ht: 'Pakaj',                 class: 'Asset',     normalBalance: 'debit' },
  '3700': { code: '3700', name: 'Stocks de marchandises',      name_ht: 'Stòk machandiz',        class: 'Asset',     normalBalance: 'debit' },
  '3800': { code: '3800', name: 'Produits finis',              name_ht: 'Pwodui fini',           class: 'Asset',     normalBalance: 'debit' },
  '3900': { code: '3900', name: 'Dépréciation des stocks',     name_ht: 'Depresyasyon stòk',     class: 'Asset',     normalBalance: 'credit' },

  // ── CLASSE 4 — TIERS ──────────────────────────────────────────────────────
  '4010': { code: '4010', name: 'Fournisseurs — Dettes AP',    name_ht: 'Founisè yo dwe nou',    class: 'Liability', normalBalance: 'credit' },
  '4020': { code: '4020', name: 'Fournisseurs — Effets',       name_ht: 'Biye peyab',            class: 'Liability', normalBalance: 'credit' },
  '4110': { code: '4110', name: 'Clients — Créances AR',       name_ht: 'Kliyan ki dwe nou',     class: 'Asset',     normalBalance: 'debit' },
  '4120': { code: '4120', name: 'Clients douteux',             name_ht: 'Kliyan doutè',          class: 'Asset',     normalBalance: 'debit' },
  '4190': { code: '4190', name: 'Avances reçues clients',      name_ht: 'Avans kliyan resevwa',  class: 'Liability', normalBalance: 'credit' },
  '4200': { code: '4200', name: 'Personnel — Salaires à payer', name_ht: 'Salè pou peye',        class: 'Liability', normalBalance: 'credit' },
  '4300': { code: '4300', name: 'ONA / OFATMA à payer',        name_ht: 'ONA/OFATMA pou peye',   class: 'Liability', normalBalance: 'credit' },
  '4440': { code: '4440', name: 'Impôts et taxes à payer',     name_ht: 'Taks pou peye',         class: 'Liability', normalBalance: 'credit' },
  '4450': { code: '4450', name: 'TCA collectée',               name_ht: 'TCA kolekte',           class: 'Liability', normalBalance: 'credit' },
  '4460': { code: '4460', name: 'TCA déductible',              name_ht: 'TCA dediktib',          class: 'Asset',     normalBalance: 'debit' },
  // Contra-capitaux : solde débiteur, vient en déduction des capitaux propres.
  '4580': { code: '4580', name: 'Prélèvements propriétaire',   name_ht: 'Prelèvman pwopriyetè',  class: 'Equity',    normalBalance: 'debit' },
  '4710': { code: '4710', name: 'Avances versées fournisseurs', name_ht: 'Avans peye founisè',   class: 'Asset',     normalBalance: 'debit' },
  '4810': { code: '4810', name: 'Charges à payer',             name_ht: 'Chaj pou regle',        class: 'Liability', normalBalance: 'credit' },
  '4820': { code: '4820', name: "Produits constatés d'avance", name_ht: 'Revni avanse',          class: 'Liability', normalBalance: 'credit' },

  // ── CLASSE 5 — TRÉSORERIE ─────────────────────────────────────────────────
  '5110': { code: '5110', name: 'Banque — Compte HTG',         name_ht: 'Bank HTG',              class: 'Asset',     normalBalance: 'debit' },
  '5120': { code: '5120', name: 'Banque — Compte USD',         name_ht: 'Bank USD',              class: 'Asset',     normalBalance: 'debit' },
  '5121': { code: '5121', name: 'MonCash',                     name_ht: 'MonCash',               class: 'Asset',     normalBalance: 'debit' },
  '5122': { code: '5122', name: 'Natcash',                     name_ht: 'Natcash',               class: 'Asset',     normalBalance: 'debit' },
  '5123': { code: '5123', name: 'Carte bancaire (débit)',      name_ht: 'Kat bank',              class: 'Asset',     normalBalance: 'debit' },
  '5124': { code: '5124', name: 'Zelle / Virement USD',        name_ht: 'Zelle / Vire USD',      class: 'Asset',     normalBalance: 'debit' },
  '5310': { code: '5310', name: 'Caisse HTG',                  name_ht: 'Kès HTG',               class: 'Asset',     normalBalance: 'debit' },
  '5320': { code: '5320', name: 'Caisse USD',                  name_ht: 'Kès USD',               class: 'Asset',     normalBalance: 'debit' },
  '5330': { code: '5330', name: 'Petite caisse',               name_ht: 'Ti kès',                class: 'Asset',     normalBalance: 'debit' },
  '5900': { code: '5900', name: 'Virements internes',          name_ht: 'Transfè entèn',         class: 'Asset',     normalBalance: 'debit' },

  // ── CLASSE 6 — CHARGES ────────────────────────────────────────────────────
  '6010': { code: '6010', name: 'Achats de marchandises',      name_ht: 'Acha machandiz',        class: 'Expense',   normalBalance: 'debit' },
  '6020': { code: '6020', name: 'Variation de stocks',         name_ht: 'Chanjman stòk',         class: 'Expense',   normalBalance: 'debit' },
  '6030': { code: '6030', name: 'Achats matières premières',   name_ht: 'Acha matyè premyè',     class: 'Expense',   normalBalance: 'debit' },
  '6100': { code: '6100', name: 'Transport sur achats',        name_ht: 'Frè transpò sou acha',  class: 'Expense',   normalBalance: 'debit' },
  '6130': { code: '6130', name: 'Loyers et charges locatives', name_ht: 'Lwaye ak chaj lokasyon', class: 'Expense',  normalBalance: 'debit' },
  '6140': { code: '6140', name: 'Charges locatives diverses',  name_ht: 'Lòt chaj lokasyon',     class: 'Expense',   normalBalance: 'debit' },
  '6150': { code: '6150', name: 'Entretien et réparations',    name_ht: 'Antretyen ak reparasyon', class: 'Expense', normalBalance: 'debit' },
  '6160': { code: '6160', name: "Primes d'assurances",         name_ht: 'Asirans',               class: 'Expense',   normalBalance: 'debit' },
  '6180': { code: '6180', name: 'Eau et électricité',          name_ht: 'Dlo ak elektrisite',    class: 'Expense',   normalBalance: 'debit' },
  '6220': { code: '6220', name: 'Fournitures de bureau',       name_ht: 'Founiti biwo',          class: 'Expense',   normalBalance: 'debit' },
  '6230': { code: '6230', name: 'Publicité et marketing',      name_ht: 'Piblisite ak maketing', class: 'Expense',   normalBalance: 'debit' },
  '6240': { code: '6240', name: 'Transport et déplacements',   name_ht: 'Transpò ak deplasman',  class: 'Expense',   normalBalance: 'debit' },
  '6250': { code: '6250', name: 'Carburant et énergie',        name_ht: 'Gaz ak enèji',          class: 'Expense',   normalBalance: 'debit' },
  '6260': { code: '6260', name: 'Téléphone et Internet',       name_ht: 'Telefòn ak entènèt',    class: 'Expense',   normalBalance: 'debit' },
  '6270': { code: '6270', name: 'Frais bancaires',             name_ht: 'Frè bank ak finansye',  class: 'Expense',   normalBalance: 'debit' },
  '6280': { code: '6280', name: 'Commissions digitales',       name_ht: 'Komisyon dijital',      class: 'Expense',   normalBalance: 'debit' },
  '6290': { code: '6290', name: 'Charges diverses',            name_ht: 'Lòt depans divès',      class: 'Expense',   normalBalance: 'debit' },
  '6300': { code: '6300', name: 'Impôts et taxes directs',     name_ht: 'Taks dirèk',            class: 'Expense',   normalBalance: 'debit' },
  '6350': { code: '6350', name: 'Patente et licences',         name_ht: 'Patant ak lisans',      class: 'Expense',   normalBalance: 'debit' },
  '6410': { code: '6410', name: 'Salaires et traitements',     name_ht: 'Salè anplwaye',         class: 'Expense',   normalBalance: 'debit' },
  '6420': { code: '6420', name: 'Rémunérations dirigeants',    name_ht: 'Salè dirijan',          class: 'Expense',   normalBalance: 'debit' },
  '6430': { code: '6430', name: 'Charges sociales ONA',        name_ht: 'Chaj sosyal ONA/OFATMA', class: 'Expense',  normalBalance: 'debit' },
  '6500': { code: '6500', name: 'Autres charges opérationnelles', name_ht: 'Lòt depans operasyonèl', class: 'Expense', normalBalance: 'debit' },
  '6600': { code: '6600', name: 'Charges financières',         name_ht: 'Enterè ak chaj finansye', class: 'Expense',  normalBalance: 'debit' },
  '6700': { code: '6700', name: 'Charges exceptionnelles',     name_ht: 'Depans eksepsyonèl',    class: 'Expense',   normalBalance: 'debit' },
  '6810': { code: '6810', name: 'Dotations amortissements',    name_ht: 'Amòtisman chak mwa',    class: 'Expense',   normalBalance: 'debit' },
  // Inventaire permanent : la sortie de stock devient une charge à la vente.
  // C'est 6900 — pas 6030, qui est le compte d'achats de matières premières
  // déjà seedé sous ce nom en base.
  '6900': { code: '6900', name: 'Coût des marchandises vendues', name_ht: 'Pri machandiz vandi', class: 'Expense',   normalBalance: 'debit' },

  // ── CLASSE 7 — PRODUITS ───────────────────────────────────────────────────
  '7010':  { code: '7010',  name: 'Ventes de marchandises',    name_ht: 'Vant machandiz',        class: 'Revenue',   normalBalance: 'credit' },
  '7020':  { code: '7020',  name: 'Prestations de services',   name_ht: 'Sèvis bay',             class: 'Revenue',   normalBalance: 'credit' },
  '7030':  { code: '7030',  name: 'Revenus de livraison',      name_ht: 'Revni livrezon',        class: 'Revenue',   normalBalance: 'credit' },
  '7040':  { code: '7040',  name: 'Commissions et honoraires', name_ht: 'Komisyon ak onorè',     class: 'Revenue',   normalBalance: 'credit' },
  '7050':  { code: '7050',  name: 'Ventes en ligne',           name_ht: 'Vant sou entènèt',      class: 'Revenue',   normalBalance: 'credit' },
  '7090':  { code: '7090',  name: 'Autres revenus',            name_ht: 'Lòt revni',             class: 'Revenue',   normalBalance: 'credit' },
  '7091':  { code: '7091',  name: 'Revenus financiers',        name_ht: 'Revni finansye',        class: 'Revenue',   normalBalance: 'credit' },
  '7600':  { code: '7600',  name: 'Produits exceptionnels',    name_ht: 'Revni eksepsyonèl',     class: 'Revenue',   normalBalance: 'credit' },
  // Contra-produit : un retour client DIMINUE le chiffre d'affaires, il ne crée
  // pas une charge. Classe à part pour que le compte de résultat le soustraie du
  // CA au lieu de gonfler les charges.
  '7090R': { code: '7090R', name: 'Retours sur ventes',        name_ht: 'Retou sou vant',        class: 'ContraRevenue', normalBalance: 'debit' },
};

// Alias lisibles. Toute règle de comptabilisation passe par ici — jamais par un
// code en dur — pour qu'un changement de plan se fasse à un seul endroit.
export const ACCOUNT_CODES = {
  // Trésorerie
  CAISSE:           '5310',
  CAISSE_USD:       '5320',
  PETITE_CAISSE:    '5330',
  BANQUE:           '5110',
  BANQUE_USD:       '5120',
  MONCASH:          '5121',
  NATCASH:          '5122',
  CARTE:            '5123',
  VIREMENTS_INT:    '5900',
  // Tiers
  CLIENTS:          '4110',
  CLIENTS_DOUTEUX:  '4120',
  AVANCES_CLIENTS:  '4190',
  FOURNISSEURS:     '4010',
  AVANCES_FOURN:    '4710',
  SALAIRES_PASSIF:  '4200',
  DETTES_SOCIALES:  '4300',
  TAXES_PASSIF:     '4440',
  TCA_COLLECTEE:    '4450',
  TCA_DEDUCTIBLE:   '4460',
  CHARGES_A_PAYER:  '4810',
  // Stocks & immobilisations
  STOCK:            '3700',
  MATIERES:         '3100',
  TERRAINS:         '2100',
  BATIMENTS:        '2200',
  INSTALLATIONS:    '2300',
  EQUIPEMENTS:      '2350',
  MOBILIER:         '2410',
  INFORMATIQUE:     '2420',
  EQUIP_MAGASIN:    '2440',
  VEHICULES:        '2500',
  AMORT_CUMUL:      '2800',
  // Capitaux & financement
  CAPITAL:          '1010',
  APPORTS:          '1020',
  RESERVES:         '1070',
  REPORT_NOUVEAU:   '1080',
  RESULTAT:         '1300',
  PRELEVEMENTS:     '4580',
  EMPRUNTS:         '1610',
  // Produits
  VENTES:           '7010',
  SERVICES:         '7020',
  LIVRAISON:        '7030',
  VENTES_LIGNE:     '7050',
  REVENUS_DIVERS:   '7090',
  REVENUS_FIN:      '7091',
  RETOURS_VENTES:   '7090R',
  // Charges
  ACHATS:           '6010',
  ACHATS_MATIERES:  '6030',
  TRANSPORT_ACHATS: '6100',
  COUT_VENTES:      '6900',
  LOYER:            '6130',
  CHARGES_LOC:      '6140',
  ENTRETIEN:        '6150',
  ASSURANCE:        '6160',
  EAU_ELECTRICITE:  '6180',
  FOURNITURES_BR:   '6220',
  MARKETING:        '6230',
  TRANSPORT:        '6240',
  DEPLACEMENTS:     '6240',
  CARBURANT:        '6250',
  TELECOM:          '6260',
  BANCAIRE:         '6270',
  COMMISSIONS:      '6280',
  CHARGES_DIVERSES: '6290',
  IMPOTS:           '6300',
  PATENTE:          '6350',
  SALAIRES:         '6410',
  SOCIALES:         '6430',
  AUTRES_CHARGES:   '6500',
  FRAIS_FIN:        '6600',
  EXCEPTIONNEL:     '6700',
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
    debit: '5310', credit: '7010',
    label: 'Vente comptant — Débit Caisse / Crédit Ventes',
    label_ht: 'Vant kach — Debite Kès / Kredite Vant',
    category: 'Ventes', confidence: 'high',
  },
  {
    id: 'vente_credit',
    keywords: ['vente', 'vann', 'crédit', 'kredi', 'client', 'kliyan'],
    debit: '4110', credit: '7010',
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
    debit: '6240', credit: '5310',
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
    debit: '6180', credit: '5310',
    label: 'Eau/Électricité — Débit Eau-Électricité / Crédit Caisse',
    label_ht: 'Dlo/Elektrisite — Debite Dlo-Elektrisite / Kredite Kès',
    category: 'Services publics', confidence: 'medium',
  },

  // ── ASSURANCE ───────────────────────────────────────────────────────────────
  {
    id: 'assurance',
    keywords: ['assurance', 'asirans', 'polis'],
    debit: '6160', credit: '5310',
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
    debit: '6300', credit: '5310',
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
    debit: '2350', credit: '5310',
    label: 'Achat équipement — Débit Immobilisations / Crédit Caisse',
    label_ht: 'Acha ekipman — Debite Ekipman / Kredite Kès',
    category: 'Immobilisations', confidence: 'high',
  },
  {
    id: 'achat_equipement_credit',
    keywords: ['équipement', 'ekipman', 'machine', 'fournisseur', 'founisè'],
    debit: '2350', credit: '4010',
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
    debit: '5110', credit: '1610',
    label: 'Emprunt reçu — Débit Banque / Crédit Emprunts',
    label_ht: 'Prè resevwa — Debite Labank / Kredite Prè',
    category: 'Emprunt', confidence: 'high',
  },
  {
    id: 'remboursement_emprunt',
    keywords: ['remboursement', 'ranbousman', 'prèt', 'prè', 'emprunt'],
    debit: '1610', credit: '5110',
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
// CLASSIFICATION DES CATÉGORIES DE DÉPENSE → COMPTE
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Une dépense est-elle une IMMOBILISATION (à porter à l'actif) ou une CHARGE ?
 *
 * Seul un bien durable — qui sert plusieurs exercices — se capitalise. Une
 * fourniture de bureau, un trajet, un plein d'essence se consomment dans
 * l'exercice : ce sont des charges, quel que soit leur montant.
 *
 * Ce filtre était bien trop large ('bureau', 'fourniture', 'transport',
 * 'déplacement' y figuraient) : chaque dépense de transport partait au bilan en
 * immobilisation au lieu du compte de résultat. Résultat net surévalué, actif
 * gonflé, et rien pour le signaler.
 */
export function isAssetCategory(category: string): boolean {
  const c = category.toLowerCase();
  // « Mobilier de bureau » se capitalise ; « Fournitures de bureau » non — d'où
  // le test sur le mot porteur (mobilier/meuble), jamais sur 'bureau' seul.
  return (
    c.includes('équipement') || c.includes('equipement') || c.includes('ekipman') ||
    c.includes('machine') || c.includes('outillage') ||
    c.includes('immobilisation') || c.includes('imobilizasyon') ||
    c.includes('terrain') || c.includes('tèren') ||
    c.includes('bâtiment') || c.includes('batiment') || c.includes('batisman') ||
    c.includes('immobilier') || c.includes('imobilye') ||
    c.includes('véhicule') || c.includes('vehicule') || c.includes('veyikil') ||
    c.includes('voiture') || c.includes('moto') || c.includes('kamyon') ||
    c.includes('mobilier') || c.includes('meuble') || c.includes('mèb') ||
    c.includes('ordinateur') || c.includes('òdinatè') || c.includes('informatique') ||
    c.includes('laptop') || c.includes('pòtatif')
  );
}

/**
 * Quel compte d'immobilisation pour une catégorie capitalisable.
 * Renvoyait '2100' pour TOUT — or 2100 est « Terrains » en base : un ordinateur
 * finissait comptabilisé en terrain.
 */
export function classifyAssetCategory(category: string): string {
  const c = category.toLowerCase();
  if (c.includes('terrain') || c.includes('tèren')) return ACCOUNT_CODES.TERRAINS;
  if (c.includes('bâtiment') || c.includes('batiment') || c.includes('batisman') || c.includes('immobilier') || c.includes('imobilye'))
    return ACCOUNT_CODES.BATIMENTS;
  if (c.includes('véhicule') || c.includes('vehicule') || c.includes('veyikil') || c.includes('voiture') || c.includes('moto') || c.includes('kamyon'))
    return ACCOUNT_CODES.VEHICULES;
  if (c.includes('mobilier') || c.includes('meuble') || c.includes('mèb'))
    return ACCOUNT_CODES.MOBILIER;
  if (c.includes('ordinateur') || c.includes('òdinatè') || c.includes('informatique') || c.includes('laptop') || c.includes('pòtatif'))
    return ACCOUNT_CODES.INFORMATIQUE;
  if (c.includes('magasin') || c.includes('magazen') || c.includes('boutique'))
    return ACCOUNT_CODES.EQUIP_MAGASIN;
  // Équipement, machine, outillage, matériel : le cas général.
  return ACCOUNT_CODES.EQUIPEMENTS;
}

/**
 * Catégorie de dépense → compte de charge. N'est appelée que lorsque
 * isAssetCategory() a répondu non ; ne doit donc JAMAIS renvoyer un compte de
 * classe 2. Tout code renvoyé ici doit exister dans CHART_OF_ACCOUNTS.
 */
export function classifyExpenseCategory(category: string): string {
  const c = category.toLowerCase();
  if (c.includes('salaire') || c.includes('salary') || c.includes('salè') || c.includes('personnel'))
    return ACCOUNT_CODES.SALAIRES;
  if (c.includes('ona') || c.includes('ofatma') || c.includes('sosyal') || c.includes('social'))
    return ACCOUNT_CODES.SOCIALES;
  if (c.includes('loyer') || c.includes('rent') || c.includes('lwaye') || c.includes('local'))
    return ACCOUNT_CODES.LOYER;
  if (c.includes('fourniture') || c.includes('founiti') || c.includes('bureau') || c.includes('biwo'))
    return ACCOUNT_CODES.FOURNITURES_BR;
  if (c.includes('marketing') || c.includes('publicité') || c.includes('publicite') || c.includes('pub') || c.includes('makèting') || c.includes('reklam'))
    return ACCOUNT_CODES.MARKETING;
  if (c.includes('internet') || c.includes('téléphone') || c.includes('telephone') || c.includes('mobile') || c.includes('entènèt') || c.includes('telefòn'))
    return ACCOUNT_CODES.TELECOM;
  if (c.includes('carburant') || c.includes('essence') || c.includes('gazoline') || c.includes('gaz') || c.includes('énergie') || c.includes('enèji'))
    return ACCOUNT_CODES.CARBURANT;
  if (c.includes('transport') || c.includes('livraison') || c.includes('transpò') || c.includes('deplasman') || c.includes('déplacement') || c.includes('voyage'))
    return ACCOUNT_CODES.TRANSPORT;
  if (c.includes('intérêt') || c.includes('interet') || c.includes('enterè') || c.includes('financier'))
    return ACCOUNT_CODES.FRAIS_FIN;
  if (c.includes('bancaire') || c.includes('frè bank') || c.includes('frais bank'))
    return ACCOUNT_CODES.BANCAIRE;
  if (c.includes('stock') || c.includes('acha') || c.includes('achat') || c.includes('marchandise') || c.includes('machandiz'))
    return ACCOUNT_CODES.ACHATS;
  if (c.includes('électricité') || c.includes('electricite') || c.includes('elektrisite') || c.includes('eau') || c.includes('dlo') || c.includes('courant'))
    return ACCOUNT_CODES.EAU_ELECTRICITE;
  if (c.includes('assurance') || c.includes('asirans'))
    return ACCOUNT_CODES.ASSURANCE;
  if (c.includes('entretien') || c.includes('antretyen') || c.includes('reparation') || c.includes('réparation') || c.includes('maintenance'))
    return ACCOUNT_CODES.ENTRETIEN;
  if (c.includes('impôt') || c.includes('impot') || c.includes('enpo') || c.includes('taxe') || c.includes('taks') || c.includes('tca') || c.includes('dgi'))
    return ACCOUNT_CODES.IMPOTS;
  if (c.includes('patente') || c.includes('patant') || c.includes('licence') || c.includes('lisans'))
    return ACCOUNT_CODES.PATENTE;
  if (c.includes('amortissement') || c.includes('amòtisman') || c.includes('depreciation'))
    return ACCOUNT_CODES.DOT_AMORT;
  return ACCOUNT_CODES.AUTRES_CHARGES;
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

/**
 * Catégorie → compte, pour la colonne expense_categories.account_code.
 * Délègue au même arbre de décision que la comptabilisation : deux tables de
 * correspondance divergentes, c'est la garantie que la catégorie affichée et
 * le compte réellement débité finissent par se contredire.
 */
export function mapCategoryToAccountCode(category: string): string {
  return isAssetCategory(category)
    ? classifyAssetCategory(category)
    : classifyExpenseCategory(category);
}

export function isBankPaymentMethod(method?: string): boolean {
  if (!method) return false;
  const normalized = method.toLowerCase();
  return ['moncash', 'natcash', 'card', 'virement', 'transfer', 'bank'].some((term) => normalized.includes(term));
}
