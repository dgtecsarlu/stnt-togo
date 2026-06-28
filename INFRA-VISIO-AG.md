# Infrastructure visio des AG — STNT (Jitsi auto-hébergé + JWT)

Guide d'installation de la **salle interactive souveraine** pour les AG du STNT.

> **Contexte retenu** : la majorité des membres assiste **en présentiel**. En
> ligne, on vise **50 à 100 participants en interactif** (audio/vidéo). Donc
> **pas de diffusion HLS / Jibri / CDN** : une seule salle Jitsi auto-hébergée
> suffit. L'accès est filtré par **jeton (JWT)** → admission automatique, **sans
> salle d'attente** (le problème vécu avec Zoom).

Le vote (jetons) et la page `live.html` du site sont déjà faits. Ce document
couvre le serveur Jitsi et son branchement.

---

## 1. Architecture (simple)

```
   50-100 membres en ligne                    Bureau (modérateurs)
   (live.html?jeton=…)                        (live.html?jeton=…, rôle mod)
            │  JWT délivré par                          │
            │  l'Edge Function live-jwt                 │
            ▼                                           ▼
                   visio.stnt-togo.org
            ┌───────────────────────────────┐
            │  Jitsi Meet                    │
            │  prosody (auth=token) +        │
            │  jicofo + jitsi-videobridge2   │
            │  + nginx (HTTPS)               │
            └───────────────────────────────┘
```

Un seul serveur. Pas de Jibri, pas de MediaMTX, pas de CDN.

---

## 2. Serveur

| Élément | Recommandation |
|---------|----------------|
| Hébergeur | Hetzner (bon rapport qualité/prix) ou équivalent |
| Taille | **8 vCPU / 16 Go RAM** (ex. Hetzner CPX41 / CCX23) |
| OS | Ubuntu 22.04 LTS (ou Debian 12) |
| Coût | ~40-60 $/mois (peut être éteint entre deux AG si facturation horaire) |

Cette taille couvre confortablement 50-100 participants interactifs avec le
réglage de la section 6.

**DNS (chez Gandi)** : un seul sous-domaine vers l'IP du VPS :
- `visio.stnt-togo.org` → enregistrement **A** → IP du serveur

---

## 3. Installer Jitsi Meet

Sur le VPS (en root), une fois le DNS propagé :

```bash
# Nom d'hôte
hostnamectl set-hostname visio.stnt-togo.org

# Dépôt Jitsi
apt update && apt install -y apt-transport-https gnupg2 curl
curl -sL https://download.jitsi.org/jitsi-key.gpg.key | gpg --dearmor -o /usr/share/keyrings/jitsi-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/jitsi-keyring.gpg] https://download.jitsi.org stable/" > /etc/apt/sources.list.d/jitsi-stable.list
apt update

# Pare-feu : 80, 443 (web) + 10000/udp (média) + 22 (ssh)
apt install -y ufw
ufw allow 80/tcp && ufw allow 443/tcp && ufw allow 22/tcp && ufw allow 10000/udp
ufw enable

# Installation (renseigner visio.stnt-togo.org comme hostname,
# et choisir "Let's Encrypt" pour le certificat quand demandé)
apt install -y jitsi-meet
/usr/share/jitsi-meet/scripts/install-letsencrypt-cert.sh
```

À ce stade, `https://visio.stnt-togo.org` ouvre une salle Jitsi fonctionnelle.

---

## 4. Admission AUTOMATIQUE par jeton (JWT) — PAS de salle d'attente

