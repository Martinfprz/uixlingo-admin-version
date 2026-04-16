import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// --- SISTEMA DE TEMAS (Dark / Light) ---

function _updateThemeIcon(theme) {
    const icon = document.getElementById('theme-icon');
    if (!icon) return;
    icon.className = theme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
}

window.toggleTheme = function () {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('uixlingo-theme', next);
    _updateThemeIcon(next);
};

// Actualizar ícono al cargar (data-theme ya aplicado por el script inline del <head>)
window.addEventListener('DOMContentLoaded', () => {
    const theme = document.documentElement.getAttribute('data-theme') || 'dark';
    _updateThemeIcon(theme);
});

// Sincronizar con cambios del sistema (solo si el usuario no eligió manualmente)
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!localStorage.getItem('uixlingo-theme')) {
        const theme = e.matches ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', theme);
        _updateThemeIcon(theme);
    }
});

const db = { provider: 'supabase' };

const SUPABASE_URL = 'https://pmezmoobuwwbirwzensj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBtZXptb29idXd3Ymlyd3plbnNqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwOTE0NjgsImV4cCI6MjA5MDY2NzQ2OH0.CCl6PJ-bJQATkUgeajz-M1foB_p8l6iS8tX5C079SE8';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function invokeAdminFunction(functionName, payload) {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw new Error(`No se pudo leer la sesión: ${sessionError.message}`);
    const accessToken = sessionData?.session?.access_token;
    if (!accessToken) throw new Error('No hay sesión activa para invocar funciones protegidas.');

    const invokePromise = fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify(payload)
    }).then(async (res) => {
        let parsed = null;
        try { parsed = await res.json(); } catch (_) { /* noop */ }
        if (!res.ok) {
            const msg = parsed?.error || parsed?.message || `HTTP ${res.status} invocando ${functionName}`;
            const err = new Error(msg);
            err.code = `http_${res.status}`;
            throw err;
        }
        return { data: parsed, error: null };
    });
    const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
            reject(new Error(`Timeout invocando ${functionName}. Revisa red, sesión o deployment de la función.`));
        }, 20000);
    });
    const { data, error } = await Promise.race([invokePromise, timeoutPromise]);
    if (error) throw new Error(error.message || `Error invocando ${functionName}`);
    if (!data || data.ok !== true) throw new Error(data?.error || `Respuesta inválida de ${functionName}`);
    return data;
}

function askCsvConflictStrategy(conflictsCount) {
    if (!conflictsCount) return Promise.resolve('skip');
    const modal = document.getElementById('modal-csv-conflict-strategy');
    const text = document.getElementById('csv-conflict-count-text');
    const optionsWrap = document.getElementById('csv-conflict-strategy-options');
    const btnCancel = document.getElementById('btn-csv-conflict-cancel');
    const btnConfirm = document.getElementById('btn-csv-conflict-confirm');

    if (!modal || !text || !optionsWrap || !btnCancel || !btnConfirm) {
        return Promise.resolve('update_and_reset_password');
    }

    const chips = Array.from(optionsWrap.querySelectorAll('.csv-strategy-chip'));
    let selected = 'update_and_reset_password';
    const setSelected = (value) => {
        selected = value;
        chips.forEach((chip) => {
            const isOn = chip.dataset.value === value;
            chip.classList.toggle('is-selected', isOn);
            chip.setAttribute('aria-checked', isOn ? 'true' : 'false');
        });
    };
    chips.forEach((chip) => {
        chip.onclick = () => setSelected(chip.dataset.value || 'update_and_reset_password');
    });
    setSelected(selected);

    text.textContent = `Se detectaron ${conflictsCount} usuario(s) ya existentes. Elige cómo procesarlos.`;
    modal.classList.remove('hidden');

    return new Promise((resolve, reject) => {
        const cleanup = () => {
            btnCancel.onclick = null;
            btnConfirm.onclick = null;
            chips.forEach((chip) => (chip.onclick = null));
            modal.classList.add('hidden');
        };
        btnCancel.onclick = () => {
            cleanup();
            reject(new Error('Importación cancelada por el usuario.'));
        };
        btnConfirm.onclick = () => {
            cleanup();
            resolve(selected);
        };
    });
}

const DELETE_FIELD_MARKER = Symbol('DELETE_FIELD_MARKER');
function deleteField() {
    return DELETE_FIELD_MARKER;
}

function collection(_db, ...segments) {
    return { segments, type: 'collection' };
}

function doc(_db, ...segments) {
    return { segments, type: 'doc' };
}

function where(field, operator, value) {
    return { field, operator, value };
}

function query(collectionRef, ...constraints) {
    return { ...collectionRef, constraints, type: 'query' };
}

function _normalizeCollectionTarget(refOrQuery) {
    const segments = refOrQuery?.segments || [];
    const constraints = refOrQuery?.constraints || [];
    if (segments.length === 0) throw new Error('Referencia vacía');
    if (segments[0] === 'pills' && segments[2] === 'questions') {
        return { table: 'pill_questions', pillId: segments[1], rowId: segments[3] || null, constraints };
    }
    return { table: segments[0], rowId: segments[1] || null, constraints };
}

function _toIsoOrNull(v) {
    if (v == null) return null;
    if (v instanceof Date) return v.toISOString();
    if (typeof v?.toDate === 'function') return v.toDate().toISOString();
    if (typeof v === 'object' && typeof v.seconds === 'number') return new Date(v.seconds * 1000).toISOString();
    if (typeof v === 'string' || typeof v === 'number') {
        const t = new Date(v);
        return Number.isNaN(t.getTime()) ? null : t.toISOString();
    }
    return null;
}

function _stripDeleteFields(payload) {
    const out = {};
    Object.entries(payload || {}).forEach(([k, v]) => {
        if (v === DELETE_FIELD_MARKER) return;
        out[k] = v;
    });
    return out;
}

function _mapFirestoreLikeToSupabase(table, payload, refMeta = {}) {
    const clean = _stripDeleteFields(payload);
    const hasAny = (...keys) => keys.some((k) => Object.prototype.hasOwnProperty.call(clean, k));
    const firstVal = (...keys) => {
        for (const k of keys) {
            if (Object.prototype.hasOwnProperty.call(clean, k)) return clean[k];
        }
        return undefined;
    };
    if (table === 'banco_preguntas' || table === 'preguntas_evaluacion') {
        const out = {};
        if (hasAny('Q', 'q')) out.q = firstVal('Q', 'q');
        if (hasAny('A', 'a')) out.a = firstVal('A', 'a');
        if (hasAny('B', 'b')) out.b = firstVal('B', 'b');
        if (hasAny('C', 'c')) out.c = firstVal('C', 'c');
        if (hasAny('Correcta', 'correcta')) out.correcta = firstVal('Correcta', 'correcta');
        if (hasAny('Cat', 'cat')) out.cat = firstVal('Cat', 'cat');
        if (hasAny('Expl', 'expl')) out.expl = firstVal('Expl', 'expl');
        if (hasAny('Tag', 'tag')) out.tag = firstVal('Tag', 'tag');
        if (hasAny('Seniority', 'seniority')) out.seniority = firstVal('Seniority', 'seniority');
        return out;
    }
    if (table === 'pills') {
        const out = {};
        if (hasAny('name')) out.name = clean.name;
        if (hasAny('category')) out.category = clean.category;
        if (hasAny('description')) out.description = clean.description;
        if (hasAny('link')) out.link = clean.link;
        if (hasAny('published_at', 'publishedAt', 'createdAt')) {
            out.published_at = _toIsoOrNull(firstVal('published_at', 'publishedAt', 'createdAt')) || undefined;
        }
        if (hasAny('sort_order', 'sortOrder', 'order', 'orden')) {
            const n = Number(firstVal('sort_order', 'sortOrder', 'order', 'orden'));
            out.sort_order = Number.isFinite(n) ? n : undefined;
        }
        return out;
    }
    if (table === 'pill_questions') {
        const out = {};
        if (refMeta.pillId || hasAny('pill_id', 'pillId')) out.pill_id = refMeta.pillId || firstVal('pill_id', 'pillId');
        if (hasAny('question')) out.question = clean.question;
        if (hasAny('correct_answer', 'correctAnswer')) out.correct_answer = firstVal('correct_answer', 'correctAnswer');
        if (hasAny('explanation')) out.explanation = clean.explanation;
        if (hasAny('category')) out.category = clean.category;
        if (hasAny('type')) out.type = clean.type;
        if (hasAny('active')) out.active = clean.active;
        return out;
    }
    if (table === 'ranking_user') {
        const out = { ...clean };
        if (!out.email && refMeta.rowId) out.email = refMeta.rowId;
        // Algunos esquemas de Supabase no tienen columna `role`; el rol vive en Auth (app_metadata).
        delete out.role;
        return out;
    }
    return clean;
}

function _mapSupabaseToFirestoreLike(table, row) {
    if (table === 'banco_preguntas' || table === 'preguntas_evaluacion') {
        return {
            Cat: row.cat ?? '',
            Q: row.q ?? '',
            A: row.a ?? '',
            B: row.b ?? '',
            C: row.c ?? '',
            Correcta: row.correcta ?? 'A',
            Expl: row.expl ?? '',
            Tag: row.tag ?? '',
            Seniority: row.seniority ?? '',
            active: true
        };
    }
    if (table === 'pill_questions') {
        return {
            question: row.question ?? '',
            correctAnswer: row.correct_answer === true,
            explanation: row.explanation ?? '',
            category: row.category ?? '',
            type: row.type ?? 'true_false',
            active: row.active !== false
        };
    }
    if (table === 'pills') {
        return {
            name: row.name ?? '',
            category: row.category ?? '',
            description: row.description ?? '',
            link: row.link ?? '',
            publishedAt: row.published_at ?? null,
            order: row.sort_order ?? null
        };
    }
    return row || {};
}

function _applyQueryConstraints(builder, constraints = []) {
    let q = builder;
    for (const c of constraints) {
        if (!c) continue;
        if (c.operator === '==') q = q.eq(c.field, c.value);
    }
    return q;
}

async function getDocs(refOrQuery) {
    const target = _normalizeCollectionTarget(refOrQuery);
    let q = supabase.from(target.table).select('*');
    if (target.pillId) q = q.eq('pill_id', target.pillId);
    q = _applyQueryConstraints(q, target.constraints);
    const { data, error } = await q;
    if (error) throw error;
    const rows = data || [];
    const docs = rows.map((row) => ({
        id: row.id,
        data: () => _mapSupabaseToFirestoreLike(target.table, row),
        ref: { id: row.id, table: target.table, row }
    }));
    return {
        docs,
        empty: docs.length === 0,
        size: docs.length,
        forEach(cb) { docs.forEach(cb); }
    };
}

async function getDoc(docRef) {
    const target = _normalizeCollectionTarget(docRef);
    if (target.table === 'ranking_user' && target.rowId) {
        const { data, error } = await supabase.from('ranking_user').select('*').eq('email', target.rowId).single();
        if (error && error.code !== 'PGRST116') throw error;
        const row = data || null;
        return {
            id: target.rowId,
            exists: () => !!row,
            data: () => (row ? _mapSupabaseToFirestoreLike(target.table, row) : undefined)
        };
    }
    const { data, error } = await supabase.from(target.table).select('*').eq('id', target.rowId).single();
    if (error && error.code !== 'PGRST116') throw error;
    const row = data || null;
    return {
        id: target.rowId,
        exists: () => !!row,
        data: () => (row ? _mapSupabaseToFirestoreLike(target.table, row) : undefined)
    };
}

async function addDoc(collectionRef, payload) {
    const target = _normalizeCollectionTarget(collectionRef);
    const row = _mapFirestoreLikeToSupabase(target.table, payload, target);
    const { data, error } = await supabase.from(target.table).insert(row).select('id').single();
    if (error) throw error;
    return { id: data?.id };
}

async function setDoc(docRef, payload, options = {}) {
    const target = _normalizeCollectionTarget(docRef);
    const row = _mapFirestoreLikeToSupabase(target.table, payload, target);
    if (target.table === 'ranking_user' && target.rowId) row.email = target.rowId;
    if (options?.merge) {
        const { error } = await supabase.from(target.table).upsert(row, { onConflict: target.table === 'ranking_user' ? 'email' : 'id' });
        if (error) throw error;
        return;
    }
    if (target.table === 'ranking_user' && target.rowId) {
        const { error } = await supabase.from('ranking_user').upsert(row, { onConflict: 'email' });
        if (error) throw error;
        return;
    }
    const { error } = await supabase.from(target.table).upsert({ id: target.rowId, ...row }, { onConflict: 'id' });
    if (error) throw error;
}

async function updateDoc(docRef, payload) {
    const target = _normalizeCollectionTarget(docRef);
    const row = _mapFirestoreLikeToSupabase(target.table, payload, target);
    if (target.table === 'ranking_user' && target.rowId) {
        const { error } = await supabase.from('ranking_user').update(row).eq('email', target.rowId);
        if (error) throw error;
        return;
    }
    const { error } = await supabase.from(target.table).update(row).eq('id', target.rowId);
    if (error) throw error;
}

async function deleteDoc(docRef) {
    const target = _normalizeCollectionTarget(docRef);
    if (target.table === 'ranking_user' && target.rowId) {
        const { error } = await supabase.from('ranking_user').delete().eq('email', target.rowId);
        if (error) throw error;
        return;
    }
    const { error } = await supabase.from(target.table).delete().eq('id', target.rowId);
    if (error) throw error;
}

/**
 * Acceso de administrador embebido (sin configuración extra).
 * Credenciales: admin@uix.local  /  UixAdmin2026!
 * Quitar o cambiar en producción: cualquiera con el código puede ver estas constantes.
 */
const HARDCODED_ADMIN_EMAIL = 'admin@uix.local';
const HARDCODED_ADMIN_PASSWORD = 'UixAdmin2026!';

function isHardcodedAdminEmailStr(email) {
    return (email || '').trim().toLowerCase() === HARDCODED_ADMIN_EMAIL.toLowerCase();
}

function isHardcodedAdminLogin(email, password) {
    return (
        (email || '').trim().toLowerCase() === HARDCODED_ADMIN_EMAIL.toLowerCase() &&
        (password || '') === HARDCODED_ADMIN_PASSWORD
    );
}

/** Contraseña temporal alineada con CSV y sincronización (≥ 6 caracteres). */
function generateTemporaryUserPassword(nameHint) {
    const baseName = (nameHint || 'usr').toString();
    let prefix = baseName.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ]/g, '');
    if (!prefix) prefix = 'usr';
    prefix = prefix.substring(0, 3).toLowerCase();
    while (prefix.length < 3) prefix += 'x';
    prefix = prefix.charAt(0).toUpperCase() + prefix.slice(1);
    return `${prefix}UiX${Math.floor(100 + Math.random() * 900)}`;
}

function formatSupabaseAuthError(raw) {
    const m = String(raw || '').toLowerCase();
    if (!m) return 'Error desconocido de autenticación.';
    if (m.includes('password') && (m.includes('weak') || m.includes('least'))) {
        return 'Contraseña inválida o demasiado débil.';
    }
    if (m.includes('email') && m.includes('invalid')) return 'Correo electrónico no válido.';
    return raw || 'Error de autenticación.';
}

async function createAuthUserByEmailPassword(email, password) {
    const { data, error } = await supabase.auth.signUp({
        email,
        password
    });
    if (!error) return { status: 'created', data, code: null };
    const rawMsg = String(error.message || '');
    const isExisting =
        rawMsg.toLowerCase().includes('already registered') ||
        rawMsg.toLowerCase().includes('already exists') ||
        rawMsg.toLowerCase().includes('already been registered');
    if (isExisting) return { status: 'exists', data, code: 'USER_EXISTS' };
    return {
        status: 'error',
        message: formatSupabaseAuthError(rawMsg),
        code: rawMsg
    };
}

const AUTH_RETRYABLE_FRAGMENTS = [
    'too many requests',
    'rate limit',
    'temporarily unavailable',
    'network',
    'timeout'
];

/** Reintentos con espera ante límites de frecuencia del proveedor Auth. */
async function createAuthUserWithBackoff(email, password) {
    let last = null;
    for (let attempt = 0; attempt < 6; attempt++) {
        if (attempt > 0) {
            const wait = Math.min(350 * Math.pow(2, attempt - 1), 8000);
            await new Promise((r) => setTimeout(r, wait));
        }
        last = await createAuthUserByEmailPassword(email, password);
        if (last.status !== 'error') return last;
        const retryableMsg = String(last.code || '').toLowerCase();
        const isRetryable = AUTH_RETRYABLE_FRAGMENTS.some((fragment) => retryableMsg.includes(fragment));
        if (!isRetryable) return last;
    }
    return last;
}

function normalizeNameForDuplicate(raw) {
    return (raw || '')
        .toString()
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
}

/**
 * Firestore puede exponer exists como propiedad booleana o como método según versión;
 * si se usa mal, `if (snapshot.exists)` es truthy con un método y `data()` puede ser undefined.
 */
function getFirestoreDocDataIfExists(snapshot) {
    if (!snapshot) return null;
    let existsVal;
    if (typeof snapshot.exists === 'function') {
        existsVal = snapshot.exists();
    } else {
        existsVal = snapshot.exists;
    }
    if (!existsVal) return null;
    const d = snapshot.data();
    return d != null && typeof d === 'object' ? d : {};
}

/**
 * Encuentra columnas email / nombre / id con nombres en distintos idiomas y órdenes (email,id,nombre…).
 */
function resolveUserCsvColumnIndices(headers) {
    const h = headers.map((x) => String(x).trim().toLowerCase());

    const emailIdx = h.findIndex(
        (x) =>
            x === 'email' ||
            x === 'e-mail' ||
            x === 'correo' ||
            x === 'mail' ||
            x.includes('correo') ||
            (x.includes('mail') && !x.includes('nombre') && !x.includes('name'))
    );

    const nameIdx = h.findIndex((x) => x === 'nombre' || x.includes('nombre') || x === 'name' || x.includes('nombre completo'));

    const exactIdHeaders = new Set([
        'id',
        'empleado',
        'employee',
        'no_empleado',
        'no. empleado',
        'id_empleado',
        'numero_empleado',
        'número empleado',
        'idempleado'
    ]);
    let idIdx = -1;
    for (let j = 0; j < h.length; j++) {
        if (exactIdHeaders.has(h[j])) {
            idIdx = j;
            break;
        }
    }
    if (idIdx === -1) {
        idIdx = h.findIndex(
            (x) =>
                (x.includes('empleado') || x.includes('employee')) &&
                !x.includes('correo') &&
                !x.includes('mail')
        );
    }
    if (idIdx === -1) {
        idIdx = h.findIndex((x) => {
            if (!x.includes('id')) return false;
            if (x.includes('correo') || x.includes('mail') || x.includes('email')) return false;
            if (x.includes('nombre') || x.includes('name')) return false;
            if (x.includes('senior') || x.includes('nivel')) return false;
            return true;
        });
    }

    const passIdx = h.findIndex(
        (x) => x.includes('contraseña') || x.includes('password') || x.includes('contrasena')
    );
    const seniorityIdx = h.findIndex(
        (x) =>
            x === 'seniority' ||
            x.includes('seniority') ||
            x.includes('nivel') ||
            x === 'nivel_seniority'
    );

    const especialidadIdx = h.findIndex(
        (x) => x === 'especialidad' || x.includes('especialidad')
    );

    return { emailIdx, nameIdx, idIdx, passIdx, seniorityIdx, especialidadIdx };
}

