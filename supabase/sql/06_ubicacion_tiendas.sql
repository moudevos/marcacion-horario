-- Sistema de Marcación y Horarios
-- Script 06: ubicación geográfica de tiendas
-- Ejecutar manualmente desde Supabase > SQL Editor DESPUÉS de 05_horarios_semanales.sql.

begin;

alter table public.stores
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;

alter table public.stores
  drop constraint if exists stores_coordinates_check;

alter table public.stores
  add constraint stores_coordinates_check
  check (
    (latitude is null and longitude is null)
    or (
      latitude between -90 and 90
      and longitude between -180 and 180
    )
  );

drop function if exists public.save_store_record(
  uuid, text, text, text, boolean, uuid, boolean, text
);

create function public.save_store_record(
  p_store_id uuid,
  p_code text,
  p_name text,
  p_address text,
  p_latitude double precision,
  p_longitude double precision,
  p_active boolean,
  p_actor_id uuid,
  p_assign_actor boolean,
  p_audit_action text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_store_id uuid;
  v_code text := upper(trim(p_code));
  v_name text := trim(p_name);
  v_address text := nullif(trim(coalesce(p_address, '')), '');
  v_has_primary boolean;
begin
  if length(v_code) < 2 then
    raise exception 'El código de tienda debe tener al menos 2 caracteres' using errcode = '22023';
  end if;

  if length(v_name) < 2 then
    raise exception 'El nombre de tienda debe tener al menos 2 caracteres' using errcode = '22023';
  end if;

  if (p_latitude is null and p_longitude is not null)
     or (p_latitude is not null and p_longitude is null) then
    raise exception 'La ubicación requiere latitud y longitud' using errcode = '22023';
  end if;

  if p_latitude is not null and (p_latitude < -90 or p_latitude > 90) then
    raise exception 'Latitud inválida' using errcode = '22023';
  end if;

  if p_longitude is not null and (p_longitude < -180 or p_longitude > 180) then
    raise exception 'Longitud inválida' using errcode = '22023';
  end if;

  if p_store_id is null then
    insert into public.stores (
      code,
      name,
      address,
      latitude,
      longitude,
      active,
      created_by
    )
    values (
      v_code,
      v_name,
      v_address,
      p_latitude,
      p_longitude,
      p_active,
      p_actor_id
    )
    returning id into v_store_id;

    if p_assign_actor then
      select exists (
        select 1
        from public.user_store_assignments
        where user_id = p_actor_id
          and is_primary = true
      ) into v_has_primary;

      insert into public.user_store_assignments (
        user_id,
        store_id,
        is_primary,
        assigned_by
      )
      values (
        p_actor_id,
        v_store_id,
        not v_has_primary,
        p_actor_id
      )
      on conflict (user_id, store_id) do nothing;
    end if;
  else
    update public.stores
    set
      code = v_code,
      name = v_name,
      address = v_address,
      latitude = p_latitude,
      longitude = p_longitude,
      active = p_active,
      updated_at = now()
    where id = p_store_id
    returning id into v_store_id;

    if v_store_id is null then
      raise exception 'La tienda no existe' using errcode = 'P0002';
    end if;
  end if;

  insert into public.audit_logs (
    actor_id,
    action,
    entity_type,
    entity_id,
    payload
  )
  values (
    p_actor_id,
    p_audit_action,
    'store',
    v_store_id,
    jsonb_build_object(
      'code', v_code,
      'name', v_name,
      'address', v_address,
      'latitude', p_latitude,
      'longitude', p_longitude,
      'active', p_active
    )
  );

  return v_store_id;
end;
$$;

create or replace function public.delete_store_record(
  p_store_id uuid,
  p_actor_id uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_store public.stores%rowtype;
begin
  select * into v_store
  from public.stores
  where id = p_store_id;

  if not found then
    raise exception 'La tienda no existe' using errcode = 'P0002';
  end if;

  if exists (select 1 from public.user_store_assignments where store_id = p_store_id) then
    raise exception 'No se puede eliminar: la tienda tiene personal asignado' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.schedules where store_id = p_store_id) then
    raise exception 'No se puede eliminar: la tienda tiene horarios relacionados' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.attendance_records where store_id = p_store_id)
     or exists (select 1 from public.attendance_events where store_id = p_store_id) then
    raise exception 'No se puede eliminar: la tienda tiene marcaciones relacionadas' using errcode = 'P0001';
  end if;

  insert into public.audit_logs (
    actor_id,
    action,
    entity_type,
    entity_id,
    payload
  )
  values (
    p_actor_id,
    'store.delete',
    'store',
    p_store_id,
    jsonb_build_object(
      'code', v_store.code,
      'name', v_store.name,
      'address', v_store.address,
      'latitude', v_store.latitude,
      'longitude', v_store.longitude,
      'active', v_store.active
    )
  );

  delete from public.stores
  where id = p_store_id;
end;
$$;

revoke all on function public.save_store_record(
  uuid, text, text, text, double precision, double precision, boolean, uuid, boolean, text
) from public, anon, authenticated;

grant execute on function public.save_store_record(
  uuid, text, text, text, double precision, double precision, boolean, uuid, boolean, text
) to service_role;

revoke all on function public.delete_store_record(uuid, uuid)
from public, anon, authenticated;

grant execute on function public.delete_store_record(uuid, uuid)
to service_role;

comment on column public.stores.latitude
is 'Latitud WGS84 del punto de trabajo. Debe existir junto con longitude.';

comment on column public.stores.longitude
is 'Longitud WGS84 del punto de trabajo. Debe existir junto con latitude.';

comment on function public.save_store_record(
  uuid, text, text, text, double precision, double precision, boolean, uuid, boolean, text
) is 'Crea o actualiza una tienda, incluida su ubicación geográfica, y registra auditoría. Solo servidor.';

commit;
