import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

const MIGRATION = 'supabase/migrations/20260806001000_dashboard_content.sql'
const TABLES = ['service_components', 'maintenance_windows', 'kb_articles']

test('dashboard content tables are created with the service_status enum', async () => {
  const sql = await read(MIGRATION)
  assert.match(sql, /create type public\.service_status as enum/)
  for (const value of [
    'operational',
    'degraded',
    'partial_outage',
    'major_outage',
    'maintenance',
  ]) {
    assert.match(sql, new RegExp(`'${value}'`))
  }
  for (const table of TABLES) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}`))
  }
})

test('dashboard content tables are read-only to clients and gated by RLS', async () => {
  const sql = await read(MIGRATION)
  for (const table of TABLES) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`))
    // Customers may read published rows only.
    assert.match(sql, new RegExp(`on public\\.${table} for select using \\(published = true\\)`))
    // Admins additionally read drafts.
    assert.match(sql, new RegExp(`on public\\.${table} for select using \\(public\\.is_admin\\(\\)\\)`))
    // No client writes at all: every mutation goes through admin-actions.
    assert.match(
      sql,
      new RegExp(`revoke insert, update, delete on table public\\.${table} from authenticated`),
    )
  }
})

test('maintenance windows cannot end before they start', async () => {
  const sql = await read(MIGRATION)
  assert.match(sql, /check \(ends_at > starts_at\)/)
})

test('seeded service components are idempotent and match the shipped widget', async () => {
  const sql = await read(MIGRATION)
  for (const name of [
    'Support Services',
    'Platform Operations',
    'Managed WordPress',
    'Maxmark Cloud',
    'Cloud Container Services',
    'Data Centers & Network',
  ]) {
    assert.ok(sql.includes(name), `expected seed for "${name}"`)
  }
  assert.match(sql, /on conflict \(name\) do nothing/)
})

import { overallStatus } from '../src/lib/db/service-status.ts'

const component = (status) => ({
  id: status,
  name: status,
  description: '',
  status,
  sortOrder: 0,
  published: true,
  createdAt: '2026-08-06T00:00:00Z',
})

test('overallStatus reports operational only when every component is operational', () => {
  assert.equal(overallStatus([component('operational'), component('operational')]), 'operational')
})

test('overallStatus reports the worst status present', () => {
  assert.equal(
    overallStatus([component('operational'), component('degraded'), component('major_outage')]),
    'major_outage',
  )
  assert.equal(
    overallStatus([component('operational'), component('maintenance')]),
    'maintenance',
  )
  assert.equal(
    overallStatus([component('degraded'), component('partial_outage')]),
    'partial_outage',
  )
})

test('overallStatus severity chain: maintenance < degraded < partial_outage < major_outage', () => {
  // maintenance < degraded
  assert.equal(
    overallStatus([component('maintenance'), component('degraded')]),
    'degraded',
  )
  // maintenance < partial_outage
  assert.equal(
    overallStatus([component('maintenance'), component('partial_outage')]),
    'partial_outage',
  )
  // maintenance < major_outage
  assert.equal(
    overallStatus([component('maintenance'), component('major_outage')]),
    'major_outage',
  )
  // degraded < partial_outage
  assert.equal(
    overallStatus([component('degraded'), component('partial_outage')]),
    'partial_outage',
  )
  // partial_outage < major_outage
  assert.equal(
    overallStatus([component('partial_outage'), component('major_outage')]),
    'major_outage',
  )
})

test('overallStatus treats an empty list as operational', () => {
  assert.equal(overallStatus([]), 'operational')
})

