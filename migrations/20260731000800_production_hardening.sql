-- Production trust-boundary hardening.
--
-- 1. Payment intents are created server-side with canonical prices and may be
--    settled exactly once.
-- 2. Customer roles cannot mint plans, mutate licences, or rewrite hosting
--    inventory directly.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'payment_intent_status') then
    create type public.payment_intent_status as enum ('pending', 'settled', 'failed');
  end if;
end
$$;

create table if not exists public.payment_intents (
  reference text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  purpose text not null check (purpose in ('invoice', 'plugin')),
  target_id uuid not null,
  amount_ngn numeric(10,2) not null check (amount_ngn > 0),
  status public.payment_intent_status not null default 'pending',
  created_at timestamptz not null default timezone('utc', now()),
  settled_at timestamptz,
  constraint payment_intents_target_unique unique (user_id, purpose, target_id, reference)
);

create index if not exists idx_payment_intents_user_created
  on public.payment_intents (user_id, created_at desc);

alter table public.payment_intents enable row level security;
revoke all on table public.payment_intents from public, anon, authenticated;

-- These rows are commercial/server inventory. RLS must not be used as a
-- column filter: if a customer can update the row, they can otherwise change
-- protected fields such as plugin_id, status, node_id, or sites_limit.
drop policy if exists "Users can update their own sites" on public.user_sites;
drop policy if exists "Users can update their own plugin purchases" on public.plugin_purchases;
drop policy if exists "Users can insert their own plans" on public.hosting_plans;

revoke insert, update, delete on table public.user_sites from authenticated;
revoke insert, update, delete on table public.plugin_purchases from authenticated;
revoke insert, update, delete on table public.hosting_plans from authenticated;

-- Profiles remain customer-editable, but immutable account identifiers and
-- support PINs stay operator-controlled.
revoke update on table public.user_profiles from authenticated;
grant update (display_name, avatar_url) on table public.user_profiles to authenticated;

-- An administratively active but already expired plan grants no commercial
-- entitlement while billing reconciliation catches up.
create or replace function public.marketplace_tier_for_user(uid uuid)
returns smallint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(max(
    case p.type
      when 'VIP' then 3
      when 'Scale' then 2
      when 'Standard' then 2
      when 'Launch' then 1
      else 0
    end
  ), 0)::smallint
  from public.hosting_plans p
  where p.user_id = uid
    and p.status = 'active'
    and p.renewal_date >= current_date;
$$;

revoke all on function public.marketplace_tier_for_user(uuid)
  from public, anon, authenticated;