function resolveTalentsCsvColumnIndices(headers) {
    const h = headers.map((x) => String(x).trim().toLowerCase());
    const emailIdx = h.findIndex((x) => x === 'email' || x === 'correo' || x.includes('correo') || x.includes('mail'));
    const talentIdx = (n) => h.findIndex((x) => x === `talento_${n}` || x === `talent_${n}` || x === `habilidad_${n}`);
    return {
        emailIdx,
        t1: talentIdx(1),
        t2: talentIdx(2),
        t3: talentIdx(3),
        t4: talentIdx(4),
        t5: talentIdx(5)
    };
}

function showCsvUserImportModal(stats) {
    const modal = document.getElementById('modal-csv-import-result');
    const summaryEl = document.getElementById('csv-import-result-summary');
    const listEl = document.getElementById('csv-import-result-details');
    if (!modal || !summaryEl || !listEl) return;

    const {
        ok,
        dupFile,
        dupDb,
        emailConflict,
        invalid,
        detailLines = [],
        totalDataRows = 0,
        created = 0,
        updated = 0,
        updatedAndReset = 0,
        recreated = 0,
        skipped = 0,
        strategy = '-'
    } = stats;
    const technicalErrors = Number(stats.technicalErrors || 0);
    const notLoaded = dupFile + dupDb + emailConflict + invalid + technicalErrors;

    const positiveItems = [
        created > 0 ? `<li>Nuevos creados: <strong>${created}</strong></li>` : '',
        updated > 0 ? `<li>Actualizados (perfil): <strong>${updated}</strong></li>` : '',
        updatedAndReset > 0 ? `<li>Actualizados + reset de contraseña temporal: <strong>${updatedAndReset}</strong></li>` : '',
        recreated > 0 ? `<li>Recreados (Auth + tabla): <strong>${recreated}</strong></li>` : '',
        skipped > 0 ? `<li>Omitidos por estrategia/duplicado: <strong>${skipped}</strong></li>` : '',
        skipped > 0 ? `<li>Estrategia aplicada a duplicados: <strong>${strategy}</strong></li>` : ''
    ].filter(Boolean).join('');

    const issueItems = [
        dupFile > 0 ? `<li>Duplicado en el archivo (mismo nombre y correo repetido): <strong>${dupFile}</strong></li>` : '',
        dupDb > 0 ? `<li>Duplicado en la base (ya existía mismo nombre y correo): <strong>${dupDb}</strong></li>` : '',
        emailConflict > 0 ? `<li>Correo ya registrado con <em>otro</em> nombre: <strong>${emailConflict}</strong></li>` : '',
        invalid > 0 ? `<li>Datos incompletos (falta nombre, correo o ID): <strong>${invalid}</strong></li>` : '',
        technicalErrors > 0 ? `<li>Error técnico (red, Auth, Supabase): <strong>${technicalErrors}</strong></li>` : ''
    ].filter(Boolean).join('');

    summaryEl.innerHTML = `
        <p class="csv-result-line"><strong>${ok}</strong> usuario(s) procesado(s) correctamente en Supabase.</p>
        ${positiveItems ? `<ul class="csv-result-stats">${positiveItems}</ul>` : ''}
        ${notLoaded > 0 ? `<p class="csv-result-line"><strong>${notLoaded}</strong> fila(s) no se cargaron (duplicados, datos incompletos u errores).</p>` : ''}
        ${issueItems ? `<ul class="csv-result-stats">${issueItems}</ul>` : ''}
        <p class="csv-result-total">Filas de datos en el archivo: <strong>${totalDataRows}</strong></p>
    `;

    listEl.innerHTML = '';
    const maxList = 45;
    const lines = detailLines;
    const slice = lines.slice(0, maxList);
    slice.forEach((line) => {
        const li = document.createElement('li');
        li.textContent = line;
        listEl.appendChild(li);
    });
    if (lines.length > maxList) {
        const li = document.createElement('li');
        li.className = 'text-muted';
        li.textContent = `… y ${lines.length - maxList} más.`;
        listEl.appendChild(li);
    }
    if (lines.length === 0) {
        const li = document.createElement('li');
        li.className = 'text-muted';
        li.textContent = 'No hay detalle de incidencias (solo duplicados omitidos o carga limpia).';
        listEl.appendChild(li);
    }

    modal.classList.remove('hidden');
}

window.closeCsvUserImportModal = function () {
    const modal = document.getElementById('modal-csv-import-result');
    if (modal) modal.classList.add('hidden');
};

let localQuestions = [];
let questionToDeleteId = null;
let activeFilters = new Set();
let activeSeniorityFilters = new Set();
let searchTerm = "";
let currentQuestionBank = "banco_preguntas";
let currentBankName = "";

const DEFAULT_QUESTION_BANKS = [
    { collectionId: "banco_preguntas", name: "UiXers", icon: "fa-users", description: "Preguntas para participantes", iconColor: "blue" },
    { collectionId: "preguntas_evaluacion", name: "Evaluación", icon: "fa-clipboard-check", description: "Preguntas para evaluaciones", iconColor: "purple" },
    { collectionId: "preguntas_pills", name: "Pills", icon: "fa-capsules", description: "Cápsulas de aprendizaje", iconColor: "yellow" }
];
const QUESTION_BANKS_COLLECTION = "question_banks";

let localUsers = [];
let userSearchTerm = "";
let userSort = { col: 'puntos', dir: 'desc' };
let currentUserViewMode = 'uixers';
let usersSubViewMode = 'info';
let localTalentUsers = [];
let skillsCatalog = [];
let rankingMode = 'quest';
let rankingSearchTerm = '';
let rankingPillFilter = '';
let rankingRows = [];
let rankingPillsMap = new Map();
let selectedUserIdsForDelete = [];
let deleteUsersCollectionTarget = null;

// Mapa de estilos por categoría usando clases semánticas propias
const categoryStyles = {
    "UX Writing": { badge: "category-badge category-badge--ux-writing", cssKey: "ux-writing" },
    "UX Research": { badge: "category-badge category-badge--ux-research", cssKey: "ux-research" },
    "UI Design": { badge: "category-badge category-badge--ui-design", cssKey: "ui-design" },
    "Product Strategy": { badge: "category-badge category-badge--product-strategy", cssKey: "product-strategy" },
    "Casos Prácticos": { badge: "category-badge category-badge--casos-practicos", cssKey: "casos-practicos" },
    "Inteligencia Artificial": { badge: "category-badge category-badge--inteligencia-artificial", cssKey: "inteligencia-artificial" },
    "Anuncios": { badge: "category-badge category-badge--anuncios", cssKey: "anuncios" }
};

const CATEGORY_OPTIONS_DEFAULT = [
    "UX Research", "UX Writing", "UI Design", "Product Strategy", "Casos Prácticos",
    "Inteligencia Artificial", "Anuncios"
];
const CATEGORY_STORAGE_KEY = "uix_admin_custom_categories";

function loadCustomCategoriesFromStorage() {
    try {
        const raw = localStorage.getItem(CATEGORY_STORAGE_KEY);
        const arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr.filter((s) => typeof s === "string" && s.trim()) : [];
    } catch {
        return [];
    }
}

function saveCustomCategoriesToStorage(list) {
    localStorage.setItem(CATEGORY_STORAGE_KEY, JSON.stringify(list));
}

/** Lista ordenada: predeterminadas + personalizadas (sin duplicados). */
function getAllCategoryOptions(extraNames = []) {
    const set = new Set([...CATEGORY_OPTIONS_DEFAULT, ...loadCustomCategoriesFromStorage(), ...extraNames.filter(Boolean)]);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "es"));
}

function ensureCategoryStyle(name) {
    const n = (name || "").trim();
    if (!n || categoryStyles[n]) return;
    categoryStyles[n] = {
        badge: "category-badge category-badge--default",
        cssKey: "default"
    };
}

function fillCategorySelect(selectEl, keepValue, extraNames = []) {
    if (!selectEl) return;
    const opts = getAllCategoryOptions(extraNames);
    selectEl.innerHTML = "";
    opts.forEach((o) => {
        const opt = document.createElement("option");
        opt.value = o;
        opt.textContent = o;
        selectEl.appendChild(opt);
    });
    const optNew = document.createElement("option");
    optNew.value = "__new__";
    optNew.textContent = "+ Agregar nueva categoría…";
    selectEl.appendChild(optNew);
    if (keepValue && keepValue !== "__new__" && opts.includes(keepValue)) {
        selectEl.value = keepValue;
    } else if (keepValue && keepValue !== "__new__" && !opts.includes(keepValue)) {
        ensureCategoryStyle(keepValue);
        const opt = document.createElement("option");
        opt.value = keepValue;
        opt.textContent = keepValue;
        selectEl.insertBefore(opt, selectEl.lastElementChild);
        selectEl.value = keepValue;
    } else if (opts.length) {
        selectEl.value = opts[0];
    }
}

function populateAllCategorySelects() {
    ["pill", "pq", "q"].forEach((prefix) => {
        const sel = document.getElementById(`${prefix}-category`);
        if (!sel) return;
        const cur = sel.value;
        fillCategorySelect(sel, cur);
    });
}

window.handleCategorySelectChange = function (prefix) {
    const sel = document.getElementById(`${prefix}-category`);
    const wrap = document.getElementById(`${prefix}-category-custom-wrap`);
    const inp = document.getElementById(`${prefix}-category-custom`);
    if (!sel || !wrap) return;
    const isNew = sel.value === "__new__";
    wrap.classList.toggle("hidden", !isNew);
    if (isNew && inp) {
        inp.value = "";
        inp.focus();
    }
};

/** Resuelve categoría desde select; si eligió nueva, usa el input y la guarda. */
function resolveCategoryFromSelect(prefix) {
    const sel = document.getElementById(`${prefix}-category`);
    const custom = document.getElementById(`${prefix}-category-custom`);
    if (!sel) return "";
    if (sel.value === "__new__") {
        const t = (custom?.value || "").trim();
        if (t.length < 2) return null;
        const customList = loadCustomCategoriesFromStorage();
        const lower = t.toLowerCase();
        if (!CATEGORY_OPTIONS_DEFAULT.some((c) => c.toLowerCase() === lower) && !customList.some((c) => c.toLowerCase() === lower)) {
            customList.push(t);
            saveCustomCategoriesToStorage(customList);
        }
        ensureCategoryStyle(t);
        populateAllCategorySelects();
        const sel2 = document.getElementById(`${prefix}-category`);
        if (sel2) sel2.value = t;
        return t;
    }
    return sel.value;
}

// --- Helpers ---

/**
 * Divide texto CSV en filas físicas respetando campos entre comillas que pueden
 * contener saltos de línea (RFC 4180).
 */
function splitCsvRecords(text) {
    const rows = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (c === '"') {
            if (inQuotes && text[i + 1] === '"') {
                current += '""';
                i++;
            } else {
                inQuotes = !inQuotes;
                current += c;
            }
        } else if (!inQuotes && (c === "\n" || c === "\r")) {
            if (c === "\r" && text[i + 1] === "\n") i++;
            if (current.trim().length > 0) rows.push(current);
            current = "";
        } else {
            current += c;
        }
    }
    if (current.trim().length > 0) rows.push(current);
    return rows;
}

/**
 * Parsea una fila CSV a columnas (comas dentro de comillas, comillas escapadas "").
 */
function parseCsvRowCells(rowLine) {
    const cols = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < rowLine.length; i++) {
        const c = rowLine[i];
        if (c === '"') {
            if (inQuotes && rowLine[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (c === "," && !inQuotes) {
            cols.push(current.trim());
            current = "";
        } else {
            current += c;
        }
    }
    cols.push(current.trim());
    return cols;
}

/** Valores de Seniority del CSV → valores del select en la app */
function normalizeQuestionSeniority(raw) {
    const s = (raw || "").trim().toLowerCase();
    if (s === "mid" || s === "medium" || s === "medio") return "medium";
    if (s === "junior" || s === "jr") return "junior";
    if (s === "senior" || s === "sr") return "senior";
    if (s === "product designer") return "Product Designer";
    if (s === "customer experience") return "Customer Experience";
    return raw || "junior";
}

/**
 * Unifica el nombre de categoría para evitar duplicados en filtros (p. ej. "UI DESIGN" vs "UI Design")
 * y limpia valores corruptos por CSV/Excel (comillas extra, prefijo "Cat" pegado al valor).
 */
function normalizeQuestionCategory(raw) {
    if (raw == null) return "General";
    let s = String(raw).trim();
    if (s === "") return "General";

    // Quitar comillas envolventes repetidas (exportaciones Excel)
    while (s.length >= 2 && ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))) {
        s = s.slice(1, -1).trim();
    }

    // Valores tipo: Cat"UI DESIGN" o Cat UI DESIGN por columna mal detectada
    s = s.replace(/^cat\s*["']?/i, "").trim();
    s = s.replace(/^["']+|["']+$/g, "").trim();

    const known = Object.keys(categoryStyles);
    const lower = s.toLowerCase();
    const canonical = known.find((k) => k.toLowerCase() === lower);
    if (canonical) return canonical;

    return s;
}

/** Encabezado de columna de categoría (no usar includes('cat'): coincide con "concatenación", etc.) */
function isCsvCategoryColumnHeader(h) {
    const x = (h || "").trim().toLowerCase();
    if (!x) return false;
    if (x === "cat") return true;
    return (
        x.startsWith("categoría") ||
        x.startsWith("categoria") ||
        x.startsWith("category")
    );
}

window.formatTime = function (seconds) {
    if (!seconds) return "0s";
    seconds = parseInt(seconds);
    if (seconds < 60) return seconds + "s";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
};

function formatDateForUserTable(value) {
    if (!value) return '-';
    if (typeof value?.toDate === 'function') return value.toDate().toLocaleDateString();
    if (typeof value?.seconds === 'number') return new Date(value.seconds * 1000).toLocaleDateString();
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString();
}

// --- Login ---

function validateLoginForm() {
    const email = document.getElementById('admin-email')?.value.trim() || '';
    const pass = document.getElementById('admin-pass')?.value.trim() || '';
    const btn = document.getElementById('btn-login-submit');
    const btnRec = document.getElementById('btn-recover-submit');

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const isEmailValid = emailRegex.test(email);
    // Alineado con Firebase Authentication: mínimo 6 caracteres
    const isPassValid = pass.length >= 6;

    // No usar disabled en estos botones: en muchos navegadores no reciben clic ni addEventListener.
    if (btn) {
        btn.classList.toggle('login-submit-btn--invalid', !(isEmailValid && isPassValid));
        btn.setAttribute('aria-disabled', String(!(isEmailValid && isPassValid)));
    }
    if (btnRec) {
        btnRec.classList.toggle('login-submit-btn--invalid', !isEmailValid);
        btnRec.setAttribute('aria-disabled', String(!isEmailValid));
    }
}

window.toggleRecoveryMode = function (isRecovery, event) {
    if (event) event.preventDefault();
    const passWrapper = document.getElementById('login-password-wrapper');
    const forgotLink = document.getElementById('forgot-password-link');
    const loginBtn = document.getElementById('btn-login-submit');
    const recoverBtn = document.getElementById('btn-recover-submit');
    const backLink = document.getElementById('back-to-login-link');
    const title = document.getElementById('login-main-title');
    const subtitle = document.getElementById('login-main-subtitle');
    const errorMsg = document.getElementById('login-error');

    if (errorMsg) errorMsg.classList.add('hidden');

    if (isRecovery) {
        passWrapper?.classList.add('hidden');
        forgotLink?.classList.add('hidden');
        loginBtn?.classList.add('hidden');
        recoverBtn?.classList.remove('hidden');
        backLink?.classList.remove('hidden');
        if (title) title.innerText = 'Recuperar';
        if (subtitle) subtitle.innerText = 'Ingresa tu correo para restaurar acceso';
    } else {
        passWrapper?.classList.remove('hidden');
        forgotLink?.classList.remove('hidden');
        loginBtn?.classList.remove('hidden');
        recoverBtn?.classList.add('hidden');
        backLink?.classList.add('hidden');
        if (title) title.innerText = 'Administrativos';
        if (subtitle) subtitle.innerText = 'Solo personal autorizado';
    }
    validateLoginForm();
};

/**
 * Scripts `type="module"` se ejecutan después de `DOMContentLoaded`; si solo escuchamos ese evento,
 * los listeners nunca se registran. Por eso inicializamos según `document.readyState`.
 */
function initAdminDom() {
    const emailInput = document.getElementById('admin-email');
    const passInput = document.getElementById('admin-pass');
    if (emailInput && passInput) {
        const onLoginFieldChange = () => validateLoginForm();
        ['input', 'change', 'blur', 'keyup'].forEach((ev) => {
            emailInput.addEventListener(ev, onLoginFieldChange);
            passInput.addEventListener(ev, onLoginFieldChange);
        });
        validateLoginForm();
        // Autocompletado del navegador a veces no dispara "input" al cargar
        window.addEventListener('load', validateLoginForm);
        setTimeout(validateLoginForm, 100);
        setTimeout(validateLoginForm, 400);
    }

    const btnLoginSubmit = document.getElementById('btn-login-submit');
    if (btnLoginSubmit) {
        btnLoginSubmit.addEventListener('click', (e) => {
            e.preventDefault();
            if (typeof window.attemptLogin === 'function') void window.attemptLogin();
        });
    }
    const btnRecoverSubmit = document.getElementById('btn-recover-submit');
    if (btnRecoverSubmit) {
        btnRecoverSubmit.addEventListener('click', (e) => {
            e.preventDefault();
            if (typeof window.forgotPassword === 'function') void window.forgotPassword(e);
        });
    }

    const btnToggleLoginPass = document.getElementById('btn-toggle-login-pass');
    if (btnToggleLoginPass) {
        btnToggleLoginPass.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (typeof window.togglePass === 'function') {
                window.togglePass('admin-pass', 'login-pass-icon');
            }
        });
    }

    const passInputForEnter = document.getElementById('admin-pass');
    if (passInputForEnter) {
        passInputForEnter.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (typeof window.attemptLogin === 'function') void window.attemptLogin();
            }
        });
    }

    // Consecutive password number: persisted in localStorage. Last used was 009, so we start at 010.
    const PASS_COUNTER_KEY = 'uix_admin_last_pass_number';
    function getNextPassNumber() {
        let n = parseInt(localStorage.getItem(PASS_COUNTER_KEY), 10);
        if (isNaN(n) || n < 10) n = 10; // start at 010
        const next = n;
        localStorage.setItem(PASS_COUNTER_KEY, String(n + 1));
        return next;
    }

    const newUserNameInput = document.getElementById('new-user-name');
    const newUserPassInput = document.getElementById('new-user-pass');
    if (newUserNameInput && newUserPassInput) {
        newUserNameInput.addEventListener('input', (e) => {
            const name = e.target.value.trim();
            if (name.length < 3) {
                newUserPassInput.value = '';
                return;
            }
            let prefix = name.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ]/g, '');
            if (prefix.length === 0) prefix = "usr";
            prefix = prefix.substring(0, 3).toLowerCase();
            while (prefix.length < 3) prefix += 'x';
            prefix = prefix.charAt(0).toUpperCase() + prefix.slice(1);

            const expectedStart = prefix + 'UiX';
            const current = newUserPassInput.value;
            // Only use next number if we don't already have a password for this prefix (avoid increment on every keystroke)
            if (current.startsWith(expectedStart) && /^\d{3}$/.test(current.slice(expectedStart.length))) {
                return; // keep existing password for this name
            }
            const nextNum = getNextPassNumber();
            newUserPassInput.value = `${prefix}UiX${nextNum.toString().padStart(3, '0')}`;
        });
    }

    const iconGrid = document.getElementById("new-bank-icon-grid");
    if (iconGrid) {
        iconGrid.addEventListener("click", (e) => {
            const btn = e.target.closest(".icon-picker-btn");
            if (!btn) return;
            document.getElementById("new-bank-icon").value = btn.dataset.icon;
            iconGrid.querySelectorAll(".icon-picker-btn").forEach((b) => b.classList.remove("selected"));
            btn.classList.add("selected");
        });
    }

    if (typeof window.handleNewUserRoleChange === 'function') {
        window.handleNewUserRoleChange();
    }

    const btnSaveNewUser = document.getElementById('btn-save-new-user');
    if (btnSaveNewUser) {
        btnSaveNewUser.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (typeof window.saveUser === 'function') {
                window.saveUser();
            }
        });
    }

    const btnForceChange = document.getElementById('btn-force-change');
    if (btnForceChange) {
        btnForceChange.type = 'button';
        btnForceChange.addEventListener('click', (e) => {
            e.preventDefault();
            if (typeof window.confirmForceChange === 'function') {
                window.confirmForceChange();
            }
        });
    }

    [
        { btnId: 'btn-toggle-force-current', inputId: 'force-pass-current', iconId: 'force-current-icon' },
        { btnId: 'btn-toggle-force-1',       inputId: 'force-pass-1',       iconId: 'force-1-icon' },
        { btnId: 'btn-toggle-force-2',       inputId: 'force-pass-2',       iconId: 'force-2-icon' },
    ].forEach(({ btnId, inputId, iconId }) => {
        const toggleBtn = document.getElementById(btnId);
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                if (typeof window.togglePass === 'function') window.togglePass(inputId, iconId);
            });
        }
    });

    populateAllCategorySelects();
    fillEspecialidadSelect(document.getElementById('new-user-especialidad'), '');
    fillEspecialidadSelect(document.getElementById('edit-user-especialidad'), '');
}

