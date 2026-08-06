# Dashboard Content Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three hardcoded dashboard-home widgets (service status, scheduled maintenance, knowledge base) with database-backed content that admins manage from `/admin/content`.

**Architecture:** Three new Supabase tables read directly by the browser under RLS (customers see published rows, admins also see drafts). Every write goes through the existing `admin-actions` Edge Function, so content changes stay inside the audited, role-gated path. Two pure functions — worst-status rollup and maintenance-state derivation — are computed at render time so summaries cannot drift from the rows beneath them.

**Tech Stack:** React 19, TypeScript 5.9 (strict), Vite 8, React Router v7, Tailwind 3, Supabase (Postgres + RLS + Edge Functions on Deno), Zod v4, `node --test` for tests.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-08-06-dashboard-content-design.md`. Read it before starting.
- **Typecheck with `npx tsc -b`, never `npx tsc --noEmit`.** The root `tsconfig.json` sets `"files": []` and only lists project references, so `--noEmit` type-checks nothing and always exits 0.
- **`verbatimModuleSyntax: true`** — import types with `import type { X } from '...'`, never a bare `import { X }`.
- **`erasableSyntaxOnly: true`** — no TypeScript `enum`, no constructor parameter properties. Use string-literal union types.
- **`noUnusedLocals` / `noUnusedParameters` are on.** An unused import fails the build.
- **Migration filename:** `supabase/migrations/20260806001000_dashboard_content.sql`. Migrations are idempotent (`if not exists`, `on conflict do nothing`).
- **Repository modules** live in `src/lib/db/`, take a `SupabaseClient` as their first parameter, map snake_case columns to camelCase, and `throw error` on failure.
- **Admin writes** go through `adminAction<T>()` in `src/lib/functions.ts`. Never write to these tables from the browser.
- **Files stay under 800 lines.** Split by responsibility if one grows past that.
- **Never add `rehype-raw`.** Article bodies are admin-authored content rendered in customer browsers; raw HTML must stay inert.
- **Commit messages:** `<type>: <description>` (feat, fix, refactor, docs, test, chore). No `Co-Authored-By` trailers.

---

### Task 1: Migration — tables, RLS, seed

**Files:**
- Create: `supabase/migrations/20260806001000_dashboard_content.sql`
- Create: `tests/dashboard-content.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: tables `service_components`, `maintenance_windows`, `kb_articles`; enum `public.service_status` with values `operational`, `degraded`, `partial_outage`, `major_outage`, `maintenance`.

- [ ] **Step 1: Write the failing test**

Create `tests/dashboard-content.test.mjs`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `ENOENT` reading `supabase/migrations/20260806001000_dashboard_content.sql`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260806001000_dashboard_content.sql`:

```sql
-- Dashboard content: service status, scheduled maintenance, knowledge base.
-- Replaces the hardcoded arrays in src/pages/dashboard-home.tsx.
--
-- Read posture mirrors user_sites: customers select published rows, admins
-- also select drafts, and no client may write. Every mutation goes through
-- the admin-actions Edge Function so it lands in admin_audit_log.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'service_status') then
    create type public.service_status as enum (
      'operational', 'degraded', 'partial_outage', 'major_outage', 'maintenance'
    );
  end if;
end
$$;

-- ─── Service components ──────────────────────────────────────────────────────

