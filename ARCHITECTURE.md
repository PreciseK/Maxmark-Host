# Maxmark Host — Architecture

Maxmark Host is a managed WordPress hosting control panel. It presents a single-page application (SPA) that abstracts the complexity of WHM/cPanel into a clean dashboard inspired by Nexcess/Liquid Web. The backend is Supabase: Postgres + RLS for data, email-OTP auth, and Edge Functions for everything that must not be trusted to the browser (WHM provisioning, Paystack payment verification).

**Trust boundary rule:** the browser only ever reads/updates its own rows under RLS. Anything that creates value — a provisioned site, a paid invoice, a plugin licence — is written exclusively by an Edge Function running with the service-role key after server-side verification.

---

## Tech Stack

| Layer | Technology |
|---|---|
| UI framework | React 19 |
| Language | TypeScript 5.9 (strict) |
| Bundler | Vite 8 |
| Router | React Router v7 |
| Styling | Tailwind CSS 3 + tailwindcss-animate |
| Component primitives | Radix UI (Avatar, Dialog, Progress, Slot) |
| Icons | Lucide React |
| Backend / database | Supabase (Postgres, Auth, RLS) |
| Supabase client | @supabase/supabase-js v2 |
| Validation | Zod v4 |
| Fonts | Manrope (body), Fraunces (display) |
| ZIP assembly | JSZip (marketplace plugin downloads) |

---

## Directory Structure

```
src/
├── App.tsx                  # Root: global state, routing tree
├── main.tsx                 # Entry point
│
├── layouts/
│   └── dashboard-shell.tsx  # Persistent sidebar + nav, <Outlet />
│
├── pages/                   # One file per route
│   ├── dashboard-home.tsx
│   ├── plans-page.tsx
│   ├── domains-page.tsx
│   ├── dns-zones-page.tsx
│   ├── sites-page.tsx
│   ├── site-detail-page.tsx # 16-tab site management view
│   ├── marketplace-page.tsx
│   ├── billing-page.tsx
│   ├── ssl-page.tsx
│   └── support-page.tsx
│
├── components/
│   ├── create-site-modal.tsx
│   └── ui/                  # Radix-based primitives
│       ├── button.tsx
│       ├── card.tsx
│       ├── badge.tsx
│       ├── input.tsx
│       ├── dialog.tsx
│       ├── progress.tsx
│       └── avatar.tsx
│
├── lib/
│   ├── supabase.ts           # Creates SupabaseClient | null
│   ├── functions.ts          # Typed bridge to the Edge Functions
│   ├── paystack.ts           # Paystack inline checkout loader
│   ├── utils.ts              # cn() (clsx + tailwind-merge)
│   └── db/                   # Repository layer — one file per domain
│       ├── sites.ts
│       ├── backup-logs.ts
│       ├── billing.ts
│       ├── plans.ts
│       ├── marketplace.ts
│       ├── dns-zones.ts
│       └── domains.ts
│
├── services/
│   ├── provisioningService.ts     # Routes to Edge Function (live) or simulation (demo)
│   ├── mockProvisioningClient.ts  # Browser-side provisioning simulation
│   └── marketplaceService.ts      # Purchase orchestration + ZIP assembly
│
├── types/
│   ├── provisioning.ts   # HostingNodeRecord, UserSiteRecord, ManagedSite, …
│   └── marketplace.ts    # MarketplacePlugin, PluginPurchase, …
│
└── data/
    ├── mockSites.ts        # Static ManagedSite[] + createMockManagedSite()
    └── mockMarketplace.ts  # Static MarketplacePlugin[] + PluginPurchase[]
```

Server-side code lives outside `src/` so WHM credentials and the service-role
key can never end up in the browser bundle:

```
supabase/functions/
├── _shared/
│   ├── provisioner.ts     # WHM/cPanel pipeline (Deno, service role)
│   └── cors.ts
├── provision-site/index.ts   # POST — provision a site for the JWT user
└── verify-payment/index.ts   # POST — verify Paystack tx, record payment/licence

migrations/
└── 001_currency_and_node_slots.sql  # Upgrade path for pre-existing databases
```

