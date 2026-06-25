// Configuration de la diffusion en direct des AG du STNT.
// Renseigne l'URL du flux HLS servi par ton serveur (Phase 3 : Jitsi + Jibri
// + serveur HLS), idéalement derrière un CDN de cache pour tenir 500+ spectateurs.
// Exemple : "https://live.stnt-togo.org/hls/ag.m3u8"
// Laisse vide tant que l'infra n'est pas en place : la page affichera
// "le direct n'a pas encore commencé".
window.STNT_LIVE = {
  hls: ""
};
