/* STNT — Galerie des activités (lecture publique Supabase) */
(function () {
  'use strict';
  var grid = document.getElementById('galerieGrid');
  if (!grid) return;
  var cfg = window.STNT_SUPABASE;
  if (!cfg || !window.supabase) {
    grid.innerHTML = '<p class="page-empty">Galerie momentanément indisponible.</p>';
    return;
  }
  var sb = window.supabase.createClient(cfg.url, cfg.anonKey);

  sb.from('galerie_medias').select('*').order('date_activite', { ascending: false }).then(function (res) {
    if (res.error || !res.data || !res.data.length) {
      grid.innerHTML = '<p class="page-empty">Aucun média pour le moment. Revenez bientôt !</p>';
      return;
    }
    grid.innerHTML = '';
    res.data.forEach(function (m) {
      var pub = sb.storage.from('galerie').getPublicUrl(m.storage_path);
      var url = (pub && pub.data) ? pub.data.publicUrl : '#';
      var item = document.createElement('div');
      item.className = 'galerie-item';
      var media = (m.type === 'video')
        ? '<video src="' + url + '" controls preload="metadata"></video>'
        : '<img src="' + url + '" alt="' + (m.titre || 'Activité du STNT') + '" loading="lazy" />';
      var date = m.date_activite ? new Date(m.date_activite).toLocaleDateString('fr-FR') : '';
      item.innerHTML = media +
        '<div class="galerie-item__bar">' +
          '<span>' + (m.titre || '') + (date ? ' · ' + date : '') + '</span>' +
          '<a href="' + url + '" download class="galerie-dl" title="Télécharger" aria-label="Télécharger">⬇</a>' +
        '</div>';
      grid.appendChild(item);
    });
  });
})();
