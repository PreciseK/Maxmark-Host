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
