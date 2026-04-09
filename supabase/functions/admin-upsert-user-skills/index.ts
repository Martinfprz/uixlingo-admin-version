import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

type UpsertBody = {
  user_id?: string;
  habilidad_id_1?: string | null;
  habilidad_id_2?: string | null;
  habilidad_id_3?: string | null;
  habilidad_id_4?: string | null;
  habilidad_id_5?: string | null;
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normSkill(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s;
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

  let body: UpsertBody;
  try {
    body = (await req.json()) as UpsertBody;
  } catch {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  const userId = String(body.user_id || "").trim();
  if (!userId || !isUuid(userId)) {
    return json(400, { ok: false, error: "user_id requerido y debe ser UUID válido" });
  }

  const skills = [
    normSkill(body.habilidad_id_1),
    normSkill(body.habilidad_id_2),
    normSkill(body.habilidad_id_3),
    normSkill(body.habilidad_id_4),
    normSkill(body.habilidad_id_5),
  ];

  for (const s of skills) {
    if (s && !isUuid(s)) {
      return json(400, { ok: false, error: `UUID de habilidad inválido: ${s}` });
    }
  }

  const onlyIds = skills.filter(Boolean) as string[];
  const dupSet = new Set<string>();
  for (const s of onlyIds) {
    if (dupSet.has(s)) return json(400, { ok: false, error: "No se permiten talentos repetidos en las 5 columnas" });
    dupSet.add(s);
  }

  if (onlyIds.length > 0) {
    const { data: existingSkills, error } = await admin
      .from("habilidades")
      .select("id")
      .in("id", onlyIds);
    if (error) return json(500, { ok: false, error: error.message });
    const existingSet = new Set((existingSkills || []).map((r) => String(r.id)));
    const missing = onlyIds.filter((id) => !existingSet.has(id));
    if (missing.length > 0) {
      return json(400, { ok: false, error: `Habilidades no encontradas: ${missing.join(", ")}` });
    }
  }

  const payload = {
    user_id: userId,
    habilidad_id_1: skills[0],
    habilidad_id_2: skills[1],
    habilidad_id_3: skills[2],
    habilidad_id_4: skills[3],
    habilidad_id_5: skills[4],
  };

  const { error } = await admin.from("user_habilidades").upsert(payload, { onConflict: "user_id" });
  if (error) return json(500, { ok: false, error: error.message });

  return json(200, {
    ok: true,
    saved: true,
    user_id: userId,
    skills_assigned_count: onlyIds.length,
    message: "Talentos guardados correctamente",
  });
});

