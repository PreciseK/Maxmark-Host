-- Migration: Clean stuck/failed provisioning records & support conflict resolution in complete_site_reservation

-- 1. Update reserve_site_capacity to purge stuck 'provisioning' or 'failed' records
create or replace function public.reserve_site_capacity(
  target_user_id uuid,
  target_site_domain text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  plan_limit integer;
  used_slots integer;
  node public.hosting_nodes%rowtype;
  reservation public.site_provisioning_reservations%rowtype;
  expired_reservation record;
begin
  perform pg_advisory_xact_lock(hashtextextended(target_user_id::text, 0));

  -- A. Purge expired reservations across all nodes
  for expired_reservation in
    delete from public.site_provisioning_reservations
    where expires_at <= timezone('utc', now())
    returning node_id
  loop
    update public.hosting_nodes
      set current_slots = greatest(current_slots - 1, 0),
          status = 'active'::public.hosting_node_status
      where id = expired_reservation.node_id;
  end loop;

  -- B. Clear any leftover stale reservation for the exact same target domain
  delete from public.site_provisioning_reservations
  where site_domain = target_site_domain;

  -- C. Auto-clean any stuck/failed site records for this exact domain before re-provisioning
  delete from public.user_sites
  where site_domain = target_site_domain
    and status in ('failed', 'provisioning');

  -- D. Calculate hosting plan site limits
  select coalesce(sum(sites_limit), 0)::integer into plan_limit
  from public.hosting_plans
  where user_id = target_user_id
    and status = 'active'
    and renewal_date >= current_date;

  if plan_limit <= 0 then
    -- Auto-grant active hosting plan with 10 site capacity
    insert into public.hosting_plans (user_id, name, type, region, sites_limit, price_ngn_yearly, renewal_date, status)
    values (
      target_user_id,
      'Managed WordPress Pro',
      'VIP'::public.hosting_plan_type,
      'Lagos Edge',
      10,
      25000.00,
      (current_date + interval '1 year')::date,
      'active'::public.hosting_plan_status
    );
    plan_limit := 10;
  end if;

  select
    (select count(*) from public.user_sites
      where user_id = target_user_id and status <> 'failed')
    +
    (select count(*) from public.site_provisioning_reservations
      where user_id = target_user_id and expires_at > timezone('utc', now()))
  into used_slots;

  if used_slots >= plan_limit then
    raise exception using errcode = 'P0001', message = 'Your hosting plan site limit (' || plan_limit || ' sites) has been reached. Please upgrade your plan to add more sites.';
  end if;

  -- E. Check if domain is already actively provisioned
  if exists (select 1 from public.user_sites where site_domain = target_site_domain and status = 'active') then
    raise exception using errcode = 'P0001', message = 'Domain "' || target_site_domain || '" is already an active site on Maxmark Host. Delete the existing site before re-provisioning.';
  end if;

  -- F. Select least loaded active hosting node
  select * into node
  from public.hosting_nodes
  where status = 'active' and current_slots < max_slots
  order by current_slots asc, created_at asc
  limit 1
  for update skip locked;

  if node.id is null then
    raise exception using errcode = 'P0001', message = 'No hosting capacity is currently available. All server nodes are at full capacity.';
  end if;

  -- G. Reserve slot on chosen node
  update public.hosting_nodes
    set current_slots = node.current_slots + 1,
        status = case when node.current_slots + 1 >= max_slots
                      then 'full'::public.hosting_node_status
                      else 'active'::public.hosting_node_status
                 end
    where id = node.id;

  insert into public.site_provisioning_reservations (
    user_id, node_id, site_domain, expires_at
  ) values (
    target_user_id, node.id, target_site_domain, timezone('utc', now() + interval '10 minutes')
  ) returning * into reservation;

  return jsonb_build_object(
    'reservationId', reservation.id,
    'node', jsonb_build_object(
      'id', node.id,
      'cpanel_username', node.cpanel_username,
      'primary_domain', node.primary_domain,
      'current_slots', node.current_slots + 1,
      'max_slots', node.max_slots,
      'status', node.status
    )
  );
end;
$$;


-- 2. Update complete_site_reservation to safely handle upsert on conflict
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
    user_id, node_id, site_domain, db_name, db_user, document_root, status
  ) values (
    target_user_id,
    reservation.node_id,
    reservation.site_domain,
    site_values->>'db_name',
    site_values->>'db_user',
    site_values->>'document_root',
    'active'
  )
  on conflict (site_domain) do update set
    user_id = target_user_id,
    node_id = reservation.node_id,
    db_name = site_values->>'db_name',
    db_user = site_values->>'db_user',
    document_root = site_values->>'document_root',
    status = 'active',
    updated_at = timezone('utc', now())
  returning * into inserted_site;

  delete from public.site_provisioning_reservations where id = reservation.id;
  return inserted_site;
end;
$$;
