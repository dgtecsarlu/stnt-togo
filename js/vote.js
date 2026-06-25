/* STNT — Espace de vote des AG (Supabase Auth + scrutins) */
(function () {
  'use strict';

  var cfg = window.STNT_SUPABASE;
  var authBox = document.getElementById('voteAuth');
  var space = document.getElementById('voteSpace');
  if (!authBox || !space) return;

  if (!cfg || !cfg.url || typeof window.supabase === 'undefined') {
    authBox.hidden = false;
    document.getElementById('loginMsg').textContent = 'Configuration indisponible. Réessaie plus tard.';
    return;
  }

  var sb = window.supabase.createClient(cfg.url, cfg.anonKey);
  var VOTED_KEY = 'stnt_votes_emis';

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function votedSet() {
    try { return JSON.parse(localStorage.getItem(VOTED_KEY) || '[]'); } catch (e) { return []; }
  }
  function markVoted(id) {
    var s = votedSet(); if (s.indexOf(id) === -1) { s.push(id); localStorage.setItem(VOTED_KEY, JSON.stringify(s)); }
  }

  // -------- Bascule connexion / inscription --------
  Array.prototype.forEach.call(document.querySelectorAll('.vote-tab'), function (tab) {
    tab.addEventListener('click', function () {
      var name = tab.getAttribute('data-tab');
      Array.prototype.forEach.call(document.querySelectorAll('.vote-tab'), function (t) {
        t.classList.toggle('is-active', t === tab);
      });
      Array.prototype.forEach.call(document.querySelectorAll('.vote-pane'), function (p) {
        p.hidden = p.getAttribute('data-pane') !== name;
      });
    });
  });

  // -------- Connexion --------
  document.getElementById('loginForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var msg = document.getElementById('loginMsg');
    var btn = this.querySelector('button[type="submit"]');
    msg.textContent = 'Connexion…'; if (btn) btn.disabled = true;
    sb.auth.signInWithPassword({
      email: document.getElementById('loginEmail').value.trim().toLowerCase(),
      password: document.getElementById('loginPass').value
    }).then(function (res) {
      if (btn) btn.disabled = false;
      if (res.error) { msg.textContent = 'Email ou mot de passe incorrect.'; return; }
      render();
    });
  });

  // -------- Création d'accès (auto-inscription contrôlée) --------
  document.getElementById('signupForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var msg = document.getElementById('signupMsg');
    var btn = this.querySelector('button[type="submit"]');
    var email = document.getElementById('signEmail').value.trim().toLowerCase();
    var p1 = document.getElementById('signPass').value;
    var p2 = document.getElementById('signPass2').value;
    if (p1 !== p2) { msg.textContent = 'Les deux mots de passe ne correspondent pas.'; return; }
    if (p1.length < 8) { msg.textContent = 'Mot de passe : 8 caractères minimum.'; return; }
    msg.textContent = 'Création du compte…'; if (btn) btn.disabled = true;

    fetch(cfg.url + '/functions/v1/vote-inscription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.anonKey, 'apikey': cfg.anonKey },
      body: JSON.stringify({ email: email, password: p1 })
    }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (!res.ok) { if (btn) btn.disabled = false; msg.textContent = (res.d && res.d.error) || 'Création impossible.'; return; }
        // compte créé : on connecte directement
        return sb.auth.signInWithPassword({ email: email, password: p1 }).then(function (r2) {
          if (btn) btn.disabled = false;
          if (r2.error) { msg.textContent = 'Compte créé. Connecte-toi avec ton mot de passe.'; return; }
          render();
        });
      }).catch(function () { if (btn) btn.disabled = false; msg.textContent = 'Erreur de connexion. Réessaie.'; });
  });

  // -------- Déconnexion --------
  document.getElementById('logoutBtn').addEventListener('click', function () {
    sb.auth.signOut().then(render);
  });

  // -------- Affichage selon l'état de session --------
  function render() {
    sb.auth.getSession().then(function (res) {
      var session = res.data && res.data.session;
      if (!session) { authBox.hidden = false; space.hidden = true; return; }
      authBox.hidden = true; space.hidden = false;
      var email = session.user && session.user.email;
      document.getElementById('voteWho').textContent = 'Connecté : ' + (email || 'membre');
      chargerScrutins(session.access_token);
    });
  }

  function chargerScrutins(token) {
    var open = document.getElementById('voteOpen');
    var closed = document.getElementById('voteClosed');
    sb.from('votes').select('*').in('statut', ['ouvert', 'clos']).order('created_at', { ascending: false })
      .then(function (res) {
        if (res.error) { open.innerHTML = '<p class="page-empty">Lecture impossible.</p>'; return; }
        var ouverts = [], clos = [];
        (res.data || []).forEach(function (v) { (v.statut === 'ouvert' ? ouverts : clos).push(v); });
        open.innerHTML = ouverts.length ? '' : '<p class="page-empty">Aucun scrutin ouvert pour le moment.</p>';
        ouverts.forEach(function (v) { open.appendChild(carteVote(v, token)); });
        closed.innerHTML = clos.length ? '' : '<p class="page-empty">Aucun résultat publié.</p>';
        clos.forEach(function (v) { closed.appendChild(carteResultat(v)); });
      });
  }

  function carteVote(v, token) {
    var dejaVote = votedSet().indexOf(v.id) !== -1;
    var el = document.createElement('div');
    el.className = 'card vote-card';
    var opts = (Array.isArray(v.options) ? v.options : []).map(function (o) {
      return '<label class="vote-opt"><input type="radio" name="opt_' + v.id + '" value="' + escapeHtml(o) + '" /> ' + escapeHtml(o) + '</label>';
    }).join('');
    el.innerHTML =
      '<h3>' + escapeHtml(v.titre) + '</h3>' +
      (v.description ? '<p class="vote-desc">' + escapeHtml(v.description) + '</p>' : '') +
      '<p class="vote-meta">' + (v.secret ? '🔒 Bulletin secret' : '👁 Vote nominatif') + ' · Majorité ' + escapeHtml(v.majorite) + ' · Quorum ' + escapeHtml(v.quorum_pct) + '%</p>' +
      '<div class="vote-opts">' + opts + '</div>' +
      '<button type="button" class="btn btn--cobalt vote-go"' + (dejaVote ? ' disabled' : '') + '>' + (dejaVote ? 'Vote enregistré ✓' : 'Voter') + '</button>' +
      '<p class="form__note vote-card-msg"></p>';

    var btn = el.querySelector('.vote-go');
    var msg = el.querySelector('.vote-card-msg');
    btn.addEventListener('click', function () {
      var sel = el.querySelector('input[name="opt_' + v.id + '"]:checked');
      if (!sel) { msg.textContent = 'Choisis une option.'; return; }
      btn.disabled = true; msg.textContent = 'Envoi…';
      fetch(cfg.url + '/functions/v1/vote-voter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token, 'apikey': cfg.anonKey },
        body: JSON.stringify({ vote_id: v.id, choix: sel.value })
      }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
        .then(function (res) {
          if (!res.ok) {
            msg.textContent = (res.d && res.d.error) || 'Vote impossible.';
            if (res.d && /déjà voté/.test(res.d.error || '')) { markVoted(v.id); btn.textContent = 'Vote enregistré ✓'; }
            else { btn.disabled = false; }
            return;
          }
          markVoted(v.id);
          btn.textContent = 'Vote enregistré ✓'; msg.textContent = 'Merci, ton vote est pris en compte.';
        }).catch(function () { btn.disabled = false; msg.textContent = 'Erreur réseau. Réessaie.'; });
    });
    return el;
  }

  function carteResultat(v) {
    var el = document.createElement('div');
    el.className = 'card vote-card vote-card--clos';
    var r = v.resultats || {};
    var total = 0; Object.keys(r).forEach(function (k) { total += r[k]; });
    var barres = Object.keys(r).map(function (k) {
      var n = r[k]; var pct = total ? Math.round((n / total) * 100) : 0;
      return '<div class="vote-res"><span class="vote-res__l">' + escapeHtml(k) + '</span>' +
        '<span class="vote-res__bar"><span style="width:' + pct + '%"></span></span>' +
        '<span class="vote-res__n">' + n + ' (' + pct + '%)</span></div>';
    }).join('');
    var verdict = '';
    if (v.adopte === true) verdict = '<span class="vote-badge vote-badge--ok">Adoptée</span>';
    else if (v.adopte === false) verdict = '<span class="vote-badge vote-badge--ko">Rejetée</span>';
    el.innerHTML =
      '<h3>' + escapeHtml(v.titre) + ' ' + verdict + '</h3>' +
      (v.description ? '<p class="vote-desc">' + escapeHtml(v.description) + '</p>' : '') +
      '<div class="vote-ress">' + barres + '</div>' +
      '<p class="vote-meta">' + (v.total_votants || 0) + ' votant(s) sur ' + (v.corps_electoral || 0) + ' inscrits · ' +
        (v.quorum_atteint ? 'quorum atteint ✓' : 'quorum NON atteint ✗') + '</p>';
    return el;
  }

  render();
})();
