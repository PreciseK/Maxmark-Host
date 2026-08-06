# Dashboard Content — Design

## Context

Three widgets on the customer dashboard home render hardcoded constants. They are the last fabricated data in the customer-facing app, left behind after the mock-data removal (`7b2e8f4`) and the site-detail wiring (`1805a77`), because unlike every other widget they had no table to read from:

- **`StatusWidget`** (`src/pages/dashboard-home.tsx`) — a literal array of six services, every one hardcoded `Operational`, above a banner that always reads "All Systems Operational". Expanding a row prints a generated sentence claiming the component is healthy. During a real outage this widget actively lies to customers.
- **`ScheduledMaintenanceWidget`** — one hardcoded notice with a fixed `Apr 1, 2026 9:00 AM - 11:00 AM` window that will sit on the dashboard forever.
- **`KNOWLEDGE_ARTICLES`** — four article titles with no bodies, all linking to `/support`. The dashboard search box filters this array, so search appears to work but can only ever match those four strings.

This spec adds three tables, an admin surface to manage them, and a knowledge base readable in the app. Every mutation goes through the existing `admin-actions` Edge Function, so content changes are gated on the `admin` role and land in `admin_audit_log` alongside every other admin action.

## Decisions

Settled during design, recorded here because each closes off a plausible alternative:

