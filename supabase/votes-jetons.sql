-- ============================================================
-- STNT — VOTE des AG par JETON UNIQUE d'invitation (coexiste avec
-- le vote par compte email + mot de passe déjà déployé).
-- À exécuter dans : Supabase → SQL Editor → New query → Run
-- Prérequis : votes.sql déjà exécuté.
-- Webmaster : Ing. BODJONA Bataka Pignanti
--
-- Principe :
--   - Chaque membre VALIDÉ reçoit par email un lien contenant un
--     jeton unique (vote.html?jeton=XXXX). Aucun compte à créer.
--   - On ne stocke JAMAIS le jeton en clair : seul son hachage
--     SHA-256 est en base. Le jeton en clair n'existe qu'au moment
--     de la génération (le temps d'envoyer l'email).
--   - SECRET DU VOTE inchangé : émargement et bulletin restent
--     séparés, tables sans policy (seules les Edge Functions y
--     accèdent via la clé service).
--   - ANTI-DOUBLE-VOTE UNIFIÉ : l'émargement est ancré sur
--     l'identité MEMBRE (membre_id), pas sur le compte. Ainsi un
--     membre qui possède à la fois un jeton ET un compte email ne
--     peut voter qu'une seule fois par scrutin.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Émargement : ancrage canonique sur le MEMBRE
-- ------------------------------------------------------------
-- user_id devient facultatif (un votant par jeton n'a pas de compte Auth)
alter table public.vote_emargements
  alter column user_id drop not null;

-- lien vers le membre (identité canonique de l'électeur)
alter table public.vote_emargements
  add column if not exists membre_id uuid references public.membres(id) on delete cascade;

-- canal d'émargement, pour la traçabilité : 'compte' | 'jeton'
alter table public.vote_emargements
  add column if not exists canal text;

-- Une seule voix par membre et par scrutin, quel que soit le canal.
-- (Postgres autorise plusieurs NULL dans un index unique : les
--  anciennes lignes sans membre_id ne se gênent pas.)
create unique index if not exists uq_emargement_membre
  on public.vote_emargements(vote_id, membre_id);

-- ------------------------------------------------------------
-- 2. Bulletins : permettre le nominatif pour un votant par jeton
-- ------------------------------------------------------------
alter table public.vote_bulletins
  add column if not exists votant_membre_id uuid references public.membres(id) on delete set null;

-- ------------------------------------------------------------
-- 3. Invitations (jetons)
-- ------------------------------------------------------------
create table if not exists public.vote_invitations (
  id          uuid primary key default gen_random_uuid(),
  membre_id   uuid not null unique references public.membres(id) on delete cascade,
  token_hash  text not null unique,         -- SHA-256 hex du jeton, jamais le jeton en clair
  envoye_le   timestamptz,                  -- date d'envoi de l'email
  ouvert_le   timestamptz,                  -- 1re ouverture du lien
  revoque     boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists idx_invitations_membre on public.vote_invitations(membre_id);

-- ------------------------------------------------------------
-- 4. Sécurité — RLS verrouillée (aucune policy)
--    => inaccessible à anon ET authenticated. Seules les Edge
--       Functions (clé service_role) lisent/écrivent les jetons.
-- ------------------------------------------------------------
alter table public.vote_invitations enable row level security;

-- Pas de policy volontairement : table 100 % côté serveur.
