// ============================================================
// STNT — Configuration du direct interactif (Jitsi embarqué)
// Le bureau ajuste ces valeurs avant chaque AG.
//
// domain : serveur Jitsi.
//   - "meet.jit.si" = service public gratuit (OK pour test / ~50-100).
//   - Pour la grande échelle (500), auto-héberger Jitsi et mettre ici
//     votre domaine, ex. "live.stnt-togo.org" (voir INFRA-VISIO-AG.md).
// room   : nom de la salle. À CHANGER à chaque AG (et à ne pas diffuser
//          publiquement : qui a le nom peut entrer sur meet.jit.si).
// ============================================================
window.STNT_JITSI = {
  domain: "meet.jit.si",
  room: "STNT-AG-Direct-2026",
  subject: "Assemblée Générale — STNT",
  date: "" // ex. "samedi 4 juillet 2026 à 16h00 (heure de Lomé)"
};
