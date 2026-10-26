// ─────────────────────────────────────────────────────────────────────────────
// Réduire une photo avant de l'envoyer
//
// Une photo de reçu sortie d'un téléphone pèse 3 à 5 Mo. Sur une connexion
// haïtienne, au forfait, c'est le prix d'une recharge (§11.1, règle 12 :
// « faible consommation de données »). 1 280 px de large suffisent à lire un
// reçu ou une page de cahier ; le fichier tombe sous 300 Ko.
//
// Navigateur seulement. En cas d'échec, la photo d'origine part telle quelle :
// mieux vaut une preuve lourde qu'une preuve perdue.
// ─────────────────────────────────────────────────────────────────────────────

export async function compressImage(file: File, maxSide = 1280, quality = 0.72): Promise<Blob> {
  if (typeof window === 'undefined' || !file.type.startsWith('image/')) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

/** Le contenu d'une image en base64 (sans l'en-tête `data:`), pour l'envoyer à une action serveur. */
export async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}
