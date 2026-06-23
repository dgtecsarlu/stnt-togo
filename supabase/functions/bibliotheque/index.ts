// ============================================================
// STNT — Edge Function "bibliotheque"
// Valide le code d'accès (secret serveur) et renvoie des liens
// de téléchargement TEMPORAIRES (signés 1h) vers les documents
// stockés dans le bucket privé "documents".
//
// Déploiement :
//   supabase functions deploy bibliotheque
//   supabase secrets set BIBLIO_ACCESS_CODE=ton-code-secret
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
    const { code } = await req.json().catch(() => ({ code: null }));
    const ACCESS = Deno.env.get("BIBLIO_ACCESS_CODE");

    if (!ACCESS || !code || code !== ACCESS) {
      return json({ error: "Code d'accès invalide" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: docs, error } = await supabase
      .from("documents")
      .select("titre, categorie, storage_path")
      .order("categorie", { ascending: true });
    if (error) throw error;

    const documents = [];
    for (const d of docs ?? []) {
      const { data: signed } = await supabase
        .storage.from("documents")
        .createSignedUrl(d.storage_path, 3600);
      documents.push({ titre: d.titre, categorie: d.categorie, url: signed?.signedUrl ?? null });
    }

    return json({ documents }, 200);
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
