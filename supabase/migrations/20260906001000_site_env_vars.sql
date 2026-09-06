-- Migration: Add site_env_vars table for customer site environment variables and secrets management
-- Supports Production, Staging, and Development target environments with Row Level Security.

create table if not exists public.site_env_vars (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.user_sites(id) on delete cascade,
  key text not null,
  value text not null,
  target_env text not null default 'production',
  is_secret boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint site_env_vars_target_env_check check (target_env in ('production', 'staging', 'development', 'all')),
  constraint site_env_vars_unique_key unique (site_id, target_env, key)
);

create index if not exists idx_site_env_vars_site_id on public.site_env_vars(site_id);

-- Enable RLS
alter table public.site_env_vars enable row level security;

-- Grant permissions
grant select, insert, update, delete on table public.site_env_vars to authenticated, anon, service_role;

-- Policies for Customers: only view/edit variables for their own sites
drop policy if exists "Users can view env vars for their own sites" on public.site_env_vars;
create policy "Users can view env vars for their own sites"
on public.site_env_vars
for select
using (
  exists (
    select 1 from public.user_sites
    where public.user_sites.id = site_env_vars.site_id
      and public.user_sites.user_id = auth.uid()
  )
  or public.is_admin()
);

drop policy if exists "Users can insert env vars for their own sites" on public.site_env_vars;
create policy "Users can insert env vars for their own sites"
on public.site_env_vars
for insert
with check (
  exists (
    select 1 from public.user_sites
    where public.user_sites.id = site_env_vars.site_id
      and public.user_sites.user_id = auth.uid()
  )
  or public.is_admin()
);

drop policy if exists "Users can update env vars for their own sites" on public.site_env_vars;
create policy "Users can update env vars for their own sites"
on public.site_env_vars
for update
using (
  exists (
    select 1 from public.user_sites
    where public.user_sites.id = site_env_vars.site_id
      and public.user_sites.user_id = auth.uid()
  )
  or public.is_admin()
);

drop policy if exists "Users can delete env vars for their own sites" on public.site_env_vars;
create policy "Users can delete env vars for their own sites"
on public.site_env_vars
for delete
using (
  exists (
    select 1 from public.user_sites
    where public.user_sites.id = site_env_vars.site_id
      and public.user_sites.user_id = auth.uid()
  )
  or public.is_admin()
);
