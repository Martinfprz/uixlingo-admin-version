# Spec: Sistema de Sellos en Pills — UiX-lingo

**Fecha:** Abril 2026  
**Scope:** App de usuarios (lectura y otorgamiento de sellos).  
El admin panel ya tiene implementada la creación y gestión de sellos.

---

## 1. Contexto general

Las **Pills** son cápsulas de aprendizaje. Cada pill puede tener asociado un **sello en disputa**: una imagen GIF/PNG que el usuario puede ganarse si completa la prueba V/F con puntaje perfecto o con máximo 1 error.

Este spec describe qué existe ya en la base de datos, cómo leerlo, y qué debe implementar el frontend de usuarios.

---

## 2. Base de datos — Supabase

### 2.1 Tabla `pills`

Columnas relevantes para sellos:

| Columna       | Tipo   | Descripción                                               |
|---------------|--------|-----------------------------------------------------------|
| `id`          | uuid   | Identificador único de la pill                            |
| `name`        | text   | Nombre de la pill                                         |
| `description` | text   | Descripción breve (opcional)                              |
| `link`        | text   | URL a la grabación de la pill                             |
| `seal_path`   | text   | Ruta interna en Storage: `pill-{id}/{timestamp}-{nombre}` |
| `seal_url`    | text   | URL pública del sello (lista para usar en `<img>`)        |
| `seal_name`   | text   | Nombre original del archivo subido                        |

> Si `seal_url` es `null` o vacío, esa pill no tiene sello en disputa.

### 2.2 Tabla `pill_questions`

Preguntas Verdadero/Falso asociadas a una pill.

| Columna        | Tipo    | Descripción                            |
|----------------|---------|----------------------------------------|
| `id`           | uuid    | Identificador de la pregunta           |
| `pill_id`      | uuid    | FK → `pills.id`                        |
| `question`     | text    | Afirmación a evaluar (V o F)           |
| `correct_answer` | boolean | `true` = Verdadero, `false` = Falso  |
| `explanation`  | text    | Feedback tras responder                |
| `type`         | text    | Siempre `'true_false'`                 |
| `active`       | boolean | Si la pregunta está activa             |

### 2.3 Tabla `ranking_user`

Columnas relacionadas con pills:

| Columna              | Tipo    | Descripción                                         |
|----------------------|---------|-----------------------------------------------------|
| `email`              | text    | PK / identificador del usuario                      |
| `pills_points`       | numeric | Puntos acumulados de pills                          |
| `pills_rank_pill_id` | text    | ID de la pill en cuyo ranking se posiciona el usuario |

### 2.4 Storage — bucket `sellos-pill`

- **Bucket:** `sellos-pill` (público para lectura)
- **Ruta de archivos:** `pill-{pill_uuid}/{timestamp}-{nombre_sanitizado}.gif`
- **Formatos:** GIF, PNG, WEBP, JPG
- **La URL pública** está guardada directamente en `pills.seal_url`, no es necesario construirla.

---

## 3. Regla de negocio — ¿cuándo se otorga el sello?

El sello se otorga si el usuario completa la prueba V/F de la pill con:
- **Puntaje perfecto** (0 errores), **o**
- **Máximo 1 error**

El sello solo se puede ganar **una vez por usuario por pill** (idempotente).

---

## 4. Tabla sugerida para registrar sellos ganados

> Esta tabla **aún no existe** y debe crearse con el siguiente SQL antes de implementar el otorgamiento:

```sql
create table if not exists public.user_pill_badges (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null,
  pill_id      uuid not null references public.pills(id) on delete cascade,
  score        numeric,
  errors       int,
  awarded_at   timestamptz not null default now(),
  unique (user_id, pill_id)
);

-- Índice para consultas por usuario
create index if not exists idx_user_pill_badges_user_id
  on public.user_pill_badges(user_id);
```

---

## 5. Flujo esperado en la app de usuarios

```
1. Usuario entra a la vista de Pills
2. Se listan las pills desde tabla `pills`
3. Si la pill tiene `seal_url` → mostrar el sello como incentivo visual
4. Usuario entra a la pill → ve el contenido (link a grabación)
5. Usuario inicia la prueba V/F
6. Al terminar → calcular errores
7. Si errores <= 1:
   → Insertar en `user_pill_badges` (con on conflict do nothing)
   → Mostrar animación/celebración con el sello ganado
8. Si errores > 1:
   → Mostrar resultado sin sello
   → Permitir reintentar (sin otorgar sello si ya fue ganado)
9. En el perfil del usuario → mostrar sellos ganados
   (JOIN entre `user_pill_badges` y `pills` para obtener `seal_url` y `seal_name`)
```

---

## 6. Queries de referencia

### Listar pills con su sello
```sql
select id, name, description, link, seal_url, seal_name
from pills
order by name asc;
```

### Preguntas V/F de una pill
```sql
select id, question, correct_answer, explanation
from pill_questions
where pill_id = '{pill_id}'
  and active = true;
```

### Verificar si usuario ya ganó sello de una pill
```sql
select id from user_pill_badges
where user_id = '{user_id}'
  and pill_id = '{pill_id}';
```

### Otorgar sello (idempotente)
```sql
insert into user_pill_badges (user_id, pill_id, score, errors)
values ('{user_id}', '{pill_id}', {score}, {errors})
on conflict (user_id, pill_id) do nothing;
```

### Sellos ganados por un usuario (para perfil)
```sql
select
  upb.awarded_at,
  upb.score,
  upb.errors,
  p.id        as pill_id,
  p.name      as pill_name,
  p.seal_url,
  p.seal_name
from user_pill_badges upb
join pills p on p.id = upb.pill_id
where upb.user_id = '{user_id}'
order by upb.awarded_at desc;
```

---

## 7. Consideraciones de seguridad

- El otorgamiento de sello (`insert into user_pill_badges`) **debe hacerse desde una Edge Function** con `service_role`, nunca directo desde el cliente, para evitar auto-otorgamiento fraudulento.
- La Edge Function debe validar:
  1. Usuario autenticado (JWT válido)
  2. `pill_id` existe en tabla `pills`
  3. Recalcular `errors` a partir de las respuestas enviadas (no confiar en el valor del cliente)
  4. Insertar con `on conflict do nothing` para idempotencia

---

## 8. Resumen de lo que ya existe (admin panel)

| Feature                              | Estado     |
|--------------------------------------|------------|
| CRUD de Pills (nombre, link, descripción) | ✅ Listo |
| Subida de sello GIF/PNG al bucket `sellos-pill` | ✅ Listo |
| Guardado de `seal_path`, `seal_url`, `seal_name` en tabla `pills` | ✅ Listo |
| CRUD de preguntas V/F por pill (`pill_questions`) | ✅ Listo |
| Visualización de sello en admin panel | ✅ Listo |
| Tabla `user_pill_badges`             | ⚠️ Pendiente crear con SQL del punto 4 |
| Edge Function de otorgamiento        | ⚠️ Pendiente implementar |
| Vista de sellos ganados en perfil de usuario | ⚠️ Pendiente implementar |
