# Cahier des charges technique — Plateforme STNT (Phase 2)

> Spécifications de la plateforme de gestion syndicale complète, à destination d'un développeur ou d'une agence.
> Webmaster / Lead Dev : Ing. BODJONA Bataka Pignanti.

## 1. Objectifs du système

- **Gestion des adhésions** : inscription en ligne, capture photo passeport, délivrance de cartes de membre numériques.
- **Suivi financier** : centralisation des cotisations et dons avec traçabilité totale.
- **Engagement** : visioconférence et newsletter intégrées.

## 2. Stack technique

| Brique | Choix |
|--------|-------|
| Frontend | Next.js 14+ (App Router) + Tailwind CSS |
| Backend / Auth / Storage | Supabase (PostgreSQL + PostGIS) |
| Paiement (mobile money + carte) | CinetPay — Mixx By Yas, Flooz & cartes Visa/Mastercard (page hébergée) |
| Paiement international | Carte bancaire via CinetPay (diaspora) ; dons récurrents en option |
| Cartographie SIG | Leaflet.js + clustering, PostGIS |
| Visioconférence | API Jitsi Meet |
| Email / SMS | Brevo (email) + passerelle SMS togolaise (Semoa / SMSUp) |
| Hébergement | Vercel ou VPS à Lomé, SSL Let's Encrypt |
| Monitoring | Sentry (logs) |

## 3. Modules fonctionnels

### 3.1 Adhésion « smart »
- Capture photo : appareil mobile (caméra) ou glisser-déposer (desktop), recadrage auto format passeport.
- Champs : nom, prénoms, date de naissance, secteur (Dev / Réseaux / Télécoms / IA...), téléphone (Mobile Money), ville/région, upload CV ou contrat (optionnel).
- Case de consentement obligatoire (Loi 2019-014).

### 3.2 Paiements (double passerelle)
- **Mobile money** : Mixx By Yas & Flooz via CinetPay, reçu PDF auto, relances automatiques email/SMS.
- **Carte bancaire** : Visa / Mastercard via CinetPay (dons de la diaspora & legs), option dons récurrents.
- Statut membre passe à « à jour » dès validation du paiement (débloque l'espace visio).

### 3.3 Espace membre
- Authentification sécurisée (email + mot de passe ou OTP mobile).
- Profil éditable, historique des paiements, statut (Actif / Inactif), carte de membre téléchargeable.

### 3.4 Cartographie (SIG)
- Carte publique anonymisée par région (heatmap).
- Carte admin : géolocalisation par ville, filtres (métier, région, à jour de cotisation), clic = fiche membre.

### 3.5 Visioconférence
- Jitsi Meet, réunions sans limite de temps, URL type `stnt-togo.org/reunion`.

### 3.6 Communication
- Newsletter email/SMS avec segmentation (ex. uniquement les membres « à jour »).
- Option bot WhatsApp Business API pour alertes temps réel.

### 3.7 Espace donateurs & legs
- Tableau d'honneur (individuels / entreprises), option anonymat.
- Module de transparence d'utilisation des fonds.
- Formulaire sécurisé pour les legs, contact service juridique.

## 4. Tableau de bord administrateur (SG = Super-Admin)

KPI (membres à jour / en retard, trésorerie temps réel ventilée Mobile Money vs carte, validations en attente), cartographie décisionnelle, validation biométrique en split-screen, génération/blocage de cartes, historique financier par membre, centre de communication, gestion donateurs.

### Matrice RBAC

| Fonctionnalité | SG (Admin) | Trésorier | Secrétariat | Com |
|---|---|---|---|---|
| Dashboard global | Full | Finances | Stats membres | Communication |
| Validation membres | ✅ | ❌ | ✅ | ❌ |
| Validation paiements | ✅ | ✅ | ❌ | ❌ |
| Export données | ✅ | ✅ (compta) | ✅ (listes) | ❌ |
| Gestion carte SIG | ✅ | ❌ | ✅ | ✅ (vue) |
| Newsletter / SMS | ✅ | ❌ | ❌ | ✅ |
| Lancement visio | ✅ | ❌ | ✅ | ✅ |
| Gestion des rôles | ✅ | ❌ | ❌ | ❌ |

> Le **Secrétaire Général (SG)** est le Super-Admin (clés de la maison). Chaque action sensible génère une trace d'audit non modifiable. 2FA exigée sur le back-office.

## 5. Schéma de base de données (simplifié)

```sql
-- Membres
CREATE TABLE membres (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nom_complet TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  telephone TEXT,
  ville TEXT,
  metier TEXT,
  photo_url TEXT,
  statut_cotisation TEXT DEFAULT 'en_attente', -- 'a_jour' | 'expire'
  date_adhesion TIMESTAMPTZ DEFAULT NOW()
);

-- Paiements
CREATE TABLE paiements (
  id_transaction TEXT PRIMARY KEY,
  id_membre UUID REFERENCES membres(id),
  montant NUMERIC,
  type TEXT,        -- 'cotisation' | 'don'
  methode TEXT,     -- 'tmoney' | 'moov' | 'carte'
  date TIMESTAMPTZ DEFAULT NOW()
);

-- Donateurs
CREATE TABLE donateurs (
  id SERIAL PRIMARY KEY,
  nom_entreprise TEXT,
  logo_url TEXT,
  montant_total NUMERIC,
  visibilite TEXT DEFAULT 'public' -- 'public' | 'anonyme'
);

-- Bureau national
CREATE TABLE bureau_national (
  id SERIAL PRIMARY KEY,
  nom TEXT NOT NULL,
  poste TEXT NOT NULL,
  ordre INTEGER,
  photo_url TEXT
);

-- Journal d'audit
CREATE TABLE audit_logs (
  id BIGSERIAL PRIMARY KEY,
  acteur TEXT, role TEXT, action TEXT,
  cible TEXT, horodatage TIMESTAMPTZ DEFAULT NOW()
);
```

## 6. Sécurité & conformité (Loi togolaise n° 2019-014)

- Photos en bucket sécurisé (Supabase Storage / S3) avec URLs signées (admins uniquement).
- Chiffrement en transit (HTTPS) et au repos (AES-256).
- Consentement explicite, droit d'accès/rectification/opposition, cartographie anonymisée.
- Conformité IPDCP (Instance de Protection des Données à Caractère Personnel).

## 7. Roadmap (estimation 8 semaines)

1. **S1-2 — Fondations** : infra, domaine `stnt-togo.org`, schéma BDD, formulaire adhésion + photo, auth SG.
2. **S3-4 — Flux financiers & SIG** : CinetPay (Mixx By Yas / Flooz / carte), carte interactive, cartes membres PDF.
3. **S5-6 — Interactivité** : Jitsi, newsletter, dashboard SG + RBAC, espace donateurs.
4. **S7-8 — Tests & lancement** : bêta paiement, audit sécurité, formation SG/Trésorier, ouverture publique.

## 8. Coûts indicatifs

- **Récurrent** : domaine .tg ~30 000 FCFA/an, Supabase Pro ~150 000, SMS/newsletter ~100 000, Jitsi/SSL gratuits → **~280 000 FCFA/an**.
- **Valeur marchande de la plateforme** (SIG + visio + paiements automatisés) : estimée **2,5 à 5 M FCFA** sur le marché togolais (optimisée ici car développement interne par le webmaster).

---

Webmaster : **Ing. BODJONA Bataka Pignanti** · Développeur FullStack · Master Télécom & Master IASIG · webmaster@stnt-togo.org
