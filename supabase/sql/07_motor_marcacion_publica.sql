-- Sistema de Marcación y Horarios
-- Script 07: motor público de marcación por DNI, evidencia fotográfica y secuencia de eventos
-- Ejecutar manualmente desde Supabase > SQL Editor DESPUÉS de 06_ubicacion_tiendas.sql.
--
-- IMPORTANTE:
-- Este script NO implementa reconocimiento facial ni comparación biométrica automática.
-- La cámara se usa para evidencia privada y un reto aleatorio de presencia.

alter type public.attendance_event_type add value if not exists 'break_out';
alter type public.attendance_event_type add value if not exists 'break_in';

alter table public.attendance_records
  add column if not exists break_out timestamptz,
  add column if not exists break_in timestamptz;

alter table public.attendance_records
  drop constraint if exists attendance_break_sequence;

alter table public.attendance_records
  add constraint attendance_break_sequence
  check (
    (break_out is null or check_in is null or break_out >= check_in)
    and (break_in is null or break_out is null or break_in >= break_out)
    and (check_out is null or break_in is null or check_out >= break_in)
  );

create index if not exists attendance_records_employee_work_date_idx
  on public.attendance_records(employee_id, work_date);

create table if not exists public.attendance_marking_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  employee_id uuid not null references public.profiles(id),
  store_id uuid not null references public.stores(id),
  schedule_id uuid not null references public.schedules(id),
  work_date date not null,
  expected_event public.attendance_event_type not null,
  challenge_code text not null,
  request_fingerprint_hash text,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  constraint attendance_marking_sessions_event_check
    check (expected_event in ('check_in', 'break_out', 'break_in', 'check_out')),
  constraint attendance_marking_sessions_challenge_check
    check (challenge_code in ('turn_left', 'turn_right', 'hand_open', 'two_fingers'))
);

create index if not exists attendance_marking_sessions_employee_date_idx
  on public.attendance_marking_sessions(employee_id, work_date, created_at desc);

create index if not exists attendance_marking_sessions_expiry_idx
  on public.attendance_marking_sessions(expires_at)
  where used_at is null;

create table if not exists public.attendance_public_rate_limits (
  rate_key text primary key,
  window_started_at timestamptz not null default now(),
  attempts integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.attendance_marking_sessions enable row level security;
alter table public.attendance_public_rate_limits enable row level security;

revoke all on public.attendance_marking_sessions from public, anon, authenticated;
revoke all on public.attendance_public_rate_limits from public, anon, authenticated;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'attendance-evidence',
  'attendance-evidence',
  false,
  2097152,
  array['image/jpeg']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.consume_attendance_rate_limit(
  p_rate_key text,
  p_limit integer default 8,
  p_window_seconds integer default 600
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_row public.attendance_public_rate_limits%rowtype;
  v_now timestamptz := now();
begin
  if p_rate_key is null or length(trim(p_rate_key)) < 16 then
    return false;
  end if;

  select * into v_row
  from public.attendance_public_rate_limits
  where rate_key = p_rate_key
  for update;

  if not found then
    insert into public.attendance_public_rate_limits(rate_key, window_started_at, attempts, updated_at)
    values (p_rate_key, v_now, 1, v_now);
    return true;
  end if;

  if v_row.window_started_at + make_interval(secs => p_window_seconds) <= v_now then
    update public.attendance_public_rate_limits
    set window_started_at = v_now,
        attempts = 1,
        updated_at = v_now
    where rate_key = p_rate_key;
    return true;
  end if;

  if v_row.attempts >= p_limit then
    return false;
  end if;

  update public.attendance_public_rate_limits
  set attempts = attempts + 1,
      updated_at = v_now
  where rate_key = p_rate_key;

  return true;
end;
$$;

create or replace function public.register_public_attendance_mark(
  p_session_id uuid,
  p_token_hash text,
  p_evidence_path text,
  p_latitude numeric default null,
  p_longitude numeric default null,
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
  v_attendance public.attendance_records%rowtype;
  v_expected public.attendance_event_type;
  v_status public.attendance_status;
  v_now timestamptz := now();
  v_local_time time;
  v_attendance_id uuid;
begin
  if p_evidence_path is null or length(trim(p_evidence_path)) = 0 then
    raise exception 'La evidencia fotográfica es obligatoria' using errcode = '22023';
  end if;

  if (p_latitude is null) <> (p_longitude is null) then
    raise exception 'Latitud y longitud deben enviarse juntas' using errcode = '22023';
  end if;

  if p_latitude is not null and (p_latitude < -90 or p_latitude > 90) then
    raise exception 'Latitud inválida' using errcode = '22023';
  end if;

  if p_longitude is not null and (p_longitude < -180 or p_longitude > 180) then
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
        employee_id,
        store_id,
        schedule_id,
        work_date,
        check_in,
        status
      )
      values (
        v_session.employee_id,
        v_session.store_id,
        v_session.schedule_id,
        v_session.work_date,
        v_now,
        v_status
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
    set break_out = v_now,
        updated_at = v_now
    where id = v_attendance.id
    returning * into v_attendance;
  elsif v_expected = 'break_in' then
    update public.attendance_records
    set break_in = v_now,
        updated_at = v_now
    where id = v_attendance.id
    returning * into v_attendance;
  elsif v_expected = 'check_out' then
    update public.attendance_records
    set check_out = v_now,
        updated_at = v_now
    where id = v_attendance.id
    returning * into v_attendance;
  end if;

  v_attendance_id := v_attendance.id;

  insert into public.attendance_events (
    attendance_id,
    employee_id,
    store_id,
    event_type,
    occurred_at,
    source,
    metadata
  )
  values (
    v_attendance_id,
    v_session.employee_id,
    v_session.store_id,
    v_expected,
    v_now,
    'public_dni',
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'evidence_path', p_evidence_path,
      'challenge_code', v_session.challenge_code,
      'latitude', p_latitude,
      'longitude', p_longitude
    )
  );

  update public.attendance_marking_sessions
  set used_at = v_now
  where id = v_session.id;

  return jsonb_build_object(
    'event', v_expected,
    'occurred_at', v_now,
    'attendance_status', v_attendance.status,
    'work_date', v_session.work_date
  );
end;
$$;

revoke all on function public.consume_attendance_rate_limit(text, integer, integer)
from public, anon, authenticated;

grant execute on function public.consume_attendance_rate_limit(text, integer, integer)
to service_role;

revoke all on function public.register_public_attendance_mark(uuid, text, text, numeric, numeric, jsonb)
from public, anon, authenticated;

grant execute on function public.register_public_attendance_mark(uuid, text, text, numeric, numeric, jsonb)
to service_role;

comment on table public.attendance_marking_sessions
is 'Sesiones efímeras para la marcación pública. No expuestas a clientes.';

comment on function public.register_public_attendance_mark(uuid, text, text, numeric, numeric, jsonb)
is 'Registra de forma transaccional ingreso, salida/retorno de almuerzo o salida final a partir de una sesión pública validada. Solo servidor.';
