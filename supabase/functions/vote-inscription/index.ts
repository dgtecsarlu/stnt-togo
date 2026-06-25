// ============================================================
// STNT — Edge Function "vote-inscription"
// Auto-inscription CONTRÔLÉE d'un électeur.
// Crée un compte Supabase Auth (email + mot de passe) UNIQUEMENT si
// l'email est déjà dans la base `membres` ET validé par le SG
// (statut_validation = "validee"). Lie le compte à la ligne membre.
//
// Aucune création de compte possible pour un non-membre ou un membre
// non encore validé : la liste électorale reste maîtrisée.
//
// Déploiement :
//   supabase functions deploy vote-inscription --use-api
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
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");

    if (!email || !password) return json({ error: "Email et mot de passe requis." }, 400);
    if (password.length < 8) {
      return json({ error: "Le mot de passe doit faire au moins 8 caractères." }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1. L'email doit correspondre à un membre VALIDÉ par le SG
    const { data: membre } = await admin
      .from("membres")
      .select("id, user_id, statut_validation, nom_complet")
      .eq("email", email)
      .single();

    if (!membre) {
      return json({ error: "Cet email n'est pas dans la liste des membres. Adhère d'abord ou contacte le bureau." }, 403);
    }
    if (membre.statut_validation !== "validee") {
      return json({ error: "Ton adhésion n'est pas encore validée par le Secrétaire Général." }, 403);
    }
    if (membre.user_id) {
      return json({ error: "Un compte existe déjà pour cet email. Connecte-toi ou réinitialise ton mot de passe." }, 409);
    }

    // 2. Création du compte Auth (email considéré vérifié : déjà sur la liste)
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nom_complet: membre.nom_complet || null },
    });
    if (createErr || !created?.user) {
      return json({ error: "Création du compte impossible. Réessaie." }, 500);
    }

    // 3. Lien membre ↔ compte
    const { error: linkErr } = await admin
      .from("membres")
      .update({ user_id: created.user.id })
      .eq("id", membre.id);
    if (linkErr) {
      // on supprime le compte créé pour rester cohérent
      await admin.auth.admin.deleteUser(created.user.id);
      return json({ error: "Liaison du compte impossible. Réessaie." }, 500);
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
