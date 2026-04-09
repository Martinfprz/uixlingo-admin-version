# Spec: Migración Firebase → Supabase — UiX-lingo v2

## Resumen del proyecto

UiX-lingo v2 es una app web de quizzes/evaluaciones UX/UI. Actualmente usa **Firebase Auth + Firestore** (CDN v10.7.1) sin npm, todo en un solo archivo `app.js` (~4,000 líneas).

---

## Decisiones acordadas

| # | Decisión | Detalle |
|---|---|---|
| 1 | Tablas `ranking_user` y `user_profiles` separadas | Se mantienen separadas por ahora, se unifican en fase posterior |
| 2 | UUID como primary key | Email/UID como columna UNIQUE. Razón: seguridad, consistencia con Supabase Auth, emails pueden cambiar, mejor performance en índices |
| 3 | Reset de password para todos | Se crean usuarios en Supabase sin password, llegan con `force_password_change: true`, usan el flujo existente para crear nueva contraseña |
| 4 | Carga bajo demanda | Las preguntas se cargan cuando el usuario entra a cada sección, NO al autenticar |
| 5 | Sin modo invitado | Eliminar `signInAnonymously()` y todos los fallbacks de auth anónima |
| 6 | Rol unificado | Campo `role` ('admin' \| 'user') en metadata de Supabase Auth, eliminar tabla `admins` separada |
| 7 | Habilidades = catálogo fijo | Catálogo de N habilidades, se asignan a usuarios por ID |
| 8 | Sellos = ganados por rendimiento | Lógica en `app.js` con umbral configurable (ej. >80% en pill = sticker) |
| 9 | CDN imports sin bundler | Supabase se carga desde `esm.sh`, igual que Firebase se carga desde CDN actualmente |

---

## 1. Firebase Auth — Uso actual

| Función Firebase | Dónde se usa | Descripción |
|---|---|---|
| `signInWithEmailAndPassword(auth, email, pwd)` | Login principal | Autenticación email/password |
| ~~`signInAnonymously(auth)`~~ | ~~Fallback / modo invitado~~ | **ELIMINAR** — ya no se necesita |
| ~~`createUserWithEmailAndPassword(auth, email, pwd)`~~ | ~~Importado pero NO usado~~ | **ELIMINAR** — no se usa |
| `updatePassword(auth.currentUser, newPwd)` | Cambio de contraseña | Actualiza pwd en Firebase Auth |
| ~~`onAuthStateChanged(auth, callback)`~~ | ~~Listener global~~ | **CAMBIAR** — ya no dispara carga de preguntas, solo maneja sesión |
| `signOut(auth)` | Logout | Cierra sesión y limpia datos locales |

### Equivalencia en Supabase Auth

| Firebase | Supabase |
|---|---|
| `signInWithEmailAndPassword()` | `supabase.auth.signInWithPassword({ email, password })` |
| ~~`signInAnonymously()`~~ | **ELIMINAR** |
| `updatePassword()` | `supabase.auth.updateUser({ password })` |
| `onAuthStateChanged()` | `supabase.auth.onAuthStateChange()` (solo sesión, no carga de datos) |
| `signOut()` | `supabase.auth.signOut()` |
| `auth.currentUser.uid` | `session.user.id` |
| `auth.currentUser.email` | `session.user.email` |

### Rol de usuario

En vez de verificar si el email existe en colección `admins` o `ranking_user`, se usa:

```javascript
// Al hacer login, el rol viene en los metadata del usuario
const { data: { user } } = await supabase.auth.getUser();
const role = user.app_metadata.role; // 'admin' | 'user'

if (role === 'admin') {
  // modo admin
} else {
  // modo usuario
}
```

El rol se asigna al crear el usuario en Supabase (durante migración) usando la Admin API:
```javascript
supabase.auth.admin.createUser({
  email: 'admin@ejemplo.com',
  app_metadata: { role: 'admin' }
});
```

---

## 2. Firestore → Supabase — Tablas y esquemas

### 2.1 `banco_preguntas` (Preguntas de práctica)

**Tipo de acceso:** Solo lectura
**Carga:** Bajo demanda (cuando usuario entra a modo práctica)

