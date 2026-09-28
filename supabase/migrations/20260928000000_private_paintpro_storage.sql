-- Files from a job can contain private photos. Keep object access scoped to its owner.
UPDATE storage.buckets SET public = false WHERE id = 'paintpro';

DROP POLICY IF EXISTS "Own files read" ON storage.objects;
CREATE POLICY "Own files read" ON storage.objects FOR SELECT
USING (bucket_id = 'paintpro' AND auth.uid()::text = (storage.foldername(name))[1]);
