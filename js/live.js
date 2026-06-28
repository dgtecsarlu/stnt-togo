/* ============================================================
   STNT — Direct interactif de l'AG (Jitsi embarqué)
   Webmaster : Ing. BODJONA Bataka Pignanti

   La vidéo reste DANS la page du site (pas de redirection vers une
   appli externe, y compris sur mobile : disableDeepLinking = true).
   ============================================================ */
(function () {
  'use strict';

  var cfg = window.STNT_JITSI || {};
  var gate = document.getElementById('liveGate');
  var form = document.getElementById('liveForm');
  var nameInput = document.getElementById('liveName');
  var stage = document.getElementById('liveStage');
  var container = document.getElementById('jitsi');
  var dateEl = document.getElementById('liveDate');
  var msg = document.getElementById('liveMsg');
  if (!form || !container) return;

  if (cfg.date && dateEl) dateEl.textContent = cfg.date;

  var api = null;
  var scriptLoaded = false;

  function chargerScript(cb) {
    if (scriptLoaded && window.JitsiMeetExternalAPI) { cb(); return; }
    var s = document.createElement('script');
    s.src = 'https://' + (cfg.domain || 'meet.jit.si') + '/external_api.js';
    s.async = true;
    s.onload = function () { scriptLoaded = true; cb(); };
    s.onerror = function () { if (msg) msg.textContent = 'Impossible de charger la visio. Vérifie ta connexion et réessaie.'; };
    document.head.appendChild(s);
  }

  function rejoindre(displayName) {
    chargerScript(function () {
      if (!window.JitsiMeetExternalAPI) {
        if (msg) msg.textContent = 'Visio indisponible pour le moment.';
        return;
      }
      gate.hidden = true;
      stage.hidden = false;
      container.innerHTML = '';

      api = new window.JitsiMeetExternalAPI(cfg.domain || 'meet.jit.si', {
        roomName: cfg.room || 'STNT-AG-Direct',
        parentNode: container,
        width: '100%',
        height: '100%',
        userInfo: { displayName: displayName },
        configOverwrite: {
          // Rester dans la page sur mobile (ne pas ouvrir l'appli/Store)
          disableDeepLinking: true,
          // L'audience entre micro coupé (le panel l'ouvrira au besoin)
          startWithAudioMuted: true,
          startWithVideoMuted: false,
          prejoinPageEnabled: false,
          subject: cfg.subject || 'Assemblée Générale — STNT',
          disableInviteFunctions: true
        },
        interfaceConfigOverwrite: {
          SHOW_JITSI_WATERMARK: false,
          SHOW_WATERMARK_FOR_GUESTS: false,
          MOBILE_APP_PROMO: false,
          DEFAULT_BACKGROUND: '#06121f',
          TOOLBAR_BUTTONS: [
            'microphone', 'camera', 'desktop', 'chat', 'raisehand',
            'tileview', 'fullscreen', 'hangup', 'settings', 'videoquality'
          ]
        }
      });

      api.addEventListener('videoConferenceJoined', function () {
        api.executeCommand('subject', cfg.subject || 'Assemblée Générale — STNT');
      });
      api.addEventListener('readyToClose', function () {
        stage.hidden = true;
        gate.hidden = false;
        if (api) { api.dispose(); api = null; }
        if (msg) msg.textContent = 'Tu as quitté le direct. Tu peux rejoindre à nouveau.';
      });
    });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var name = (nameInput.value || '').trim();
    if (name.length < 3) { if (msg) msg.textContent = 'Indique tes nom et prénoms (3 caractères min.).'; return; }
    if (msg) msg.textContent = 'Connexion au direct…';
    rejoindre(name);
  });
})();
