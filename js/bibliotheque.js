/* STNT — Bibliothèque (accès par code, via Edge Function sécurisée) */
(function () {
  'use strict';
  var form = document.getElementById('biblioForm');
  var msg = document.getElementById('biblioMsg');
  var gate = document.getElementById('biblioGate');
  var list = document.getElementById('biblioList');
  if (!form) return;
  var cfg = window.STNT_SUPABASE;

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!cfg || !cfg.url) { msg.textContent = 'Configuration manquante.'; return; }
    var code = document.getElementById('code').value;
    var btn = form.querySelector('button[type="submit"]');
    msg.textContent = 'Vérification…';
    if (btn) btn.disabled = true;

    fetch(cfg.url + '/functions/v1/bibliotheque', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + cfg.anonKey,
        'apikey': cfg.anonKey
      },
      body: JSON.stringify({ code: code })
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (btn) btn.disabled = false;
        if (!res.ok) { msg.textContent = (res.d && res.d.error) ? res.d.error : 'Code invalide.'; return; }
        var docs = (res.d && res.d.documents) || [];
        gate.hidden = true;
        list.hidden = false;
        if (!docs.length) { list.innerHTML = '<p class="page-empty">Aucun document disponible pour le moment.</p>'; return; }

        var cats = {};
        docs.forEach(function (d) { (cats[d.categorie] = cats[d.categorie] || []).push(d); });
        var html = '';
        Object.keys(cats).forEach(function (cat) {
          html += '<h3 class="biblio-cat">' + escapeHtml(cat) + '</h3><div class="biblio-grid">';
          cats[cat].forEach(function (d) {
            html += '<a class="biblio-doc" href="' + (d.url || '#') + '" target="_blank" rel="noopener">' +
              '<span class="biblio-doc__ico">📄</span><span class="biblio-doc__t">' + escapeHtml(d.titre) + '</span></a>';
          });
          html += '</div>';
        });
        list.innerHTML = html;
      })
      .catch(function () { if (btn) btn.disabled = false; msg.textContent = 'Erreur de connexion. Réessaie.'; });
  });
})();