const _loginThrottle = { count: 0, blockedUntil: 0 };

window.attemptLogin = async function () {
    const now = Date.now();
    if (_loginThrottle.blockedUntil > now) {
        const secsLeft = Math.ceil((_loginThrottle.blockedUntil - now) / 1000);
        const errorMsg = document.getElementById('login-error');
        if (errorMsg) {
            errorMsg.innerText = `Demasiados intentos fallidos. Espera ${secsLeft}s antes de reintentar.`;
            errorMsg.classList.remove('hidden');
        }
        return;
    }

    const emailRaw = document.getElementById('admin-email').value.trim();
    const pass = document.getElementById('admin-pass').value.trim();
    const email = emailRaw.toLowerCase();
    const btn = document.getElementById('btn-login-submit');
    const errorMsg = document.getElementById('login-error');

    if (!emailRaw || !pass) {
        alert("Por favor ingresa tu correo y contraseña.");
        return;
    }
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw);
    if (!emailOk || pass.length < 6) {
        alert('Revisa el formato del correo y que la contraseña tenga al menos 6 caracteres.');
        return;
    }

    if (btn?.dataset?.loginBusy === '1') return;
    if (btn) btn.dataset.loginBusy = '1';

    btn.innerHTML = '<i class="fas fa-circle-notch animate-spin"></i> Verificando...';
    btn.disabled = true;
    errorMsg.classList.add('hidden');

    try {
        // Igual que user-version/app.js: sin timeout artificial (Promise.race podía fallar antes que Supabase).
        let signedInUser = null;
        if (isHardcodedAdminLogin(emailRaw, pass)) {
            try {
                const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass });
                if (error) throw error;
                signedInUser = data.user;
            } catch (e) {
                const code = (e && e.code) || '';
                const msg = String((e && e.message) || '').toLowerCase();
                const canTryBootstrap =
                    code === 'invalid_credentials' ||
                    msg.includes('invalid login credentials') ||
                    msg.includes('user not found');
                if (!canTryBootstrap) throw e;
                const r = await createAuthUserByEmailPassword(email, pass);
                if (r.status !== 'created' && r.status !== 'exists') {
                    throw new Error(r.message || 'No se pudo registrar el acceso en Authentication.');
                }
                const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass });
                if (error) throw error;
                signedInUser = data.user;
            }
        } else {
            const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass });
            if (error) throw error;
            signedInUser = data.user;
        }
        await handleAdminSession(signedInUser);
    } catch (e) {
        _loginThrottle.count++;
        if (_loginThrottle.count >= 5) {
            _loginThrottle.blockedUntil = Date.now() + 30000;
            _loginThrottle.count = 0;
        }
        console.error(e);
        let msg = e && e.message ? e.message : "Error al iniciar sesión.";
        const code = (e && e.code) || '';
        const errMsg = String((e && e.message) || '').toLowerCase();
        if (code === 'invalid_credentials' || errMsg.includes('invalid login credentials')) {
            msg = "Correo o contraseña incorrectos.";
        } else if (e.code === 'permission-denied') {
            msg = "No tienes permisos de administrador.";
        } else if (errMsg.includes('password') && errMsg.includes('weak')) {
            msg = "La contraseña debe tener al menos 6 caracteres.";
        }
        errorMsg.innerText = msg;
        errorMsg.classList.remove('hidden');
    } finally {
        if (btn) {
            delete btn.dataset.loginBusy;
            btn.innerHTML = 'Iniciar Sesión';
            btn.disabled = false;
        }
        validateLoginForm();
    }
};

// --- Restaurar Contraseña ---
window.forgotPassword = async function (event) {
    if (event) event.preventDefault();
    const email = document.getElementById('admin-email').value.trim();
    if (!email) {
        alert("Por favor, ingresa tu correo electrónico en el campo superior primero para enviar el enlace de recuperación.");
        return;
    }

    const btnRec = document.getElementById('btn-recover-submit');
    if (btnRec) {
        btnRec.innerHTML = '<i class="fas fa-circle-notch animate-spin"></i> Enviando...';
        btnRec.disabled = true;
    }

    try {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}${window.location.pathname}`
        });
        if (error) throw error;
        alert(`Te hemos enviado un correo a ${email} con instrucciones para restaurar tu contraseña.\n¡Revisa tu bandeja de entrada o spam!`);
        window.toggleRecoveryMode(false);
    } catch (e) {
        console.error("Error al enviar correo de recuperación:", e);
        const msg = String((e && e.message) || '').toLowerCase();
        if (msg.includes('user') && msg.includes('not found')) {
            alert("No se encontró ningún usuario con ese correo electrónico.");
        } else if (msg.includes('invalid') && msg.includes('email')) {
            alert("El formato del correo electrónico es inválido.");
        } else {
            alert("Ocurrió un error al enviar el correo: " + e.message);
        }
    } finally {
        if (btnRec) {
            btnRec.innerHTML = 'Recuperar Contraseña';
            btnRec.disabled = false;
            validateLoginForm();
        }
    }
};

// --- Manejo de Sesión Persistente ---
// Spec (spec.md): el rol admin viene de Supabase Auth — `user.app_metadata.role === 'admin'`.
// La tabla `ranking_user` no define admin (no columna `role`); solo enriquece nombre / flags legacy.
// Por eso NUNCA bloqueamos el acceso si falla o tarda la lectura a `ranking_user`.
async function handleAdminSession(user) {
    const loginScreen = document.getElementById('admin-login');
    const adminPanel = document.getElementById('admin-panel');

    if (!user?.email) {
        if (loginScreen) loginScreen.classList.remove('hidden');
        if (adminPanel) adminPanel.classList.add('hidden');
        return;
    }

    const emailNorm = user.email.trim().toLowerCase();
    const appRole = String(user.app_metadata?.role || '').trim().toLowerCase();
    const isAdminByAuth = appRole === 'admin';
    /** Solo desarrollo: admin@uix.local embebido en código. */
    const allowHardcodedDev = isHardcodedAdminEmailStr(emailNorm);

    if (!isAdminByAuth && !allowHardcodedDev) {
        try {
            await supabase.auth.signOut();
        } catch (_) { /* noop */ }
        if (loginScreen) loginScreen.classList.remove('hidden');
        if (adminPanel) adminPanel.classList.add('hidden');
        const errEl = document.getElementById('login-error');
        if (errEl) {
            errEl.textContent =
                'Este correo no tiene rol de administrador. En Supabase Auth, app_metadata.role debe ser "admin".';
            errEl.classList.remove('hidden');
        }
        validateLoginForm();
        return;
    }

    const forceByAppMetadata = user.app_metadata?.force_password_change === true;
    const forceByUserMetadata = user.user_metadata?.force_password_change === true;
    const forceClearedByUserMetadata = user.user_metadata?.force_password_change === false;

    let adminName = user.user_metadata?.nombre || emailNorm.split('@')[0] || 'Admin';
    let adminData = { forcePasswordChange: false };
    const adminDocId = emailNorm;

    try {
        let rankingRow = null;
        try {
            const { data: row, error: rowErr } = await supabase
                .from('ranking_user')
                .select('email,nombre,name')
                .eq('email', emailNorm)
                .maybeSingle();
            if (rowErr) {
                console.warn('admin session: ranking_user (opcional):', rowErr);
            } else if (row) {
                rankingRow = row;
                adminData = { ...adminData, ...row };
                if (row.nombre || row.name) adminName = row.nombre || row.name;
            }
        } catch (readErr) {
            console.warn('admin session: ranking_user (opcional) no leído:', readErr);
        }

        if (!rankingRow && allowHardcodedDev) {
            try {
                await setDoc(doc(db, 'ranking_user', emailNorm), {
                    nombre: 'Admin local',
                    name: 'Admin local',
                    email: emailNorm,
                    id: 'LOCAL',
                    empId: 'LOCAL',
                    password: HARDCODED_ADMIN_PASSWORD,
                    initial_password: HARDCODED_ADMIN_PASSWORD,
                    Especialidad: '',
                    fecha: new Date(),
                    createdAt: new Date(),
                    forcePasswordChange: false
                }, { merge: true });
            } catch (bootstrapErr) {
                console.warn('Bootstrap ranking_user (opcional):', bootstrapErr);
            }
        }

        const shouldForcePasswordChange =
            adminData.forcePasswordChange === true ||
            forceByUserMetadata ||
            (forceByAppMetadata && !forceClearedByUserMetadata);

        if (shouldForcePasswordChange) {
            window.openForcePasswordModal(adminDocId);
            return;
        }

        if (!loginScreen || !adminPanel) return;

        if (!loginScreen.classList.contains('hidden')) {
            loginScreen.classList.add('view-transition-out');
            setTimeout(() => {
                try {
                    loginScreen.classList.add('hidden');
                    loginScreen.classList.remove('view-transition-out');
                    adminPanel.classList.remove('hidden');
                    adminPanel.classList.add('view-transition-in');
                    document.getElementById('admin-name-display').innerText = `Hola, ${adminName}`;
                    loadDashboard();
                    setTimeout(() => adminPanel.classList.remove('view-transition-in'), 500);
                } catch (innerErr) {
                    console.error('Transición al panel admin:', innerErr);
                }
            }, 500);
        } else {
            loginScreen.classList.add('hidden');
            adminPanel.classList.remove('hidden');
            document.getElementById('admin-name-display').innerText = `Hola, ${adminName}`;
            loadDashboard();
        }
    } catch (e) {
        console.error('Error validando sesión:', e);
        try {
            await supabase.auth.signOut();
        } catch (_) { /* noop */ }
        if (loginScreen) loginScreen.classList.remove('hidden');
        if (adminPanel) adminPanel.classList.add('hidden');
        const errEl = document.getElementById('login-error');
        if (errEl) {
            errEl.textContent = 'No se pudo completar el acceso. ' + ((e && e.message) || String(e));
            errEl.classList.remove('hidden');
        }
        validateLoginForm();
    }
}

// Solo restaura sesión al recargar la página (INITIAL_SESSION).
// El login activo llama handleAdminSession directamente para evitar deadlock con signInWithPassword.
supabase.auth.onAuthStateChange((_event, session) => {
    if (_event === 'INITIAL_SESSION') handleAdminSession(session?.user || null);
});

// --- Force Password Change ---

let currentAdminDocId = null;

function setForcePassError(msg) {
    const el = document.getElementById('force-pass-error');
    if (!el) return;
    if (!msg) {
        el.textContent = '';
        el.classList.add('hidden');
    } else {
        el.textContent = msg;
        el.classList.remove('hidden');
    }
}

window.openForcePasswordModal = function (docId) {
    currentAdminDocId = docId;
    document.getElementById('admin-login').classList.add('hidden');
    ['force-pass-current', 'force-pass-1', 'force-pass-2'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    setForcePassError('');
    const btn = document.getElementById('btn-force-change');
    if (btn) {
        btn.disabled = false;
        btn.innerHTML = 'ACTUALIZAR CONTRASEÑA';
    }
    document.getElementById('modal-force-change-pass').classList.remove('hidden');
};

window.confirmForceChange = async function () {
    const currentPass = (document.getElementById('force-pass-current')?.value || '').trim();
    const p1 = (document.getElementById('force-pass-1')?.value || '').trim();
    const p2 = (document.getElementById('force-pass-2')?.value || '').trim();
    const btn = document.getElementById('btn-force-change');
    setForcePassError('');

    if (!currentPass) {
        setForcePassError('Escribe la contraseña actual con la que acabas de iniciar sesión (la temporal).');
        return;
    }
    if (p1.length < 6) {
        setForcePassError('La nueva contraseña debe tener al menos 6 caracteres (requisito de Firebase).');
        return;
    }
    if (p1 !== p2) {
        setForcePassError('Las contraseñas nuevas no coinciden.');
        return;
    }
    if (p1 === currentPass) {
        setForcePassError('La nueva contraseña debe ser distinta a la actual.');
        return;
    }

    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user || null;
    if (!user || !user.email) {
        setForcePassError('No hay sesión activa. Cierra esta ventana e inicia sesión de nuevo.');
        return;
    }
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Actualizando…';
    }

    try {
        const { error: loginErr } = await supabase.auth.signInWithPassword({
            email: user.email,
            password: currentPass
        });
        if (loginErr) {
            const lowLoginMsg = String(loginErr.message || '').toLowerCase();
            if (lowLoginMsg.includes('invalid login credentials') || lowLoginMsg.includes('invalid_credentials')) {
                throw new Error('La contraseña actual no es correcta. Ingresa exactamente la contraseña temporal con la que iniciaste sesión.');
            }
            throw loginErr;
        }
        if (btn) btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Actualizando…';

        const { error: updateErr } = await supabase.auth.updateUser({
            password: p1,
            data: {
                force_password_change: false,
                password_changed_at: new Date().toISOString()
            }
        });
        if (updateErr) throw updateErr;

        // Firestore metadata update: no-crítico, no debe bloquear el flujo de éxito.
        if (currentAdminDocId) {
            try {
                const adminRef = doc(db, "ranking_user", currentAdminDocId);
                const adminSnap = await getDoc(adminRef);
                const prev = getFirestoreDocDataIfExists(adminSnap) || {};
                const updates = { forcePasswordChange: false };
                const hasInitial = prev.initial_password && String(prev.initial_password).trim();
                const hasPassword = prev.password && String(prev.password).trim();

                if (hasInitial) {
                    updates.password = deleteField();
                } else if (hasPassword) {
                    updates.initial_password = prev.password;
                    updates.password = deleteField();
                }

                await updateDoc(adminRef, updates);
            } catch (firestoreErr) {
                console.warn('Firestore update after password change (non-critical):', firestoreErr);
            }
        }

        await supabase.auth.signOut();
        document.getElementById('modal-force-change-pass')?.classList.add('hidden');
        document.getElementById('admin-login')?.classList.remove('hidden');
        document.getElementById('admin-panel')?.classList.add('hidden');
        const passInput = document.getElementById('admin-pass');
        if (passInput) passInput.value = '';
        const emailInput = document.getElementById('admin-email');
        if (emailInput) emailInput.value = user.email;
        setForcePassError('');
        alert('Contraseña actualizada en Supabase Auth. Inicia sesión con tu nueva contraseña.');
        location.reload();
    } catch (e) {
        console.error(e);
        let msg = e.message || 'Error al actualizar la contraseña.';
        const lowMsg = String(e.message || '').toLowerCase();
        if (lowMsg.includes('weak') && lowMsg.includes('password')) {
            msg = 'La nueva contraseña es demasiado débil. Usa al menos 6 caracteres.';
        } else if (lowMsg.includes('invalid login credentials')) {
            msg = 'La contraseña actual no es correcta. Debe ser la misma con la que iniciaste sesión.';
        } else if (lowMsg.includes('recent')) {
            msg = 'Vuelve a escribir la contraseña actual (temporal) y la nueva; si el error continúa, cierra sesión e inicia de nuevo.';
        }
        setForcePassError(msg);
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'ACTUALIZAR CONTRASEÑA';
        }
    }
};

// --- Sesión ---

window.logout = async function () {
    try {
        await supabase.auth.signOut();
        location.reload();
    } catch (error) {
        console.error("Error al cerrar sesión", error);
    }
};

// --- Navegación de tabs ---

window.showTab = function (tabName) {
    ['dashboard', 'users', 'rankings', 'questions'].forEach(t => {
        document.getElementById(`view-${t}`).classList.add('hidden');
        document.getElementById(`tab-${t}`).classList.remove('active');
    });

    document.getElementById(`view-${tabName}`).classList.remove('hidden');
    document.getElementById(`tab-${tabName}`).classList.add('active');

    if (tabName === 'dashboard') loadDashboard();
    if (tabName === 'users') loadUsers();
    if (tabName === 'rankings') loadRankings();
    if (tabName === 'questions') {
        document.getElementById('questions-bank-selection').classList.remove('hidden');
        document.getElementById('questions-bank-content').classList.add('hidden');
        loadQuestionBanks();
    }
};

window.selectQuestionBank = function (collectionName, displayName) {
    currentQuestionBank = collectionName;
    currentBankName = displayName;
    document.getElementById('current-bank-name').innerText = displayName;

    document.getElementById('questions-bank-selection').classList.add('hidden');
    document.getElementById('questions-bank-content').classList.remove('hidden');

    loadQuestions();
};

window.goBackToBanks = function () {
    document.getElementById('questions-bank-selection').classList.remove('hidden');
    document.getElementById('questions-bank-content').classList.add('hidden');
};

async function getBanksList() {
    const custom = [];
    try {
        const snap = await getDocs(collection(db, QUESTION_BANKS_COLLECTION));
        snap.forEach((d) => {
            const data = d.data();
            custom.push({
                collectionId: data.collectionId,
                name: data.name || d.id,
                icon: data.icon || "fa-book",
                description: data.description || "",
                iconColor: data.iconColor || "blue"
            });
        });
    } catch (e) {
        console.error("Error loading custom question banks", e);
    }
    return [...DEFAULT_QUESTION_BANKS, ...custom];
}

function renderBankCard(bank) {
    const colorClass = `action-icon--${bank.iconColor || "blue"}`;
    return `<button type="button" onclick="window.selectQuestionBank && window.selectQuestionBank('${bank.collectionId}', '${(bank.name || "").replace(/'/g, "\\'")}')" class="admin-card dash-action-card">
        <div class="action-icon ${colorClass}"><i class="fas ${bank.icon}"></i></div>
        <h4 class="action-card-title">${escapeHtml(bank.name)}</h4>
        <p class="action-card-desc">${escapeHtml(bank.description || "")}</p>
    </button>`;
}

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

// ── Toast notifications ──────────────────────────────────────────────────────
function showToast(message, type = 'info', durationMs = 4000) {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    const icons = { success: 'fa-circle-check', error: 'fa-circle-xmark', info: 'fa-circle-info', warn: 'fa-triangle-exclamation' };
    toast.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i><span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);
    // trigger enter animation
    requestAnimationFrame(() => toast.classList.add('toast--visible'));
    setTimeout(() => {
        toast.classList.remove('toast--visible');
        toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    }, durationMs);
}

window.loadQuestionBanks = async function () {
    const grid = document.getElementById("questions-bank-grid");
    if (!grid) return;
    grid.innerHTML = '<div class="loading-state"><i class="fas fa-circle-notch animate-spin"></i> Cargando bancos...</div>';
    const banks = await getBanksList();
    grid.innerHTML = banks.map((b) => renderBankCard(b)).join("");
};

window.openAddQuestionBankModal = function () {
    document.getElementById("new-bank-name").value = "";
    document.getElementById("new-bank-icon").value = "fa-book";
    document.getElementById("new-bank-description").value = "";
    const grid = document.getElementById("new-bank-icon-grid");
    if (grid) {
        grid.querySelectorAll(".icon-picker-btn").forEach((btn) => {
            btn.classList.toggle("selected", btn.dataset.icon === "fa-book");
        });
    }
    document.getElementById("modal-add-question-bank").classList.remove("hidden");
};

function slugForCollectionId(name) {
    return (name || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9\u00C0-\u024F]+/g, "_")
        .replace(/^_|_$/g, "") || "custom";
}

window.saveNewQuestionBank = async function () {
    const name = document.getElementById("new-bank-name").value.trim();
    if (!name) {
        alert("Escribe el nombre del banco.");
        return;
    }
    const icon = document.getElementById("new-bank-icon").value || "fa-book";
    const description = document.getElementById("new-bank-description").value.trim();

    const baseSlug = slugForCollectionId(name);
    let collectionId = "banco_" + baseSlug;
    let attempt = 0;
    const existing = await getBanksList();
    const usedIds = new Set(existing.map((b) => b.collectionId));
    while (usedIds.has(collectionId)) {
        attempt++;
        collectionId = "banco_" + baseSlug + "_" + attempt;
    }

    try {
        await addDoc(collection(db, QUESTION_BANKS_COLLECTION), {
            name,
            icon,
            collectionId,
            description: description || ""
        });
        document.getElementById("modal-add-question-bank").classList.add("hidden");
        loadQuestionBanks();
    } catch (e) {
        console.error(e);
        alert("Error al crear el banco. Revisa la consola.");
    }
};

// --- Dashboard ---

let seniorityChart = null;

window.loadDashboard = async function () {
    try {
        // Ligero: no select('*'). El total coincide con filas que RLS permite leer al usuario (anon autenticado).
        const { data: rows, error } = await supabase
            .from('ranking_user')
            .select('email,seniority,puntos,tiempo');
        if (error) throw error;

        const authAdmins = await invokeAdminFunction('admin-list-users', { role: 'admin' });
        const adminEmailSet = new Set(
            (Array.isArray(authAdmins.users) ? authAdmins.users : [])
                .map((u) => String(u.email || '').trim().toLowerCase())
                .filter(Boolean)
        );
        const list = (rows || []).filter((r) => !adminEmailSet.has(String(r.email || '').trim().toLowerCase()));
        let totalUsers = 0, totalScore = 0, totalTime = 0;
        let levels = { "Junior": 0, "Medium": 0, "Senior": 0 };

        list.forEach((data) => {
            totalUsers++;
            totalScore += (data.puntos || 0);
            totalTime += (data.tiempo || 0);

            const raw = (data.seniority || '').toString().toLowerCase().trim();
            let level = 'Junior';
            if (raw === 'medium' || raw === 'mid' || raw === 'medio') level = 'Medium';
            else if (raw === 'senior' || raw === 'sr') level = 'Senior';
            levels[level]++;
        });

        const dashTotalEl = document.getElementById('dash-total-users');
        if (dashTotalEl) {
            dashTotalEl.innerText = totalUsers;
            dashTotalEl.title =
                'Solo cuenta usuarios UiXers visibles para esta sesión. ' +
                'Los administradores (app_metadata.role=admin) se excluyen de este total.';
        }
        document.getElementById('dash-avg-score').innerText = totalUsers ? (totalScore / totalUsers).toFixed(1) : "0";
        document.getElementById('dash-avg-time').innerText = formatTime(totalUsers ? Math.round(totalTime / totalUsers) : 0);

        const ctx = document.getElementById('seniorityChart').getContext('2d');
        if (seniorityChart) seniorityChart.destroy();

        seniorityChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: Object.keys(levels),
                datasets: [{
                    label: 'Participantes',
                    data: Object.values(levels),
                    backgroundColor: ['#e5e7eb', '#c084fc', '#8C59FE'],
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, grid: { display: false } },
                    x: { grid: { display: false } }
                }
            }
        });

    } catch (e) { console.error("Error loading dashboard", e); }
};

// --- Rankings ---
function setRankingModeButtons() {
    const byId = {
        quest: document.getElementById('btn-ranking-quest'),
        tests: document.getElementById('btn-ranking-tests'),
        pills: document.getElementById('btn-ranking-pills')
    };
    Object.entries(byId).forEach(([key, el]) => {
        if (!el) return;
        el.classList.toggle('active', key === rankingMode);
    });
    const pillFilterWrap = document.getElementById('rankings-pill-filter-wrap');
    if (pillFilterWrap) {
        pillFilterWrap.classList.toggle('rankings-pill-filter-wrap--visible', rankingMode === 'pills');
    }
    if (rankingMode !== 'pills') {
        window.closeRankingPillDropdown && window.closeRankingPillDropdown();
    }
}

function rankingScoreByMode(row) {
    if (rankingMode === 'tests') return Number(row.tests_points || 0);
    if (rankingMode === 'pills') return Number(row.pills_points || 0);
    return Number(row.quest_points || 0);
}

function renderRankings() {
    setRankingModeButtons();
    const tbody = document.getElementById('rankings-table-body');
    if (!tbody) return;

    let list = Array.isArray(rankingRows) ? [...rankingRows] : [];
    if (rankingMode === 'pills' && rankingPillFilter) {
        list = list.filter((r) => String(r.pills_rank_pill_id || '') === String(rankingPillFilter));
    }
    if (rankingSearchTerm) {
        list = list.filter((r) => {
            const name = String(r.nombre || '').toLowerCase();
            const email = String(r.email || '').toLowerCase();
            return name.includes(rankingSearchTerm) || email.includes(rankingSearchTerm);
        });
    }

    list.sort((a, b) => rankingScoreByMode(b) - rankingScoreByMode(a));

    if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="empty-cell">No hay resultados para este filtro.</td></tr>`;
        return;
    }

    tbody.innerHTML = list.map((row, idx) => `
        <tr class="table-row">
            <td class="td-center">${idx + 1}</td>
            <td class="td-name">${escapeHtml(String(row.nombre || 'Sin Nombre'))}</td>
            <td>${escapeHtml(String(row.email || ''))}</td>
            <td class="td-center"><span class="badge-score">${rankingScoreByMode(row)} pts</span></td>
        </tr>
    `).join('');
}

