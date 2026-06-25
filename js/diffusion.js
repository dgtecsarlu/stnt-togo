/* STNT — Lecteur de diffusion en direct des AG (HLS) */
(function () {
  'use strict';

  var video = document.getElementById('liveVideo');
  var offline = document.getElementById('liveOffline');
  var offlineMsg = document.getElementById('liveOfflineMsg');
  var retryBtn = document.getElementById('liveRetry');
  if (!video || !offline) return;

  var cfg = window.STNT_LIVE || {};
  var src = (cfg.hls || '').trim();
  var hls = null;
  var pollTimer = null;

  function showOffline(message) {
    if (message) offlineMsg.textContent = message;
    offline.hidden = false;
    video.style.display = 'none';
  }
  function showLive() {
    offline.hidden = true;
    video.style.display = 'block';
  }

  // Pas de flux configuré : on reste en attente, sans erreur technique.
  if (!src) {
    showOffline('Le direct n’a pas encore commencé. Cette page se mettra à jour automatiquement dès l’ouverture de la séance.');
    schedulePoll();
    return;
  }

  function destroyHls() {
    if (hls) { try { hls.destroy(); } catch (e) {} hls = null; }
  }

  function tryLoad() {
    destroyHls();

    // 1. Safari / iOS : HLS natif
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
      video.addEventListener('loadedmetadata', onPlayable, { once: true });
      video.addEventListener('error', onError, { once: true });
      return;
    }

    // 2. hls.js (Chrome, Firefox, Edge, Android)
    if (window.Hls && window.Hls.isSupported()) {
      hls = new window.Hls({ lowLatencyMode: true, liveSyncDurationCount: 3 });
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(window.Hls.Events.MANIFEST_PARSED, onPlayable);
      hls.on(window.Hls.Events.ERROR, function (evt, data) {
        if (data && data.fatal) onError();
      });
      return;
    }

    // 3. Navigateur sans support HLS
    showOffline('Ton navigateur ne peut pas lire le direct. Essaie Chrome, Firefox ou Safari à jour.');
  }

  function onPlayable() {
    showLive();
    var p = video.play();
    if (p && p.catch) p.catch(function () { /* lecture auto bloquée : l'utilisateur lancera via les contrôles */ });
    stopPoll();
  }

  function onError() {
    // Direct probablement pas encore lancé ou coupé : on repasse en attente et on re-tente.
    showOffline('Le direct n’est pas disponible pour l’instant. Nouvelle tentative en cours…');
    schedulePoll();
  }

  function schedulePoll() {
    stopPoll();
    pollTimer = setInterval(function () { if (src) tryLoad(); }, 15000);
  }
  function stopPoll() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  retryBtn && retryBtn.addEventListener('click', function () {
    if (!src) { showOffline('Aucun direct programmé pour le moment.'); return; }
    showOffline('Connexion au direct…');
    tryLoad();
  });

  tryLoad();
})();
