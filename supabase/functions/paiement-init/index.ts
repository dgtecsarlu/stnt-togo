// ============================================================
// STNT — Edge Function "paiement-init" (PayGate Global)
// Initie un paiement PayGate (Mixx By Yas / Flooz) pour :
// adhésion, cotisation, mutuelle, tontine ou don.
//
// 1. Valide la demande
// 2. (adhésion) crée le membre en statut "en_attente"
// 3. Enregistre la transaction dans public.paiements
// 4. Construit l'URL de la page de paiement PayGate et la renvoie
//
// V1 : PayGate gère le mobile money togolais uniquement (Flooz, T-Money).
// Les cartes bancaires reviendront en V2 (CinetPay).
//
// Déploiement :
//   supabase functions deploy paiement-init --use-api
//   supabase secrets set PAYGATE_AUTH_TOKEN=xxxx
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PAYGATE_PAGE = "https://paygateglobal.com/v1/page";
const TYPES = ["adhesion", "cotisation", "mutuelle", "tontine", "don"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const TOKEN = Deno.env.get("PAYGATE_AUTH_TOKEN");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    if (!TOKEN) {
      return json({ error: "Paiement non configuré (jeton PayGate manquant)." }, 503);
    }

    const body = await req.json().catch(() => ({}));
    const type = String(body.type || "").toLowerCase();
    if (!TYPES.includes(type)) return json({ error: "Type de paiement invalide." }, 400);

    // Montant : entier en FCFA, minimum 100
    let montant = Math.round(Number(body.montant));
    if (!Number.isFinite(montant) || montant < 100) {
      return json({ error: "Montant invalide (minimum 100 FCFA)." }, 400);
    }

    const nom = String(body.nom || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const telephone = String(body.telephone || "").trim();
    const anonyme = body.anonyme === true;

    if (type === "adhesion" || type === "cotisation") {
      if (!nom || !email) return json({ error: "Nom et email requis." }, 400);
    }

    const supabase = createClient(
      SUPABASE_URL,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // --- Adhésion : créer le membre (statut en attente de paiement) ---
    let membreId: string | null = body.membre_id || null;
    if (type === "adhesion") {
      const { data: membre, error: mErr } = await supabase
        .from("membres")
        .insert([{
          nom_complet: nom,
          email,
          telephone: telephone || null,
          region: body.region || null,
          metier: body.metier || null,
          photo_url: body.photo_url || null,
          type_adhesion: "nouveau",
          statut_cotisation: "en_attente",
          consentement_rgpd: body.consentement_rgpd === true,
        }])
        .select("id")
        .single();
      if (mErr) {
        if (mErr.code === "23505") {
          const { data: existing } = await supabase
            .from("membres")
            .select("id, statut_cotisation")
            .eq("email", email)
            .single();
          if (existing && existing.statut_cotisation === "a_jour") {
            return json({ error: "Cet email est déjà adhérent et à jour. Utilise « Payer ma cotisation » pour renouveler." }, 400);
          }
          if (existing) {
            membreId = existing.id; // reprise du paiement
          } else {
            return json({ error: "Cet email est déjà inscrit au STNT." }, 400);
          }
        } else {
          return json({ error: "Impossible d'enregistrer l'adhésion. Réessaie." }, 400);
        }
      } else {
        membreId = membre.id;
      }
    }

    // --- Référence de transaction (identifier unique côté STNT) ---
    const transactionId =
      "STNT-" + type.toUpperCase() + "-" + Date.now() + "-" +
      crypto.randomUUID().slice(0, 8);

    const labels: Record<string, string> = {
      adhesion: "Adhésion STNT",
      cotisation: "Cotisation STNT",
      mutuelle: "Mutuelle solidaire STNT",
      tontine: "Tontine STNT",
      don: "Don à la caisse de solidarité STNT",
    };
    const description = labels[type];

    // --- Enregistrer la transaction (en attente) ---
    const { error: pErr } = await supabase.from("paiements").insert([{
      transaction_id: transactionId,
      type_paiement: type,
      montant,
      devise: "XOF",
      statut: "en_attente",
      nom_payeur: nom || null,
      email_payeur: email || null,
      telephone_payeur: telephone || null,
      anonyme,
      description,
      membre_id: membreId,
      campagne_id: body.campagne_id || null,
    }]);
    if (pErr) return json({ error: "Erreur d'enregistrement du paiement." }, 500);

    // --- Page de retour (front) : le client y revient après paiement ---
    let retourBase = String(body.retour_url || "https://stnt-togo.org/paiement-retour.html");
    if (!/^https?:\/\//.test(retourBase)) retourBase = "https://stnt-togo.org/paiement-retour.html";
    const returnUrl = retourBase + (retourBase.includes("?") ? "&" : "?") + "ref=" + transactionId;

    // --- Construire l'URL de la page de paiement PayGate (GET) ---
    const params = new URLSearchParams({
      token: TOKEN,
      amount: String(montant),
      identifier: transactionId,
      description,
      url: returnUrl,
    });
    // network laissé libre : le client choisit Mixx By Yas ou Flooz sur la page
    if (telephone) params.set("phone", telephone);

    const paymentUrl = PAYGATE_PAGE + "?" + params.toString();

    return json({ payment_url: paymentUrl, transaction_id: transactionId }, 200);
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