---

## Routing

React Router v7 with a single nested route tree. `DashboardShell` is the persistent layout; all pages render into its `<Outlet />`.

```
/                   → redirect to /home
/home               → DashboardHome
/plans              → PlansPage
/domains            → DomainsPage
/dns-zones          → DnsZonesPage
/sites              → SitesPage
/sites/:siteId      → SiteDetailPage  (tab driven by ?tab= search param)
/marketplace        → MarketplacePage
/billing            → BillingPage
/ssl                → SslPage
/support            → SupportPage
```

### Site detail tabs

`?tab=` controls the active section. All 16 tabs are rendered in `site-detail-page.tsx`:

`credentials` · `content-delivery` · `backups` · `staging` · `email` · `visual-comparison` · `design-services` · `analytics` · `domains` · `management` · `databases` · `ssl` · `logs` · `tasks` · `containers` · `integrations`

---

## State Management

There is no external state library. `App.tsx` owns all cross-page mutable state and passes it down via props:

| State | Type | Owner | Consumers |
|---|---|---|---|
| `sites` | `ManagedSite[]` | `App` | `SitesPage`, `SiteDetailPage`, `MarketplacePage` |
| `plugins` | `MarketplacePlugin[]` | `App` | `MarketplacePage` |
| `pluginPurchases` | `PluginPurchase[]` | `App` | `MarketplacePage` |
| `dbReady` | `boolean` | `App` | gates optimistic writes to Supabase |

Pages that own self-contained data (billing, plans, dns-zones, domains, backup logs) manage their own `useState` + `useEffect`.

---

## Data Layer

### Supabase client

`src/lib/supabase.ts` exports `supabase: SupabaseClient | null`. It is `null` when `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` are absent, allowing the app to run entirely on mock data during local development without credentials.

```ts
export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null
```

### Repository pattern

Each file in `src/lib/db/` is a thin module that:
1. Accepts a non-null `SupabaseClient` (callers guard before passing)
2. Runs one or more Supabase queries
3. Maps snake_case DB columns to camelCase TypeScript interfaces
4. Throws on error so callers can catch and keep mock state

| File | Exports |
|---|---|
| `sites.ts` | `fetchSites` |
| `backup-logs.ts` | `fetchBackupLogs(supabase, siteId)` |
| `billing.ts` | `fetchBillingData` → `BillingData` |
| `plans.ts` | `fetchPlans` |
| `marketplace.ts` | `fetchPlugins`, `fetchPurchases`, `updatePurchaseDownloadState` |
| `dns-zones.ts` | `fetchDnsZones` (with `dns_records(count)` join) |
| `domains.ts` | `fetchRegisteredDomains` |

All money columns are NGN (`total_ngn`, `amount_ngn`, `price_ngn`, …) —
matching the Paystack integration, which only charges NGN.

### Mock-first, live-replace pattern

Every page initialises state from a typed mock constant. A `useEffect` fires on mount, checks for a Supabase session, and replaces state with live data only when both conditions hold. Any fetch error silently keeps the mock — the UI is always functional.

```ts
const [plans, setPlans] = useState<HostingPlan[]>(MOCK_PLANS)

useEffect(() => {
  if (!supabase) return
  const sb = supabase           // capture non-null ref before async boundary
  sb.auth.getSession().then(({ data: { session } }) => {
    if (!session) return
    fetchPlans(sb)
      .then((live) => { if (live.length > 0) setPlans(live) })
      .catch(() => { /* keep mock */ })
  })
}, [])
```

The `const sb = supabase` capture is required because TypeScript's narrowing does not persist across the `.then()` async boundary.

---

## Database Schema

All tables live in the `public` schema. Row-Level Security is enabled on every table.

### Tables

#### Infrastructure

| Table | Purpose |
|---|---|
| `hosting_nodes` | WHM/cPanel accounts available for provisioning |
| `user_profiles` | Display name, account ID, support PIN |
| `hosting_plans` | Subscription plans; each plan covers N sites |

