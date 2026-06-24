-- ============================================================
-- STNT — Validation des inscriptions par le SG + espace anciens membres
-- À exécuter dans : Supabase → SQL Editor → New query → Run
-- Webmaster : Ing. BODJONA Bataka Pignanti
-- ============================================================

-- ------------------------------------------------------------
-- 1. Statut de validation par le Secrétaire Général
--    Toute inscription (nouvelle OU mise à jour d'un ancien)
--    est "en_attente" tant que le SG ne l'a pas validée.
-- ------------------------------------------------------------
alter table public.membres
  add column if not exists statut_validation text not null default 'en_attente'
    check (statut_validation in ('en_attente','validee','rejetee'));

alter table public.membres
  add column if not exists valide_le timestamptz;

create index if not exists idx_membres_validation on public.membres(statut_validation);

-- Trace de la dernière mise à jour des informations (anciens membres)
alter table public.membres
  add column if not exists maj_le timestamptz;

-- ------------------------------------------------------------
-- 2. Comment le SG valide (back-office, en attendant un dashboard)
--    Supabase → Table Editor → membres :
--      - filtrer statut_validation = 'en_attente'
--      - passer à 'validee' (ou 'rejetee') et renseigner valide_le = now()
--    Validation en masse possible via SQL, ex. :
--        update public.membres
--          set statut_validation = 'validee', valide_le = now()
--          where statut_validation = 'en_attente' and id = '....';
-- ------------------------------------------------------------

-- NB : les anciens membres mettent à jour leurs infos via l'Edge Function
-- "adhesion-ancien" (clé service), donc aucune policy anon supplémentaire
-- n'est nécessaire ici.