async function loadRankings() {
    const tbody = document.getElementById('rankings-table-body');
    if (tbody) {
        tbody.innerHTML = `<tr><td colspan="4" class="loading-cell"><i class="fas fa-circle-notch animate-spin"></i> Cargando rankings...</td></tr>`;
    }
    try {
        const [{ data: rankingData, error: rankingErr }, { data: pillsData, error: pillsErr }, authAdmins] = await Promise.all([
            supabase
                .from('ranking_user')
                .select('nombre,email,quest_points,tests_points,pills_points,pills_rank_pill_id'),
            supabase
                .from('pills')
                .select('id,name')
                .order('name', { ascending: true }),
            invokeAdminFunction('admin-list-users', { role: 'admin' })
        ]);
        if (rankingErr) throw rankingErr;
        if (pillsErr) throw pillsErr;

        const adminEmailSet = new Set(
            (Array.isArray(authAdmins.users) ? authAdmins.users : [])
                .map((u) => String(u.email || '').trim().toLowerCase())
                .filter(Boolean)
        );

        rankingRows = (rankingData || []).filter((r) => {
            const email = String(r.email || '').trim().toLowerCase();
            return email && !adminEmailSet.has(email);
        });

        rankingPillsMap = new Map();
        (pillsData || []).forEach((p) => rankingPillsMap.set(String(p.id), String(p.name || 'Pill')));

        renderRankingPillDropdown();

        renderRankings();
    } catch (e) {
        console.error('loadRankings', e);
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="4" class="error-cell">Error cargando rankings: ${escapeHtml(e.message || String(e))}</td></tr>`;
        }
    }
}

window.setRankingMode = function (mode) {
    rankingMode = ['quest', 'tests', 'pills'].includes(mode) ? mode : 'quest';
    renderRankings();
};

window.handleRankingSearch = function (value) {
    rankingSearchTerm = String(value || '').trim().toLowerCase();
    renderRankings();
};

window.handleRankingPillFilter = function (pillId) {
    rankingPillFilter = String(pillId || '');
    renderRankings();
};

function renderRankingPillDropdown() {
    const menu = document.getElementById('rankings-pill-filter-menu');
    const label = document.getElementById('rankings-pill-filter-label');
    if (!menu || !label) return;

    const currentText = rankingPillFilter && rankingPillsMap.has(rankingPillFilter)
        ? rankingPillsMap.get(rankingPillFilter)
        : 'Todas las pills';
    label.textContent = currentText;

    const items = [
        { id: '', name: 'Todas las pills' },
        ...Array.from(rankingPillsMap.entries()).map(([id, name]) => ({ id, name }))
    ];
    menu.innerHTML = items.map((item) => `
        <button type="button" class="custom-dropdown-item ${String(item.id) === String(rankingPillFilter) ? 'active' : ''}"
            onclick="window.selectRankingPillOption && window.selectRankingPillOption('${escapeHtml(String(item.id))}')">
            ${escapeHtml(String(item.name))}
        </button>
    `).join('');
}

window.toggleRankingPillDropdown = function () {
    const menu = document.getElementById('rankings-pill-filter-menu');
    const wrap = document.getElementById('rankings-pill-filter');
    if (!menu) return;
    const shouldOpen = menu.classList.contains('hidden');
    menu.classList.toggle('hidden', !shouldOpen);
    if (wrap) wrap.classList.toggle('open', shouldOpen);
};

window.closeRankingPillDropdown = function () {
    const menu = document.getElementById('rankings-pill-filter-menu');
    const wrap = document.getElementById('rankings-pill-filter');
    if (!menu) return;
    menu.classList.add('hidden');
    if (wrap) wrap.classList.remove('open');
};

window.selectRankingPillOption = function (pillId) {
    rankingPillFilter = String(pillId || '');
    window.closeRankingPillDropdown();
    renderRankingPillDropdown();
    renderRankings();
};

document.addEventListener('click', (evt) => {
    const wrap = document.getElementById('rankings-pill-filter');
    if (!wrap) return;
    if (!wrap.contains(evt.target)) {
        window.closeRankingPillDropdown && window.closeRankingPillDropdown();
    }
});

// --- Usuarios ---

function setUsersSubViewVisibility() {
    const subToggle = document.getElementById('users-subview-toggle');
    const btnInfo = document.getElementById('btn-users-subview-info');
    const btnTalents = document.getElementById('btn-users-subview-talents');
    const searchWrap = document.getElementById('users-search-wrapper');
    const infoTableCard = document.getElementById('users-table-body')?.closest('.admin-card');
    const talentsCard = document.getElementById('users-talents-view');
    const dynamicCsvBtn = document.getElementById('btn-users-dynamic-csv');
    const tplBtn = document.getElementById('btn-download-talents-template');

    const canUseSubView = currentUserViewMode === 'uixers';
    if (subToggle) subToggle.classList.toggle('hidden', !canUseSubView);
    if (!canUseSubView) usersSubViewMode = 'info';

    if (btnInfo) btnInfo.classList.toggle('active', usersSubViewMode === 'info');
    if (btnTalents) btnTalents.classList.toggle('active', usersSubViewMode === 'talents');

    const showTalents = canUseSubView && usersSubViewMode === 'talents';
    if (searchWrap) searchWrap.classList.toggle('hidden', showTalents);
    if (infoTableCard) infoTableCard.classList.toggle('hidden', showTalents);
    if (talentsCard) talentsCard.classList.toggle('hidden', !showTalents);
    if (dynamicCsvBtn) {
        dynamicCsvBtn.classList.toggle('btn-csv-upload--talents', showTalents);
        dynamicCsvBtn.innerHTML = showTalents
            ? '<i class="fas fa-wand-magic-sparkles"></i> Carga Masiva Talentos (CSV)'
            : '<i class="fas fa-upload"></i> Carga Masiva Usuarios (CSV)';
        dynamicCsvBtn.title = showTalents
            ? 'Importa talentos por email (talento_1..talento_5)'
            : 'Importa usuarios (nombre, correo, no. empleado, etc.)';
    }
    if (tplBtn) tplBtn.classList.toggle('hidden', !showTalents);
}

window.handleDynamicUsersCsvClick = function () {
    if (currentUserViewMode !== 'uixers') {
        document.getElementById('csv-upload')?.click();
        return;
    }
    if (usersSubViewMode === 'talents') {
        document.getElementById('csv-upload-talents')?.click();
    } else {
        document.getElementById('csv-upload')?.click();
    }
};

window.downloadTalentsTemplate = function () {
    const names = (skillsCatalog || []).map((s) => String(s.nombre || '').trim()).filter(Boolean);
    const ex1 = [names[0] || 'Talento Exacto 1', names[1] || 'Talento Exacto 2', '', '', ''];
    const ex2 = [names[2] || 'Talento Exacto 3', names[3] || '', names[4] || '', '', ''];
    const csvRows = [
        'email,talento_1,talento_2,talento_3,talento_4,talento_5',
        `usuario1@empresa.com,${ex1[0]},${ex1[1]},${ex1[2]},${ex1[3]},${ex1[4]}`,
        `usuario2@empresa.com,${ex2[0]},${ex2[1]},${ex2[2]},${ex2[3]},${ex2[4]}`,
        '',
        'CATALOGO_OFICIAL_TALENTOS',
        'nombre_talento'
    ];
    names.forEach((n) => csvRows.push(`"${n.replace(/"/g, '""')}"`));
    const blob = new Blob(["\uFEFF" + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "talentos_plantilla.csv");
    link.click();
    URL.revokeObjectURL(url);
};

function renderTalentOptions(selectedId) {
    const selected = String(selectedId || '');
    const options = [`<option value="">Sin asignar</option>`];
    skillsCatalog.forEach((skill) => {
        const id = String(skill.id || '');
        const name = String(skill.nombre || 'Sin nombre');
        options.push(`<option value="${escapeHtml(id)}" ${selected === id ? 'selected' : ''}>${escapeHtml(name)}</option>`);
    });
    return options.join('');
}

function renderTalentsTable() {
    const tbody = document.getElementById('users-talents-table-body');
    if (!tbody) return;

    if (!Array.isArray(localTalentUsers) || localTalentUsers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="empty-cell">No hay UiXers para asignar talentos.</td></tr>`;
        return;
    }
    if (!Array.isArray(skillsCatalog) || skillsCatalog.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="empty-cell">No hay catálogo de talentos en la tabla habilidades.</td></tr>`;
        return;
    }

    tbody.innerHTML = localTalentUsers.map((u) => `
        <tr class="table-row" data-user-id="${escapeHtml(String(u.user_id || ''))}">
            <td class="td-name">${escapeHtml(String(u.nombre || 'Sin Nombre'))}</td>
            <td>${escapeHtml(String(u.email || ''))}</td>
            <td><select class="talent-select" data-slot="1">${renderTalentOptions(u.habilidad_id_1)}</select></td>
            <td><select class="talent-select" data-slot="2">${renderTalentOptions(u.habilidad_id_2)}</select></td>
            <td><select class="talent-select" data-slot="3">${renderTalentOptions(u.habilidad_id_3)}</select></td>
            <td><select class="talent-select" data-slot="4">${renderTalentOptions(u.habilidad_id_4)}</select></td>
            <td><select class="talent-select" data-slot="5">${renderTalentOptions(u.habilidad_id_5)}</select></td>
            <td class="td-right">
                <button type="button" class="talent-save-btn" onclick="window.saveUserTalents && window.saveUserTalents('${escapeHtml(String(u.user_id || ''))}')">
                    Guardar
                </button>
            </td>
        </tr>
    `).join('');
}

async function loadSkillsCatalog() {
    const data = await invokeAdminFunction('admin-list-skills-catalog', {});
    skillsCatalog = Array.isArray(data.skills) ? data.skills : [];
}

async function loadUiXersForTalents() {
    const data = await invokeAdminFunction('admin-list-uixers', {});
    localTalentUsers = Array.isArray(data.users) ? data.users : [];
}

async function loadTalentsSubview() {
    const tbody = document.getElementById('users-talents-table-body');
    if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="loading-cell"><i class="fas fa-circle-notch animate-spin"></i> Cargando talentos...</td></tr>`;

    try {
        await Promise.all([loadSkillsCatalog(), loadUiXersForTalents()]);
        renderTalentsTable();
    } catch (error) {
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="8" class="error-cell">Error cargando talentos: ${escapeHtml(error.message || String(error))}</td></tr>`;
        }
    }
}

window.toggleUsersSubview = async function (mode) {
    usersSubViewMode = mode === 'talents' ? 'talents' : 'info';
    setUsersSubViewVisibility();
    if (currentUserViewMode === 'uixers' && usersSubViewMode === 'talents') {
        await loadTalentsSubview();
    }
};

function findTalentsTableRow(userId) {
    const uid = String(userId || '').trim();
    const tbody = document.getElementById('users-talents-table-body');
    if (!tbody || !uid) return null;
    // No usar CSS.escape en valores de data-*: rompe UUIDs que empiezan con dígito (p. ej. 73e96fcb-…)
    return Array.from(tbody.querySelectorAll('tr[data-user-id]')).find(
        (tr) => tr.getAttribute('data-user-id') === uid
    ) || null;
}

