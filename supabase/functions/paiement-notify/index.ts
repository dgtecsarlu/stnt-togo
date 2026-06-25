// ============================================================
// STNT — Edge Function "paiement-notify" (PayGate Global)
// Callback serveur appelé par PayGate après un paiement (si l'URL de
// notification est configurée dans le tableau de bord PayGate).
// Ne fait JAMAIS confiance au corps reçu : on revérifie le vrai statut
// via /api/v2/status, puis on confirme (idempotent).
//
// C'est un FILET DE SÉCURITÉ : la confirmation principale se fait au
// retour du client (paiement-statut). Ce callback couvre le cas où le
// client ne revient pas sur la page de retour.
//
// IMPORTANT : déployer SANS vérification de JWT (PayGate n'envoie pas de
// token Supabase) :
//   supabase functions deploy paiement-notify --use-api --no-verify-jwt
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const STATUS_URL = "https://paygateglobal.com/api/v2/status";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok"); // ping / redirection GET éventuelle

  try {
    const TOKEN = Deno.env.get("PAYGATE_AUTH_TOKEN")!;

    // Récupérer notre identifier, quel que soit le format reçu
    let identifier = "";
    const ctype = req.headers.get("content-type") || "";
    if (ctype.includes("application/json")) {
      const b = await req.json().catch(() => ({}));
      identifier = String(b.identifier || "");
    } else {
      const form = await req.formData().catch(() => null);
      if (form) identifier = String(form.get("identifier") || "");
    }
    if (!identifier) return new Response("missing identifier", { status: 200 });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: pay } = await supabase
      .from("paiements").select("*").eq("transaction_id", identifier).single();
    if (!pay) return new Response("unknown transaction", { status: 200 });
    if (pay.statut === "paye") return new Response("already processed", { status: 200 });

    // Revérifier le vrai statut auprès de PayGate (source de confiance)
    const resp = await fetch(STATUS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ auth_token: TOKEN, identifier }),
    });
    const data = await resp.json().catch(() => ({}));
    const code = Number(data?.status);

    if (code === 0) {
      await confirmerPaiement(supabase, pay, data);
      return new Response("ok", { status: 200 });
    }
    if (code === 4 || code === 6) {
      await supabase.from("paiements").update({ statut: "echoue" }).eq("transaction_id", identifier);
      return new Response("payment failed", { status: 200 });
    }
    return new Response("payment pending", { status: 200 });
  } catch (e) {
    // 200 pour éviter les ré-essais en boucle ; l'incident reste dans les logs.
    return new Response("error: " + String(e), { status: 200 });
  }
});

async function confirmerPaiement(
  supabase: ReturnType<typeof createClient>,
  pay: Record<string, any>,
  data: Record<string, any>,
) {
  const canal = mapCanal(String(data?.payment_method || ""));

  await supabase.from("paiements").update({
    statut: "paye",
    canal,
    operateur: data?.payment_method || null,
    cpm_trans_id: data?.tx_reference || data?.payment_reference || null,
    paye_le: new Date().toISOString(),
  }).eq("transaction_id", pay.transaction_id);

  if ((pay.type_paiement === "adhesion" || pay.type_paiement === "cotisation") && pay.membre_id) {
    await supabase.from("membres").update({ statut_cotisation: "a_jour" }).eq("id", pay.membre_id);
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
    if (pay.campagne_id) {
      const { data: camp } = await supabase
        .from("caisse_campagnes").select("montant_collecte").eq("id", pay.campagne_id).single();
      if (camp) {
        await supabase.from("caisse_campagnes")
          .update({ montant_collecte: Number(camp.montant_collecte || 0) + Number(pay.montant) })
          .eq("id", pay.campagne_id);
      }
    }
  }
}

function mapCanal(raw: string): string {
  const s = raw.toUpperCase();
  if (/MIXX|TMONEY|T-MONEY|TOGOCEL|TOGOCOM|YAS/.test(s)) return "mixx";
  if (/FLOOZ|MOOV/.test(s)) return "flooz";
  return "autre";
}
