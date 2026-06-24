# Paiements en ligne — CinetPay (Mixx By Yas · Flooz · Carte bancaire)

Ce module encaisse les **frais d'adhésion**, les **cotisations** et les **dons** du STNT
par **Mixx By Yas** (Togocom), **Flooz** (Moov Africa) et **carte bancaire** (Visa / Mastercard),
via l'agrégateur **CinetPay** et une page de paiement hébergée (aucune donnée carte ne transite par le site).

## Architecture

```
Navigateur (formulaire)
   │  1. POST paiement-init  (montant + infos payeur)
   ▼
Edge Function paiement-init ──► API CinetPay  ──► renvoie payment_url
   │  2. enregistre la transaction (table paiements, statut "en_attente")
   ▼
Redirection vers la page de paiement CinetPay (Mixx / Flooz / carte)
   │
   ├─ 3a. CinetPay → POST paiement-notify (serveur à serveur) → on revérifie via /check
   │        puis on met à jour : paiement "paye", membre "a_jour", don inséré…
   │
   └─ 3b. Client redirigé vers paiement-retour.html?ref=… → interroge paiement-statut
```

Trois fonctions :
- **`paiement-init`** : crée la transaction et renvoie l'URL de paiement.
- **`paiement-notify`** : webhook CinetPay (confirme réellement le paiement). **À déployer sans JWT.**
- **`paiement-statut`** : la page de retour interroge l'état pour afficher succès / échec.

---

## Étape 1 — Ouvrir le compte marchand CinetPay (à faire par le bureau)

1. Crée un compte sur **https://cinetpay.com** (bouton *S'inscrire / Marchand*).
2. Renseigne l'organisation : **STNT — Syndicat des Travailleurs du Numérique du Togo**.
3. Pièces KYC habituelles pour une organisation togolaise :
   - Récépissé / enregistrement du syndicat (statuts, déclaration au ministère du Travail)
   - Pièce d'identité du représentant légal (le SG)
   - Coordonnées de règlement (compte Mixx By Yas / Flooz **professionnel** ou compte bancaire pour les reversements)
4. Une fois le compte **validé**, récupère dans le tableau de bord :
   - **APIKEY** (clé d'API du compte)
   - **SITE_ID** (identifiant du service/site marchand)
5. Active les canaux **Mixx By Yas, Flooz et Carte bancaire** sur le service.

> Tant que le compte n'est pas validé, on travaille avec les clés de **test** (sandbox) fournies dans le tableau de bord CinetPay.

---

## Étape 2 — Base de données

Dans **Supabase → SQL Editor → New query**, exécute dans l'ordre :
1. [`paiements.sql`](paiements.sql) : table `paiements`, harmonisation des libellés (`tmoney`→`mixx`, `moov`→`flooz`), lien dons↔paiements.
2. [`validation-anciens.sql`](validation-anciens.sql) : ajoute `statut_validation` (validation par le SG) et le suivi de mise à jour des anciens membres.

---

## Étape 3 — Secrets et déploiement des fonctions

Le binaire CLI est déjà installé sur le poste (`~/supabase-cli/supabase.exe`).
Il faut un **Personal Access Token** Supabase (le précédent a été révoqué) : Supabase → *Account → Access Tokens*.

```bash
# Depuis le dossier stnt-togo/
export SUPABASE_ACCESS_TOKEN=ton-nouveau-PAT
SB=~/supabase-cli/supabase.exe

# Lier le projet
$SB link --project-ref puiamiqbomunmfzlqcro

# Poser les clés CinetPay (jamais dans le dépôt Git)
$SB secrets set CINETPAY_API_KEY=ta_clef_api CINETPAY_SITE_ID=ton_site_id

# Déployer les fonctions (le webhook SANS vérification de JWT)
$SB functions deploy paiement-init    --use-api
$SB functions deploy paiement-statut  --use-api
$SB functions deploy paiement-notify  --use-api --no-verify-jwt
$SB functions deploy adhesion-ancien  --use-api
```

> `adhesion-ancien` gère la mise à jour des anciens membres **sans paiement** (elle n'utilise pas CinetPay).

> `--use-api` = déploiement sans Docker (Docker absent du poste), comme pour `bibliotheque`.
> `--no-verify-jwt` sur `paiement-notify` est **obligatoire** : CinetPay appelle ce webhook sans token Supabase.

`SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` sont injectés automatiquement par Supabase dans les fonctions, ne pas les poser à la main.

---

## Étape 4 — Montants officiels

Édite [`js/paiement-config.js`](../js/paiement-config.js) et remplace les **placeholders** par les montants votés par le bureau :

```js
window.STNT_TARIFS = {
  adhesion: 2000,    // ← frais d'adhésion réels
  cotisation: 6000,  // ← cotisation annuelle réelle
  dons_suggeres: [1000, 5000, 10000, 25000]
};
```

Les montants sont arrondis au multiple de 5 le plus proche (exigence XOF de CinetPay).

---

## Étape 5 — Tester

1. **Mode test** : avec les clés sandbox, CinetPay propose des numéros / cartes de test (voir leur doc *Sandbox*). Aucun argent réel n'est débité.
2. Fais une adhésion de test sur le site → tu dois être redirigé vers CinetPay → après paiement, retour sur `paiement-retour.html` avec **« Paiement confirmé »**.
3. Vérifie dans Supabase → Table `paiements` : ligne `statut = paye`, `canal` renseigné. Pour une adhésion, le `membre` passe à `statut_cotisation = a_jour`. Pour un don, une ligne apparaît dans `caisse_dons`.
4. **Passage en production** : remplace les secrets par les clés **live** et redéploie (`secrets set` puis `functions deploy`).

---

## Validation des inscriptions par le SG

Toute inscription (nouvel adhérent **après paiement**, ou ancien membre **sans paiement**) est créée avec
`statut_validation = 'en_attente'`. Le membre voit le message « Inscription enregistrée avec succès, soumise à la validation du Secrétaire Général ».

En attendant un tableau de bord SG dédié, la validation se fait en **back-office** :
**Supabase → Table Editor → `membres`** → filtrer `statut_validation = en_attente` → passer à `validee` (ou `rejetee`) et renseigner `valide_le`.

- **Nouvel adhérent** : a payé les frais (Mixx By Yas / Flooz / carte). `type_adhesion = nouveau`.
- **Ancien membre** : met à jour sa fiche, **sans payer**. `type_adhesion = ancien`. Upsert par email (mise à jour si déjà présent).

## Sécurité

- Les clés **APIKEY / SITE_ID** restent côté serveur (secrets Supabase), **jamais** dans le dépôt Git ni dans le navigateur.
- Le webhook ne fait **jamais confiance** au contenu reçu : il revérifie chaque paiement via l'API `/check` de CinetPay avant de valider.
- Le webhook est **idempotent** (un paiement déjà traité n'est pas rejoué).
- Aucune donnée de carte bancaire ne touche le site : tout se passe sur la page hébergée CinetPay (conformité PCI assurée par CinetPay).
