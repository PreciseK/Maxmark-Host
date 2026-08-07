-- ─── 1. Ensure default active hosting node exists ─────────────────────────────

insert into public.hosting_nodes (cpanel_username, primary_domain, current_slots, max_slots, status)
values ('maxmark', 'co-s1.serverpanel.com', 0, 50, 'active')
on conflict (cpanel_username) do update set status = 'active', max_slots = 50;

-- ─── 2. Auto-create hosting plan in handle_new_user trigger ──────────────────

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  account_num text;
  pin_code text;
begin
  account_num := 'MAX-' || upper(substring(new.id::text from 1 for 8));
  pin_code := lpad((floor(random() * 9000) + 1000)::text, 4, '0');

  insert into public.user_profiles (user_id, display_name, account_id, support_pin)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(coalesce(new.email, ''), '@', 1), 'Customer'),
    account_num,
    pin_code
  )
  on conflict (user_id) do nothing;

  -- Automatically grant default active hosting plan with 10 site capacity
  insert into public.hosting_plans (user_id, name, type, region, sites_limit, price_ngn_yearly, renewal_date, status)
  values (
    new.id,
    'Standard Hosting Plan',
    'Standard'::public.hosting_plan_type,
    'Lagos, NG',
    10,
    25000.00,
    (current_date + interval '1 year')::date,
    'active'::public.hosting_plan_status
  );

  return new;
end;
$$;

-- ─── 3. Backfill active hosting plans for all existing users ────────────────

insert into public.hosting_plans (user_id, name, type, region, sites_limit, price_ngn_yearly, renewal_date, status)
select
  u.id,
  'Standard Hosting Plan',
  'Standard'::public.hosting_plan_type,
  'Lagos, NG',
  10,
  25000.00,
  (current_date + interval '1 year')::date,
  'active'::public.hosting_plan_status
from auth.users u
where not exists (
  select 1 from public.hosting_plans p
  where p.user_id = u.id and p.status = 'active' and p.renewal_date >= current_date
);
