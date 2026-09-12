// ─────────────────────────────────────────────────────────────────────────────
// Rapatrier chez nous l'image rendue par le fournisseur
//
// Les fournisseurs servent leurs résultats depuis un stockage temporaire :
// quelques heures chez Replicate, davantage ailleurs, mais jamais pour
// toujours. Enregistrer leur URL telle quelle dans `products.enhanced_image_url`
// revient à programmer la disparition des photos de la boutique dans deux
// jours — et le marchand ne fera pas le lien avec une retouche faite la semaine
// d'avant.
//
// Ce module vit à part des routes : Next.js n'autorise dans un fichier de route
// que les exports qu'il connaît (GET, POST, runtime…), et une fonction utilitaire
// exportée depuis `route.ts` casse la compilation.
// ─────────────────────────────────────────────────────────────────────────────

import { getSupabaseService } from '../supabaseServiceClient';

const BUCKET = 'store-assets';

export async function storeResultImage(
  sourceUrl: string,
  businessId: string,
  jobId: string,
  // Le balayage du cron quotidien raccourcit ce délai : il partage soixante
  // secondes avec les autres balayages de la nuit.
  timeoutMs = 30_000,
): Promise<string> {
  const res = await fetch(sourceUrl, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`Image du fournisseur illisible (${res.status}).`);

  const contentType = res.headers.get('content-type') ?? 'image/png';
  const extension =
    contentType.includes('webp') ? 'webp' :
    contentType.includes('jpeg') ? 'jpg'  :
    'png';

  const bytes = new Uint8Array(await res.arrayBuffer());

  // Le premier segment du chemin est le business_id : c'est exactement ce que
  // la politique RLS du bucket vérifie (`storage.foldername(name))[1]`).
  const path = `${businessId}/ai/${jobId}.${extension}`;

  const svc = getSupabaseService();
  const { error } = await svc.storage
    .from(BUCKET)
    .upload(path, bytes, {
      contentType,
      upsert: true,
      // L'image ne changera plus : son nom porte l'identifiant du travail.
      cacheControl: '31536000',
    });

  if (error) throw new Error(`Enregistrement impossible : ${error.message}`);

  const { data } = svc.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
