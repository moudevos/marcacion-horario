-- Sistema de Marcación y Horarios
-- Script 01: esquema inicial
-- Ejecutar manualmente desde Supabase > SQL Editor.
-- Ejecutar una sola vez sobre una base nueva del proyecto.

create extension if not exists pgcrypto;

create type public.app_role as enum ('superuser', 'admin', 'store_manager', 'viewer');
create type public.employee_position as enum ('zonal', 'supervisor', 'visualizador', 'promotor', 'rh');
create type public.attendance_status as enum ('pending', 'present', 'late', 'absent', 'justified');
create type public.attendance_event_type as enum ('check_in', 'check_out', 'manual_adjustment');
create type public.attendance_source as enum ('public_dni', 'system', 'admin');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role public.app_role,
  position public.employee_position,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.employee_identifiers (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  dni text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_identifiers_dni_format check (dni ~ '^\d{8}$')
);

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  address text,
  active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_store_assignments (
  user_id uuid not null references public.profiles(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  is_primary boolean not null default false,
  assigned_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (user_id, store_id)
);

create table public.schedules (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id),
  store_id uuid not null references public.stores(id),
  work_date date not null,
  start_time time not null,
  end_time time not null,
  tolerance_minutes integer not null default 0 check (tolerance_minutes between 0 and 180),
  notes text,
  active boolean not null default true,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index schedules_one_active_per_day_idx
  on public.schedules(employee_id, work_date)
  where active = true;
create index schedules_store_date_idx on public.schedules(store_id, work_date);

create table public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id),
  store_id uuid not null references public.stores(id),
  schedule_id uuid references public.schedules(id),
  work_date date not null,
  check_in timestamptz,
  check_out timestamptz,
  status public.attendance_status not null default 'pending',
  notes text,
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, work_date),
  constraint attendance_checkout_after_checkin check (check_out is null or check_in is null or check_out >= check_in)
);

create index attendance_store_date_idx on public.attendance_records(store_id, work_date);
create index attendance_employee_date_idx on public.attendance_records(employee_id, work_date desc);

create table public.attendance_events (
  id uuid primary key default gen_random_uuid(),
  attendance_id uuid references public.attendance_records(id) on delete set null,
  employee_id uuid not null references public.profiles(id),
  store_id uuid not null references public.stores(id),
  event_type public.attendance_event_type not null,
  occurred_at timestamptz not null default now(),
  source public.attendance_source not null,
  created_by uuid references auth.users(id),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index attendance_events_employee_time_idx on public.attendance_events(employee_id, occurred_at desc);
create index attendance_events_store_time_idx on public.attendance_events(store_id, occurred_at desc);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger employee_identifiers_set_updated_at before update on public.employee_identifiers
for each row execute function public.set_updated_at();
create trigger stores_set_updated_at before update on public.stores
for each row execute function public.set_updated_at();
create trigger schedules_set_updated_at before update on public.schedules
for each row execute function public.set_updated_at();
create trigger attendance_records_set_updated_at before update on public.attendance_records
for each row execute function public.set_updated_at();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role from public.profiles p where p.id = (select auth.uid());
$$;

create or replace function public.current_position()
returns public.employee_position
language sql
stable
security definer
set search_path = ''
as $$
  select p.position from public.profiles p where p.id = (select auth.uid());
$$;

create or replace function public.has_store_access(target_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_store_assignments usa
    where usa.user_id = (select auth.uid())
      and usa.store_id = target_store_id
  );
$$;

create or replace function public.shares_store_with(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_store_assignments mine
    join public.user_store_assignments theirs on theirs.store_id = mine.store_id
    where mine.user_id = (select auth.uid())
      and theirs.user_id = target_user_id
  );
$$;

alter table public.profiles enable row level security;
alter table public.employee_identifiers enable row level security;
alter table public.stores enable row level security;
alter table public.user_store_assignments enable row level security;
alter table public.schedules enable row level security;
alter table public.attendance_records enable row level security;
alter table public.attendance_events enable row level security;
alter table public.audit_logs enable row level security;

create policy profiles_read on public.profiles
for select to authenticated
using (
  id = (select auth.uid())
  or public.current_app_role() = 'superuser'
  or public.current_position() = 'rh'
  or public.shares_store_with(id)
);

create policy stores_read on public.stores
for select to authenticated
using (
  public.current_app_role() = 'superuser'
  or public.current_position() = 'rh'
  or public.has_store_access(id)
);

create policy assignments_read on public.user_store_assignments
for select to authenticated
using (
  user_id = (select auth.uid())
  or public.current_app_role() = 'superuser'
  or public.current_position() = 'rh'
  or public.shares_store_with(user_id)
);

create policy schedules_read on public.schedules
for select to authenticated
using (
  employee_id = (select auth.uid())
  or public.current_app_role() = 'superuser'
  or public.current_position() = 'rh'
  or public.has_store_access(store_id)
);

create policy attendance_read on public.attendance_records
for select to authenticated
using (
  employee_id = (select auth.uid())
  or public.current_app_role() = 'superuser'
  or public.current_position() = 'rh'
  or public.has_store_access(store_id)
);

create policy attendance_events_read on public.attendance_events
for select to authenticated
using (
  employee_id = (select auth.uid())
  or public.current_app_role() = 'superuser'
  or public.current_position() = 'rh'
  or public.has_store_access(store_id)
);

create policy audit_logs_read on public.audit_logs
for select to authenticated
using (
  public.current_app_role() = 'superuser'
  or public.current_position() = 'rh'
);

revoke all on public.profiles from anon;
revoke all on public.employee_identifiers from anon, authenticated;
revoke all on public.stores from anon;
revoke all on public.user_store_assignments from anon;
revoke all on public.schedules from anon;
revoke all on public.attendance_records from anon;
revoke all on public.attendance_events from anon;
revoke all on public.audit_logs from anon;

revoke insert, update, delete on public.profiles from authenticated;
revoke insert, update, delete on public.stores from authenticated;
revoke insert, update, delete on public.user_store_assignments from authenticated;
revoke insert, update, delete on public.schedules from authenticated;
revoke insert, update, delete on public.attendance_records from authenticated;
revoke insert, update, delete on public.attendance_events from authenticated;
revoke insert, update, delete on public.audit_logs from authenticated;

grant select on public.profiles to authenticated;
grant select on public.stores to authenticated;
grant select on public.user_store_assignments to authenticated;
grant select on public.schedules to authenticated;
grant select on public.attendance_records to authenticated;
grant select on public.attendance_events to authenticated;
grant select on public.audit_logs to authenticated;
