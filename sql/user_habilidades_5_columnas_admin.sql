-- SQL idempotente para habilitar asignación de 5 talentos por usuario desde admin.
-- Seguro para ejecutar múltiples veces.

ALTER TABLE public.user_habilidades
    ADD COLUMN IF NOT EXISTS habilidad_id_1 uuid REFERENCES public.habilidades (id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS habilidad_id_2 uuid REFERENCES public.habilidades (id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS habilidad_id_3 uuid REFERENCES public.habilidades (id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS habilidad_id_4 uuid REFERENCES public.habilidades (id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS habilidad_id_5 uuid REFERENCES public.habilidades (id) ON DELETE SET NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'user_habilidades_user_id_key'
    ) THEN
        ALTER TABLE public.user_habilidades
            ADD CONSTRAINT user_habilidades_user_id_key UNIQUE (user_id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_habilidades_user_id
    ON public.user_habilidades (user_id);

