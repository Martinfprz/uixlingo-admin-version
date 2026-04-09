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
  return data.user;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { ok: false, error: "Method not allowed" });

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json(500, { ok: false, error: "Missing Supabase environment variables" });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  try {
    await requireAdminCaller(req, admin);
  } catch (e) {
    return json(403, { ok: false, error: (e as Error).message });
  }

  let roleFilter = "admin";
  try {
    const body = await req.json().catch(() => ({}));
    const roleRaw = String(body?.role || "admin").toLowerCase().trim();
    roleFilter = roleRaw === "user" ? "user" : "admin";
  } catch {
    roleFilter = "admin";
  }

  const result: Array<Record<string, unknown>> = [];
  const perPage = 200;
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) return json(500, { ok: false, error: error.message });
    const users = data?.users || [];

    for (const u of users) {
      const role = String(u.app_metadata?.role || "user").toLowerCase();
      if (role !== roleFilter) continue;
      result.push({
        user_id: u.id,
        email: u.email || "",
        role,
        nombre: String(u.user_metadata?.nombre || "").trim(),
        created_at: u.created_at || null,
      });
    }

    if (users.length < perPage) break;
  }

  return json(200, { ok: true, role: roleFilter, users: result });
});

