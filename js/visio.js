/* STNT — Salle de visioconférence des AG (Jitsi Meet intégré) */
(function () {
  'use strict';
  var container = document.getElementById('jitsi');
  if (!container) return;

  // Nom de la salle (changer pour une AG différente si besoin)
  var ROOM = 'STNT-Assemblee-Generale-Nationale';

  if (typeof JitsiMeetExternalAPI === 'undefined') {
    // L'API n'a pas pu se charger : on garde le bouton de repli (déjà dans le HTML)
    return;
  }

  container.innerHTML = '';
  var api = new JitsiMeetExternalAPI('meet.jit.si', {
    roomName: ROOM,
    parentNode: container,
    width: '100%',
    height: 640,
    configOverwrite: {
      prejoinPageEnabled: true,
      startWithAudioMuted: true,
      disableDeepLinking: true
    },
    interfaceConfigOverwrite: {
      MOBILE_APP_PROMO: false,
      SHOW_JITSI_WATERMARK: false,
      DEFAULT_BACKGROUND: '#081826'
    },
    userInfo: {}
  });
})();
