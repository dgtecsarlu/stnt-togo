# Backend Supabase — STNT

Base de données pour les adhésions et les dispositifs de solidarité (mutuelle, tontine, caisse).

## 1. Créer le projet

1. Va sur https://supabase.com → **New project** (plan gratuit suffisant pour démarrer)
2. Nom : `stnt`, région : la plus proche (Europe West), note bien le mot de passe de la base
3. Attends que le projet soit prêt (~2 min)

## 2. Créer les tables

1. Dans le projet → **SQL Editor** → **New query**
2. Colle tout le contenu de [`schema.sql`](schema.sql) → **Run**
3. Vérifie dans **Table Editor** que les tables sont créées :
   `membres`, `tontine_groupes`, `tontine_membres`, `tontine_cotisations`,
   `mutuelle_adhesions`, `caisse_campagnes`, `caisse_dons`, `caisse_aides`

## 3. Récupérer les clés

Dans **Project Settings → API** :
- **Project URL** (ex. `https://xxxx.supabase.co`)
- **anon public key** (clé publique, conçue pour être utilisée côté navigateur)

> La clé `anon` est **publique** et sûre à mettre dans le site : la sécurité est assurée par les règles RLS du `schema.sql` (le public peut s'inscrire et donner, mais pas lire les données des autres membres). Ne JAMAIS mettre la clé `service_role` dans le site.

Copie ces deux valeurs dans `js/supabase-config.js` (modèle : `js/supabase-config.example.js`).

## 4. Les deux flux d'adhérents

- **Nouveaux membres** : s'inscrivent eux-mêmes via le formulaire du site (`type_adhesion = 'nouveau'`), insertion autorisée par RLS.
- **Anciens adhérents** (déjà membres avant la plateforme) : à enregistrer en masse par l'administration. Deux options :
  - Import CSV dans **Table Editor → membres → Insert → Import data from CSV** (`type_adhesion = 'ancien'`)
  - Ou via un écran admin dédié (Phase 2).

## Architecture des dispositifs de solidarité

| Dispositif | Tables |
|------------|--------|
| Adhésion | `membres` |
| Tontine (groupes de 10, rotative) | `tontine_groupes`, `tontine_membres`, `tontine_cotisations` |
| Mutuelle solidaire | `mutuelle_adhesions` |
| Caisse de solidarité | `caisse_campagnes`, `caisse_dons`, `caisse_aides` |

La logique métier (rotation de la tontine, calcul des cagnottes, validations, paiements Mobile Money) relève de la Phase 2. Ce schéma en est la fondation.
