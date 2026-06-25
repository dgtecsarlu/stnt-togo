// ============================================================
// STNT — Edge Function "paiement-statut" (PayGate Global)
// Appelée par la page de retour. Elle VÉRIFIE ACTIVEMENT l'état réel
// de la transaction auprès de PayGate (/api/v2/status par identifier),
// met la base à jour et applique les effets métier si le paiement est
// confirmé (idempotent), puis renvoie l'état au navigateur.
//
// C'est le mécanisme fiable de confirmation (ne dépend pas du callback).
//
// Déploiement :
//   supabase functions deploy paiement-statut --use-api
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const STATUS_URL = "https://paygateglobal.com/api/v2/status"; // vérif par identifier

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { transaction_id } = await req.json().catch(() => ({ transaction_id: null }));
    if (!transaction_id) return json({ error: "Référence manquante." }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: pay } = await supabase
      .from("paiements")
      .select("*")
      .eq("transaction_id", transaction_id)
      .single();
    if (!pay) return json({ statut: "inconnu" }, 200);

    // Déjà confirmé : ne pas re-vérifier
    if (pay.statut === "paye") {
      return etat(pay.statut, pay);
    }

    // Vérifier l'état réel auprès de PayGate
    const TOKEN = Deno.env.get("PAYGATE_AUTH_TOKEN");
    if (TOKEN) {
      const resp = await fetch(STATUS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auth_token: TOKEN, identifier: transaction_id }),
      });
      const data = await resp.json().catch(() => ({}));
      const code = Number(data?.status);

      if (code === 0) {
        await confirmerPaiement(supabase, pay, data);
        return etat("paye", pay);
      } else if (code === 4 || code === 6) {
        await supabase.from("paiements").update({ statut: "echoue" }).eq("transaction_id", transaction_id);
        return etat("echoue", pay);
      }
      // code 2 (en cours) ou réponse vide : on laisse en attente
    }

    return etat(pay.statut, pay);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

// Confirme un paiement : marque payé + effets métier (idempotent via le statut)
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

function etat(statut: string, pay: Record<string, any>) {
  return json({ statut, type: pay.type_paiement, montant: pay.montant, devise: pay.devise }, 200);
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
