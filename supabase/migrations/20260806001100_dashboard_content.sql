-- Dashboard content: service status, scheduled maintenance, knowledge base.
-- Replaces the hardcoded arrays in src/pages/dashboard-home.tsx.
--
-- Read posture mirrors user_sites: customers select published rows, admins
-- also select drafts, and no client may write. Every mutation goes through
-- the admin-actions Edge Function so it lands in admin_audit_log.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'service_status') then
    create type public.service_status as enum (
      'operational', 'degraded', 'partial_outage', 'major_outage', 'maintenance'
    );
  end if;
end
$$;

-- ─── Service components ──────────────────────────────────────────────────────

create table if not exists public.service_components (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text not null default '',
  status public.service_status not null default 'operational',
  sort_order integer not null default 0,
  published boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.service_components enable row level security;

drop policy if exists "Users can view published service components" on public.service_components;
create policy "Users can view published service components"
  on public.service_components for select using (published = true);

drop policy if exists "Admins can view all service components" on public.service_components;
create policy "Admins can view all service components"
  on public.service_components for select using (public.is_admin());

revoke insert, update, delete on table public.service_components from authenticated;

drop trigger if exists service_components_set_updated_at on public.service_components;
create trigger service_components_set_updated_at
  before update on public.service_components
  for each row execute function public.set_updated_at();

-- ─── Maintenance windows ─────────────────────────────────────────────────────

create table if not exists public.maintenance_windows (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  published boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint maintenance_windows_valid_range check (ends_at > starts_at)
);

alter table public.maintenance_windows enable row level security;

drop policy if exists "Users can view published maintenance windows" on public.maintenance_windows;
create policy "Users can view published maintenance windows"
  on public.maintenance_windows for select using (published = true);

drop policy if exists "Admins can view all maintenance windows" on public.maintenance_windows;
create policy "Admins can view all maintenance windows"
  on public.maintenance_windows for select using (public.is_admin());

revoke insert, update, delete on table public.maintenance_windows from authenticated;

drop trigger if exists maintenance_windows_set_updated_at on public.maintenance_windows;
create trigger maintenance_windows_set_updated_at
  before update on public.maintenance_windows
  for each row execute function public.set_updated_at();

create index if not exists maintenance_windows_ends_at_idx
  on public.maintenance_windows (ends_at desc);

-- ─── Knowledge base articles ─────────────────────────────────────────────────

create table if not exists public.kb_articles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  category text not null,
  body_markdown text not null,
  sort_order integer not null default 0,
  published boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.kb_articles enable row level security;

drop policy if exists "Users can view published kb articles" on public.kb_articles;
create policy "Users can view published kb articles"
  on public.kb_articles for select using (published = true);

drop policy if exists "Admins can view all kb articles" on public.kb_articles;
create policy "Admins can view all kb articles"
  on public.kb_articles for select using (public.is_admin());

revoke insert, update, delete on table public.kb_articles from authenticated;

drop trigger if exists kb_articles_set_updated_at on public.kb_articles;
create trigger kb_articles_set_updated_at
  before update on public.kb_articles
  for each row execute function public.set_updated_at();

create index if not exists kb_articles_published_sort_idx
  on public.kb_articles (published, sort_order);

-- ─── Seed ────────────────────────────────────────────────────────────────────
-- The six components the dashboard shipped hardcoded. Seeding on conflict by
-- name means re-running never duplicates a row or resets a status an operator
-- has since changed.

insert into public.service_components (name, description, sort_order) values
  ('Support Services', 'Ticketing, live chat, and the customer support portal.', 1),
  ('Platform Operations', 'Control panel, provisioning, and account management.', 2),
  ('Managed WordPress', 'Customer WordPress sites, PHP workers, and caching.', 3),
  ('Maxmark Cloud', 'Object storage, backups, and the content delivery network.', 4),
  ('Cloud Container Services', 'Elasticsearch, RabbitMQ, and Solr containers.', 5),
  ('Data Centers & Network', 'Physical infrastructure, routing, and connectivity.', 6)
on conflict (name) do nothing;
