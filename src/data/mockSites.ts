import type { ManagedSite, ProvisioningStep } from '@/types/provisioning'

function toSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function toIdentifier(value: string, limit: number) {
  const normalized = value.replace(/[^a-z0-9]/g, '')
  return normalized.slice(0, Math.max(limit, 4))
}

export function createProvisioningSteps(): ProvisioningStep[] {
  return [
    {
      id: 'select-node',
      label: 'Selecting an available node',
      description: 'Scanning cPanel capacity and picking the lowest-load account.',
      state: 'pending',
    },
    {
      id: 'create-domain',
      label: 'Creating isolated domain root',
      description: 'Preparing the addon domain and private document root.',
      state: 'pending',
    },
    {
      id: 'create-database',
      label: 'Creating MySQL database',
      description: 'Allocating a dedicated database for the WordPress install.',
      state: 'pending',
    },
    {
      id: 'create-user',
      label: 'Creating MySQL user',
      description: 'Generating scoped database credentials for the new site.',
      state: 'pending',
    },
    {
      id: 'grant-privileges',
      label: 'Granting database privileges',
      description: 'Applying the least-friction privilege set for WordPress.',
      state: 'pending',
    },
    {
      id: 'complete',
      label: 'Finalizing site record',
      description: 'Updating Maxmark inventory and unlocking the dashboard.',
      state: 'pending',
    },
  ]
}

export function createMockManagedSite(domain: string): ManagedSite {
  const slug = toSlug(domain)
  const now = new Date()
  const diskUsedGb = 8 + (slug.length % 7) * 1.7
  const bandwidthUsedGb = 72 + (slug.length % 5) * 23
  const visits = 18000 + slug.length * 1200
  const dbSuffix = toIdentifier(slug, 12)
  const userSuffix = toIdentifier(slug.split('-')[0] ?? slug, 10)

  return {
    id: `site-${slug}`,
    user_id: 'demo-user',
    node_id: 'node-lagoon-01',
    site_domain: domain,
    db_name: `maxmark_${dbSuffix}`,
    db_user: `wp_${userSuffix}`,
    document_root: `/maxmark_sites/${domain}`,
    status: 'active',
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    plan: 'Managed WordPress Pro',
    region: 'Lagos Edge',
    phpVersion: 'PHP 8.3',
    wordpressVersion: 'WP 6.8',
    backupsSummary: 'Daily snapshots with 14-day retention',
    createdLabel: new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(now),
    dailyVisits: visits,
    magicLoginLabel: 'Open WP Admin',
    metrics: {
      diskUsedGb,
      diskCapacityGb: 40,
      bandwidthUsedGb,
      bandwidthCapacityGb: 300,
      uptimePercent: 99.98,
      phpWorkers: 8,
    },
    nodeSummary: {
      primaryDomain: 'node.maxmark.host',
      currentSlots: 13,
      maxSlots: 20,
    },
    cnameTarget: '84dba1eae1.nxcli.io',
    ipAddress: '165.84.219.136',
    ftpHostname: 'cloudhost-433832.uk-south-2.nxcli.net',
    homeDirectory: `/home/${toIdentifier(slug, 8)}`,
    redisIp: '10.75.48.79',
    redisPort: 36654,
    cdnHostname: 'https://eadn-wc05-12585164.nxedge.io',
    cdnEndpoint: 'https://eadn-wc05-12585164.nxedge.io/cdn',
  }
}