| Campo Firestore | Campo Supabase | Tipo | Descripción |
|---|---|---|---|
| `Q` | `q` | TEXT | Texto de la pregunta |
| `A` | `a` | TEXT | Opción A |
| `B` | `b` | TEXT | Opción B |
| `C` | `c` | TEXT | Opción C |
| `Correcta` | `correcta` | TEXT | Respuesta correcta ("A", "B" o "C") |
| `Cat` | `cat` | TEXT | Categoría |
| `Expl` | `expl` | TEXT | Explicación |
| `Tag` | `tag` | TEXT | Etiqueta de estudio |
| `seniority`/`Seniority`/`nivel`/`Nivel`/`level`/`Level` | `seniority` | TEXT | Nivel (normalizado) |

**Firestore:** `getDocs(collection(db, "banco_preguntas"))`
**Supabase:** `supabase.from('banco_preguntas').select('*')`

```sql
CREATE TABLE banco_preguntas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  q TEXT NOT NULL,
  a TEXT NOT NULL,
  b TEXT NOT NULL,
  c TEXT NOT NULL,
  correcta TEXT NOT NULL CHECK (correcta IN ('A', 'B', 'C')),
  cat TEXT,
  expl TEXT,
  tag TEXT,
  seniority TEXT
);
```

---

### 2.2 `preguntas_evaluacion` (Preguntas de evaluación)

**Tipo de acceso:** Solo lectura
**Carga:** Bajo demanda (cuando usuario entra a modo evaluación)
**Esquema:** Idéntico a `banco_preguntas`

**Firestore:** `getDocs(collection(db, "preguntas_evaluacion"))`
**Supabase:** `supabase.from('preguntas_evaluacion').select('*')`

```sql
CREATE TABLE preguntas_evaluacion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  q TEXT NOT NULL,
  a TEXT NOT NULL,
  b TEXT NOT NULL,
  c TEXT NOT NULL,
  correcta TEXT NOT NULL CHECK (correcta IN ('A', 'B', 'C')),
  cat TEXT,
  expl TEXT,
  tag TEXT,
  seniority TEXT
);
```

---

### 2.3 `pills` (Píldoras de aprendizaje)

**Tipo de acceso:** Solo lectura
**Carga:** Bajo demanda (cuando usuario entra a sección pills)

| Campo Firestore | Campo Supabase | Tipo | Descripción |
|---|---|---|---|
| `name` | `name` | TEXT | Nombre de la píldora |
| `category` | `category` | TEXT | Categoría |
| `description` | `description` | TEXT | Descripción (max 140 chars en UI) |
| `link` | `link` | TEXT | Link a recurso externo |
| `publishedAt`/`published_at`/`createdAt`/`created_at` | `published_at` | TIMESTAMPTZ | Fecha de publicación |
| `order`/`orden` | `sort_order` | INT | Orden de visualización |

**Firestore:** `getDocs(collection(db, "pills"))`
**Supabase:** `supabase.from('pills').select('*').order('sort_order')`

```sql
CREATE TABLE pills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT,
  description TEXT,
  link TEXT,
  published_at TIMESTAMPTZ DEFAULT NOW(),
  sort_order INT
);
```

---

### 2.4 `pill_questions` (antes: subcolección `pills/{pillId}/questions`)

**Tipo de acceso:** Solo lectura
**Carga:** Bajo demanda (cuando usuario abre una píldora específica)

| Campo Firestore | Campo Supabase | Tipo | Descripción |
|---|---|---|---|
| (parent doc ID) | `pill_id` | UUID FK | Referencia a la píldora |
| `question` | `question` | TEXT | Texto de la pregunta |
| `correctAnswer` | `correct_answer` | BOOLEAN | Respuesta correcta (V/F) |
| `explanation` | `explanation` | TEXT | Explicación |
| `category` | `category` | TEXT | Categoría |
| `type` | `type` | TEXT | Tipo (ej. "true_false") |
| `active` | `active` | BOOLEAN | Activa (default true) |

**Firestore:** `getDocs(collection(db, "pills", pillId, "questions"))`
**Supabase:** `supabase.from('pill_questions').select('*').eq('pill_id', pillId)`

