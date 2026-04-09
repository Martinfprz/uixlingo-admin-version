# UiX-lingo — Admin Panel

Panel de administración para la plataforma UiX-lingo. Permite gestionar usuarios, talentos, preguntas y rankings de participantes.

## Tecnologías

- **Frontend**: HTML5, CSS3, JavaScript (vanilla, ES Modules)
- **Backend / Auth**: [Supabase](https://supabase.com) (Authentication + Database + Edge Functions)
- **Deploy**: [Vercel](https://vercel.com) (sitio estático)

## Funcionalidades principales

- Login seguro con Supabase Auth (rol `admin`)
- Gestión de usuarios (carga masiva CSV, creación manual, eliminación)
- Asignación de talentos por usuario (individual y CSV masivo)
- Módulo de Rankings (Quest / Tests / Pills)
- Banco de preguntas con filtros
- Dashboard con estadísticas de participantes
- Soporte dark/light mode

## Estructura del proyecto

```
admin-version/
├── index.html              # Entrada principal
├── admin.js                # Lógica de la aplicación
├── styles.css              # Estilos
├── favicon.webp
├── logo.png
├── supabase/
│   └── functions/          # Edge Functions (Deno)
│       ├── admin-upsert-users/
│       ├── admin-delete-users/
│       ├── admin-list-users/
│       ├── admin-list-uixers/
│       ├── admin-list-skills-catalog/
│       ├── admin-upsert-user-skills/
│       └── admin-upsert-user-skills-csv/
├── sql/                    # Scripts SQL de soporte
└── templates/              # Plantillas CSV descargables
```

## Configuración (Supabase)

La conexión a Supabase está definida en `admin.js`:

```js
const SUPABASE_URL = 'https://<tu-proyecto>.supabase.co';
const SUPABASE_ANON_KEY = '<tu-anon-key>';
```

> La `anon key` es pública por diseño en Supabase. La seguridad de datos está protegida por Row Level Security (RLS) y Edge Functions con `SERVICE_ROLE_KEY`.

### Secrets requeridos en Edge Functions

Configurar desde Supabase Dashboard → Project Settings → Edge Functions o con CLI:

```bash
supabase secrets set SERVICE_ROLE_KEY=<tu-service-role-key>
```

## Deploy en Vercel

1. Sube el repositorio a GitHub.
2. En [vercel.com](https://vercel.com), importa el repositorio.
3. Vercel detecta automáticamente el sitio estático (`index.html` en raíz).
4. Sin variables de entorno requeridas en Vercel (la config de Supabase está en `admin.js`).
5. Deploy → listo.

## Deploy de Edge Functions (Supabase CLI)

```bash
supabase login
supabase link --project-ref <project-ref>
supabase functions deploy admin-upsert-users --no-verify-jwt
supabase functions deploy admin-delete-users --no-verify-jwt
supabase functions deploy admin-list-users --no-verify-jwt
supabase functions deploy admin-list-uixers --no-verify-jwt
supabase functions deploy admin-list-skills-catalog --no-verify-jwt
supabase functions deploy admin-upsert-user-skills --no-verify-jwt
supabase functions deploy admin-upsert-user-skills-csv --no-verify-jwt
```
