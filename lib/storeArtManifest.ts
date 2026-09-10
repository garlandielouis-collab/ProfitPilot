// ─────────────────────────────────────────────────────────────────────────────
// FICHIER GÉNÉRÉ — ne pas modifier à la main.
//   node scripts/gabarits-photos.js
//
// Les gabarits qui ont une photographie de bannière dans `public/gabarits/photo`.
// Ceux qui n'y sont pas retombent sur leur composition dessinée : une bannière
// absente ne doit jamais être la conséquence d'un fichier qui manque.
// ─────────────────────────────────────────────────────────────────────────────

export const TEMPLATES_WITH_PHOTO: readonly string[] = [
  'agri',
  'animalerie',
  'artisan',
  'beauty',
  'fashion',
  'flash',
  'food',
  'luxe',
  'magazine',
  'maker',
  'modern',
  'monoproduit',
  'naturel',
  'proximite',
  'retail',
  'services',
  'skincare',
  'social',
  'sport',
  'tech',
  'traiteur',
  'wellness',
];

export function hasPhoto(templateId: string): boolean {
  return TEMPLATES_WITH_PHOTO.includes(templateId);
}
