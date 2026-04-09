import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

type Mode = "preview" | "execute";
type Row = {
  email?: string;
  talento_1?: string;
  talento_2?: string;
  talento_3?: string;
  talento_4?: string;
  talento_5?: string;
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeEmail(v: string | undefined) {
  return String(v || "").trim().toLowerCase();
}

function normTalent(v: string | undefined) {
  return String(v || "").trim();
}

function levenshtein(a: string, b: string) {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
}

function suggestTalentName(input: string, names: string[]) {
  const target = String(input || "").trim().toLowerCase();
  if (!target) return "";
  let bestName = "";
  let bestScore = Number.POSITIVE_INFINITY;
  for (const name of names) {
    const score = levenshtein(target, name.toLowerCase());
    if (score < bestScore) {
      bestScore = score;
      bestName = name;
    }
  }
  if (!bestName) return "";
  return bestScore <= Math.max(2, Math.floor(target.length * 0.35)) ? bestName : "";
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

async function findAuthUserByEmail(admin: ReturnType<typeof createClient>, email: string) {
  const perPage = 200;
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = data?.users || [];
    const found = users.find((u) => String(u.email || "").toLowerCase() === email);
    if (found) return found;
    if (users.length < perPage) break;
  }
  return null;
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

  let body: { mode?: Mode; rows?: Row[] };
  try {
    body = (await req.json()) as { mode?: Mode; rows?: Row[] };
  } catch {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  const mode: Mode = body.mode === "preview" ? "preview" : "execute";
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (rows.length === 0) return json(400, { ok: false, error: "rows is required" });
  if (rows.length > 1000) return json(400, { ok: false, error: "rows max is 1000" });

  const { data: skillsCatalog, error: skillsErr } = await admin.from("habilidades").select("id,nombre");
  if (skillsErr) return json(500, { ok: false, error: skillsErr.message });
  const skillsByName = new Map<string, string>();
  const skillNamesOriginal: string[] = [];
  for (const s of skillsCatalog || []) {
    const original = String(s.nombre || "").trim();
    const name = String(s.nombre || "").trim().toLowerCase();
    if (name) {
      skillsByName.set(name, String(s.id));
      skillNamesOriginal.push(original);
    }
  }

  const seenPayloadEmails = new Set<string>();
  const resultRows: Array<Record<string, unknown>> = [];
  let updated = 0;
  let skipped = 0;
  let invalid = 0;
  let failed = 0;
  let duplicateInPayload = 0;

  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i] || {};
    const email = normalizeEmail(raw.email);
    const talentsRaw = [
      normTalent(raw.talento_1),
      normTalent(raw.talento_2),
      normTalent(raw.talento_3),
      normTalent(raw.talento_4),
      normTalent(raw.talento_5),
    ];

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      invalid++;
      failed++;
      resultRows.push({ idx: i + 1, email, status: "invalid", message: "email inválido" });
      continue;
    }
    if (seenPayloadEmails.has(email)) {
      duplicateInPayload++;
      skipped++;
      resultRows.push({ idx: i + 1, email, status: "skipped", reason: "duplicate_in_payload" });
      continue;
    }
    seenPayloadEmails.add(email);

    const nonEmptyTalents = talentsRaw.filter((t) => t.length > 0).map((t) => t.toLowerCase());
    const nonEmptySet = new Set(nonEmptyTalents);
    if (nonEmptyTalents.length !== nonEmptySet.size) {
      invalid++;
      failed++;
      resultRows.push({ idx: i + 1, email, status: "invalid", message: "talentos repetidos en la misma fila" });
      continue;
    }

    const talentIds: Array<string | null> = [];
    let missingTalent = "";
    for (const t of talentsRaw) {
      if (!t) {
        talentIds.push(null);
        continue;
      }
      const id = skillsByName.get(t.toLowerCase());
      if (!id) {
        missingTalent = t;
        break;
      }
      talentIds.push(id);
    }
    if (missingTalent) {
      invalid++;
      failed++;
      const suggestion = suggestTalentName(missingTalent, skillNamesOriginal);
      const msg = suggestion
        ? `talento no encontrado: ${missingTalent}. Sugerencia: ${suggestion}`
        : `talento no encontrado: ${missingTalent}`;
      resultRows.push({ idx: i + 1, email, status: "invalid", message: msg });
      continue;
    }

    try {
      const authUser = await findAuthUserByEmail(admin, email);
      if (!authUser) {
        skipped++;
        resultRows.push({ idx: i + 1, email, status: "skipped", reason: "auth_user_not_found" });
        continue;
      }
      const role = String(authUser.app_metadata?.role || "user").toLowerCase();
      if (role === "admin") {
        skipped++;
        resultRows.push({ idx: i + 1, email, status: "skipped", reason: "is_admin" });
        continue;
      }

      if (mode === "preview") {
        resultRows.push({
          idx: i + 1,
          email,
          status: "ready",
          user_id: authUser.id,
          skills_assigned_count: talentIds.filter(Boolean).length,
        });
        continue;
      }

      const payload = {
        user_id: authUser.id,
        habilidad_id_1: talentIds[0] ?? null,
        habilidad_id_2: talentIds[1] ?? null,
        habilidad_id_3: talentIds[2] ?? null,
        habilidad_id_4: talentIds[3] ?? null,
        habilidad_id_5: talentIds[4] ?? null,
      };
      const upsert = await admin.from("user_habilidades").upsert(payload, { onConflict: "user_id" });
      if (upsert.error) throw upsert.error;

      updated++;
      resultRows.push({
        idx: i + 1,
        email,
        status: "updated",
        user_id: authUser.id,
        skills_assigned_count: talentIds.filter(Boolean).length,
      });
    } catch (e) {
      failed++;
      resultRows.push({ idx: i + 1, email, status: "failed", message: (e as Error).message || String(e) });
    }
  }

  return json(200, {
    ok: true,
    mode,
    summary: {
      total: rows.length,
      updated,
      skipped,
      invalid,
      failed,
      duplicate_in_payload: duplicateInPayload,
    },
    rows: resultRows,
  });
});

