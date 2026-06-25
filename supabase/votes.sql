-- ============================================================
-- STNT — Module de VOTE des Assemblées Générales
-- À exécuter dans : Supabase → SQL Editor → New query → Run
-- Webmaster : Ing. BODJONA Bataka Pignanti
--
-- Principe de sécurité :
--   - La liste électorale = membres dont statut_validation = 'validee'.
--   - Chaque électeur a un compte Supabase Auth lié à sa ligne membres.
--   - SECRET DU VOTE : l'ÉMARGEMENT (qui a voté) et le BULLETIN (le choix)
--     sont dans DEUX tables séparées. Les deux sont en RLS SANS aucune
--     policy : aucun client ne peut les lire/écrire. Seules les Edge
--     Functions (clé service) y accèdent. Impossible de relier un membre
--     à son bulletin sur un scrutin secret.
--   - Anti-double-vote : contrainte d'unicité sur l'émargement.
--   - Quorum + résultats : calculés au dépouillement et publiés dans
--     la table `votes` (lisible par les membres connectés).
-- ============================================================

-- ------------------------------------------------------------
-- 0. Lien compte Auth  ↔  membre
-- ------------------------------------------------------------
alter table public.membres
  add column if not exists user_id uuid unique references auth.users(id) on delete set null;

create index if not exists idx_membres_user on public.membres(user_id);

-- ------------------------------------------------------------
-- 1. SCRUTINS
-- ------------------------------------------------------------
create table if not exists public.votes (
  id              uuid primary key default gen_random_uuid(),
  titre           text not null,
  description     text,
  -- liste des options proposées, ex. ["Pour","Contre","Abstention"]
  options         jsonb not null default '["Pour","Contre","Abstention"]'::jsonb,
  -- 'Abstention' n'est pas comptée dans les suffrages exprimés
  abstention      text default 'Abstention',
  -- secret = bulletin anonyme (par défaut) ; sinon vote nominatif
  secret          boolean not null default true,
  -- quorum requis, en % du corps électoral (membres validés)
  quorum_pct      numeric not null default 50 check (quorum_pct >= 0 and quorum_pct <= 100),
  -- type de majorité pour adopter : 'simple' | 'absolue' | 'deux_tiers'
  majorite        text not null default 'simple' check (majorite in ('simple','absolue','deux_tiers')),
  statut          text not null default 'brouillon' check (statut in ('brouillon','ouvert','clos')),
  ouvre_le        timestamptz,
  ferme_le        timestamptz,
  -- instantané du corps électoral + résultats, figés au dépouillement
  corps_electoral int,
  total_votants   int,
  resultats       jsonb,      -- { "Pour": 12, "Contre": 3, "Abstention": 1 }
  quorum_atteint  boolean,
  adopte          boolean,
  cloture_le      timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists idx_votes_statut on public.votes(statut);

-- ------------------------------------------------------------
-- 2. ÉMARGEMENT  (qui a voté — sert au quorum + anti-double-vote)
--    JAMAIS relié au choix sur un scrutin secret.
-- ------------------------------------------------------------
create table if not exists public.vote_emargements (
  id          uuid primary key default gen_random_uuid(),
  vote_id     uuid not null references public.votes(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (vote_id, user_id)        -- un membre = une seule voix
);

-- ------------------------------------------------------------
-- 3. BULLETINS  (le choix exprimé)
--    votant_id renseigné UNIQUEMENT si le scrutin est nominatif,
--    NULL si secret (anonymat total).
-- ------------------------------------------------------------
create table if not exists public.vote_bulletins (
  id          uuid primary key default gen_random_uuid(),
  vote_id     uuid not null references public.votes(id) on delete cascade,
  choix       text not null,
  votant_id   uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_bulletins_vote on public.vote_bulletins(vote_id);

-- ============================================================
-- SÉCURITÉ — Row Level Security
-- ============================================================
alter table public.votes            enable row level security;
alter table public.vote_emargements enable row level security;
alter table public.vote_bulletins   enable row level security;

-- Les membres CONNECTÉS peuvent voir les scrutins ouverts ou clos
-- (les brouillons restent invisibles). Lecture seule.
drop policy if exists "Lecture des scrutins par les membres" on public.votes;
create policy "Lecture des scrutins par les membres"
  on public.votes for select
  to authenticated
  using ( statut in ('ouvert','clos') );

-- vote_emargements et vote_bulletins : AUCUNE policy.
-- => inaccessibles à anon ET authenticated. Seules les Edge Functions
--    (clé service_role, qui contourne la RLS) y lisent/écrivent.
--    C'est ce qui garantit le secret du vote et l'intégrité du dépouillement.

-- ------------------------------------------------------------
-- Comment le bureau gère les scrutins (en attendant le dashboard SG) :
--   - via la console bureau du site (vote-bureau.html), protégée par
--     le secret VOTE_ADMIN_CODE (Edge Function "vote-admin") ;
--   - ou directement ici en SQL.
-- ------------------------------------------------------------
