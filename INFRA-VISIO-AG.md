# Infrastructure visio + diffusion des AG — STNT (Phase 3)

Guide d'installation de l'infrastructure souveraine pour les assemblées
générales à 500+ membres. Modèle **webinaire** : un panel interactif (bureau
et intervenants) sur Jitsi, diffusé en direct vers tous les membres via un
flux HLS servi par le STNT et accéléré par un CDN.

> Le vote (Phase 1) et la page de diffusion du site (Phase 2) sont déjà faits.
> Ce document couvre uniquement le serveur qui produit le direct.

---

## 1. Architecture

```
  Bureau + intervenants            500+ membres (spectateurs)
   (≤ 25, interactif)                  (page diffusion.html)
          │                                    ▲
          ▼                                    │ HLS
   visio.stnt-togo.org                  live.stnt-togo.org
   ┌──────────────────┐  Jibri   ┌──────────────┐   ┌──────────┐
   │ Jitsi Meet       │ ──RTMP──►│ MediaMTX      │──►│  CDN      │──► spectateurs
   │ (prosody/jicofo/ │          │ (RTMP → HLS)  │   │ (BunnyCDN)│
   │  jvb + nginx)    │          └──────────────┘   └──────────┘
   └──────────────────┘
```

- **Jitsi Meet** : la salle où parlent le bureau et les intervenants.
- **Jibri** : capture la salle et la pousse en RTMP (le « caméraman » automatique). Gourmand (Chrome + ffmpeg), il lui faut du CPU dédié.
- **MediaMTX** : reçoit le RTMP et le republie en HLS (un seul binaire, simple).
- **CDN (BunnyCDN)** : recopie le flux HLS aux 500+ spectateurs. **Indispensable** : sans lui, la bande passante du VPS explose.

---

## 2. Serveur recommandé

| Élément | Recommandation |
|---------|----------------|
| Hébergeur | Hetzner (meilleur rapport qualité/prix), proche Europe |
| Taille | 8 vCPU / 16 Go RAM (ex. Hetzner CPX41 / CCX) |
| OS | Ubuntu 22.04 LTS (ou Debian 12) |
| Coût | ~40 à 80 $/mois selon la formule |

> Jibri est le poste le plus lourd. Sur une seule machine, 8 vCPU suffisent
> pour un panel d'AG. Si tu fais beaucoup d'AG simultanées, on séparera Jibri
> sur sa propre VM plus tard.

**DNS (chez Gandi)**, deux sous-domaines pointant vers l'IP du VPS :
- `visio.stnt-togo.org` → A → IP du serveur
- `live.stnt-togo.org`  → A → IP du serveur

---

## 3. Installer Jitsi Meet

Sur le VPS (en root), une fois les DNS propagés :

```bash
# Nom d'hôte
hostnamectl set-hostname visio.stnt-togo.org

# Dépôt Jitsi
apt update && apt install -y apt-transport-https gnupg2 curl
curl -sL https://download.jitsi.org/jitsi-key.gpg.key | gpg --dearmor -o /usr/share/keyrings/jitsi-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/jitsi-keyring.gpg] https://download.jitsi.org stable/" > /etc/apt/sources.list.d/jitsi-stable.list
apt update

# Pare-feu : 80, 443 (web) + 10000/udp (média)
apt install -y ufw
ufw allow 80/tcp && ufw allow 443/tcp && ufw allow 22/tcp && ufw allow 10000/udp
ufw enable

# Installation (renseigne visio.stnt-togo.org comme hostname,
# et choisis "Let's Encrypt" pour le certificat quand demandé)
apt install -y jitsi-meet
/usr/share/jitsi-meet/scripts/install-letsencrypt-cert.sh
```

À ce stade, `https://visio.stnt-togo.org` ouvre une salle Jitsi fonctionnelle.

---

## 4. Réserver l'animation au bureau (modérateurs)

Par défaut tout le monde peut créer une salle. Pour une AG, on veut que seul
le bureau soit modérateur. Activer l'authentification interne :

- Éditer `/etc/prosody/conf.avail/visio.stnt-togo.org.cfg.lua` :
  - `authentication = "internal_hashed"`
  - ajouter un domaine invité `guest.visio.stnt-togo.org` avec `authentication = "anonymous"` (les intervenants entrent sans compte, mais ne peuvent pas ouvrir la salle seuls).
- Créer les comptes du bureau :
  ```bash
  prosodyctl register sg visio.stnt-togo.org "MOT_DE_PASSE_FORT"
  ```
- Dans `/etc/jitsi/meet/visio.stnt-togo.org-config.js`, pointer `hosts.anonymousdomain = 'guest.visio.stnt-togo.org'`.
- Redémarrer : `systemctl restart prosody jicofo jitsi-videobridge2`

Résultat : le bureau se connecte (compte + mot de passe) pour ouvrir l'AG ;
les intervenants rejoignent ensuite librement. Active aussi le **lobby** et un
**mot de passe de salle** le jour J pour filtrer l'accès.

