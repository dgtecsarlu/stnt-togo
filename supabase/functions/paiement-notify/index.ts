// ============================================================
// STNT — Edge Function "paiement-notify"
// Webhook appelé par CinetPay (serveur à serveur) après un paiement.
// Ne fait JAMAIS confiance au corps du POST : on revérifie le statut
// réel via l'API /check de CinetPay, puis on met à jour la base.
//
// IMPORTANT : déployer SANS vérification de JWT (CinetPay n'envoie pas
// de token Supabase) :
//   supabase functions deploy paiement-notify --no-verify-jwt
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CHECK_URL = "https://api-checkout.cinetpay.com/v2/payment/check";

Deno.serve(async (req) => {
  // CinetPay envoie un POST x-www-form-urlencoded (ou JSON selon les cas).
  if (req.method !== "POST") return new Response("ok"); // ping/test

  try {
    const API_KEY = Deno.env.get("CINETPAY_API_KEY")!;
    const SITE_ID = Deno.env.get("CINETPAY_SITE_ID")!;

    // Récupérer la référence de transaction, quel que soit le format reçu
    let transactionId = "";
    const ctype = req.headers.get("content-type") || "";
    if (ctype.includes("application/json")) {
      const b = await req.json().catch(() => ({}));
      transactionId = b.cpm_trans_id || b.transaction_id || "";
    } else {
      const form = await req.formData().catch(() => null);
      if (form) {
        transactionId = String(form.get("cpm_trans_id") || form.get("transaction_id") || "");
      }
    }
    if (!transactionId) return new Response("missing transaction_id", { status: 200 });

    // Revérifier le vrai statut auprès de CinetPay (source de confiance)
    const checkRes = await fetch(CHECK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apikey: API_KEY, site_id: SITE_ID, transaction_id: transactionId }),
    });
    const check = await checkRes.json().catch(() => ({}));
    const data = check?.data || {};
    const status = String(data.status || "").toUpperCase(); // ACCEPTED / REFUSED / ...

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Retrouver notre paiement
    const { data: pay } = await supabase
      .from("paiements")
      .select("*")
      .eq("transaction_id", transactionId)
      .single();
    if (!pay) return new Response("unknown transaction", { status: 200 });

    // Idempotence : si déjà traité, ne rien refaire
    if (pay.statut === "paye") return new Response("already processed", { status: 200 });

    if (status !== "ACCEPTED") {
      // Échec définitif uniquement si refusé/annulé ; sinon on laisse "en_attente"
      // (statuts intermédiaires comme WAITING_FOR_CUSTOMER).
      if (/REFUS|CANCEL|FAIL|ERROR/.test(status)) {
        await supabase.from("paiements")
          .update({ statut: "echoue" })
          .eq("transaction_id", transactionId);
        return new Response("payment refused", { status: 200 });
      }
      return new Response("payment pending", { status: 200 });
    }

    // Canal réel
    const canal = mapCanal(String(data.payment_method || data.operator_id || ""));

    // 1) Marquer le paiement payé
    await supabase.from("paiements").update({
      statut: "paye",
      canal,
      operateur: data.payment_method || data.operator_id || null,
      cpm_trans_id: data.payment_token || transactionId,
      paye_le: new Date().toISOString(),
    }).eq("transaction_id", transactionId);

    // 2) Effets métier selon le type
    if ((pay.type_paiement === "adhesion" || pay.type_paiement === "cotisation") && pay.membre_id) {
      await supabase.from("membres")
        .update({ statut_cotisation: "a_jour" })
        .eq("id", pay.membre_id);
    }

    if (pay.type_paiement === "don") {
      await supabase.from("caisse_dons").insert([{
        campagne_id: pay.campagne_id || null,
        membre_id: pay.membre_id || null,
        nom_donateur: pay.anonyme ? null : pay.nom_payeur,
        montant: pay.montant,
        anonyme: pay.anonyme,
        methode: canal === "autre" ? null : canal,
        paiement_id: pay.id,
      }]);

      // Incrémenter le montant collecté de la campagne (si rattaché)
      if (pay.campagne_id) {
        const { data: camp } = await supabase
          .from("caisse_campagnes")
          .select("montant_collecte")
          .eq("id", pay.campagne_id)
          .single();
        if (camp) {
          await supabase.from("caisse_campagnes")
            .update({ montant_collecte: Number(camp.montant_collecte || 0) + Number(pay.montant) })
            .eq("id", pay.campagne_id);
        }
      }
    }

    return new Response("ok", { status: 200 });
  } catch (e) {
    // On répond 200 pour éviter que CinetPay ne ré-essaie en boucle sur une
    // erreur applicative ; l'incident reste visible côté logs.
    return new Response("error: " + String(e), { status: 200 });
  }
});

function mapCanal(raw: string): string {
  const s = raw.toUpperCase();
  if (/MIXX|TMONEY|T-MONEY|TOGOCEL|TOGOCOM|YAS/.test(s)) return "mixx";
  if (/FLOOZ|MOOV/.test(s)) return "flooz";
  if (/CARD|CARTE|VISA|MASTER|CREDIT/.test(s)) return "carte";
  return "autre";
}
