/* ============================================================
   STNT — Paiements en ligne (CinetPay)
   Mixx By Yas · Flooz · Cartes bancaires
   Branche les formulaires Adhésion / Cotisation / Don sur
   l'Edge Function "paiement-init" puis redirige vers CinetPay.
   Webmaster : Ing. BODJONA Bataka Pignanti
   ============================================================ */
(function () {
  'use strict';

  var cfg = window.STNT_SUPABASE;
  var tarifs = window.STNT_TARIFS || {};
  var configured = !!(cfg && cfg.url && cfg.anonKey && cfg.url.indexOf('VOTRE-PROJET') === -1);

  // Client Supabase (pour l'upload de la photo d'adhésion)
  var sb = null;
  if (configured && window.supabase) {
    try { sb = window.supabase.createClient(cfg.url, cfg.anonKey); } catch (e) { sb = null; }
  }

  /* ---------- Toast partagé ---------- */
  var toast = document.getElementById('toast');
  function showToast(msg) {
    if (!toast) { alert(msg); return; }
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { toast.classList.remove('show'); }, 4500);
  }

  /* ---------- Appel à l'Edge Function paiement-init ---------- */
  function lancerPaiement(payload, btn, labelBtn) {
    if (!configured) {
      showToast('Paiement non configuré (backend absent). Démo.');
      return;
    }
    if (btn) { btn.disabled = true; btn.dataset.lbl = btn.textContent; btn.textContent = 'Redirection vers le paiement…'; }

    payload.retour_url = window.location.origin + '/paiement-retour.html';

    fetch(cfg.url + '/functions/v1/paiement-init', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + cfg.anonKey,
        'apikey': cfg.anonKey
      },
      body: JSON.stringify(payload)
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (!res.ok || !res.d || !res.d.payment_url) {
          if (btn) { btn.disabled = false; btn.textContent = labelBtn || btn.dataset.lbl || 'Payer'; }
          showToast((res.d && res.d.error) ? res.d.error : 'Impossible d\'initier le paiement. Réessaie.');
          return;
        }
        // Redirection vers la page de paiement CinetPay
        window.location.href = res.d.payment_url;
      })
      .catch(function () {
        if (btn) { btn.disabled = false; btn.textContent = labelBtn || btn.dataset.lbl || 'Payer'; }
        showToast('Erreur de connexion. Vérifie ta connexion et réessaie.');
      });
  }

  /* ============================================================
     1) ADHÉSION
     ============================================================ */
  var joinForm = document.getElementById('joinForm');
  if (joinForm) {
    var joinBtn = joinForm.querySelector('button[type="submit"]');
    var photo = document.getElementById('photo');

    joinForm.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!joinForm.checkValidity()) { joinForm.reportValidity(); return; }

      var data = {
        type: 'adhesion',
        montant: tarifs.adhesion || 2000,
        nom: joinForm.nom.value.trim(),
        email: joinForm.email.value.trim().toLowerCase(),
        telephone: joinForm.tel.value.trim(),
        region: joinForm.region.value || null,
        metier: joinForm.metier.value || null,
        consentement_rgpd: !!(document.getElementById('consent') && document.getElementById('consent').checked)
      };

      var file = (photo && photo.files && photo.files[0]) ? photo.files[0] : null;

      function go() { lancerPaiement(data, joinBtn, 'Payer mon adhésion'); }

      // Upload de la photo (optionnel) avant le paiement
      if (file && sb) {
        if (joinBtn) { joinBtn.disabled = true; joinBtn.textContent = 'Envoi de la photo…'; }
        var ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
        var path = Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext;
        sb.storage.from('membres-photos').upload(path, file).then(function (up) {
          if (!up.error) {
            var pub = sb.storage.from('membres-photos').getPublicUrl(path);
            if (pub && pub.data) data.photo_url = pub.data.publicUrl;
          }
          go();
        });
      } else {
        go();
      }
    });
  }

  /* ============================================================
     2) DON à la caisse de solidarité
     ============================================================ */
  var donForm = document.getElementById('donForm');
  if (donForm) {
    var donBtn = donForm.querySelector('button[type="submit"]');
    var donMontant = document.getElementById('donMontant');

    // Boutons de montants suggérés -> remplissent le champ
    donForm.querySelectorAll('[data-don]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (donMontant) donMontant.value = b.getAttribute('data-don');
        donForm.querySelectorAll('[data-don]').forEach(function (x) { x.classList.remove('is-active'); });
        b.classList.add('is-active');
      });
    });

    donForm.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!donForm.checkValidity()) { donForm.reportValidity(); return; }
      var montant = parseInt(donMontant.value, 10);
      if (!montant || montant < 100) { showToast('Montant minimum : 100 FCFA.'); return; }

      var anon = !!(document.getElementById('donAnon') && document.getElementById('donAnon').checked);
      lancerPaiement({
        type: 'don',
        montant: montant,
        nom: anon ? '' : (donForm.donNom ? donForm.donNom.value.trim() : ''),
        email: donForm.donEmail ? donForm.donEmail.value.trim().toLowerCase() : '',
        telephone: donForm.donTel ? donForm.donTel.value.trim() : '',
        anonyme: anon
      }, donBtn, 'Faire mon don');
    });
  }

  /* ============================================================
     3) COTISATION (membre déjà inscrit)
     ============================================================ */
  var cotForm = document.getElementById('cotisationForm');
  if (cotForm) {
    var cotBtn = cotForm.querySelector('button[type="submit"]');
    cotForm.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!cotForm.checkValidity()) { cotForm.reportValidity(); return; }
      lancerPaiement({
        type: 'cotisation',
        montant: tarifs.cotisation || 6000,
        nom: cotForm.cotNom.value.trim(),
        email: cotForm.cotEmail.value.trim().toLowerCase(),
        telephone: cotForm.cotTel ? cotForm.cotTel.value.trim() : ''
      }, cotBtn, 'Payer ma cotisation');
    });
  }

  /* ============================================================
     4) ONGLETS Nouvel adhérent / Ancien membre
     ============================================================ */
  var tabs = [].slice.call(document.querySelectorAll('.adh-tab'));
  var panels = [].slice.call(document.querySelectorAll('.adh-panel'));
  if (tabs.length && panels.length) {
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        var name = tab.getAttribute('data-tab');
        tabs.forEach(function (t) {
          var on = t === tab;
          t.classList.toggle('is-active', on);
          t.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        panels.forEach(function (p) {
          var show = p.getAttribute('data-panel') === name;
          p.hidden = !show;
          // Les .reveal d'un panneau masqué ne sont jamais "vus" par
          // l'IntersectionObserver : on les rend visibles à l'affichage.
          if (show) {
            p.querySelectorAll('.reveal').forEach(function (el) { el.classList.add('visible'); });
          }
        });
      });
    });
  }

  /* ---------- Aperçu photo (ancien membre) ---------- */
  var aPhoto = document.getElementById('aPhoto');
  var aPhotoLabel = document.getElementById('aPhotoLabel');
  if (aPhoto && aPhotoLabel) {
    aPhoto.addEventListener('change', function () {
      if (aPhoto.files && aPhoto.files[0]) {
        aPhotoLabel.textContent = '✅ ' + aPhoto.files[0].name;
        aPhotoLabel.style.color = 'var(--emeraude-light)';
      }
    });
  }

  /* ============================================================
     5) ANCIEN MEMBRE : mise à jour des infos, SANS paiement
     ============================================================ */
  var ancienForm = document.getElementById('ancienForm');
  if (ancienForm) {
    var ancienBtn = ancienForm.querySelector('button[type="submit"]');

    function resetAncien() {
      ancienForm.reset();
      if (aPhotoLabel) { aPhotoLabel.textContent = '📸 Prendre ou ajouter une photo (JPEG / PNG)'; aPhotoLabel.style.color = ''; }
    }

    ancienForm.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!ancienForm.checkValidity()) { ancienForm.reportValidity(); return; }

      if (!configured) {
        showToast('Inscription enregistrée avec succès (démo). Soumise à la validation du SG.');
        resetAncien();
        return;
      }

      var data = {
        nom: ancienForm.aNom.value.trim(),
        email: ancienForm.aEmail.value.trim().toLowerCase(),
        telephone: ancienForm.aTel.value.trim(),
        region: ancienForm.aRegion.value || null,
        metier: ancienForm.aMetier.value || null,
        consentement_rgpd: !!(document.getElementById('aConsent') && document.getElementById('aConsent').checked)
      };

      function envoyer() {
        if (ancienBtn) { ancienBtn.disabled = true; ancienBtn.textContent = 'Enregistrement…'; }
        fetch(cfg.url + '/functions/v1/adhesion-ancien', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + cfg.anonKey,
            'apikey': cfg.anonKey
          },
          body: JSON.stringify(data)
        })
          .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
          .then(function (res) {
            if (ancienBtn) { ancienBtn.disabled = false; ancienBtn.textContent = 'Mettre à jour mes informations'; }
            if (!res.ok) {
              showToast((res.d && res.d.error) ? res.d.error : 'Erreur. Réessaie ou écris à webmaster@stnt-togo.org.');
              return;
            }
            showToast('Inscription enregistrée avec succès. Soumise à la validation du Secrétaire Général.');
            resetAncien();
          })
          .catch(function () {
            if (ancienBtn) { ancienBtn.disabled = false; ancienBtn.textContent = 'Mettre à jour mes informations'; }
            showToast('Erreur de connexion. Réessaie.');
          });
      }

      // Upload photo (optionnel) avant l'envoi
      var file = (aPhoto && aPhoto.files && aPhoto.files[0]) ? aPhoto.files[0] : null;
      if (file && sb) {
        if (ancienBtn) { ancienBtn.disabled = true; ancienBtn.textContent = 'Envoi de la photo…'; }
        var ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
        var path = Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext;
        sb.storage.from('membres-photos').upload(path, file).then(function (up) {
          if (!up.error) {
            var pub = sb.storage.from('membres-photos').getPublicUrl(path);
            if (pub && pub.data) data.photo_url = pub.data.publicUrl;
          }
          envoyer();
        });
      } else {
        envoyer();
      }
    });
  }
})();
