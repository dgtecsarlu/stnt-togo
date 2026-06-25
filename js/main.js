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
  document.querySelectorAll('.reveal').forEach(function (el) {
    var parent = el.parentElement;
    if (parent) {
      var sibs = [].slice.call(parent.children).filter(function (c) { return c.classList.contains('reveal'); });
      var idx = sibs.indexOf(el);
      if (idx > 0) el.style.setProperty('--d', Math.min(idx * 70, 350) + 'ms');
    }
    io.observe(el);
  });

  /* ---------- Header au défilement + lien de navigation actif ---------- */
  var header = document.querySelector('.header');
  var navLinks = nav ? [].slice.call(nav.querySelectorAll('a[href^="#"]:not(.btn)')) : [];
  var navSections = navLinks
    .map(function (a) { return document.querySelector(a.getAttribute('href')); })
    .filter(Boolean);
  function onScroll() {
    if (header) header.classList.toggle('scrolled', window.scrollY > 20);
    var pos = window.scrollY + 90, current = null;
    navSections.forEach(function (s) { if (s.offsetTop <= pos) current = s.id; });
    navLinks.forEach(function (a) {
      a.classList.toggle('active', a.getAttribute('href') === '#' + current);
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

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

  /* ---------- Soumission du formulaire de contact (maquette) ----------
     NB : l'adhésion et les paiements (Mixx By Yas / Flooz) sont
     gérés par js/paiement.js via l'Edge Function PayGate. */
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
