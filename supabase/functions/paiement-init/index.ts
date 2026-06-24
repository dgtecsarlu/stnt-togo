// ============================================================
// STNT — Edge Function "paiement-init"
// Initie un paiement CinetPay (Mixx By Yas / Flooz / carte bancaire)
// pour : adhésion, cotisation, mutuelle, tontine ou don.
//
// 1. Valide la demande
// 2. (adhésion) crée le membre en statut "en_attente"
// 3. Enregistre la transaction dans public.paiements
// 4. Appelle l'API CinetPay et renvoie l'URL de paiement
//
// Déploiement :
//   supabase functions deploy paiement-init
//   supabase secrets set CINETPAY_API_KEY=xxxx CINETPAY_SITE_ID=xxxx
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CINETPAY_URL = "https://api-checkout.cinetpay.com/v2/payment";
const TYPES = ["adhesion", "cotisation", "mutuelle", "tontine", "don"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const API_KEY = Deno.env.get("CINETPAY_API_KEY");
    const SITE_ID = Deno.env.get("CINETPAY_SITE_ID");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    if (!API_KEY || !SITE_ID) {
      return json({ error: "Paiement non configuré (clés CinetPay manquantes)." }, 503);
    }

    const body = await req.json().catch(() => ({}));
    const type = String(body.type || "").toLowerCase();
    if (!TYPES.includes(type)) return json({ error: "Type de paiement invalide." }, 400);

    // Montant : entier multiple de 5 (exigence XOF chez CinetPay), min 100 FCFA
    let montant = Math.round(Number(body.montant));
    if (!Number.isFinite(montant) || montant < 100) {
      return json({ error: "Montant invalide (minimum 100 FCFA)." }, 400);
    }
    montant = Math.round(montant / 5) * 5;

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
          // Email déjà présent : reprendre une adhésion non finalisée,
          // ou refuser si le membre est déjà à jour.
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

    // --- Référence de transaction (unique) ---
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

    // --- Page de retour (front) et URL de notification (serveur) ---
    let retourBase = String(body.retour_url || "https://stnt-togo.org/paiement-retour.html");
    // sécurité : on n'accepte qu'une URL http(s)
    if (!/^https?:\/\//.test(retourBase)) retourBase = "https://stnt-togo.org/paiement-retour.html";
    const returnUrl = retourBase + (retourBase.includes("?") ? "&" : "?") + "ref=" + transactionId;
    const notifyUrl = SUPABASE_URL + "/functions/v1/paiement-notify";

    // --- Appel CinetPay ---
    const parts = nom.split(/\s+/);
    const prenom = parts.length > 1 ? parts.slice(1).join(" ") : nom;
    const surname = parts.length > 1 ? parts[0] : "STNT";

    const cpRes = await fetch(CINETPAY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apikey: API_KEY,
        site_id: SITE_ID,
        transaction_id: transactionId,
        amount: montant,
        currency: "XOF",
        description,
        customer_name: prenom || "Membre",
        customer_surname: surname,
        customer_email: email || "contact@stnt-togo.org",
        customer_phone_number: telephone || "",
        notify_url: notifyUrl,
        return_url: returnUrl,
        channels: "ALL", // Mixx By Yas, Flooz ET cartes bancaires
        lang: "fr",
        metadata: type,
      }),
    });

    const cp = await cpRes.json().catch(() => ({}));
    const url = cp?.data?.payment_url;
    if (!url) {
      return json({ error: "CinetPay : " + (cp?.description || cp?.message || "réponse inattendue") }, 502);
    }

    return json({ payment_url: url, transaction_id: transactionId }, 200);
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
