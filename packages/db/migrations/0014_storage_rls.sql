-- Storage RLS policies for product-images bucket
-- Allows authenticated (admin) users to upload, update, delete
-- Allows public read access for all files

-- Public read
CREATE POLICY "product-images: public read"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'product-images');

-- Authenticated users can upload
CREATE POLICY "product-images: auth upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'product-images');

-- Authenticated users can update
CREATE POLICY "product-images: auth update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'product-images');

-- Authenticated users can delete
CREATE POLICY "product-images: auth delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'product-images');
