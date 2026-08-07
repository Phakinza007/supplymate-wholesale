insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('product-images', 'product-images', true,  5242880,
     array['image/jpeg','image/png','image/webp','image/avif']),
  ('payment-slips',  'payment-slips',  false, 5242880,
     array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do nothing;

-- product-images/{product_id}/{uuid}.ext  -- grouped by product for prefix-delete
-- payment-slips/{user_id}/{order_id}/{epoch}-{uuid}.ext
--   user_id MUST be the first path segment: storage RLS can only reason about
--   the object path string, so this keeps ownership checks a pure string
--   compare with no join. Re-uploads never overwrite, so a rejected slip
--   stays as evidence.

-- product-images: world-readable, admin-writable
create policy "product-images: public read" on storage.objects for select to anon, authenticated
  using (bucket_id = 'product-images');
create policy "product-images: admin write" on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and public.is_admin());
create policy "product-images: admin update" on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and public.is_admin())
  with check (bucket_id = 'product-images' and public.is_admin());
create policy "product-images: admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and public.is_admin());

-- payment-slips: private (bucket public=false, so there is no unauthenticated
-- read path at all, even for a leaked exact path). Access is signed URLs only.
create policy "payment-slips: user uploads into own folder" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'payment-slips'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "payment-slips: user reads own" on storage.objects for select to authenticated
  using (
    bucket_id = 'payment-slips'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "payment-slips: admin reads all" on storage.objects for select to authenticated
  using (bucket_id = 'payment-slips' and public.is_admin());
create policy "payment-slips: admin deletes" on storage.objects for delete to authenticated
  using (bucket_id = 'payment-slips' and public.is_admin());
-- No UPDATE and no user DELETE on payment-slips: a slip is immutable evidence.
-- No anon policy at all on payment-slips.
