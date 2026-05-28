-- ── product-images storage bucket ─────────────────────────────────────────────
-- Kouri sa a nan Supabase Dashboard → SQL Editor yon sèl fwa.

-- 1. Kreye bucket la (public = URL dirèk disponib san siyen)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-images',
  'product-images',
  true,
  5242880,           -- 5 MB
  ARRAY['image/jpeg','image/png','image/webp','image/gif','image/jpg']
)
ON CONFLICT (id) DO NOTHING;

-- 2. Politk pou chak itilizatè otantifye ka telechaje fichye pa yo
DROP POLICY IF EXISTS "product_images_upload" ON storage.objects;
CREATE POLICY "product_images_upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'product-images');

-- 3. Tout moun ka li / wè imaj yo (bucket public)
DROP POLICY IF EXISTS "product_images_read" ON storage.objects;
CREATE POLICY "product_images_read"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'product-images');

-- 4. Itilizatè ka efase oswa mete ajou pwòp imaj pa yo
DROP POLICY IF EXISTS "product_images_owner" ON storage.objects;
CREATE POLICY "product_images_owner"
  ON storage.objects FOR ALL
  TO authenticated
  USING (bucket_id = 'product-images' AND auth.uid()::text = (storage.foldername(name))[1]);
