-- Agrega la columna quarter a la tabla pills
-- Ejecuta esto en Supabase → SQL Editor

alter table public.pills
  add column if not exists quarter text check (quarter in ('Q1','Q2','Q3','Q4')) default null;

comment on column public.pills.quarter is
  'Quarter del año al que pertenece la pill: Q1, Q2, Q3 o Q4. Null si no aplica.';
