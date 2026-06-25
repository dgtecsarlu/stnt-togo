/* STNT — Galerie des activités (basée sur le dépôt)
   Pour ajouter un média : ajouter une entrée dans le tableau MEDIAS ci-dessous.
   - Photo : { type:'photo', src:'assets/...', titre:'...', date:'...' }
   - Vidéo fichier : { type:'video', src:'assets/...', titre:'...', date:'...' }
   - Vidéo YouTube : { type:'video', youtube:'ID_YOUTUBE', titre:'...', date:'...' }
*/
(function () {
  'use strict';
  var grid = document.getElementById('galerieGrid');
  if (!grid) return;

  var MEDIAS = [
    { type: 'photo', src: 'assets/Date_AG_2020.PNG', titre: 'Assemblée Générale constitutive', date: '18 juillet 2020 · Bourse du Travail CNTT, Lomé' },
    { type: 'photo', src: 'assets/Photo_SG_Mandat_2020_2024.jpeg', titre: 'Le Secrétaire Général — mandat 2020-2024', date: '' },
    { type: 'photo', src: 'assets/Photo_Mme_Administrative_Yas.jpeg', titre: 'L\'administration du STNT', date: '' }
  ];

  if (!MEDIAS.length) {
    grid.innerHTML = '<p class="page-empty">Aucun média pour le moment. Revenez bientôt !</p>';
    return;
  }

  grid.innerHTML = '';
  MEDIAS.forEach(function (m) {
    var item = document.createElement('div');
    item.className = 'galerie-item';
    var media;
    if (m.type === 'video' && m.youtube) {
      media = '<iframe src="https://www.youtube.com/embed/' + m.youtube + '" title="' + (m.titre || 'Vidéo STNT') + '" allowfullscreen loading="lazy" style="width:100%;height:220px;border:0;display:block;"></iframe>';
    } else if (m.type === 'video') {
      media = '<video src="' + m.src + '" controls preload="metadata"></video>';
    } else {
      media = '<img src="' + m.src + '" alt="' + (m.titre || 'Activité du STNT') + '" loading="lazy" />';
    }
    var dl = (m.type === 'photo' || (m.type === 'video' && m.src))
      ? '<a href="' + m.src + '" download class="galerie-dl" title="Télécharger" aria-label="Télécharger">⬇</a>'
      : '';
    item.innerHTML = media +
      '<div class="galerie-item__bar"><span>' + (m.titre || '') + (m.date ? ' · ' + m.date : '') + '</span>' + dl + '</div>';
    grid.appendChild(item);
  });
})();