```sql
CREATE TABLE pill_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pill_id UUID NOT NULL REFERENCES pills(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  correct_answer BOOLEAN NOT NULL,
  explanation TEXT,
  category TEXT,
  type TEXT DEFAULT 'true_false',
  active BOOLEAN DEFAULT TRUE
);
```

---

### 2.5 `ranking_user` (Rankings y puntajes)

**Tipo de acceso:** Lectura y escritura
**Carga:** Rankings bajo demanda; datos propios al entrar a perfil

| Campo Firestore | Campo Supabase | Tipo | Descripción |
|---|---|---|---|
| (doc ID = email) | `email` (UNIQUE) | TEXT | Email del usuario |
| — | `id` (PK) | UUID | ID auto-generado |
| — | `user_id` (FK) | UUID | Referencia a auth.users |
| `nombre` | `nombre` | TEXT | Nombre del usuario |
| `questPoints` | `quest_points` | INT | Puntaje máximo en práctica |
| `testsPoints` | `tests_points` | INT | Puntaje en evaluación |
| `pillsPoints` | `pills_points` | INT | Último puntaje en píldoras |
| `pillsRankPillId` | `pills_rank_pill_id` | UUID FK | ID de última píldora intentada |
| `pillsRankTiempo` | `pills_rank_tiempo` | INT | Tiempo en última píldora (seg) |
| `puntos` | `puntos` | INT | Mejor puntaje evaluación |
| `tiempo` | `tiempo` | INT | Mejor tiempo evaluación |
| `fecha` | `fecha` | TIMESTAMPTZ | Fecha última actividad |
| `Seniority`/`seniority` | `seniority` | TEXT | Nivel de expertise |
| `Especialidad`/`especialidad` | `especialidad` | TEXT | Especialización (UX/UI) |
| ~~`password`~~ | — | — | **NO MIGRAR** (legacy) |
| ~~`initial_password`~~ | — | — | **NO MIGRAR** (legacy) |
| `passwordChanged` | — | — | **MOVER** a `force_password_change` en auth metadata |
| `forcePasswordChange` | — | — | **MOVER** a `force_password_change` en auth metadata |

**Operaciones Firestore → Supabase:**
| Firestore | Supabase |
|---|---|
| `getDoc(doc(db, 'ranking_user', email))` | `supabase.from('ranking_user').select('*').eq('email', email).single()` |
| `setDoc(..., { merge: true })` | `supabase.from('ranking_user').upsert(data, { onConflict: 'email' })` |
| `query(orderBy("questPoints", "desc"))` | `supabase.from('ranking_user').select('*').order('quest_points', { ascending: false })` |
| `query(where('pillsRankPillId', '==', id), limit(80))` | `supabase.from('ranking_user').select('*').eq('pills_rank_pill_id', id).limit(80)` |
| `query(orderBy(field, 'desc'), limit(50))` | `supabase.from('ranking_user').select('*').order(field, { ascending: false }).limit(50)` |

```sql
CREATE TABLE ranking_user (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  email TEXT UNIQUE NOT NULL,
  nombre TEXT,
  quest_points INT DEFAULT 0,
  tests_points INT DEFAULT 0,
  pills_points INT DEFAULT 0,
  pills_rank_pill_id UUID REFERENCES pills(id),
  pills_rank_tiempo INT,
  puntos INT DEFAULT 0,
  tiempo INT,
  fecha TIMESTAMPTZ,
  seniority TEXT,
  especialidad TEXT
);

CREATE INDEX idx_ranking_quest ON ranking_user(quest_points DESC);
CREATE INDEX idx_ranking_tests ON ranking_user(tests_points DESC);
CREATE INDEX idx_ranking_pills ON ranking_user(pills_rank_pill_id, pills_points DESC);
```

---

### 2.6 `user_profiles` (antes: colección `users`)

**Document ID en Firestore:** Firebase Auth UID → En Supabase: `id` = `auth.users.id`
**Tipo de acceso:** Lectura y escritura (solo el propio)
**Carga:** Al entrar a perfil