#### Sites and their children

| Table | Purpose |
|---|---|
| `user_sites` | One row per managed WordPress site |
| `site_settings` | Feature toggles (nginx, core upgrades, password protection) |
| `backup_logs` | Per-site backup history |
| `email_boxes` | Mailboxes per site |
| `email_aliases` | Forwarders per site |
| `ssl_certificates` | SSL certificate state per site |
| `pointer_domains` | Alias/CNAME/redirect domains per site |
| `cron_tasks` | Scheduled tasks per site |
| `staging_environments` | Dev/staging copies per site |
| `container_services` | Elasticsearch / RabbitMQ / Solr per site |
| `integrations` | New Relic / Datadog / Cloudflare per site |
| `analytics_snapshots` | PHP-FPM, web stats, bandwidth time-series |

#### Marketplace

| Table | Purpose |
|---|---|
| `marketplace_plugins` | Plugin catalogue (name, price, highlights, gradient, rating) |
| `plugin_purchases` | User licence records; upserted on `license_key` |

#### Billing

| Table | Purpose |
|---|---|
| `invoices` | Billing invoices |
| `payments` | Payment transaction history |
| `payment_methods` | Saved credit cards |
| `orders` | Product purchase history |
| `credits` | Account credit transactions |

#### DNS and Domains

| Table | Purpose |
|---|---|
| `dns_zones` | DNS zones owned by a user |
| `dns_records` | A / AAAA / CNAME / MX / TXT / NS / SRV records |
| `registered_domains` | Domain registrations (expires\_at, auto\_renew, price) |

### RLS policy pattern

User-owned tables (invoices, plans, dns\_zones, etc.) use a direct `user_id` check:

```sql
using (auth.uid() = user_id)
```

**Deliberately missing policies:** `user_sites` and `plugin_purchases` have no
client INSERT policy. Sites are created only by the `provision-site` Edge
Function and licences only by `verify-payment` (both service role). A client
INSERT policy on `plugin_purchases` would let any signed-in user grant
themselves a licence without paying.

Site-child tables (backup\_logs, email\_boxes, etc.) join through `user_sites` to enforce ownership:

```sql
using (
  exists (
    select 1 from public.user_sites s
    where s.id = <table>.site_id and s.user_id = auth.uid()
  )
)
```

### Key enum types

`hosting_plan_type` · `hosting_plan_status` · `backup_status` · `ssl_status` · `pointer_domain_type` · `staging_status` · `container_type` · `container_status` · `integration_type` · `integration_status` · `analytics_metric` · `invoice_status` · `payment_status` · `order_status` · `domain_status` · `dns_record_type`

---

## Provisioning System

`supabase/functions/_shared/provisioner.ts` implements the site provisioning pipeline. It runs only inside the `provision-site` Edge Function (Deno, service role) — never in the browser. The dashboard's provisioning modal uses `src/services/provisioningService.ts`, which calls the Edge Function when a session exists and falls back to `mockProvisioningClient.ts` in demo mode.

### Steps

```
1. select-node     → rpc allocate_hosting_node()  (atomic, row-locked slot claim)
2. create-domain   → WHM AddonDomain::addaddondomain
3. create-database → WHM Mysql::create_database
4. create-user     → WHM Mysql::create_user
5. grant-privileges→ WHM Mysql::set_privileges_on_database
6. complete        → insert user_sites row (uuid generated by Postgres)
```

Failure handling: if any step throws, the completed WHM steps are rolled back
best-effort (deladdondomain / delete\_database / delete\_user in reverse
order) and the claimed slot is returned via `rpc release_hosting_node()`. The
step log — including the `failed` step — is returned to the client in the
error payload. The generated MySQL password never leaves the server.

`allocate_hosting_node()` uses `select … for update skip locked`, so two
concurrent provisions can never both take the last slot of a node. Capacity is
per-node via the `hosting_nodes.max_slots` column (no hardcoded 20s).