window.saveUserTalents = async function (userId) {
    console.log('[saveUserTalents] iniciando para userId:', userId);

    const rowEl = findTalentsTableRow(userId);
    if (!rowEl) {
        console.error('[saveUserTalents] fila no encontrada para userId:', userId);
        showToast('No se encontró la fila del usuario. Recarga la vista Talentos e intenta de nuevo.', 'error');
        return;
    }

    const selects = Array.from(rowEl.querySelectorAll('select.talent-select'));
    console.log('[saveUserTalents] selects encontrados:', selects.length);
    if (selects.length !== 5) {
        console.error('[saveUserTalents] se esperaban 5 selects, se encontraron:', selects.length);
        showToast(`Error interno: se esperaban 5 selectores de talento, se encontraron ${selects.length}.`, 'error');
        return;
    }

    const values = selects.map((s) => (s.value || '').trim() || null);
    const onlyValues = values.filter(Boolean);
    console.log('[saveUserTalents] valores seleccionados:', values);

    const unique = new Set(onlyValues);
    if (onlyValues.length !== unique.size) {
        showToast('No puedes asignar el mismo talento más de una vez en la misma fila.', 'warn');
        return;
    }

    const btn = rowEl.querySelector('.talent-save-btn');
    const originalText = btn ? btn.textContent.trim() : 'Guardar';
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Guardando...';
    }

    try {
        console.log('[saveUserTalents] invocando admin-upsert-user-skills con payload:', {
            user_id: userId, habilidad_id_1: values[0], habilidad_id_2: values[1],
            habilidad_id_3: values[2], habilidad_id_4: values[3], habilidad_id_5: values[4],
        });

        const result = await invokeAdminFunction('admin-upsert-user-skills', {
            user_id: userId,
            habilidad_id_1: values[0],
            habilidad_id_2: values[1],
            habilidad_id_3: values[2],
            habilidad_id_4: values[3],
            habilidad_id_5: values[4],
        });

        console.log('[saveUserTalents] respuesta de la función:', result);

        const localRow = localTalentUsers.find((u) => String(u.user_id) === String(userId));
        if (localRow) {
            localRow.habilidad_id_1 = values[0];
            localRow.habilidad_id_2 = values[1];
            localRow.habilidad_id_3 = values[2];
            localRow.habilidad_id_4 = values[3];
            localRow.habilidad_id_5 = values[4];
        }

        showToast(`Talentos guardados correctamente (${onlyValues.length} asignado${onlyValues.length !== 1 ? 's' : ''}).`, 'success');

        // Visual feedback in the button briefly
        if (btn) { btn.textContent = '✓ Guardado'; }
        setTimeout(() => { if (btn) { btn.disabled = false; btn.textContent = originalText; } }, 1500);

    } catch (error) {
        console.error('[saveUserTalents] error al guardar:', error);
        showToast(`Error al guardar talentos: ${error.message || String(error)}`, 'error', 7000);
        if (btn) {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    }
};

window.toggleUserView = function (mode) {
    currentUserViewMode = mode;

    const btnUiXers = document.getElementById('btn-view-uixers');
    const btnAdmins = document.getElementById('btn-view-admins');

    if (mode === 'uixers') {
        btnUiXers.classList.add('active');
        btnAdmins.classList.remove('active');
    } else {
        btnUiXers.classList.remove('active');
        btnAdmins.classList.add('active');
        usersSubViewMode = 'info';
    }
    setUsersSubViewVisibility();
    loadUsers();
};

window.loadUsers = async function () {
    setUsersSubViewVisibility();
    if (currentUserViewMode === 'uixers' && usersSubViewMode === 'talents') {
        await loadTalentsSubview();
        return;
    }
    const loadingColspan = currentUserViewMode === 'uixers' ? 11 : 9;
    document.getElementById('users-table-body').innerHTML =
        `<tr><td colspan="${loadingColspan}" class="loading-cell"><i class="fas fa-circle-notch animate-spin"></i> Cargando...</td></tr>`;

    try {
        const collectionName = "ranking_user";
        const q = query(collection(db, collectionName));
        const querySnapshot = await getDocs(q);

        localUsers = [];
        let totalUsers = 0, maxScore = 0;
        const rankingByEmail = new Map();

        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const emailKey = String(data.email || '').trim().toLowerCase();
            if (emailKey) rankingByEmail.set(emailKey, data);
        });

        if (currentUserViewMode === 'admins') {
            const authAdmins = await invokeAdminFunction('admin-list-users', { role: 'admin' });
            const authUsers = Array.isArray(authAdmins.users) ? authAdmins.users : [];
            authUsers.forEach((authUser) => {
                const email = String(authUser.email || '').trim().toLowerCase();
                if (!email) return;
                const ranking = rankingByEmail.get(email) || {};
                localUsers.push({
                    docId: email,
                    name: authUser.nombre || ranking.nombre || email.split('@')[0],
                    email,
                    role: 'admin',
                    emp_id: ranking.emp_id || '',
                    especialidad: ranking.especialidad || '',
                    seniority: ranking.seniority || '',
                    initial_password: ranking.initial_password || '',
                    fecha: ranking.fecha || authUser.created_at || null
                });
                totalUsers++;
            });
        } else {
            querySnapshot.forEach((docSnap) => {
                const data = docSnap.data();
                const role = String(data.role || 'user').toLowerCase();
                if (role === 'admin') return;
                localUsers.push({ docId: data.email || docSnap.id, ...data });
                totalUsers++;
                const practiceBest = Number(data.quest_points ?? data.puntos ?? 0);
                if (practiceBest > maxScore) maxScore = practiceBest;
            });
            // Evitar duplicados: si el correo es admin en Auth, no debe aparecer en UiXers.
            const authAdmins = await invokeAdminFunction('admin-list-users', { role: 'admin' });
            const adminEmailSet = new Set(
                (Array.isArray(authAdmins.users) ? authAdmins.users : [])
                    .map((u) => String(u.email || '').trim().toLowerCase())
                    .filter(Boolean)
            );

            localUsers = localUsers.filter((u) => {
                const email = String(u.email || '').trim().toLowerCase();
                return !adminEmailSet.has(email);
            });
            totalUsers = localUsers.length;
        }

        document.getElementById('stat-total-users').innerText = totalUsers;
        document.getElementById('stat-top-score').innerText = maxScore;
        renderUsers();

    } catch (error) {
        console.error(error);
        const errorColspan = currentUserViewMode === 'uixers' ? 11 : 9;
        document.getElementById('users-table-body').innerHTML =
            `<tr><td colspan="${errorColspan}" class="error-cell">Error cargando datos: ${error.message}</td></tr>`;
    }
};

window.downloadUsersCSV = function () {
    if (!localUsers || localUsers.length === 0) { alert("No hay usuarios para descargar"); return; }

    const checkboxes = document.querySelectorAll('.user-checkbox:checked');
    const selectedDocIds = Array.from(checkboxes).map(cb => cb.value);
    const usersToDownload = checkboxes.length > 0
        ? localUsers.filter(u => selectedDocIds.includes(u.docId))
        : localUsers;

    // Exportar todas las columnas existentes en la base para la vista actual.
    const keysSet = new Set();
    usersToDownload.forEach((u) => Object.keys(u).forEach((k) => keysSet.add(k)));
    const hiddenInternalKeys = new Set(['docId']);
    let allKeys = Array.from(keysSet).filter((k) => !hiddenInternalKeys.has(k));
    // Eliminar clave legacy con mayúscula si ya existe la versión normalizada
    if (allKeys.includes('especialidad') && allKeys.includes('Especialidad')) {
        allKeys = allKeys.filter((k) => k !== 'Especialidad');
    }

    // Orden sugerido para legibilidad; luego anexamos el resto de campos dinámicos.
    const preferredOrder = currentUserViewMode === 'uixers'
        ? ['nombre', 'emp_id', 'email', 'initial_password', 'seniority', 'especialidad', 'puntos', 'fecha']
        : ['nombre', 'emp_id', 'email', 'initial_password', 'seniority', 'especialidad', 'fecha'];
    const orderedKeys = [
        ...preferredOrder.filter((k) => allKeys.includes(k)),
        ...allKeys.filter((k) => !preferredOrder.includes(k)).sort()
    ];

    const csvRows = [orderedKeys.join(",")];

    const normalizeValueForCsv = (value) => {
        if (value == null) return '';
        if (typeof value === 'object') {
            if (value?.toDate && typeof value.toDate === 'function') {
                return value.toDate().toISOString();
            }
            if (typeof value?.seconds === 'number') {
                return new Date(value.seconds * 1000).toISOString();
            }
            return JSON.stringify(value);
        }
        return String(value);
    };

    usersToDownload.forEach((user) => {
        const row = orderedKeys.map((key) => {
            const cell = key === 'especialidad' ? (user.especialidad ?? user.Especialidad) : user[key];
            const raw = normalizeValueForCsv(cell);
            return `"${raw.replace(/"/g, '""')}"`;
        });
        csvRows.push(row.join(","));
    });

    const blob = new Blob(["\uFEFF" + csvRows.join("\n")], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "usuarios_uxlingo.csv");
    link.click();
    document.body.removeChild(link);
};

window.handleCSVUpload = async function(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function(e) {
        const buffer = e.target.result;
        let text;
        try {
            text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
        } catch (err) {
            text = new TextDecoder("windows-1252").decode(buffer);
        }
        text = text.replace(/^\uFEFF/, '');
        const rows = splitCsvRecords(text).map((r) => r.trim()).filter((r) => r.length > 0);

        if (rows.length < 2) {
            alert("El archivo CSV debe contener al menos una fila de encabezados y una fila de datos.");
            return;
        }

        const headers = parseCsvRowCells(rows[0]).map((h) => h.trim().toLowerCase());

        const { emailIdx, nameIdx, idIdx, passIdx, seniorityIdx, especialidadIdx } = resolveUserCsvColumnIndices(headers);

        if (nameIdx === -1 || emailIdx === -1 || idIdx === -1) {
            alert("El CSV debe tener columnas para: Nombre, ID (o Empleado), y Correo.");
            return;
        }

        const btn = document.getElementById('btn-users-dynamic-csv');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-circle-notch animate-spin"></i> Cargando...';
        btn.disabled = true;

        try {
            const payloadRows = [];
            for (let i = 1; i < rows.length; i++) {
                const cols = parseCsvRowCells(rows[i]);
                const name = (cols[nameIdx] != null ? cols[nameIdx] : '').trim();
                const email = (cols[emailIdx] || '').trim().toLowerCase();
                const empIdRaw = (cols[idIdx] != null ? cols[idIdx] : '').trim();
                const pass = passIdx !== -1 ? (cols[passIdx] || '').trim() : '';
                const seniorityRaw = seniorityIdx !== -1 ? cols[seniorityIdx] : 'junior';
                const especialidad =
                    especialidadIdx !== -1 && cols[especialidadIdx] != null
                        ? String(cols[especialidadIdx]).trim()
                        : '';
                payloadRows.push({
                    nombre: name,
                    email,
                    empId: empIdRaw || (email ? `id-${email.split('@')[0]}` : ''),
                    seniority: normalizeUserSeniority(seniorityRaw),
                    especialidad,
                    password: pass,
                    role: 'user'
                });
            }

            const preview = await invokeAdminFunction('admin-upsert-users', {
                mode: 'preview',
                defaults: { forcePasswordChange: true, generatePasswordIfMissing: true },
                conflictStrategy: 'skip',
                rows: payloadRows
            });
            const selectedStrategy = await askCsvConflictStrategy(preview.summary?.conflicts || 0);
            const execute = await invokeAdminFunction('admin-upsert-users', {
                mode: 'execute',
                defaults: { forcePasswordChange: true, generatePasswordIfMissing: true },
                conflictStrategy: selectedStrategy,
                rows: payloadRows
            });

            const detailLines = [];
            let created = 0;
            let updated = 0;
            let updatedAndReset = 0;
            let recreated = 0;
            let skipped = 0;
            (execute.rows || []).forEach((r) => {
                if (r.status === 'created') created++;
                if (r.status === 'updated') {
                    if (r.action === 'update_and_reset_password') updatedAndReset++;
                    else if (r.action === 'recreate_auth') recreated++;
                    else updated++;
                }
                if (r.status === 'skipped') skipped++;
                if (r.status === 'failed' || r.status === 'invalid') {
                    detailLines.push(`Fila ${r.idx || '-'} (${r.email || 'sin correo'}): ${r.message || r.reason || 'error'}`);
                } else if (r.generatedPassword) {
                    detailLines.push(`Fila ${r.idx || '-'} (${r.email}): contraseña temporal = ${r.generatedPassword}`);
                } else if (r.status === 'skipped') {
                    detailLines.push(`Fila ${r.idx || '-'} (${r.email || 'sin correo'}): omitida (${r.reason || 'exists'})`);
                }
            });
            const stats = {
                ok: Number(execute.summary?.created || 0) + Number(execute.summary?.updated || 0),
                dupFile: Number(execute.rows?.filter((r) => r.reason === 'duplicate_in_payload').length || 0),
                dupDb: Number(execute.summary?.skipped || 0),
                emailConflict: 0,
                invalid: Number(execute.summary?.invalid || 0),
                technicalErrors: Number(execute.summary?.failed || 0),
                created,
                updated,
                updatedAndReset,
                recreated,
                skipped,
                strategy: selectedStrategy,
                detailLines,
                totalDataRows: rows.length - 1
            };
            showCsvUserImportModal(stats);
            loadUsers();
        } catch (err) {
            alert(`Error en carga masiva: ${err?.message || err}`);
            console.error('handleCSVUpload', err);
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
            event.target.value = '';
        }
    };

    reader.readAsArrayBuffer(file);
};

window.handleTalentsCSVUpload = async function(event) {
    const file = event.target.files[0];
    if (!file) return;

    const btn = document.getElementById('btn-users-dynamic-csv');
    const originalText = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-circle-notch animate-spin"></i> Cargando talentos...';
    }

    const reader = new FileReader();
    reader.onload = async function(e) {
        const buffer = e.target.result;
        let text;
        try {
            text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
        } catch {
            text = new TextDecoder("windows-1252").decode(buffer);
        }
        text = text.replace(/^\uFEFF/, '');
        const rows = splitCsvRecords(text).map((r) => r.trim()).filter((r) => r.length > 0);

        if (rows.length < 2) {
            alert("El CSV de talentos debe incluir encabezados y al menos una fila.");
            if (btn) { btn.disabled = false; btn.innerHTML = originalText; }
            event.target.value = '';
            return;
        }

        const headers = parseCsvRowCells(rows[0]).map((h) => h.trim().toLowerCase());
        const { emailIdx, t1, t2, t3, t4, t5 } = resolveTalentsCsvColumnIndices(headers);
        if (emailIdx === -1) {
            alert('El CSV de talentos debe contener columna "email".');
            if (btn) { btn.disabled = false; btn.innerHTML = originalText; }
            event.target.value = '';
            return;
        }

        const payloadRows = [];
        for (let i = 1; i < rows.length; i++) {
            const cols = parseCsvRowCells(rows[i]);
            const email = String(cols[emailIdx] || '').trim().toLowerCase();
            if (!email) continue;
            payloadRows.push({
                email,
                talento_1: t1 !== -1 ? String(cols[t1] || '').trim() : '',
                talento_2: t2 !== -1 ? String(cols[t2] || '').trim() : '',
                talento_3: t3 !== -1 ? String(cols[t3] || '').trim() : '',
                talento_4: t4 !== -1 ? String(cols[t4] || '').trim() : '',
                talento_5: t5 !== -1 ? String(cols[t5] || '').trim() : '',
            });
        }

        if (payloadRows.length === 0) {
            alert('No hay filas válidas para importar talentos.');
            if (btn) { btn.disabled = false; btn.innerHTML = originalText; }
            event.target.value = '';
            return;
        }

        try {
            const preview = await invokeAdminFunction('admin-upsert-user-skills-csv', { mode: 'preview', rows: payloadRows });
            const execute = await invokeAdminFunction('admin-upsert-user-skills-csv', { mode: 'execute', rows: payloadRows });

            const detailLines = [];
            (execute.rows || []).forEach((r) => {
                if (r.status === 'failed' || r.status === 'invalid') {
                    detailLines.push(`Fila ${r.idx || '-'} (${r.email || 'sin correo'}): ${r.message || 'error'}`);
                } else if (r.status === 'skipped') {
                    detailLines.push(`Fila ${r.idx || '-'} (${r.email || 'sin correo'}): omitida (${r.reason || 'skip'})`);
                }
            });

            const stats = {
                ok: Number(execute.summary?.updated || 0),
                dupFile: Number(execute.summary?.duplicate_in_payload || 0),
                dupDb: Number(execute.summary?.skipped || 0),
                emailConflict: 0,
                invalid: Number(execute.summary?.invalid || 0),
                technicalErrors: Number(execute.summary?.failed || 0),
                created: 0,
                updated: Number(execute.summary?.updated || 0),
                updatedAndReset: 0,
                recreated: 0,
                skipped: Number(execute.summary?.skipped || 0),
                strategy: 'talentos_csv',
                detailLines,
                totalDataRows: payloadRows.length
            };
            showCsvUserImportModal(stats);
            await loadTalentsSubview();
        } catch (err) {
            alert(`Error en carga masiva de talentos: ${err?.message || err}`);
            console.error('handleTalentsCSVUpload', err);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
            event.target.value = '';
        }
    };
    reader.readAsArrayBuffer(file);
};

window.syncCurrentUsersToAuth = async function () {
    if (!localUsers || localUsers.length === 0) {
        alert("No hay usuarios cargados para sincronizar.");
        return;
    }

    const type = currentUserViewMode === 'uixers' ? 'participantes' : 'administradores';
    const confirmed = confirm(`Se intentará sincronizar ${localUsers.length} ${type} con Firebase Authentication.\n\n¿Deseas continuar?`);
    if (!confirmed) return;

    const btn = document.getElementById('btn-sync-auth');
    const originalText = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-circle-notch animate-spin"></i> Sincronizando...';
    }

    let created = 0;
    let alreadyExists = 0;
    let generatedPassword = 0;
    const failed = [];

    try {
        for (const user of localUsers) {
            const email = (user.email || '').trim().toLowerCase();
            let pass = (user.initial_password || user.password || '').toString().trim();

            if (!email) {
                failed.push(`(sin correo): registro inválido`);
                continue;
            }

            // Auth exige mínimo 6 caracteres; si no hay contraseña válida, generamos una temporal y la persistimos.
            if (!pass || pass.length < 6) {
                pass = generateTemporaryUserPassword(user.nombre || user.name || 'usr');

                try {
                    const collectionName = 'ranking_user';
                    await updateDoc(doc(db, collectionName, user.docId), {
                        password: pass,
                        initial_password: pass
                    });
                    generatedPassword++;
                } catch (persistErr) {
                    failed.push(`${email}: no se pudo guardar contraseña temporal (${persistErr.message})`);
                    continue;
                }
            }

            try {
                const authResult = await createAuthUserByEmailPassword(email, pass);
                if (authResult.status === 'created') {
                    created++;
                } else if (authResult.status === 'exists') {
                    alreadyExists++;
                } else {
                    failed.push(`${email}: ${authResult.message}`);
                }
            } catch (e) {
                failed.push(`${email}: ${e.message}`);
            }
        }
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    }

    let msg = `Sincronización finalizada.\n\nCreados en Authentication: ${created}\nYa existentes: ${alreadyExists}\nContraseña temporal generada: ${generatedPassword}`;
    if (failed.length > 0) {
        msg += `\nCon error: ${failed.length}\n\n${failed.slice(0, 5).join('\n')}`;
        if (failed.length > 5) msg += `\n... y ${failed.length - 5} errores más.`;
    }
    alert(msg);

    if (generatedPassword > 0 || created > 0) {
        loadUsers();
    }
};

window.toggleAllUsers = function (source) {
    document.querySelectorAll('.user-checkbox').forEach(cb => cb.checked = source.checked);
    updateUserBulkActionsState();
};

window.handleUserSelectionChange = function () {
    updateUserBulkActionsState();
};

