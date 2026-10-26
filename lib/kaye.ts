// ─────────────────────────────────────────────────────────────────────────────
// Le « kaye » du marchand — son métier et ses réglages du quotidien
//
// Étude de marché inversée, §3 et §11 : un seul produit, un seul message, mais
// « un métier, un écran ». Un coiffeur ne voit jamais l'écran de stock d'une
// quincaillerie, et inversement. Le métier se choisit à l'installation —
// Machandiz (commerce), Sèvis (service) ou Toulède (les deux, comme la jeune
// propriétaire du Nord-Est qui coiffe ET vend des produits de beauté).
//
// ── Où ça vit ───────────────────────────────────────────────────────────────
//
// Dans `businesses.settings` (JSONB, présent depuis le schéma v2 et jusqu'ici
// inutilisé), sous la clé `kaye`. Pas de colonne nouvelle : une colonne
// absente fait échouer toute la lecture du commerce tant que la migration
// n'est pas collée, et l'application entière tomberait avec elle. Un champ
// JSON absent, lui, retombe sur sa valeur par défaut.
//
// Ce module n'importe rien : il est lu par le serveur ET par les écrans.
// ─────────────────────────────────────────────────────────────────────────────

export type Trade = 'commerce' | 'service' | 'both';

export type KayeSettings = {
  /** `null` tant que le marchand n'a pas choisi : il voit alors le commerce. */
  trade: Trade | null;
  /** L'heure du bilan du soir, heure d'Haïti (0–23). */
  eveningHour: number;
  eveningEnabled: boolean;
  /** Le salaire hebdomadaire que le patron se fixe (F04), en gourdes. */
  ownerWeeklySalary: number | null;
  /** Imports du cahier par photo déjà faits (F10) : un seul à Esansyel. */
  notebookImportsUsed: number;
  /** L'installation guidée (§11.3) est faite. */
  setupDone: boolean;
};

export const DEFAULT_KAYE: KayeSettings = {
  trade: null,
  // 19 h : la boutique ferme, le marchand a son téléphone en main. Modifiable.
  eveningHour: 19,
  eveningEnabled: true,
  ownerWeeklySalary: null,
  notebookImportsUsed: 0,
  setupDone: false,
};

const TRADE_VALUES: readonly Trade[] = ['commerce', 'service', 'both'];

export function normalizeTrade(value: unknown): Trade | null {
  return TRADE_VALUES.includes(value as Trade) ? (value as Trade) : null;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Les réglages du kaye, lus dans `businesses.settings` — jamais d'erreur. */
export function readKaye(settings: unknown): KayeSettings {
  const raw = asObject(asObject(settings).kaye);
  const hour = Number(raw.eveningHour);
  const salary = raw.ownerWeeklySalary === null || raw.ownerWeeklySalary === undefined
    ? null
    : Number(raw.ownerWeeklySalary);
  const imports = Number(raw.notebookImportsUsed);

  return {
    trade:               normalizeTrade(raw.trade),
    eveningHour:         Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : DEFAULT_KAYE.eveningHour,
    eveningEnabled:      raw.eveningEnabled === false ? false : true,
    ownerWeeklySalary:   salary !== null && Number.isFinite(salary) && salary > 0 ? salary : null,
    notebookImportsUsed: Number.isFinite(imports) && imports > 0 ? Math.floor(imports) : 0,
    setupDone:           raw.setupDone === true,
  };
}

/**
 * Le JSON `settings` complet après modification du kaye. Les autres clés de
 * `settings` sont conservées telles quelles : ce module n'en est pas le seul
 * propriétaire, et un écrasement effacerait les réglages d'un autre écran.
 */
export function mergeKaye(settings: unknown, patch: Partial<KayeSettings>): Record<string, unknown> {
  const base = asObject(settings);
  const next = { ...readKaye(base), ...patch };
  return { ...base, kaye: readKaye({ kaye: next }) };
}

// ── Ce que le métier montre ─────────────────────────────────────────────────

/** Le stock, les fournisseurs, les produits qui dorment : le commerce. */
export function showsStock(trade: Trade | null): boolean {
  return trade !== 'service';
}

/** Fiches de travail, consommables, rendez-vous : le service. */
export function showsServiceTools(trade: Trade | null): boolean {
  return trade === 'service' || trade === 'both';
}

/** Le gros bouton de l'accueil : VANN pour un commerce, SÈVIS pour un service. */
export function saleWord(trade: Trade | null): { fr: string; ht: string } {
  return trade === 'service'
    ? { fr: 'SERVICE', ht: 'SÈVIS' }
    : { fr: 'VENTE', ht: 'VANN' };
}

/** Les trois métiers, tels que l'installation les propose. */
export const TRADES: { key: Trade; label: { fr: string; ht: string }; hint: { fr: string; ht: string } }[] = [
  {
    key: 'commerce',
    label: { fr: 'Commerce', ht: 'Machandiz' },
    hint:  { fr: 'Je vends des marchandises : boutik, dépôt, marché, quincaillerie', ht: 'Mwen vann machandiz : boutik, depo, mache, kenkayri' },
  },
  {
    key: 'service',
    label: { fr: 'Service', ht: 'Sèvis' },
    hint:  { fr: 'Je vends mon travail : salon, couture, réparation, mécanique', ht: 'Mwen vann travay mwen : salon, koutiri, reparasyon, mekanik' },
  },
  {
    key: 'both',
    label: { fr: 'Les deux', ht: 'Toulède' },
    hint:  { fr: 'Je fais un service ET je vends des produits', ht: 'Mwen bay sèvis E mwen vann pwodwi' },
  },
];
