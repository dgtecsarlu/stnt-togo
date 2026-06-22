/* ============================================================
   STNT — Script principal
   Webmaster : Ing. BODJONA Bataka Pignanti
   ============================================================ */
(function () {
  'use strict';

  /* ---------- Client Supabase (optionnel) ---------- */
  var sb = null;
  (function () {
    var cfg = window.STNT_SUPABASE;
    if (cfg && cfg.url && cfg.anonKey && cfg.url.indexOf('VOTRE-PROJET') === -1 && window.supabase) {
      try { sb = window.supabase.createClient(cfg.url, cfg.anonKey); } catch (e) { sb = null; }
    }
  })();

  /* ---------- Menu mobile ---------- */
  var navToggle = document.getElementById('navToggle');
  var nav = document.getElementById('nav');
  if (navToggle && nav) {
    navToggle.addEventListener('click', function () { nav.classList.toggle('open'); });
    nav.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () { nav.classList.remove('open'); });
    });
  }

  /* ---------- Bureau National (données -> cartes) ---------- */
  var bureau = [
    { poste: 'Secrétaire Général (SG)', sigle: 'SG', note: 'Super-Admin du système' },
    { poste: 'Secrétaire Général Adjoint', sigle: 'SGA', note: 'Coordination régionale' },
    { poste: 'Trésorier Général', sigle: 'TG', note: 'Finances & audits' },
    { poste: 'Trésorier Adjoint', sigle: 'TA', note: 'Cotisations locales' },
    { poste: "Secrétaire à l'Organisation", sigle: 'SO', note: 'AG & logistique' },
    { poste: "Secrétaire à l'Information", sigle: 'SI', note: 'Newsletter & com' },
    { poste: 'Secrétaire aux Affaires Juridiques', sigle: 'AJ', note: 'Droit & legs' },
    { poste: 'Secrétaire à la Formation', sigle: 'SF', note: 'Webinaires' },
    { poste: 'Secrétaire aux Relations Extérieures', sigle: 'RE', note: 'Partenariats' },
    { poste: "Chargé(e) du Genre et de l'Inclusion", sigle: 'GI', note: 'Équité numérique' }
  ];
  var grid = document.getElementById('bureauGrid');
  if (grid) {
    bureau.forEach(function (m) {
      var el = document.createElement('div');
      el.className = 'card member reveal';
      el.innerHTML =
        '<span class="member__badge">Élu 2026</span>' +
        '<div class="member__avatar">' + m.sigle + '</div>' +
        '<h4>[Nom à renseigner]</h4>' +
        '<div class="member__role">' + m.poste + '</div>' +
        '<p style="font-size:0.8rem;color:var(--acier-light);margin-top:6px;">' + m.note + '</p>';
      grid.appendChild(el);
    });
  }

  /* ---------- Compteurs animés ---------- */
  function animateCount(el) {
    var target = parseInt(el.getAttribute('data-count'), 10);
    var dur = 1400, start = null;
    function step(ts) {
      if (!start) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      el.textContent = Math.floor(p * target);
      if (p < 1) requestAnimationFrame(step);
      else el.textContent = target;
    }
    requestAnimationFrame(step);
  }

  /* ---------- Reveal au scroll + déclenche compteurs ---------- */
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        var counters = entry.target.querySelectorAll('[data-count]');
        counters.forEach(function (c) {
          if (!c.dataset.done) { c.dataset.done = '1'; animateCount(c); }
        });
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });
  document.querySelectorAll('.reveal').forEach(function (el) { io.observe(el); });

  /* ---------- Toast ---------- */
  var toast = document.getElementById('toast');
  function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { toast.classList.remove('show'); }, 4200);
  }

  /* ---------- Aperçu photo ---------- */
  var photo = document.getElementById('photo');
  var photoLabel = document.getElementById('photoLabel');
  if (photo && photoLabel) {
    photo.addEventListener('change', function () {
      if (photo.files && photo.files[0]) {
        photoLabel.textContent = '✅ ' + photo.files[0].name;
        photoLabel.style.color = 'var(--emeraude)';
      }
    });
  }

  /* ---------- Soumission formulaires (maquette) ---------- */
  var joinForm = document.getElementById('joinForm');
  if (joinForm) {
    var joinBtn = joinForm.querySelector('button[type="submit"]');
    function resetJoin() {
      joinForm.reset();
      if (photoLabel) { photoLabel.textContent = '📸 Prendre ou ajouter une photo (JPEG / PNG)'; photoLabel.style.color = ''; }
    }
    joinForm.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!joinForm.checkValidity()) { joinForm.reportValidity(); return; }

      // Repli démo si Supabase n'est pas configuré
      if (!sb) {
        showToast('Demande enregistrée (démo). Backend non connecté.');
        resetJoin();
        return;
      }

      var data = {
        nom_complet: joinForm.nom.value.trim(),
        email: joinForm.email.value.trim().toLowerCase(),
        telephone: joinForm.tel.value.trim(),
        region: joinForm.region.value || null,
        metier: joinForm.metier.value || null,
        type_adhesion: 'nouveau',
        statut_cotisation: 'en_attente',
        consentement_rgpd: document.getElementById('consent').checked
      };

      if (joinBtn) { joinBtn.disabled = true; joinBtn.textContent = 'Enregistrement...'; }

      sb.from('membres').insert([data]).then(function (res) {
        if (joinBtn) { joinBtn.disabled = false; joinBtn.textContent = 'Payer mon adhésion'; }
        if (res.error) {
          var msg = (res.error.code === '23505')
            ? 'Cet email est déjà inscrit au STNT.'
            : 'Erreur lors de l\'inscription. Réessaie ou écris à webmaster@stnt-togo.org.';
          showToast(msg);
          return;
        }
        showToast('Adhésion enregistrée. Bienvenue au STNT ! Le paiement T-Money / Moov suivra.');
        resetJoin();
      });
    });
  }
  var contactForm = document.getElementById('contactForm');
  if (contactForm) {
    contactForm.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!contactForm.checkValidity()) { contactForm.reportValidity(); return; }
      showToast('Merci ! Votre message est bien noté (démo).');
      contactForm.reset();
    });
  }

  /* ---------- Cartographie Leaflet (Togo) ---------- */
  if (window.L && document.getElementById('map')) {
    var map = L.map('map', { scrollWheelZoom: false }).setView([8.6195, 0.8248], 6.4);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap', maxZoom: 12
    }).addTo(map);

    // Densité anonymisée par région (données de démonstration)
    var regions = [
      { nom: 'Maritime (Lomé)', coords: [6.1725, 1.2314], niveau: 'Forte présence', couleur: '#10B981', rayon: 26 },
      { nom: 'Plateaux (Atakpamé)', coords: [7.5333, 1.1333], niveau: 'Présence moyenne', couleur: '#2563EB', rayon: 18 },
      { nom: 'Centrale (Sokodé)', coords: [8.9833, 1.1333], niveau: 'Présence moyenne', couleur: '#2563EB', rayon: 16 },
      { nom: 'Kara', coords: [9.5511, 1.1861], niveau: 'À développer', couleur: '#94a3b8', rayon: 13 },
      { nom: 'Savanes (Dapaong)', coords: [10.8625, 0.2075], niveau: 'À développer', couleur: '#94a3b8', rayon: 12 }
    ];
    regions.forEach(function (r) {
      L.circleMarker(r.coords, {
        radius: r.rayon, color: r.couleur, fillColor: r.couleur,
        fillOpacity: 0.45, weight: 2
      }).addTo(map).bindPopup('<strong>' + r.nom + '</strong><br>' + r.niveau);
    });
  }
})();