test('customer service component fetch filters to published rows', async () => {
  const source = await read('src/lib/db/service-status.ts')

  // Extract fetchServiceComponents function body
  const customerFetchMatch = source.match(
    /export async function fetchServiceComponents[\s\S]*?^}/m
  )
  assert.ok(customerFetchMatch, 'fetchServiceComponents function not found')
  const customerFetchBody = customerFetchMatch[0]

  // Extract fetchAllServiceComponents function body
  const adminFetchMatch = source.match(
    /export async function fetchAllServiceComponents[\s\S]*?^}/m
  )
  assert.ok(adminFetchMatch, 'fetchAllServiceComponents function not found')
  const adminFetchBody = adminFetchMatch[0]

  // Verify published filter IS in fetchServiceComponents
  assert.match(
    customerFetchBody,
    /\.eq\('published', true\)/,
    'fetchServiceComponents must have published filter'
  )

  // Verify published filter is NOT in fetchAllServiceComponents
  assert.ok(
    !adminFetchBody.match(/\.eq\('published', true\)/),
    'fetchAllServiceComponents must NOT have published filter'
  )
})

import { deriveWindowState } from '../src/lib/db/maintenance.ts'

// Named to avoid shadowing the global `window`.
const maintenanceWindow = () => ({
  id: 'w1',
  title: 'Network upgrade',
  body: 'Routing hardware refresh.',
  startsAt: '2026-08-10T09:00:00Z',
  endsAt: '2026-08-10T11:00:00Z',
  published: true,
  createdAt: '2026-08-06T00:00:00Z',
})

test('deriveWindowState reports scheduled before the window opens', () => {
  assert.equal(
    deriveWindowState(maintenanceWindow(), new Date('2026-08-10T08:59:59Z')),
    'scheduled',
  )
})

test('deriveWindowState reports in_progress on both boundaries and between', () => {
  for (const at of ['2026-08-10T09:00:00Z', '2026-08-10T10:00:00Z', '2026-08-10T11:00:00Z']) {
    assert.equal(deriveWindowState(maintenanceWindow(), new Date(at)), 'in_progress', at)
  }
})

test('deriveWindowState reports completed after the window closes', () => {
  assert.equal(
    deriveWindowState(maintenanceWindow(), new Date('2026-08-10T11:00:01Z')),
    'completed',
  )
})

test('customer maintenance fetch filters published and ages out finished windows', async () => {
  const source = await read('src/lib/db/maintenance.ts')

  // Extract fetchActiveMaintenanceWindows function body
  const customerFetchMatch = source.match(
    /export async function fetchActiveMaintenanceWindows[\s\S]*?^}/m
  )
  assert.ok(customerFetchMatch, 'fetchActiveMaintenanceWindows function not found')
  const customerFetchBody = customerFetchMatch[0]

  // Extract fetchAllMaintenanceWindows function body
  const adminFetchMatch = source.match(
    /export async function fetchAllMaintenanceWindows[\s\S]*?^}/m
  )
  assert.ok(adminFetchMatch, 'fetchAllMaintenanceWindows function not found')
  const adminFetchBody = adminFetchMatch[0]

  // Verify published filter IS in fetchActiveMaintenanceWindows
  assert.match(
    customerFetchBody,
    /\.eq\('published', true\)/,
    'fetchActiveMaintenanceWindows must have published filter'
  )

  // Verify published filter is NOT in fetchAllMaintenanceWindows
  assert.ok(
    !adminFetchBody.match(/\.eq\('published', true\)/),
    'fetchAllMaintenanceWindows must NOT have published filter'
  )

  // Verify gt cutoff IS in fetchActiveMaintenanceWindows
  assert.match(
    customerFetchBody,
    /\.gt\('ends_at'/,
    'fetchActiveMaintenanceWindows must have ends_at cutoff filter'
  )

  // Verify gt cutoff is NOT in fetchAllMaintenanceWindows
  assert.ok(
    !adminFetchBody.match(/\.gt\('ends_at'/),
    'fetchAllMaintenanceWindows must NOT have ends_at cutoff filter'
  )
})

