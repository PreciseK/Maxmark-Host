-- 20260905009000_dns_zone_repair.sql
-- The provisioning trigger (sync_site_domain_and_dns_zone) swallows any
-- error via `exception when others then return new`, so a site can in
-- theory end up without a DNS zone. This RPC lets a user repair that for
-- one of their own sites — it mirrors the trigger's zone + default record
-- creation, scoped to a single site, callable directly from the client.
-- security invoker: relies on the same RLS ("for all using (auth.uid() =
-- user_id)") that already lets a user manage their own dns_zones/dns_records.

create or replace function public.ensure_dns_zone_for_site(target_site_id uuid)
returns public.dns_zones
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  site public.user_sites%rowtype;
  zone public.dns_zones%rowtype;
begin
  select * into site from public.user_sites
    where id = target_site_id and user_id = auth.uid();
  if site.id is null then
    raise exception using errcode = 'P0001', message = 'Site not found or access denied.';
  end if;

  select * into zone from public.dns_zones where zone_name = site.site_domain;
  if zone.id is not null then
    return zone;
  end if;

  insert into public.dns_zones (user_id, zone_name)
  values (site.user_id, site.site_domain)
  returning * into zone;

  insert into public.dns_records (zone_id, type, name, value, ttl) values
    (zone.id, 'A'::public.dns_record_type, '@', site.ip_address, 3600),
    (zone.id, 'A'::public.dns_record_type, 'mail', site.ip_address, 3600),
    (zone.id, 'CNAME'::public.dns_record_type, 'www', site.cname_target, 3600),
    (zone.id, 'TXT'::public.dns_record_type, '@', 'v=spf1 mx a include:nxcli.net ~all', 3600),
    (zone.id, 'NS'::public.dns_record_type, '@', 'ns1.maxmark.com.ng', 86400),
    (zone.id, 'NS'::public.dns_record_type, '@', 'ns2.maxmark.com.ng', 86400);

  insert into public.dns_records (zone_id, type, name, value, ttl, priority) values
    (zone.id, 'MX'::public.dns_record_type, '@', 'mail.' || site.site_domain, 3600, 10);

  return zone;
end;
$$;

grant execute on function public.ensure_dns_zone_for_site(uuid) to authenticated;
