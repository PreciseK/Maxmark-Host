-- ─── Add wp_admin_password column to user_sites ────────────────────────────

alter table public.user_sites
add column if not exists wp_admin_password text default 'MaxMark@2026!Secured';

-- Allow authenticated users to update their own site passwords
drop policy if exists "Users can update their own site passwords" on public.user_sites;
create policy "Users can update their own site passwords"
  on public.user_sites
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
