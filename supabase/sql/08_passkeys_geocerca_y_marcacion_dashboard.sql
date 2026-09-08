-- Sistema de Marcación y Horarios
-- Script 08: Passkeys, geocerca y marcación administrativa
-- Ejecutar manualmente desde Supabase > SQL Editor DESPUÉS de 07_motor_marcacion_publica.sql.
--
-- Este script NO almacena plantillas biométricas, huellas ni rostros.
-- WebAuthn/Passkeys delega la verificación local al autenticador del dispositivo
-- y el servidor conserva únicamente credenciales criptográficas públicas.

alter table public.stores
  add column if not exists attendance_radius_meters integer not null default 100;

alter table public.stores
  drop constraint if exists stores_attendance_radius_meters_check;

alter table public.stores
  add constraint stores_attendance_radius_meters_check
  check (attendance_radius_meters between 20 and 1000);

create table if not exists public.employee_passkeys (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  credential_id text not null unique,
  public_key text not null,
  counter bigint not null default 0,
  transports text[] not null default '{}'::text[],
  device_type text,
  backed_up boolean not null default false,
  webauthn_user_id text not null,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists employee_passkeys_employee_idx
  on public.employee_passkeys(employee_id, created_at desc)
  where revoked_at is null;

create table if not exists public.passkey_enrollment_tokens (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  code_hash text not null,
  registration_challenge text,
  created_by uuid references auth.users(id),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists passkey_enrollment_tokens_code_hash_idx
  on public.passkey_enrollment_tokens(code_hash)
  where used_at is null;

create index if not exists passkey_enrollment_tokens_employee_idx
  on public.passkey_enrollment_tokens(employee_id, created_at desc);

alter table public.employee_passkeys enable row level security;
alter table public.passkey_enrollment_tokens enable row level security;

revoke all on public.employee_passkeys from public, anon, authenticated;
revoke all on public.passkey_enrollment_tokens from public, anon, authenticated;

alter table public.attendance_marking_sessions
  add column if not exists webauthn_challenge text,
  add column if not exists passkey_verified_at timestamptz,
  add column if not exists passkey_credential_id text,
  add column if not exists liveness_value text,
  add column if not exists liveness_verified_at timestamptz,
  add column if not exists location_verified_at timestamptz,
  add column if not exists location_distance_meters numeric;

alter table public.attendance_marking_sessions
  drop constraint if exists attendance_marking_sessions_challenge_check;

alter table public.attendance_marking_sessions
  add constraint attendance_marking_sessions_challenge_check
  check (challenge_code in ('hold_2s', 'tap_3', 'type_code'));

create or replace function public.register_public_attendance_mark_v2(
  p_session_id uuid,
  p_token_hash text,
  p_latitude numeric,
  p_longitude numeric,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_session public.attendance_marking_sessions%rowtype;
  v_schedule public.schedules%rowtype;
  v_store public.stores%rowtype;
  v_attendance public.attendance_records%rowtype;
  v_expected public.attendance_mark_type;
  v_history_event public.attendance_event_type;
  v_status public.attendance_status;
  v_now timestamptz := now();
  v_local_time time;
  v_attendance_id uuid;
  v_lat1 double precision;
  v_lat2 double precision;
  v_dlat double precision;
  v_dlon double precision;
  v_a double precision;
  v_distance numeric;
begin
  if p_latitude is null or p_longitude is null then
    raise exception 'La ubicación es obligatoria para registrar asistencia' using errcode = '22023';
  end if;

  if p_latitude < -90 or p_latitude > 90 then
    raise exception 'Latitud inválida' using errcode = '22023';
  end if;

  if p_longitude < -180 or p_longitude > 180 then
    raise exception 'Longitud inválida' using errcode = '22023';
  end if;

  select * into v_session
  from public.attendance_marking_sessions
  where id = p_session_id
    and token_hash = p_token_hash
  for update;

  if not found then
    raise exception 'Sesión de marcación inválida' using errcode = 'P0002';
  end if;

  if v_session.used_at is not null then
    raise exception 'La sesión de marcación ya fue utilizada' using errcode = 'P0001';
  end if;

  if v_session.expires_at <= v_now then
    raise exception 'La sesión de marcación expiró' using errcode = 'P0001';
  end if;

  if v_session.passkey_verified_at is null or v_session.passkey_credential_id is null then
    raise exception 'Falta validar la credencial del dispositivo' using errcode = 'P0001';
  end if;

  if v_session.liveness_verified_at is null then
    raise exception 'Falta completar la firma de vida interactiva' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.employee_passkeys pk
    where pk.employee_id = v_session.employee_id
      and pk.credential_id = v_session.passkey_credential_id
      and pk.revoked_at is null
  ) then
    raise exception 'La credencial validada ya no está disponible' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = v_session.employee_id
      and p.active = true
  ) then
    raise exception 'Trabajador no disponible para marcación' using errcode = 'P0001';
  end if;

  select * into v_schedule
  from public.schedules
  where id = v_session.schedule_id
    and employee_id = v_session.employee_id
    and store_id = v_session.store_id
    and work_date = v_session.work_date
    and active = true;

  if not found then
    raise exception 'El horario ya no está disponible' using errcode = 'P0001';
  end if;

  if v_session.work_date <> (v_now at time zone 'America/Lima')::date then
    raise exception 'La fecha de la sesión ya no corresponde al día de trabajo' using errcode = 'P0001';
  end if;

  select * into v_store
  from public.stores
  where id = v_session.store_id
    and active = true;

  if not found or v_store.latitude is null or v_store.longitude is null then
    raise exception 'La tienda no tiene una geocerca válida configurada' using errcode = 'P0001';
  end if;

  v_lat1 := radians(v_store.latitude::double precision);
  v_lat2 := radians(p_latitude::double precision);
  v_dlat := radians((p_latitude - v_store.latitude)::double precision);
  v_dlon := radians((p_longitude - v_store.longitude)::double precision);
  v_a := sin(v_dlat / 2) * sin(v_dlat / 2)
    + cos(v_lat1) * cos(v_lat2) * sin(v_dlon / 2) * sin(v_dlon / 2);
  v_distance := round((6371000 * 2 * atan2(sqrt(v_a), sqrt(1 - v_a)))::numeric, 2);

  if v_distance > v_store.attendance_radius_meters then
    raise exception 'La ubicación está fuera del radio permitido de la tienda' using errcode = 'P0001';
  end if;

  update public.attendance_marking_sessions
  set location_verified_at = v_now,
      location_distance_meters = v_distance
  where id = v_session.id;

  select * into v_attendance
  from public.attendance_records
  where employee_id = v_session.employee_id
    and work_date = v_session.work_date
  for update;

  if not found or v_attendance.check_in is null then
    v_expected := 'check_in';
  elsif v_schedule.break_minutes > 0 and v_attendance.break_out is null then
    v_expected := 'break_out';
  elsif v_schedule.break_minutes > 0 and v_attendance.break_in is null then
    v_expected := 'break_in';
  elsif v_attendance.check_out is null then
    v_expected := 'check_out';
  else
    raise exception 'La jornada de hoy ya está completa' using errcode = 'P0001';
  end if;

  if v_expected <> v_session.expected_event then
    raise exception 'La secuencia de marcación cambió. Inicia nuevamente.' using errcode = 'P0001';
  end if;

  if v_expected = 'check_in' then
    v_local_time := (v_now at time zone 'America/Lima')::time;
    if v_local_time > (v_schedule.start_time + make_interval(mins => v_schedule.tolerance_minutes)) then
      v_status := 'late';
    else
      v_status := 'present';
    end if;

    if v_attendance.id is null then
      insert into public.attendance_records (
        employee_id, store_id, schedule_id, work_date, check_in, status
      ) values (
        v_session.employee_id, v_session.store_id, v_session.schedule_id,
        v_session.work_date, v_now, v_status
      )
      returning * into v_attendance;
    else
      update public.attendance_records
      set store_id = v_session.store_id,
          schedule_id = v_session.schedule_id,
          check_in = v_now,
          status = v_status,
          updated_at = v_now
      where id = v_attendance.id
      returning * into v_attendance;
    end if;
  elsif v_expected = 'break_out' then
    update public.attendance_records
    set break_out = v_now, updated_at = v_now
    where id = v_attendance.id
    returning * into v_attendance;
  elsif v_expected = 'break_in' then
    update public.attendance_records
    set break_in = v_now, updated_at = v_now
    where id = v_attendance.id
    returning * into v_attendance;
  else
    update public.attendance_records
    set check_out = v_now, updated_at = v_now
    where id = v_attendance.id
    returning * into v_attendance;
  end if;

  v_attendance_id := v_attendance.id;
  v_history_event := case
    when v_expected = 'check_in' then 'check_in'::public.attendance_event_type
    when v_expected = 'check_out' then 'check_out'::public.attendance_event_type
    else 'manual_adjustment'::public.attendance_event_type
  end;

  insert into public.attendance_events (
    attendance_id, employee_id, store_id, event_type, occurred_at, source, metadata
  ) values (
    v_attendance_id,
    v_session.employee_id,
    v_session.store_id,
    v_history_event,
    v_now,
    'public_dni',
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'mark_type', v_expected,
      'passkey_credential_id', v_session.passkey_credential_id,
      'challenge_code', v_session.challenge_code,
      'location_verified', true,
      'distance_meters', v_distance,
      'store_radius_meters', v_store.attendance_radius_meters,
      'latitude', p_latitude,
      'longitude', p_longitude,
      'face_image_stored', false,
      'server_biometric_template_stored', false
    )
  );

  update public.attendance_marking_sessions
  set used_at = v_now
  where id = v_session.id;

  return jsonb_build_object(
    'event', v_expected,
    'occurred_at', v_now,
    'attendance_status', v_attendance.status,
    'work_date', v_session.work_date,
    'distance_meters', v_distance
  );