- **Status is fully admin-curated**, not derived from `hosting_nodes`. Node state does not map cleanly onto customer-facing service names, and during an incident the operator needs editorial control over what customers are told.
- **One admin page with three tabs**, not three nav entries. The admin nav already has eleven items, and these three are one concept: what customers see on their home screen.
- **Articles are full markdown documents stored in Supabase**, not links out to an external docs site. This means a body field, a reader route, and a render path — see [Markdown safety](#markdown-safety).
- **Maintenance state is derived from timestamps**, not a manual status field. A manual field goes stale the first time someone forgets to update it, and a stale maintenance notice is worse than none.
- **Writes extend `admin-actions`** rather than adding admin-write RLS policies or a second Edge Function. A direct-write path would silently bypass `admin_audit_log`; a second function would duplicate the admin gate and audit logic.

## Schema

One migration, `supabase/migrations/20260806001000_dashboard_content.sql`. Idempotent throughout (`if not exists` guards, `on conflict do nothing`) to match the rest of the schema.

One new enum:

```sql
create type public.service_status as enum (
  'operational', 'degraded', 'partial_outage', 'major_outage', 'maintenance'
);
```

### `service_components`

| column | type | notes |
|---|---|---|
| `id` | `uuid` primary key | |
| `name` | `text not null unique` | e.g. "Managed WordPress"; unique so the seed can `on conflict (name) do nothing` |
| `description` | `text not null default ''` | shown when the row is expanded |
| `status` | `service_status not null default 'operational'` | |
| `sort_order` | `integer not null default 0` | display order |
| `published` | `boolean not null default true` | hide without deleting |
| `created_at` / `updated_at` | `timestamptz not null` | `set_updated_at()` trigger |

Defaults to **published**: a component you add is one you intend to track.

### `maintenance_windows`

| column | type | notes |
|---|---|---|
| `id` | `uuid` primary key | |
| `title` | `text not null` | |
| `body` | `text not null` | plain text, not markdown |
| `starts_at` | `timestamptz not null` | |
| `ends_at` | `timestamptz not null` | `check (ends_at > starts_at)` |
| `published` | `boolean not null default false` | draft by default |
| `created_at` / `updated_at` | `timestamptz not null` | |

`body` is plain text deliberately. A maintenance notice is two lines, and confining markdown to one table keeps the render surface as small as possible.

### `kb_articles`

| column | type | notes |
|---|---|---|
| `id` | `uuid` primary key | |
| `slug` | `text not null unique` | drives `/kb/:slug` |
| `title` | `text not null` | |
| `category` | `text not null` | e.g. "Domains & DNS" |
| `body_markdown` | `text not null` | |
| `sort_order` | `integer not null default 0` | home-widget ordering |
| `published` | `boolean not null default false` | draft by default |
| `created_at` / `updated_at` | `timestamptz not null` | |

### RLS

All three tables follow the `user_sites` posture exactly:

```sql
-- customers read published rows
create policy "Users can view published <table>"
  on public.<table> for select using (published = true);

-- admins additionally read drafts
create policy "Admins can view all <table>"
  on public.<table> for select using (public.is_admin());

-- no client writes at all
revoke insert, update, delete on table public.<table> from authenticated;
```

Writes reach these tables only through the service role inside `admin-actions`.

### Seed

The migration seeds the six service components currently hardcoded in the widget — Support Services, Platform Operations, Managed WordPress, Maxmark Cloud, Cloud Container Services, Data Centers & Network — all `operational`, with `on conflict (name) do nothing`. Without this, wiring the widget would make a working dashboard look broken on first deploy. `kb_articles` and `maintenance_windows` seed nothing; those are the operator's to write.

Re-running the migration therefore never duplicates a component or overwrites a status an operator has since changed.

## Derived values

Two values are computed at render time and never stored, so they cannot drift from the rows they summarise.

**Overall status** is the worst status among published components, by severity order `operational < maintenance < degraded < partial_outage < major_outage`. The banner text and colour both follow it; green appears only when every component is `operational`. Today's widget hardcodes the healthy state, which is exactly the failure this removes.

**Maintenance window state** comes from `starts_at`/`ends_at` versus now:

| condition | state |
|---|---|
| `now < starts_at` | Scheduled |
| `starts_at <= now <= ends_at` | In Progress |
| `now > ends_at` | Completed |

The customer query returns only windows with `ends_at > now() - interval '24 hours'`, so completed notices age off the dashboard without anyone tidying up.

## Repository layer

Three modules in `src/lib/db/`, following the existing pattern (typed row interface, snake_case → camelCase mapping, throw on error):

| module | exports |
|---|---|
| `service-status.ts` | `fetchServiceComponents`, `fetchAllServiceComponents` (admin), `overallStatus(components)` |
| `maintenance.ts` | `fetchActiveMaintenanceWindows`, `fetchAllMaintenanceWindows` (admin), `deriveWindowState(window, now)` |
| `kb.ts` | `fetchPublishedArticles`, `fetchArticleBySlug`, `fetchAllArticles` (admin) |

**Customer fetches must filter `published = true` explicitly.** Because admins can select every row under `is_admin()`, relying on RLS alone would show an admin their own unpublished drafts on their personal dashboard while every other user sees nothing — a bug that only ever reproduces for the person least likely to report it. The admin fetches simply omit the filter.

`overallStatus` and `deriveWindowState` are pure functions over already-fetched data, so they are unit-testable without a database.

## Admin write path

Six new cases in the `admin-actions` Zod discriminated union, as upsert/delete pairs. Omitting `id` inserts; supplying it updates.

```
upsert_service_component   delete_service_component
upsert_maintenance_window  delete_maintenance_window
upsert_kb_article          delete_kb_article
```

They inherit the existing flow unchanged: resolve the caller from their JWT, assert the `admin` role under the service role, mutate, append to `admin_audit_log`.

Validation at the boundary, concentrated on the fields most likely to cause trouble:

- `slug` — `^[a-z0-9]+(?:-[a-z0-9]+)*$`, max 80 chars. Rejects path-traversal and URL-shape problems before the value reaches a route param.
- `body_markdown` — max 50,000 chars, so a runaway paste cannot bloat every dashboard fetch.
- `starts_at` / `ends_at` — ISO datetimes, with `ends_at > starts_at` enforced in Zod *and* as a table `check`, so the invariant survives a future writer that bypasses the function.
- `status` — the `service_status` enum. `name`, `title`, `category` — bounded lengths. `sort_order` — bounded integer.

The client extends the existing `AdminAction` union in `src/lib/functions.ts`; all six dispatch through the current `adminAction<T>()` helper. No new transport.

## Admin UI

Route `admin/content`, nav item "Dashboard Content", tabs driven by a `?tab=` search param (matching `billing-page` and `site-detail-page`).

```
src/pages/admin/admin-dashboard-content.tsx        shell + tab switching
src/components/admin/dashboard-content/
  service-components-tab.tsx    status, order, publish toggle
  maintenance-tab.tsx           window CRUD + derived-state preview
  kb-articles-tab.tsx           article CRUD + markdown body editor
```

Three CRUD surfaces in one file would pass the 800-line ceiling, so each tab is its own component. All three reuse the existing `admin-ui` primitives (`adminDialogClass`, `fieldInputClass`, `fieldLabelClass`, `primaryButtonClass`, `StatusBadge`, `tableClass`) — no new design vocabulary.

The maintenance tab shows each window's derived state beside its timestamps, so an operator can see that a window reads "In Progress" before publishing it.

## Customer surfaces

The three widgets read from the repository modules, each with loading, empty, and error states from the existing `ui-states` components.

- **`StatusWidget`** — published components by `sort_order`; banner from `overallStatus`; expanding a row shows its stored `description` rather than a generated claim of health.
- **`ScheduledMaintenanceWidget`** — active windows, each labelled with its derived state, plus a real "No maintenance scheduled" empty state.
- **KB list and search** — published articles by `sort_order`. The widget shows the top 5; the existing search box filters across all published articles, preserving current behaviour against real data.

Two new routes inside `CustomerRoute`: `/kb` (browse all published articles, grouped by category) and `/kb/:slug` (reader). An unknown slug renders the existing `ErrorState` with a link back to `/kb`.

Both `/kb` routes are **lazy-loaded**, as the admin tree already is, so the markdown renderer lands in its own chunk rather than the main dashboard bundle.

## Markdown safety

Article bodies are admin-authored content rendered in every customer's browser, which makes them a stored-XSS vector.

Add `react-markdown` and `remark-gfm`. Deliberately **do not** add `rehype-raw`. Without it, raw HTML inside a body is rendered as inert text, so `<script>` or `<img onerror=…>` stored by a compromised admin account cannot execute. The protection is structural — it comes from a plugin being absent rather than a filter someone can misconfigure.

Two further constraints in `src/components/kb/article-body.tsx`:

- an explicit `allowedElements` list — headings, paragraphs, lists, links, emphasis, code, pre, blockquote, hr, and table elements — with `unwrapDisallowed` so anything else degrades to its text content
- links rendered with `target="_blank"` and `rel="noopener noreferrer"`

react-markdown's default `urlTransform` already strips `javascript:` and other dangerous protocols from hrefs.

## Testing

Extending the source-assertion style of `tests/production-hardening.test.mjs` (`node --test`), plus unit tests for the two pure functions:

**Migration**
- RLS enabled on all three tables
- `revoke insert, update, delete … from authenticated` present for each
- an admin select policy present for each
- the `ends_at > starts_at` check constraint present

**`admin-actions`**
- all six action literals present in the union
- the slug regex enforced
- the `body_markdown` length cap present

**Markdown safety**
- `rehype-raw` appears nowhere in the repository
- `article-body.tsx` passes `allowedElements`

**Repository**
- customer fetches filter `published`, guarding the admin-sees-drafts regression

**Pure functions**
- `overallStatus` returns the worst status across a mixed set, and `operational` only when all components are operational
- `deriveWindowState` returns Scheduled, In Progress, and Completed at the three boundaries relative to an injected `now`

## Out of scope

- **Public (unauthenticated) status page.** Both dashboard widgets sit behind `CustomerRoute`, so RLS grants read to `authenticated` only. Serving status to signed-out visitors would need an anon-readable policy and a public route; worth doing, but a separate change.
- **Incident history and per-component timelines.** `service_components` stores current state only. History would need an events table.
- **Customer notification on status change.** No email or in-app alert fires when a component changes status.
- **Rich-text authoring.** The article editor is a plain markdown textarea, not a WYSIWYG.
