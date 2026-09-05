import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { buildBindZoneFile } from '../src/lib/dns-export.ts'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

const VALIDATION_MIGRATION = 'supabase/migrations/20260905008000_dns_record_validation.sql'
const REPAIR_MIGRATION = 'supabase/migrations/20260905009000_dns_zone_repair.sql'
const ZONES_PAGE = 'src/pages/dns-zones-page.tsx'
const ZONE_DETAIL_PAGE = 'src/pages/dns-zone-detail-page.tsx'

test('dns_records validation trigger enforces type-specific value formats', async () => {
  const sql = await read(VALIDATION_MIGRATION)
  assert.match(sql, /before insert or update or delete on public\.dns_records/)
  assert.match(sql, /family\(new\.value::inet\) <> 4/)
  assert.match(sql, /family\(new\.value::inet\) <> 6/)
  assert.match(sql, /new\.ttl < 60 or new\.ttl > 86400/)
  assert.match(sql, /new\.type = 'TXT' and length\(new\.value\) > 2048/)
  assert.match(sql, /new\.type = 'MX' and new\.priority is null/)
})

test('dns_records validation trigger enforces CNAME exclusivity and blocks CNAME at the apex', async () => {
  const sql = await read(VALIDATION_MIGRATION)
  assert.match(sql, /new\.type = 'CNAME' and new\.name = '@'/)
  // Both directions: adding a CNAME where other records exist, and adding
  // any other record where a CNAME already exists.
  assert.match(sql, /a CNAME cannot coexist with them/)
  assert.match(sql, /no other record type can be added there/)
})

test('dns_records validation trigger never allows a zone down to zero NS records', async () => {
  const sql = await read(VALIDATION_MIGRATION)
  // Deleting the last NS record directly.
  assert.match(sql, /old\.type = 'NS'[\s\S]{0,300}Cannot delete the last NS record/)
  // Editing the last NS record's type away from NS has the same effect and
  // must be caught too, not just outright deletion.
  assert.match(sql, /tg_op = 'UPDATE' and old\.type = 'NS' and new\.type <> 'NS'/)
})

test('ensure_dns_zone_for_site only touches the calling user\'s own site, via RLS', async () => {
  const sql = await read(REPAIR_MIGRATION)
  assert.match(sql, /security invoker/)
  assert.match(sql, /where id = target_site_id and user_id = auth\.uid\(\)/)
  // Idempotent: returns the existing zone instead of erroring or duplicating.
  assert.match(sql, /if zone\.id is not null then\s*return zone;/)
  assert.match(sql, /grant execute on function public\.ensure_dns_zone_for_site\(uuid\) to authenticated/)
})

test('buildBindZoneFile produces a well-formed zone using the zone\'s own NS records', () => {
  const records = [
    { id: '1', zoneId: 'z', type: 'NS', name: '@', value: 'ns1.maxmark.com.ng', ttl: 86400, priority: null, createdAt: '', updatedAt: '' },
    { id: '2', zoneId: 'z', type: 'NS', name: '@', value: 'ns2.maxmark.com.ng', ttl: 86400, priority: null, createdAt: '', updatedAt: '' },
    { id: '3', zoneId: 'z', type: 'A', name: '@', value: '203.0.113.10', ttl: 3600, priority: null, createdAt: '', updatedAt: '' },
    { id: '4', zoneId: 'z', type: 'CNAME', name: 'www', value: 'example.com', ttl: 3600, priority: null, createdAt: '', updatedAt: '' },
    { id: '5', zoneId: 'z', type: 'MX', name: '@', value: 'mail.example.com', ttl: 3600, priority: 10, createdAt: '', updatedAt: '' },
    { id: '6', zoneId: 'z', type: 'TXT', name: '@', value: 'v=spf1 mx a ~all', ttl: 3600, priority: null, createdAt: '', updatedAt: '' },
  ]

  const zoneFile = buildBindZoneFile('example.com', records)

  assert.match(zoneFile, /^\$ORIGIN example\.com\.$/m)
  assert.match(zoneFile, /^\$TTL 3600$/m)
  // SOA uses the zone's actual first NS record, not a hardcoded default.
  assert.match(zoneFile, /SOA\tns1\.maxmark\.com\.ng\./)
  assert.match(zoneFile, /@\t3600\tIN\tA\t203\.0\.113\.10/)
  assert.match(zoneFile, /www\t3600\tIN\tCNAME\texample\.com\./)
  assert.match(zoneFile, /@\t3600\tIN\tMX\t10\tmail\.example\.com\./)
  assert.match(zoneFile, /@\t3600\tIN\tTXT\t"v=spf1 mx a ~all"/)
})

test('buildBindZoneFile falls back to a default nameserver when a zone has no NS records yet', () => {
  const records = [
    { id: '1', zoneId: 'z', type: 'A', name: '@', value: '203.0.113.10', ttl: 3600, priority: null, createdAt: '', updatedAt: '' },
  ]
  const zoneFile = buildBindZoneFile('example.com', records)
  assert.match(zoneFile, /SOA\tns1\.maxmark\.com\.ng\./)
})

test('the DNS zones list page links to a real zone detail page instead of alert() placeholders', async () => {
  const source = await read(ZONES_PAGE)
  assert.doesNotMatch(source, /alert\(/)
  assert.match(source, /to=\{`\/dns-zones\/\$\{zone\.id\}`\}/)
  assert.match(source, /ensureDnsZoneForSite/)
  assert.match(source, /fetchSitesMissingDnsZone/)
})

test('the DNS zone detail page supports full record CRUD and warns before deleting root records', async () => {
  const source = await read(ZONE_DETAIL_PAGE)
  assert.match(source, /createDnsRecord/)
  assert.match(source, /updateDnsRecord/)
  assert.match(source, /deleteDnsRecord/)
  assert.match(source, /buildBindZoneFile/)
  assert.match(source, /isProtectedRecord/)
  assert.match(source, /can take .*offline/)
})
