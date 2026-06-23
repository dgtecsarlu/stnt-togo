-- ============================================================
-- STNT — Stockage des photos d'identité des membres
-- À exécuter dans : Supabase → SQL Editor → New query → Run
-- (active l'upload de la photo depuis le formulaire d'adhésion)
-- ============================================================

-- 1. Créer le bucket public "membres-photos"
insert into storage.buckets (id, name, public)
values ('membres-photos', 'membres-photos', true)
on conflict (id) do nothing;

-- 2. Autoriser le public (anon) à téléverser une photo dans ce bucket
create policy "Upload public photo membre"
  on storage.objects for insert
  to anon
  with check ( bucket_id = 'membres-photos' );

-- 3. Lecture publique des photos (bucket public)
create policy "Lecture publique photos membres"
  on storage.objects for select
  to anon
  using ( bucket_id = 'membres-photos' );
