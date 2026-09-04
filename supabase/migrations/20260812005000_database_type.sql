-- 20260812005000_database_type.sql
-- Adds db_type enum and column to user_sites, enabling None, MySQL/MariaDB, and PostgreSQL choices.

-- 1. Create the enum
do $$
begin
  if not exists (select 1 from pg_type where typname = 'db_type') then
    create type public.db_type as enum ('none', 'mysql', 'postgresql');
  end if;
end $$;

-- 2. Add column to user_sites
alter table public.user_sites
  add column if not exists db_type public.db_type not null default 'none';

-- Backfill existing rows: if db_name is non-empty, default to mysql, else none
update public.user_sites
  set db_type = case when coalesce(db_name, '') <> '' then 'mysql'::public.db_type else 'none'::public.db_type end
  where db_type = 'none' and coalesce(db_name, '') <> '';

-- 3. Redefine complete_site_reservation() to persist db_type
create or replace function public.complete_site_reservation(
  target_reservation_id uuid,
  target_user_id uuid,
  site_values jsonb
)
returns public.user_sites
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  reservation public.site_provisioning_reservations%rowtype;
  inserted_site public.user_sites%rowtype;
  v_db_type public.db_type;
begin
  select * into reservation from public.site_provisioning_reservations
    where id = target_reservation_id and user_id = target_user_id
    for update;
  if reservation.id is null or reservation.expires_at <= timezone('utc', now()) then
    raise exception using errcode = 'P0001', message = 'The provisioning reservation has expired.';
  end if;

  v_db_type := coalesce(site_values->>'db_type', case when coalesce(site_values->>'db_name', '') <> '' then 'mysql' else 'none' end)::public.db_type;

  insert into public.user_sites (
    user_id, node_id, site_domain, db_name, db_user, document_root, status, site_type, db_type
  ) values (
    target_user_id,
    reservation.node_id,
    reservation.site_domain,
    coalesce(site_values->>'db_name', ''),
    coalesce(site_values->>'db_user', ''),
    site_values->>'document_root',
    'active',
    coalesce(site_values->>'site_type', 'wordpress')::public.site_type,
    v_db_type
  )
  on conflict (site_domain) do update set
    user_id = target_user_id,
    node_id = reservation.node_id,
    db_name = coalesce(site_values->>'db_name', ''),
    db_user = coalesce(site_values->>'db_user', ''),
    document_root = site_values->>'document_root',
    status = 'active',
    site_type = coalesce(site_values->>'site_type', 'wordpress')::public.site_type,
    db_type = v_db_type,
    updated_at = timezone('utc', now())
  returning * into inserted_site;

  delete from public.site_provisioning_reservations where id = reservation.id;
  return inserted_site;
end;
$$;
