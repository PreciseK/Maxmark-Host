-- Automatically create user_profile row upon signup
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

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
