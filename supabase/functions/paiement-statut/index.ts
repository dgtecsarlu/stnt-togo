// ============================================================
// STNT — Edge Function "paiement-statut"
// Le navigateur (page de retour) interroge cette fonction avec la
// référence de transaction pour savoir si le paiement est confirmé.
// Ne renvoie aucune donnée sensible, juste l'état et le contexte minimal.
//
// Déploiement :
//   supabase functions deploy paiement-statut
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
    const { transaction_id } = await req.json().catch(() => ({ transaction_id: null }));
    if (!transaction_id) return json({ error: "Référence manquante." }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: pay } = await supabase
      .from("paiements")
      .select("statut, type_paiement, montant, devise")
      .eq("transaction_id", transaction_id)
      .single();

    if (!pay) return json({ statut: "inconnu" }, 200);
    return json({
      statut: pay.statut,            // en_attente | paye | echoue | annule
      type: pay.type_paiement,
      montant: pay.montant,
      devise: pay.devise,
    }, 200);
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
