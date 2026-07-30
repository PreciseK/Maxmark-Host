create extension if not exists pgcrypto;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'hosting_node_status'
  ) then
    create type public.hosting_node_status as enum ('active', 'full', 'maintenance');
  end if;

  if not exists (
    select 1
    from pg_type
    where typname = 'user_site_status'
  ) then
    create type public.user_site_status as enum (
      'provisioning',
      'active',
      'suspended',
      'failed'
    );
  end if;

  if not exists (
    select 1
    from pg_type
    where typname = 'marketplace_plugin_status'
  ) then
    create type public.marketplace_plugin_status as enum ('active', 'draft');
  end if;

  if not exists (
    select 1
    from pg_type
    where typname = 'plugin_purchase_status'
  ) then
    create type public.plugin_purchase_status as enum (
      'active',
      'refunded',
      'revoked'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'hosting_plan_type') then
    create type public.hosting_plan_type as enum ('VIP', 'Standard', 'Scale', 'Launch');
  end if;

  if not exists (select 1 from pg_type where typname = 'hosting_plan_status') then
    create type public.hosting_plan_status as enum ('active', 'cancelled', 'suspended');
  end if;

  if not exists (select 1 from pg_type where typname = 'backup_status') then
    create type public.backup_status as enum ('completed', 'failed', 'in_progress');
  end if;

  if not exists (select 1 from pg_type where typname = 'ssl_status') then
    create type public.ssl_status as enum ('installed', 'not_installed', 'pending');
  end if;

  if not exists (select 1 from pg_type where typname = 'pointer_domain_type') then
    create type public.pointer_domain_type as enum ('alias', 'cname', 'redirect');
  end if;

  if not exists (select 1 from pg_type where typname = 'staging_status') then
    create type public.staging_status as enum ('provisioning', 'active', 'failed', 'deleted');
  end if;

  if not exists (select 1 from pg_type where typname = 'container_type') then
    create type public.container_type as enum ('elasticsearch', 'rabbitmq', 'solr');
  end if;

  if not exists (select 1 from pg_type where typname = 'container_status') then
    create type public.container_status as enum ('disabled', 'provisioning', 'enabled', 'failed');
  end if;

  if not exists (select 1 from pg_type where typname = 'integration_type') then
    create type public.integration_type as enum ('new_relic', 'datadog', 'cloudflare');
  end if;

  if not exists (select 1 from pg_type where typname = 'integration_status') then
    create type public.integration_status as enum ('enabled', 'disabled');
  end if;

  if not exists (select 1 from pg_type where typname = 'analytics_metric') then
    create type public.analytics_metric as enum ('php_fpm', 'web_stats', 'bandwidth');
  end if;

  if not exists (select 1 from pg_type where typname = 'invoice_status') then
    create type public.invoice_status as enum ('unpaid', 'paid', 'denied');
  end if;

  if not exists (select 1 from pg_type where typname = 'payment_status') then
    create type public.payment_status as enum ('successful', 'failed', 'refunded');
  end if;

  if not exists (select 1 from pg_type where typname = 'order_status') then
    create type public.order_status as enum ('active', 'cancelled', 'expired');
  end if;

  if not exists (select 1 from pg_type where typname = 'dns_record_type') then
    create type public.dns_record_type as enum ('A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV');
  end if;

  if not exists (select 1 from pg_type where typname = 'domain_status') then
    create type public.domain_status as enum ('active', 'expired', 'pending', 'transferred');
  end if;

  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('admin');
  end if;

  if not exists (select 1 from pg_type where typname = 'support_conversation_status') then
    create type public.support_conversation_status as enum ('open', 'pending', 'closed');
  end if;

  if not exists (select 1 from pg_type where typname = 'support_sender_role') then
    create type public.support_sender_role as enum ('user', 'admin');
  end if;
end
$$;

-- Existing databases created before 'maintenance' existed get the value via
-- migrations/002_admin_roles.sql (alter type cannot live inside the do-block
-- above because the block runs in a single transaction).

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

-- ─── Core tables ────────────────────────────────────────────────────────────

create table if not exists public.hosting_nodes (
  id uuid primary key default gen_random_uuid(),
  cpanel_username text not null unique,
  primary_domain text not null unique,
  current_slots integer not null default 0,
  max_slots integer not null default 20,
  status public.hosting_node_status not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint hosting_nodes_slot_bounds check (current_slots >= 0 and current_slots <= max_slots),
  constraint hosting_nodes_status_consistency check (
    (status = 'full' and current_slots = max_slots)
    or
    (status = 'active' and current_slots < max_slots)
    or
    (status = 'maintenance')
  )
);

create table if not exists public.user_sites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  node_id uuid not null references public.hosting_nodes (id) on delete restrict,
  site_domain text not null unique,
  db_name text not null unique,
  db_user text not null unique,
  document_root text not null,
  status public.user_site_status not null default 'provisioning',
  -- display / plan fields
  plan text not null default 'Managed WordPress Pro',
  region text not null default 'Lagos Edge',
  php_version text not null default 'PHP 8.3',
  wordpress_version text not null default 'WP 6.8',
  daily_visits integer not null default 0,
  magic_login_token text,
  -- network / credential fields
  cname_target text not null default '84dba1eae1.nxcli.io',
  ip_address text not null default '165.84.219.136',
  ftp_hostname text not null default 'cloudhost-433832.uk-south-2.nxcli.net',
  home_directory text not null default '/home/a877b99a',
  redis_ip text,
  redis_port integer,
  cdn_hostname text,
  cdn_endpoint text,
  -- resource metrics
  disk_used_gb numeric(10,2) not null default 0,
  disk_capacity_gb integer not null default 40,
  bandwidth_capacity_gb integer not null default 300,
  bandwidth_included_gb integer not null default 250,
  uptime_percent numeric(5,2) not null default 99.9,
  php_workers integer not null default 4,
  backups_summary text not null default 'Daily',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint user_sites_document_root_unique_per_node unique (node_id, document_root)
);

