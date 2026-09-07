-- Sistema de Marcación y Horarios
-- Script 05: horarios semanales por tienda
-- Ejecutar manualmente desde Supabase > SQL Editor DESPUÉS de 04_modulo_tiendas.sql.

alter table public.schedules
  add column if not exists shift_code text,
  add column if not exists break_minutes integer not null default 0;

alter table public.schedules
  drop constraint if exists schedules_shift_code_check;

alter table public.schedules
  add constraint schedules_shift_code_check
  check (shift_code is null or shift_code in ('A', 'C', 'AC', 'CUSTOM'));

alter table public.schedules
  drop constraint if exists schedules_break_minutes_check;

alter table public.schedules
  add constraint schedules_break_minutes_check
  check (break_minutes between 0 and 240);

create index if not exists schedules_store_week_idx
  on public.schedules(store_id, work_date, active);

create or replace function public.save_weekly_schedule(
  p_store_id uuid,
  p_week_start date,
  p_entries jsonb,
  p_actor_id uuid
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_entry jsonb;
  v_employee_id uuid;
  v_work_date date;
  v_shift_code text;
  v_start_time time;
  v_end_time time;
  v_break_minutes integer;
  v_tolerance_minutes integer;
  v_is_off boolean;
  v_existing_id uuid;
  v_existing_store uuid;
  v_saved integer := 0;
begin
  if p_entries is null or jsonb_typeof(p_entries) <> 'array' then
    raise exception 'La semana debe contener una lista de horarios' using errcode = '22023';
  end if;

  if not exists (select 1 from public.stores where id = p_store_id and active = true) then
    raise exception 'La tienda no existe o está inactiva' using errcode = 'P0002';
  end if;

  for v_entry in select value from jsonb_array_elements(p_entries)
  loop
    v_employee_id := (v_entry ->> 'employee_id')::uuid;
    v_work_date := (v_entry ->> 'work_date')::date;
    v_shift_code := nullif(v_entry ->> 'shift_code', '');
    v_is_off := coalesce((v_entry ->> 'is_off')::boolean, false);
    v_break_minutes := coalesce((v_entry ->> 'break_minutes')::integer, 0);
    v_tolerance_minutes := coalesce((v_entry ->> 'tolerance_minutes')::integer, 0);

    if v_work_date < p_week_start or v_work_date > p_week_start + 6 then
      raise exception 'Hay una fecha fuera de la semana seleccionada' using errcode = '22023';
    end if;

    if not exists (
      select 1
      from public.user_store_assignments usa
      join public.profiles p on p.id = usa.user_id
      where usa.store_id = p_store_id
        and usa.user_id = v_employee_id
        and p.active = true
    ) then
      raise exception 'Un trabajador no pertenece a la tienda seleccionada' using errcode = '22023';
    end if;

    if v_is_off then
      update public.schedules
      set active = false,
          updated_by = p_actor_id,
          updated_at = now()
      where employee_id = v_employee_id
        and work_date = v_work_date
        and active = true;
      v_saved := v_saved + 1;
      continue;
    end if;

    if v_shift_code not in ('A', 'C', 'AC', 'CUSTOM') then
      raise exception 'Tipo de turno inválido' using errcode = '22023';
    end if;

    v_start_time := (v_entry ->> 'start_time')::time;
    v_end_time := (v_entry ->> 'end_time')::time;

    if v_start_time is null or v_end_time is null or v_end_time <= v_start_time then
      raise exception 'La hora de salida debe ser posterior a la hora de ingreso' using errcode = '22023';
    end if;

    if v_break_minutes < 0 or v_break_minutes > 240 then
      raise exception 'Los minutos de almuerzo deben estar entre 0 y 240' using errcode = '22023';
    end if;

    if v_tolerance_minutes < 0 or v_tolerance_minutes > 180 then
      raise exception 'La tolerancia debe estar entre 0 y 180 minutos' using errcode = '22023';
    end if;

    select id, store_id
      into v_existing_id, v_existing_store
    from public.schedules
    where employee_id = v_employee_id
      and work_date = v_work_date
      and active = true
    limit 1;

    if v_existing_id is not null and v_existing_store <> p_store_id then
      raise exception 'El trabajador ya tiene un horario activo en otra tienda para esa fecha' using errcode = '23505';
    end if;

    if v_existing_id is not null then
      update public.schedules
      set store_id = p_store_id,
          start_time = v_start_time,
          end_time = v_end_time,
          shift_code = v_shift_code,
          break_minutes = v_break_minutes,
          tolerance_minutes = v_tolerance_minutes,
          active = true,
          updated_by = p_actor_id,
          updated_at = now()
      where id = v_existing_id;
    else
      insert into public.schedules (
        employee_id,
        store_id,
        work_date,
        start_time,
        end_time,
        shift_code,
        break_minutes,
        tolerance_minutes,
        active,
        created_by,
        updated_by
      ) values (
        v_employee_id,
        p_store_id,
        v_work_date,
        v_start_time,
        v_end_time,
        v_shift_code,
        v_break_minutes,
        v_tolerance_minutes,
        true,
        p_actor_id,
        p_actor_id
      );
    end if;

    v_saved := v_saved + 1;
    v_existing_id := null;
    v_existing_store := null;
  end loop;

  insert into public.audit_logs (
    actor_id,
    action,
    entity_type,
    entity_id,
    payload
  ) values (
    p_actor_id,
    'schedule.week.save',
    'store',
    p_store_id,
    jsonb_build_object(
      'week_start', p_week_start,
      'entries', v_saved
    )
  );

  return v_saved;
end;
$$;

revoke all on function public.save_weekly_schedule(uuid, date, jsonb, uuid)
from public, anon, authenticated;

grant execute on function public.save_weekly_schedule(uuid, date, jsonb, uuid)
to service_role;

comment on function public.save_weekly_schedule(uuid, date, jsonb, uuid)
is 'Guarda de forma transaccional una matriz semanal de horarios por tienda. Solo servidor.';
