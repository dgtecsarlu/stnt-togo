// ============================================================
// STNT — Edge Function "adhesion-ancien"
// Inscription / mise à jour d'un ANCIEN membre, SANS paiement des
// frais d'adhésion. L'enregistrement est soumis à la validation du SG
// (statut_validation = "en_attente").
//
// Upsert par email : si le membre existe déjà, on met à jour ses infos ;
// sinon on le crée en type_adhesion = "ancien".
//
// Déploiement :
//   supabase functions deploy adhesion-ancien
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
    const nom = String(body.nom || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const telephone = String(body.telephone || "").trim();

    if (!nom || !email) return json({ error: "Nom et email requis." }, 400);
    if (body.consentement_rgpd !== true) {
      return json({ error: "Le consentement est requis." }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const now = new Date().toISOString();

    // Champs mis à jour / renseignés
    const champs: Record<string, unknown> = {
      nom_complet: nom,
      telephone: telephone || null,
      region: body.region || null,
      metier: body.metier || null,
      type_adhesion: "ancien",
      // toute (ré)inscription repasse en attente de validation du SG
      statut_validation: "en_attente",
      consentement_rgpd: true,
      maj_le: now,
    };
    if (body.photo_url) champs.photo_url = body.photo_url;

    // Le membre existe-t-il déjà ?
    const { data: existing } = await supabase
      .from("membres")
      .select("id")
      .eq("email", email)
      .single();

    if (existing) {
      const { error } = await supabase
        .from("membres")
        .update(champs)
        .eq("id", existing.id);
      if (error) return json({ error: "Mise à jour impossible. Réessaie." }, 500);
      return json({ ok: true, mode: "maj" }, 200);
    }

    const { error } = await supabase
      .from("membres")
      .insert([{ ...champs, email, statut_cotisation: "en_attente" }]);
    if (error) return json({ error: "Inscription impossible. Réessaie." }, 500);

    return json({ ok: true, mode: "creation" }, 200);
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
