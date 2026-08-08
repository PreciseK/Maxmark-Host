-- Migration: Automatically register domain & create DNS zone + default DNS records when a site is provisioned

create or replace function public.sync_site_domain_and_dns_zone()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  domain_tld text;
  new_zone_id uuid;
begin
  -- Only run when a site is active or inserted
  if new.status = 'active' or new.status = 'provisioning' then
    -- Extract TLD (e.g. 'com', 'com.ng', 'ng', etc.)
    if new.site_domain like '%.com.ng' then
      domain_tld := 'com.ng';
    elsif new.site_domain like '%.org.ng' then
      domain_tld := 'org.ng';
    else
      domain_tld := split_part(new.site_domain, '.', array_length(string_to_array(new.site_domain, '.'), 1));
    end if;

    -- 1. Auto-upsert into registered_domains
    insert into public.registered_domains (
      user_id, domain, tld, status, expires_at, auto_renew, price_ngn_yearly
    ) values (
      new.user_id,
      new.site_domain,
      domain_tld,
      'active'::public.domain_status,
      (current_date + interval '1 year')::date,
      true,
      case
        when domain_tld = 'com.ng' then 6500.00
        when domain_tld = 'ng' then 18000.00
        when domain_tld = 'org' then 16000.00
        else 14500.00
      end
    )
    on conflict (domain) do update set
      user_id = new.user_id,
      status = 'active'::public.domain_status,
      auto_renew = true;

    -- 2. Auto-upsert into dns_zones
    insert into public.dns_zones (user_id, zone_name)
    values (new.user_id, new.site_domain)
    on conflict (zone_name) do update set user_id = new.user_id
    returning id into new_zone_id;

    if new_zone_id is null then
      select id into new_zone_id from public.dns_zones where zone_name = new.site_domain;
    end if;

    if new_zone_id is not null then
      -- 3. Populate default standard Maxmark DNS records for the site
      -- A record for root domain @
      insert into public.dns_records (zone_id, type, name, value, ttl)
      values (new_zone_id, 'A'::public.dns_record_type, '@', new.ip_address, 3600);

      -- CNAME for www
      insert into public.dns_records (zone_id, type, name, value, ttl)
      values (new_zone_id, 'CNAME'::public.dns_record_type, 'www', new.cname_target, 3600);

      -- A record for mail
      insert into public.dns_records (zone_id, type, name, value, ttl)
      values (new_zone_id, 'A'::public.dns_record_type, 'mail', new.ip_address, 3600);

      -- MX record
      insert into public.dns_records (zone_id, type, name, value, ttl, priority)
      values (new_zone_id, 'MX'::public.dns_record_type, '@', 'mail.' || new.site_domain, 3600, 10);

      -- TXT (SPF) record
      insert into public.dns_records (zone_id, type, name, value, ttl)
      values (new_zone_id, 'TXT'::public.dns_record_type, '@', 'v=spf1 mx a include:nxcli.net ~all', 3600);

      -- NS records
      insert into public.dns_records (zone_id, type, name, value, ttl)
      values
        (new_zone_id, 'NS'::public.dns_record_type, '@', 'ns1.maxmark.com.ng', 86400),
        (new_zone_id, 'NS'::public.dns_record_type, '@', 'ns2.maxmark.com.ng', 86400);
    end if;
  end if;

  return new;
exception when others then
  -- Ignore duplicate record errors gracefully
  return new;
end;
$$;

drop trigger if exists trigger_user_sites_sync_domain_dns on public.user_sites;
create trigger trigger_user_sites_sync_domain_dns
after insert or update on public.user_sites
for each row execute function public.sync_site_domain_and_dns_zone();

-- Backfill all existing user_sites into registered_domains and dns_zones right now
do $$
declare
  site_row record;
begin
  for site_row in select * from public.user_sites loop
    perform public.sync_site_domain_and_dns_zone();
  end loop;
end;
$$;
