/* STNT — Page de connexion à l'AG en visioconférence (Zoom) */
(function () {
  'use strict';
  var cfg = window.STNT_ZOOM || {};
  var btn = document.getElementById('zoomBtn');
  var dateEl = document.getElementById('zoomDate');
  var details = document.getElementById('zoomDetails');
  var empty = document.getElementById('zoomEmpty');
  if (!btn) return;

  var url = (cfg.url || '').trim();

  if (cfg.date) dateEl.textContent = cfg.date;

  if (!url) {
    // Réunion pas encore configurée : on masque le bouton et on informe.
    btn.style.display = 'none';
    if (empty) empty.hidden = false;
    if (!cfg.date) dateEl.textContent = 'La date de l’AG sera précisée ici';
    return;
  }

  btn.href = url;

  var infos = [];
  if (cfg.meetingId) infos.push('ID de réunion : ' + cfg.meetingId);
  if (cfg.passcode) infos.push('Code secret : ' + cfg.passcode);
  if (details && infos.length) details.textContent = infos.join('  ·  ');
})();
