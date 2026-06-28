// ============================================================
// STNT — Edge Function "vote-jeton"
// Vote des AG par JETON UNIQUE d'invitation (sans compte).
// Le membre arrive via vote.html?jeton=XXXX.
//
// Comme le votant n'est pas authentifié Supabase, la RLS de la
// table `votes` (réservée aux "authenticated") l'empêche de lire
// les scrutins. Cette fonction les sert donc elle-même via la clé
// service, après validation du jeton.
//
// Actions (champ "action" du corps JSON) :
//   - "session" (défaut) : valide le jeton, marque l'ouverture,
//       renvoie le membre + scrutins ouverts/clos + scrutins déjà votés
//   - "voter" : { vote_id, choix } enregistre le vote
//
// Sécurité :
//   - On ne reçoit que le jeton EN CLAIR ; on le hache (SHA-256) et
//     on cherche par token_hash. Le jeton n'est jamais stocké en clair.
//   - Seul un membre VALIDÉ peut voter.
//   - Émargement (ancré sur membre_id) AVANT le bulletin. La
//     contrainte d'unicité (vote_id, membre_id) bloque le double vote,
//     y compris si le membre a aussi voté via son compte email.
//   - Bulletin anonyme si le scrutin est secret.
//
// Déploiement :
//   supabase functions deploy vote-jeton --use-api
//   (appelée depuis le navigateur avec la clé anon = JWT valide, comme
//    vote-inscription/vote-voter ; le jeton d'invitation voyage dans le
//    corps JSON, pas dans l'en-tête Authorization.)
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const body = await req.json().catch(() => ({}));
    const jeton = String(body.jeton || "").trim();
    const action = String(body.action || "session").trim();
    if (!jeton) return json({ error: "Lien d'invitation invalide (jeton manquant)." }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1. Résoudre le jeton -> invitation -> membre
    const tokenHash = await sha256Hex(jeton);
    const { data: inv } = await admin
      .from("vote_invitations")
      .select("id, membre_id, revoque, ouvert_le")
      .eq("token_hash", tokenHash)
      .single();
    if (!inv || inv.revoque) {
      return json({ error: "Lien d'invitation invalide ou révoqué. Contacte le bureau." }, 401);
    }

    const { data: membre } = await admin
      .from("membres")
      .select("id, nom_complet, statut_validation")
      .eq("id", inv.membre_id)
      .single();
    if (!membre) return json({ error: "Membre introuvable." }, 404);
    if (membre.statut_validation !== "validee") {
      return json({ error: "Ton adhésion n'est pas encore validée par le bureau." }, 403);
    }

    // Marquer la 1re ouverture du lien (best effort)
    if (!inv.ouvert_le) {
      await admin.from("vote_invitations")
        .update({ ouvert_le: new Date().toISOString() })
        .eq("id", inv.id);
    }

    // ----- Action : voter -----
    if (action === "voter") {
      const voteId = String(body.vote_id || "").trim();
      const choix = String(body.choix || "").trim();
      if (!voteId || !choix) return json({ error: "Scrutin et choix requis." }, 400);

      const { data: vote } = await admin
        .from("votes")
        .select("id, statut, options, secret")
        .eq("id", voteId)
        .single();
      if (!vote) return json({ error: "Scrutin introuvable." }, 404);
      if (vote.statut !== "ouvert") return json({ error: "Ce scrutin n'est pas ouvert au vote." }, 409);

      const options: string[] = Array.isArray(vote.options) ? vote.options : [];
      if (!options.includes(choix)) return json({ error: "Choix invalide." }, 400);

      // Émargement ancré sur le membre (bloque le double vote, tous canaux)
      const { error: emargeErr } = await admin
        .from("vote_emargements")
        .insert([{ vote_id: voteId, membre_id: membre.id, canal: "jeton" }]);
      if (emargeErr) {
        if (String(emargeErr.code) === "23505") {
          return json({ error: "Tu as déjà voté sur ce scrutin." }, 409);
        }
        return json({ error: "Vote impossible. Réessaie." }, 500);
      }

      // Bulletin (anonyme si secret)
      const { error: bulletinErr } = await admin
        .from("vote_bulletins")
        .insert([{ vote_id: voteId, choix, votant_membre_id: vote.secret ? null : membre.id }]);
      if (bulletinErr) {
        return json({ error: "Enregistrement du bulletin impossible. Contacte le bureau." }, 500);
      }

      return json({ ok: true }, 200);
    }

    // ----- Action : session (défaut) -----
    // Scrutins ouverts + clos (servis par le serveur, RLS contournée)
    const { data: scrutins } = await admin
      .from("votes")
      .select("*")
      .in("statut", ["ouvert", "clos"])
      .order("created_at", { ascending: false });

    // Scrutins déjà votés par ce membre (émargements)
    const { data: emarges } = await admin
      .from("vote_emargements")
      .select("vote_id")
      .eq("membre_id", membre.id);
    const dejaVotes = (emarges || []).map((e: { vote_id: string }) => e.vote_id);

    // On n'expose jamais les options de comptage internes inutiles ;
    // on renvoie les scrutins tels quels (déjà filtrés ouvert/clos).
    return json({
      ok: true,
      membre: { nom: membre.nom_complet },
      scrutins: scrutins || [],
      deja_votes: dejaVotes,
    }, 200);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
