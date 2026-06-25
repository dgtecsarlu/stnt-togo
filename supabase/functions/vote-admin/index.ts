// ============================================================
// STNT — Edge Function "vote-admin"
// Console du BUREAU : créer / ouvrir / clore (dépouiller) / lister les
// scrutins. Protégée par le secret VOTE_ADMIN_CODE (en-tête x-admin-code).
// En attendant un vrai tableau de bord SG avec rôles.
//
// Actions (champ "action" du corps JSON) :
//   - "lister"   : renvoie tous les scrutins + corps électoral courant
//   - "creer"    : { titre, description?, options?, secret?, quorum_pct?, majorite? }
//   - "ouvrir"   : { id }   -> statut = "ouvert"
//   - "clore"    : { id }   -> dépouille, fige les résultats, statut = "clos"
//
// Déploiement :
//   supabase functions deploy vote-admin --use-api
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-code",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const expected = Deno.env.get("VOTE_ADMIN_CODE");
    const provided = req.headers.get("x-admin-code") || "";
    if (!expected || provided !== expected) {
      return json({ error: "Code bureau invalide." }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "").trim();

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    if (action === "lister") {
      const { data: votes } = await admin
        .from("votes")
        .select("*")
        .order("created_at", { ascending: false });
      const corps = await corpsElectoral(admin);
      return json({ ok: true, votes: votes || [], corps_electoral: corps }, 200);
    }

    if (action === "creer") {
      const titre = String(body.titre || "").trim();
      if (!titre) return json({ error: "Le titre du scrutin est requis." }, 400);
      let options = Array.isArray(body.options) ? body.options.map((o: unknown) => String(o).trim()).filter(Boolean) : null;
      if (!options || options.length < 2) options = ["Pour", "Contre", "Abstention"];
      const row: Record<string, unknown> = {
        titre,
        description: String(body.description || "").trim() || null,
        options,
        secret: body.secret === false ? false : true,
        quorum_pct: clampPct(body.quorum_pct, 50),
        majorite: ["simple", "absolue", "deux_tiers"].includes(body.majorite) ? body.majorite : "simple",
        statut: "brouillon",
      };
      const { data, error } = await admin.from("votes").insert([row]).select("id").single();
      if (error) return json({ error: "Création impossible. Réessaie." }, 500);
      return json({ ok: true, id: data.id }, 200);
    }

    if (action === "ouvrir") {
      const id = String(body.id || "").trim();
      if (!id) return json({ error: "Identifiant du scrutin requis." }, 400);
      const { error } = await admin
        .from("votes")
        .update({ statut: "ouvert", ouvre_le: new Date().toISOString() })
        .eq("id", id);
      if (error) return json({ error: "Ouverture impossible." }, 500);
      return json({ ok: true }, 200);
    }

    if (action === "clore") {
      const id = String(body.id || "").trim();
      if (!id) return json({ error: "Identifiant du scrutin requis." }, 400);

      const { data: vote } = await admin.from("votes").select("*").eq("id", id).single();
      if (!vote) return json({ error: "Scrutin introuvable." }, 404);

      // Comptages
      const { count: votants } = await admin
        .from("vote_emargements")
        .select("*", { count: "exact", head: true })
        .eq("vote_id", id);
      const { data: bulletins } = await admin
        .from("vote_bulletins")
        .select("choix")
        .eq("vote_id", id);

      const options: string[] = Array.isArray(vote.options) ? vote.options : [];
      const resultats: Record<string, number> = {};
      options.forEach((o) => (resultats[o] = 0));
      (bulletins || []).forEach((b: { choix: string }) => {
        if (resultats[b.choix] === undefined) resultats[b.choix] = 0;
        resultats[b.choix] += 1;
      });

      const corps = await corpsElectoral(admin);
      const totalVotants = votants || 0;
      const quorumAtteint = corps > 0
        ? totalVotants >= Math.ceil((corps * Number(vote.quorum_pct)) / 100)
        : totalVotants > 0;

      const adopte = calculerAdoption(resultats, vote, quorumAtteint);

      const { error } = await admin
        .from("votes")
        .update({
          statut: "clos",
          ferme_le: new Date().toISOString(),
          cloture_le: new Date().toISOString(),
          corps_electoral: corps,
          total_votants: totalVotants,
          resultats,
          quorum_atteint: quorumAtteint,
          adopte,
        })
        .eq("id", id);
      if (error) return json({ error: "Clôture impossible." }, 500);

      return json({ ok: true, resultats, total_votants: totalVotants, corps_electoral: corps, quorum_atteint: quorumAtteint, adopte }, 200);
    }

    return json({ error: "Action inconnue." }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

// Nombre de membres validés = corps électoral
async function corpsElectoral(admin: ReturnType<typeof createClient>): Promise<number> {
  const { count } = await admin
    .from("membres")
    .select("*", { count: "exact", head: true })
    .eq("statut_validation", "validee");
  return count || 0;
}

// Détermine si la résolution est adoptée (null si scrutin non Pour/Contre)
function calculerAdoption(
  resultats: Record<string, number>,
  vote: { abstention?: string; majorite: string },
  quorumAtteint: boolean,
): boolean | null {
  if (resultats["Pour"] === undefined) return null; // scrutin à choix multiples
  if (!quorumAtteint) return false;

  const abst = vote.abstention || "Abstention";
  let exprimes = 0;
  for (const [opt, n] of Object.entries(resultats)) {
    if (opt !== abst) exprimes += n;
  }
  const pour = resultats["Pour"] || 0;
  if (exprimes === 0) return false;

  if (vote.majorite === "deux_tiers") return pour >= (exprimes * 2) / 3;
  if (vote.majorite === "absolue") return pour > exprimes / 2;
  // simple : strictement plus de "Pour" que de toute autre option exprimée
  const autres = exprimes - pour;
  return pour > autres;
}

function clampPct(v: unknown, def: number): number {
  const n = Number(v);
  if (!isFinite(n) || n < 0 || n > 100) return def;
  return n;
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
