# Module de VOTE des Assemblées Générales — STNT

Vote en ligne des résolutions d'AG, réservé aux membres validés, avec
**bulletin secret par défaut**, **une voix par membre**, **quorum** et
**dépouillement** automatiques.

> **STATUT (2026-06-25) : backend DÉPLOYÉ en production.** `votes.sql` exécuté,
> provider Email actif, 3 Edge Functions déployées, secret `VOTE_ADMIN_CODE`
> posé, console bureau testée. Les étapes de déploiement (section 3) sont donc
> déjà faites ; elles restent documentées pour référence et redéploiement.
> Reste avant l'AG : importer la liste électorale (membres + emails, en
> `statut_validation='validee'`). La visio de l'AG passe par **Zoom (V1)** ;
> l'infra Jitsi auto-hébergée (`INFRA-VISIO-AG.md`) est reportée en V2.

---

## 1. Ce que ça fait

- Chaque membre **validé par le SG** se crée un compte (email + mot de passe) sur `vote.html`.
- L'**auto-inscription est contrôlée** : impossible de créer un compte si l'email n'est pas déjà dans la base `membres` ET validé. La liste électorale reste maîtrisée.
- Le **bureau** crée, ouvre et clôt les scrutins depuis `vote-bureau.html` (protégé par un code bureau).
- À la clôture, le système calcule le **quorum** (% des membres validés ayant voté) et la **majorité** (simple / absolue / deux tiers), puis publie les résultats.
- **Secret du vote** : l'émargement (qui a voté) et le bulletin (le choix) sont stockés séparément, dans des tables verrouillées (RLS sans aucune policy). Personne, pas même le SG via Supabase, ne peut relier un membre à son bulletin sur un scrutin secret.

---

## 2. Fichiers

| Fichier | Rôle |
|---------|------|
| `supabase/votes.sql` | Tables `votes`, `vote_emargements`, `vote_bulletins` + colonne `membres.user_id` + RLS |
| `supabase/functions/vote-inscription/` | Crée le compte d'un membre validé (clé service) |
| `supabase/functions/vote-voter/` | Enregistre un vote (émargement + bulletin) |
| `supabase/functions/vote-admin/` | Console bureau : créer / ouvrir / clore / lister (code bureau) |
| `vote.html` + `js/vote.js` | Espace membre : connexion, vote, résultats |
| `vote-bureau.html` + `js/vote-bureau.js` | Console bureau |

---

## 3. Déploiement (à faire une seule fois)

### a. Base de données
Supabase → **SQL Editor** → coller le contenu de `supabase/votes.sql` → **Run**.

### b. Activer l'inscription par email/mot de passe
Supabase → **Authentication → Providers → Email** :
- **Enable Email provider** : activé.
- **Confirm email** : peut rester désactivé (les comptes sont déjà créés côté serveur avec email vérifié, car l'email figure sur la liste validée).

### c. Déployer les 3 Edge Functions
```bash
supabase functions deploy vote-inscription --use-api
supabase functions deploy vote-voter       --use-api
supabase functions deploy vote-admin        --use-api
```
> `--use-api` = déploiement sans Docker (comme les fonctions existantes).

### d. Poser le secret du code bureau
```bash
supabase secrets set VOTE_ADMIN_CODE="choisis-un-code-fort"
```
> `SUPABASE_URL`, `SUPABASE_ANON_KEY` et `SUPABASE_SERVICE_ROLE_KEY` sont déjà
> injectés automatiquement par Supabase, rien à poser pour eux.

### e. Publier le front
`git push` → GitHub Pages reconstruit. Les liens « Vote AG » sont déjà dans le menu et le footer.

---

## 4. Mode d'emploi

### Pour un membre
1. Aller sur **Vote AG** (`vote.html`).
2. Onglet **Créer mon accès** : saisir l'email d'adhésion + un mot de passe (8 caractères min.).
   - Refusé si l'email n'est pas validé par le SG.
3. Ensuite, **Se connecter** suffit. Les scrutins ouverts apparaissent : choisir une option, **Voter**. Une seule voix par scrutin.
4. Les scrutins clos affichent les **résultats publiés** (avec quorum et verdict).

### Pour le bureau
1. Aller sur **`vote-bureau.html`**, saisir le **code bureau**.
2. **Nouveau scrutin** : titre, options (par défaut Pour / Contre / Abstention), majorité, quorum, secret ou nominatif → crée un **brouillon**.
3. Au début de la séance : **Ouvrir le vote**. Les membres peuvent voter.
4. À la fin : **Clore et dépouiller** → fige les résultats (quorum, comptage, adoption) et les publie aux membres. Action définitive.

---

## 5. Règles de calcul

- **Corps électoral** = nombre de membres `statut_validation = 'validee'` au moment de la clôture.
- **Quorum atteint** = nombre de votants ≥ ⌈ corps électoral × quorum % ⌉.
- **Suffrages exprimés** = total des votes hors « Abstention ».
- **Adoption** (scrutins Pour/Contre) :
  - *simple* : « Pour » strictement supérieur à la somme des autres options exprimées ;
  - *absolue* : « Pour » > 50 % des exprimés ;
  - *deux tiers* : « Pour » ≥ 2/3 des exprimés.
  - Si le quorum n'est pas atteint, la résolution est **rejetée** (non valable).
  - Pour un scrutin à choix multiples (sans option « Pour »), aucun verdict d'adoption n'est rendu : seul le comptage est publié.

---

## 6. Points de sécurité

- Les clés sensibles (service role, code bureau) restent **côté serveur** uniquement.
- Tables `vote_emargements` et `vote_bulletins` : **aucun accès client** (RLS sans policy). Seules les Edge Functions y touchent.
- Un membre ne peut voter qu'une fois (contrainte d'unicité de l'émargement).
- Le code bureau (`VOTE_ADMIN_CODE`) doit rester confidentiel ; le changer en cas de fuite via `supabase secrets set`.
- Un vrai tableau de bord SG avec rôles pourra remplacer la console à code partagé plus tard.
