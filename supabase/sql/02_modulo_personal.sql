-- Sistema de Marcación y Horarios
-- Script 02: soporte transaccional para el módulo de Personal
-- Ejecutar manualmente desde Supabase > SQL Editor DESPUÉS de 01_esquema_inicial.sql.
-- Este script no crea usuarios de Auth. Solo prepara integridad, rendimiento y la operación atómica de perfiles.

create index if not exists profiles_active_position_idx
  on public.profiles(active, position);

create index if not exists user_store_assignments_store_user_idx
  on public.user_store_assignments(store_id, user_id);

create index if not exists audit_logs_entity_created_idx
  on public.audit_logs(entity_type, entity_id, created_at desc);

create unique index if not exists user_store_assignments_one_primary_idx
  on public.user_store_assignments(user_id)
  where is_primary = true;

create or replace function public.save_personal_record(
  p_user_id uuid,
  p_full_name text,
  p_role public.app_role,
  p_position public.employee_position,
  p_active boolean,
  p_dni text,
  p_store_ids uuid[],
  p_actor_id uuid,
  p_audit_action text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.profiles
  set
    full_name = trim(p_full_name),
    role = p_role,
    position = p_position,
    active = p_active,
    updated_at = now()
  where id = p_user_id;

  if not found then
    raise exception 'El perfil % no existe', p_user_id using errcode = 'P0002';
  end if;

  if p_dni is null or trim(p_dni) = '' then
    delete from public.employee_identifiers
    where profile_id = p_user_id;
  else
    insert into public.employee_identifiers (profile_id, dni)
    values (p_user_id, trim(p_dni))
    on conflict (profile_id)
    do update set
      dni = excluded.dni,
      updated_at = now();
  end if;

  delete from public.user_store_assignments
  where user_id = p_user_id;

  with normalized_stores as (
    select store_id, min(ord) as ord
    from unnest(coalesce(p_store_ids, '{}'::uuid[])) with ordinality as value(store_id, ord)
    group by store_id
  )
  insert into public.user_store_assignments (
    user_id,
    store_id,
    is_primary,
    assigned_by
  )
  select
    p_user_id,
    store_id,
    ord = 1,
    p_actor_id
  from normalized_stores
  order by ord;

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
    'personal',
    p_user_id,
    jsonb_build_object(
      'role', p_role,
      'position', p_position,
      'active', p_active,
      'store_ids', coalesce(p_store_ids, '{}'::uuid[])
    )
  );
end;
$$;

revoke all on function public.save_personal_record(
  uuid,
  text,
  public.app_role,
  public.employee_position,
  boolean,
  text,
  uuid[],
  uuid,
  text
) from public, anon, authenticated;

grant execute on function public.save_personal_record(
  uuid,
  text,
  public.app_role,
  public.employee_position,
  boolean,
  text,
  uuid[],
  uuid,
  text
) to service_role;

comment on function public.save_personal_record(
  uuid,
  text,
  public.app_role,
  public.employee_position,
  boolean,
  text,
  uuid[],
  uuid,
  text
) is 'Actualiza perfil, DNI, tiendas y auditoría del módulo Personal en una sola transacción. Solo servidor.';
