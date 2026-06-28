// ============================================================
// STNT — Edge Function "vote-invitations"
// Console BUREAU : génère les jetons uniques d'invitation au vote et
// envoie le lien par email à chaque membre validé.
// Protégée par le secret VOTE_ADMIN_CODE (en-tête x-admin-code),
// comme vote-admin.
//
// Actions (champ "action" du corps JSON) :
//   - "generer"  : crée un jeton pour chaque membre validé AYANT un
//                  email et SANS invitation active, puis envoie l'email.
//                  { renvoyer?: bool }  renvoyer=true régénère aussi
//                  pour ceux qui ont déjà une invitation (nouveau jeton).
//                  { mode?: "manuel" } ne tente PAS l'envoi : renvoie la
//                  liste { nom, email, lien } pour un envoi manuel.
//   - "etat"     : statistiques (générés / envoyés / ouverts / votants).
//   - "revoquer" : { membre_id }  désactive le jeton d'un membre.
//
// Email : via Resend (HTTP). Secrets requis pour l'envoi auto :
//   RESEND_API_KEY  + (optionnel) VOTE_FROM_EMAIL (défaut
//   "STNT <ag@stnt-togo.org>"). Sans RESEND_API_KEY, "generer"
//   répond 503, sauf mode="manuel".
// Base du lien : VOTE_BASE_URL (défaut "https://stnt-togo.org/vote.html").
//
// Déploiement :
//   supabase functions deploy vote-invitations --use-api
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

    const baseUrl = (Deno.env.get("VOTE_BASE_URL") || "https://stnt-togo.org/vote.html").trim();

    // -------------------- ÉTAT --------------------
    if (action === "etat") {
      const { count: corps } = await admin.from("membres")
        .select("*", { count: "exact", head: true })
        .eq("statut_validation", "validee");
      const { count: avecEmail } = await admin.from("membres")
        .select("*", { count: "exact", head: true })
        .eq("statut_validation", "validee")
        .not("email", "is", null);
      const { count: generes } = await admin.from("vote_invitations")
        .select("*", { count: "exact", head: true })
        .eq("revoque", false);
      const { count: envoyes } = await admin.from("vote_invitations")
        .select("*", { count: "exact", head: true })
        .eq("revoque", false).not("envoye_le", "is", null);
      const { count: ouverts } = await admin.from("vote_invitations")
        .select("*", { count: "exact", head: true })
        .eq("revoque", false).not("ouvert_le", "is", null);
      return json({
        ok: true,
        corps_electoral: corps || 0,
        membres_avec_email: avecEmail || 0,
        invitations_generees: generes || 0,
        invitations_envoyees: envoyes || 0,
        invitations_ouvertes: ouverts || 0,
      }, 200);
    }

    // -------------------- RÉVOQUER --------------------
    if (action === "revoquer") {
      const membreId = String(body.membre_id || "").trim();
      if (!membreId) return json({ error: "membre_id requis." }, 400);
      const { error } = await admin.from("vote_invitations")
        .update({ revoque: true })
        .eq("membre_id", membreId);
      if (error) return json({ error: "Révocation impossible." }, 500);
      return json({ ok: true }, 200);
    }

    // -------------------- GÉNÉRER --------------------
    if (action === "generer") {
      const renvoyer = body.renvoyer === true;
      const modeManuel = String(body.mode || "") === "manuel";

      const resendKey = Deno.env.get("RESEND_API_KEY");
      const fromEmail = (Deno.env.get("VOTE_FROM_EMAIL") || "STNT <ag@stnt-togo.org>").trim();
      if (!modeManuel && !resendKey) {
        return json({ error: "Envoi d'email non configuré (RESEND_API_KEY absent). Utilise mode:\"manuel\" pour récupérer les liens, ou pose la clé Resend." }, 503);
      }

      // Membres validés avec email
      const { data: membres, error: mErr } = await admin
        .from("membres")
        .select("id, nom_complet, email")
        .eq("statut_validation", "validee")
        .not("email", "is", null);
      if (mErr) return json({ error: "Lecture des membres impossible." }, 500);

      // Invitations déjà existantes (non révoquées)
      const { data: existantes } = await admin
        .from("vote_invitations")
        .select("membre_id")
        .eq("revoque", false);
      const dejaInvite = new Set((existantes || []).map((i: { membre_id: string }) => i.membre_id));

      const cibles = (membres || []).filter((m: { id: string; email: string | null }) =>
        m.email && (renvoyer || !dejaInvite.has(m.id)));

      const liens: Array<{ nom: string; email: string; lien: string }> = [];
      let envoyes = 0, echecs = 0;

      for (const m of cibles) {
        const jeton = genToken();
        const tokenHash = await sha256Hex(jeton);
        const lien = baseUrl + (baseUrl.includes("?") ? "&" : "?") + "jeton=" + encodeURIComponent(jeton);

        // upsert de l'invitation (un seul jeton actif par membre)
        const { error: upErr } = await admin
          .from("vote_invitations")
          .upsert(
            { membre_id: m.id, token_hash: tokenHash, revoque: false, ouvert_le: null, envoye_le: null },
            { onConflict: "membre_id" },
          );
        if (upErr) { echecs++; continue; }

        if (modeManuel) {
          liens.push({ nom: m.nom_complet, email: m.email, lien });
          continue;
        }

        // Envoi email via Resend
        const sent = await sendEmail(resendKey!, fromEmail, m.email, m.nom_complet, lien);
        if (sent) {
          await admin.from("vote_invitations")
            .update({ envoye_le: new Date().toISOString() })
            .eq("membre_id", m.id);
          envoyes++;
        } else {
          echecs++;
        }
      }

      if (modeManuel) {
        return json({ ok: true, mode: "manuel", generes: liens.length, liens }, 200);
      }
      return json({ ok: true, cibles: cibles.length, envoyes, echecs }, 200);
    }

    return json({ error: "Action inconnue." }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

// Jeton aléatoire URL-safe (~43 caractères, 32 octets d'entropie)
function genToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sendEmail(
  apiKey: string,
  from: string,
  to: string,
  nom: string,
  lien: string,
): Promise<boolean> {
  const html = `
  <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:auto;color:#0b1e3f">
    <h2 style="color:#0b1e3f">Votre invitation au vote — AG du STNT</h2>
    <p>Bonjour ${escapeHtml(nom)},</p>
    <p>Vous êtes convoqué(e) au vote de l'Assemblée Générale du Syndicat des
       Travailleurs du Numérique du Togo. Ce lien vous est <strong>personnel</strong>
       et vous permet de voter une seule fois par résolution.</p>
    <p style="text-align:center;margin:28px 0">
      <a href="${lien}" style="background:#1f6feb;color:#fff;padding:14px 28px;
         border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">
         Accéder à mon espace de vote</a>
    </p>
    <p style="font-size:13px;color:#5b6b7b">Si le bouton ne fonctionne pas, copiez ce lien
       dans votre navigateur :<br><span style="word-break:break-all">${lien}</span></p>
    <p style="font-size:13px;color:#5b6b7b">Ne transmettez ce lien à personne : il vaut
       votre voix.</p>
    <hr style="border:none;border-top:1px solid #dfe6ee;margin:24px 0" />
    <p style="font-size:12px;color:#8a98a8">STNT — Syndicat des Travailleurs du Numérique du Togo</p>
  </div>`;

  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": "Bearer " + apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to,
        subject: "Votre lien de vote — AG du STNT",
        html,
      }),
    });
    return r.ok;
  } catch (_e) {
    return false;
  }
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