create or replace function public.settle_payment_intent(
  target_user_id uuid,
  payment_reference text,
  payment_method text,
  purchase_license_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  intent public.payment_intents%rowtype;
  invoice_row public.invoices%rowtype;
  plugin_row public.marketplace_plugins%rowtype;
  purchase_row public.plugin_purchases%rowtype;
  user_tier smallint;
begin
  select * into intent
  from public.payment_intents
  where reference = payment_reference and user_id = target_user_id
  for update;

  if intent.reference is null then
    raise exception using errcode = 'P0001', message = 'Payment intent not found.';
  end if;

  if intent.status = 'failed' then
    raise exception using errcode = 'P0001', message = 'Payment intent is no longer valid.';
  end if;

  if intent.purpose = 'invoice' then
    select * into invoice_row
    from public.invoices
    where id = intent.target_id and user_id = target_user_id
    for update;

    if invoice_row.id is null then
      raise exception using errcode = 'P0001', message = 'Invoice not found.';
    end if;

    if invoice_row.total_ngn <> intent.amount_ngn then
      raise exception using errcode = 'P0001', message = 'Payment amount does not match the invoice.';
    end if;

    if intent.status = 'settled' then
      return jsonb_build_object('purpose', 'invoice', 'invoiceId', invoice_row.id, 'status', 'paid', 'alreadyPaid', true);
    end if;

    insert into public.payments (
      user_id, invoice_id, transaction_id, payment_method_label, amount_ngn, status
    ) values (
      target_user_id, invoice_row.id, intent.reference, payment_method, intent.amount_ngn, 'successful'
    );

    update public.invoices set status = 'paid' where id = invoice_row.id;
    update public.payment_intents
      set status = 'settled', settled_at = timezone('utc', now())
      where reference = intent.reference;

    return jsonb_build_object('purpose', 'invoice', 'invoiceId', invoice_row.id, 'status', 'paid');
  end if;

  select * into plugin_row
  from public.marketplace_plugins
  where id = intent.target_id and status = 'active'
  for update;

  if plugin_row.id is null then
    raise exception using errcode = 'P0001', message = 'Marketplace item not found.';
  end if;

  if plugin_row.price_ngn <> intent.amount_ngn then
    raise exception using errcode = 'P0001', message = 'Payment amount does not match the marketplace item.';
  end if;

  select public.marketplace_tier_for_user(target_user_id) into user_tier;
  if coalesce(user_tier, 0) = 0 then
    raise exception using errcode = 'P0001', message = 'An active hosting plan is required.';
  end if;

  select * into purchase_row
  from public.plugin_purchases
  where user_id = target_user_id and plugin_id = plugin_row.id
  for update;

  if intent.status = 'settled' then
    if purchase_row.id is null then
      raise exception using errcode = 'P0001', message = 'Settled payment has no matching licence.';
    end if;
    return jsonb_build_object('purpose', 'plugin', 'purchase', to_jsonb(purchase_row), 'alreadyPaid', true);
  end if;

  if purchase_row.id is not null then
    raise exception using errcode = 'P0001', message = 'This marketplace item is already owned.';
  end if;

  if purchase_license_key is null or length(purchase_license_key) < 16 then
    raise exception using errcode = 'P0001', message = 'A server-generated licence key is required.';
  end if;

  insert into public.payments (
    user_id, invoice_id, transaction_id, payment_method_label, amount_ngn, status
  ) values (
    target_user_id, null, intent.reference, payment_method, intent.amount_ngn, 'successful'
  );

  insert into public.plugin_purchases (
    user_id, plugin_id, license_key, amount_paid_ngn, acquisition, status
  ) values (
    target_user_id, plugin_row.id, purchase_license_key, intent.amount_ngn, 'purchase', 'active'
  ) returning * into purchase_row;

  update public.payment_intents
    set status = 'settled', settled_at = timezone('utc', now())
    where reference = intent.reference;

  return jsonb_build_object('purpose', 'plugin', 'purchase', to_jsonb(purchase_row));
end;
$$;

revoke all on function public.settle_payment_intent(uuid, text, text, text)
  from public, anon, authenticated;

-- A reservation spans the remote cPanel work. It makes customer plan limits
-- concurrency-safe and prevents two requests from consuming the final slot.
create table if not exists public.site_provisioning_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  node_id uuid not null references public.hosting_nodes(id) on delete cascade,
  site_domain text not null unique,
  expires_at timestamptz not null default timezone('utc', now()) + interval '30 minutes',
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.site_provisioning_reservations enable row level security;
revoke all on table public.site_provisioning_reservations from public, anon, authenticated;

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

  select coalesce(sum(sites_limit), 0)::integer into plan_limit
  from public.hosting_plans
  where user_id = target_user_id
    and status = 'active'
    and renewal_date >= current_date;

  if plan_limit <= 0 then
    raise exception using errcode = 'P0001', message = 'An active hosting plan is required.';
  end if;

  select
    (select count(*) from public.user_sites
      where user_id = target_user_id and status <> 'failed')
    +
    (select count(*) from public.site_provisioning_reservations
      where user_id = target_user_id and expires_at > timezone('utc', now()))
  into used_slots;

  if used_slots >= plan_limit then
    raise exception using errcode = 'P0001', message = 'Your hosting plan site limit has been reached.';
  end if;

  if exists (select 1 from public.user_sites where site_domain = target_site_domain)
    or exists (select 1 from public.site_provisioning_reservations where site_domain = target_site_domain)
  then
    raise exception using errcode = 'P0001', message = 'This domain is already provisioned or being provisioned.';
  end if;

  select * into node
  from public.hosting_nodes
  where status = 'active' and current_slots < max_slots
  order by current_slots asc, created_at asc
  limit 1
  for update skip locked;

  if node.id is null then
    raise exception using errcode = 'P0001', message = 'No hosting capacity is currently available.';
  end if;

  update public.hosting_nodes
    set current_slots = node.current_slots + 1,
        status = case when node.current_slots + 1 >= max_slots
          then 'full'::public.hosting_node_status else 'active'::public.hosting_node_status end
    where id = node.id
    returning * into node;

  insert into public.site_provisioning_reservations (user_id, node_id, site_domain)
    values (target_user_id, node.id, target_site_domain)
    returning * into reservation;

  return jsonb_build_object('reservationId', reservation.id, 'node', to_jsonb(node));
end;
$$;

create or replace function public.release_site_reservation(
  target_reservation_id uuid,
  target_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  reserved_node_id uuid;
begin
  delete from public.site_provisioning_reservations
    where id = target_reservation_id and user_id = target_user_id
    returning node_id into reserved_node_id;
  if reserved_node_id is not null then
    update public.hosting_nodes
      set current_slots = greatest(current_slots - 1, 0),
          status = 'active'::public.hosting_node_status
      where id = reserved_node_id;
  end if;
end;
$$;

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
  ) returning * into inserted_site;

  delete from public.site_provisioning_reservations where id = reservation.id;
  return inserted_site;
end;
$$;

revoke all on function public.reserve_site_capacity(uuid, text) from public, anon, authenticated;
revoke all on function public.release_site_reservation(uuid, uuid) from public, anon, authenticated;
revoke all on function public.complete_site_reservation(uuid, uuid, jsonb) from public, anon, authenticated;