-- Marketplace items: plugins and themes share one catalog. `tier` gates
-- subscription entitlement (see marketplace_tier_for_user below).
create table if not exists public.marketplace_plugins (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  tagline text not null,
  description text not null,
  category text not null,
  product_type text not null default 'plugin',
  tier smallint not null default 1,
  version text not null,
  requires_wordpress text not null,
  requires_php text not null,
  price_ngn numeric(10, 2) not null,
  status public.marketplace_plugin_status not null default 'active',
  featured boolean not null default false,
  rating numeric(2,1) not null default 0,
  installs_label text not null default '',
  gradient text not null default '',
  highlights jsonb not null default '[]',
  download_asset_path text,
  -- Derived, stored server-side so customer-facing queries can select this
  -- boolean instead of the raw R2 key in download_asset_path (see
  -- src/lib/db/marketplace.ts's fetchPlugins for why: the app never wants
  -- to send real object-storage paths to a browser that hasn't purchased
  -- the item).
  has_download_asset boolean generated always as (download_asset_path is not null) stored,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint marketplace_plugins_price_nonnegative check (price_ngn >= 0),
  constraint marketplace_plugins_product_type check (product_type in ('plugin', 'theme')),
  constraint marketplace_plugins_tier_range check (tier between 1 and 3)
);

create table if not exists public.plugin_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plugin_id uuid not null references public.marketplace_plugins (id) on delete restrict,
  license_key text not null unique,
  amount_paid_ngn numeric(10, 2) not null,
  -- 'purchase' = paid individually via verify-payment;
  -- 'subscription' = ₦0 tier entitlement claimed via claim-item.
  acquisition text not null default 'purchase',
  download_count integer not null default 0,
  last_downloaded_at timestamptz,
  status public.plugin_purchase_status not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint plugin_purchases_amount_nonnegative check (amount_paid_ngn >= 0),
  constraint plugin_purchases_acquisition check (acquisition in ('purchase', 'subscription')),
  constraint plugin_purchases_download_count_nonnegative check (download_count >= 0),
  constraint plugin_purchases_unique_ownership unique (user_id, plugin_id)
);

-- ─── Account / profile ──────────────────────────────────────────────────────

create table if not exists public.user_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  display_name text not null default '',
  account_id text not null unique,
  support_pin text not null,
  avatar_url text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- ─── Roles & admin audit ─────────────────────────────────────────────────────
-- Role grants are written exclusively by operators (SQL editor / service
-- role). No client policy allows INSERT/UPDATE/DELETE here — same posture as
-- user_sites and plugin_purchases.

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint user_roles_unique unique (user_id, role)
);

-- Every mutating call handled by the admin-actions Edge Function appends a
-- row here (service role). Clients can only read it, and only as admins.
create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  target_type text,
  target_id text,
  payload jsonb not null default '{}',
  created_at timestamptz not null default timezone('utc', now())
);

-- SECURITY DEFINER so policies can call it without recursing through
-- user_roles' own RLS. Never inline a user_roles subquery in a policy.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = auth.uid() and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- ─── Support chat ────────────────────────────────────────────────────────────
-- Conversations + messages power the customer chat widget, the /support page,
-- and the admin inbox. Messages are written directly by clients under RLS
-- (chat is high-frequency and low-privilege); triggers below enforce sender
-- integrity and keep denormalized counters honest, so nothing here relies on
-- the client telling the truth.

create table if not exists public.support_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject text not null,
  status public.support_conversation_status not null default 'open',
  last_message_at timestamptz not null default timezone('utc', now()),
  last_message_preview text not null default '',
  user_unread_count integer not null default 0,
  admin_unread_count integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint support_conversations_subject_length check (char_length(subject) between 1 and 200),
  constraint support_conversations_unread_nonnegative
    check (user_unread_count >= 0 and admin_unread_count >= 0)
);

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.support_conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  sender_role public.support_sender_role not null,
  body text not null,
  attachment_key text,
  attachment_name text,
  attachment_size integer,
  attachment_type text,
  created_at timestamptz not null default timezone('utc', now()),
  constraint support_messages_body_length
    check (
      char_length(body) between 1 and 4000
      or (char_length(body) = 0 and attachment_key is not null)
    )
);

-- Sender integrity: clients insert messages directly, so the sender fields
-- are always derived server-side from the JWT — a user can never forge an
-- admin message. Service-role inserts (auth.uid() is null) keep their values.
create or replace function public.support_message_set_sender()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    new.sender_id = auth.uid();
    new.sender_role = case
      when public.is_admin() then 'admin'::public.support_sender_role
      else 'user'::public.support_sender_role
    end;
  end if;
  return new;
end;
$$;

