-- ─── Fix foreign key between registered_domains and user_profiles ────────────

alter table public.registered_domains
  drop constraint if exists registered_domains_user_id_user_profiles_fkey,
  drop constraint if exists registered_domains_user_id_fkey,
  drop constraint if exists registered_domains_user_id_profiles_fkey;

alter table public.registered_domains
  add constraint registered_domains_user_id_user_profiles_fkey
  foreign key (user_id) references public.user_profiles(user_id) on delete cascade;

create or replace view public.profiles as select * from public.user_profiles;
grant select on public.profiles to authenticated, anon;
