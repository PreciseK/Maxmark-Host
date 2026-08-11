-- 20260808004000_site_type.sql
-- Adds site_type enum and column to user_sites, enabling WordPress, Next.js,
-- Static, and Node.js app hosting types on the same cPanel infrastructure.

-- 1. Create the enum (idempotent guard via DO block)
do $$
begin
  if not exists (select 1 from pg_type where typname = 'site_type') then
    create type public.site_type as enum ('wordpress', 'nextjs', 'static', 'nodejs');
  end if;
end $$;

-- 2. Add the column; all existing rows default to 'wordpress'
alter table public.user_sites
  add column if not exists site_type public.site_type not null default 'wordpress';

-- 3. Redefine complete_site_reservation() to persist site_type from the
--    caller's site_values JSON. The previous version extracted db_name,
--    db_user, and document_root by explicit column reference (not a `||`
--    merge) and never referenced site_type at all, so every site — including
--    ones provisioned as 'static'/'nextjs'/'nodejs' — silently landed on the
--    column default ('wordpress') regardless of what was actually built on
--    WHM. coalesce() keeps existing callers that omit the field working
--    unchanged.
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
begin
  select * into reservation from public.site_provisioning_reservations
    where id = target_reservation_id and user_id = target_user_id
    for update;
  if reservation.id is null or reservation.expires_at <= timezone('utc', now()) then
    raise exception using errcode = 'P0001', message = 'The provisioning reservation has expired.';
  end if;

  insert into public.user_sites (
    user_id, node_id, site_domain, db_name, db_user, document_root, status, site_type
  ) values (
    target_user_id,
    reservation.node_id,
    reservation.site_domain,
    site_values->>'db_name',
    site_values->>'db_user',
    site_values->>'document_root',
    'active',
    coalesce(site_values->>'site_type', 'wordpress')::public.site_type
  )
  on conflict (site_domain) do update set
    user_id = target_user_id,
    node_id = reservation.node_id,
    db_name = site_values->>'db_name',
    db_user = site_values->>'db_user',
    document_root = site_values->>'document_root',
    status = 'active',
    site_type = coalesce(site_values->>'site_type', 'wordpress')::public.site_type,
    updated_at = timezone('utc', now())
  returning * into inserted_site;

  delete from public.site_provisioning_reservations where id = reservation.id;
  return inserted_site;
end;
$$;
