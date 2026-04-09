import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type ConflictStrategy = "skip" | "update_profile" | "update_and_reset_password" | "recreate_auth";
type Mode = "preview" | "execute";

type InputRow = {
  nombre?: string;
  email?: string;
  empId?: string;
  seniority?: string;
  especialidad?: string;
  password?: string;
  role?: string;
};

type UpsertRequest = {
  mode?: Mode;
  defaults?: {
    forcePasswordChange?: boolean;
    generatePasswordIfMissing?: boolean;
  };
  conflictStrategy?: ConflictStrategy;
  rows?: InputRow[];
};

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

function normalizeEmail(v: string | undefined) {
  return String(v || "").trim().toLowerCase();
}

function normalizeSeniority(v: string | undefined) {
  const raw = String(v || "junior").trim().toLowerCase();
  if (raw === "senior" || raw === "sr") return "senior";
  if (raw === "medium" || raw === "mid" || raw === "medio") return "medium";
  return "junior";
}

function normalizeRole(v: string | undefined) {
  const r = String(v || "user").trim().toLowerCase();
  return r === "admin" ? "admin" : "user";
}

function makeTempPassword(nameHint: string, salt: string, randomize = false) {
  let prefix = String(nameHint || "usr").replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ]/g, "");
  if (!prefix) prefix = "usr";
  prefix = prefix.substring(0, 3).toLowerCase();
  while (prefix.length < 3) prefix += "x";
  const cap = prefix.charAt(0).toUpperCase() + prefix.slice(1);
  let digits = "000";
  if (randomize) {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    digits = String(100 + (arr[0] % 900));
  } else {
    const n = Array.from(salt).reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    digits = String(100 + (n % 900));
  }
  return `${cap}UiX${digits}`;
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

  let body: UpsertRequest;
  try {
    body = (await req.json()) as UpsertRequest;
  } catch {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  const mode: Mode = body.mode === "preview" ? "preview" : "execute";
  const strategy: ConflictStrategy = (body.conflictStrategy || "skip") as ConflictStrategy;
  const defaults = {
    forcePasswordChange: body.defaults?.forcePasswordChange !== false,
    generatePasswordIfMissing: body.defaults?.generatePasswordIfMissing !== false,
  };
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (rows.length === 0) return json(400, { ok: false, error: "rows is required" });
  if (rows.length > 500) return json(400, { ok: false, error: "rows max is 500" });

  const seen = new Set<string>();
  const resultRows: Array<Record<string, unknown>> = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  let invalid = 0;
  let conflicts = 0;
  let rolledBack = 0;

  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i] || {};
    const nombre = String(raw.nombre || "").trim();
    const email = normalizeEmail(raw.email);
    const empId = String(raw.empId || "").trim();
    const seniority = normalizeSeniority(raw.seniority);
    const especialidad = String(raw.especialidad || "").trim();
    const role = normalizeRole(raw.role);
    const dupKey = email;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !nombre) {
      invalid++;
      failed++;
      resultRows.push({
        idx: i + 1,
        email,
        status: "invalid",
        message: "nombre o email inválidos",
      });
      continue;
    }
    if (seen.has(dupKey)) {
      skipped++;
      resultRows.push({
        idx: i + 1,
        email,
        status: "skipped",
        reason: "duplicate_in_payload",
      });
      continue;
    }
    seen.add(dupKey);

    try {
      const authUser = await findAuthUserByEmail(admin, email);
      const { data: rankingRow } = await admin
        .from("ranking_user")
        .select("*")
        .eq("email", email)
        .maybeSingle();

      const existsAuth = !!authUser;
      const existsRanking = !!rankingRow;
      const isConflict = existsAuth || existsRanking;
      if (isConflict) conflicts++;

      const providedPassword = String(raw.password || "").trim();

      if (mode === "preview") {
        const profileDiff =
          !existsRanking ||
          String(rankingRow?.nombre || "") !== nombre ||
          String(rankingRow?.emp_id || "") !== empId ||
          String(rankingRow?.seniority || "") !== seniority ||
          String(rankingRow?.especialidad || "") !== especialidad;

        resultRows.push({
          idx: i + 1,
          email,
          status: !isConflict ? "new" : profileDiff ? "existing_different" : "existing_same",
          authExists: existsAuth,
          rankingExists: existsRanking,
          suggestedAction: !isConflict ? "create" : strategy,
        });
        continue;
      }

      // ── NUEVO USUARIO ──────────────────────────────────────────────────────
      if (!isConflict) {
        const finalPassword =
          providedPassword ||
          (defaults.generatePasswordIfMissing ? makeTempPassword(nombre, email, false) : "") ||
          makeTempPassword(nombre, email, false);

        const createRes = await admin.auth.admin.createUser({
          email,
          password: finalPassword,
          email_confirm: true,
          app_metadata: { role },
          user_metadata: {
            nombre,
            force_password_change: defaults.forcePasswordChange,
          },
        });
        if (createRes.error) throw createRes.error;

        const newAuthId = createRes.data.user.id;

        // Payload solo con columnas reales de ranking_user (spec.md)
        const rankingPayload: Record<string, unknown> = {
          email,
          user_id: newAuthId,
          nombre,
          seniority,
          especialidad,
          fecha: new Date().toISOString(),
        };
        if (empId) rankingPayload.emp_id = empId;
        if (defaults.forcePasswordChange) {
          rankingPayload.initial_password = finalPassword;
        }

        const upsert = await admin
          .from("ranking_user")
          .upsert(rankingPayload, { onConflict: "email" });

        if (upsert.error) {
          // Rollback: borrar el auth user recién creado para evitar huérfanos
          rolledBack++;
          await admin.auth.admin.deleteUser(newAuthId).catch(() => null);
          throw new Error(`ranking_user upsert falló: ${upsert.error.message}`);
        }

        created++;
        resultRows.push({
          idx: i + 1,
          email,
          status: "created",
          generatedPassword: defaults.forcePasswordChange ? finalPassword : undefined,
        });
        continue;
      }

      // ── USUARIO EXISTENTE — ESTRATEGIA ────────────────────────────────────
      if (strategy === "skip") {
        skipped++;
        resultRows.push({ idx: i + 1, email, status: "skipped", reason: "exists" });
        continue;
      }

      if (strategy === "recreate_auth" && authUser) {
        const del = await admin.auth.admin.deleteUser(authUser.id);
        if (del.error) throw del.error;
      }

      let activeAuthUser = authUser;
      let generatedPassword: string | undefined;

      if (!activeAuthUser || strategy === "recreate_auth") {
        const finalPassword =
          providedPassword ||
          (defaults.generatePasswordIfMissing ? makeTempPassword(nombre, email, true) : "") ||
          makeTempPassword(nombre, email, true);
        generatedPassword = finalPassword;
        const createdUser = await admin.auth.admin.createUser({
          email,
          password: finalPassword,
          email_confirm: true,
          app_metadata: { role },
          user_metadata: {
            nombre,
            force_password_change: defaults.forcePasswordChange,
          },
        });
        if (createdUser.error) throw createdUser.error;
        activeAuthUser = createdUser.data.user || null;
      } else if (strategy === "update_and_reset_password") {
        const finalPassword =
          providedPassword ||
          (defaults.generatePasswordIfMissing ? makeTempPassword(nombre, email, true) : "") ||
          makeTempPassword(nombre, email, true);
        generatedPassword = finalPassword;
        const upd = await admin.auth.admin.updateUserById(activeAuthUser.id, {
          password: finalPassword,
          user_metadata: {
            ...(activeAuthUser.user_metadata || {}),
            nombre,
            force_password_change: defaults.forcePasswordChange,
          },
        });
        if (upd.error) throw upd.error;
      } else {
        // update_profile: solo actualiza nombre en Auth metadata
        const upd = await admin.auth.admin.updateUserById(activeAuthUser.id, {
          user_metadata: {
            ...(activeAuthUser.user_metadata || {}),
            nombre,
          },
        });
        if (upd.error) throw upd.error;
      }

      const resolvedAuthId = activeAuthUser?.id;

      const rankingPayload: Record<string, unknown> = {
        email,
        nombre,
        seniority,
        especialidad,
        fecha: new Date().toISOString(),
      };
      if (resolvedAuthId) rankingPayload.user_id = resolvedAuthId;
      if (empId) rankingPayload.emp_id = empId;
      if (generatedPassword) {
        rankingPayload.initial_password = generatedPassword;
      }

      const upsert = await admin
        .from("ranking_user")
        .upsert(rankingPayload, { onConflict: "email" });

      if (upsert.error) {
        throw new Error(`ranking_user upsert falló: ${upsert.error.message}`);
      }

      updated++;
      resultRows.push({
        idx: i + 1,
        email,
        status: "updated",
        action: strategy,
        generatedPassword,
      });
    } catch (err) {
      failed++;
      resultRows.push({
        idx: i + 1,
        email,
        status: "failed",
        message: (err as Error)?.message || String(err),
      });
    }
  }

  return json(200, {
    ok: true,
    mode,
    summary: {
      total: rows.length,
      created,
      updated,
      skipped,
      failed,
      invalid,
      conflicts,
      rolledBack,
    },
    rows: resultRows,
  });
});