-- Denormalized conversation state: preview, ordering timestamp, unread
-- counters (incremented for the side that did NOT send), and status flow —
-- a customer message always (re)opens the conversation; an admin reply moves
-- an open conversation to 'pending' (awaiting the customer).
create or replace function public.support_conversation_bump()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.support_conversations
  set last_message_at = new.created_at,
      last_message_preview = case
        when new.body = '' and new.attachment_key is not null
          then '📎 ' || coalesce(new.attachment_name, 'Attachment')
        else left(new.body, 120)
      end,
      user_unread_count = user_unread_count
        + case when new.sender_role = 'admin' then 1 else 0 end,
      admin_unread_count = admin_unread_count
        + case when new.sender_role = 'user' then 1 else 0 end,
      status = case
        when new.sender_role = 'user' then 'open'::public.support_conversation_status
        when new.sender_role = 'admin' and status = 'open'
          then 'pending'::public.support_conversation_status
        else status
      end
  where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists support_messages_set_sender on public.support_messages;
create trigger support_messages_set_sender
before insert on public.support_messages
for each row execute function public.support_message_set_sender();

drop trigger if exists support_messages_bump_conversation on public.support_messages;
create trigger support_messages_bump_conversation
after insert on public.support_messages
for each row execute function public.support_conversation_bump();

-- ─── Hosting plans ──────────────────────────────────────────────────────────

create table if not exists public.hosting_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type public.hosting_plan_type not null default 'VIP',
  region text not null,
  sites_limit integer not null default 1,
  app_environment text not null default 'WordPress',
  price_ngn_yearly numeric(10,2) not null,
  renewal_date date not null,
  status public.hosting_plan_status not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- ─── Site-scoped child tables ────────────────────────────────────────────────