| Campo Firestore | Campo Supabase | Tipo | Descripción |
|---|---|---|---|
| (doc ID = UID) | `id` (PK = auth UID) | UUID | ID del usuario |
| `questPoints` | `quest_points` | INT | Puntaje práctica |
| `testsPoints` | `tests_points` | INT | Puntaje evaluación |
| `pillsPoints` | `pills_points` | INT | Puntaje píldoras |
| `pillScores` | → tabla `user_pill_scores` | — | Normalizado a tabla separada |
| `seniority` | `seniority` | TEXT | Nivel de expertise |
| `nombre` | `nombre` | TEXT | Nombre |
| `email` | `email` | TEXT | Email |
| `nickname` | `nickname` | TEXT | Apodo |
| `avatarUrl` | `avatar_url` | TEXT | URL de avatar |

```sql
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  email TEXT,
  nombre TEXT,
  nickname TEXT,
  avatar_url TEXT,
  quest_points INT DEFAULT 0,
  tests_points INT DEFAULT 0,
  pills_points INT DEFAULT 0,
  seniority TEXT
);

CREATE TABLE user_pill_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pill_id UUID NOT NULL REFERENCES pills(id),
  score INT NOT NULL,
  total INT NOT NULL,
  UNIQUE(user_id, pill_id)
);
```

---

### 2.7 `sellos` (Sellos/Stickers — ganados por rendimiento)

**Asignación:** Automática desde `app.js` cuando el usuario supera el umbral configurable en una pill.

| Campo Firestore | Campo Supabase | Tipo | Descripción |
|---|---|---|---|
| `nombre` | `nombre` | TEXT | Nombre del sello |
| `icono` | `icono` | TEXT | Clase FontAwesome |
| `asignado_a` (array) | → tabla `user_sellos` | — | Normalizado |
| `fecha_asignacion` (map) | → `user_sellos.fecha_asignacion` | TIMESTAMPTZ | Fecha por usuario |

**Firestore:** `query(collection(db, 'sellos'), where('asignado_a', 'array-contains', uid))`
**Supabase:** `supabase.from('user_sellos').select('*, sellos(*)').eq('user_id', uid)`

```sql
CREATE TABLE sellos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  icono TEXT,
  pill_id UUID REFERENCES pills(id),        -- pill asociada (opcional)
  umbral_porcentaje INT DEFAULT 80           -- % mínimo para ganar el sello
);

CREATE TABLE user_sellos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sello_id UUID NOT NULL REFERENCES sellos(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fecha_asignacion TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(sello_id, user_id)
);
```

---

### 2.8 `habilidades` (Catálogo fijo de habilidades)

**Asignación:** Se asignan a usuarios por ID desde la lógica de negocio.

| Campo Firestore | Campo Supabase | Tipo | Descripción |
|---|---|---|---|
| `nombre` | `nombre` | TEXT | Nombre de la habilidad |
| `icono` | `icono` | TEXT | Clase FontAwesome |
| `asignado_a` (array) | → tabla `user_habilidades` | — | Normalizado |

**Firestore:** `query(collection(db, 'habilidades'), where('asignado_a', 'array-contains', uid))`
**Supabase:** `supabase.from('user_habilidades').select('*, habilidades(*)').eq('user_id', uid)`

```sql
CREATE TABLE habilidades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  icono TEXT
);

CREATE TABLE user_habilidades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  habilidad_id UUID NOT NULL REFERENCES habilidades(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  UNIQUE(habilidad_id, user_id)
);
```

---

### 2.9 ~~`admins`~~ → ELIMINADA

**Decisión:** No se migra como tabla. Los admins se identifican por `app_metadata.role = 'admin'` en Supabase Auth.

Los campos `forcePasswordChange` y `passwordChanged` se manejan con `app_metadata` para todos los usuarios:
```javascript
// En la migración:
supabase.auth.admin.createUser({
  email: 'usuario@ejemplo.com',
  app_metadata: {
    role: 'user',  // o 'admin'
    force_password_change: true
  }
});
```

---

## 3. Mapeo de operaciones Firestore → Supabase

