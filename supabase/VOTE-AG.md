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

---

## 7. Vote par JETON d'invitation (coexiste avec le vote par compte)

En plus du parcours compte (email + mot de passe), chaque membre validé peut
recevoir **par email un lien personnel** contenant un **jeton unique** :
`vote.html?jeton=XXXX`. Le membre clique, arrive directement sur ses scrutins,
vote. **Aucun compte à créer.** Idéal pour une AG de masse.

### Comment c'est sécurisé
- Le jeton n'est **jamais stocké en clair** : seul son **hachage SHA-256** est en
  base (`vote_invitations.token_hash`). Le jeton en clair n'existe qu'au moment
  de la génération, le temps d'envoyer l'email.
- **Anti-double-vote unifié** : l'émargement est ancré sur l'**identité membre**
  (`vote_emargements.membre_id`, index unique `(vote_id, membre_id)`). Un membre
  qui a à la fois un jeton ET un compte email ne peut voter qu'**une seule fois**
  par scrutin.
- Secret du vote inchangé (émargement et bulletin séparés, tables sans policy).
- Comme le porteur de jeton n'est pas authentifié Supabase, la fonction
  `vote-jeton` sert elle-même les scrutins (la RLS de `votes` bloque l'anon).
- Le lien vaut une voix : à ne pas transférer (mentionné dans l'email).

### Fichiers ajoutés
| Fichier | Rôle |
|---------|------|
| `supabase/votes-jetons.sql` | Table `vote_invitations` + ancrage émargement sur `membre_id` |
| `supabase/functions/vote-jeton/` | Vote par jeton (public) : session + voter, sert les scrutins |
| `supabase/functions/vote-invitations/` | Bureau : génère les jetons et envoie les emails (code bureau) |

### Déploiement
```bash
# a. Base : exécuter supabase/votes-jetons.sql dans le SQL Editor (après votes.sql)

# b. Fonctions
supabase functions deploy vote-jeton        --use-api
supabase functions deploy vote-invitations  --use-api
supabase functions deploy vote-voter        --use-api   # REDÉPLOYER : émargement ancré sur membre_id

# c. Secrets pour l'envoi d'email (Resend)
supabase secrets set RESEND_API_KEY="re_xxx"
supabase secrets set VOTE_FROM_EMAIL="STNT <ag@stnt-togo.org>"   # optionnel
supabase secrets set VOTE_BASE_URL="https://stnt-togo.org/vote.html"  # optionnel
# VOTE_ADMIN_CODE est déjà posé (réutilisé par vote-invitations)
```
> **Resend** : créer un compte, vérifier le domaine `stnt-togo.org` (DNS SPF/DKIM
> ajoutés chez Gandi), puis générer une clé API. Sans `RESEND_API_KEY`, l'action
> `generer` répond 503 ; on peut alors utiliser `mode:"manuel"` pour récupérer
> la liste `{nom, email, lien}` et envoyer les liens autrement (mail-merge, etc.).

### Envoyer les invitations (bureau)
Appel POST sur `…/functions/v1/vote-invitations`, en-tête `x-admin-code: <code bureau>` :
```json
{ "action": "generer" }                 // crée + envoie aux membres validés avec email, sans invitation
{ "action": "generer", "renvoyer": true }   // régénère un nouveau jeton pour tous (renvoi)
{ "action": "generer", "mode": "manuel" }   // ne tente pas l'envoi, renvoie les liens à diffuser soi-même
{ "action": "etat" }                    // stats : corps électoral, avec email, générés, envoyés, ouverts
{ "action": "revoquer", "membre_id": "…" }  // désactive le jeton d'un membre
```

### Côté membre
Cliquer le lien reçu par email → l'espace de vote s'ouvre directement (« Invitation : Nom »),
choisir une option, **Voter**. Une seule voix par scrutin, tous canaux confondus.