create table if not exists public.service_components (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text not null default '',
  status public.service_status not null default 'operational',
  sort_order integer not null default 0,
  published boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.service_components enable row level security;

drop policy if exists "Users can view published service components" on public.service_components;
create policy "Users can view published service components"
  on public.service_components for select using (published = true);

drop policy if exists "Admins can view all service components" on public.service_components;
create policy "Admins can view all service components"
  on public.service_components for select using (public.is_admin());

revoke insert, update, delete on table public.service_components from authenticated;

drop trigger if exists service_components_set_updated_at on public.service_components;
create trigger service_components_set_updated_at
  before update on public.service_components
  for each row execute function public.set_updated_at();

-- ─── Maintenance windows ─────────────────────────────────────────────────────

create table if not exists public.maintenance_windows (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  published boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint maintenance_windows_valid_range check (ends_at > starts_at)
);

alter table public.maintenance_windows enable row level security;

drop policy if exists "Users can view published maintenance windows" on public.maintenance_windows;
create policy "Users can view published maintenance windows"
  on public.maintenance_windows for select using (published = true);

drop policy if exists "Admins can view all maintenance windows" on public.maintenance_windows;
create policy "Admins can view all maintenance windows"
  on public.maintenance_windows for select using (public.is_admin());

revoke insert, update, delete on table public.maintenance_windows from authenticated;

drop trigger if exists maintenance_windows_set_updated_at on public.maintenance_windows;
create trigger maintenance_windows_set_updated_at
  before update on public.maintenance_windows
  for each row execute function public.set_updated_at();

create index if not exists maintenance_windows_ends_at_idx
  on public.maintenance_windows (ends_at desc);

-- ─── Knowledge base articles ─────────────────────────────────────────────────

create table if not exists public.kb_articles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  category text not null,
  body_markdown text not null,
  sort_order integer not null default 0,
  published boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.kb_articles enable row level security;

drop policy if exists "Users can view published kb articles" on public.kb_articles;
create policy "Users can view published kb articles"
  on public.kb_articles for select using (published = true);

drop policy if exists "Admins can view all kb articles" on public.kb_articles;
create policy "Admins can view all kb articles"
  on public.kb_articles for select using (public.is_admin());

revoke insert, update, delete on table public.kb_articles from authenticated;

drop trigger if exists kb_articles_set_updated_at on public.kb_articles;
create trigger kb_articles_set_updated_at
  before update on public.kb_articles
  for each row execute function public.set_updated_at();

create index if not exists kb_articles_published_sort_idx
  on public.kb_articles (published, sort_order);

-- ─── Seed ────────────────────────────────────────────────────────────────────
-- The six components the dashboard shipped hardcoded. Seeding on conflict by
-- name means re-running never duplicates a row or resets a status an operator
-- has since changed.

insert into public.service_components (name, description, sort_order) values
  ('Support Services', 'Ticketing, live chat, and the customer support portal.', 1),
  ('Platform Operations', 'Control panel, provisioning, and account management.', 2),
  ('Managed WordPress', 'Customer WordPress sites, PHP workers, and caching.', 3),
  ('Maxmark Cloud', 'Object storage, backups, and the content delivery network.', 4),
  ('Cloud Container Services', 'Elasticsearch, RabbitMQ, and Solr containers.', 5),
  ('Data Centers & Network', 'Physical infrastructure, routing, and connectivity.', 6)
on conflict (name) do nothing;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS — all four new tests green, plus the five existing `production-hardening` tests.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260806001000_dashboard_content.sql tests/dashboard-content.test.mjs
git commit -m "feat: add dashboard content tables with RLS and seeded service components"
```

---

### Task 2: Service status repository and worst-status rollup

**Files:**
- Create: `src/lib/db/service-status.ts`
- Modify: `tests/dashboard-content.test.mjs` (append)

**Interfaces:**
- Consumes: the `service_components` table from Task 1.
- Produces:
  - `type ServiceStatus = 'operational' | 'degraded' | 'partial_outage' | 'major_outage' | 'maintenance'`
  - `interface ServiceComponent { id, name, description, status, sortOrder, published, createdAt }` (all strings except `sortOrder: number`, `published: boolean`)
  - `fetchServiceComponents(supabase): Promise<ServiceComponent[]>` — published only
  - `fetchAllServiceComponents(supabase): Promise<ServiceComponent[]>` — admin, includes drafts
  - `overallStatus(components: ServiceComponent[]): ServiceStatus`
  - `SERVICE_STATUS_LABELS: Record<ServiceStatus, string>`

- [ ] **Step 1: Write the failing test**

Append to `tests/dashboard-content.test.mjs`:

```js
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

test('overallStatus treats an empty list as operational', () => {
  assert.equal(overallStatus([]), 'operational')
})

test('customer service component fetch filters to published rows', async () => {
  const source = await read('src/lib/db/service-status.ts')
  assert.match(source, /\.eq\('published', true\)/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `../src/lib/db/service-status.ts`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/db/service-status.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'

export type ServiceStatus =
  | 'operational'
  | 'degraded'
  | 'partial_outage'
  | 'major_outage'
  | 'maintenance'

export interface ServiceComponent {
  id: string
  name: string
  description: string
  status: ServiceStatus
  sortOrder: number
  published: boolean
  createdAt: string
}

export const SERVICE_STATUS_LABELS: Record<ServiceStatus, string> = {
  operational: 'Operational',
  degraded: 'Degraded Performance',
  partial_outage: 'Partial Outage',
  major_outage: 'Major Outage',
  maintenance: 'Under Maintenance',
}

/**
 * Severity order for the rollup. Maintenance ranks above operational because
 * it is a planned deviation worth surfacing, but below the unplanned states.
 */
const SEVERITY: Record<ServiceStatus, number> = {
  operational: 0,
  maintenance: 1,
  degraded: 2,
  partial_outage: 3,
  major_outage: 4,
}

/**
 * Worst status across the given components. Computed at render time so the
 * banner can never contradict the list beneath it.
 */
export function overallStatus(components: ServiceComponent[]): ServiceStatus {
  let worst: ServiceStatus = 'operational'
  for (const component of components) {
    if (SEVERITY[component.status] > SEVERITY[worst]) {
      worst = component.status
    }
  }
  return worst
}

function mapComponent(r: Record<string, unknown>): ServiceComponent {
  return {
    id: r.id as string,
    name: r.name as string,
    description: r.description as string,
    status: r.status as ServiceStatus,
    sortOrder: r.sort_order as number,
    published: r.published as boolean,
    createdAt: r.created_at as string,
  }
}

/**
 * Published components for the customer dashboard.
 *
 * The published filter is explicit rather than left to RLS: admins can select
 * every row via is_admin(), so relying on RLS alone would show an admin their
 * own drafts on their personal dashboard while every other user saw nothing.
 */
export async function fetchServiceComponents(
  supabase: SupabaseClient,
): Promise<ServiceComponent[]> {
  const { data, error } = await supabase
    .from('service_components')
    .select('*')
    .eq('published', true)
    .order('sort_order', { ascending: true })

  if (error) throw error
  return (data ?? []).map(mapComponent)
}

/** Every component including drafts. Requires the admin role under RLS. */
export async function fetchAllServiceComponents(
  supabase: SupabaseClient,
): Promise<ServiceComponent[]> {
  const { data, error } = await supabase
    .from('service_components')
    .select('*')
    .order('sort_order', { ascending: true })

  if (error) throw error
  return (data ?? []).map(mapComponent)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS — the four new tests green.

- [ ] **Step 5: Typecheck**

Run: `npx tsc -b`
Expected: no output, exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/service-status.ts tests/dashboard-content.test.mjs
git commit -m "feat: add service status repository with worst-status rollup"
```

---

### Task 3: Maintenance repository and derived window state

**Files:**
- Create: `src/lib/db/maintenance.ts`
- Modify: `tests/dashboard-content.test.mjs` (append)

**Interfaces:**
- Consumes: the `maintenance_windows` table from Task 1.
- Produces:
  - `type MaintenanceState = 'scheduled' | 'in_progress' | 'completed'`
  - `interface MaintenanceWindow { id, title, body, startsAt, endsAt, published, createdAt }` (`published: boolean`, rest strings)
  - `deriveWindowState(entry: MaintenanceWindow, now: Date): MaintenanceState`
  - `fetchActiveMaintenanceWindows(supabase): Promise<MaintenanceWindow[]>`
  - `fetchAllMaintenanceWindows(supabase): Promise<MaintenanceWindow[]>`
  - `MAINTENANCE_STATE_LABELS: Record<MaintenanceState, string>`

- [ ] **Step 1: Write the failing test**

Append to `tests/dashboard-content.test.mjs`:

```js
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
  assert.match(source, /\.eq\('published', true\)/)
  assert.match(source, /\.gt\('ends_at'/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `../src/lib/db/maintenance.ts`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/db/maintenance.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'

export type MaintenanceState = 'scheduled' | 'in_progress' | 'completed'

export interface MaintenanceWindow {
  id: string
  title: string
  body: string
  startsAt: string
  endsAt: string
  published: boolean
  createdAt: string
}

export const MAINTENANCE_STATE_LABELS: Record<MaintenanceState, string> = {
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  completed: 'Completed',
}

/** Windows stay visible for this long after they end, then age off the dashboard. */
const RETENTION_MS = 24 * 60 * 60 * 1000

/**
 * State is derived from the window's own timestamps rather than stored, so a
 * notice can never sit on the dashboard claiming a state nobody updated.
 * Both boundaries count as in progress.
 */
export function deriveWindowState(window: MaintenanceWindow, now: Date): MaintenanceState {
  const startsAt = new Date(window.startsAt).getTime()
  const endsAt = new Date(window.endsAt).getTime()
  const current = now.getTime()

  if (current < startsAt) return 'scheduled'
  if (current > endsAt) return 'completed'
  return 'in_progress'
}

function mapWindow(r: Record<string, unknown>): MaintenanceWindow {
  return {
    id: r.id as string,
    title: r.title as string,
    body: r.body as string,
    startsAt: r.starts_at as string,
    endsAt: r.ends_at as string,
    published: r.published as boolean,
    createdAt: r.created_at as string,
  }
}

/**
 * Published windows that have not yet aged out. See fetchServiceComponents for
 * why the published filter is explicit rather than left to RLS.
 */
export async function fetchActiveMaintenanceWindows(
  supabase: SupabaseClient,
): Promise<MaintenanceWindow[]> {
  const cutoff = new Date(Date.now() - RETENTION_MS).toISOString()

  const { data, error } = await supabase
    .from('maintenance_windows')
    .select('*')
    .eq('published', true)
    .gt('ends_at', cutoff)
    .order('starts_at', { ascending: true })

  if (error) throw error
  return (data ?? []).map(mapWindow)
}

/** Every window including drafts and past ones. Requires the admin role. */
export async function fetchAllMaintenanceWindows(
  supabase: SupabaseClient,
): Promise<MaintenanceWindow[]> {
  const { data, error } = await supabase
    .from('maintenance_windows')
    .select('*')
    .order('starts_at', { ascending: false })

  if (error) throw error
  return (data ?? []).map(mapWindow)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npx tsc -b`
Expected: no output, exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/maintenance.ts tests/dashboard-content.test.mjs
git commit -m "feat: add maintenance repository with timestamp-derived window state"
```

---

### Task 4: Knowledge base repository

**Files:**
- Create: `src/lib/db/kb.ts`
- Modify: `tests/dashboard-content.test.mjs` (append)

**Interfaces:**
- Consumes: the `kb_articles` table from Task 1.
- Produces:
  - `interface KbArticle { id, slug, title, category, bodyMarkdown, sortOrder, published, createdAt, updatedAt }` (`sortOrder: number`, `published: boolean`, rest strings)
  - `fetchPublishedArticles(supabase): Promise<KbArticle[]>`
  - `fetchArticleBySlug(supabase, slug): Promise<KbArticle | null>`
  - `fetchAllArticles(supabase): Promise<KbArticle[]>`

- [ ] **Step 1: Write the failing test**

Append to `tests/dashboard-content.test.mjs`:

```js
test('customer article fetches filter to published rows', async () => {
  const source = await read('src/lib/db/kb.ts')
  const published = source.match(/\.eq\('published', true\)/g) ?? []
  // Both the list fetch and the single-article fetch must filter, otherwise a
  // draft becomes readable by guessing its slug.
  assert.ok(published.length >= 2, `expected 2+ published filters, found ${published.length}`)
  assert.match(source, /fetchArticleBySlug/)
  assert.match(source, /maybeSingle\(\)/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `ENOENT` reading `src/lib/db/kb.ts`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/db/kb.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'

export interface KbArticle {
  id: string
  slug: string
  title: string
  category: string
  bodyMarkdown: string
  sortOrder: number
  published: boolean
  createdAt: string
  updatedAt: string
}

function mapArticle(r: Record<string, unknown>): KbArticle {
  return {
    id: r.id as string,
    slug: r.slug as string,
    title: r.title as string,
    category: r.category as string,
    bodyMarkdown: r.body_markdown as string,
    sortOrder: r.sort_order as number,
    published: r.published as boolean,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  }
}

/**
 * Published articles for the dashboard widget, the /kb browse page, and the
 * dashboard search box. See fetchServiceComponents for why the published
 * filter is explicit rather than left to RLS.
 */
export async function fetchPublishedArticles(supabase: SupabaseClient): Promise<KbArticle[]> {
  const { data, error } = await supabase
    .from('kb_articles')
    .select('*')
    .eq('published', true)
    .order('sort_order', { ascending: true })

  if (error) throw error
  return (data ?? []).map(mapArticle)
}

/**
 * One published article by slug. The published filter matters here too: an
 * admin's draft would otherwise be readable by anyone who guessed its slug.
 */
export async function fetchArticleBySlug(
  supabase: SupabaseClient,
  slug: string,
): Promise<KbArticle | null> {
  const { data, error } = await supabase
    .from('kb_articles')
    .select('*')
    .eq('slug', slug)
    .eq('published', true)
    .maybeSingle()

  if (error) throw error
  return data ? mapArticle(data as Record<string, unknown>) : null
}

/** Every article including drafts. Requires the admin role. */
export async function fetchAllArticles(supabase: SupabaseClient): Promise<KbArticle[]> {
  const { data, error } = await supabase
    .from('kb_articles')
    .select('*')
    .order('sort_order', { ascending: true })

  if (error) throw error
  return (data ?? []).map(mapArticle)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npx tsc -b`
Expected: no output, exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/kb.ts tests/dashboard-content.test.mjs
git commit -m "feat: add knowledge base repository"
```

---

### Task 5: Admin write actions

**Files:**
- Modify: `supabase/functions/admin-actions/index.ts`
- Modify: `src/lib/functions.ts`
- Modify: `tests/dashboard-content.test.mjs` (append)

**Interfaces:**
- Consumes: the three tables from Task 1.
- Produces six `AdminAction` variants callable via `adminAction<T>(supabase, body)`:
  - `{ action: 'upsert_service_component', id?, name, description, status, sortOrder, published }`
  - `{ action: 'delete_service_component', id }`
  - `{ action: 'upsert_maintenance_window', id?, title, body, startsAt, endsAt, published }`
  - `{ action: 'delete_maintenance_window', id }`
  - `{ action: 'upsert_kb_article', id?, slug, title, category, bodyMarkdown, sortOrder, published }`
  - `{ action: 'delete_kb_article', id }`

- [ ] **Step 1: Write the failing test**

Append to `tests/dashboard-content.test.mjs`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `upsert_service_component missing from schema`.

- [ ] **Step 3: Add the Zod schemas**

In `supabase/functions/admin-actions/index.ts`, add these six objects to the `bodySchema` discriminated union, immediately before its closing `])`:

```ts
  z.object({
    action: z.literal('upsert_service_component'),
    id: z.string().uuid().optional(),
    name: z.string().min(1).max(80),
    description: z.string().max(500).default(''),
    status: z.enum([
      'operational',
      'degraded',
      'partial_outage',
      'major_outage',
      'maintenance',
    ]),
    sortOrder: z.number().int().min(0).max(999).default(0),
    published: z.boolean().default(true),
  }),
  z.object({
    action: z.literal('delete_service_component'),
    id: z.string().uuid(),
  }),
  z.object({
    action: z.literal('upsert_maintenance_window'),
    id: z.string().uuid().optional(),
    title: z.string().min(1).max(160),
    body: z.string().min(1).max(2_000),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    published: z.boolean().default(false),
  }),
  z.object({
    action: z.literal('delete_maintenance_window'),
    id: z.string().uuid(),
  }),
  z.object({
    action: z.literal('upsert_kb_article'),
    id: z.string().uuid().optional(),
    // Reaches /kb/:slug as a route param, so restrict it to a safe shape.
    slug: z
      .string()
      .min(1)
      .max(80)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    title: z.string().min(1).max(160),
    category: z.string().min(1).max(80),
    // Capped so a runaway paste cannot bloat every dashboard fetch.
    bodyMarkdown: z.string().min(1).max(50_000),
    sortOrder: z.number().int().min(0).max(999).default(0),
    published: z.boolean().default(false),
  }),
  z.object({
    action: z.literal('delete_kb_article'),
    id: z.string().uuid(),
  }),
```

- [ ] **Step 4: Add the handlers**

In the same file, add these functions immediately before the `const auditableActions = new Set(...)` declaration:

```ts
async function upsertServiceComponent(
  admin: SupabaseClient,
  body: Extract<ActionBody, { action: 'upsert_service_component' }>,
): Promise<ActionOutcome> {
  const row = {
    name: body.name,
    description: body.description,
    status: body.status,
    sort_order: body.sortOrder,
    published: body.published,
  }

  const query = body.id
    ? admin.from('service_components').update(row).eq('id', body.id)
    : admin.from('service_components').insert(row)

  const { data, error } = await query.select().single()
  if (error) {
    const status = error.message.includes('duplicate') ? 409 : 500
    throw new ActionError(`Unable to save service component: ${error.message}`, status)
  }

  return ok(data, 'service_component', (data as { id: string }).id)
}

async function deleteServiceComponent(
  admin: SupabaseClient,
  body: Extract<ActionBody, { action: 'delete_service_component' }>,
): Promise<ActionOutcome> {
  const { error } = await admin.from('service_components').delete().eq('id', body.id)
  if (error) throw new ActionError(`Unable to delete service component: ${error.message}`, 500)
  return ok({ id: body.id }, 'service_component', body.id)
}

async function upsertMaintenanceWindow(
  admin: SupabaseClient,
  body: Extract<ActionBody, { action: 'upsert_maintenance_window' }>,
): Promise<ActionOutcome> {
  if (new Date(body.endsAt) <= new Date(body.startsAt)) {
    throw new ActionError('The maintenance window must end after it starts', 400)
  }

  const row = {
    title: body.title,
    body: body.body,
    starts_at: body.startsAt,
    ends_at: body.endsAt,
    published: body.published,
  }

  const query = body.id
    ? admin.from('maintenance_windows').update(row).eq('id', body.id)
    : admin.from('maintenance_windows').insert(row)

  const { data, error } = await query.select().single()
  if (error) throw new ActionError(`Unable to save maintenance window: ${error.message}`, 500)

  return ok(data, 'maintenance_window', (data as { id: string }).id)
}

async function deleteMaintenanceWindow(
  admin: SupabaseClient,
  body: Extract<ActionBody, { action: 'delete_maintenance_window' }>,
): Promise<ActionOutcome> {
  const { error } = await admin.from('maintenance_windows').delete().eq('id', body.id)
  if (error) throw new ActionError(`Unable to delete maintenance window: ${error.message}`, 500)
  return ok({ id: body.id }, 'maintenance_window', body.id)
}

async function upsertKbArticle(
  admin: SupabaseClient,
  body: Extract<ActionBody, { action: 'upsert_kb_article' }>,
): Promise<ActionOutcome> {
  const row = {
    slug: body.slug,
    title: body.title,
    category: body.category,
    body_markdown: body.bodyMarkdown,
    sort_order: body.sortOrder,
    published: body.published,
  }

  const query = body.id
    ? admin.from('kb_articles').update(row).eq('id', body.id)
    : admin.from('kb_articles').insert(row)

  const { data, error } = await query.select().single()
  if (error) {
    const status = error.message.includes('duplicate') ? 409 : 500
    throw new ActionError(`Unable to save article: ${error.message}`, status)
  }

  return ok(data, 'kb_article', (data as { id: string }).id)
}

async function deleteKbArticle(
  admin: SupabaseClient,
  body: Extract<ActionBody, { action: 'delete_kb_article' }>,
): Promise<ActionOutcome> {
  const { error } = await admin.from('kb_articles').delete().eq('id', body.id)
  if (error) throw new ActionError(`Unable to delete article: ${error.message}`, 500)
  return ok({ id: body.id }, 'kb_article', body.id)
}
```

- [ ] **Step 5: Wire dispatch and audit**

Add these cases to the `switch (body.action)` block, after `case 'get_plugin_upload_url':`:

```ts
      case 'upsert_service_component':
        outcome = await upsertServiceComponent(admin, body)
        break
      case 'delete_service_component':
        outcome = await deleteServiceComponent(admin, body)
        break
      case 'upsert_maintenance_window':
        outcome = await upsertMaintenanceWindow(admin, body)
        break
      case 'delete_maintenance_window':
        outcome = await deleteMaintenanceWindow(admin, body)
        break
      case 'upsert_kb_article':
        outcome = await upsertKbArticle(admin, body)
        break
      case 'delete_kb_article':
        outcome = await deleteKbArticle(admin, body)
        break
```

Add all six literals to the `auditableActions` set:

```ts
  'upsert_service_component',
  'delete_service_component',
  'upsert_maintenance_window',
  'delete_maintenance_window',
  'upsert_kb_article',
  'delete_kb_article',
```

- [ ] **Step 6: Extend the client bridge**

In `src/lib/functions.ts`, add these variants to the `AdminAction` union, immediately before its closing:

```ts
  | {
      action: 'upsert_service_component'
      id?: string
      name: string
      description: string
      status: 'operational' | 'degraded' | 'partial_outage' | 'major_outage' | 'maintenance'
      sortOrder: number
      published: boolean
    }
  | { action: 'delete_service_component'; id: string }
  | {
      action: 'upsert_maintenance_window'
      id?: string
      title: string
      body: string
      startsAt: string
      endsAt: string
      published: boolean
    }
  | { action: 'delete_maintenance_window'; id: string }
  | {
      action: 'upsert_kb_article'
      id?: string
      slug: string
      title: string
      category: string
      bodyMarkdown: string
      sortOrder: number
      published: boolean
    }
  | { action: 'delete_kb_article'; id: string }
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 8: Typecheck**

Run: `npx tsc -b`
Expected: no output, exit 0.

- [ ] **Step 9: Commit**

```bash
git add supabase/functions/admin-actions/index.ts src/lib/functions.ts tests/dashboard-content.test.mjs
git commit -m "feat: add audited admin actions for dashboard content"
```

---

### Task 6: Admin page shell, route, and nav

**Files:**
- Create: `src/pages/admin/admin-dashboard-content.tsx`
- Modify: `src/pages/admin/admin-area.tsx`
- Modify: `src/layouts/admin-shell.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks yet — tabs render placeholders replaced in Tasks 7-9.
- Produces: `AdminDashboardContent` component at route `/admin/content`, with tab state from `?tab=` (`status` | `maintenance` | `kb`, defaulting to `status`).

- [ ] **Step 1: Create the shell**

Create `src/pages/admin/admin-dashboard-content.tsx`:

```tsx
import { useSearchParams } from 'react-router-dom'

import { AdminPageHeader } from '@/components/admin/admin-ui'

type ContentTab = 'status' | 'maintenance' | 'kb'

const TABS: { id: ContentTab; label: string }[] = [
  { id: 'status', label: 'Service Status' },
  { id: 'maintenance', label: 'Maintenance' },
  { id: 'kb', label: 'Knowledge Base' },
]

function isContentTab(value: string | null): value is ContentTab {
  return value === 'status' || value === 'maintenance' || value === 'kb'
}

/**
 * Everything that renders on the customer dashboard home screen. Three tabs
 * rather than three nav entries, because these are one concept.
 */
export function AdminDashboardContent() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const activeTab: ContentTab = isContentTab(tabParam) ? tabParam : 'status'

  function selectTab(tab: ContentTab) {
    const next = new URLSearchParams(searchParams)
    next.set('tab', tab)
    setSearchParams(next, { replace: true })
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        description="Manage what customers see on their dashboard home screen."
        title="Dashboard Content"
      />

      <div className="flex gap-1 border-b border-[#232328]">
        {TABS.map((tab) => (
          <button
            className={`px-4 py-2.5 text-xs font-semibold transition border-b-2 -mb-px ${
              activeTab === tab.id
                ? 'border-[#5c4df0] text-white'
                : 'border-transparent text-muted-foreground hover:text-white'
            }`}
            key={tab.id}
            onClick={() => selectTab(tab.id)}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'status' ? <p className="text-xs text-muted-foreground">Service status</p> : null}
      {activeTab === 'maintenance' ? <p className="text-xs text-muted-foreground">Maintenance</p> : null}
      {activeTab === 'kb' ? <p className="text-xs text-muted-foreground">Knowledge base</p> : null}
    </div>
  )
}
```

- [ ] **Step 2: Register the route**

In `src/pages/admin/admin-area.tsx`, add the import alongside the others:

```tsx
import { AdminDashboardContent } from '@/pages/admin/admin-dashboard-content'
```

and the route immediately before the catch-all `<Route element={<Navigate replace to="/admin" />} path="*" />`:

```tsx
          <Route element={<AdminDashboardContent />} path="content" />
```

- [ ] **Step 3: Add the nav entry**

In `src/layouts/admin-shell.tsx`, add `LayoutDashboard` to the existing `lucide-react` import, then add this entry to the nav array immediately after the `Catalog` entry:

```tsx
  { label: 'Dashboard Content', href: '/admin/content', icon: LayoutDashboard },
```

- [ ] **Step 4: Verify it builds and renders**

Run: `npx tsc -b && npm run build`
Expected: no type errors, build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/pages/admin/admin-dashboard-content.tsx src/pages/admin/admin-area.tsx src/layouts/admin-shell.tsx
git commit -m "feat: add admin dashboard content page shell"
```

---

### Task 7: Service components admin tab

**Files:**
- Create: `src/components/admin/dashboard-content/service-components-tab.tsx`
- Modify: `src/pages/admin/admin-dashboard-content.tsx`

**Interfaces:**
- Consumes: `fetchAllServiceComponents`, `ServiceComponent`, `ServiceStatus`, `SERVICE_STATUS_LABELS` (Task 2); `adminAction` (Task 5).
- Produces: `ServiceComponentsTab` component, no props.

- [ ] **Step 1: Create the tab**

Create `src/components/admin/dashboard-content/service-components-tab.tsx`:

```tsx
import { useEffect, useState } from 'react'

import {
  EmptyRow,
  TableCard,
  adminDialogClass,
  cellClass,
  fieldInputClass,
  fieldLabelClass,
  primaryButtonClass,
  rowClass,
  secondaryButtonClass,
  tbodyClass,
  thClass,
  theadRowClass,
  tableClass,
} from '@/components/admin/admin-ui'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  SERVICE_STATUS_LABELS,
  fetchAllServiceComponents,
  type ServiceComponent,
  type ServiceStatus,
} from '@/lib/db/service-status'
import { adminAction } from '@/lib/functions'
import { supabase } from '@/lib/supabase'

const STATUSES: ServiceStatus[] = [
  'operational',
  'degraded',
  'partial_outage',
  'major_outage',
  'maintenance',
]

interface FormState {
  id: string | null
  name: string
  description: string
  status: ServiceStatus
  sortOrder: string
  published: boolean
}

const emptyForm: FormState = {
  id: null,
  name: '',
  description: '',
  status: 'operational',
  sortOrder: '0',
  published: true,
}

export function ServiceComponentsTab() {
  const [components, setComponents] = useState<ServiceComponent[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    if (!supabase) return
    try {
      setComponents(await fetchAllServiceComponents(supabase))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Components could not be loaded.')
    }
  }

  useEffect(() => {
    void load()
  }, [])

  function openCreate() {
    setForm(emptyForm)
    setDialogOpen(true)
  }

  function openEdit(component: ServiceComponent) {
    setForm({
      id: component.id,
      name: component.name,
      description: component.description,
      status: component.status,
      sortOrder: String(component.sortOrder),
      published: component.published,
    })
    setDialogOpen(true)
  }

  async function handleSubmit() {
    if (!supabase) return
    const sortOrder = Number(form.sortOrder)
    if (!form.name.trim()) {
      setError('Name is required.')
      return
    }
    if (!Number.isInteger(sortOrder) || sortOrder < 0) {
      setError('Sort order must be a whole number of 0 or more.')
      return
    }

    setBusy(true)
    setError(null)
    try {
      await adminAction(supabase, {
        action: 'upsert_service_component',
        ...(form.id ? { id: form.id } : {}),
        name: form.name.trim(),
        description: form.description.trim(),
        status: form.status,
        sortOrder,
        published: form.published,
      })
      setDialogOpen(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The component could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(component: ServiceComponent) {
    if (!supabase) return
    if (!window.confirm(`Delete "${component.name}"? This cannot be undone.`)) return

    setBusy(true)
    try {
      await adminAction(supabase, { action: 'delete_service_component', id: component.id })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The component could not be deleted.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      {error ? (
        <p className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300" role="alert">
          {error}
        </p>
      ) : null}

      <TableCard
        actions={
          <button className={primaryButtonClass} onClick={openCreate} type="button">
            Add Component
          </button>
        }
        title="Service Components"
      >
        <table className={tableClass}>
          <thead>
            <tr className={theadRowClass}>
              <th className={thClass}>Name</th>
              <th className={thClass}>Status</th>
              <th className={thClass}>Order</th>
              <th className={thClass}>Published</th>
              <th className={thClass}></th>
            </tr>
          </thead>
          <tbody className={tbodyClass}>
            {components.length === 0 ? (
              <EmptyRow colSpan={5} message="No service components yet." />
            ) : (
              components.map((component) => (
                <tr className={rowClass} key={component.id}>
                  <td className={cellClass}>
                    <div className="font-medium text-white">{component.name}</div>
                    <div className="text-[10px] text-muted-foreground">{component.description}</div>
                  </td>
                  <td className={cellClass}>{SERVICE_STATUS_LABELS[component.status]}</td>
                  <td className={cellClass}>{component.sortOrder}</td>
                  <td className={cellClass}>{component.published ? 'Yes' : 'No'}</td>
                  <td className={cellClass}>
                    <div className="flex gap-2">
                      <button className={secondaryButtonClass} onClick={() => openEdit(component)} type="button">
                        Edit
                      </button>
                      <button
                        className={secondaryButtonClass}
                        disabled={busy}
                        onClick={() => void handleDelete(component)}
                        type="button"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </TableCard>

      <Dialog onOpenChange={setDialogOpen} open={dialogOpen}>
        <DialogContent className={adminDialogClass}>
          <DialogHeader>
            <DialogTitle className="text-white text-lg font-bold">
              {form.id ? 'Edit component' : 'Add service component'}
            </DialogTitle>
            <DialogDescription>
              Components appear on the customer dashboard in sort order. Status drives both the
              row indicator and the overall banner.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
              <div>
                <label className={fieldLabelClass} htmlFor="component-name">Name</label>
                <input
                  className={fieldInputClass}
                  id="component-name"
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  value={form.name}
                />
              </div>
              <div>
                <label className={fieldLabelClass} htmlFor="component-description">Description</label>
                <textarea
                  className={fieldInputClass}
                  id="component-description"
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={3}
                  value={form.description}
                />
              </div>
              <div>
                <label className={fieldLabelClass} htmlFor="component-status">Status</label>
                <select
                  className={fieldInputClass}
                  id="component-status"
                  onChange={(e) => setForm({ ...form, status: e.target.value as ServiceStatus })}
                  value={form.status}
                >
                  {STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {SERVICE_STATUS_LABELS[status]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={fieldLabelClass} htmlFor="component-order">Sort Order</label>
                <input
                  className={fieldInputClass}
                  id="component-order"
                  onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
                  value={form.sortOrder}
                />
              </div>
              <label className="flex items-center gap-2 text-xs text-white">
                <input
                  checked={form.published}
                  onChange={(e) => setForm({ ...form, published: e.target.checked })}
                  type="checkbox"
                />
                Published
              </label>
          </div>

          <DialogFooter>
            <button className={secondaryButtonClass} onClick={() => setDialogOpen(false)} type="button">
              Cancel
            </button>
            <button className={primaryButtonClass} disabled={busy} onClick={() => void handleSubmit()} type="button">
              {busy ? 'Saving…' : 'Save'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
```

- [ ] **Step 2: Mount it in the shell**

In `src/pages/admin/admin-dashboard-content.tsx`, add the import:

```tsx
import { ServiceComponentsTab } from '@/components/admin/dashboard-content/service-components-tab'
```

and replace the status placeholder line with:

```tsx
      {activeTab === 'status' ? <ServiceComponentsTab /> : null}
```

- [ ] **Step 3: Verify**

Run: `npx tsc -b && npm run build`
Expected: no type errors, build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/dashboard-content/service-components-tab.tsx src/pages/admin/admin-dashboard-content.tsx
git commit -m "feat: add service components admin tab"
```

---

### Task 8: Maintenance admin tab

**Files:**
- Create: `src/components/admin/dashboard-content/maintenance-tab.tsx`
- Modify: `src/pages/admin/admin-dashboard-content.tsx`

**Interfaces:**
- Consumes: `fetchAllMaintenanceWindows`, `deriveWindowState`, `MAINTENANCE_STATE_LABELS`, `MaintenanceWindow` (Task 3); `adminAction` (Task 5).
- Produces: `MaintenanceTab` component, no props.

- [ ] **Step 1: Create the tab**

Create `src/components/admin/dashboard-content/maintenance-tab.tsx`:

```tsx
import { useEffect, useState } from 'react'

import {
  EmptyRow,
  TableCard,
  adminDialogClass,
  cellClass,
  fieldInputClass,
  fieldLabelClass,
  primaryButtonClass,
  rowClass,
  secondaryButtonClass,
  tbodyClass,
  thClass,
  theadRowClass,
  tableClass,
} from '@/components/admin/admin-ui'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  MAINTENANCE_STATE_LABELS,
  deriveWindowState,
  fetchAllMaintenanceWindows,
  type MaintenanceWindow,
} from '@/lib/db/maintenance'
import { adminAction } from '@/lib/functions'
import { supabase } from '@/lib/supabase'

interface FormState {
  id: string | null
  title: string
  body: string
  startsAt: string
  endsAt: string
  published: boolean
}

const emptyForm: FormState = {
  id: null,
  title: '',
  body: '',
  startsAt: '',
  endsAt: '',
  published: false,
}

/** datetime-local yields "YYYY-MM-DDTHH:mm"; the action expects ISO-8601. */
function toIso(localValue: string): string {
  return new Date(localValue).toISOString()
}

/** Inverse of toIso, for populating the edit form. */
function toLocalInput(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function MaintenanceTab() {
  const [windows, setWindows] = useState<MaintenanceWindow[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const now = new Date()

  async function load() {
    if (!supabase) return
    try {
      setWindows(await fetchAllMaintenanceWindows(supabase))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Maintenance windows could not be loaded.')
    }
  }

  useEffect(() => {
    void load()
  }, [])

  function openCreate() {
    setForm(emptyForm)
    setDialogOpen(true)
  }

  function openEdit(item: MaintenanceWindow) {
    setForm({
      id: item.id,
      title: item.title,
      body: item.body,
      startsAt: toLocalInput(item.startsAt),
      endsAt: toLocalInput(item.endsAt),
      published: item.published,
    })
    setDialogOpen(true)
  }

  async function handleSubmit() {
    if (!supabase) return
    if (!form.title.trim() || !form.body.trim()) {
      setError('Title and body are required.')
      return
    }
    if (!form.startsAt || !form.endsAt) {
      setError('Start and end times are required.')
      return
    }
    if (new Date(form.endsAt) <= new Date(form.startsAt)) {
      setError('The window must end after it starts.')
      return
    }

    setBusy(true)
    setError(null)
    try {
      await adminAction(supabase, {
        action: 'upsert_maintenance_window',
        ...(form.id ? { id: form.id } : {}),
        title: form.title.trim(),
        body: form.body.trim(),
        startsAt: toIso(form.startsAt),
        endsAt: toIso(form.endsAt),
        published: form.published,
      })
      setDialogOpen(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The window could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(item: MaintenanceWindow) {
    if (!supabase) return
    if (!window.confirm(`Delete "${item.title}"? This cannot be undone.`)) return

    setBusy(true)
    try {
      await adminAction(supabase, { action: 'delete_maintenance_window', id: item.id })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The window could not be deleted.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      {error ? (
        <p className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300" role="alert">
          {error}
        </p>
      ) : null}

      <TableCard
        actions={
          <button className={primaryButtonClass} onClick={openCreate} type="button">
            Add Window
          </button>
        }
        title="Maintenance Windows"
      >
        <table className={tableClass}>
          <thead>
            <tr className={theadRowClass}>
              <th className={thClass}>Title</th>
              <th className={thClass}>Window</th>
              <th className={thClass}>State</th>
              <th className={thClass}>Published</th>
              <th className={thClass}></th>
            </tr>
          </thead>
          <tbody className={tbodyClass}>
            {windows.length === 0 ? (
              <EmptyRow colSpan={5} message="No maintenance windows yet." />
            ) : (
              windows.map((item) => (
                <tr className={rowClass} key={item.id}>
                  <td className={cellClass}>
                    <div className="font-medium text-white">{item.title}</div>
                    <div className="text-[10px] text-muted-foreground">{item.body}</div>
                  </td>
                  <td className={cellClass}>
                    {new Date(item.startsAt).toLocaleString()} — {new Date(item.endsAt).toLocaleString()}
                  </td>
                  <td className={cellClass}>
                    {MAINTENANCE_STATE_LABELS[deriveWindowState(item, now)]}
                  </td>
                  <td className={cellClass}>{item.published ? 'Yes' : 'No'}</td>
                  <td className={cellClass}>
                    <div className="flex gap-2">
                      <button className={secondaryButtonClass} onClick={() => openEdit(item)} type="button">
                        Edit
                      </button>
                      <button
                        className={secondaryButtonClass}
                        disabled={busy}
                        onClick={() => void handleDelete(item)}
                        type="button"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </TableCard>

      <Dialog onOpenChange={setDialogOpen} open={dialogOpen}>
        <DialogContent className={adminDialogClass}>
          <DialogHeader>
            <DialogTitle className="text-white text-lg font-bold">
              {form.id ? 'Edit window' : 'Add maintenance window'}
            </DialogTitle>
            <DialogDescription>
              Scheduled, in progress, and completed are derived from these times. Published
              windows disappear from the dashboard 24 hours after they end.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
              <div>
                <label className={fieldLabelClass} htmlFor="window-title">Title</label>
                <input
                  className={fieldInputClass}
                  id="window-title"
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  value={form.title}
                />
              </div>
              <div>
                <label className={fieldLabelClass} htmlFor="window-body">Body</label>
                <textarea
                  className={fieldInputClass}
                  id="window-body"
                  onChange={(e) => setForm({ ...form, body: e.target.value })}
                  rows={3}
                  value={form.body}
                />
              </div>
              <div>
                <label className={fieldLabelClass} htmlFor="window-starts">Starts</label>
                <input
                  className={fieldInputClass}
                  id="window-starts"
                  onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
                  type="datetime-local"
                  value={form.startsAt}
                />
              </div>
              <div>
                <label className={fieldLabelClass} htmlFor="window-ends">Ends</label>
                <input
                  className={fieldInputClass}
                  id="window-ends"
                  onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
                  type="datetime-local"
                  value={form.endsAt}
                />
              </div>
              <label className="flex items-center gap-2 text-xs text-white">
                <input
                  checked={form.published}
                  onChange={(e) => setForm({ ...form, published: e.target.checked })}
                  type="checkbox"
                />
                Published
              </label>
          </div>

          <DialogFooter>
            <button className={secondaryButtonClass} onClick={() => setDialogOpen(false)} type="button">
              Cancel
            </button>
            <button className={primaryButtonClass} disabled={busy} onClick={() => void handleSubmit()} type="button">
              {busy ? 'Saving…' : 'Save'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
```

- [ ] **Step 2: Mount it in the shell**

In `src/pages/admin/admin-dashboard-content.tsx`, add the import:

```tsx
import { MaintenanceTab } from '@/components/admin/dashboard-content/maintenance-tab'
```

and replace the maintenance placeholder line with:

```tsx
      {activeTab === 'maintenance' ? <MaintenanceTab /> : null}
```

- [ ] **Step 3: Verify**

Run: `npx tsc -b && npm run build`
Expected: no type errors, build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/dashboard-content/maintenance-tab.tsx src/pages/admin/admin-dashboard-content.tsx
git commit -m "feat: add maintenance windows admin tab"
```

---

### Task 9: Knowledge base admin tab

**Files:**
- Create: `src/components/admin/dashboard-content/kb-articles-tab.tsx`
- Modify: `src/pages/admin/admin-dashboard-content.tsx`

**Interfaces:**
- Consumes: `fetchAllArticles`, `KbArticle` (Task 4); `adminAction` (Task 5).
- Produces: `KbArticlesTab` component, no props.

- [ ] **Step 1: Create the tab**

Create `src/components/admin/dashboard-content/kb-articles-tab.tsx`:

```tsx
import { useEffect, useState } from 'react'

import {
  EmptyRow,
  TableCard,
  adminDialogClass,
  cellClass,
  fieldInputClass,
  fieldLabelClass,
  primaryButtonClass,
  rowClass,
  secondaryButtonClass,
  tbodyClass,
  thClass,
  theadRowClass,
  tableClass,
} from '@/components/admin/admin-ui'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { fetchAllArticles, type KbArticle } from '@/lib/db/kb'
import { adminAction } from '@/lib/functions'
import { supabase } from '@/lib/supabase'

/** Mirrors the slug regex enforced in admin-actions. */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const BODY_MAX = 50_000

interface FormState {
  id: string | null
  slug: string
  title: string
  category: string
  bodyMarkdown: string
  sortOrder: string
  published: boolean
}

const emptyForm: FormState = {
  id: null,
  slug: '',
  title: '',
  category: '',
  bodyMarkdown: '',
  sortOrder: '0',
  published: false,
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

export function KbArticlesTab() {
  const [articles, setArticles] = useState<KbArticle[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    if (!supabase) return
    try {
      setArticles(await fetchAllArticles(supabase))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Articles could not be loaded.')
    }
  }

  useEffect(() => {
    void load()
  }, [])

  function openCreate() {
    setForm(emptyForm)
    setDialogOpen(true)
  }

  function openEdit(article: KbArticle) {
    setForm({
      id: article.id,
      slug: article.slug,
      title: article.title,
      category: article.category,
      bodyMarkdown: article.bodyMarkdown,
      sortOrder: String(article.sortOrder),
      published: article.published,
    })
    setDialogOpen(true)
  }

  async function handleSubmit() {
    if (!supabase) return
    const sortOrder = Number(form.sortOrder)
    const slug = form.slug.trim() || slugify(form.title)

    if (!form.title.trim() || !form.category.trim() || !form.bodyMarkdown.trim()) {
      setError('Title, category, and body are required.')
      return
    }
    if (!SLUG_PATTERN.test(slug)) {
      setError('Slug must be lowercase letters, numbers, and single hyphens.')
      return
    }
    if (form.bodyMarkdown.length > BODY_MAX) {
      setError(`Body must be ${BODY_MAX.toLocaleString()} characters or fewer.`)
      return
    }
    if (!Number.isInteger(sortOrder) || sortOrder < 0) {
      setError('Sort order must be a whole number of 0 or more.')
      return
    }

    setBusy(true)
    setError(null)
    try {
      await adminAction(supabase, {
        action: 'upsert_kb_article',
        ...(form.id ? { id: form.id } : {}),
        slug,
        title: form.title.trim(),
        category: form.category.trim(),
        bodyMarkdown: form.bodyMarkdown,
        sortOrder,
        published: form.published,
      })
      setDialogOpen(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The article could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(article: KbArticle) {
    if (!supabase) return
    if (!window.confirm(`Delete "${article.title}"? This cannot be undone.`)) return

    setBusy(true)
    try {
      await adminAction(supabase, { action: 'delete_kb_article', id: article.id })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The article could not be deleted.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      {error ? (
        <p className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300" role="alert">
          {error}
        </p>
      ) : null}

      <TableCard
        actions={
          <button className={primaryButtonClass} onClick={openCreate} type="button">
            Add Article
          </button>
        }
        title="Knowledge Base Articles"
      >
        <table className={tableClass}>
          <thead>
            <tr className={theadRowClass}>
              <th className={thClass}>Title</th>
              <th className={thClass}>Category</th>
              <th className={thClass}>Slug</th>
              <th className={thClass}>Order</th>
              <th className={thClass}>Published</th>
              <th className={thClass}></th>
            </tr>
          </thead>
          <tbody className={tbodyClass}>
            {articles.length === 0 ? (
              <EmptyRow colSpan={6} message="No articles yet." />
            ) : (
              articles.map((article) => (
                <tr className={rowClass} key={article.id}>
                  <td className={cellClass}>{article.title}</td>
                  <td className={cellClass}>{article.category}</td>
                  <td className={`${cellClass} font-mono text-[10px]`}>{article.slug}</td>
                  <td className={cellClass}>{article.sortOrder}</td>
                  <td className={cellClass}>{article.published ? 'Yes' : 'No'}</td>
                  <td className={cellClass}>
                    <div className="flex gap-2">
                      <button className={secondaryButtonClass} onClick={() => openEdit(article)} type="button">
                        Edit
                      </button>
                      <button
                        className={secondaryButtonClass}
                        disabled={busy}
                        onClick={() => void handleDelete(article)}
                        type="button"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </TableCard>

      <Dialog onOpenChange={setDialogOpen} open={dialogOpen}>
        {/* Wider than the shared admin dialog: the body editor needs the room. */}
        <DialogContent className={`${adminDialogClass} w-[min(94vw,720px)]`}>
          <DialogHeader>
            <DialogTitle className="text-white text-lg font-bold">
              {form.id ? 'Edit article' : 'Add article'}
            </DialogTitle>
            <DialogDescription>
              Bodies are Markdown. Raw HTML is rendered as plain text and never executed.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
              <div>
                <label className={fieldLabelClass} htmlFor="article-title">Title</label>
                <input
                  className={fieldInputClass}
                  id="article-title"
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  value={form.title}
                />
              </div>
              <div>
                <label className={fieldLabelClass} htmlFor="article-slug">
                  Slug (leave blank to derive from the title)
                </label>
                <input
                  className={fieldInputClass}
                  id="article-slug"
                  onChange={(e) => setForm({ ...form, slug: e.target.value })}
                  placeholder={slugify(form.title)}
                  value={form.slug}
                />
              </div>
              <div>
                <label className={fieldLabelClass} htmlFor="article-category">Category</label>
                <input
                  className={fieldInputClass}
                  id="article-category"
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  value={form.category}
                />
              </div>
              <div>
                <label className={fieldLabelClass} htmlFor="article-body">
                  Body (Markdown — {form.bodyMarkdown.length.toLocaleString()} / {BODY_MAX.toLocaleString()})
                </label>
                <textarea
                  className={`${fieldInputClass} font-mono`}
                  id="article-body"
                  onChange={(e) => setForm({ ...form, bodyMarkdown: e.target.value })}
                  rows={14}
                  value={form.bodyMarkdown}
                />
              </div>
              <div>
                <label className={fieldLabelClass} htmlFor="article-order">Sort Order</label>
                <input
                  className={fieldInputClass}
                  id="article-order"
                  onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
                  value={form.sortOrder}
                />
              </div>
              <label className="flex items-center gap-2 text-xs text-white">
                <input
                  checked={form.published}
                  onChange={(e) => setForm({ ...form, published: e.target.checked })}
                  type="checkbox"
                />
                Published
              </label>
          </div>

          <DialogFooter>
            <button className={secondaryButtonClass} onClick={() => setDialogOpen(false)} type="button">
              Cancel
            </button>
            <button className={primaryButtonClass} disabled={busy} onClick={() => void handleSubmit()} type="button">
              {busy ? 'Saving…' : 'Save'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
```

- [ ] **Step 2: Mount it in the shell**

In `src/pages/admin/admin-dashboard-content.tsx`, add the import:

```tsx
import { KbArticlesTab } from '@/components/admin/dashboard-content/kb-articles-tab'
```

and replace the kb placeholder line with:

```tsx
      {activeTab === 'kb' ? <KbArticlesTab /> : null}
```

- [ ] **Step 3: Verify**

Run: `npx tsc -b && npm run build`
Expected: no type errors, build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/dashboard-content/kb-articles-tab.tsx src/pages/admin/admin-dashboard-content.tsx
git commit -m "feat: add knowledge base articles admin tab"
```

---

### Task 10: Safe markdown renderer

**Files:**
- Modify: `package.json`
- Create: `src/components/kb/article-body.tsx`
- Modify: `tests/dashboard-content.test.mjs` (append)

**Interfaces:**
- Consumes: nothing.
- Produces: `ArticleBody({ markdown }: { markdown: string })`.

- [ ] **Step 1: Write the failing test**

Append to `tests/dashboard-content.test.mjs`:

```js
test('article rendering cannot execute stored HTML', async () => {
  const pkg = JSON.parse(await read('package.json'))
  const deps = { ...pkg.dependencies, ...pkg.devDependencies }

  // rehype-raw would re-enable raw HTML inside markdown, turning an
  // admin-authored article into a stored-XSS vector for every customer.
  assert.ok(!('rehype-raw' in deps), 'rehype-raw must never be a dependency')
  assert.ok('react-markdown' in deps, 'react-markdown should be installed')

  const body = await read('src/components/kb/article-body.tsx')
  assert.doesNotMatch(body, /rehype-raw|rehypeRaw/)
  assert.match(body, /allowedElements/)
  assert.match(body, /unwrapDisallowed/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `react-markdown should be installed`.

- [ ] **Step 3: Install the dependencies**

Run: `npm install react-markdown remark-gfm`

- [ ] **Step 4: Write the renderer**

Create `src/components/kb/article-body.tsx`:

```tsx
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/**
 * Elements an article may render. Anything outside this list degrades to its
 * text content via unwrapDisallowed.
 */
const ALLOWED = [
  'h1', 'h2', 'h3', 'h4', 'p', 'ul', 'ol', 'li', 'a', 'strong', 'em',
  'code', 'pre', 'blockquote', 'hr', 'br',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
]

/**
 * Renders an admin-authored markdown article.
 *
 * Safety here is structural rather than filtered: rehype-raw is deliberately
 * not installed, so raw HTML inside a body is rendered as inert text and a
 * stored <script> or <img onerror> cannot execute. react-markdown's default
 * urlTransform additionally strips javascript: and other unsafe protocols
 * from hrefs.
 */
export function ArticleBody({ markdown }: { markdown: string }) {
  return (
    <div className="space-y-4 text-sm leading-7 text-white/80">
      <Markdown
        allowedElements={ALLOWED}
        components={{
          h1: ({ children }) => <h1 className="text-2xl font-bold text-white">{children}</h1>,
          h2: ({ children }) => <h2 className="text-xl font-semibold text-white pt-2">{children}</h2>,
          h3: ({ children }) => <h3 className="text-base font-semibold text-white pt-2">{children}</h3>,
          ul: ({ children }) => <ul className="list-disc space-y-1 pl-6">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal space-y-1 pl-6">{children}</ol>,
          a: ({ children, href }) => (
            <a
              className="text-[#5c4df0] underline hover:text-[#796ef3]"
              href={href}
              rel="noopener noreferrer"
              target="_blank"
            >
              {children}
            </a>
          ),
          code: ({ children }) => (
            <code className="rounded bg-[#121214] px-1.5 py-0.5 font-mono text-xs text-white">
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <pre className="overflow-x-auto rounded-lg border border-[#232328] bg-[#121214] p-4 text-xs">
              {children}
            </pre>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-[#5c4df0] pl-4 text-white/60">
              {children}
            </blockquote>
          ),
        }}
        remarkPlugins={[remarkGfm]}
        unwrapDisallowed
      >
        {markdown}
      </Markdown>
    </div>
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Typecheck and build**

Run: `npx tsc -b && npm run build`
Expected: no type errors, build succeeds.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/components/kb/article-body.tsx tests/dashboard-content.test.mjs
git commit -m "feat: add sanitised markdown renderer for knowledge base articles"
```

---

### Task 11: Knowledge base reader routes

**Files:**
- Create: `src/pages/kb-page.tsx`
- Create: `src/pages/kb-article-page.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `fetchPublishedArticles`, `fetchArticleBySlug`, `KbArticle` (Task 4); `ArticleBody` (Task 10).
- Produces: routes `/kb` and `/kb/:slug`, both lazy-loaded inside the existing dashboard shell.

- [ ] **Step 1: Create the browse page**

Create `src/pages/kb-page.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen } from 'lucide-react'

import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/ui-states'
import { fetchPublishedArticles, type KbArticle } from '@/lib/db/kb'
import { supabase } from '@/lib/supabase'

export function KbPage() {
  const [articles, setArticles] = useState<KbArticle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    if (!supabase) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      setArticles(await fetchPublishedArticles(supabase))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Articles could not be loaded.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const categories = [...new Set(articles.map((a) => a.category))]

  return (
    <div className="space-y-6 text-left">
      <div className="text-xs text-muted-foreground">
        <Link className="hover:text-white transition" to="/home">Home</Link>{' '}
        <span className="mx-1 text-[#4f4f52]">/</span>{' '}
        <span className="text-white">Knowledge Base</span>
      </div>

      <h1 className="text-2xl font-bold text-white">Knowledge Base</h1>

      {error ? (
        <ErrorState
          error={error}
          message="Could not load the knowledge base."
          onRetry={() => void load()}
          title="Knowledge Base Error"
        />
      ) : loading ? (
        <TableSkeleton rows={4} />
      ) : articles.length === 0 ? (
        <EmptyState
          description="Articles published by the Maxmark team will appear here."
          icon={<BookOpen className="h-7 w-7 text-violet-400" />}
          title="No Articles Yet"
        />
      ) : (
        <div className="space-y-8">
          {categories.map((category) => (
            <section key={category}>
              <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {category}
              </h2>
              <div className="divide-y divide-[#232328] rounded-lg border border-[#232328] bg-[#161619]">
                {articles
                  .filter((article) => article.category === category)
                  .map((article) => (
                    <Link
                      className="block px-5 py-4 text-sm text-white transition hover:bg-[#1c1c20] hover:text-[#5c4df0]"
                      key={article.id}
                      to={`/kb/${article.slug}`}
                    >
                      {article.title}
                    </Link>
                  ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create the reader page**

Create `src/pages/kb-article-page.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { ArticleBody } from '@/components/kb/article-body'
import { ErrorState, TableSkeleton } from '@/components/ui/ui-states'
import { fetchArticleBySlug, type KbArticle } from '@/lib/db/kb'
import { supabase } from '@/lib/supabase'

export function KbArticlePage() {
  const { slug } = useParams()
  const [article, setArticle] = useState<KbArticle | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!supabase || !slug) {
      setLoading(false)
      return
    }
    const sb = supabase
    let cancelled = false

    setLoading(true)
    setError(null)
    fetchArticleBySlug(sb, slug)
      .then((result) => {
        if (!cancelled) setArticle(result)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'The article could not be loaded.')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [slug])

  if (loading) {
    return <TableSkeleton rows={5} />
  }

  if (error || !article) {
    return (
      <div className="py-12 max-w-xl mx-auto">
        <ErrorState
          error={error}
          message={
            error
              ? 'Could not load this article.'
              : 'This article does not exist, or it has not been published yet.'
          }
          secondaryActionLabel="Back to Knowledge Base"
          secondaryActionLink="/kb"
          title={error ? 'Article Error' : 'Article Not Found'}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6 text-left">
      <div className="text-xs text-muted-foreground">
        <Link className="hover:text-white transition" to="/home">Home</Link>{' '}
        <span className="mx-1 text-[#4f4f52]">/</span>{' '}
        <Link className="hover:text-white transition" to="/kb">Knowledge Base</Link>{' '}
        <span className="mx-1 text-[#4f4f52]">/</span>{' '}
        <span className="text-white">{article.title}</span>
      </div>

      <header className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          {article.category}
        </p>
        <h1 className="text-2xl font-bold text-white">{article.title}</h1>
      </header>

      <article className="max-w-3xl rounded-lg border border-[#232328] bg-[#161619] p-6">
        <ArticleBody markdown={article.bodyMarkdown} />
      </article>
    </div>
  )
}
```

- [ ] **Step 3: Register the lazy routes**

In `src/App.tsx`, add these lazy imports beside the existing `lazy(...)` declarations:

```tsx
const KbPage = lazy(() => import('@/pages/kb-page').then((m) => ({ default: m.KbPage })))
const KbArticlePage = lazy(() =>
  import('@/pages/kb-article-page').then((m) => ({ default: m.KbArticlePage })),
)
```

Then add both routes inside the same `<Route element={<DashboardShell />}>` block that already holds `/home` and `/billing`:

```tsx
            <Route element={<KbPage />} path="kb" />
            <Route element={<KbArticlePage />} path="kb/:slug" />
```

- [ ] **Step 4: Verify the markdown renderer is code-split**

Run: `npm run build`
Expected: build succeeds and the output lists a chunk separate from `app-*.js` containing the markdown renderer. Confirm `react-markdown` is not bundled into the main app chunk:

```bash
grep -l "remark" dist/assets/app-*.js && echo "LEAKED into main chunk" || echo "correctly code-split"
```

Expected: `correctly code-split`.

- [ ] **Step 5: Typecheck**

Run: `npx tsc -b`
Expected: no output, exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/pages/kb-page.tsx src/pages/kb-article-page.tsx src/App.tsx
git commit -m "feat: add knowledge base browse and reader routes"
```

---

### Task 12: Wire the status widget

**Files:**
- Modify: `src/pages/dashboard-home.tsx`

**Interfaces:**
- Consumes: `fetchServiceComponents`, `overallStatus`, `SERVICE_STATUS_LABELS`, `ServiceComponent`, `ServiceStatus` (Task 2).
- Produces: `StatusWidget` reading live data; its exported name and zero-prop signature are unchanged, so `support-page.tsx` (which imports it) keeps working.

- [ ] **Step 1: Replace the widget body**

In `src/pages/dashboard-home.tsx`, add these imports at the top:

```tsx
import {
  SERVICE_STATUS_LABELS,
  fetchServiceComponents,
  overallStatus,
  type ServiceComponent,
  type ServiceStatus,
} from '@/lib/db/service-status'
```

Add this module-level constant above `StatusWidget`:

```tsx
const STATUS_DOT: Record<ServiceStatus, string> = {
  operational: 'bg-emerald-500',
  maintenance: 'bg-sky-500',
  degraded: 'bg-amber-500',
  partial_outage: 'bg-orange-500',
  major_outage: 'bg-red-500',
}

const STATUS_BANNER: Record<ServiceStatus, string> = {
  operational: 'text-emerald-500',
  maintenance: 'text-sky-400',
  degraded: 'text-amber-400',
  partial_outage: 'text-orange-400',
  major_outage: 'text-red-400',
}
```

Then replace the entire body of `StatusWidget` — deleting the hardcoded `sections` array — with:

```tsx
export function StatusWidget() {
  const [openSection, setOpenSection] = useState<string | null>(null)
  const [components, setComponents] = useState<ServiceComponent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }
    let cancelled = false
    fetchServiceComponents(supabase)
      .then((rows) => {
        if (!cancelled) setComponents(rows)
      })
      .catch((error: unknown) => {
        console.warn('Service status fetch failed:', error)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const toggleSection = (id: string) => {
    setOpenSection(openSection === id ? null : id)
  }

  const overall = overallStatus(components)
  const bannerLabel =
    overall === 'operational' ? 'All Systems Operational' : SERVICE_STATUS_LABELS[overall]

  return (
    <div className="bg-[#161619] border border-[#232328] rounded-lg p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Status</h3>
        <Link aria-label="Open support" className="text-[#5c4df0] hover:text-[#796ef3]" to="/support">
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">Loading status…</p>
      ) : components.length === 0 ? (
        <p className="text-xs text-muted-foreground">No service components are being tracked.</p>
      ) : (
        <>
          <div className="flex items-center gap-2 bg-[#121214] border border-[#232328] rounded-md p-3">
            {overall === 'operational' ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
            ) : (
              <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${STATUS_DOT[overall]}`} />
            )}
            <span className={`text-xs font-medium ${STATUS_BANNER[overall]}`}>{bannerLabel}</span>
          </div>

          <div className="divide-y divide-[#232328]">
            {components.map((component) => {
              const isOpen = openSection === component.id
              return (
                <div className="py-2.5 first:pt-0 last:pb-0" key={component.id}>
                  <button
                    className="w-full flex items-center justify-between text-xs text-muted-foreground hover:text-white transition-colors py-1"
                    onClick={() => toggleSection(component.id)}
                  >
                    <span>{component.name}</span>
                    <span className="flex items-center gap-1.5">
                      <span className={`inline-block h-1.5 w-1.5 rounded-full ${STATUS_DOT[component.status]}`} />
                      {isOpen ? (
                        <ChevronUp className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" />
                      )}
                    </span>
                  </button>
                  {isOpen ? (
                    <div className="mt-2 pl-2 text-[11px] text-muted-foreground bg-[#121214] p-2 rounded border border-[#232328]">
                      <span className="block font-semibold text-white/80">
                        {SERVICE_STATUS_LABELS[component.status]}
                      </span>
                      {component.description}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc -b && npm run build && npm test`
Expected: no type errors, build succeeds, all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/pages/dashboard-home.tsx
git commit -m "feat: wire status widget to service components"
```

---

### Task 13: Wire the maintenance widget

**Files:**
- Modify: `src/pages/dashboard-home.tsx`

**Interfaces:**
- Consumes: `fetchActiveMaintenanceWindows`, `deriveWindowState`, `MAINTENANCE_STATE_LABELS`, `MaintenanceWindow` (Task 3).
- Produces: `ScheduledMaintenanceWidget` reading live data; exported name and zero-prop signature unchanged for `support-page.tsx`.

- [ ] **Step 1: Replace the widget body**

In `src/pages/dashboard-home.tsx`, add these imports:

```tsx
import {
  MAINTENANCE_STATE_LABELS,
  deriveWindowState,
  fetchActiveMaintenanceWindows,
  type MaintenanceState,
  type MaintenanceWindow,
} from '@/lib/db/maintenance'
```

Add this module-level constant above `ScheduledMaintenanceWidget`:

```tsx
const MAINTENANCE_TONE: Record<MaintenanceState, string> = {
  scheduled: 'text-amber-500',
  in_progress: 'text-sky-400',
  completed: 'text-emerald-500',
}

const windowFmt = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
})
```

Then replace the entire body of `ScheduledMaintenanceWidget` with:

```tsx
export function ScheduledMaintenanceWidget() {
  const [windows, setWindows] = useState<MaintenanceWindow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }
    let cancelled = false
    fetchActiveMaintenanceWindows(supabase)
      .then((rows) => {
        if (!cancelled) setWindows(rows)
      })
      .catch((error: unknown) => {
        console.warn('Maintenance window fetch failed:', error)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const now = new Date()

  return (
    <div className="bg-[#161619] border border-[#232328] rounded-lg p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Scheduled Maintenance</h3>
        <Link aria-label="Open maintenance support" className="text-[#5c4df0] hover:text-[#796ef3]" to="/support">
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">Loading maintenance…</p>
      ) : windows.length === 0 ? (
        <p className="text-xs text-muted-foreground">No maintenance is scheduled.</p>
      ) : (
        <div className="space-y-3">
          {windows.map((item) => {
            const state = deriveWindowState(item, now)
            return (
              <div className="p-3 bg-[#121214] border border-[#232328] rounded-md" key={item.id}>
                <span className="text-xs font-semibold text-white">{item.title}</span>
                <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
                  <span
                    className={`font-semibold uppercase tracking-wider text-[9px] block mb-1 ${MAINTENANCE_TONE[state]}`}
                  >
                    {MAINTENANCE_STATE_LABELS[state]}
                  </span>
                  {item.body}
                </p>
                <div className="text-[10px] text-muted-foreground/80 mt-3 pt-2 border-t border-[#232328]">
                  {windowFmt.format(new Date(item.startsAt))} — {windowFmt.format(new Date(item.endsAt))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc -b && npm run build && npm test`
Expected: no type errors, build succeeds, all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/pages/dashboard-home.tsx
git commit -m "feat: wire maintenance widget to maintenance windows"
```

---

### Task 14: Wire the knowledge base list and search

**Files:**
- Modify: `src/pages/dashboard-home.tsx`
- Modify: `tests/dashboard-content.test.mjs` (append)

**Interfaces:**
- Consumes: `fetchPublishedArticles`, `KbArticle` (Task 4).
- Produces: dashboard KB list and search backed by `kb_articles`; no remaining `KNOWLEDGE_ARTICLES` constant anywhere in `src/`.

- [ ] **Step 1: Write the failing test**

Append to `tests/dashboard-content.test.mjs`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `KNOWLEDGE_ARTICLES` still present in `dashboard-home.tsx`.

- [ ] **Step 3: Replace the constant with live state**

In `src/pages/dashboard-home.tsx`, add the import:

```tsx
import { fetchPublishedArticles, type KbArticle } from '@/lib/db/kb'
```

Delete the entire `const KNOWLEDGE_ARTICLES = [...]` block.

Add this constant beside the other module-level constants:

```tsx
/** How many articles the home widget lists before sending people to /kb. */
const HOME_ARTICLE_LIMIT = 5
```

Inside `DashboardHome`, add state beside the existing `useState` calls:

```tsx
  const [articles, setArticles] = useState<KbArticle[]>([])
```

Add this effect beside the existing data-loading effect:

```tsx
  useEffect(() => {
    if (!supabase) return
    let cancelled = false
    fetchPublishedArticles(supabase)
      .then((rows) => {
        if (!cancelled) setArticles(rows)
      })
      .catch((error: unknown) => {
        console.warn('Knowledge base fetch failed:', error)
      })

    return () => {
      cancelled = true
    }
  }, [])
```

Replace the `filteredArticles` derivation with:

```tsx
  const searchTerm = searchQuery.trim().toLowerCase()
  // With no search, show a curated head of the list; searching covers them all.
  const filteredArticles = searchTerm
    ? articles.filter(
        (article) =>
          article.title.toLowerCase().includes(searchTerm) ||
          article.category.toLowerCase().includes(searchTerm),
      )
    : articles.slice(0, HOME_ARTICLE_LIMIT)
```

- [ ] **Step 4: Point article links at the reader**

Still in `src/pages/dashboard-home.tsx`, find where `filteredArticles` is rendered and change each item's link target from `/support` to the article's own route:

```tsx
                <Link
                  className="block text-xs text-white hover:text-[#5c4df0] underline transition-colors"
                  key={article.id}
                  to={`/kb/${article.slug}`}
                >
                  {article.title}
                </Link>
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Full verification**

Run: `npx tsc -b && npm run build && npm test && npx eslint src/`
Expected: no type errors, build succeeds, all tests pass, no new lint errors.

> Two lint problems pre-date this work and are expected to remain:
> `src/components/ui/network-banner.tsx:12` (`react-hooks/set-state-in-effect`)
> and `src/pages/billing-page.tsx:81` (`react-hooks/exhaustive-deps`).
> Do not fix them here; they are unrelated to this plan.

- [ ] **Step 7: Commit**

```bash
git add src/pages/dashboard-home.tsx tests/dashboard-content.test.mjs
git commit -m "feat: wire dashboard knowledge base list and search to real articles"
```

---

## Manual verification

After Task 14, verify end to end against a real Supabase project:

1. Apply the migration: `supabase db push`. Confirm the six seeded components appear on the dashboard with a green "All Systems Operational" banner.
2. Deploy the function: `supabase functions deploy admin-actions`.
3. As an admin, open `/admin/content`. On the Service Status tab set "Managed WordPress" to Major Outage. Reload the dashboard: the banner must turn red and read "Major Outage", and the component's dot must be red.
4. On the Maintenance tab create a window starting an hour from now and publish it. The dashboard must show it as "Scheduled". Edit it to have started an hour ago and end an hour from now: it must read "In Progress".
5. On the Knowledge Base tab create an article, leave it unpublished, and confirm it does **not** appear on the dashboard, on `/kb`, or at its `/kb/<slug>` URL — including while signed in as the admin who wrote it. Publish it and confirm all three now show it.
6. In an article body, add the literal text `<script>alert(1)</script>` and publish. Open the article: the text must render visibly as characters on the page and no alert may fire.
7. Confirm `admin_audit_log` has one row per mutation from steps 3-6, each with the acting admin's user id.
