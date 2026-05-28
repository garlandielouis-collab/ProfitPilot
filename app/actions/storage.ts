'use server';

import { supabaseServer } from '../../lib/supabaseServerClient';

export async function uploadProductImageAction(file: File, productId?: string) {
  if (!file) {
    throw new Error('Fichier manquant');
  }

  const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
  const filename = `${productId ?? 'product'}-${Date.now()}-${sanitizedName}`;
  const path = `product-images/${filename}`;
  const bucket = 'product-images';

  const { error: uploadError } = await supabaseServer.storage.from(bucket).upload(path, file, {
    upsert: true,
  });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const { data } = supabaseServer.storage.from(bucket).getPublicUrl(path);

  if (!data?.publicUrl) {
    throw new Error('Impossible de récupérer l\'URL de l\'image');
  }

  return data.publicUrl;
}
