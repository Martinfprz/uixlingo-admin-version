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

  const users: Array<Record<string, unknown>> = [];
  const perPage = 200;
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) return json(500, { ok: false, error: error.message });
    const batch = data?.users || [];

    for (const u of batch) {
      const role = String(u.app_metadata?.role || "user").toLowerCase();
      if (role === "admin") continue;
      users.push({
        user_id: u.id,
        email: String(u.email || "").trim().toLowerCase(),
        nombre: String(u.user_metadata?.nombre || "").trim(),
        role: "user",
        created_at: u.created_at || null,
      });
    }

    if (batch.length < perPage) break;
  }

  const emails = users
    .map((u) => String(u.email || "").trim().toLowerCase())
    .filter(Boolean);

  let rankingRows: Array<Record<string, unknown>> = [];
  if (emails.length > 0) {
    const { data, error } = await admin
      .from("ranking_user")
      .select("email,nombre,emp_id,seniority,especialidad,quest_points,tests_points,pills_points")
      .in("email", emails);
    if (!error) rankingRows = (data || []) as Array<Record<string, unknown>>;
  }

  const rankingByEmail = new Map<string, Record<string, unknown>>();
  for (const r of rankingRows) {
    const email = String(r.email || "").trim().toLowerCase();
    if (email) rankingByEmail.set(email, r);
  }

  const skillsRows: Array<Record<string, unknown>> = [];
  const userIds = users.map((u) => String(u.user_id || "")).filter(Boolean);
  if (userIds.length > 0) {
    const { data, error } = await admin
      .from("user_habilidades")
      .select("user_id,habilidad_id_1,habilidad_id_2,habilidad_id_3,habilidad_id_4,habilidad_id_5")
      .in("user_id", userIds);
    if (!error) skillsRows.push(...((data || []) as Array<Record<string, unknown>>));
  }
  const skillsByUserId = new Map<string, Record<string, unknown>>();
  for (const s of skillsRows) {
    const uid = String(s.user_id || "").trim();
    if (uid) skillsByUserId.set(uid, s);
  }

  const merged = users.map((u) => {
    const email = String(u.email || "").trim().toLowerCase();
    const uid = String(u.user_id || "").trim();
    const ranking = rankingByEmail.get(email) || {};
    const skills = skillsByUserId.get(uid) || {};
    return {
      user_id: uid,
      email,
      nombre: String(u.nombre || ranking.nombre || email.split("@")[0] || "").trim(),
      emp_id: String(ranking.emp_id || ""),
      seniority: String(ranking.seniority || ""),
      especialidad: String(ranking.especialidad || ""),
      quest_points: Number(ranking.quest_points || 0),
      tests_points: Number(ranking.tests_points || 0),
      pills_points: Number(ranking.pills_points || 0),
      habilidad_id_1: skills.habilidad_id_1 || null,
      habilidad_id_2: skills.habilidad_id_2 || null,
      habilidad_id_3: skills.habilidad_id_3 || null,
      habilidad_id_4: skills.habilidad_id_4 || null,
      habilidad_id_5: skills.habilidad_id_5 || null,
    };
  });

  return json(200, { ok: true, users: merged, total: merged.length });
});

