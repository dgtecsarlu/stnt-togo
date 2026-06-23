# Bibliothèque (privée) & Galerie (publique) — Mise en service

## Étape 1 — Tables & buckets (commun)

Dans Supabase → **SQL Editor** → colle [`documents-galerie.sql`](documents-galerie.sql) → **Run**.
Crée : table `documents` + bucket privé `documents` ; table `galerie_medias` + bucket public `galerie`.

---

## Étape 2 — Galerie (publique) : ajouter des médias

1. **Storage → galerie → Upload** : dépose tes photos / vidéos d'activités.
2. **Table Editor → galerie_medias → Insert row** pour chaque média :
   - `titre` : ex. « Assemblée générale 2026 »
   - `type` : `photo` ou `video`
   - `storage_path` : le nom du fichier tel qu'uploadé (ex. `ag-2026.jpg`)
   - `date_activite` : la date

La page **galerie.html** affiche tout automatiquement.

---

## Étape 3 — Bibliothèque (privée) : l'Edge Function

La bibliothèque protège les documents internes. Le code d'accès est validé côté **serveur** ; les fichiers ne sont jamais publics, seulement des liens temporaires signés (1h).

### 3.1 Installer le Supabase CLI

```bash
npm install -g supabase
```

### 3.2 Connexion & liaison du projet

```bash
supabase login
supabase link --project-ref puiamiqbomunmfzlqcro
```

### 3.3 Définir le code d'accès (secret serveur)

```bash
supabase secrets set BIBLIO_ACCESS_CODE=ton-code-secret
```

### 3.4 Déployer la fonction

```bash
supabase functions deploy bibliotheque
```

### 3.5 Déposer les documents

1. **Storage → documents** (bucket privé) → **Upload** : statuts, règlement, PV du congrès, fiche d'adhésion, cartes...
2. **Table Editor → documents → Insert row** pour chacun :
   - `titre` : ex. « Statuts & Règlement Intérieur »
   - `categorie` : ex. `Statuts`, `Congrès`, `Adhésion`, `Cartes`
   - `storage_path` : le nom du fichier tel qu'uploadé

La page **bibliotheque.html** demande le code, puis liste les documents par catégorie avec liens de téléchargement temporaires.

> Ne mets JAMAIS la clé `service_role` dans le site. Elle n'est utilisée que par l'Edge Function (côté serveur), où Supabase l'injecte automatiquement.