function updateUserBulkActionsState() {
    const checkboxes = Array.from(document.querySelectorAll('.user-checkbox'));
    const checkedCount = checkboxes.filter(cb => cb.checked).length;
    const deleteBtn = document.getElementById('btn-delete-users');
    const selectAll = document.getElementById('select-all-users');

    if (deleteBtn) deleteBtn.disabled = checkedCount === 0;

    if (selectAll) {
        selectAll.checked = checkboxes.length > 0 && checkedCount === checkboxes.length;
        selectAll.indeterminate = checkedCount > 0 && checkedCount < checkboxes.length;
    }
}

window.handleUserSearch = function (val) {
    userSearchTerm = val.toLowerCase().trim();
    renderUsers();
};

window.sortUsers = function (col) {
    if (userSort.col === col) {
        userSort.dir = userSort.dir === 'asc' ? 'desc' : 'asc';
    } else {
        userSort.col = col;
        userSort.dir =
            col === 'nombre' || col === 'emp_id' || col === 'name' || col === 'especialidad' || col === 'email' || col === 'seniority'
                ? 'asc'
                : 'desc';
    }
    renderUsers();
};

window.renderUsers = function () {
    const thead = document.getElementById('users-table-head');

    if (currentUserViewMode === 'uixers') {
        thead.innerHTML = `
            <tr class="table-header-row">
                <th style="width:1rem;padding:1rem">
                    <input type="checkbox" id="select-all-users" onclick="window.toggleAllUsers && window.toggleAllUsers(this)" class="checkbox-accent">
                </th>
                <th class="sortable" onclick="window.sortUsers && window.sortUsers('nombre')">Usuario <i id="sort-icon-nombre" class="fas fa-sort sort-icon sort-icon--inactive"></i></th>
                <th class="sortable" onclick="window.sortUsers && window.sortUsers('email')">Correo <i id="sort-icon-email" class="fas fa-sort sort-icon sort-icon--inactive"></i></th>
                <th class="sortable" onclick="window.sortUsers && window.sortUsers('password')">Contraseña <i id="sort-icon-password" class="fas fa-sort sort-icon sort-icon--inactive"></i></th>
                <th class="sortable" onclick="window.sortUsers && window.sortUsers('emp_id')">No. Empleado <i id="sort-icon-emp_id" class="fas fa-sort sort-icon sort-icon--inactive"></i></th>
                <th class="sortable align-center" onclick="window.sortUsers && window.sortUsers('seniority')">Seniority <i id="sort-icon-seniority" class="fas fa-sort sort-icon sort-icon--inactive"></i></th>
                <th class="sortable" onclick="window.sortUsers && window.sortUsers('especialidad')">Especialidad <i id="sort-icon-especialidad" class="fas fa-sort sort-icon sort-icon--inactive"></i></th>
                <th class="sortable align-center" onclick="window.sortUsers && window.sortUsers('quest_points')">Quest <i id="sort-icon-quest_points" class="fas fa-sort sort-icon sort-icon--inactive"></i></th>
                <th class="sortable align-center" onclick="window.sortUsers && window.sortUsers('tests_points')">Tests <i id="sort-icon-tests_points" class="fas fa-sort sort-icon sort-icon--inactive"></i></th>
                <th class="sortable align-center" onclick="window.sortUsers && window.sortUsers('pills_points')">Pills <i id="sort-icon-pills_points" class="fas fa-sort sort-icon sort-icon--inactive"></i></th>
                <th class="align-right">Acciones</th>
            </tr>`;
        userSort.col = userSort.col || 'quest_points';
    } else {
        thead.innerHTML = `
            <tr class="table-header-row">
                <th style="width:1rem;padding:1rem">
                    <input type="checkbox" id="select-all-users" onclick="window.toggleAllUsers && window.toggleAllUsers(this)" class="checkbox-accent">
                </th>
                <th class="sortable" onclick="window.sortUsers && window.sortUsers('name')">Nombre <i id="sort-icon-name" class="fas fa-sort sort-icon sort-icon--inactive"></i></th>
                <th class="sortable" onclick="window.sortUsers && window.sortUsers('email')">Correo <i id="sort-icon-email" class="fas fa-sort sort-icon sort-icon--inactive"></i></th>
                <th class="sortable" onclick="window.sortUsers && window.sortUsers('password')">Contraseña <i id="sort-icon-password" class="fas fa-sort sort-icon sort-icon--inactive"></i></th>
                <th class="sortable" onclick="window.sortUsers && window.sortUsers('emp_id')">No. Empleado <i id="sort-icon-emp_id" class="fas fa-sort sort-icon sort-icon--inactive"></i></th>
                <th class="align-center">Rol</th>
                <th class="sortable" onclick="window.sortUsers && window.sortUsers('especialidad')">Especialidad <i id="sort-icon-especialidad" class="fas fa-sort sort-icon sort-icon--inactive"></i></th>
                <th class="align-center">Creado</th>
                <th class="align-right">Acciones</th>
            </tr>`;
        if (['puntos', 'tiempo', 'quest_points', 'tests_points', 'pills_points'].includes(userSort.col)) userSort.col = 'name';
    }

    // Filtrar
    let filtered = localUsers;
    if (userSearchTerm) {
        filtered = filtered.filter((u) => {
            const esp = (u.especialidad || u.Especialidad || '').toLowerCase();
            const name = (u.nombre || u.name || '').toLowerCase();
            const idVal = (u.emp_id || '').toString().toLowerCase();
            const mail = (u.email || '').toLowerCase();
            return (
                name.includes(userSearchTerm) ||
                idVal.includes(userSearchTerm) ||
                mail.includes(userSearchTerm) ||
                esp.includes(userSearchTerm)
            );
        });
    }

    // Ordenar
    filtered.sort((a, b) => {
        let valA = getUserTableSortValue(a, userSort.col);
        let valB = getUserTableSortValue(b, userSort.col);
        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();
        if (valA < valB) return userSort.dir === 'asc' ? -1 : 1;
        if (valA > valB) return userSort.dir === 'asc' ? 1 : -1;
        return 0;
    });

    // Generar filas
    const html = filtered.map(data => {
        const safeDocId = escapeHtml(String(data.docId || ''));
        if (currentUserViewMode === 'uixers') {
            return `
                <tr class="table-row">
                    <td style="padding:1rem"><input type="checkbox" class="user-checkbox checkbox-accent" value="${safeDocId}" onchange="window.handleUserSelectionChange && window.handleUserSelectionChange()"></td>
                    <td class="td-name">${escapeHtml(String(data.nombre || 'Sin Nombre'))}</td>
                    <td>${escapeHtml(String(data.email || ''))}</td>
                    <td class="td-mono td-password-masked" title="Clic para revelar" onclick="this.classList.toggle('td-password-revealed')" data-pass="${escapeHtml(String(data.initial_password || data.password || '---'))}">••••••••</td>
                    <td class="td-mono">${escapeHtml(String(data.emp_id || '-'))}</td>
                    <td class="td-center">${escapeHtml(String(data.seniority || '-'))}</td>
                    <td>${escapeHtml(data.especialidad || data.Especialidad || '—')}</td>
                    <td class="td-center"><span class="badge-score">${Number(data.quest_points || 0)} pts</span></td>
                    <td class="td-center"><span class="badge-score">${Number(data.tests_points || 0)} pts</span></td>
                    <td class="td-center"><span class="badge-score">${Number(data.pills_points || 0)} pts</span></td>
                    <td class="td-right">
                        <button data-doc-id="${safeDocId}" onclick="window.openEditUserModal && window.openEditUserModal(this.dataset.docId)" class="row-action-btn row-action-btn--edit" title="Editar usuario"><i class="fas fa-edit"></i></button>
                        <button data-doc-id="${safeDocId}" onclick="window.deleteUser && window.deleteUser(this.dataset.docId)" class="row-action-btn row-action-btn--delete" title="Borrar usuario y bloquear acceso"><i class="fas fa-trash-alt"></i></button>
                    </td>
                </tr>`;
        } else {
            return `
                <tr class="table-row">
                    <td style="padding:1rem"><input type="checkbox" class="user-checkbox checkbox-accent" value="${safeDocId}" onchange="window.handleUserSelectionChange && window.handleUserSelectionChange()"></td>
                    <td class="td-name">${escapeHtml(String(data.name || 'Sin Nombre'))}</td>
                    <td>${escapeHtml(String(data.email || ''))}</td>
                    <td class="td-mono td-password-masked" title="Clic para revelar" onclick="this.classList.toggle('td-password-revealed')" data-pass="${escapeHtml(String(data.initial_password || data.password || '---'))}">••••••••</td>
                    <td class="td-mono">${escapeHtml(String(data.emp_id || '-'))}</td>
                    <td class="td-center"><span class="badge-role">${escapeHtml(String(data.role || ''))}</span></td>
                    <td>${escapeHtml(data.especialidad || data.Especialidad || '—')}</td>
                    <td class="td-center td-muted">${formatDateForUserTable(data.createdAt || data.fecha)}</td>
                    <td class="td-right">
                        <button data-doc-id="${safeDocId}" onclick="window.openEditUserModal && window.openEditUserModal(this.dataset.docId)" class="row-action-btn row-action-btn--edit" title="Editar usuario"><i class="fas fa-edit"></i></button>
                        <button data-doc-id="${safeDocId}" onclick="window.deleteUser && window.deleteUser(this.dataset.docId)" class="row-action-btn row-action-btn--delete" title="Borrar admin y bloquear acceso"><i class="fas fa-trash-alt"></i></button>
                    </td>
                </tr>`;
        }
    }).join('');

    document.getElementById('users-table-body').innerHTML =
        html || `<tr><td colspan="${currentUserViewMode === 'uixers' ? 11 : 9}" class="empty-cell">No se encontraron usuarios</td></tr>`;

    // Actualizar íconos de orden
    const sortCols = currentUserViewMode === 'uixers'
        ? ['nombre', 'email', 'password', 'emp_id', 'seniority', 'especialidad', 'quest_points', 'tests_points', 'pills_points']
        : ['name', 'email', 'password', 'emp_id', 'especialidad'];

    sortCols.forEach(col => {
        const icon = document.getElementById(`sort-icon-${col}`);
        const th = icon?.parentElement;
        if (!icon) return;
        if (userSort.col === col) {
            icon.className = `fas fa-sort-${userSort.dir === 'asc' ? 'up' : 'down'} sort-icon sort-icon--active`;
            th?.classList.add('th-sorted');
        } else {
            icon.className = 'fas fa-sort sort-icon sort-icon--inactive';
            th?.classList.remove('th-sorted');
        }
    });

    updateUserBulkActionsState();
};

function setAddUserModalStatus(message, type = 'error') {
    const el = document.getElementById('modal-add-user-status');
    if (!el) return;
    el.textContent = message || '';
    el.className = 'modal-form-status';
    if (!message) {
        el.classList.add('modal-form-status--empty');
    } else if (type === 'success') {
        el.classList.add('modal-form-status--success');
    } else if (type === 'info') {
        el.classList.add('modal-form-status--info');
    } else {
        el.classList.add('modal-form-status--error');
    }
}

window.clearAddUserModalStatus = function () {
    setAddUserModalStatus('', 'empty');
};

window.openAddUserModal = function () {
    const m = document.getElementById('modal-add-user');
    if (m) m.classList.remove('hidden');
    setAddUserModalStatus('', 'empty');
    fillEspecialidadSelect(document.getElementById('new-user-especialidad'), '');
    const btn = document.getElementById('btn-save-new-user');
    if (btn) {
        btn.disabled = false;
        btn.removeAttribute('aria-busy');
        btn.textContent = 'Guardar';
    }
};

window.openAddUserEntryModal = function () {
    const m = document.getElementById('modal-add-user-entry');
    if (m) m.classList.remove('hidden');
};

window.closeAddUserEntryModal = function () {
    const m = document.getElementById('modal-add-user-entry');
    if (m) m.classList.add('hidden');
};

window.startAddUserManual = function () {
    window.closeAddUserEntryModal();
    window.showTab && window.showTab('users');
    window.toggleUserView && window.toggleUserView('uixers');
    window.toggleUsersSubview && window.toggleUsersSubview('info');
    window.openAddUserModal && window.openAddUserModal();
};

window.startAddUserCsv = function () {
    window.closeAddUserEntryModal();
    window.showTab && window.showTab('users');
    window.toggleUserView && window.toggleUserView('uixers');
    window.toggleUsersSubview && window.toggleUsersSubview('info');
    setTimeout(() => {
        document.getElementById('csv-upload')?.click();
    }, 50);
};

window.saveUser = async function () {
    const btn = document.getElementById('btn-save-new-user');
    const name = (document.getElementById('new-user-name')?.value || '').trim();
    const emailRaw = (document.getElementById('new-user-email')?.value || '').trim();
    const email = emailRaw.toLowerCase();
    let empId = (document.getElementById('new-user-empid')?.value || '').trim();
    let pass = (document.getElementById('new-user-pass')?.value || '').trim();
    const role = document.getElementById('new-user-role')?.value || 'user';
    const selectedSeniority = getSelectedNewUserSeniority();
    const especialidad = (document.getElementById('new-user-especialidad')?.value || '').trim();

    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

    if (!name) {
        setAddUserModalStatus('Falta el nombre completo.', 'error');
        return;
    }
    if (!emailRaw) {
        setAddUserModalStatus('Falta el correo electrónico.', 'error');
        return;
    }
    if (!emailOk) {
        setAddUserModalStatus('El correo no tiene un formato válido (ejemplo: nombre@empresa.com).', 'error');
        return;
    }

    if (!empId && email) {
        empId = `id-${email.split('@')[0]}`;
    }

    if (!pass || pass.length < 6) {
        if (name.length >= 2) {
            pass = generateTemporaryUserPassword(name);
            const passInput = document.getElementById('new-user-pass');
            if (passInput) passInput.value = pass;
        }
    }

    if (!pass || pass.length < 6) {
        setAddUserModalStatus(
            'No se pudo generar la contraseña temporal: escribe al menos 2 letras en el nombre (o 3+ para el formato UiX) para autogenerar, o revisa que el campo de contraseña no esté vacío.',
            'error'
        );
        return;
    }

    if (btn) {
        btn.disabled = true;
        btn.setAttribute('aria-busy', 'true');
        btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Guardando…';
    }
    setAddUserModalStatus('Conectando con Supabase Auth…', 'info');

    try {
        const result = await invokeAdminFunction('admin-upsert-users', {
            mode: 'execute',
            defaults: { forcePasswordChange: true, generatePasswordIfMissing: true },
            conflictStrategy: 'skip',
            rows: [{
                nombre: name,
                email,
                empId,
                seniority: selectedSeniority,
                especialidad,
                password: pass,
                role
            }]
        });
        const row0 = result.rows?.[0] || {};
        if (row0.status === 'skipped') {
            throw new Error('Ese correo ya existe. Usa edición/carga masiva con estrategia de actualización.');
        }
        if (row0.status === 'failed' || row0.status === 'invalid') {
            throw new Error(row0.message || 'No se pudo crear el usuario.');
        }

        setAddUserModalStatus('Usuario creado correctamente.', 'success');
        document.getElementById('modal-add-user').classList.add('hidden');
        ['new-user-name', 'new-user-email', 'new-user-empid', 'new-user-pass'].forEach((id) => {
            const inp = document.getElementById(id);
            if (inp) inp.value = '';
        });
        fillEspecialidadSelect(document.getElementById('new-user-especialidad'), '');
        const defaultNewSeniority = document.querySelector('input[name="new-user-seniority"][value="junior"]');
        if (defaultNewSeniority) defaultNewSeniority.checked = true;
        const roleSel = document.getElementById('new-user-role');
        if (roleSel) roleSel.value = 'user';
        window.handleNewUserRoleChange();
        setAddUserModalStatus('', 'empty');
        if (typeof window.loadUsers === 'function') await window.loadUsers();

    } catch (e) {
        const msg = e && e.message ? e.message : String(e);
        setAddUserModalStatus(`Error: ${msg}`, 'error');
        console.error('saveUser', e);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.removeAttribute('aria-busy');
            btn.textContent = 'Guardar';
        }
    }
};

window.openEditUserModal = function (docId) {
    const user = localUsers.find(u => u.docId === docId);
    if (!user) return;

    document.getElementById('edit-user-docid').value = docId;
    document.getElementById('edit-user-email').value = user.email;

    if (currentUserViewMode === 'uixers') {
        document.getElementById('edit-user-name').value = user.nombre || '';
        document.getElementById('edit-user-empid').value = user.emp_id || '';
        document.getElementById('edit-user-role').value = 'user';
    } else {
        document.getElementById('edit-user-name').value = user.name || '';
        document.getElementById('edit-user-empid').value = user.emp_id || '';
        document.getElementById('edit-user-role').value = 'admin';
    }
    fillEspecialidadSelect(
        document.getElementById('edit-user-especialidad'),
        user.especialidad || user.Especialidad || ''
    );

    const seniority = normalizeUserSeniority(user.seniority || 'junior');
    const seniorityInput = document.querySelector(`input[name="edit-user-seniority"][value="${seniority}"]`);
    if (seniorityInput) seniorityInput.checked = true;
    window.handleEditUserRoleChange();

    document.getElementById('modal-edit-user').classList.remove('hidden');
};

window.handleEditUserRoleChange = function () {
    const role = document.getElementById('edit-user-role')?.value;
    const seniorityGroup = document.getElementById('edit-user-seniority-group');
    if (!seniorityGroup) return;
    seniorityGroup.classList.toggle('hidden', role !== 'user');
};

function normalizeUserSeniority(value) {
    const v = (value || '').toString().toLowerCase().trim();
    if (v === 'medium' || v === 'mid' || v === 'medio') return 'medium';
    if (v === 'senior' || v === 'sr') return 'senior';
    return 'junior';
}

function getUserTableSortValue(u, col) {
    if (col === 'especialidad') return u.especialidad ?? u.Especialidad ?? '';
    if (col === 'emp_id') return u.emp_id ?? '';
    if (col === 'quest_points') return Number(u.quest_points ?? 0);
    if (col === 'tests_points') return Number(u.tests_points ?? 0);
    if (col === 'pills_points') return Number(u.pills_points ?? 0);
    const v = u[col];
    return v != null ? v : '';
}

const ESPECIALIDAD_OPTIONS = ['UX/UI', 'UX RESEARCH', 'UI DESIGN'];

/** Rellena el select de especialidad; si el valor guardado no está en la lista, añade una opción temporal. */
function fillEspecialidadSelect(selectEl, currentValue) {
    if (!selectEl) return;
    const cur = (currentValue || '').trim();
    selectEl.innerHTML = '';
    const optEmpty = document.createElement('option');
    optEmpty.value = '';
    optEmpty.textContent = 'Sin especificar';
    selectEl.appendChild(optEmpty);
    ESPECIALIDAD_OPTIONS.forEach((label) => {
        const o = document.createElement('option');
        o.value = label;
        o.textContent = label;
        selectEl.appendChild(o);
    });
    if (cur && !ESPECIALIDAD_OPTIONS.includes(cur)) {
        const o = document.createElement('option');
        o.value = cur;
        o.textContent = `${cur} (valor actual)`;
        selectEl.appendChild(o);
    }
    selectEl.value = cur || '';
}

function getSelectedEditUserSeniority() {
    const checked = document.querySelector('input[name="edit-user-seniority"]:checked');
    return normalizeUserSeniority(checked?.value || 'junior');
}

