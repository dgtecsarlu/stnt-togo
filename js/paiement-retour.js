/* ============================================================
   STNT — Page de retour après paiement
   Lit la référence ?ref=... dans l'URL et interroge l'Edge
   Function "paiement-statut" jusqu'à confirmation (ou délai).
   ============================================================ */
(function () {
  'use strict';

  var cfg = window.STNT_SUPABASE;
  var spinner = document.getElementById('paySpinner');
  var title = document.getElementById('payTitle');
  var msg = document.getElementById('payMsg');
  var actions = document.getElementById('payActions');

  function getRef() {
    var m = window.location.search.match(/[?&]ref=([^&]+)/);
    return m ? decodeURIComponent(m[1]) : '';
  }

  function finish(state) {
    if (spinner) spinner.style.display = 'none';
    if (actions) actions.hidden = false;
    var result = document.getElementById('payResult');
    if (result) result.classList.add('pay-result--' + state);
  }

  var ref = getRef();

  if (!cfg || !cfg.url) {
    title.textContent = 'Configuration manquante';
    msg.textContent = 'Le backend n\'est pas configuré. Contacte le webmaster.';
    finish('error');
    return;
  }
  if (!ref) {
    title.textContent = 'Référence introuvable';
    msg.textContent = 'Aucune référence de paiement n\'a été transmise. Si tu as été débité, écris à webmaster@stnt-togo.org.';
    finish('error');
    return;
  }

  var tries = 0;
  var MAX = 12; // ~36 s (le webhook CinetPay arrive en quelques secondes)

  function poll() {
    tries++;
    fetch(cfg.url + '/functions/v1/paiement-statut', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + cfg.anonKey,
        'apikey': cfg.anonKey
      },
      body: JSON.stringify({ transaction_id: ref })
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var s = d && d.statut;
        if (s === 'paye') {
          title.textContent = '✅ Paiement confirmé. Merci !';
          if (d.type === 'adhesion') {
            msg.textContent = 'Inscription enregistrée avec succès et soumise à la validation du Secrétaire Général. Tu recevras la confirmation par email. Bienvenue au STNT !';
          } else if (d.type === 'don') {
            msg.textContent = 'Ton don a bien été reçu. Merci pour ton soutien à la solidarité du STNT !';
          } else {
            msg.textContent = 'Ton paiement a bien été reçu. Tu recevras la confirmation par email.';
          }
          finish('ok');
          return;
        }
        if (s === 'echoue' || s === 'annule') {
          title.textContent = '❌ Paiement non abouti';
          msg.textContent = 'Le paiement n\'a pas été validé. Tu peux réessayer depuis le site. Aucun montant n\'a été retenu.';
          finish('error');
          return;
        }
        // en_attente / inconnu : on continue à interroger
        if (tries >= MAX) {
          title.textContent = '⏳ Paiement en cours de vérification';
          msg.textContent = 'La confirmation prend un peu plus de temps que prévu. Si tu as été débité, ton statut sera mis à jour automatiquement. En cas de doute, écris à webmaster@stnt-togo.org.';
          finish('pending');
          return;
        }
        setTimeout(poll, 3000);
      })
      .catch(function () {
        if (tries >= MAX) {
          title.textContent = 'Vérification impossible';
          msg.textContent = 'Impossible de vérifier le statut pour le moment. Réessaie plus tard ou contacte le webmaster.';
          finish('error');
          return;
        }
        setTimeout(poll, 3000);
      });
  }

  poll();
})();