### Executor injection

The provisioner accepts a `WhmRequestExecutor` dependency:

- **Production**: `createFetchWhmExecutor()` hitting `https://{WHM_HOST}:{WHM_PORT}/json-api/cpanel` with `Authorization: whm root:{WHM_MASTER_TOKEN}`
- **Staging / demo**: `createMockWhmExecutor()` — selected by `MOCK_WHM_REQUESTS=true`, returns realistic cPanel JSON

---

## Payments (Paystack)

The client never decides that something is paid.

```
Browser                         Edge Function                  Paystack
───────                         ─────────────                  ────────
open inline checkout  ──────────────────────────────────────▶  charge card
popup succeeds (reference)
POST verify-payment {reference, purpose, invoiceId|pluginId} ▶
                                GET /transaction/verify/{ref} ▶
                                ◀ status, amount, currency
                                assert: success, NGN,
                                amount ≥ invoice total / plugin price
                                write payments row / plugin_purchases row
                                (service role; idempotent on
                                 transaction_id / (user_id, plugin_id))
◀ verified result — UI reloads billing / licence state from DB
```

- **Invoices** (`billing-page.tsx`): after checkout, `verifyInvoicePayment()` settles the invoice server-side, then billing data is re-fetched.
- **Marketplace licences** (`marketplaceService.purchasePlugin`): live mode requires a session + `VITE_PAYSTACK_PUBLIC_KEY`; the licence key is generated server-side by `verify-payment`. Demo mode (no Supabase) creates a local mock purchase.

## Marketplace tiers

One catalog (`marketplace_plugins`) sells **plugins and themes**
(`product_type`), each assigned a **tier 1–3**. A user's marketplace tier is
derived from their active hosting plans by the SQL function
`marketplace_tier_for_user()`:

```
Launch → 1 · Standard → 2 · Scale → 2 · VIP → 3 · no active plan → 0
```

| User tier vs item tier | Behavior |
|---|---|
| item ≤ user tier | Included — `claim-item` Edge Function issues a ₦0 licence (`acquisition: 'subscription'`) |
| item > user tier | Individual Paystack purchase via `verify-payment` (`acquisition: 'purchase'`) |
| user tier 0 | Browse only — UI shows "Subscribe to unlock"; both Edge Functions reject with 403 |

`src/lib/tiers.ts` mirrors the mapping for display/gating only; entitlement is
always re-derived server-side. `acquireItem()` in `marketplaceService.ts` is
the single UI entry point that routes claim vs. buy vs. reject. Demo mode
defaults to tier 3 (the mock data ships a VIP plan) so the whole flow works
without credentials.

## Authentication

`sign-in-flow-1.tsx` uses Supabase email OTP: `signInWithOtp()` on the email
step (with `shouldCreateUser` tied to the Login/Signup toggle), `verifyOtp()`
when the 6-digit code completes, plus Google OAuth via `signInWithOAuth()`.
`App.tsx` subscribes to `onAuthStateChange` — live data loads on `SIGNED_IN`
and demo data is restored on `SIGNED_OUT`. Without Supabase credentials the
flow remains a pure demo animation.

### Environment variables

| Variable | Used by | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` | Frontend | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Frontend | Supabase anon key (RLS enforced) |
| `VITE_PAYSTACK_PUBLIC_KEY` | Frontend | Paystack inline checkout key |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | Edge Functions | Injected automatically by Supabase |
| `PAYSTACK_SECRET_KEY` | Edge Functions | Verifies transactions server-side |
| `WHM_HOST` | Edge Functions | cPanel/WHM server hostname |
| `WHM_PORT` | Edge Functions | Default 2087 |
| `WHM_API_USERNAME` | Edge Functions | Default `root` |
| `WHM_MASTER_TOKEN` | Edge Functions | WHM API token |
| `MOCK_WHM_REQUESTS` | Edge Functions | `true` → mock WHM executor |

---

## Type System

### Core types (`src/types/provisioning.ts`)

```
UserSiteRecord          base DB row (id, user_id, node_id, site_domain, db_name, db_user, …)
  └── ManagedSite       extends with display/config fields:
        plan, region, phpVersion, wordpressVersion, backupsSummary,
        createdLabel, dailyVisits, magicLoginLabel,
        cnameTarget, ipAddress, ftpHostname, homeDirectory,
        redisIp, redisPort, cdnHostname, cdnEndpoint,
        metrics: SiteMetrics,
        nodeSummary: { primaryDomain, currentSlots, maxSlots }

