// ============================================================
// STNT — Edge Function "vote-voter"
// Enregistre le vote d'un membre connecté sur un scrutin OUVERT.
//
// Sécurité :
//   - Authentification par le jeton de session (Authorization: Bearer ...).
//   - Seul un membre VALIDÉ (statut_validation = "validee") peut voter.
//   - Émargement (anti-double-vote + quorum) inséré AVANT le bulletin.
//   - Bulletin anonyme si le scrutin est secret (votant_id = NULL),
//     nominatif sinon.
//
// Déploiement :
//   supabase functions deploy vote-voter --use-api
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
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "Connexion requise pour voter." }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const voteId = String(body.vote_id || "").trim();
    const choix = String(body.choix || "").trim();
    if (!voteId || !choix) return json({ error: "Scrutin et choix requis." }, 400);

    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // 1. Vérifier le jeton et récupérer l'utilisateur
    const authClient = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await authClient.auth.getUser();
    const user = userData?.user;
    if (userErr || !user) return json({ error: "Session invalide. Reconnecte-toi." }, 401);

    const admin = createClient(url, service);

    // 2. Le membre doit être validé
    const { data: membre } = await admin
      .from("membres")
      .select("statut_validation")
      .eq("user_id", user.id)
      .single();
    if (!membre || membre.statut_validation !== "validee") {
      return json({ error: "Ton compte n'est pas autorisé à voter." }, 403);
    }

    // 3. Le scrutin doit être ouvert, et le choix valide
    const { data: vote } = await admin
      .from("votes")
      .select("id, statut, options, secret")
      .eq("id", voteId)
      .single();
    if (!vote) return json({ error: "Scrutin introuvable." }, 404);
    if (vote.statut !== "ouvert") return json({ error: "Ce scrutin n'est pas ouvert au vote." }, 409);

    const options: string[] = Array.isArray(vote.options) ? vote.options : [];
    if (!options.includes(choix)) return json({ error: "Choix invalide." }, 400);

    // 4. Émargement (la contrainte d'unicité bloque le double vote)
    const { error: emargeErr } = await admin
      .from("vote_emargements")
      .insert([{ vote_id: voteId, user_id: user.id }]);
    if (emargeErr) {
      if (String(emargeErr.code) === "23505") {
        return json({ error: "Tu as déjà voté sur ce scrutin." }, 409);
      }
      return json({ error: "Vote impossible. Réessaie." }, 500);
    }

    // 5. Bulletin (anonyme si secret)
    const { error: bulletinErr } = await admin
      .from("vote_bulletins")
      .insert([{ vote_id: voteId, choix, votant_id: vote.secret ? null : user.id }]);
    if (bulletinErr) {
      return json({ error: "Enregistrement du bulletin impossible. Contacte le bureau." }, 500);
    }

    return json({ ok: true }, 200);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
