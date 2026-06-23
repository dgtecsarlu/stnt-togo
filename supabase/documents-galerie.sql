-- ============================================================
-- STNT — Bibliothèque (privée) + Galerie (publique)
-- À exécuter dans : Supabase → SQL Editor → New query → Run
-- ============================================================

-- ------------------------------------------------------------
-- BIBLIOTHÈQUE (documents internes du syndicat) — PRIVÉ
-- ------------------------------------------------------------
create table if not exists public.documents (
  id           uuid primary key default gen_random_uuid(),
  titre        text not null,
  categorie    text not null default 'Général', -- Statuts, Congrès, Adhésion, Cartes, ...
  storage_path text not null,                    -- chemin dans le bucket privé "documents"
  created_at   timestamptz not null default now()
);
alter table public.documents enable row level security;
-- AUCUNE policy pour anon : la table n'est lisible QUE par la clé service
-- (utilisée par l'Edge Function après validation du code d'accès).

-- Bucket PRIVÉ pour les fichiers
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;
-- Bucket privé : pas de policy anon. L'Edge Function (clé service) génère des liens signés temporaires.

-- ------------------------------------------------------------
-- GALERIE (photos & vidéos des activités) — PUBLIC
-- ------------------------------------------------------------
create table if not exists public.galerie_medias (
  id            uuid primary key default gen_random_uuid(),
  titre         text,
  type          text not null default 'photo' check (type in ('photo','video')),
  storage_path  text not null,                  -- chemin dans le bucket public "galerie"
  date_activite date,
  created_at    timestamptz not null default now()
);
alter table public.galerie_medias enable row level security;
create policy "Lecture publique de la galerie"
  on public.galerie_medias for select to anon using ( true );

-- Bucket PUBLIC pour les médias
insert into storage.buckets (id, name, public)
values ('galerie', 'galerie', true)
on conflict (id) do nothing;
create policy "Lecture publique des medias galerie"
  on storage.objects for select to anon using ( bucket_id = 'galerie' );
