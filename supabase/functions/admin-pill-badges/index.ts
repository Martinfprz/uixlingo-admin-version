import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function requireAdminCaller(req: Request, admin: ReturnType<typeof createClient>) {
  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) throw new Error("Missing bearer token");
  const { data, error } = await admin.auth.getUser(jwt);
  if (error || !data?.user) throw new Error("Invalid auth token");
  const role = String(data.user.app_metadata?.role || "").toLowerCase();
  if (role !== "admin") throw new Error("Caller is not admin");
}

type Body = {
  action?: string;
  pill_id?: string;
  add_user_ids?: string[];
  remove_user_ids?: string[];
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { ok: false, error: "Method not allowed" });
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json(500, { ok: false, error: "Missing environment variables" });
  }

  const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  try {
    await requireAdminCaller(req, service);
  } catch (e) {
    return json(403, { ok: false, error: (e as Error).message });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  const action = (body.action || "list").toLowerCase();
  const pillId = String(body.pill_id || "").trim();
  if (!pillId) return json(400, { ok: false, error: "pill_id is required" });

  if (action === "list") {
    const { data, error } = await service
      .from("user_pill_badges")
      .select("user_id")
      .eq("pill_id", pillId);
    if (error) return json(500, { ok: false, error: error.message });
    return json(200, { ok: true, user_ids: (data || []).map((r) => r.user_id) });
  }

  if (action === "save") {
    const add = Array.isArray(body.add_user_ids) ? body.add_user_ids : [];
    const remove = Array.isArray(body.remove_user_ids) ? body.remove_user_ids : [];
    if (add.length + remove.length > 5000) {
      return json(400, { ok: false, error: "Too many add/remove items (max 5000 total)" });
    }

    if (add.length > 0) {
      const rows = add.map((user_id) => ({
        pill_id: pillId,
        user_id,
        score: null as null,
        errors: null as null,
      }));
      const { error } = await service.from("user_pill_badges").upsert(rows, {
        onConflict: "user_id,pill_id",
      });
      if (error) return json(500, { ok: false, error: error.message });
    }
    if (remove.length > 0) {
      const { error } = await service
        .from("user_pill_badges")
        .delete()
        .eq("pill_id", pillId)
        .in("user_id", remove);
      if (error) return json(500, { ok: false, error: error.message });
    }
    return json(200, { ok: true, added: add.length, removed: remove.length });
  }

  return json(400, { ok: false, error: "Invalid action; use 'list' or 'save'" });
});
