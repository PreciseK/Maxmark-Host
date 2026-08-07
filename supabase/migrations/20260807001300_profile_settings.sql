-- ─── Profile settings columns & permissions ─────────────────────────────────

-- 1. Add missing profile columns to user_profiles
alter table public.user_profiles
  add column if not exists full_name text,
  add column if not exists phone text,
  add column if not exists company text;

-- 2. Populate full_name from display_name if null
update public.user_profiles
set full_name = display_name
where full_name is null;

-- 3. Grant column-level UPDATE permissions to authenticated users
grant select, insert, update (display_name, full_name, avatar_url, phone, company, support_pin)
  on table public.user_profiles to authenticated;

-- 4. Ensure RLS policies exist for authenticated users
alter table public.user_profiles enable row level security;

drop policy if exists "Users can view their own profile" on public.user_profiles;
create policy "Users can view their own profile"
  on public.user_profiles for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own profile" on public.user_profiles;
create policy "Users can insert their own profile"
  on public.user_profiles for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own profile" on public.user_profiles;
create policy "Users can update their own profile"
  on public.user_profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 5. Recreate public.profiles view
create or replace view public.profiles as select * from public.user_profiles;
grant select on public.profiles to authenticated, anon;