---

## 5. Installer MediaMTX (RTMP → HLS)

```bash
# Récupérer la dernière release Linux amd64 depuis :
#   https://github.com/bluenviron/mediamtx/releases
cd /opt && mkdir mediamtx && cd mediamtx
# (adapter le numéro de version au lien officiel le plus récent)
curl -L -o mediamtx.tar.gz https://github.com/bluenviron/mediamtx/releases/latest/download/mediamtx_linux_amd64.tar.gz
tar xzf mediamtx.tar.gz
```

Dans `mediamtx.yml`, s'assurer que RTMP et HLS sont activés :
```yaml
rtmp: yes
rtmpAddress: :1935
hls: yes
hlsAddress: :8888
hlsVariant: lowLatency
paths:
  ag:
    # le flux poussé par Jibri sur rtmp://localhost:1935/ag
    # sera lisible en HLS sur http://localhost:8888/ag/index.m3u8
```

Lancer en service systemd (créer `/etc/systemd/system/mediamtx.service`) puis
`systemctl enable --now mediamtx`. Exposer le HLS en HTTPS sur
`live.stnt-togo.org` via un bloc nginx en reverse-proxy vers `127.0.0.1:8888`
(+ certbot pour le certificat).

---

## 6. Installer Jibri (le « caméraman »)

Jibri capture la salle Jitsi et la pousse en RTMP vers MediaMTX.

```bash
apt install -y jibri
# Jibri a besoin de Chrome + chromedriver + un module son virtuel (ALSA loopback).
# Suivre la doc officielle : https://github.com/jitsi/jibri (snd-aloop, group jibri)
```

Points clés de configuration :
- Ajouter les comptes prosody que Jibri utilise (control + recorder), comme dans la doc.
- Activer le live streaming côté Jitsi : dans le `-config.js`,
  `liveStreamingEnabled: true`.
- **Cible RTMP = ton serveur local**, pas YouTube : on démarre la diffusion
  Jibri vers `rtmp://localhost:1935/ag`. Selon la version, l'URL RTMP se règle
  via la boîte « démarrer la diffusion » (clé de flux) ou via la config Jibri.

Une fois Jibri opérationnel, dans la salle : menu **… → Démarrer la diffusion**,
le flux part vers MediaMTX et devient disponible en HLS.

---

## 7. Mettre le CDN devant (BunnyCDN)

1. Créer un compte BunnyCDN, puis une **Pull Zone**.
2. **Origin URL** = `https://live.stnt-togo.org`.
3. BunnyCDN te donne une URL (ou un hostname personnalisé, ex. `cdn.stnt-togo.org`).
4. Régler le cache des segments `.ts`/`.m4s` sur quelques secondes et le
   manifeste `.m3u8` sur ~1 s.

Coût : ~0,01 $/Go, soit quelques dollars pour une AG de 500 personnes.

---

## 8. Brancher le site

Dans `js/diffusion-config.js` du site, mettre l'URL HLS servie par le CDN :

```js
window.STNT_LIVE = {
  hls: "https://cdn.stnt-togo.org/ag/index.m3u8"
};
```

`git push` → la page **AG en direct** lit le flux. Tant que Jibri ne diffuse
pas, elle affiche « le direct n'a pas encore commencé » et se reconnecte seule.

---

## 9. Déroulé d'une AG

1. **Bureau** : se connecter sur `visio.stnt-togo.org` (compte modérateur), ouvrir la salle, activer lobby + mot de passe.
2. Intervenants admis depuis le lobby.
3. **Démarrer la diffusion** (Jibri) → le direct part vers les spectateurs.
4. **Membres** : page **AG en direct** pour suivre, page **Vote AG** pour voter.
5. Le bureau ouvre/clôt les scrutins depuis la console (`vote-bureau.html`).
6. Fin : arrêter la diffusion, clore la salle.

---

## 10. Capacité, coût, sécurité

- **Capacité** : panel interactif ≤ ~25 ; spectateurs quasi illimités grâce au CDN.
- **Coût mensuel** : VPS ~40-80 $ + CDN à l'usage (quelques $/AG). Le VPS peut être éteint entre deux AG pour économiser si l'hébergeur facture à l'heure.
- **Sécurité** : modération réservée au bureau (comptes prosody), lobby + mot de passe le jour J, HTTPS partout (Let's Encrypt), le flux reste sur ton domaine.
- **Limite assumée** : la diffusion est à sens unique (les spectateurs ne sont pas tous en caméra, c'est voulu). Une prise de parole d'un membre = on le fait monter dans le panel le temps de son intervention.

---

## Récapitulatif des prérequis à ta charge

1. Louer un VPS 8 vCPU / 16 Go (Hetzner conseillé).
2. Créer les DNS `visio.` et `live.` chez Gandi.
3. Créer un compte BunnyCDN.
4. Suivre les sections 3 à 8.

Quand le VPS est prêt, on peut faire l'installation ensemble pas à pas.
