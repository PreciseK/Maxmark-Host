-- ─── Add defaults to user_profiles for account_id and support_pin ────────────

alter table public.user_profiles
  alter column account_id set default ('MAX-' || upper(substring(gen_random_uuid()::text from 1 for 8))),
  alter column support_pin set default lpad((floor(random() * 900000) + 100000)::text, 6, '0');

-- Backfill any missing account_id or support_pin
update public.user_profiles
set account_id = 'MAX-' || upper(substring(gen_random_uuid()::text from 1 for 8))
where account_id is null or account_id = '';

update public.user_profiles
set support_pin = lpad((floor(random() * 900000) + 100000)::text, 6, '0')
where support_pin is null or support_pin = '';
