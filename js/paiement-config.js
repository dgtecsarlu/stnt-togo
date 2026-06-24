// ============================================================
// STNT — Tarifs des paiements (montants publics, en FCFA / XOF)
// Montants officiels du bureau. Les montants sont arrondis au
// multiple de 5 le plus proche par le serveur (exigence CinetPay).
// ============================================================
window.STNT_TARIFS = {
  adhesion: 2000,            // frais d'adhésion
  cotisation: 12000,         // cotisation annuelle (1 000 FCFA/mois x 12)
  cotisation_mensuelle: 1000, // pour information / affichage
  // Montants suggérés pour le don (l'utilisateur peut saisir un autre montant)
  dons_suggeres: [1000, 5000, 10000, 25000]
};