| Operación Firestore | Equivalencia Supabase JS |
|---|---|
| `getDoc(doc(db, 'col', id))` | `supabase.from('col').select('*').eq('id', id).single()` |
| `getDocs(collection(db, 'col'))` | `supabase.from('col').select('*')` |
| `getDocs(query(..., orderBy(f, 'desc'), limit(n)))` | `supabase.from('col').select('*').order(f, { ascending: false }).limit(n)` |
| `getDocs(query(..., where(f, '==', v)))` | `supabase.from('col').select('*').eq(f, v)` |
| `getDocs(query(..., where(f, 'array-contains', v)))` | JOIN con tabla relacional: `supabase.from('user_x').select('*, tabla(*)').eq('user_id', uid)` |
| `setDoc(doc(...), data, { merge: true })` | `supabase.from('col').upsert(data, { onConflict: 'id' })` |
| `updateDoc(doc(...), data)` | `supabase.from('col').update(data).eq('id', id)` |
| `addDoc(collection(...), data)` | `supabase.from('col').insert(data)` |

---

## 4. Cambios necesarios en `app.js`

### 4.1 Imports a reemplazar (líneas 32-54)

**Quitar:**
```javascript
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, query, orderBy, limit, doc, setDoc, getDoc, where, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, updatePassword, signInAnonymously, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
```

**Poner:**
```javascript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const supabase = createClient('TU_SUPABASE_URL', 'TU_SUPABASE_ANON_KEY');
```

### 4.2 Variables globales a eliminar

| Variable actual | Acción |
|---|---|
| `const app = initializeApp(firebaseConfig)` | Eliminar |
| `const db = getFirestore(app)` | Eliminar — se usa `supabase` directo |
| `const auth = getAuth(app)` | Eliminar — se usa `supabase.auth` |
| `auth.currentUser.uid` | → `session.user.id` |
| `auth.currentUser.email` | → `session.user.email` |

### 4.3 Cambio en flujo de carga

**Antes (Firebase):**
```
onAuthStateChanged → loadQuestionsFromFirebase() → carga TODO
```

**Después (Supabase):**
```
onAuthStateChange → solo maneja sesión y rol
Entrar a práctica → carga banco_preguntas
Entrar a evaluación → carga preguntas_evaluacion
Entrar a pills → carga pills
Abrir una pill → carga pill_questions de esa pill
Entrar a perfil → carga user_profiles + sellos + habilidades
```

### 4.4 Cambio en flujo de login

**Antes (Firebase):**
```
1. signInWithEmailAndPassword()
2. Si falla → signInAnonymously() como fallback
3. Buscar email en colección 'admins' → modo admin
4. Buscar email en colección 'ranking_user' → modo user
5. Verificar forcePasswordChange
```

**Después (Supabase):**
```
1. supabase.auth.signInWithPassword({ email, password })
2. Si falla → error (no hay fallback anónimo)
3. Leer user.app_metadata.role → 'admin' o 'user'
4. Leer user.app_metadata.force_password_change → mostrar cambio de pwd
```

### 4.5 Funciones principales a migrar

| Función en app.js | Líneas aprox. | Qué hace | Complejidad |
|---|---|---|---|
| `initFirebase()` | ~32-54 | Config e init | Baja |
| Login flow | ~570-720 | Auth + validación + rol | Media |
| `loadQuestionsFromFirebase()` | ~118-175 | Carga preguntas (dividir en 3 funciones separadas) | Media |
| `fetchPillQuestions(pillId)` | ~176-210 | Carga preguntas de pill | Baja |
| `loadUserProfile(uid)` | ~266-300 | Lee perfil | Baja |
| `loadUserSeals(uid)` | ~301-330 | Lee sellos (ahora con JOIN) | Media |
| `loadUserSkills(uid)` | ~331-360 | Lee habilidades (ahora con JOIN) | Media |
| `loadRankingUserSeniority()` | ~361-400 | Lee seniority | Baja |
| `saveScoreToCloud()` | ~3069-3182 | Guarda puntajes + lógica de sellos | Media |
| `saveNewPassword()` | ~1212-1251 | Actualiza password | Baja |
| Ranking queries | Varios | orderBy + limit + where | Baja |
| **NUEVO:** Lógica de sellos | — | Asignar sello si score > umbral | Baja |
| **ELIMINAR:** Fallbacks auth anónima | Varios | Ya no se necesitan | — |

### 4.6 Capa de mapeo snake_case → camelCase