window.handleNewUserRoleChange = function () {
    const role = document.getElementById('new-user-role')?.value;
    const seniorityGroup = document.getElementById('new-user-seniority-group');
    if (!seniorityGroup) return;
    seniorityGroup.classList.toggle('hidden', role !== 'user');
};

function getSelectedNewUserSeniority() {
    const checked = document.querySelector('input[name="new-user-seniority"]:checked');
    return normalizeUserSeniority(checked?.value || 'junior');
}

window.saveEditedUser = async function () {
    const docId = document.getElementById('edit-user-docid').value;
    const email = document.getElementById('edit-user-email').value;
    const name = document.getElementById('edit-user-name').value;
    const empId = document.getElementById('edit-user-empid').value;
    const newRole = document.getElementById('edit-user-role').value;
    const selectedSeniority = getSelectedEditUserSeniority();
    const especialidad = (document.getElementById('edit-user-especialidad')?.value || '').trim();

    if (!name || !empId) return alert("Nombre e ID son obligatorios");

    const currentRole = currentUserViewMode === 'uixers' ? 'user' : 'admin';
    const collectionName = "ranking_user";

    try {
        if (newRole === currentRole) {
            // El rol no cambia, solo actualizamos datos
            const updateData = currentUserViewMode === 'uixers'
                ? { nombre: name, emp_id: empId, seniority: selectedSeniority, especialidad }
                : { nombre: name, name, emp_id: empId, especialidad, role: 'admin' };
            await updateDoc(doc(db, collectionName, docId), updateData);
        } else {
            // El rol cambia: mover el documento (garantizar cuenta en Authentication para admin y user)
            const user = localUsers.find(u => u.docId === docId);
            if (!user) throw new Error("Usuario no encontrado localmente");

            const emailNorm = (email || user.email || '').trim().toLowerCase();
            let passForAuth = (user.initial_password || user.password || '').toString().trim();
            if (!passForAuth || passForAuth.length < 6) {
                passForAuth = generateTemporaryUserPassword(user.nombre || user.name || 'usr');
            }

            const authResult = await createAuthUserByEmailPassword(emailNorm, passForAuth);
            if (authResult.status !== 'created' && authResult.status !== 'exists') {
                throw new Error(`Authentication: ${authResult.message}`);
            }

            const pwdStored =
                authResult.status === 'created'
                    ? passForAuth
                    : (user.initial_password || user.password || passForAuth);

            await setDoc(doc(db, "ranking_user", emailNorm), {
                nombre: name,
                email: emailNorm,
                emp_id: empId,
                seniority: selectedSeniority,
                especialidad,
                puntos: Number(user.puntos || 0),
                tiempo: Number(user.tiempo || 0),
                fecha: user.fecha || new Date(),
                initial_password: pwdStored,
            }, { merge: true });
        }

        alert("Usuario actualizado correctamente");
        document.getElementById('modal-edit-user').classList.add('hidden');
        loadUsers();

    } catch (e) {
        alert("Error al actualizar: " + e.message);
        console.error(e);
    }
};

window.deleteUser = async function (docId) {
    const user = localUsers.find(u => u.docId === docId);
    if (!user) return;

    const typeLabel = currentUserViewMode === 'uixers' ? 'participante' : 'administrador';
    const userName = currentUserViewMode === 'uixers' ? (user.nombre || 'este usuario') : (user.name || 'este usuario');
    const body = document.getElementById('delete-users-modal-body');

    selectedUserIdsForDelete = [docId];
    deleteUsersCollectionTarget = "ranking_user";

    if (body) {
        body.innerText = `Vas a eliminar a ${userName} (${typeLabel}). Esta acción no se puede deshacer y perderá el acceso al sistema inmediatamente.`;
    }
    document.getElementById('modal-delete-users-confirmation').classList.remove('hidden');
};

window.deleteSelectedUsers = async function () {
    const selected = Array.from(document.querySelectorAll('.user-checkbox:checked'));
    if (selected.length === 0) return;

    selectedUserIdsForDelete = selected.map(cb => cb.value);
    deleteUsersCollectionTarget = "ranking_user";
    const count = selectedUserIdsForDelete.length;
    const typeLabel = currentUserViewMode === 'uixers' ? 'participante' : 'administrador';
    const plural = count === 1 ? '' : 'es';
    const body = document.getElementById('delete-users-modal-body');
    if (body) {
        body.innerText = `Vas a eliminar ${count} ${typeLabel}${plural}. Esta acción no se puede deshacer y perderán el acceso al sistema inmediatamente.`;
    }
    document.getElementById('modal-delete-users-confirmation').classList.remove('hidden');
};

window.closeDeleteUsersModal = function () {
    document.getElementById('modal-delete-users-confirmation').classList.add('hidden');
    selectedUserIdsForDelete = [];
    deleteUsersCollectionTarget = null;
};

window.confirmDeleteSelectedUsers = async function () {
    if (selectedUserIdsForDelete.length === 0) return;

    const confirmBtn = document.getElementById('btn-confirm-delete-users');
    const originalConfirmBtnText = confirmBtn ? confirmBtn.innerHTML : '';
    const deleteBtn = document.getElementById('btn-delete-users');
    const originalDeleteBtnText = deleteBtn ? deleteBtn.innerHTML : '';

    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '<i class="fas fa-circle-notch animate-spin"></i> Eliminando...';
    }
    if (deleteBtn) {
        deleteBtn.disabled = true;
        deleteBtn.innerHTML = '<i class="fas fa-circle-notch animate-spin"></i> Borrando...';
    }

    try {
        const selectedUsers = selectedUserIdsForDelete
            .map((docId) => localUsers.find((u) => u.docId === docId))
            .filter(Boolean);
        const payloadUsers = selectedUsers.map((u) => ({
            email: (u.email || '').trim().toLowerCase()
        })).filter((u) => u.email);

        if (payloadUsers.length === 0) {
            throw new Error('No se encontraron correos válidos para borrar.');
        }

        const result = await invokeAdminFunction('admin-delete-users', {
            users: payloadUsers,
            hardDeleteAuth: true
        });
        const totalDeleted = Number(result.summary?.deletedRanking || 0);
        const failed = Number(result.summary?.failed || 0);
        closeDeleteUsersModal();
        alert(
            `Resultado borrado:\n` +
            `- ranking_user eliminados: ${totalDeleted}\n` +
            `- auth.users eliminados: ${Number(result.summary?.deletedAuth || 0)}\n` +
            `- con error: ${failed}`
        );
        loadUsers();
    } catch (e) {
        alert("Error eliminando usuarios: " + e.message);
    } finally {
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = originalConfirmBtnText;
        }
        if (deleteBtn) {
            deleteBtn.innerHTML = originalDeleteBtnText;
            updateUserBulkActionsState();
        }
    }
};

// --- Preguntas ---

window.loadQuestions = async function () {
    document.getElementById('questions-list').innerHTML =
        '<div class="loading-state"><i class="fas fa-circle-notch animate-spin"></i> Cargando...</div>';

    try {
        const q = query(collection(db, currentQuestionBank));
        const querySnapshot = await getDocs(q);
        localQuestions = [];

        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();

            // Adaptador: detecta formato App (Cat,Q,A,B,C) o formato Admin (category, options[])
            let display = {
                category: normalizeQuestionCategory(data.category || data.Cat || 'General'),
                question: data.question || data.Q || 'Sin pregunta',
                tag: data.Tag || data.category || 'General',
                explanation: data.Expl || data.explanation || '',
                seniority: data.Seniority || 'junior',
                options: [],
                correctAnswer: -1,
                active: data.active !== false
            };

            if (Array.isArray(data.options)) {
                display.options = data.options;
                display.correctAnswer = data.correctAnswer;
            } else if (data.A) {
                display.options = [data.A, data.B, data.C];
                display.correctAnswer = data.Correcta === 'A' ? 0 : (data.Correcta === 'B' ? 1 : 2);
            }

            localQuestions.push({ id: docSnap.id, data, display });
        });

        renderFilters();
        renderQuestions();

    } catch (e) {
        console.error(e);
        document.getElementById('questions-list').innerHTML =
            '<div class="error-state">Error cargando preguntas (Revisa consola)</div>';
    }
};

window.renderFilters = function () {
    const container = document.getElementById('category-filters');
    const seniorityContainer = document.getElementById('seniority-filters');
    const categories = [...new Set(localQuestions.map(q => q.display.category))].sort();
    const seniorities = ['junior', 'medium', 'senior'];

    container.innerHTML = categories.map(cat => {
        const styles = categoryStyles[cat] || { cssKey: 'default' };
        const isActive = activeFilters.has(cat);
        const enc = encodeURIComponent(cat);
        return `<button type="button" data-filter-cat="${enc}" onclick="window.toggleFilter && window.toggleFilter(decodeURIComponent(this.dataset.filterCat))" class="filter-btn filter-btn--${styles.cssKey}${isActive ? ' active' : ''}">${escapeHtml(cat)}</button>`;
    }).join('');

    seniorityContainer.innerHTML = seniorities.map((seniority) => {
        const isActive = activeSeniorityFilters.has(seniority);
        const label = seniority.charAt(0).toUpperCase() + seniority.slice(1);
        return `<button type="button" onclick="window.toggleSeniorityFilter && window.toggleSeniorityFilter('${seniority}')" class="filter-btn filter-btn--default${isActive ? ' active' : ''}">${label}</button>`;
    }).join('');
};

window.toggleFilter = function (cat) {
    if (activeFilters.has(cat)) activeFilters.delete(cat);
    else activeFilters.add(cat);
    renderFilters();
    renderQuestions();
};

window.toggleSeniorityFilter = function (seniority) {
    if (activeSeniorityFilters.has(seniority)) activeSeniorityFilters.delete(seniority);
    else activeSeniorityFilters.add(seniority);
    renderFilters();
    renderQuestions();
};

window.handleSearch = function (val) {
    searchTerm = val.toLowerCase().trim();
    renderQuestions();
};

window.questionSortBy = 'newest';

window.handleQuestionSort = function(val) {
    window.questionSortBy = val;
    renderQuestions();
};

window.toggleQuestionFiltersPanel = function () {
    const panel = document.getElementById('questions-filters-panel');
    if (!panel) return;

    if (panel.classList.contains('hidden')) {
        panel.classList.remove('hidden');
        panel.classList.remove('is-closing');
        requestAnimationFrame(() => panel.classList.add('is-open'));
        return;
    }

    panel.classList.remove('is-open');
    panel.classList.add('is-closing');
    setTimeout(() => {
        panel.classList.add('hidden');
        panel.classList.remove('is-closing');
    }, 300);
};

function normalizeSeniorityKey(raw) {
    const v = (raw || '').toString().toLowerCase().trim();
    if (v === 'mid' || v === 'medio') return 'medium';
    if (v === 'medium') return 'medium';
    if (v === 'senior') return 'senior';
    return 'junior';
}

function getMillis(val) {
    if (!val) return 0;
    if (val.toMillis) return val.toMillis();
    if (val.seconds) return val.seconds * 1000;
    if (val.getTime) return val.getTime();
    return new Date(val).getTime() || 0;
}

window.renderQuestions = function () {
    const list = document.getElementById('questions-list');
    const visibleCount = document.getElementById('questions-visible-count');
    const totalCount = document.getElementById('questions-total-count');

    let filtered = activeFilters.size === 0
        ? localQuestions
        : localQuestions.filter(q => activeFilters.has(q.display.category));

    if (activeSeniorityFilters.size > 0) {
        filtered = filtered.filter((q) =>
            activeSeniorityFilters.has(normalizeSeniorityKey(q.display.seniority))
        );
    }

    if (searchTerm) {
        filtered = filtered.filter(q => q.display.question.toLowerCase().includes(searchTerm));
    }

    filtered.sort((a, b) => {
        const dateA = getMillis(a.data.createdAt);
        const dateB = getMillis(b.data.createdAt);
        if (window.questionSortBy === 'category') {
            const catA = (a.display.category || "").toLowerCase();
            const catB = (b.display.category || "").toLowerCase();
            if (catA < catB) return -1;
            if (catA > catB) return 1;
        }
        // Fallback: order by newest
        return dateB - dateA;
    });

    if (visibleCount) visibleCount.innerText = String(filtered.length);
    if (totalCount) totalCount.innerText = String(localQuestions.length);

    if (filtered.length === 0) {
        list.innerHTML = '<div class="empty-state">No hay preguntas con este filtro</div>';
        return;
    }

    list.innerHTML = filtered.map(item => {
        const styles = categoryStyles[item.display.category] || { badge: "category-badge category-badge--default", cssKey: "default" };
        const inactiveClass = item.display.active ? '' : 'question-card--inactive';

        return `
        <div class="admin-card question-card question-card--${styles.cssKey} ${inactiveClass}">
            <div class="question-card-inner">
                <div class="question-content">
                    <div class="question-badges">
                        <span class="${styles.badge}">${item.display.category}</span>
                        <span class="tag-badge"><i class="fas fa-tag"></i> ${item.display.tag}</span>
                        <span class="tag-badge" style="background:var(--bg-surface-tertiary);"><i class="fas fa-user-tie"></i> ${item.display.seniority}</span>
                    </div>
                    <p class="question-text">${item.display.question}</p>
                    <div class="question-options">
                        ${item.display.options.map((opt, i) =>
            `<p class="option-text${i == item.display.correctAnswer ? ' option-text--correct' : ''}">${String.fromCharCode(65 + i)}. ${opt}</p>`
        ).join('')}
                    </div>
                    ${item.display.explanation ? `<p class="question-explanation"><i class="fas fa-info-circle"></i> ${item.display.explanation}</p>` : ''}
                </div>
                <div class="question-actions">
                    <label class="toggle-switch" title="${item.display.active ? 'Desactivar' : 'Activar'}">
                        <input type="checkbox" onchange="toggleQuestionStatus('${item.id}', ${item.display.active})" ${item.display.active ? 'checked' : ''}>
                        <div class="toggle-track"></div>
                    </label>
                    <button onclick="window.openQuestionModal && window.openQuestionModal('${item.id}')" class="row-action-btn row-action-btn--edit" title="Editar"><i class="fas fa-edit"></i></button>
                    <button onclick="window.deleteQuestion && window.deleteQuestion('${item.id}')" class="row-action-btn row-action-btn--delete" title="Borrar"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        </div>`;
    }).join('');
};

window.toggleQuestionStatus = async function (id, currentStatus) {
    try {
        const newStatus = !currentStatus;
        await updateDoc(doc(db, currentQuestionBank, id), { active: newStatus });
        const q = localQuestions.find(q => q.id === id);
        if (q) q.display.active = newStatus;
        renderQuestions();
    } catch (e) {
        console.error(e);
        alert("Error al cambiar el estado de la pregunta");
    }
};

window.openSelectBankForNewQuestion = async function () {
    const container = document.getElementById("modal-select-bank-list");
    if (container) {
        container.innerHTML = '<div class="loading-state"><i class="fas fa-circle-notch animate-spin"></i></div>';
        const banks = await getBanksList();
        container.innerHTML = banks
            .map(
                (b) =>
                    `<button type="button" onclick="window.selectBankAndOpenQuestionModal && window.selectBankAndOpenQuestionModal('${b.collectionId}', '${(b.name || "").replace(/'/g, "\\'")}')" class="admin-card dash-action-card">
                        <div class="action-icon action-icon--${b.iconColor || "blue"}"><i class="fas ${b.icon}"></i></div>
                        <h4 class="action-card-title">${escapeHtml(b.name)}</h4>
                        <p class="action-card-desc">${escapeHtml(b.description || "")}</p>
                    </button>`
            )
            .join("");
    }
    document.getElementById("modal-select-question-bank").classList.remove("hidden");
};

window.selectBankAndOpenQuestionModal = function (collectionName, displayName) {
    currentQuestionBank = collectionName;
    currentBankName = displayName;
    document.getElementById('modal-select-question-bank').classList.add('hidden');
    openQuestionModal();
};

window.openQuestionModal = function (id = null) {
    const modal = document.getElementById('modal-add-question');
    const title = document.getElementById('modal-question-title');
    const idInput = document.getElementById('q-id');

    modal.classList.remove('hidden');

    if (id) {
        const q = localQuestions.find(item => item.id === id);
        if (!q) return;
        title.innerText = "Editar Pregunta";
        idInput.value = id;
        fillCategorySelect(document.getElementById('q-category'), q.display.category || 'UX Research', [q.display.category]);
        document.getElementById('q-category-custom-wrap')?.classList.add('hidden');
        document.getElementById('q-tag').value = q.display.tag;
        document.getElementById('q-seniority').value = q.display.seniority;
        document.getElementById('q-text').value = q.display.question;
        document.getElementById('q-expl').value = q.display.explanation;
        document.getElementById('q-opt-0').value = q.display.options[0] || '';
        document.getElementById('q-opt-1').value = q.display.options[1] || '';
        document.getElementById('q-opt-2').value = q.display.options[2] || '';
        document.getElementById('q-correct').value = q.display.correctAnswer;
    } else {
        title.innerText = currentBankName ? `Agregar Pregunta (${currentBankName})` : "Agregar Pregunta";
        idInput.value = "";
        fillCategorySelect(document.getElementById('q-category'), 'UX Research');
        document.getElementById('q-category-custom-wrap')?.classList.add('hidden');
        document.getElementById('q-tag').value = "";
        document.getElementById('q-seniority').value = "junior";
        document.getElementById('q-text').value = "";
        document.getElementById('q-expl').value = "";
        document.getElementById('q-opt-0').value = "";
        document.getElementById('q-opt-1').value = "";
        document.getElementById('q-opt-2').value = "";
        document.getElementById('q-correct').value = "0";
    }
};

window.saveQuestion = async function () {
    const id = document.getElementById('q-id').value;
    const rawCat = resolveCategoryFromSelect('q');
    if (rawCat === null) {
        return alert('Escribe el nombre de la nueva categoría (al menos 2 caracteres) o elige una existente.');
    }
    const category = normalizeQuestionCategory(rawCat);
    const tag = document.getElementById('q-tag').value;
    const seniority = document.getElementById('q-seniority').value;
    const question = document.getElementById('q-text').value;
    const expl = document.getElementById('q-expl').value;
    const options = [
        document.getElementById('q-opt-0').value,
        document.getElementById('q-opt-1').value,
        document.getElementById('q-opt-2').value
    ];
    const correctAnswer = parseInt(document.getElementById('q-correct').value);
    const correctLetter = ["A", "B", "C"][correctAnswer];

    if (!question || options.some(o => !o)) return alert("Completa todos los campos");

    try {
        // Guardamos en el formato que usa la App Principal (Cat, Q, A, B, C)
        const questionData = {
            Cat: category,
            Q: question,
            A: options[0], B: options[1], C: options[2],
            Correcta: correctLetter,
            Expl: expl || `Respuesta correcta: ${correctLetter}`,
            Tag: tag || category,
            Seniority: seniority,
            createdAt: new Date(),
            active: true
        };

        if (id) {
            delete questionData.active; // No sobreescribir estado al editar
            await updateDoc(doc(db, currentQuestionBank, id), questionData);
        } else {
            await addDoc(collection(db, currentQuestionBank), questionData);
        }

        document.getElementById('modal-add-question').classList.add('hidden');
        loadQuestions();

    } catch (e) { alert("Error: " + e.message); }
};

