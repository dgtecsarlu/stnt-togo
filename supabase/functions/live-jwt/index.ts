// ============================================================
// STNT — Edge Function "live-jwt"
// Délivre un JWT Jitsi à un membre validé, à partir de son jeton
// personnel d'invitation (le MÊME que pour le vote). Permet l'admission
// AUTOMATIQUE dans la salle Jitsi auto-hébergée : pas de salle d'attente,
// pas de clic du bureau. Seuls les porteurs d'un jeton valide entrent.
//
// Flux : le site (live.html?jeton=XXXX) appelle cette fonction, reçoit le
// JWT, et ouvre Jitsi avec ce jeton. Jitsi (auth=token) valide la
// signature et admet le membre immédiatement.
//
// Secrets requis (à poser une fois le serveur Jitsi installé) :
//   JITSI_APP_ID       = app_id défini à l'install de jitsi-meet-tokens
//   JITSI_APP_SECRET   = app_secret (secret de signature HS256)
//   JITSI_DOMAIN       = ex. "visio.stnt-togo.org"
//   JITSI_MODERATORS   = (optionnel) emails du bureau séparés par des virgules
//                        -> ces membres reçoivent le rôle modérateur
//   JITSI_ROOM         = (optionnel) salle autorisée, défaut "*" (toutes)
//
// Tant que JITSI_APP_SECRET est absent, la fonction répond 503
// (le code tourne, il attend juste la config), comme paiement-init.
//
// Déploiement :
//   supabase functions deploy live-jwt --use-api
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
    const appId = Deno.env.get("JITSI_APP_ID");
    const appSecret = Deno.env.get("JITSI_APP_SECRET");
    const domain = Deno.env.get("JITSI_DOMAIN");
    if (!appSecret || !appId || !domain) {
      return json({ error: "Direct non configuré (secrets Jitsi absents)." }, 503);
    }
    const room = Deno.env.get("JITSI_ROOM") || "*";
    const mods = (Deno.env.get("JITSI_MODERATORS") || "")
      .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

    const body = await req.json().catch(() => ({}));
    const jeton = String(body.jeton || "").trim();
    if (!jeton) return json({ error: "Lien d'invitation invalide (jeton manquant)." }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1. Résoudre le jeton -> invitation -> membre (même table que le vote)
    const tokenHash = await sha256Hex(jeton);
    const { data: inv } = await admin
      .from("vote_invitations")
      .select("membre_id, revoque")
      .eq("token_hash", tokenHash)
      .single();
    if (!inv || inv.revoque) {
      return json({ error: "Lien d'invitation invalide ou révoqué." }, 401);
    }

    const { data: membre } = await admin
      .from("membres")
      .select("id, nom_complet, email, statut_validation")
      .eq("id", inv.membre_id)
      .single();
    if (!membre) return json({ error: "Membre introuvable." }, 404);
    if (membre.statut_validation !== "validee") {
      return json({ error: "Ton adhésion n'est pas encore validée." }, 403);
    }

    const isMod = mods.includes(String(membre.email || "").toLowerCase());

    // 2. Construire et signer le JWT Jitsi (HS256)
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: "HS256", typ: "JWT" };
    const payload = {
      aud: appId,
      iss: appId,
      sub: domain,
      room,
      iat: now,
      nbf: now - 10,
      exp: now + 6 * 3600, // valable 6 h (durée d'une AG)
      context: {
        user: {
          id: membre.id,
          name: membre.nom_complet,
          moderator: isMod, // rôle dérivé du jeton (nécessite enableUserRolesBasedOnToken)
        },
      },
    };

    const jwt = await signJwtHS256(header, payload, appSecret);

    return json({
      ok: true,
      jwt,
      domain,
      room,
      name: membre.nom_complet,
      moderator: isMod,
    }, 200);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

// ---------- JWT HS256 (Web Crypto) ----------
async function signJwtHS256(header: unknown, payload: unknown, secret: string): Promise<string> {
  const enc = (obj: unknown) => b64url(new TextEncoder().encode(JSON.stringify(obj)));
  const signingInput = enc(header) + "." + enc(payload);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signingInput));
  return signingInput + "." + b64url(new Uint8Array(sig));
}

function b64url(bytes: Uint8Array): string {
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