Para minimizar cambios en el resto de `app.js`, las funciones que leen de Supabase deben mapear los nombres de columnas:

```javascript
// Ejemplo: al leer ranking_user
function mapRanking(row) {
  return {
    nombre: row.nombre,
    email: row.email,
    questPoints: row.quest_points,
    testsPoints: row.tests_points,
    pillsPoints: row.pills_points,
    pillsRankPillId: row.pills_rank_pill_id,
    pillsRankTiempo: row.pills_rank_tiempo,
    puntos: row.puntos,
    tiempo: row.tiempo,
    fecha: row.fecha,
    seniority: row.seniority,
    especialidad: row.especialidad
  };
}
```

Así el resto del código sigue usando `questPoints`, `testsPoints`, etc. sin cambios.

---

## 5. Row Level Security (RLS)

```sql
-- Preguntas: lectura para usuarios autenticados
ALTER TABLE banco_preguntas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read" ON banco_preguntas FOR SELECT TO authenticated USING (true);

ALTER TABLE preguntas_evaluacion ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read" ON preguntas_evaluacion FOR SELECT TO authenticated USING (true);

ALTER TABLE pills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read" ON pills FOR SELECT TO authenticated USING (true);

ALTER TABLE pill_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read" ON pill_questions FOR SELECT TO authenticated USING (true);

-- Perfil: solo leer/escribir el propio
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own profile read" ON user_profiles FOR SELECT TO authenticated
  USING (id = auth.uid());
CREATE POLICY "Own profile write" ON user_profiles FOR ALL TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- Pill scores: solo leer/escribir los propios
ALTER TABLE user_pill_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own scores" ON user_pill_scores FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Rankings: todos pueden leer (para leaderboards), solo escribir el propio
ALTER TABLE ranking_user ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read all" ON ranking_user FOR SELECT TO authenticated USING (true);
CREATE POLICY "Write own" ON ranking_user FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Update own" ON ranking_user FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Sellos: catálogo visible para todos, asignaciones propias
ALTER TABLE sellos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read all" ON sellos FOR SELECT TO authenticated USING (true);

ALTER TABLE user_sellos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read own" ON user_sellos FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Insert own" ON user_sellos FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Habilidades: catálogo visible para todos, asignaciones propias
ALTER TABLE habilidades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read all" ON habilidades FOR SELECT TO authenticated USING (true);

ALTER TABLE user_habilidades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read own" ON user_habilidades FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Admins: políticas extra para rol admin (pueden leer todo)
-- Se implementa con función helper:
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin';
$$ LANGUAGE sql SECURITY DEFINER;

-- Ejemplo: admins pueden leer todos los perfiles
CREATE POLICY "Admin read all profiles" ON user_profiles FOR SELECT TO authenticated
  USING (is_admin());
CREATE POLICY "Admin read all sellos" ON user_sellos FOR SELECT TO authenticated
  USING (is_admin());
CREATE POLICY "Admin read all habilidades" ON user_habilidades FOR SELECT TO authenticated
  USING (is_admin());
```

---

## 6. Plan de migración de datos

### Fase 1: Preparar Supabase
1. Crear proyecto en Supabase
2. Ejecutar todos los `CREATE TABLE` de este spec
3. Configurar todas las políticas RLS
4. Crear la función `is_admin()`

### Fase 2: Migrar usuarios
1. Exportar lista de emails de Firebase (colecciones `ranking_user` y `admins`)
2. Crear usuarios en Supabase con Admin API:
   - Email + `force_password_change: true` en `app_metadata`
   - `role: 'admin'` o `role: 'user'` según corresponda
   - SIN password (el usuario lo crea en su primer login)
3. Crear registros en `user_profiles` y `ranking_user` para cada usuario

### Fase 3: Migrar datos de solo lectura
1. Exportar `banco_preguntas` de Firestore → insertar en Supabase
2. Exportar `preguntas_evaluacion` → insertar en Supabase
3. Exportar `pills` → insertar en Supabase
4. Exportar subcolecciones `pills/*/questions` → insertar en `pill_questions` con FK
5. Normalizar campo `seniority` (unificar variantes de nombre)

