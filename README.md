# Site STNT — Syndicat des Travailleurs du Numérique du Togo

Site web institutionnel du STNT. **Phase 1** : site public statique (vitrine + maquettes d'interface), prêt à déployer.

## Contenu livré (Phase 1)

| Fichier | Rôle |
|---------|------|
| `index.html` | Page unique : hero, mission, mot du SG, bureau national (10 membres), adhésion, cartographie, donateurs, contact |
| `css/styles.css` | Charte graphique complète (bleu nuit/cobalt + vert émeraude + gris acier), responsive |
| `js/main.js` | Menu mobile, compteurs animés, cartographie Leaflet du Togo, formulaires (démo), bureau généré dynamiquement |
| `assets/favicon.svg` | Logo / favicon vectoriel |
| `CAHIER-DES-CHARGES.md` | Spécifications de la plateforme complète (Phase 2) pour un développeur |

## Comment voir le site

Ouvrir `index.html` dans un navigateur. Aucune installation, aucun build. Une connexion internet est requise (polices Google + carte Leaflet via CDN).

## Ce qui est en maquette (front-end uniquement)

Ces éléments ont une interface mais **aucun backend** branché pour l'instant :

- Formulaire d'adhésion (capture photo, champs) : affiche un message de confirmation de démo
- Boutons de paiement (T-Money / Moov / carte) : non connectés
- Cartographie : données de densité par région **fictives** (anonymisées)
- Bureau National : noms en `[Nom à renseigner]`
- Formulaire de contact : non relié à une boîte mail

## Personnalisation rapide

- **Noms du bureau** : éditer le tableau `bureau` en haut de `js/main.js`
- **Couleurs** : variables CSS en haut de `css/styles.css` (`:root`)
- **Textes** : directement dans `index.html`
- **Coordonnées** : section `#contact` et footer de `index.html`

## Déploiement

Le site est en ligne sur Netlify avec déploiement continu :
- **Site live** : https://stnt-togo.netlify.app
- **Dépôt** : `dgtecsarlu/stnt-togo` (branche `main`) — chaque `git push` redéploie automatiquement
- **Domaine** `stnt-togo.org` : acquis chez Gandi, à brancher au site (DNS Gandi → Netlify) + SSL automatique

## Phase 2 (plateforme complète)

Voir `CAHIER-DES-CHARGES.md` : backend Supabase, paiements Paygate.tg + Stripe, biométrie, SIG temps réel, visioconférence Jitsi, dashboard SG avec RBAC et logs d'audit, conformité Loi 2019-014. Chantier estimé à ~8 semaines.

---

Webmaster : **Ing. BODJONA Bataka Pignanti** · Développeur FullStack · Master Télécom & Master IASIG · webmaster@stnt-togo.org
