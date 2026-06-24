-- ============================================================
-- STNT — Paiements en ligne (CinetPay)
-- Mixx By Yas (Togocom) · Flooz (Moov Africa) · Cartes bancaires
-- À exécuter dans : Supabase → SQL Editor → New query → Run
-- Webmaster : Ing. BODJONA Bataka Pignanti
-- ============================================================

-- ------------------------------------------------------------
-- 1. TABLE paiements — journal de toutes les transactions
--    (adhésion, cotisation, mutuelle, tontine, don)
--    Source de vérité unique des paiements en ligne.
--    Écrite/lue UNIQUEMENT par les Edge Functions (clé service).
-- ------------------------------------------------------------
create table if not exists public.paiements (
  id                 uuid primary key default gen_random_uuid(),
  -- notre référence, envoyée à CinetPay (transaction_id)
  transaction_id     text unique not null,
  type_paiement      text not null
                       check (type_paiement in ('adhesion','cotisation','mutuelle','tontine','don')),
  montant            numeric not null check (montant > 0),
  devise             text not null default 'XOF',
  -- canal réel, renseigné après confirmation par CinetPay
  canal              text check (canal in ('mixx','flooz','carte','autre')),
  operateur          text,                    -- libellé brut renvoyé par CinetPay
  statut             text not null default 'en_attente'
                       check (statut in ('en_attente','paye','echoue','annule')),
  -- coordonnées du payeur
  nom_payeur         text,
  email_payeur       text,
  telephone_payeur   text,
  anonyme            boolean not null default false,
  description        text,
  -- rattachements optionnels
  membre_id          uuid references public.membres(id) on delete set null,
  campagne_id        uuid references public.caisse_campagnes(id) on delete set null,
  -- retours CinetPay
  cpm_trans_id       text,
  paye_le            timestamptz,
  created_at         timestamptz not null default now()
);

create index if not exists idx_paiements_statut on public.paiements(statut);
create index if not exists idx_paiements_type   on public.paiements(type_paiement);
create index if not exists idx_paiements_membre on public.paiements(membre_id);

-- RLS : aucune policy pour anon. Tout passe par les Edge Functions
-- (clé service_role, qui contourne la RLS). Le public ne lit ni n'écrit
-- jamais cette table directement depuis le navigateur.
alter table public.paiements enable row level security;

-- ------------------------------------------------------------
-- 2. Harmonisation des libellés de moyens de paiement
--    Anciennes valeurs : tmoney / moov  →  nouvelles : mixx / flooz
-- ------------------------------------------------------------

-- 2a. tontine_cotisations.methode
update public.tontine_cotisations set methode = 'mixx'  where methode = 'tmoney';
update public.tontine_cotisations set methode = 'flooz' where methode = 'moov';
alter table public.tontine_cotisations drop constraint if exists tontine_cotisations_methode_check;
alter table public.tontine_cotisations
  add constraint tontine_cotisations_methode_check
  check (methode in ('mixx','flooz','carte','especes'));

-- 2b. caisse_dons.methode
update public.caisse_dons set methode = 'mixx'  where methode = 'tmoney';
update public.caisse_dons set methode = 'flooz' where methode = 'moov';
alter table public.caisse_dons drop constraint if exists caisse_dons_methode_check;
alter table public.caisse_dons
  add constraint caisse_dons_methode_check
  check (methode in ('mixx','flooz','carte','especes'));

-- ------------------------------------------------------------
-- 3. Lien paiement → don de la caisse de solidarité
--    Permet de retrouver le paiement à l'origine d'un don.
-- ------------------------------------------------------------
alter table public.caisse_dons
  add column if not exists paiement_id uuid references public.paiements(id) on delete set null;

-- ============================================================
-- FIN. Pense ensuite à déployer les Edge Functions :
--   paiement-init, paiement-notify, paiement-statut
-- et à poser les secrets CINETPAY_API_KEY et CINETPAY_SITE_ID.
-- Voir supabase/PAIEMENTS.md
-- ============================================================