test('kb article fetches filter to published rows in the right functions', async () => {
  const source = await read('src/lib/db/kb.ts')

  const listFetchMatch = source.match(/export async function fetchPublishedArticles[\s\S]*?^}/m)
  assert.ok(listFetchMatch, 'fetchPublishedArticles function not found')
  const listFetchBody = listFetchMatch[0]

  const bySlugFetchMatch = source.match(/export async function fetchArticleBySlug[\s\S]*?^}/m)
  assert.ok(bySlugFetchMatch, 'fetchArticleBySlug function not found')
  const bySlugFetchBody = bySlugFetchMatch[0]

  const adminFetchMatch = source.match(/export async function fetchAllArticles[\s\S]*?^}/m)
  assert.ok(adminFetchMatch, 'fetchAllArticles function not found')
  const adminFetchBody = adminFetchMatch[0]

  // A draft must not become readable by guessing its slug, so both customer
  // paths (list and by-slug) must filter to published rows.
  assert.match(
    listFetchBody,
    /\.eq\('published', true\)/,
    'fetchPublishedArticles must have published filter'
  )
  assert.match(
    bySlugFetchBody,
    /\.eq\('published', true\)/,
    'fetchArticleBySlug must have published filter'
  )
  assert.match(bySlugFetchBody, /\.maybeSingle\(\)/, 'fetchArticleBySlug must use maybeSingle')

  // The admin path must see drafts, so it must NOT carry the published filter.
  assert.ok(
    !adminFetchBody.match(/\.eq\('published', true\)/),
    'fetchAllArticles must NOT have published filter'
  )
})

const CONTENT_ACTIONS = [
  'upsert_service_component',
  'delete_service_component',
  'upsert_maintenance_window',
  'delete_maintenance_window',
  'upsert_kb_article',
  'delete_kb_article',
]

test('every content mutation is an audited admin action', async () => {
  const fn = await read('supabase/functions/admin-actions/index.ts')
  for (const action of CONTENT_ACTIONS) {
    assert.match(fn, new RegExp(`z\\.literal\\('${action}'\\)`), `${action} missing from schema`)
    assert.match(fn, new RegExp(`case '${action}':`), `${action} missing from dispatch`)
    assert.match(fn, new RegExp(`'${action}',`), `${action} missing from auditableActions`)
  }
})

test('article input is bounded at the trust boundary', async () => {
  const fn = await read('supabase/functions/admin-actions/index.ts')
  // Slug reaches a route param, so restrict it to a safe shape.
  assert.match(fn, /\^\[a-z0-9\]\+\(\?:-\[a-z0-9\]\+\)\*\$/)
  // A runaway body would bloat every dashboard fetch.
  assert.match(fn, /max\(50_000\)|max\(50000\)/)
})

test('the client bridge exposes the content actions', async () => {
  const bridge = await read('src/lib/functions.ts')
  for (const action of CONTENT_ACTIONS) {
    assert.match(bridge, new RegExp(`'${action}'`), `${action} missing from AdminAction union`)
  }
})

test('article rendering cannot execute stored HTML', async () => {
  const pkg = JSON.parse(await read('package.json'))
  const deps = { ...pkg.dependencies, ...pkg.devDependencies }

  // rehype-raw would re-enable raw HTML inside markdown, turning an
  // admin-authored article into a stored-XSS vector for every customer.
  assert.ok(!('rehype-raw' in deps), 'rehype-raw must never be a dependency')
  assert.ok('react-markdown' in deps, 'react-markdown should be installed')

  const body = await read('src/components/kb/article-body.tsx')
  // Ban actual wiring (import/identifier usage), not a prose mention of the
  // plugin name in a comment explaining why it's excluded.
  assert.doesNotMatch(body, /from\s+['"]rehype-raw['"]|\brehypePlugins\b/)
  assert.match(body, /allowedElements/)
  assert.match(body, /unwrapDisallowed/)
})

test('no hardcoded dashboard content constants remain', async () => {
  const home = await read('src/pages/dashboard-home.tsx')
  assert.doesNotMatch(home, /KNOWLEDGE_ARTICLES/)
  // The old widgets hardcoded six service names and a fixed maintenance date.
  assert.doesNotMatch(home, /Cloud Container Services/)
  assert.doesNotMatch(home, /Apr 1, 2026/)
  assert.match(home, /fetchPublishedArticles/)
  assert.match(home, /fetchServiceComponents/)
  assert.match(home, /fetchActiveMaintenanceWindows/)
})
