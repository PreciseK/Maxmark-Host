-- ─── 1. Fix foreign key between registered_domains and user_profiles ────────
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'registered_domains_user_id_user_profiles_fkey'
  ) then
    alter table public.registered_domains
      drop constraint if exists registered_domains_user_id_fkey;

    alter table public.registered_domains
      add constraint registered_domains_user_id_user_profiles_fkey
      foreign key (user_id) references public.user_profiles(id) on delete cascade;
  end if;
end
$$;

-- Create profiles alias view for PostgREST joins
create or replace view public.profiles as select * from public.user_profiles;
grant select on public.profiles to authenticated, anon;

-- ─── 2. System Backups Table ──────────────────────────────────────────────────
create table if not exists public.system_backups (
  id uuid primary key default gen_random_uuid(),
  snapshot_name text not null unique,
  site_domain text not null default 'All Active Sites (Global Snapshot)',
  size_mb integer not null default 250,
  status text not null default 'completed',
  storage_location text not null default 'R2 maxmark-private/backups',
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.system_backups enable row level security;

drop policy if exists "Admins can manage system backups" on public.system_backups;
create policy "Admins can manage system backups"
  on public.system_backups for all using (public.is_admin());

-- Seed initial system backups if empty
insert into public.system_backups (snapshot_name, site_domain, size_mb, status, storage_location, created_at)
select 'daily-snap-080626-01', 'maxmark.com.ng', 1240, 'completed', 'R2 maxmark-private/backups', timezone('utc', now() - interval '2 hours')
where not exists (select 1 from public.system_backups limit 1);

insert into public.system_backups (snapshot_name, site_domain, size_mb, status, storage_location, created_at)
select 'daily-snap-080626-02', 'All Active Sites (Global Snapshot)', 3850, 'completed', 'R2 maxmark-private/backups', timezone('utc', now() - interval '6 hours')
where not exists (select 1 from public.system_backups where snapshot_name = 'daily-snap-080626-02');

-- ─── 3. Email Templates Table ─────────────────────────────────────────────────
create table if not exists public.email_templates (
  id text primary key,
  name text not null,
  subject text not null,
  category text not null default 'auth',
  body_html text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.email_templates enable row level security;

drop policy if exists "Admins can manage email templates" on public.email_templates;
create policy "Admins can manage email templates"
  on public.email_templates for all using (public.is_admin());

-- Seed default templates
insert into public.email_templates (id, name, subject, category, body_html)
values
  ('auth_otp', 'Verification Code OTP', '{{code}} is your Maxmark Host verification code', 'auth', '<p>Enter your 6-digit code: <strong>{{code}}</strong></p>'),
  ('site_provisioned', 'Site Provisioned Live', 'Your WordPress site {{domain}} is live!', 'hosting', '<h1>Site Provisioned!</h1><p>Your site {{domain}} is active on cPanel with AutoSSL.</p>'),
  ('invoice_paid', 'Payment Receipt', 'Receipt for Invoice #{{invoiceId}}', 'billing', '2 Payment Receipt Amount Paid: {{amount}}'),
  ('support_reply', 'Support Ticket Reply', 'New reply to: {{ticketSubject}}', 'support', '<p>A support technician replied: {{message}}</p>')
on conflict (id) do nothing;