### Fase 4: Migrar datos de usuarios
1. Exportar `ranking_user` → insertar en tabla `ranking_user` (sin campos legacy de password)
2. Exportar `users` → insertar en `user_profiles`
3. Convertir `pillScores` (map) → registros en `user_pill_scores`
4. Exportar `sellos` → insertar en tabla `sellos` + `user_sellos` (desnormalizar array)
5. Exportar `habilidades` → insertar en tabla `habilidades` + `user_habilidades`

### Fase 5: Migrar código
1. Reemplazar imports Firebase por Supabase CDN
2. Reemplazar init Firebase por `createClient()`
3. Migrar login flow (eliminar anónimo, usar rol de metadata)
4. Dividir `loadQuestionsFromFirebase()` en funciones por sección
5. Migrar cada función de lectura/escritura
6. Agregar capa de mapeo snake_case → camelCase
7. Agregar lógica de asignación de sellos por rendimiento
8. Eliminar todo código de auth anónima y fallbacks

### Fase 6: Testing
1. Probar login con usuario existente (debe pedir cambio de password)
2. Probar cada modo (práctica, evaluación, pills)
3. Probar guardado de puntajes
4. Probar rankings/leaderboards
5. Probar asignación de sellos
6. Probar perfil (sellos, habilidades, datos)
7. Probar login admin

---

## 7. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| IDs de Firestore (strings) vs UUID de Supabase | Generar nuevos UUIDs; mantener email como UNIQUE para lookups |
| Subcolección `pills/*/questions` → tabla plana | FK `pill_id` mantiene la relación |
| Arrays `asignado_a` en sellos/habilidades | Normalizado a tablas JOIN |
| Map `pillScores` anidado | Normalizado a tabla `user_pill_scores` |
| Passwords en texto plano (legacy) | NO se migran, todos hacen reset |
| `merge: true` de Firestore | `upsert()` con `onConflict` en Supabase |
| Campos con nombres inconsistentes | Normalizar a snake_case en DB, mapear a camelCase en JS |
| Usuarios no pueden entrar sin nueva password | Flujo `forcePasswordChange` ya existe en la app |
| Downtime durante migración | Hacer migración de datos primero, luego switch de código |

---

## 8. Etiquetas/campos que DEBEN mantenerse en el código JS

La capa de mapeo convierte snake_case (Supabase) → camelCase (app.js). Estos nombres NO deben cambiar en el código:

```
// Preguntas (después de normalización existente):
question, options, explanation, category, seniority, studyTag, correctAnswer, type, active

// Usuario/ranking (usados en UI y lógica):
questPoints, testsPoints, pillsPoints, pillScores, nombre, email, nickname, avatarUrl, seniority

// Pills:
name, category, description, link, id

// Sellos/habilidades:
nombre, icono
```

---

## 9. Diagrama de tablas

```
auth.users (Supabase Auth)
  ├── id (UUID)
  ├── email
  ├── app_metadata: { role, force_password_change }
  │
  ├──→ user_profiles (1:1)
  │      ├── id = auth.users.id
  │      ├── nombre, nickname, avatar_url
  │      └── quest_points, tests_points, pills_points, seniority
  │
  ├──→ ranking_user (1:1)
  │      ├── user_id → auth.users.id
  │      ├── email (UNIQUE)
  │      └── quest_points, tests_points, pills_points, puntos, tiempo...
  │
  ├──→ user_pill_scores (1:N)
  │      ├── user_id → auth.users.id
  │      └── pill_id → pills.id, score, total
  │
  ├──→ user_sellos (N:M)
  │      ├── user_id → auth.users.id
  │      └── sello_id → sellos.id, fecha_asignacion
  │
  └──→ user_habilidades (N:M)
         ├── user_id → auth.users.id
         └── habilidad_id → habilidades.id

pills
  ├── id, name, category, description, link, published_at, sort_order
  └──→ pill_questions (1:N)
         └── pill_id → pills.id, question, correct_answer, explanation...

sellos
  └── id, nombre, icono, pill_id → pills.id, umbral_porcentaje

habilidades
  └── id, nombre, icono

banco_preguntas
  └── id, q, a, b, c, correcta, cat, expl, tag, seniority

preguntas_evaluacion
  └── id, q, a, b, c, correcta, cat, expl, tag, seniority
```
