import type { DnsRecord } from '@/lib/db/dns-zones'

function serial(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}${m}${d}01`
}

function recordLine(record: DnsRecord): string {
  const name = record.name === '@' ? '@' : record.name
  const value =
    record.type === 'TXT'
      ? `"${record.value.replace(/"/g, '\\"')}"`
      : record.type === 'CNAME' || record.type === 'MX' || record.type === 'NS'
        ? `${record.value.replace(/\.$/, '')}.`
        : record.value
  const priority = record.type === 'MX' ? `${record.priority ?? 0}\t` : ''
  return `${name}\t${record.ttl}\tIN\t${record.type}\t${priority}${value}`
}

export function buildBindZoneFile(zoneName: string, records: DnsRecord[]): string {
  const nsRecords = records.filter((r) => r.type === 'NS')
  const primaryNs = nsRecords[0]?.value.replace(/\.$/, '') || 'ns1.maxmark.com.ng'

  const header = [
    `$ORIGIN ${zoneName}.`,
    '$TTL 3600',
    `@\tIN\tSOA\t${primaryNs}. hostmaster.${zoneName}. (`,
    `\t\t\t${serial()} ; serial`,
    '\t\t\t3600       ; refresh',
    '\t\t\t600        ; retry',
    '\t\t\t604800     ; expire',
    '\t\t\t3600 )     ; minimum',
    '',
  ]

  const body = records.map((r) => recordLine(r))

  return [...header, ...body, ''].join('\n')
}