export const mockSites: ManagedSite[] = [
  {
    id: 'site-atelier-and-co',
    user_id: 'demo-user',
    node_id: 'node-lagoon-01',
    site_domain: 'atelierandco.com',
    db_name: 'maxmark_atelierdb',
    db_user: 'wp_atelier',
    document_root: '/maxmark_sites/atelierandco.com',
    status: 'active',
    created_at: '2026-01-04T10:00:00.000Z',
    updated_at: '2026-03-12T04:15:00.000Z',
    plan: 'Managed WordPress Pro',
    region: 'Lagos Edge',
    phpVersion: 'PHP 8.3',
    wordpressVersion: 'WP 6.8',
    backupsSummary: 'Daily snapshots with 14-day retention',
    createdLabel: 'Jan 4, 2026',
    dailyVisits: 84210,
    magicLoginLabel: 'Open WP Admin',
    metrics: {
      diskUsedGb: 18.4,
      diskCapacityGb: 40,
      bandwidthUsedGb: 164,
      bandwidthCapacityGb: 300,
      uptimePercent: 99.99,
      phpWorkers: 10,
    },
    nodeSummary: {
      primaryDomain: 'lagoon-01.maxmark.host',
      currentSlots: 12,
      maxSlots: 20,
    },
    cnameTarget: '84dba1eae1.nxcli.io',
    ipAddress: '165.84.219.136',
    ftpHostname: 'cloudhost-433832.uk-south-2.nxcli.net',
    homeDirectory: '/home/a877b99a',
    redisIp: '10.75.48.79',
    redisPort: 36654,
    cdnHostname: 'https://eadn-wc05-12585164.nxedge.io',
    cdnEndpoint: 'https://eadn-wc05-12585164.nxedge.io/cdn',
  },
  {
    id: 'site-riverline-media',
    user_id: 'demo-user',
    node_id: 'node-lagoon-01',
    site_domain: 'riverlinemedia.co',
    db_name: 'maxmark_riverdb',
    db_user: 'wp_river',
    document_root: '/maxmark_sites/riverlinemedia.co',
    status: 'active',
    created_at: '2026-02-15T08:45:00.000Z',
    updated_at: '2026-03-12T03:20:00.000Z',
    plan: 'Managed WordPress Scale',
    region: 'Frankfurt Cache',
    phpVersion: 'PHP 8.2',
    wordpressVersion: 'WP 6.8',
    backupsSummary: 'Hourly database snapshots',
    createdLabel: 'Feb 15, 2026',
    dailyVisits: 41290,
    magicLoginLabel: 'Open WP Admin',
    metrics: {
      diskUsedGb: 11.8,
      diskCapacityGb: 30,
      bandwidthUsedGb: 119,
      bandwidthCapacityGb: 240,
      uptimePercent: 99.97,
      phpWorkers: 6,
    },
    nodeSummary: {
      primaryDomain: 'lagoon-01.maxmark.host',
      currentSlots: 12,
      maxSlots: 20,
    },
    cnameTarget: '84dba1eae1.nxcli.io',
    ipAddress: '165.84.219.136',
    ftpHostname: 'cloudhost-433832.uk-south-2.nxcli.net',
    homeDirectory: '/home/b912c88f',
    redisIp: '10.75.51.22',
    redisPort: 36712,
    cdnHostname: 'https://eadn-wc05-97312845.nxedge.io',
    cdnEndpoint: 'https://eadn-wc05-97312845.nxedge.io/cdn',
  },
  {
    id: 'site-copperstate-labs',
    user_id: 'demo-user',
    node_id: 'node-oasis-02',
    site_domain: 'copperstatelabs.dev',
    db_name: 'maxmark_copperdb',
    db_user: 'wp_copper',
    document_root: '/maxmark_sites/copperstatelabs.dev',
    status: 'active',
    created_at: '2026-03-02T06:35:00.000Z',
    updated_at: '2026-03-13T08:10:00.000Z',
    plan: 'Managed WordPress Launch',
    region: 'London Edge',
    phpVersion: 'PHP 8.3',
    wordpressVersion: 'WP 6.8',
    backupsSummary: 'Nightly snapshots + one-click restore',
    createdLabel: 'Mar 2, 2026',
    dailyVisits: 12840,
    magicLoginLabel: 'Open WP Admin',
    metrics: {
      diskUsedGb: 6.2,
      diskCapacityGb: 25,
      bandwidthUsedGb: 61,
      bandwidthCapacityGb: 180,
      uptimePercent: 99.95,
      phpWorkers: 4,
    },
    nodeSummary: {
      primaryDomain: 'oasis-02.maxmark.host',
      currentSlots: 8,
      maxSlots: 20,
    },
    cnameTarget: 'c3f19a44bb.nxcli.io',
    ipAddress: '178.62.144.91',
    ftpHostname: 'cloudhost-187421.eu-west-1.nxcli.net',
    homeDirectory: '/home/e44d2b10',
    redisIp: '10.74.33.98',
    redisPort: 36801,
    cdnHostname: 'https://eadn-wc05-44812730.nxedge.io',
    cdnEndpoint: 'https://eadn-wc05-44812730.nxedge.io/cdn',
  },
]
