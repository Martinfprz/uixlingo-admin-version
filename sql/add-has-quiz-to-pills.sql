-- Ejecutar en Supabase → SQL Editor (una sola vez)
-- Corrige: PGRST204 "Could not find the 'has_quiz' column of 'pills'"

alter table public.pills
  add column if not exists has_quiz boolean not null default true;

comment on column public.pills.has_quiz is
  'Si true: la pill puede tener prueba V/F en la app. Si false: solo sello asignado manualmente en admin.';
