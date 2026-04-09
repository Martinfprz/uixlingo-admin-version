import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type DeleteItem = { email?: string; userId?: string };
type DeleteRequest = { users?: DeleteItem[]; hardDeleteAuth?: boolean };

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

async function findAuthUserByEmail(admin: ReturnType<typeof createClient>, email: string) {
  const perPage = 200;
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = data?.users || [];
    const found = users.find((u) => String(u.email || "").toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (users.length < perPage) break;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { ok: false, error: "Method not allowed" });
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return json(500, { ok: false, error: "Missing environment variables" });

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  try {
    await requireAdminCaller(req, admin);
  } catch (e) {
    return json(403, { ok: false, error: (e as Error).message });
  }

  let body: DeleteRequest;
  try {
    body = (await req.json()) as DeleteRequest;
  } catch {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }
  const users = Array.isArray(body.users) ? body.users : [];
  if (users.length === 0) return json(400, { ok: false, error: "users is required" });
  if (users.length > 500) return json(400, { ok: false, error: "users max is 500" });

  const hardDeleteAuth = body.hardDeleteAuth !== false;

  let deletedAuth = 0;
  let deletedRanking = 0;
  let failed = 0;
  const rows: Array<Record<string, unknown>> = [];

  for (const item of users) {
    const email = String(item.email || "").trim().toLowerCase();
    const userId = String(item.userId || "").trim();
    const rowResult: Record<string, unknown> = {
      email: email || null,
      userId: userId || null,
      deletedAuth: false,
      deletedRanking: false,
    };

    try {
      let resolvedEmail = email;
      let resolvedUserId = userId;

      if (!resolvedUserId && resolvedEmail) {
        const authUser = await findAuthUserByEmail(admin, resolvedEmail);
        if (authUser) resolvedUserId = authUser.id;
      } else if (resolvedUserId && !resolvedEmail) {
        const authLookup = await admin.auth.admin.getUserById(resolvedUserId);
        if (!authLookup.error && authLookup.data?.user?.email) {
          resolvedEmail = String(authLookup.data.user.email).toLowerCase();
        }
      }

      if (hardDeleteAuth && resolvedUserId) {
        const delAuth = await admin.auth.admin.deleteUser(resolvedUserId);
        if (delAuth.error) throw delAuth.error;
        rowResult.deletedAuth = true;
        deletedAuth++;
      }

      if (resolvedEmail) {
        const delRank = await admin.from("ranking_user").delete().eq("email", resolvedEmail);
        if (delRank.error) throw delRank.error;
        rowResult.deletedRanking = true;
        deletedRanking++;
      }

      rowResult.status = "deleted";
      rows.push(rowResult);
    } catch (e) {
      failed++;
      rowResult.status = "failed";
      rowResult.message = (e as Error)?.message || String(e);
      rows.push(rowResult);
    }
  }

  return json(200, {
    ok: true,
    summary: {
      total: users.length,
      deletedAuth,
      deletedRanking,
      failed,
    },
    rows,
  });
});
