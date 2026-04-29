-- Opcional: solo si quieres distinguir en BD los sellos asignados desde el admin.
-- El admin ya no envía este campo por defecto (compatible con el schema del spec).

alter table public.user_pill_badges
  add column if not exists awarded_manually boolean default false;

comment on column public.user_pill_badges.awarded_manually is
  'true si el sello fue asignado manualmente en el panel admin; false si lo ganó por la app.';