create table if not exists public.backup_logs (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.user_sites(id) on delete cascade,
  status public.backup_status not null default 'completed',
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.site_settings (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null unique references public.user_sites(id) on delete cascade,
  local_mail_delivery boolean not null default true,
  core_upgrades boolean not null default true,
  nginx_accelerator boolean not null default true,
  auto_lets_encrypt boolean not null default true,
  password_protection boolean not null default false,
  php_workers integer not null default 4,
  cron_mail_to text,
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.email_boxes (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.user_sites(id) on delete cascade,
  email_address text not null,
  storage_quota_mb integer,
  hostname text not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint email_boxes_unique_per_site unique (site_id, email_address)
);

create table if not exists public.email_aliases (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.user_sites(id) on delete cascade,
  alias_address text not null,
  target_address text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.ssl_certificates (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null unique references public.user_sites(id) on delete cascade,
  domain text not null,
  status public.ssl_status not null default 'not_installed',
  expires_at timestamptz,
  key_length integer not null default 2048,
  auto_renew boolean not null default true,
  domains_included jsonb not null default '[]',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.pointer_domains (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.user_sites(id) on delete cascade,
  domain text not null,
  type public.pointer_domain_type not null default 'alias',
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.cron_tasks (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.user_sites(id) on delete cascade,
  command text not null,
  schedule text not null,
  path text not null default '/usr/local/bin:/usr/bin',
  mail_to text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.staging_environments (
  id uuid primary key default gen_random_uuid(),
  parent_site_id uuid not null references public.user_sites(id) on delete cascade,
  site_domain text not null unique,
  status public.staging_status not null default 'provisioning',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.container_services (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.user_sites(id) on delete cascade,
  container_type public.container_type not null,
  status public.container_status not null default 'disabled',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint container_services_unique_per_site unique (site_id, container_type)
);

create table if not exists public.integrations (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.user_sites(id) on delete cascade,
  type public.integration_type not null,
  status public.integration_status not null default 'disabled',
  config_encrypted text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint integrations_unique_per_site unique (site_id, type)
);

create table if not exists public.analytics_snapshots (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.user_sites(id) on delete cascade,
  metric public.analytics_metric not null,
  value numeric(10,4) not null,
  recorded_at timestamptz not null default timezone('utc', now())
);

-- ─── Billing tables ──────────────────────────────────────────────────────────

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subscription_id text,
  description text not null,
  status public.invoice_status not null default 'unpaid',
  due_date date not null,
  total_ngn numeric(10,2) not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  invoice_id uuid references public.invoices(id) on delete set null,
  transaction_id text not null unique,
  payment_method_label text not null,
  amount_ngn numeric(10,2) not null,
  status public.payment_status not null default 'successful',
  paid_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  last_four text not null,
  card_brand text not null default 'visa',
  expires_at text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  order_ref text not null unique,
  product text not null,
  total_label text not null,
  status public.order_status not null default 'active',
  ordered_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.credits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount_ngn numeric(10,2) not null,
  description text not null,
  created_at timestamptz not null default timezone('utc', now())
);

-- ─── DNS ────────────────────────────────────────────────────────────────────

create table if not exists public.dns_zones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  zone_name text not null unique,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.dns_records (
  id uuid primary key default gen_random_uuid(),
  zone_id uuid not null references public.dns_zones(id) on delete cascade,
  type public.dns_record_type not null,
  name text not null,
  value text not null,
  ttl integer not null default 3600,
  priority integer,
  created_at timestamptz not null default timezone('utc', now())
);

-- ─── Domain registrations ────────────────────────────────────────────────────

create table if not exists public.registered_domains (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  domain text not null unique,
  tld text not null,
  status public.domain_status not null default 'active',
  expires_at date not null,
  auto_renew boolean not null default true,
  price_ngn_yearly numeric(10,2) not null,
  created_at timestamptz not null default timezone('utc', now())
);

-- ─── Provisioning functions ──────────────────────────────────────────────────
-- Atomically claim a slot on the least-loaded active node. Row-locked so two
-- concurrent provisions can never both take the last slot of the same node.
-- Callable only by the service role (Edge Functions); execute is revoked from
-- client roles below.

create or replace function public.allocate_hosting_node()
returns public.hosting_nodes
language plpgsql
security definer
set search_path = public
as $$
declare
  node public.hosting_nodes;
begin
  select * into node
  from public.hosting_nodes
  where status = 'active' and current_slots < max_slots
  order by current_slots asc, created_at asc
  limit 1
  for update skip locked;

  if node.id is null then
    raise exception 'No active hosting nodes have free WordPress slots.';
  end if;

  update public.hosting_nodes
  set current_slots = node.current_slots + 1,
      status = case
        when node.current_slots + 1 >= max_slots then 'full'::public.hosting_node_status
        else 'active'::public.hosting_node_status
      end
  where id = node.id
  returning * into node;

  return node;
end;
$$;

-- Return a slot when provisioning fails after allocation (rollback path).
create or replace function public.release_hosting_node(target_node_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.hosting_nodes
  set current_slots = greatest(current_slots - 1, 0),
      status = 'active'::public.hosting_node_status
  where id = target_node_id;
end;
$$;

revoke all on function public.allocate_hosting_node() from public, anon, authenticated;
revoke all on function public.release_hosting_node(uuid) from public, anon, authenticated;

-- ─── Marketplace tier resolution ─────────────────────────────────────────────
-- A user's marketplace tier is derived from their active hosting plans:
--   Launch → 1 · Standard → 2 · Scale → 2 · VIP → 3 · none active → 0
-- Highest active plan wins. Items with tier <= user tier are included in the
-- subscription (claimed at ₦0 via the claim-item Edge Function); higher-tier
-- items must be purchased individually. Tier 0 users can only browse.
-- Server-side single source of truth; src/lib/tiers.ts mirrors it for display.

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
  where p.user_id = uid and p.status = 'active';
$$;

revoke all on function public.marketplace_tier_for_user(uuid) from public, anon, authenticated;

-- ─── Indexes ─────────────────────────────────────────────────────────────────

create index if not exists idx_hosting_nodes_available
  on public.hosting_nodes (status, current_slots, created_at)
  where status = 'active';

create index if not exists idx_user_sites_user_id
  on public.user_sites (user_id, created_at desc);

create index if not exists idx_user_sites_node_id
  on public.user_sites (node_id, created_at desc);

create index if not exists idx_user_sites_status
  on public.user_sites (status, created_at desc);

create index if not exists idx_marketplace_plugins_status
  on public.marketplace_plugins (status, category, created_at desc);

create index if not exists idx_plugin_purchases_user_id
  on public.plugin_purchases (user_id, created_at desc);

create index if not exists idx_backup_logs_site_id
  on public.backup_logs (site_id, created_at desc);

create index if not exists idx_analytics_site_metric_time
  on public.analytics_snapshots (site_id, metric, recorded_at desc);

create index if not exists idx_invoices_user_id
  on public.invoices (user_id, due_date desc);

create index if not exists idx_hosting_plans_user_id
  on public.hosting_plans (user_id, created_at desc);

create index if not exists idx_dns_records_zone_id
  on public.dns_records (zone_id, created_at desc);

create index if not exists idx_user_roles_user_id
  on public.user_roles (user_id);

create index if not exists idx_admin_audit_log_created_at
  on public.admin_audit_log (created_at desc);

create index if not exists idx_admin_audit_log_admin_user_id
  on public.admin_audit_log (admin_user_id, created_at desc);

create index if not exists idx_support_conversations_user
  on public.support_conversations (user_id, last_message_at desc);

create index if not exists idx_support_conversations_status
  on public.support_conversations (status, last_message_at desc);

create index if not exists idx_support_messages_conversation
  on public.support_messages (conversation_id, created_at);

-- ─── Triggers ────────────────────────────────────────────────────────────────

drop trigger if exists hosting_nodes_set_updated_at on public.hosting_nodes;
create trigger hosting_nodes_set_updated_at
before update on public.hosting_nodes
for each row execute function public.set_updated_at();

drop trigger if exists user_sites_set_updated_at on public.user_sites;
create trigger user_sites_set_updated_at
before update on public.user_sites
for each row execute function public.set_updated_at();

drop trigger if exists marketplace_plugins_set_updated_at on public.marketplace_plugins;
create trigger marketplace_plugins_set_updated_at
before update on public.marketplace_plugins
for each row execute function public.set_updated_at();

drop trigger if exists plugin_purchases_set_updated_at on public.plugin_purchases;
create trigger plugin_purchases_set_updated_at
before update on public.plugin_purchases
for each row execute function public.set_updated_at();

drop trigger if exists user_profiles_set_updated_at on public.user_profiles;
create trigger user_profiles_set_updated_at
before update on public.user_profiles
for each row execute function public.set_updated_at();

drop trigger if exists hosting_plans_set_updated_at on public.hosting_plans;
create trigger hosting_plans_set_updated_at
before update on public.hosting_plans
for each row execute function public.set_updated_at();

drop trigger if exists ssl_certificates_set_updated_at on public.ssl_certificates;
create trigger ssl_certificates_set_updated_at
before update on public.ssl_certificates
for each row execute function public.set_updated_at();

drop trigger if exists cron_tasks_set_updated_at on public.cron_tasks;
create trigger cron_tasks_set_updated_at
before update on public.cron_tasks
for each row execute function public.set_updated_at();

drop trigger if exists staging_environments_set_updated_at on public.staging_environments;
create trigger staging_environments_set_updated_at
before update on public.staging_environments
for each row execute function public.set_updated_at();

drop trigger if exists container_services_set_updated_at on public.container_services;
create trigger container_services_set_updated_at
before update on public.container_services
for each row execute function public.set_updated_at();

drop trigger if exists integrations_set_updated_at on public.integrations;
create trigger integrations_set_updated_at
before update on public.integrations
for each row execute function public.set_updated_at();

drop trigger if exists invoices_set_updated_at on public.invoices;
create trigger invoices_set_updated_at
before update on public.invoices
for each row execute function public.set_updated_at();

drop trigger if exists support_conversations_set_updated_at on public.support_conversations;
create trigger support_conversations_set_updated_at
before update on public.support_conversations
for each row execute function public.set_updated_at();

-- ─── Row Level Security ──────────────────────────────────────────────────────

alter table public.hosting_nodes enable row level security;
alter table public.user_sites enable row level security;
alter table public.marketplace_plugins enable row level security;
alter table public.plugin_purchases enable row level security;
alter table public.user_profiles enable row level security;
alter table public.hosting_plans enable row level security;
alter table public.backup_logs enable row level security;
alter table public.site_settings enable row level security;
alter table public.email_boxes enable row level security;
alter table public.email_aliases enable row level security;
alter table public.ssl_certificates enable row level security;
alter table public.pointer_domains enable row level security;
alter table public.cron_tasks enable row level security;
alter table public.staging_environments enable row level security;
alter table public.container_services enable row level security;
alter table public.integrations enable row level security;
alter table public.analytics_snapshots enable row level security;
alter table public.invoices enable row level security;
alter table public.payments enable row level security;
alter table public.payment_methods enable row level security;
alter table public.orders enable row level security;
alter table public.credits enable row level security;
alter table public.dns_zones enable row level security;
alter table public.dns_records enable row level security;
alter table public.registered_domains enable row level security;
alter table public.user_roles enable row level security;
alter table public.admin_audit_log enable row level security;
alter table public.support_conversations enable row level security;
alter table public.support_messages enable row level security;

-- user_sites policies
drop policy if exists "Users can view their own sites" on public.user_sites;
create policy "Users can view their own sites"
  on public.user_sites for select using (auth.uid() = user_id);

-- Site rows are created only by the provision-site Edge Function (service
-- role bypasses RLS). Clients must not be able to insert unprovisioned sites.
drop policy if exists "Users can create their own sites" on public.user_sites;

drop policy if exists "Users can update their own sites" on public.user_sites;
create policy "Users can update their own sites"
  on public.user_sites for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- marketplace_plugins policies
drop policy if exists "Users can view active marketplace plugins" on public.marketplace_plugins;
create policy "Users can view active marketplace plugins"
  on public.marketplace_plugins for select using (status = 'active');

-- plugin_purchases policies
drop policy if exists "Users can view their own plugin purchases" on public.plugin_purchases;
create policy "Users can view their own plugin purchases"
  on public.plugin_purchases for select using (auth.uid() = user_id);

-- Purchases are created only by the verify-payment Edge Function after the
-- Paystack transaction is verified server-side. A client INSERT policy here
-- would let any signed-in user grant themselves a licence without paying.
drop policy if exists "Users can create their own plugin purchases" on public.plugin_purchases;

-- Clients may only update download bookkeeping on licences they own; the
-- licence itself (key, amount, status, plugin) stays server-controlled.
drop policy if exists "Users can update their own plugin purchases" on public.plugin_purchases;
create policy "Users can update their own plugin purchases"
  on public.plugin_purchases for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- user_profiles policies
drop policy if exists "Users can view their own profile" on public.user_profiles;
create policy "Users can view their own profile"
  on public.user_profiles for select using (auth.uid() = user_id);

drop policy if exists "Users can insert their own profile" on public.user_profiles;
create policy "Users can insert their own profile"
  on public.user_profiles for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update their own profile" on public.user_profiles;
create policy "Users can update their own profile"
  on public.user_profiles for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- hosting_plans policies
drop policy if exists "Users can view their own plans" on public.hosting_plans;
create policy "Users can view their own plans"
  on public.hosting_plans for select using (auth.uid() = user_id);

drop policy if exists "Users can insert their own plans" on public.hosting_plans;
create policy "Users can insert their own plans"
  on public.hosting_plans for insert with check (auth.uid() = user_id);

-- Site-child helper: allows access if the parent site belongs to the current user
-- backup_logs
drop policy if exists "Users can view their site backups" on public.backup_logs;
create policy "Users can view their site backups"
  on public.backup_logs for select using (
    exists (select 1 from public.user_sites s where s.id = backup_logs.site_id and s.user_id = auth.uid())
  );

-- site_settings
drop policy if exists "Users can view their site settings" on public.site_settings;
create policy "Users can view their site settings"
  on public.site_settings for select using (
    exists (select 1 from public.user_sites s where s.id = site_settings.site_id and s.user_id = auth.uid())
  );

drop policy if exists "Users can update their site settings" on public.site_settings;
create policy "Users can update their site settings"
  on public.site_settings for update using (
    exists (select 1 from public.user_sites s where s.id = site_settings.site_id and s.user_id = auth.uid())
  );

drop policy if exists "Users can insert site settings" on public.site_settings;
create policy "Users can insert site settings"
  on public.site_settings for insert with check (
    exists (select 1 from public.user_sites s where s.id = site_settings.site_id and s.user_id = auth.uid())
  );

-- email_boxes
drop policy if exists "Users can view their email boxes" on public.email_boxes;
create policy "Users can view their email boxes"
  on public.email_boxes for select using (
    exists (select 1 from public.user_sites s where s.id = email_boxes.site_id and s.user_id = auth.uid())
  );

drop policy if exists "Users can manage their email boxes" on public.email_boxes;
create policy "Users can manage their email boxes"
  on public.email_boxes for all using (
    exists (select 1 from public.user_sites s where s.id = email_boxes.site_id and s.user_id = auth.uid())
  );

-- email_aliases
drop policy if exists "Users can view their email aliases" on public.email_aliases;
create policy "Users can view their email aliases"
  on public.email_aliases for select using (
    exists (select 1 from public.user_sites s where s.id = email_aliases.site_id and s.user_id = auth.uid())
  );

drop policy if exists "Users can manage their email aliases" on public.email_aliases;
create policy "Users can manage their email aliases"
  on public.email_aliases for all using (
    exists (select 1 from public.user_sites s where s.id = email_aliases.site_id and s.user_id = auth.uid())
  );

-- ssl_certificates
drop policy if exists "Users can view their ssl certificates" on public.ssl_certificates;
create policy "Users can view their ssl certificates"
  on public.ssl_certificates for select using (
    exists (select 1 from public.user_sites s where s.id = ssl_certificates.site_id and s.user_id = auth.uid())
  );

drop policy if exists "Users can manage their ssl certificates" on public.ssl_certificates;
create policy "Users can manage their ssl certificates"
  on public.ssl_certificates for all using (
    exists (select 1 from public.user_sites s where s.id = ssl_certificates.site_id and s.user_id = auth.uid())
  );

-- pointer_domains
drop policy if exists "Users can view their pointer domains" on public.pointer_domains;
create policy "Users can view their pointer domains"
  on public.pointer_domains for select using (
    exists (select 1 from public.user_sites s where s.id = pointer_domains.site_id and s.user_id = auth.uid())
  );

drop policy if exists "Users can manage their pointer domains" on public.pointer_domains;
create policy "Users can manage their pointer domains"
  on public.pointer_domains for all using (
    exists (select 1 from public.user_sites s where s.id = pointer_domains.site_id and s.user_id = auth.uid())
  );

-- cron_tasks
drop policy if exists "Users can view their cron tasks" on public.cron_tasks;
create policy "Users can view their cron tasks"
  on public.cron_tasks for select using (
    exists (select 1 from public.user_sites s where s.id = cron_tasks.site_id and s.user_id = auth.uid())
  );

drop policy if exists "Users can manage their cron tasks" on public.cron_tasks;
create policy "Users can manage their cron tasks"
  on public.cron_tasks for all using (
    exists (select 1 from public.user_sites s where s.id = cron_tasks.site_id and s.user_id = auth.uid())
  );

-- staging_environments
drop policy if exists "Users can view their staging environments" on public.staging_environments;
create policy "Users can view their staging environments"
  on public.staging_environments for select using (
    exists (select 1 from public.user_sites s where s.id = staging_environments.parent_site_id and s.user_id = auth.uid())
  );

drop policy if exists "Users can manage their staging environments" on public.staging_environments;
create policy "Users can manage their staging environments"
  on public.staging_environments for all using (
    exists (select 1 from public.user_sites s where s.id = staging_environments.parent_site_id and s.user_id = auth.uid())
  );

-- container_services
drop policy if exists "Users can view their container services" on public.container_services;
create policy "Users can view their container services"
  on public.container_services for select using (
    exists (select 1 from public.user_sites s where s.id = container_services.site_id and s.user_id = auth.uid())
  );

drop policy if exists "Users can manage their container services" on public.container_services;
create policy "Users can manage their container services"
  on public.container_services for all using (
    exists (select 1 from public.user_sites s where s.id = container_services.site_id and s.user_id = auth.uid())
  );

-- integrations
drop policy if exists "Users can view their integrations" on public.integrations;
create policy "Users can view their integrations"
  on public.integrations for select using (
    exists (select 1 from public.user_sites s where s.id = integrations.site_id and s.user_id = auth.uid())
  );

drop policy if exists "Users can manage their integrations" on public.integrations;
create policy "Users can manage their integrations"
  on public.integrations for all using (
    exists (select 1 from public.user_sites s where s.id = integrations.site_id and s.user_id = auth.uid())
  );

-- analytics_snapshots
drop policy if exists "Users can view their analytics" on public.analytics_snapshots;
create policy "Users can view their analytics"
  on public.analytics_snapshots for select using (
    exists (select 1 from public.user_sites s where s.id = analytics_snapshots.site_id and s.user_id = auth.uid())
  );

-- invoices
drop policy if exists "Users can view their invoices" on public.invoices;
create policy "Users can view their invoices"
  on public.invoices for select using (auth.uid() = user_id);

-- payments
drop policy if exists "Users can view their payments" on public.payments;
create policy "Users can view their payments"
  on public.payments for select using (auth.uid() = user_id);

-- payment_methods
drop policy if exists "Users can view their payment methods" on public.payment_methods;
create policy "Users can view their payment methods"
  on public.payment_methods for select using (auth.uid() = user_id);

drop policy if exists "Users can manage their payment methods" on public.payment_methods;
create policy "Users can manage their payment methods"
  on public.payment_methods for all using (auth.uid() = user_id);

-- orders
drop policy if exists "Users can view their orders" on public.orders;
create policy "Users can view their orders"
  on public.orders for select using (auth.uid() = user_id);

-- credits
drop policy if exists "Users can view their credits" on public.credits;
create policy "Users can view their credits"
  on public.credits for select using (auth.uid() = user_id);

-- dns_zones
drop policy if exists "Users can view their dns zones" on public.dns_zones;
create policy "Users can view their dns zones"
  on public.dns_zones for select using (auth.uid() = user_id);

drop policy if exists "Users can manage their dns zones" on public.dns_zones;
create policy "Users can manage their dns zones"
  on public.dns_zones for all using (auth.uid() = user_id);

-- dns_records
drop policy if exists "Users can view their dns records" on public.dns_records;
create policy "Users can view their dns records"
  on public.dns_records for select using (
    exists (select 1 from public.dns_zones z where z.id = dns_records.zone_id and z.user_id = auth.uid())
  );

drop policy if exists "Users can manage their dns records" on public.dns_records;
create policy "Users can manage their dns records"
  on public.dns_records for all using (
    exists (select 1 from public.dns_zones z where z.id = dns_records.zone_id and z.user_id = auth.uid())
  );

-- registered_domains
drop policy if exists "Users can view their registered domains" on public.registered_domains;
create policy "Users can view their registered domains"
  on public.registered_domains for select using (auth.uid() = user_id);

drop policy if exists "Users can manage their registered domains" on public.registered_domains;
create policy "Users can manage their registered domains"
  on public.registered_domains for all using (auth.uid() = user_id);

-- ─── Role & audit policies ───────────────────────────────────────────────────

drop policy if exists "Users can view their own roles" on public.user_roles;
create policy "Users can view their own roles"
  on public.user_roles for select using (auth.uid() = user_id);

drop policy if exists "Admins can view all roles" on public.user_roles;
create policy "Admins can view all roles"
  on public.user_roles for select using (public.is_admin());

drop policy if exists "Admins can view audit log" on public.admin_audit_log;
create policy "Admins can view audit log"
  on public.admin_audit_log for select using (public.is_admin());

-- ─── Admin read policies ─────────────────────────────────────────────────────
-- Permissive SELECT policies that OR with the per-user policies above, so the
-- /admin dashboard can list customer data directly under RLS. All admin
-- WRITES still go through the admin-actions Edge Function (service role),
-- which is also where the audit log is appended.

drop policy if exists "Admins can view all profiles" on public.user_profiles;
create policy "Admins can view all profiles"
  on public.user_profiles for select using (public.is_admin());

drop policy if exists "Admins can view all sites" on public.user_sites;
create policy "Admins can view all sites"
  on public.user_sites for select using (public.is_admin());

drop policy if exists "Admins can view hosting nodes" on public.hosting_nodes;
create policy "Admins can view hosting nodes"
  on public.hosting_nodes for select using (public.is_admin());

drop policy if exists "Admins can view all plans" on public.hosting_plans;
create policy "Admins can view all plans"
  on public.hosting_plans for select using (public.is_admin());

drop policy if exists "Admins can view all invoices" on public.invoices;
create policy "Admins can view all invoices"
  on public.invoices for select using (public.is_admin());

drop policy if exists "Admins can view all payments" on public.payments;
create policy "Admins can view all payments"
  on public.payments for select using (public.is_admin());

drop policy if exists "Admins can view all payment methods" on public.payment_methods;
create policy "Admins can view all payment methods"
  on public.payment_methods for select using (public.is_admin());

drop policy if exists "Admins can view all orders" on public.orders;
create policy "Admins can view all orders"
  on public.orders for select using (public.is_admin());

drop policy if exists "Admins can view all credits" on public.credits;
create policy "Admins can view all credits"
  on public.credits for select using (public.is_admin());

drop policy if exists "Admins can view all plugin purchases" on public.plugin_purchases;
create policy "Admins can view all plugin purchases"
  on public.plugin_purchases for select using (public.is_admin());

-- Admins also see draft catalog entries (the user policy exposes only
-- status = 'active').
drop policy if exists "Admins can view all marketplace plugins" on public.marketplace_plugins;
create policy "Admins can view all marketplace plugins"
  on public.marketplace_plugins for select using (public.is_admin());

drop policy if exists "Admins can view all dns zones" on public.dns_zones;
create policy "Admins can view all dns zones"
  on public.dns_zones for select using (public.is_admin());

drop policy if exists "Admins can view all dns records" on public.dns_records;
create policy "Admins can view all dns records"
  on public.dns_records for select using (public.is_admin());

drop policy if exists "Admins can view all registered domains" on public.registered_domains;
create policy "Admins can view all registered domains"
  on public.registered_domains for select using (public.is_admin());

drop policy if exists "Admins can view all backup logs" on public.backup_logs;
create policy "Admins can view all backup logs"
  on public.backup_logs for select using (public.is_admin());

drop policy if exists "Admins can view all ssl certificates" on public.ssl_certificates;
create policy "Admins can view all ssl certificates"
  on public.ssl_certificates for select using (public.is_admin());

drop policy if exists "Admins can view all staging environments" on public.staging_environments;
create policy "Admins can view all staging environments"
  on public.staging_environments for select using (public.is_admin());

-- ─── Support chat policies ───────────────────────────────────────────────────
-- Customers own their conversations; admins see and manage all of them.
-- The user UPDATE policy exists so customers can zero their own unread
-- counter (and close their own conversation); the sender-integrity trigger
-- plus the bump trigger keep everything else honest. Messages are
-- append-only for everyone.

drop policy if exists "Users can view their own conversations" on public.support_conversations;
create policy "Users can view their own conversations"
  on public.support_conversations for select using (auth.uid() = user_id);

drop policy if exists "Users can create their own conversations" on public.support_conversations;
create policy "Users can create their own conversations"
  on public.support_conversations for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update their own conversations" on public.support_conversations;
create policy "Users can update their own conversations"
  on public.support_conversations for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Admins can view all conversations" on public.support_conversations;
create policy "Admins can view all conversations"
  on public.support_conversations for select using (public.is_admin());

drop policy if exists "Admins can update all conversations" on public.support_conversations;
create policy "Admins can update all conversations"
  on public.support_conversations for update using (public.is_admin());

drop policy if exists "Users can view messages in their conversations" on public.support_messages;
create policy "Users can view messages in their conversations"
  on public.support_messages for select using (
    exists (
      select 1 from public.support_conversations c
      where c.id = support_messages.conversation_id and c.user_id = auth.uid()
    )
  );

drop policy if exists "Users can send messages in their conversations" on public.support_messages;
create policy "Users can send messages in their conversations"
  on public.support_messages for insert with check (
    exists (
      select 1 from public.support_conversations c
      where c.id = support_messages.conversation_id and c.user_id = auth.uid()
    )
  );

drop policy if exists "Admins can view all messages" on public.support_messages;
create policy "Admins can view all messages"
  on public.support_messages for select using (public.is_admin());

drop policy if exists "Admins can send messages" on public.support_messages;
create policy "Admins can send messages"
  on public.support_messages for insert with check (public.is_admin());

-- ─── Realtime ────────────────────────────────────────────────────────────────
-- Chat delivery uses postgres_changes, which requires publication membership.
-- Events are authorized per-socket against the RLS policies above.

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public' and tablename = 'support_messages'
    ) then
      alter publication supabase_realtime add table public.support_messages;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public' and tablename = 'support_conversations'
    ) then
      alter publication supabase_realtime add table public.support_conversations;
    end if;
  end if;
end
$$;

-- ─── Table comments ──────────────────────────────────────────────────────────

comment on table public.hosting_nodes is 'Dedicated cPanel accounts that provide capacity for customer WordPress sites.';
comment on column public.hosting_nodes.current_slots is 'The number of provisioned WordPress sites currently assigned to the cPanel account. Max is 20.';
comment on table public.user_sites is 'Multi-tenant inventory of WordPress installations mapped to a hosting node and authenticated Maxmark user.';
comment on column public.user_sites.document_root is 'Canonical document root path used by Maxmark. cPanel API calls use the equivalent home-relative path.';
comment on table public.marketplace_plugins is 'Sellable plugin catalog entries surfaced inside the Maxmark marketplace.';
comment on table public.plugin_purchases is 'Ownership, licensing, and download telemetry for plugins purchased by authenticated users.';
comment on table public.user_profiles is 'Account metadata shown in the control panel header and billing profile.';
comment on table public.hosting_plans is 'Subscription plan records linking a user to a region and site capacity.';
comment on table public.backup_logs is 'History of per-site automated and manual backup snapshots.';
comment on table public.site_settings is 'Per-site feature toggles (NGINX, mail delivery, auto-SSL, etc.).';
comment on table public.ssl_certificates is 'Let''s Encrypt SSL certificate state and metadata per site.';
comment on table public.staging_environments is 'Dev/staging site copies cloned from a production parent site.';
comment on table public.analytics_snapshots is 'Time-series metric samples powering the site analytics dashboard.';
comment on table public.invoices is 'Billing invoices for subscription and one-time charges.';
comment on table public.payments is 'Payment transaction history linked to invoices.';
comment on table public.dns_zones is 'DNS zones owned by the user.';
comment on table public.dns_records is 'Individual DNS records within a zone.';
comment on table public.user_roles is 'Application role grants (currently only ''admin''). Written by operators only; read via is_admin().';
comment on table public.admin_audit_log is 'Append-only trail of admin mutations performed through the admin-actions Edge Function.';
comment on table public.support_conversations is 'Support chat threads between a customer and the Maxmark team, with denormalized unread counters maintained by trigger.';
comment on table public.support_messages is 'Append-only chat messages; sender fields are enforced by trigger from the writer''s JWT.';
