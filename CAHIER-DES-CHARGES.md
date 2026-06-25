# Cahier des charges définitif — Plateforme STNT

> Syndicat des Travailleurs du Numérique du Togo (STNT).
> Document de référence reflétant la plateforme **réellement livrée (V1)** et la **feuille de route (V2)**.
> Webmaster / Lead Dev : Ing. BODJONA Bataka Pignanti.
> Dernière mise à jour : 2026-06-25.

---

## 1. Objet

Plateforme web du STNT permettant : l'adhésion en ligne et le suivi des membres,
l'encaissement des cotisations et dons, la tenue des assemblées générales à
distance (visioconférence + vote en ligne des résolutions), la documentation
réservée aux membres, et la communication institutionnelle. Conforme à la loi
togolaise n° 2019-014 sur la protection des données personnelles.

---

## 2. Architecture réelle (V1 en production)

| Brique | Choix retenu |
|--------|--------------|
| Frontend | Site statique **HTML / CSS / JS** (sans framework), thème sombre |
| Hébergement | **GitHub Pages**, domaine **stnt-togo.org**, HTTPS forcé |
| Backend / Base / Auth / Storage | **Supabase** (PostgreSQL + RLS) + **Edge Functions** (Deno/TypeScript) |
| Authentification membres | **Supabase Auth** (email + mot de passe) |
| Paiement (V1) | **PayGate Global** — page hébergée, Mixx By Yas & Flooz (mobile money) |
| Visioconférence (V1) | **Zoom** (page de connexion intégrée au site) |
| Cartographie | **Leaflet.js** (carte des régions, densité anonymisée) |
| Bibliothèque | Bucket **privé** Supabase + Edge Function (code d'accès, liens signés) |
| Galerie | Mode dépôt (médias dans `assets/`) |
| Administration | Console **Swagger** (`/admin/`) pour piloter les Edge Functions |
| Déploiement | `git push` → reconstruction GitHub Pages automatique |

> Choix d'ingénierie : un socle statique + Supabase plutôt qu'un framework lourd,
> pour un coût d'hébergement quasi nul, une maintenance simple et une souveraineté
> des données (RLS, secrets serveur).

---

## 3. Modules livrés (V1)

### 3.1 Adhésion et membres
- **Nouvel adhérent** : formulaire en ligne, paiement des frais (PayGate), création du membre.
- **Ancien membre** : mise à jour de ses informations **sans repayer** les frais (Edge Function `adhesion-ancien`).
- **Validation par le Secrétaire Général** : toute inscription est `en_attente` jusqu'à validation (`statut_validation`).
- Consentement RGPD obligatoire (loi 2019-014).

### 3.2 Paiements (PayGate Global)
- Types : adhésion, cotisation, don (mutuelle et tontine prévus en base).
- Flux : `paiement-init` (génère l'URL PayGate) → page de paiement → retour → `paiement-statut` qui **vérifie activement** l'état via `/api/v2/status` et applique les effets métier ; `paiement-notify` (callback, filet de sécurité).
- Journal complet dans la table `paiements` (RLS verrouillée, accès via Edge Functions uniquement).
- Tarifs : adhésion **2 000 FCFA**, cotisation **12 000 FCFA/an** (équiv. 1 000/mois), dons libres.
- Le statut du membre passe à « à jour » dès confirmation du paiement.

### 3.3 Espace membre et vote des AG
- Compte **Supabase Auth** par membre (auto-inscription contrôlée : réservée aux emails déjà validés par le SG).
- **Scrutins** : création/ouverture/clôture par le bureau (`vote-admin`, code bureau).
- **Bulletin secret par défaut** : émargement (qui a voté) et bulletin (le choix) séparés, inaccessibles côté client. Nominatif possible.
- **Une voix par membre**, **quorum** (% des inscrits) et **majorité** (simple / absolue / deux tiers) calculés au dépouillement.
- Résultats publiés aux membres après clôture.

### 3.4 Assemblée Générale en visioconférence
- **Zoom** (V1) : page « AG en visio » avec lien de connexion, ID, code, date.
- Le panel (bureau, intervenants) anime ; les membres suivent et votent en ligne.

### 3.5 Bibliothèque documentaire sécurisée
- Documents officiels (statuts, PV, modèles) dans un bucket **privé** Supabase.
- Accès par **code confidentiel** (Edge Function `bibliotheque`), liens signés temporaires (1 h).

### 3.6 Galerie des activités
- Photos et vidéos des activités du syndicat (mode dépôt, téléchargement).

### 3.7 Cartographie (SIG)
- Carte publique anonymisée des membres par région (Leaflet).

### 3.8 Solidarité et donateurs
- Espace donateurs & partenaires (tableau d'honneur, option anonymat, transparence des fonds).
- Schéma en base pour tontine en ligne, mutuelle solidaire et caisse de solidarité.

### 3.9 Console d'administration (Swagger)
- Interface **`/admin/`** (Swagger UI) pour manipuler toutes les Edge Functions : votes, paiements, adhésion, bibliothèque. Authentification par clé et codes. Page non répertoriée.

---

## 4. Sécurité et conformité

- **Row Level Security (RLS)** sur toutes les tables ; les données sensibles ne sont accessibles que via Edge Functions (clé service côté serveur).
- **Secrets serveur uniquement** (jeton PayGate, codes d'accès) : jamais dans le site ni le dépôt.
- **Secret du vote** garanti par la séparation émargement / bulletin.
- **HTTPS** partout (Let's Encrypt via GitHub Pages).
- **Loi 2019-014** : consentement explicite, cartographie anonymisée, validation humaine (SG) des inscriptions.

---

## 5. Feuille de route (V2)

| Chantier | Description |
|----------|-------------|
| **Visio souveraine** | Jitsi auto-hébergé + diffusion HLS (panel + 500+ spectateurs) — voir `INFRA-VISIO-AG.md`. Remplace Zoom |
| **Paiement par carte** | CinetPay pour les cartes Visa/Mastercard (diaspora), en complément du mobile money |
| **Cotisation mensuelle** | Permettre de payer 1 000 FCFA/mois en plus de l'annuel dans le formulaire |
| **Dashboard SG complet** | Tableau de bord avec RBAC (SG / Trésorier / Secrétariat / Com), validation, finances, exports, journal d'audit |
| **Cartes de membre** | Génération de cartes de membre numériques (PDF) |
| **Communication** | Newsletter email/SMS segmentée, alertes WhatsApp |
| **Cotisations récurrentes** | Relances automatiques, reçus PDF |

---

## 6. Coûts

**Récurrents (V1) :**
- Hébergement site : **GitHub Pages — gratuit**.
- Domaine `stnt-togo.org` : déjà acquis (~quelques milliers de FCFA/an).
- Supabase : **Free** (suffisant au démarrage) ou **Pro** (~25 $/mois) selon le volume.
- PayGate : commission par transaction (pas d'abonnement).
- Zoom (pour les AG) : licence 500 participants (~80-90 $/mois, à activer le mois de l'AG).

**Développement :** réalisé en interne par le webmaster. Tarif de référence validé : **50 000 FCFA/jour**.

**Valeur marchande** de l'ensemble (adhésions + paiements + vote + visio + SIG + admin) : estimée **2,5 à 5 M FCFA** sur le marché togolais.

---

## 7. État au 2026-06-25

**En production :** site complet, adhésion + validation SG, **paiements PayGate actifs**,
**vote des AG opérationnel** (backend déployé et testé), AG en visio (Zoom), bibliothèque,
galerie, cartographie, console admin Swagger.

**En attente (préparation de l'AG) :**
- Import de la **liste électorale** (fichier des membres avec emails).
- **Licence + lien Zoom** pour l'AG.
- Configuration de l'**URL de notification** PayGate (filet de sécurité).
- Optionnel : paiement de la **cotisation mensuelle** dans le formulaire.

---

Webmaster : **Ing. BODJONA Bataka Pignanti** · Développeur FullStack · Master Télécom & Master IASIG · webmaster@stnt-togo.org
