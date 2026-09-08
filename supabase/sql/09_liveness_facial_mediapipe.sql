-- Sistema de Marcación y Horarios
-- Script 09: prueba de vida facial con MediaPipe
-- Ejecutar manualmente desde Supabase > SQL Editor DESPUÉS de 08_passkeys_geocerca_y_marcacion_dashboard.sql.
--
-- No almacena fotografías, videos, embeddings ni plantillas faciales.
-- Solo amplía los códigos de reto aceptados por las sesiones efímeras.

begin;

alter table public.attendance_marking_sessions
  drop constraint if exists attendance_marking_sessions_challenge_check;

alter table public.attendance_marking_sessions
  add constraint attendance_marking_sessions_challenge_check
  check (
    challenge_code in (
      -- Códigos históricos del motor 08. Se conservan para no invalidar
      -- filas efímeras creadas antes de aplicar este script.
      'hold_2s',
      'tap_3',
      'type_code',
      -- Retos faciales generados por el motor actual.
      'blink_twice',
      'mouth_open',
      'brow_raise',
      'nose_sneer'
    )
  );

comment on column public.attendance_marking_sessions.challenge_code
is 'Reto efímero asignado a una sesión de marcación. Desde el script 09 puede representar una acción facial validada localmente con MediaPipe Face Landmarker.';

comment on column public.attendance_marking_sessions.liveness_verified_at
is 'Momento en que el backend aceptó la evidencia estructurada de la prueba de vida correspondiente al reto de la sesión.';

commit;
