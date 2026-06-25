/* STNT — Console bureau des votes (via Edge Function vote-admin) */
(function () {
  'use strict';

  var cfg = window.STNT_SUPABASE;
  var gate = document.getElementById('bureauGate');
  var panel = document.getElementById('bureauPanel');
  if (!gate || !panel) return;

  var CODE = null; // code bureau, gardé en mémoire le temps de la session

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function appel(action, payload) {
    var body = payload || {}; body.action = action;
    return fetch(cfg.url + '/functions/v1/vote-admin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + cfg.anonKey,
        'apikey': cfg.anonKey,
        'x-admin-code': CODE
      },
      body: JSON.stringify(body)
    }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); });
  }

  // -------- Entrée par code bureau --------
  document.getElementById('bureauForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var msg = document.getElementById('bureauMsg');
    CODE = document.getElementById('adminCode').value;
    msg.textContent = 'Vérification…';
    appel('lister', {}).then(function (res) {
      if (!res.ok) { msg.textContent = (res.d && res.d.error) || 'Code invalide.'; CODE = null; return; }
      gate.hidden = true; panel.hidden = false;
      afficher(res.d);
    }).catch(function () { msg.textContent = 'Erreur de connexion.'; });
  });

  document.getElementById('refreshBtn').addEventListener('click', recharger);

  function recharger() {
    appel('lister', {}).then(function (res) { if (res.ok) afficher(res.d); });
  }

  function afficher(data) {
    document.getElementById('corpsInfo').textContent =
      'Corps électoral (membres validés) : ' + (data.corps_electoral || 0);
    var list = document.getElementById('bureauList');
    var votes = data.votes || [];
    if (!votes.length) { list.innerHTML = '<p class="page-empty">Aucun scrutin. Créez-en un ci-dessus.</p>'; return; }
    list.innerHTML = '';
    votes.forEach(function (v) { list.appendChild(carte(v)); });
  }

  function carte(v) {
    var el = document.createElement('div');
    el.className = 'card vote-card';
    var badge = '<span class="vote-badge vote-badge--' +
      (v.statut === 'ouvert' ? 'ok' : v.statut === 'clos' ? 'ko' : 'neutre') + '">' + escapeHtml(v.statut) + '</span>';
    var html = '<h3>' + escapeHtml(v.titre) + ' ' + badge + '</h3>' +
      (v.description ? '<p class="vote-desc">' + escapeHtml(v.description) + '</p>' : '') +
      '<p class="vote-meta">' + (v.secret ? '🔒 secret' : '👁 nominatif') +
        ' · majorité ' + escapeHtml(v.majorite) + ' · quorum ' + escapeHtml(v.quorum_pct) + '%</p>';

    if (v.statut === 'clos' && v.resultats) {
      var r = v.resultats; var lignes = Object.keys(r).map(function (k) {
        return escapeHtml(k) + ' : ' + r[k];
      }).join(' · ');
      html += '<p class="vote-meta">' + lignes + '</p>' +
        '<p class="vote-meta">' + (v.total_votants || 0) + ' votant(s) / ' + (v.corps_electoral || 0) +
        ' · ' + (v.quorum_atteint ? 'quorum atteint ✓' : 'quorum non atteint ✗') +
        (v.adopte === true ? ' · ADOPTÉE' : v.adopte === false ? ' · REJETÉE' : '') + '</p>';
    }

    html += '<div class="vote-actions"></div><p class="form__note vote-card-msg"></p>';
    el.innerHTML = html;

    var actions = el.querySelector('.vote-actions');
    var msg = el.querySelector('.vote-card-msg');
    if (v.statut === 'brouillon') {
      actions.appendChild(bouton('Ouvrir le vote', 'cobalt', function () { agir('ouvrir', v.id, msg); }));
    } else if (v.statut === 'ouvert') {
      actions.appendChild(bouton('Clore et dépouiller', 'outline', function () {
        if (confirm('Clore ce scrutin et figer les résultats ? Action définitive.')) agir('clore', v.id, msg);
      }));
    }
    return el;
  }

  function bouton(txt, variante, onClick) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn btn--' + variante + ' btn--sm';
    b.textContent = txt;
    b.addEventListener('click', onClick);
    return b;
  }

  function agir(action, id, msg) {
    msg.textContent = 'Traitement…';
    appel(action, { id: id }).then(function (res) {
      if (!res.ok) { msg.textContent = (res.d && res.d.error) || 'Action impossible.'; return; }
      recharger();
    });
  }

  // -------- Création d'un scrutin --------
  document.getElementById('newVote').addEventListener('submit', function (e) {
    e.preventDefault();
    var msg = document.getElementById('newVoteMsg');
    var options = document.getElementById('vOptions').value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    msg.textContent = 'Création…';
    appel('creer', {
      titre: document.getElementById('vTitre').value.trim(),
      description: document.getElementById('vDesc').value.trim(),
      options: options,
      majorite: document.getElementById('vMaj').value,
      quorum_pct: Number(document.getElementById('vQuorum').value),
      secret: document.getElementById('vSecret').value === 'true'
    }).then(function (res) {
      if (!res.ok) { msg.textContent = (res.d && res.d.error) || 'Création impossible.'; return; }
      msg.textContent = 'Scrutin créé (brouillon). Ouvre-le au début de la séance.';
      document.getElementById('vTitre').value = ''; document.getElementById('vDesc').value = '';
      recharger();
    });
  });
})();
