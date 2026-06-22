-- ============================================================
-- STNT — Schéma de base de données Supabase (PostgreSQL)
-- À exécuter dans : Supabase → SQL Editor → New query → Run
-- Webmaster : Ing. BODJONA Bataka Pignanti
-- ============================================================

-- ------------------------------------------------------------
-- 1. MEMBRES (anciens adhérents + nouveaux)
-- ------------------------------------------------------------
create table if not exists public.membres (
  id                 uuid primary key default gen_random_uuid(),
  nom_complet        text not null,
  email              text unique not null,
  telephone          text,
  ville              text,
  region             text check (region in ('Maritime','Plateaux','Centrale','Kara','Savanes')),
  metier             text,
  photo_url          text,
  -- 'ancien' = adhérent déjà membre avant la plateforme ; 'nouveau' = inscription en ligne
  type_adhesion      text not null default 'nouveau' check (type_adhesion in ('ancien','nouveau')),
  statut_cotisation  text not null default 'en_attente' check (statut_cotisation in ('en_attente','a_jour','expire')),
  consentement_rgpd  boolean not null default false,
  date_adhesion      timestamptz not null default now(),
  created_at         timestamptz not null default now()
);

create index if not exists idx_membres_region on public.membres(region);
create index if not exists idx_membres_statut on public.membres(statut_cotisation);

-- ------------------------------------------------------------
-- 2. TONTINE EN LIGNE (groupes de 10, épargne rotative)
-- ------------------------------------------------------------
create table if not exists public.tontine_groupes (
  id                  uuid primary key default gen_random_uuid(),
  nom                 text not null,
  capacite            int not null default 10 check (capacite between 2 and 10),
  montant_cotisation  numeric not null,
  frequence           text not null default 'mensuelle' check (frequence in ('hebdomadaire','mensuelle')),
  statut              text not null default 'ouvert' check (statut in ('ouvert','complet','en_cours','termine')),
  created_at          timestamptz not null default now()
);

create table if not exists public.tontine_membres (
  id          uuid primary key default gen_random_uuid(),
  groupe_id   uuid not null references public.tontine_groupes(id) on delete cascade,
  membre_id   uuid not null references public.membres(id) on delete cascade,
  position    int not null check (position between 1 and 10), -- ordre de réception de la cagnotte
  statut      text not null default 'actif' check (statut in ('actif','retire')),
  created_at  timestamptz not null default now(),
  unique (groupe_id, position),
  unique (groupe_id, membre_id)
);

create table if not exists public.tontine_cotisations (
  id          uuid primary key default gen_random_uuid(),
  groupe_id   uuid not null references public.tontine_groupes(id) on delete cascade,
  membre_id   uuid not null references public.membres(id) on delete cascade,
  cycle       int not null,            -- numéro du tour (1..10)
  montant     numeric not null,
  methode     text check (methode in ('tmoney','moov','carte','especes')),
  statut      text not null default 'en_attente' check (statut in ('en_attente','payee')),
  payee_le    timestamptz,
  created_at  timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 3. MUTUELLE SOLIDAIRE
-- ------------------------------------------------------------
create table if not exists public.mutuelle_adhesions (
  id                    uuid primary key default gen_random_uuid(),
  membre_id             uuid not null references public.membres(id) on delete cascade,
  formule               text not null default 'base' check (formule in ('base','standard','famille')),
  cotisation_mensuelle  numeric not null,
  statut                text not null default 'active' check (statut in ('active','suspendue','resiliee')),
  debut                 date not null default current_date,
  created_at            timestamptz not null default now(),
  unique (membre_id)
);

-- ------------------------------------------------------------
-- 4. CAISSE DE SOLIDARITÉ (collectes + dons + aides)
-- ------------------------------------------------------------
create table if not exists public.caisse_campagnes (
  id                    uuid primary key default gen_random_uuid(),
  titre                 text not null,
  description           text,
  objectif_montant      numeric,
  montant_collecte      numeric not null default 0,
  beneficiaire_membre_id uuid references public.membres(id) on delete set null,
  statut                text not null default 'active' check (statut in ('active','atteinte','cloturee')),
  created_at            timestamptz not null default now()
);

create table if not exists public.caisse_dons (
  id           uuid primary key default gen_random_uuid(),
  campagne_id  uuid references public.caisse_campagnes(id) on delete set null,
  membre_id    uuid references public.membres(id) on delete set null,
  nom_donateur text,
  montant      numeric not null check (montant > 0),
  anonyme      boolean not null default false,
  methode      text check (methode in ('tmoney','moov','carte','especes')),
  created_at   timestamptz not null default now()
);

create table if not exists public.caisse_aides (
  id          uuid primary key default gen_random_uuid(),
  membre_id   uuid not null references public.membres(id) on delete cascade,
  motif       text not null,   -- maladie, deuil, perte d'emploi, etc.
  montant     numeric not null,
  statut      text not null default 'demandee' check (statut in ('demandee','approuvee','versee','refusee')),
  decide_le   timestamptz,
  created_at  timestamptz not null default now()
);

-- ============================================================
-- SÉCURITÉ : Row Level Security (RLS)
-- Principe : le public (anon) peut S'INSCRIRE et FAIRE UN DON,
-- mais ne peut PAS lire les données des autres membres.
-- La lecture/gestion se fait avec la clé service (back-office admin).
-- ============================================================

alter table public.membres            enable row level security;
alter table public.tontine_groupes    enable row level security;
alter table public.tontine_membres    enable row level security;
alter table public.tontine_cotisations enable row level security;
alter table public.mutuelle_adhesions enable row level security;
alter table public.caisse_campagnes   enable row level security;
alter table public.caisse_dons        enable row level security;
alter table public.caisse_aides       enable row level security;

-- Inscription publique d'un nouveau membre (formulaire d'adhésion du site)
create policy "Inscription publique des membres"
  on public.membres for insert
  to anon
  with check ( type_adhesion = 'nouveau' and consentement_rgpd = true );

-- Don public à la caisse de solidarité
create policy "Don public a la caisse"
  on public.caisse_dons for insert
  to anon
  with check ( montant > 0 );

-- Lecture publique des campagnes actives (mur des collectes)
create policy "Lecture publique des campagnes"
  on public.caisse_campagnes for select
  to anon
  using ( statut = 'active' );

-- NB : aucune policy de SELECT sur membres pour anon => données privées protégées.
-- L'administration (SG, trésorier) lit/écrit via la clé service ou un compte authentifié.
