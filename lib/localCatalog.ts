// ─────────────────────────────────────────────────────────────────────────────
// Le catalogue local de l'installation (étude de marché inversée, §11.3)
//
// « Choisir ses 10 produits ou services les plus fréquents dans un catalogue
// local déjà rempli. » Les NOMS sont ceux du comptoir haïtien — sachè dlo, ti
// pen, kat Digicel, mèch, ekran — pour que le marchand se reconnaisse au
// premier écran, sans rien taper.
//
// Aucun PRIX n'est prérempli : un prix affiché est une promesse, et un prix
// deviné ici deviendrait son prix de vente s'il ne le corrigeait pas. Le
// marchand tape le sien, une fois, pour les seuls favoris qu'il a choisis.
// ─────────────────────────────────────────────────────────────────────────────

export type CatalogItem = { name: string; kind: 'product' | 'service' };

export const COMMERCE_CATALOG: CatalogItem[] = [
  'Sachè dlo', 'Ti pen', 'Kola', 'Ji', 'Byè', 'Kleren', 'Dlo bokit',
  'Diri (mamit)', 'Pwa (mamit)', 'Mayi moulen (mamit)', 'Farin (mamit)', 'Sik (mamit)', 'Lwil (galon)',
  'Espageti', 'Sòs tomat', 'Lèt an poud', 'Kafe', 'Sèl', 'Bonbon', 'Ze',
  'Savon', 'Fab', 'Kat Digicel', 'Kat Natcom', 'Bouji', 'Alimèt', 'Chabon (mamit)', 'Gaz (galon)',
].map((name) => ({ name, kind: 'product' as const }));

export const SERVICE_CATALOG: CatalogItem[] = [
  'Kout cheve', 'Bab', 'Kout cheve + bab', 'Tès', 'Mèch', 'Defrisaj', 'Kwafi', 'Manikir', 'Pedikir',
  'Koud rad', 'Ranje rad', 'Ranje ekran telefòn', 'Chanje batri', 'Ranje pò chaj', 'Debloke telefòn',
  'Vidanj moto', 'Ranje kawotchou', 'Fotokopi', 'Enpresyon', 'Foto idantite', 'Tape dokiman', 'Repa (plat)',
].map((name) => ({ name, kind: 'service' as const }));

/** Le catalogue de départ, selon le métier choisi. */
export function catalogFor(trade: 'commerce' | 'service' | 'both' | null): CatalogItem[] {
  if (trade === 'service') return SERVICE_CATALOG;
  if (trade === 'both') return [...SERVICE_CATALOG, ...COMMERCE_CATALOG];
  return COMMERCE_CATALOG;
}

/** « Ses 10 produits ou services les plus fréquents. » */
export const SETUP_FAVORITES = 10;