end;
$$;

revoke all on function public.register_public_attendance_mark_v2(uuid, text, numeric, numeric, jsonb)
from public, anon, authenticated;

grant execute on function public.register_public_attendance_mark_v2(uuid, text, numeric, numeric, jsonb)
to service_role;

create or replace function public.register_admin_attendance_mark(
  p_employee_id uuid,
  p_store_id uuid,
  p_work_date date,
  p_actor_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_schedule public.schedules%rowtype;
  v_attendance public.attendance_records%rowtype;
  v_expected public.attendance_mark_type;
  v_history_event public.attendance_event_type;
  v_status public.attendance_status;
  v_now timestamptz := now();
  v_local_time time;
begin
  if p_reason is null or length(trim(p_reason)) < 5 then
    raise exception 'La marcación administrativa requiere un motivo de al menos 5 caracteres' using errcode = '22023';
  end if;

  select * into v_schedule
  from public.schedules
  where employee_id = p_employee_id
    and store_id = p_store_id
    and work_date = p_work_date
    and active = true
  limit 1;

  if not found then
    raise exception 'No existe un horario activo para el trabajador en esa tienda y fecha' using errcode = 'P0002';
  end if;

  select * into v_attendance
  from public.attendance_records
  where employee_id = p_employee_id
    and work_date = p_work_date
  for update;

  if not found or v_attendance.check_in is null then
    v_expected := 'check_in';
  elsif v_schedule.break_minutes > 0 and v_attendance.break_out is null then
    v_expected := 'break_out';
  elsif v_schedule.break_minutes > 0 and v_attendance.break_in is null then
    v_expected := 'break_in';
  elsif v_attendance.check_out is null then
    v_expected := 'check_out';
  else
    raise exception 'La jornada ya está completa' using errcode = 'P0001';
  end if;

  if v_expected = 'check_in' then
    v_local_time := (v_now at time zone 'America/Lima')::time;
    if p_work_date = (v_now at time zone 'America/Lima')::date
      and v_local_time > (v_schedule.start_time + make_interval(mins => v_schedule.tolerance_minutes)) then
      v_status := 'late';
    else
      v_status := 'present';
    end if;

    if v_attendance.id is null then
      insert into public.attendance_records (
        employee_id, store_id, schedule_id, work_date, check_in, status, updated_by
      ) values (
        p_employee_id, p_store_id, v_schedule.id, p_work_date, v_now, v_status, p_actor_id
      ) returning * into v_attendance;
    else
      update public.attendance_records
      set check_in = v_now,
          status = v_status,
          updated_by = p_actor_id,
          updated_at = v_now
      where id = v_attendance.id
      returning * into v_attendance;
    end if;
  elsif v_expected = 'break_out' then
    update public.attendance_records
    set break_out = v_now, updated_by = p_actor_id, updated_at = v_now
    where id = v_attendance.id returning * into v_attendance;
  elsif v_expected = 'break_in' then
    update public.attendance_records
    set break_in = v_now, updated_by = p_actor_id, updated_at = v_now
    where id = v_attendance.id returning * into v_attendance;
  else
    update public.attendance_records
    set check_out = v_now, updated_by = p_actor_id, updated_at = v_now
    where id = v_attendance.id returning * into v_attendance;
  end if;

  v_history_event := case
    when v_expected = 'check_in' then 'check_in'::public.attendance_event_type
    when v_expected = 'check_out' then 'check_out'::public.attendance_event_type
    else 'manual_adjustment'::public.attendance_event_type
  end;

  insert into public.attendance_events (
    attendance_id, employee_id, store_id, event_type, occurred_at, source, created_by, metadata
  ) values (
    v_attendance.id, p_employee_id, p_store_id, v_history_event, v_now, 'admin', p_actor_id,
    jsonb_build_object('mark_type', v_expected, 'reason', trim(p_reason), 'administrative_override', true)
  );

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, payload)
  values (
    p_actor_id,
    'attendance.admin.mark',
    'attendance_record',
    v_attendance.id,
    jsonb_build_object(
      'employee_id', p_employee_id,
      'store_id', p_store_id,
      'work_date', p_work_date,
      'mark_type', v_expected,
      'reason', trim(p_reason)
    )
  );

  return jsonb_build_object(
    'event', v_expected,
    'occurred_at', v_now,
    'attendance_status', v_attendance.status
  );
end;
$$;

revoke all on function public.register_admin_attendance_mark(uuid, uuid, date, uuid, text)
from public, anon, authenticated;

grant execute on function public.register_admin_attendance_mark(uuid, uuid, date, uuid, text)
to service_role;

comment on table public.employee_passkeys
is 'Credenciales WebAuthn por trabajador. Contiene claves públicas y metadatos del autenticador; no biometría.';

comment on table public.passkey_enrollment_tokens
is 'Autorizaciones temporales emitidas por un usuario administrativo para enrolar una Passkey desde el dispositivo del trabajador.';

comment on column public.stores.attendance_radius_meters
is 'Radio operativo de geocerca para la marcación pública, en metros.';

comment on function public.register_public_attendance_mark_v2(uuid, text, numeric, numeric, jsonb)
is 'Registra una marcación pública solo después de validar Passkey, firma de vida interactiva y geocerca.';

comment on function public.register_admin_attendance_mark(uuid, uuid, date, uuid, text)
is 'Registra la siguiente marca desde el dashboard con motivo obligatorio y auditoría.';
