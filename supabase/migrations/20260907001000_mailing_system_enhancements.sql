-- Migration: Enhance email_boxes and email_aliases for complete Mailing System
-- Adds storage usage tracking, status flags, auto-responder settings, and admin RLS.

-- 1. Enhance email_boxes table
alter table public.email_boxes
  add column if not exists used_mb numeric(10, 2) not null default 0.0,
  add column if not exists status text not null default 'active',
  add column if not exists autoresponder_enabled boolean not null default false,
  add column if not exists autoresponder_subject text,
  add column if not exists autoresponder_body text,
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

-- Add check constraint on email_boxes status if not present
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'email_boxes_status_check'
  ) then
    alter table public.email_boxes
      add constraint email_boxes_status_check check (status in ('active', 'suspended', 'locked'));
  end if;
end $$;

-- 2. Enhance email_aliases table
alter table public.email_aliases
  add column if not exists is_active boolean not null default true,
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

-- 3. Create mail cluster telemetry table for administrative monitoring
create table if not exists public.email_cluster_nodes (
  id uuid primary key default gen_random_uuid(),
  node_name text not null unique,
  ip_address text not null,
  role text not null default 'mta_and_store', -- 'mta', 'imap_store', 'relay'
  status text not null default 'healthy', -- 'healthy', 'degraded', 'offline'
  active_imap_sessions integer not null default 0,
  queue_length integer not null default 0,
  storage_used_gb numeric(10, 2) not null default 0.0,
  storage_total_gb numeric(10, 2) not null default 1000.0,
  rbl_status text not null default 'clean', -- 'clean', 'listed'
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- Enable RLS on cluster nodes
alter table public.email_cluster_nodes enable row level security;

-- Permissions
grant select, insert, update, delete on table public.email_boxes to authenticated, anon, service_role;
grant select, insert, update, delete on table public.email_aliases to authenticated, anon, service_role;
grant select, insert, update, delete on table public.email_cluster_nodes to authenticated, anon, service_role;

-- 4. Cross-tenant policies for administrators
drop policy if exists "Admins have full access to email_boxes" on public.email_boxes;
create policy "Admins have full access to email_boxes"
  on public.email_boxes for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admins have full access to email_aliases" on public.email_aliases;
create policy "Admins have full access to email_aliases"
  on public.email_aliases for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admins have full access to email_cluster_nodes" on public.email_cluster_nodes;
create policy "Admins have full access to email_cluster_nodes"
  on public.email_cluster_nodes for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Users can read cluster nodes" on public.email_cluster_nodes;
create policy "Users can read cluster nodes"
  on public.email_cluster_nodes for select
  using (auth.role() = 'authenticated');

-- Seed default cluster nodes if empty
insert into public.email_cluster_nodes (node_name, ip_address, role, status, active_imap_sessions, queue_length, storage_used_gb, storage_total_gb, rbl_status)
values
  ('mx1.maxmarkhost.com', '198.51.100.41', 'mta_and_store', 'healthy', 142, 3, 246.5, 2000.0, 'clean'),
  ('mx2.maxmarkhost.com', '198.51.100.42', 'mta_and_store', 'healthy', 98, 1, 198.2, 2000.0, 'clean'),
  ('relay.maxmarkhost.com', '198.51.100.49', 'relay', 'healthy', 0, 0, 12.0, 500.0, 'clean')
on conflict (node_name) do nothing;