HostingNodeRecord       hosting_nodes row
ProvisionSiteResponse   Edge Function response (site, steps, nodeSummary — no secrets)
ProvisioningStep        { id, label, description, state }
```

### Marketplace types (`src/types/marketplace.ts`)

```
MarketplacePlugin       catalogue entry (id, slug, name, priceUsd, highlights, gradient, …)
PluginPurchase          licence record (id, userId, pluginId, licenseKey, downloadCount, …)
PluginCategory          'Performance' | 'Commerce' | 'Growth' | 'Security'
PluginPurchaseStatus    'active' | 'refunded' | 'revoked'
```

### Repository interfaces (in `src/lib/db/`)

Each repository file defines its own interface that mirrors the DB row in camelCase. These are kept local to the repository module and not re-exported from a central index to keep dependencies explicit.

---

## Admin Console (`/admin/*`)

A role-guarded operations console living in the same app, lazy-loaded as one chunk (`src/pages/admin/admin-area.tsx`) so customer sessions never download it.

### Role system

- `public.user_roles` (`user_id`, `role public.app_role`) — grants are written only by operators (SQL editor / service role); there is **no client write policy**, same posture as `user_sites`.
- `public.is_admin()` — `STABLE SECURITY DEFINER` helper used by every admin RLS policy. Never inline a `user_roles` subquery in a policy: it would recurse through the table's own RLS.
- Seed the first admin after the account exists:

  ```sql
  insert into public.user_roles (user_id, role)
  select id, 'admin' from auth.users where email = 'you@example.com'
  on conflict do nothing;
  ```

### Trust boundary

- **Admin reads** go straight through RLS from the browser: permissive `"Admins can view …"` SELECT policies OR with the per-user policies, so customer behavior is unchanged. `src/lib/db/admin.ts` is the repository.
- **Admin writes** go exclusively through the `admin-actions` Edge Function (`supabase/functions/admin-actions/index.ts`): JWT → service-role check of `user_roles` → Zod discriminated union on `action` → service-role write → `admin_audit_log` insert. Actions: `list_users` (the one read that needs `auth.users`), `adjust_credit`, `set_site_status`, `create_node`, `update_node`, `create_invoice`, `set_invoice_status`, `upsert_plugin`, `set_purchase_status`, `set_conversation_status`. Client bridge: `adminAction()` in `src/lib/functions.ts`.
- `admin_audit_log` is append-only (service role writes, admin-only SELECT) and rendered at `/admin/audit`.

The same posture extends to object storage: the browser never gets direct R2 credentials — the `storage` Edge Function authorizes each upload/download (license ownership, conversation membership, or "it's your own avatar") and hands back a single short-lived presigned URL scoped to one object key.

### Session & guard

`SessionProvider` (`src/lib/session-context.tsx`, hook in `src/lib/session-store.ts`) resolves `{ session, isAdmin, isDemo, roleResolved }` plus the support unread badges. `AdminRoute` gates the tree: **demo mode (no env vars) renders freely from mocks** — consistent with mock-first rendering, so a real deployment must set env vars; with Supabase configured, no session → `/login`, non-admin → `/home`.

### Node lifecycle note

`hosting_node_status` gained `'maintenance'` (migration 002) so admins can drain a node. `'full'` remains machine-owned by `allocate_hosting_node()`. Caveat: `release_hosting_node()` resets its node to `'active'`, so a drained node with an in-flight provision that fails gets un-drained — re-drain from `/admin/nodes`.

---

## Support Chat

Customer surfaces: a floating `ChatWidget` mounted in `DashboardShell` (every customer page) and the `/support` page (real conversations in the original Cases layout). Admin surface: `/admin/support`, a two-pane live inbox. Both sides reuse `MessageThread`; customer state lives in the `useSupportChat` hook (`src/hooks/use-support-chat.ts`).

### Data model

- `support_conversations` — `user_id`, `subject`, `status open|pending|closed`, plus denormalized `last_message_at/preview` and `user_unread_count` / `admin_unread_count`.
- `support_messages` — append-only (`conversation_id`, `sender_id`, `sender_role`, `body`).

### Integrity by trigger, not by trust

Messages are inserted directly by clients under RLS (chat is high-frequency, low-privilege). Two triggers keep it honest:

1. `support_message_set_sender` (BEFORE INSERT) — overwrites `sender_id` with `auth.uid()` and derives `sender_role` from `is_admin()`, so a customer can never forge an admin message.
2. `support_conversation_bump` (AFTER INSERT) — maintains preview/ordering, increments the *other* side's unread counter, and drives status: a customer message always (re)opens the conversation; an admin reply moves `open → pending`.

RLS: customers select/insert/update only their own conversations (update exists to zero their own unread counter); admins see and update everything; messages have no UPDATE/DELETE for anyone. Conversation status changes are deliberately not audited (not destructive); the edge function keeps `set_conversation_status` as an audited fallback.

### Realtime

Both tables are added to the `supabase_realtime` publication (guarded in `schema.sql`); `postgres_changes` events are authorized per-socket against RLS. Channels (`src/lib/support-realtime.ts`): `support-conv-<id>` for an open thread, `support-user-badge-<uid>` for the customer badge, `support-admin-inbox` / `support-admin-badge` for the admin side. Because admin delivery of other users' rows depends on RLS-authorized sockets, the inbox also refetches every 15 s and on tab focus as a defensive fallback. Handlers dedupe inserts by message id against optimistic local sends.

### Demo mode

`mockSupport.ts` seeds conversations for the demo persona; sending in demo appends locally and a canned admin auto-reply lands after 1.5 s. The admin inbox renders the same dataset from the agent side.

---

## Key Design Decisions

**No state library.** The app is small enough that `App.tsx` as a single state container (with selective prop passing) is simpler than Redux or Zustand. Cross-cutting state (`sites`, `plugins`, `pluginPurchases`) lives at the root; page-local data (`billing`, `plans`, etc.) lives inside each page's own `useState`.

**Mock-first rendering.** All pages render immediately from typed mock constants. Supabase data replaces the mock only when a session exists and the query succeeds. This means the UI is always functional — even without credentials, even if Supabase is down.

**Repository layer owns snake\_case → camelCase.** DB columns use snake\_case (Postgres convention); TypeScript types use camelCase (JS convention). The mapper in each `src/lib/db/*.ts` file handles the conversion explicitly, keeping components unaware of DB naming.

**`supabase` is nullable by design.** The client is `null` when env vars are absent. All callers guard with `if (!supabase) return` before any DB call. Inside async `.then()` callbacks the non-null reference is captured in a local `const sb = supabase` to satisfy TypeScript narrowing.

**Provisioner uses executor injection.** The shared provisioner depends on a `WhmRequestExecutor` interface rather than `fetch` directly. `MOCK_WHM_REQUESTS=true` swaps in `createMockWhmExecutor()` so the whole pipeline (including the atomic slot RPCs) can run against a staging project with no WHM server.

**Server code never enters the client bundle.** Everything that touches `SUPABASE_SERVICE_ROLE_KEY`, `WHM_MASTER_TOKEN`, or `PAYSTACK_SECRET_KEY` lives under `supabase/functions/`, which is outside the Vite `src/` include.

**Schema is idempotent.** `schema.sql` uses `if not exists` guards on all enum types and tables so it can be re-run safely against an existing database. `seed.sql` uses `on conflict do nothing` for the same reason.