> Le problème vécu avec Zoom (des membres bloqués en salle d'attente) vient de
> l'**admission manuelle**. On la supprime. **N'active PAS le lobby.** Jitsi
> n'accepte que les porteurs d'un **JWT valide** : le tri se fait en amont,
> l'entrée est instantanée, et seuls les membres validés entrent. Le rôle
> modérateur (bureau) est porté par le jeton.

### a. Activer l'auth par jeton
```bash
apt install -y jitsi-meet-tokens
```
L'installeur demande un **APP ID** et un **APP SECRET** : note-les (secrets). Il
configure prosody en `authentication = "token"` avec ces valeurs.

Dans `/etc/jitsi/meet/visio.stnt-togo.org-config.js`, activer les rôles issus
du jeton (le modérateur vient du JWT) :
```js
enableUserRolesBasedOnToken: true,
// pas de lobby, pas de prejoin : l'accès est déjà filtré par le jeton
```
Redémarrer : `systemctl restart prosody jicofo jitsi-videobridge2`

Ouvrir la salle **sans** jeton est alors refusé : c'est voulu.

### b. Qui délivre les jetons : notre backend (réutilise le jeton membre)
L'Edge Function **`live-jwt`** (`supabase/functions/live-jwt/`) :
1. reçoit le **jeton personnel** du membre (le MÊME que pour le vote) ;
2. vérifie qu'il correspond à un membre **validé** (table `vote_invitations`) ;
3. fabrique un **JWT Jitsi** signé avec l'APP SECRET (nom du membre + rôle :
   modérateur si l'email est dans la liste du bureau, sinon participant) ;
4. le renvoie au site, qui ouvre la salle avec ce JWT → admission immédiate.

Secrets à poser côté Supabase une fois le serveur installé :
```bash
supabase secrets set JITSI_APP_ID="<app_id de l'install>"
supabase secrets set JITSI_APP_SECRET="<app_secret de l'install>"
supabase secrets set JITSI_DOMAIN="visio.stnt-togo.org"
supabase secrets set JITSI_MODERATORS="sg@stnt-togo.org,tresorier@stnt-togo.org"  # bureau
supabase functions deploy live-jwt --use-api
```

Côté site, **rien à changer** : `live.html?jeton=XXXX` appelle `live-jwt`,
récupère le JWT et entre tout seul. (Sans jeton, `live.html` reste en mode test
meet.jit.si.) Un seul lien personnel par membre sert au **direct** ET au **vote**.

> Aucun clic d'admission pour le bureau. Pour exclure quelqu'un : **révoquer son
> jeton** (action `revoquer` de `vote-invitations`) coupe direct + vote.

---

## 5. Brancher le site

Rien à modifier dans le code : `live.js` détecte `?jeton=` et passe en mode JWT
automatiquement. Vérifier seulement que `js/jitsi-config.js` n'est utilisé que
pour le mode test (sans jeton). En production, le domaine et la salle viennent
de la réponse de `live-jwt`.

Diffuser les liens : action `generer` de `vote-invitations` (les membres
reçoivent leur lien personnel par email).

---

## 6. Réglage pour tenir 50-100 interactifs

Le facteur limitant est la **vidéo simultanée**. Dans
`/etc/jitsi/meet/visio.stnt-togo.org-config.js`, ajouter/ajuster :

```js
// Ne relayer que les N derniers intervenants actifs (cap bande passante/CPU)
channelLastN: 25,
// Au-delà de 10 personnes, les nouveaux entrent caméra coupée
startVideoMuted: 10,
// Au-delà de 20, micro coupé à l'entrée (l'AG : on coupe sauf prise de parole)
startAudioMuted: 20,
// Forcer le passage par le bridge (pas de P2P en réunion de groupe)
disableP2P: true,
// Suspendre les couches vidéo non affichées (gros gain CPU)
enableLayerSuspension: true,
// Plafonner la résolution émise (360p suffit pour une AG, divise la charge)
resolution: 360,
constraints: { video: { height: { ideal: 360, max: 360, min: 180 } } },
```

Côté bridge (`/etc/jitsi/videobridge2/jvb.conf` ou variables), garder les
réglages par défaut suffit pour ce volume. Augmenter au besoin la limite de
descripteurs de fichiers (`LimitNOFILE`) du service JVB.

> Avec ces réglages : caméras limitées aux intervenants, tout le monde s'entend,
> 50-100 personnes tiennent sur le 8 vCPU. Pour aller bien au-delà, il faudrait
> plusieurs bridges (autre chantier) ou le mode diffusion.

---

## 7. Déroulé d'une AG

1. **Membres en ligne** : envoi des liens personnels (`generer` de `vote-invitations`).
2. **Bureau + intervenants** : ouvrent leur lien → JWT modérateur → entrent dans
   la salle **sans aucune admission manuelle**. Les membres aussi (rôle participant).
3. Séance : caméras pour les intervenants, le reste en audio + « lever la main ».
4. **Vote** : le bureau ouvre/clôt les scrutins (`vote-bureau.html`), les membres
   votent sur **Vote AG** (même jeton).
5. Fin : clore la salle. Pour bloquer quelqu'un : **révoquer son jeton**.

---

## 8. Capacité, coût, sécurité

- **Capacité** : 50-100 participants interactifs sur un seul 8 vCPU / 16 Go, avec
  le réglage de la section 6 (vidéo limitée aux intervenants).
- **Coût** : VPS ~40-60 $/mois (extinction possible entre deux AG). Pas de CDN.
- **Sécurité** : accès par **JWT** (membres validés uniquement, admission
  automatique, pas de lobby) ; rôle modérateur porté par le jeton (bureau) ;
  révocation immédiate via le jeton ; HTTPS partout (Let's Encrypt) ; tout reste
  sur ton domaine.
- **Limite assumée** : au-delà de ~100 interactifs, prévoir du scaling multi-bridge
  ou bascule en diffusion. Le présentiel majoritaire évite d'y arriver.

---

## Récapitulatif des prérequis à ta charge

1. Louer un VPS **8 vCPU / 16 Go** (Hetzner conseillé).
2. Créer le DNS `visio.stnt-togo.org` chez Gandi.
3. Suivre les sections 3 et 4 (install + JWT), puis poser les secrets Supabase.

Quand le VPS est prêt, on fait l'installation pas à pas et on active le JWT, puis
on teste l'admission automatique de bout en bout.