window.deleteQuestion = function (id) {
    questionToDeleteId = id;
    document.getElementById('modal-delete-confirmation').classList.remove('hidden');
};

window.closeDeleteModal = function () {
    document.getElementById('modal-delete-confirmation').classList.add('hidden');
    questionToDeleteId = null;
};

window.confirmDeleteQuestion = async function () {
    if (!questionToDeleteId) return;
    const btn = document.getElementById('btn-confirm-delete');
    const originalText = btn.innerText;
    btn.innerHTML = '<i class="fas fa-circle-notch animate-spin"></i>';
    btn.disabled = true;
    try {
        await deleteDoc(doc(db, currentQuestionBank, questionToDeleteId));
        loadQuestions();
        closeDeleteModal();
    } catch (e) {
        alert(e.message);
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
};

// --- Carga masiva de preguntas (CSV) ---
window.handleQuestionsCSVUpload = async function(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!currentQuestionBank) {
        alert("Primero selecciona un banco de preguntas.");
        return;
    }

    const reader = new FileReader();
    reader.onload = async function(e) {
        const buffer = e.target.result;
        let text;
        try {
            text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
        } catch (err) {
            text = new TextDecoder("windows-1252").decode(buffer);
        }
        const rows = splitCsvRecords(text).map((r) => r.trim()).filter((r) => r);
        
        if (rows.length < 2) {
            alert("El archivo CSV debe contener al menos una fila de encabezados y una fila de datos.");
            return;
        }

        const headers = parseCsvRowCells(rows[0]).map(h => h.replace(/^"|"$/g, '').trim().toLowerCase());
        
        const catIdx = headers.findIndex(isCsvCategoryColumnHeader);
        const tagIdx = headers.findIndex(h => h.includes('tag'));
        const seniorityIdx = headers.findIndex(h => h.includes('seniority') || h.includes('nivel'));
        const qIdx = headers.findIndex(h => h.includes('pregunta') || h.includes('question') || h === 'q');
        const optAIdx = headers.findIndex(h => h.includes('opcion a') || h.includes('opción a') || h === 'a');
        const optBIdx = headers.findIndex(h => h.includes('opcion b') || h.includes('opción b') || h === 'b');
        const optCIdx = headers.findIndex(h => h.includes('opcion c') || h.includes('opción c') || h === 'c');
        const correctIdx = headers.findIndex(h => h.includes('correcta') || h.includes('respuesta'));
        const explIdx = headers.findIndex(h => h.includes('explicacion') || h.includes('explicación') || h.includes('expl'));
        
        if (catIdx === -1 || qIdx === -1 || optAIdx === -1 || optBIdx === -1 || correctIdx === -1) {
            alert("El CSV de preguntas debe tener columnas para: Categoría, Pregunta, Opción A, Opción B y Correcta.");
            return;
        }

        const btn = document.getElementById('btn-csv-upload-questions');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-circle-notch animate-spin"></i> Cargando...';
        btn.disabled = true;

        let successCount = 0;
        let errors = [];

        for (let i = 1; i < rows.length; i++) {
            const cols = parseCsvRowCells(rows[i]);

            const cat = normalizeQuestionCategory(cols[catIdx] || "General");
            const tag = tagIdx !== -1 && cols[tagIdx] ? cols[tagIdx] : cat;
            const seniority = seniorityIdx !== -1 && cols[seniorityIdx]
                ? normalizeQuestionSeniority(cols[seniorityIdx])
                : "junior";
            const questionText = cols[qIdx];
            const optA = cols[optAIdx];
            const optB = cols[optBIdx];
            const optC = optCIdx !== -1 ? cols[optCIdx] : "";
            const correctWord = cols[correctIdx] || "A";
            const expl = explIdx !== -1 ? cols[explIdx] : "";

            if (!questionText || !optA || !optB) {
                errors.push(`Fila ${i+1}: faltan datos (Pregunta u opciones)`);
                continue;
            }

            let correctLetter = "A";
            const cwUpper = correctWord.toUpperCase();
            if (cwUpper === "B" || cwUpper === "OPCIÓN B" || cwUpper === "OPCION B") correctLetter = "B";
            else if (cwUpper === "C" || cwUpper === "OPCIÓN C" || cwUpper === "OPCION C") correctLetter = "C";

            try {
                const questionData = {
                    Cat: cat,
                    Q: questionText,
                    A: optA, B: optB, C: optC,
                    Correcta: correctLetter,
                    Expl: expl || `Respuesta correcta: ${correctLetter}`,
                    Tag: tag,
                    Seniority: seniority,
                    createdAt: new Date(),
                    active: true
                };

                await addDoc(collection(db, currentQuestionBank), questionData);
                successCount++;
            } catch(err) {
                errors.push(`Fila ${i+1}: ${err.message}`);
            }
        }

        btn.innerHTML = originalText;
        btn.disabled = false;
        event.target.value = '';

        let msg = `Carga masiva completada.\n\nPreguntas procesadas correctamente: ${successCount}`;
        if (errors.length > 0) {
            msg += `\n\nErrores encontrados:\n${errors.slice(0, 5).join('\n')}`;
            if (errors.length > 5) msg += `\n... y ${errors.length - 5} errores más.`;
        }
        alert(msg);
        
        loadQuestions();
    };

    reader.readAsArrayBuffer(file);
};

// ============================================================
// PILLS – Sub-banco de cápsulas con preguntas Verdadero/Falso
// ============================================================

const PILLS_COLLECTION = 'pills';
let localPills = [];
let currentPillId = null;
let currentPillName = '';
let localPillQuestions = [];

function isPillsBank(bankId) {
    return bankId === 'preguntas_pills';
}

window.selectQuestionBankOriginal = window.selectQuestionBank;
window.selectQuestionBank = function (collectionName, displayName) {
    currentQuestionBank = collectionName;
    currentBankName = displayName;

    if (isPillsBank(collectionName)) {
        document.getElementById('questions-bank-selection').classList.add('hidden');
        document.getElementById('questions-bank-content').classList.add('hidden');
        document.getElementById('pill-questions-content')?.classList.add('hidden');
        document.getElementById('pills-bank-content').classList.remove('hidden');
        loadPills();
        return;
    }

    document.getElementById('pills-bank-content')?.classList.add('hidden');
    document.getElementById('pill-questions-content')?.classList.add('hidden');
    document.getElementById('current-bank-name').innerText = displayName;
    document.getElementById('questions-bank-selection').classList.add('hidden');
    document.getElementById('questions-bank-content').classList.remove('hidden');
    loadQuestions();
};

window.goBackToBanksOriginal = window.goBackToBanks;
window.goBackToBanks = function () {
    document.getElementById('questions-bank-selection').classList.remove('hidden');
    document.getElementById('questions-bank-content').classList.add('hidden');
    document.getElementById('pills-bank-content')?.classList.add('hidden');
    document.getElementById('pill-questions-content')?.classList.add('hidden');
};

window.goBackToPills = function () {
    document.getElementById('pill-questions-content').classList.add('hidden');
    document.getElementById('pills-bank-content').classList.remove('hidden');
    currentPillId = null;
    currentPillName = '';
};

// --- Pills CRUD ---

async function loadPills() {
    const container = document.getElementById('pills-list');
    container.innerHTML = '<div class="loading-state"><i class="fas fa-circle-notch animate-spin"></i> Cargando pills...</div>';
    try {
        const snap = await getDocs(collection(db, PILLS_COLLECTION));
        localPills = [];
        snap.forEach((d) => {
            localPills.push({ id: d.id, ...d.data() });
        });
        localPills.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        renderPills();
    } catch (e) {
        console.error(e);
        container.innerHTML = '<div class="error-state">Error cargando pills</div>';
    }
}

function renderPills() {
    const container = document.getElementById('pills-list');
    if (localPills.length === 0) {
        container.innerHTML = '<div class="empty-state">No hay pills todavía. Crea la primera con el botón \"Nueva Pill\".</div>';
        return;
    }

    container.innerHTML = localPills.map((pill) => {
        const cat = pill.category || 'General';
        const styles = categoryStyles[cat] || { badge: 'category-badge category-badge--default', cssKey: 'default' };
        const hasLink = pill.link && pill.link.trim();
        return `
        <div class="admin-card pill-card pill-card--${styles.cssKey}">
            <div class="pill-card-header">
                <span class="${styles.badge}">${escapeHtml(cat)}</span>
                <div class="pill-card-actions">
                    <button type="button" onclick="window.openEditPillModal && window.openEditPillModal('${pill.id}')" class="row-action-btn row-action-btn--edit" title="Editar pill"><i class="fas fa-edit"></i></button>
                    <button type="button" onclick="window.deletePill && window.deletePill('${pill.id}')" class="row-action-btn row-action-btn--delete" title="Eliminar pill"><i class="fas fa-trash"></i></button>
                </div>
            </div>
            <h4 class="pill-card-title">${escapeHtml(pill.name || 'Sin nombre')}</h4>
            ${pill.description ? `<p class="pill-card-desc">${escapeHtml(pill.description)}</p>` : ''}
            <div class="pill-card-buttons">
                ${hasLink ? `<a href="${escapeHtml(pill.link)}" target="_blank" rel="noopener" class="pill-btn pill-btn--link"><i class="fas fa-play-circle"></i> Ver Pill</a>` : '<span class="pill-btn pill-btn--disabled"><i class="fas fa-play-circle"></i> Sin enlace</span>'}
                <button type="button" onclick="window.openPillQuestions && window.openPillQuestions('${pill.id}', '${escapeHtml((pill.name || '').replace(/'/g, "\\'"))}')" class="pill-btn pill-btn--quiz"><i class="fas fa-check-double"></i> Prueba V/F</button>
            </div>
        </div>`;
    }).join('');
}

window.openAddPillModal = function () {
    document.getElementById('modal-pill-title').innerText = 'Nueva Pill';
    document.getElementById('pill-edit-id').value = '';
    document.getElementById('pill-name').value = '';
    document.getElementById('pill-link').value = '';
    fillCategorySelect(document.getElementById('pill-category'), 'UX Research');
    document.getElementById('pill-category-custom-wrap')?.classList.add('hidden');
    document.getElementById('pill-description').value = '';
    document.getElementById('modal-add-pill').classList.remove('hidden');
};

window.openEditPillModal = function (pillId) {
    const pill = localPills.find((p) => p.id === pillId);
    if (!pill) return;
    document.getElementById('modal-pill-title').innerText = 'Editar Pill';
    document.getElementById('pill-edit-id').value = pillId;
    document.getElementById('pill-name').value = pill.name || '';
    document.getElementById('pill-link').value = pill.link || '';
    const pcat = pill.category || 'UX Research';
    fillCategorySelect(document.getElementById('pill-category'), pcat, [pill.category]);
    document.getElementById('pill-category-custom-wrap')?.classList.add('hidden');
    document.getElementById('pill-description').value = pill.description || '';
    document.getElementById('modal-add-pill').classList.remove('hidden');
};

window.savePill = async function () {
    const id = document.getElementById('pill-edit-id').value;
    const name = document.getElementById('pill-name').value.trim();
    const link = document.getElementById('pill-link').value.trim();
    const rawCat = resolveCategoryFromSelect('pill');
    if (rawCat === null) {
        return alert('Escribe el nombre de la nueva categoría (al menos 2 caracteres) o elige una existente.');
    }
    const category = normalizeQuestionCategory(rawCat);
    const description = document.getElementById('pill-description').value.trim();

    if (!name) return alert('El nombre de la pill es obligatorio.');

    const data = { name, link, category, description, updatedAt: new Date() };

    try {
        if (id) {
            await updateDoc(doc(db, PILLS_COLLECTION, id), data);
        } else {
            data.createdAt = new Date();
            await addDoc(collection(db, PILLS_COLLECTION), data);
        }
        document.getElementById('modal-add-pill').classList.add('hidden');
        loadPills();
    } catch (e) {
        alert('Error al guardar pill: ' + e.message);
        console.error(e);
    }
};

window.deletePill = async function (pillId) {
    if (!confirm('¿Eliminar esta pill y todas sus preguntas? Esta acción no se puede deshacer.')) return;
    try {
        const qSnap = await getDocs(collection(db, PILLS_COLLECTION, pillId, 'questions'));
        const deletePromises = [];
        qSnap.forEach((d) => deletePromises.push(deleteDoc(d.ref)));
        await Promise.all(deletePromises);
        await deleteDoc(doc(db, PILLS_COLLECTION, pillId));
        loadPills();
    } catch (e) {
        alert('Error al eliminar: ' + e.message);
    }
};

// --- Pill Questions (V/F) ---

window.openPillQuestions = async function (pillId, pillName) {
    currentPillId = pillId;
    currentPillName = pillName;
    document.getElementById('pill-questions-title').innerText = pillName;
    document.getElementById('pills-bank-content').classList.add('hidden');
    document.getElementById('pill-questions-content').classList.remove('hidden');
    await loadPillQuestions();
};

async function loadPillQuestions() {
    const container = document.getElementById('pill-questions-list');
    container.innerHTML = '<div class="loading-state"><i class="fas fa-circle-notch animate-spin"></i> Cargando preguntas...</div>';
    try {
        const snap = await getDocs(collection(db, PILLS_COLLECTION, currentPillId, 'questions'));
        localPillQuestions = [];
        snap.forEach((d) => localPillQuestions.push({ id: d.id, ...d.data() }));
        localPillQuestions.sort((a, b) => {
            const da = a.createdAt ? (a.createdAt.seconds || 0) : 0;
            const db2 = b.createdAt ? (b.createdAt.seconds || 0) : 0;
            return db2 - da;
        });
        renderPillQuestions();
    } catch (e) {
        console.error(e);
        container.innerHTML = '<div class="error-state">Error cargando preguntas</div>';
    }
}

function renderPillQuestions() {
    const container = document.getElementById('pill-questions-list');
    if (localPillQuestions.length === 0) {
        container.innerHTML = '<div class="empty-state">No hay preguntas V/F en esta pill. Agrega la primera.</div>';
        return;
    }

    container.innerHTML = localPillQuestions.map((q) => {
        const answer = q.correctAnswer === true || q.correctAnswer === 'true';
        const answerLabel = answer ? 'Verdadero' : 'Falso';
        const answerClass = answer ? 'pill-answer--true' : 'pill-answer--false';
        const cat = q.category || 'General';
        const styles = categoryStyles[cat] || { badge: 'category-badge category-badge--default', cssKey: 'default' };

        return `
        <div class="admin-card question-card question-card--${styles.cssKey}">
            <div class="question-card-inner">
                <div class="question-content">
                    <div class="question-badges">
                        <span class="${styles.badge}">${escapeHtml(cat)}</span>
                    </div>
                    <p class="question-text">${escapeHtml(q.question || '')}</p>
                    <p class="pill-answer ${answerClass}"><i class="fas ${answer ? 'fa-check-circle' : 'fa-times-circle'}"></i> Respuesta correcta: <strong>${answerLabel}</strong></p>
                    ${q.explanation ? `<p class="question-explanation"><i class="fas fa-info-circle"></i> ${escapeHtml(q.explanation)}</p>` : ''}
                </div>
                <div class="question-actions">
                    <button type="button" onclick="window.openEditPillQuestionModal && window.openEditPillQuestionModal('${q.id}')" class="row-action-btn row-action-btn--edit" title="Editar"><i class="fas fa-edit"></i></button>
                    <button type="button" onclick="window.deletePillQuestion && window.deletePillQuestion('${q.id}')" class="row-action-btn row-action-btn--delete" title="Borrar"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        </div>`;
    }).join('');
}

window.openAddPillQuestionModal = function () {
    document.getElementById('modal-pill-question-title').innerText = `Nueva Pregunta V/F – ${currentPillName}`;
    document.getElementById('pq-id').value = '';
    document.getElementById('pq-pill-id').value = currentPillId;
    fillCategorySelect(document.getElementById('pq-category'), 'UX Research');
    document.getElementById('pq-category-custom-wrap')?.classList.add('hidden');
    document.getElementById('pq-text').value = '';
    document.getElementById('pq-expl').value = '';
    document.querySelector('input[name="pq-answer"][value="true"]').checked = true;
    document.getElementById('modal-add-pill-question').classList.remove('hidden');
};

window.openEditPillQuestionModal = function (qId) {
    const q = localPillQuestions.find((x) => x.id === qId);
    if (!q) return;
    document.getElementById('modal-pill-question-title').innerText = 'Editar Pregunta V/F';
    document.getElementById('pq-id').value = qId;
    document.getElementById('pq-pill-id').value = currentPillId;
    const qcat = q.category || 'UX Research';
    fillCategorySelect(document.getElementById('pq-category'), qcat, [q.category]);
    document.getElementById('pq-category-custom-wrap')?.classList.add('hidden');
    document.getElementById('pq-text').value = q.question || '';
    document.getElementById('pq-expl').value = q.explanation || '';
    const answerVal = (q.correctAnswer === true || q.correctAnswer === 'true') ? 'true' : 'false';
    const radio = document.querySelector(`input[name="pq-answer"][value="${answerVal}"]`);
    if (radio) radio.checked = true;
    document.getElementById('modal-add-pill-question').classList.remove('hidden');
};

window.savePillQuestion = async function () {
    const id = document.getElementById('pq-id').value;
    const pillId = document.getElementById('pq-pill-id').value || currentPillId;
    const rawCat = resolveCategoryFromSelect('pq');
    if (rawCat === null) {
        return alert('Escribe el nombre de la nueva categoría (al menos 2 caracteres) o elige una existente.');
    }
    const category = normalizeQuestionCategory(rawCat);
    const question = document.getElementById('pq-text').value.trim();
    const explanation = document.getElementById('pq-expl').value.trim();
    const correctAnswer = document.querySelector('input[name="pq-answer"]:checked')?.value === 'true';

    if (!question) return alert('Escribe la afirmación o pregunta.');
    if (!pillId) return alert('Error: no se identificó la pill.');

    const data = { category, question, explanation, correctAnswer, type: 'true_false', updatedAt: new Date() };

    try {
        if (id) {
            await updateDoc(doc(db, PILLS_COLLECTION, pillId, 'questions', id), { ...data, seniority: deleteField() });
        } else {
            data.createdAt = new Date();
            data.active = true;
            await addDoc(collection(db, PILLS_COLLECTION, pillId, 'questions'), data);
        }
        document.getElementById('modal-add-pill-question').classList.add('hidden');
        loadPillQuestions();
    } catch (e) {
        alert('Error: ' + e.message);
        console.error(e);
    }
};

window.deletePillQuestion = async function (qId) {
    if (!confirm('¿Eliminar esta pregunta? Esta acción no se puede deshacer.')) return;
    try {
        await deleteDoc(doc(db, PILLS_COLLECTION, currentPillId, 'questions', qId));
        loadPillQuestions();
    } catch (e) {
        alert('Error: ' + e.message);
    }
};

// --- Toggle password visibility ---

window.togglePass = function (inputId, iconId) {
    const input = document.getElementById(inputId);
    const icon = document.getElementById(iconId);
    if (!input || !icon) return;
    if (input.type === "password") {
        input.type = "text";
        icon.classList.replace('fa-eye', 'fa-eye-slash');
    } else {
        input.type = "password";
        icon.classList.replace('fa-eye-slash', 'fa-eye');
    }
};

// Tras definir todas las funciones globales, enlazar DOM (módulos ES no exponen globals a onclick inline).
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAdminDom);
} else {
    initAdminDom();
}
