/* ============================================================
   STNT — Direct interactif de l'AG (Jitsi embarqué)
   Webmaster : Ing. BODJONA Bataka Pignanti

   Deux modes :
   1) Lien personnel  live.html?jeton=XXXX
      -> admission AUTOMATIQUE : on demande un JWT à l'Edge Function
         "live-jwt" (jeton membre -> JWT Jitsi), puis on entre dans la
         salle souveraine SANS salle d'attente.
   2) Sans jeton (test) : salle meet.jit.si, saisie du nom à la main.

   La vidéo reste DANS la page (disableDeepLinking = pas de redirection,
   y compris mobile).
   ============================================================ */
(function () {
  'use strict';

  var cfg = window.STNT_JITSI || {};
  var sbCfg = window.STNT_SUPABASE || {};
  var gate = document.getElementById('liveGate');
  var form = document.getElementById('liveForm');
  var nameInput = document.getElementById('liveName');
  var stage = document.getElementById('liveStage');
  var container = document.getElementById('jitsi');
  var dateEl = document.getElementById('liveDate');
  var msg = document.getElementById('liveMsg');
  if (!container) return;

  if (cfg.date && dateEl) dateEl.textContent = cfg.date;

  var api = null;
  var loadedDomain = null;

  var jeton = (function () {
    try { return new URLSearchParams(window.location.search).get('jeton'); }
    catch (e) { return null; }
  })();

  function chargerScript(domain, cb) {
    if (loadedDomain === domain && window.JitsiMeetExternalAPI) { cb(); return; }
    var s = document.createElement('script');
    s.src = 'https://' + domain + '/external_api.js';
    s.async = true;
    s.onload = function () { loadedDomain = domain; cb(); };
    s.onerror = function () { setMsg('Impossible de charger la visio. Vérifie ta connexion et réessaie.'); };
    document.head.appendChild(s);
  }

  function setMsg(t) { if (msg) msg.textContent = t; }

  function lancer(opts) {
    // opts : { domain, room, displayName, jwt }
    chargerScript(opts.domain, function () {
      if (!window.JitsiMeetExternalAPI) { setMsg('Visio indisponible pour le moment.'); return; }
      if (gate) gate.hidden = true;
      if (stage) stage.hidden = false;
      container.innerHTML = '';

      var options = {
        roomName: opts.room,
        parentNode: container,
        width: '100%',
        height: '100%',
        userInfo: { displayName: opts.displayName || '' },
        configOverwrite: {
          disableDeepLinking: true,      // rester dans la page (mobile inclus)
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
      };
      if (opts.jwt) options.jwt = opts.jwt;

      api = new window.JitsiMeetExternalAPI(opts.domain, options);
      api.addEventListener('videoConferenceJoined', function () {
        api.executeCommand('subject', cfg.subject || 'Assemblée Générale — STNT');
      });
      api.addEventListener('readyToClose', function () {
        if (stage) stage.hidden = true;
        if (gate) gate.hidden = false;
        if (api) { api.dispose(); api = null; }
        setMsg('Tu as quitté le direct. Tu peux rejoindre à nouveau.');
      });
    });
  }

  // -------- Mode 1 : lien personnel (JWT, admission automatique) --------
  function rejoindreParJeton(tok) {
    if (!sbCfg.url) { setMsg('Configuration indisponible. Réessaie plus tard.'); return; }
    if (gate) {
      // remplace le formulaire de nom par un message d'attente
      gate.hidden = false;
      if (form) form.hidden = true;
    }
    setMsg('Vérification de votre invitation…');
    fetch(sbCfg.url + '/functions/v1/live-jwt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + sbCfg.anonKey, 'apikey': sbCfg.anonKey },
      body: JSON.stringify({ jeton: tok })
    }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (!res.ok) { setMsg((res.d && res.d.error) || 'Accès au direct impossible.'); return; }
        lancer({ domain: res.d.domain, room: res.d.room, displayName: res.d.name, jwt: res.d.jwt });
      }).catch(function () { setMsg('Erreur réseau. Réessaie.'); });
  }

  // -------- Mode 2 : test sans jeton (meet.jit.si, nom saisi) --------
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = (nameInput.value || '').trim();
      if (name.length < 3) { setMsg('Indique tes nom et prénoms (3 caractères min.).'); return; }
      setMsg('Connexion au direct…');
      lancer({ domain: cfg.domain || 'meet.jit.si', room: cfg.room || 'STNT-AG-Direct', displayName: name });
    });
  }

  if (jeton) { rejoindreParJeton(jeton); }
})();
