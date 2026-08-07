-- Migration: Auto-grant default active hosting plan if user has none during reservation
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

  -- 1. Purge expired reservations across all nodes
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

  -- 2. Clear any leftover stale reservation for the exact same target domain
  delete from public.site_provisioning_reservations
  where site_domain = target_site_domain;

  -- 3. Calculate hosting plan site limits
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

  -- 4. Check if domain is already provisioned in user_sites
  if exists (select 1 from public.user_sites where site_domain = target_site_domain and status <> 'failed') then
    raise exception using errcode = 'P0001', message = 'Domain "' || target_site_domain || '" is already provisioned on Maxmark Host. Delete the existing site record before re-provisioning.';
  end if;

  -- 5. Select least loaded active hosting node
  select * into node
  from public.hosting_nodes
  where status = 'active' and current_slots < max_slots
  order by current_slots asc, created_at asc
  limit 1
  for update skip locked;

  if node.id is null then
    raise exception using errcode = 'P0001', message = 'No hosting capacity is currently available. All server nodes are at full capacity.';
  end if;

  -- 6. Reserve slot on chosen node
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
