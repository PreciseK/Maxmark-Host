-- 20260905008000_dns_record_validation.sql
-- Customers already have direct RLS-granted write access to their own
-- dns_zones/dns_records ("for all using (auth.uid() = user_id)"), and this
-- table is the live backend the authoritative nameservers (ns1/ns2) read
-- from — a malformed row takes effect immediately, not after a review step.
-- This trigger enforces the structural DNS-correctness rules a client write
-- path can't skip: valid values per record type, CNAME exclusivity, and
-- never leaving a zone with zero NS records (which would make it lame).

alter table public.dns_records
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

create or replace function public.validate_dns_record()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    if old.type = 'NS' then
      perform 1 from public.dns_records
        where zone_id = old.zone_id and type = 'NS' and id <> old.id
        limit 1;
      if not found then
        raise exception using errcode = 'P0001',
          message = 'Cannot delete the last NS record for a zone — it would become unresolvable.';
      end if;
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' and old.type = 'NS' and new.type <> 'NS' then
    perform 1 from public.dns_records
      where zone_id = old.zone_id and type = 'NS' and id <> old.id
      limit 1;
    if not found then
      raise exception using errcode = 'P0001',
        message = 'Cannot change the last NS record for a zone away from NS — it would become unresolvable.';
    end if;
  end if;

  if new.ttl < 60 or new.ttl > 86400 then
    raise exception using errcode = 'P0001', message = 'TTL must be between 60 and 86400 seconds.';
  end if;

  if new.type in ('A', 'AAAA') then
    begin
      if new.type = 'A' and family(new.value::inet) <> 4 then
        raise exception 'not ipv4';
      elsif new.type = 'AAAA' and family(new.value::inet) <> 6 then
        raise exception 'not ipv6';
      end if;
    exception when others then
      raise exception using errcode = 'P0001',
        message = format('%s record value must be a valid IPv%s address.', new.type, case when new.type = 'A' then '4' else '6' end);
    end;
  elsif new.type in ('CNAME', 'MX', 'NS') and new.value !~ '^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.?$' then
    raise exception using errcode = 'P0001', message = format('%s record value must be a valid hostname.', new.type);
  elsif new.type = 'TXT' and length(new.value) > 2048 then
    raise exception using errcode = 'P0001', message = 'TXT record value is too long (2048 character limit).';
  end if;

  if new.type = 'MX' and new.priority is null then
    raise exception using errcode = 'P0001', message = 'MX records require a priority.';
  end if;

  if new.type = 'CNAME' and new.name = '@' then
    raise exception using errcode = 'P0001', message = 'CNAME records cannot be created at the zone apex (@).';
  end if;

  -- CNAME exclusivity: a name holds either a CNAME or other record types,
  -- never both, in either direction.
  if new.type = 'CNAME' then
    perform 1 from public.dns_records
      where zone_id = new.zone_id and name = new.name and id <> new.id
      limit 1;
    if found then
      raise exception using errcode = 'P0001',
        message = format('"%s" already has other records — a CNAME cannot coexist with them.', new.name);
    end if;
  else
    perform 1 from public.dns_records
      where zone_id = new.zone_id and name = new.name and type = 'CNAME' and id <> new.id
      limit 1;
    if found then
      raise exception using errcode = 'P0001',
        message = format('"%s" already has a CNAME record — no other record type can be added there.', new.name);
    end if;
  end if;

  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trigger_validate_dns_record on public.dns_records;
create trigger trigger_validate_dns_record
before insert or update or delete on public.dns_records
for each row execute function public.validate_dns_record();
