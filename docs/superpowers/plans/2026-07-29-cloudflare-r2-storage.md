# Cloudflare R2 Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Cloudflare R2 object storage to Maxmark Host — real plugin/theme ZIP downloads, chat attachments, and user avatars — all via presigned URLs issued by Supabase Edge Functions.

**Architecture:** Two R2 buckets (`maxmark-private`, `maxmark-public`) behind a shared `aws4fetch`-based signing helper. A new `storage` Edge Function issues short-lived presigned PUT/GET URLs after authorizing the caller (JWT + ownership/role checks); the browser then talks to R2 directly. `admin-actions` gains one more action for admin-initiated plugin uploads. Demo mode (no Supabase config) is untouched — jszip mock downloads, local object-URL attachments, local-preview avatars.

**Tech Stack:** Supabase Edge Functions (Deno, `npm:aws4fetch`), Postgres/RLS (existing), React 19 + TypeScript (existing), no new frontend dependencies.

## Global Constraints

- Root `npm run typecheck` / `npm run build` / `npm run lint` only cover `src/` — `supabase/functions/**` is Deno-only and not type-checked by the root TS project (confirmed: `tsconfig.app.json` scopes to `src`). Every Edge Function task is verified by static review + pattern consistency with `supabase/functions/verify-payment/index.ts` and `supabase/functions/admin-actions/index.ts`, not by a local test run — there is no `supabase/config.toml` (no local Supabase stack linked) and no `deno` binary on this machine.
- No new npm dependency for the frontend. `aws4fetch` is imported Edge-Function-side only, via `npm:aws4fetch@^4` (same specifier style as `npm:@supabase/supabase-js@2` / `npm:zod@4` already in `verify-payment/index.ts`).
- Every schema change goes in a new `migrations/00N_*.sql` file AND is mirrored into the canonical `schema.sql` (repo convention established by `migrations/001_currency_and_node_slots.sql`'s header comment).
- Money/plugin/session code follows existing patterns exactly: `src/lib/db/*.ts` snake_case→camelCase mappers, demo-first `useEffect` + mock-fallback in every page/hook, `FunctionEnvelope<T>` / `invoke<T>` for all Edge Function calls, dark hex palette (`#121214`/`#161618`/`#232328`/`#5c4df0`) for any new UI.
- Presigned URLs are always short-lived (5 min for downloads, 10 min for uploads) and scoped to one key — never returned or cached beyond the triggering action.
- Secrets (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PRIVATE_BUCKET`, `R2_PUBLIC_BUCKET`, `R2_PUBLIC_BASE_URL`) are Supabase Edge Function secrets only — never referenced from `src/` or any `VITE_*` env var.

---

### Task 1: Database migration — R2-backed columns

**Files:**
- Create: `migrations/004_r2_storage.sql`
- Modify: `schema.sql` (mirror the same DDL)

**Interfaces:**
- Produces: `public.user_profiles.avatar_url` (text, nullable), `public.support_messages.attachment_key/attachment_name/attachment_size/attachment_type` (nullable), relaxed `support_messages_body_length` check allowing an attachment-only message, `public.marketplace_plugins.download_asset_path` (text, nullable). All later tasks read/write these exact column names.

- [ ] **Step 1: Write the migration file**

```sql
-- Migration 004 — Cloudflare R2 storage columns
--
-- Adds the columns needed for: user avatars, chat message attachments, and
-- marketplace plugin/theme download assets. No RLS changes required — the
-- existing owner/admin policies on user_profiles, support_messages, and
-- marketplace_plugins already cover these new columns.
--
-- Safe to run once. Re-running schema.sql afterward is idempotent.

alter table public.user_profiles
  add column if not exists avatar_url text;

alter table public.support_messages
  add column if not exists attachment_key text,
  add column if not exists attachment_name text,
  add column if not exists attachment_size integer,
  add column if not exists attachment_type text;

-- A message may now be attachment-only (empty body).
alter table public.support_messages
  drop constraint if exists support_messages_body_length,
  add constraint support_messages_body_length
    check (
      char_length(body) between 1 and 4000
      or (char_length(body) = 0 and attachment_key is not null)
    );

alter table public.marketplace_plugins
  add column if not exists download_asset_path text;

comment on column public.user_profiles.avatar_url is 'Public R2 URL (maxmark-public bucket) for the user''s avatar image.';
comment on column public.support_messages.attachment_key is 'R2 object key in maxmark-private for this message''s attachment, if any.';
comment on column public.marketplace_plugins.download_asset_path is 'R2 object key in maxmark-private for the real plugin/theme ZIP. Null means no asset uploaded yet — downloads fall back to the demo jszip mock.';
```

- [ ] **Step 2: Mirror into `schema.sql`**

Open `schema.sql` and make these three edits:

Find the `user_profiles` table definition (around line 230) and add the column right before the closing paren:

```sql
create table if not exists public.user_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  display_name text not null default '',
  account_id text not null unique,
  support_pin text not null,
  avatar_url text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);
```

Find the `support_messages` table definition (around line 325) and its length constraint, replace with:

```sql
create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.support_conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  sender_role public.support_sender_role not null,
  body text not null,
  attachment_key text,
  attachment_name text,
  attachment_size integer,
  attachment_type text,
  created_at timestamptz not null default timezone('utc', now()),
  constraint support_messages_body_length
    check (
      char_length(body) between 1 and 4000
      or (char_length(body) = 0 and attachment_key is not null)
    )
);
```

Find the `marketplace_plugins` table definition (around line 181) and add the column right before `created_at`:

```sql
  highlights jsonb not null default '[]',
  download_asset_path text,
  created_at timestamptz not null default timezone('utc', now()),
```

- [ ] **Step 3: Verify column shapes match (static check)**

Run:

```bash
grep -n "avatar_url\|attachment_key\|download_asset_path" schema.sql
```

Expected: three matches for each new column name (definition line — `user_profiles`, `support_messages`, `marketplace_plugins` — plus the `support_messages_body_length` constraint referencing `attachment_key`). Confirm no duplicate column definitions were introduced.

- [ ] **Step 4: Commit**

(This repo has no `.git` — skip commit steps for all tasks in this plan. Each task's file changes are the artifact; move directly to the next task.)

---

### Task 2: Shared R2 presigning helper

**Files:**
- Create: `supabase/functions/_shared/r2.ts`

**Interfaces:**
- Consumes: Deno env vars `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`.
- Produces: `presignPut(bucket: string, key: string, contentType: string, contentLength: number, expiresInSeconds: number): Promise<string>` and `presignGet(bucket: string, key: string, expiresInSeconds: number): Promise<string>` — both return a ready-to-use URL. Consumed by Task 3's `storage` function and Task 4's `admin-actions` addition.

- [ ] **Step 1: Write the helper**

```typescript
// supabase/functions/_shared/r2.ts
//
// Presigned-URL helper for Cloudflare R2 (S3-compatible API), using
// aws4fetch — a ~6KB Deno-native SigV4 signer, no AWS SDK needed. Mirrors
// the shared-helper pattern of cors.ts / license.ts in this same directory.

import { AwsClient } from 'npm:aws4fetch@1'

function getR2Client(): AwsClient {
  const accessKeyId = Deno.env.get('R2_ACCESS_KEY_ID')
  const secretAccessKey = Deno.env.get('R2_SECRET_ACCESS_KEY')
  if (!accessKeyId || !secretAccessKey) {
    throw new Error('R2 credentials are not configured')
  }
  return new AwsClient({
    accessKeyId,
    secretAccessKey,
    service: 's3',
    region: 'auto',
  })
}

function bucketEndpoint(bucket: string): string {
  const accountId = Deno.env.get('R2_ACCOUNT_ID')
  if (!accountId) {
    throw new Error('R2_ACCOUNT_ID is not configured')
  }
  return `https://${accountId}.r2.cloudflarestorage.com/${bucket}`
}

/**
 * Presign a PUT for a browser to upload directly to R2. Content-Length is
 * signed into the URL so R2 rejects any upload that doesn't match the
 * declared size — enforcement happens at R2, not just in client JS.
 */
export async function presignPut(
  bucket: string,
  key: string,
  contentType: string,
  contentLength: number,
  expiresInSeconds: number,
): Promise<string> {
  const client = getR2Client()
  const url = new URL(`${bucketEndpoint(bucket)}/${key}`)
  url.searchParams.set('X-Amz-Expires', String(expiresInSeconds))

  const signed = await client.sign(
    new Request(url, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(contentLength),
      },
    }),
    { aws: { signQuery: true } },
  )

  return signed.url
}

/** Presign a GET for a browser to download directly from R2. */
export async function presignGet(
  bucket: string,
  key: string,
  expiresInSeconds: number,
): Promise<string> {
  const client = getR2Client()
  const url = new URL(`${bucketEndpoint(bucket)}/${key}`)
  url.searchParams.set('X-Amz-Expires', String(expiresInSeconds))

  const signed = await client.sign(new Request(url, { method: 'GET' }), {
    aws: { signQuery: true },
  })

  return signed.url
}
```

- [ ] **Step 2: Static consistency check**

Run:

```bash
grep -n "npm:aws4fetch\|export function presign" supabase/functions/_shared/r2.ts
```

Expected: one `npm:aws4fetch@1` import line, and two `export function presign...` lines (`presignPut`, `presignGet`). This confirms the file matches the interface Task 3/4 will import.

- [ ] **Step 3: Commit**

(Skipped — no git repo, see Task 1 Step 4.)

---

### Task 3: `storage` Edge Function

**Files:**
- Create: `supabase/functions/storage/index.ts`

**Interfaces:**
- Consumes: `presignPut`/`presignGet` from `../_shared/r2.ts`; `corsHeaders`/`jsonResponse`/`errorResponse` from `../_shared/cors.ts`.
- Produces: `POST /functions/v1/storage` accepting `{ purpose: 'plugin-download' | 'chat-attachment-upload' | 'chat-attachment-download' | 'avatar-upload', ...payload }`, returning `FunctionEnvelope`-shaped JSON. Task 5 and Task 6's client bridge (`src/lib/storage.ts`) call this by name.

- [ ] **Step 1: Write the function**

```typescript
// supabase/functions/storage/index.ts
// POST /functions/v1/storage
// Body: { purpose: <discriminant>, ...payload }
//
// Issues short-lived presigned R2 URLs after authorizing the caller. Same
// trust-boundary shape as verify-payment/admin-actions: JWT -> anon client
// resolves the caller, then a service-role client does the privileged work
// (looking up ownership, bumping counters) before a URL is ever handed back.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { z } from 'npm:zod@4'

import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts'
import { presignGet, presignPut } from '../_shared/r2.ts'

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024 // 10 MB
const MAX_AVATAR_BYTES = 2 * 1024 * 1024 // 2 MB

const ATTACHMENT_CONTENT_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/pdf',
  'text/plain',
  'application/zip',
])

const AVATAR_CONTENT_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])

const bodySchema = z.discriminatedUnion('purpose', [
  z.object({
    purpose: z.literal('plugin-download'),
    pluginId: z.string().uuid(),
  }),
  z.object({
    purpose: z.literal('chat-attachment-upload'),
    conversationId: z.string().uuid(),
    fileName: z.string().min(1).max(200),
    contentType: z.string().min(1),
    contentLength: z.number().int().positive().max(MAX_ATTACHMENT_BYTES),
  }),
  z.object({
    purpose: z.literal('chat-attachment-download'),
    messageId: z.string().uuid(),
  }),
  z.object({
    purpose: z.literal('avatar-upload'),
    contentType: z.string().min(1),
    contentLength: z.number().int().positive().max(MAX_AVATAR_BYTES),
  }),
])

type Body = z.infer<typeof bodySchema>

class StorageError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

function requireEnv(name: string): string {
  const value = Deno.env.get(name)
  if (!value) throw new StorageError(`${name} is not configured`, 500)
  return value
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120)
}

function extensionFor(contentType: string): string {
  const map: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
  }
  return map[contentType] ?? 'bin'
}

async function pluginDownload(
  admin: ReturnType<typeof createClient>,
  userId: string,
  body: Extract<Body, { purpose: 'plugin-download' }>,
) {
  const { data: purchase, error: purchaseError } = await admin
    .from('plugin_purchases')
    .select('id, status')
    .eq('user_id', userId)
    .eq('plugin_id', body.pluginId)
    .eq('status', 'active')
    .maybeSingle()
  if (purchaseError) throw new StorageError(purchaseError.message, 500)
  if (!purchase) throw new StorageError('No active license for this item', 403)

  const { data: plugin, error: pluginError } = await admin
    .from('marketplace_plugins')
    .select('download_asset_path')
    .eq('id', body.pluginId)
    .single()
  if (pluginError || !plugin) throw new StorageError('Item not found', 404)
  if (!plugin.download_asset_path) {
    throw new StorageError('No uploaded asset for this item yet', 404)
  }

  const { error: bumpError } = await admin
    .from('plugin_purchases')
    .update({
      download_count: undefined, // placeholder to keep shape; real increment below
    })
    .eq('id', purchase.id)
  void bumpError // increment done via rpc-free read-modify-write below instead

  const { data: current } = await admin
    .from('plugin_purchases')
    .select('download_count')
    .eq('id', purchase.id)
    .single()
  await admin
    .from('plugin_purchases')
    .update({
      download_count: Number(current?.download_count ?? 0) + 1,
      last_downloaded_at: new Date().toISOString(),
    })
    .eq('id', purchase.id)

  const url = await presignGet(
    requireEnv('R2_PRIVATE_BUCKET'),
    plugin.download_asset_path,
    300,
  )
  return { downloadUrl: url }
}

async function chatAttachmentUpload(
  admin: ReturnType<typeof createClient>,
  userId: string,
  isAdmin: boolean,
  body: Extract<Body, { purpose: 'chat-attachment-upload' }>,
) {
  if (!ATTACHMENT_CONTENT_TYPES.has(body.contentType)) {
    throw new StorageError('Unsupported attachment type', 400)
  }

  const { data: conversation, error } = await admin
    .from('support_conversations')
    .select('id, user_id')
    .eq('id', body.conversationId)
    .single()
  if (error || !conversation) throw new StorageError('Conversation not found', 404)
  if (conversation.user_id !== userId && !isAdmin) {
    throw new StorageError('Not authorized for this conversation', 403)
  }

  const key = `support/${body.conversationId}/${crypto.randomUUID()}-${sanitizeFileName(body.fileName)}`
  const uploadUrl = await presignPut(
    requireEnv('R2_PRIVATE_BUCKET'),
    key,
    body.contentType,
    body.contentLength,
    600,
  )
  return { key, uploadUrl }
}

async function chatAttachmentDownload(
  admin: ReturnType<typeof createClient>,
  userId: string,
  isAdmin: boolean,
  body: Extract<Body, { purpose: 'chat-attachment-download' }>,
) {
  const { data: message, error } = await admin
    .from('support_messages')
    .select('attachment_key, conversation_id, support_conversations!inner(user_id)')
    .eq('id', body.messageId)
    .single()
  if (error || !message || !message.attachment_key) {
    throw new StorageError('Attachment not found', 404)
  }
  const ownerId = (
    message.support_conversations as unknown as { user_id: string }
  ).user_id
  if (ownerId !== userId && !isAdmin) {
    throw new StorageError('Not authorized for this attachment', 403)
  }

  const url = await presignGet(requireEnv('R2_PRIVATE_BUCKET'), message.attachment_key, 300)
  return { downloadUrl: url }
}

async function avatarUpload(
  userId: string,
  body: Extract<Body, { purpose: 'avatar-upload' }>,
) {
  if (!AVATAR_CONTENT_TYPES.has(body.contentType)) {
    throw new StorageError('Unsupported avatar type', 400)
  }
  const key = `avatars/${userId}.${extensionFor(body.contentType)}`
  const uploadUrl = await presignPut(
    requireEnv('R2_PUBLIC_BUCKET'),
    key,
    body.contentType,
    body.contentLength,
    600,
  )
  const publicUrl = `${requireEnv('R2_PUBLIC_BASE_URL').replace(/\/$/, '')}/${key}`
  return { uploadUrl, publicUrl }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (request.method !== 'POST') {
    return errorResponse('Method not allowed', 405)
  }

  const authHeader = request.headers.get('Authorization')
  if (!authHeader) {
    return errorResponse('Missing Authorization header', 401)
  }

  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )
  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser()
  if (userError || !user) {
    return errorResponse('Invalid or expired session', 401)
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const { data: roleRows } = await admin
    .from('user_roles')
    .select('id')
    .eq('user_id', user.id)
    .eq('role', 'admin')
    .limit(1)
  const isAdmin = (roleRows?.length ?? 0) > 0

  let body: Body
  try {
    body = bodySchema.parse(await request.json())
  } catch {
    return errorResponse('Invalid request body', 400)
  }

  try {
    switch (body.purpose) {
      case 'plugin-download':
        return jsonResponse({ success: true, data: await pluginDownload(admin, user.id, body) })
      case 'chat-attachment-upload':
        return jsonResponse({
          success: true,
          data: await chatAttachmentUpload(admin, user.id, isAdmin, body),
        })
      case 'chat-attachment-download':
        return jsonResponse({
          success: true,
          data: await chatAttachmentDownload(admin, user.id, isAdmin, body),
        })
      case 'avatar-upload':
        return jsonResponse({ success: true, data: await avatarUpload(user.id, body) })
    }
  } catch (error) {
    if (error instanceof StorageError) {
      return errorResponse(error.message, error.status)
    }
    console.error(`storage ${body.purpose} failed:`, error)
    return errorResponse('Storage request failed', 500)
  }
})
```

- [ ] **Step 2: Clean up the placeholder no-op in `pluginDownload`**

The first draft above has a dead no-op update (`download_count: undefined`) left in from drafting — remove it. Replace the whole `pluginDownload` function body from the `const { error: bumpError } = ...` line through the `void bumpError` line with nothing, so the function reads:

```typescript
async function pluginDownload(
  admin: ReturnType<typeof createClient>,
  userId: string,
  body: Extract<Body, { purpose: 'plugin-download' }>,
) {
  const { data: purchase, error: purchaseError } = await admin
    .from('plugin_purchases')
    .select('id, status')
    .eq('user_id', userId)
    .eq('plugin_id', body.pluginId)
    .eq('status', 'active')
    .maybeSingle()
  if (purchaseError) throw new StorageError(purchaseError.message, 500)
  if (!purchase) throw new StorageError('No active license for this item', 403)

  const { data: plugin, error: pluginError } = await admin
    .from('marketplace_plugins')
    .select('download_asset_path')
    .eq('id', body.pluginId)
    .single()
  if (pluginError || !plugin) throw new StorageError('Item not found', 404)
  if (!plugin.download_asset_path) {
    throw new StorageError('No uploaded asset for this item yet', 404)
  }

  const { data: current } = await admin
    .from('plugin_purchases')
    .select('download_count')
    .eq('id', purchase.id)
    .single()
  await admin
    .from('plugin_purchases')
    .update({
      download_count: Number(current?.download_count ?? 0) + 1,
      last_downloaded_at: new Date().toISOString(),
    })
    .eq('id', purchase.id)

  const url = await presignGet(
    requireEnv('R2_PRIVATE_BUCKET'),
    plugin.download_asset_path,
    300,
  )
  return { downloadUrl: url }
}
```

- [ ] **Step 3: Static consistency check**

Run:

```bash
grep -n "case '\|Deno.serve\|bodySchema.parse" supabase/functions/storage/index.ts
```

Expected: four `case '...'` lines matching the four `purpose` values in `bodySchema`, one `Deno.serve` line, one `bodySchema.parse` line. This confirms the switch covers every discriminated-union member (a missing case would be a silent `undefined` response).

- [ ] **Step 4: Commit**

(Skipped — no git repo, see Task 1 Step 4.)

---

### Task 4: `admin-actions` gains `get_plugin_upload_url`; client bridges for both functions

**Files:**
- Modify: `supabase/functions/admin-actions/index.ts`
- Modify: `src/lib/functions.ts`
- Create: `src/lib/storage.ts`

**Interfaces:**
- Consumes: `presignPut` from `../_shared/r2.ts` (admin-actions side); `invoke<T>` pattern already in `functions.ts` (client side).
- Produces: `AdminAction` union gains `{ action: 'get_plugin_upload_url'; pluginId: string; version: string; fileName: string; contentLength: number }` returning `{ uploadUrl: string; key: string }`. `src/lib/storage.ts` exports `getPluginDownloadUrl(supabase, pluginId): Promise<string>`, `uploadChatAttachment(supabase, conversationId, file): Promise<{ key: string; name: string; size: number; type: string }>`, `getChatAttachmentUrl(supabase, messageId): Promise<string>`, `uploadAvatar(supabase, file): Promise<string>` (returns the public URL). Task 5, 6, 7 import from here.

- [ ] **Step 1: Add the import and Zod variant to `admin-actions/index.ts`**

At the top of `supabase/functions/admin-actions/index.ts`, add the R2 import next to the existing ones:

```typescript
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { z } from 'npm:zod@4'

import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts'
import { presignPut } from '../_shared/r2.ts'
```

In the `bodySchema` discriminated union, add a new member right after the `set_conversation_status` entry (before the closing `])`):

```typescript
  z.object({
    action: z.literal('set_conversation_status'),
    conversationId: z.string().uuid(),
    status: z.enum(['open', 'pending', 'closed']),
  }),
  z.object({
    action: z.literal('get_plugin_upload_url'),
    pluginId: z.string().uuid(),
    version: z.string().min(1).max(40),
    fileName: z.string().min(1).max(200),
    contentLength: z.number().int().positive().max(50 * 1024 * 1024),
  }),
])
```

Also add `downloadAssetPath` as an optional field to the existing `upsert_plugin` schema member — find:

```typescript
  z.object({
    action: z.literal('upsert_plugin'),
    id: z.string().uuid().optional(),
    slug: z.string().min(1).max(100),
```

and add right after `id: z.string().uuid().optional(),`:

```typescript
    downloadAssetPath: z.string().max(500).optional(),
```

- [ ] **Step 2: Add the handler function**

Add this function near the other action handlers (e.g. right after `setConversationStatus`):

```typescript
function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120)
}

async function getPluginUploadUrl(
  body: Extract<ActionBody, { action: 'get_plugin_upload_url' }>,
): Promise<ActionOutcome> {
  const bucket = Deno.env.get('R2_PRIVATE_BUCKET')
  if (!bucket) throw new ActionError('R2_PRIVATE_BUCKET is not configured', 500)

  const key = `plugins/${body.pluginId}/${body.version}/${sanitizeFileName(body.fileName)}`
  const uploadUrl = await presignPut(bucket, key, 'application/zip', body.contentLength, 600)
  return ok({ uploadUrl, key }, 'plugin', body.pluginId)
}
```

- [ ] **Step 3: Wire the new action into `upsertPlugin` and the dispatch switch**

In the `upsertPlugin` function, find the `row` object literal and add `download_asset_path` right after `installs_label: body.installsLabel,`:

```typescript
  const row = {
    slug: body.slug,
    name: body.name,
    tagline: body.tagline,
    description: body.description,
    category: body.category,
    product_type: body.productType,
    tier: body.tier,
    version: body.version,
    requires_wordpress: body.requiresWordpress,
    requires_php: body.requiresPhp,
    price_ngn: body.priceNgn,
    status: body.status,
    featured: body.featured,
    installs_label: body.installsLabel,
    download_asset_path: body.downloadAssetPath ?? null,
  }
```

In the `Deno.serve` handler's `switch (body.action)`, add a case right after `case 'set_conversation_status':`:

```typescript
      case 'get_plugin_upload_url':
        outcome = await getPluginUploadUrl(body)
        break
```

Add `'get_plugin_upload_url'` to the `auditableActions` set (it's a privileged action worth auditing, unlike `list_users`):

```typescript
const auditableActions = new Set<ActionBody['action']>([
  'adjust_credit',
  'set_site_status',
  'create_node',
  'update_node',
  'create_invoice',
  'set_invoice_status',
  'upsert_plugin',
  'set_purchase_status',
  'set_conversation_status',
  'get_plugin_upload_url',
])
```

- [ ] **Step 4: Static consistency check on `admin-actions`**

Run:

```bash
grep -n "get_plugin_upload_url\|downloadAssetPath\|download_asset_path" supabase/functions/admin-actions/index.ts
```

Expected: matches in the Zod union, the `getPluginUploadUrl` function, the switch case, the `auditableActions` set, `upsert_plugin`'s new field, and the `row` object — six or more hits, none in a place that would leave the union member unhandled.

- [ ] **Step 5: Add the `AdminAction` variant and `downloadAssetPath` field to `src/lib/functions.ts`**

Find the `upsert_plugin` member of `export type AdminAction` and add the field right after `id?: string`:

```typescript
  | {
      action: 'upsert_plugin'
      id?: string
      downloadAssetPath?: string
      slug: string
```

Add a new union member right after the `set_conversation_status` member (before the closing `type AdminAction =` union ends):

```typescript
  | {
      action: 'get_plugin_upload_url'
      pluginId: string
      version: string
      fileName: string
      contentLength: number
    }
```

- [ ] **Step 6: Create `src/lib/storage.ts`**

```typescript
// Typed client bridge to the `storage` Edge Function — presigned R2 URLs
// for plugin downloads, chat attachments, and avatars. Mirrors the
// invoke<T>/FunctionEnvelope pattern in src/lib/functions.ts.

import type { SupabaseClient } from '@supabase/supabase-js'

interface FunctionEnvelope<T> {
  success: boolean
  data?: T
  error?: string
}

async function invokeStorage<T>(
  supabase: SupabaseClient,
  body: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke<FunctionEnvelope<T>>('storage', {
    body,
  })
  if (error) throw new Error(`storage failed: ${error.message}`)
  if (!data?.success || data.data === undefined) {
    throw new Error(data?.error ?? 'storage returned no data')
  }
  return data.data
}

export async function getPluginDownloadUrl(
  supabase: SupabaseClient,
  pluginId: string,
): Promise<string> {
  const { downloadUrl } = await invokeStorage<{ downloadUrl: string }>(supabase, {
    purpose: 'plugin-download',
    pluginId,
  })
  return downloadUrl
}

export interface UploadedAttachment {
  key: string
  name: string
  size: number
  type: string
}

export async function uploadChatAttachment(
  supabase: SupabaseClient,
  conversationId: string,
  file: File,
): Promise<UploadedAttachment> {
  const { key, uploadUrl } = await invokeStorage<{ key: string; uploadUrl: string }>(
    supabase,
    {
      purpose: 'chat-attachment-upload',
      conversationId,
      fileName: file.name,
      contentType: file.type || 'application/octet-stream',
      contentLength: file.size,
    },
  )

  const putResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  })
  if (!putResponse.ok) {
    throw new Error(`Attachment upload failed (${putResponse.status})`)
  }

  return { key, name: file.name, size: file.size, type: file.type }
}

export async function getChatAttachmentUrl(
  supabase: SupabaseClient,
  messageId: string,
): Promise<string> {
  const { downloadUrl } = await invokeStorage<{ downloadUrl: string }>(supabase, {
    purpose: 'chat-attachment-download',
    messageId,
  })
  return downloadUrl
}

export async function uploadAvatar(supabase: SupabaseClient, file: File): Promise<string> {
  const { uploadUrl, publicUrl } = await invokeStorage<{
    uploadUrl: string
    publicUrl: string
  }>(supabase, {
    purpose: 'avatar-upload',
    contentType: file.type,
    contentLength: file.size,
  })

  const putResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  })
  if (!putResponse.ok) {
    throw new Error(`Avatar upload failed (${putResponse.status})`)
  }

  return publicUrl
}

export async function getPluginUploadUrl(
  supabase: SupabaseClient,
  pluginId: string,
  version: string,
  file: File,
): Promise<{ uploadUrl: string; key: string }> {
  const { data, error } = await supabase.functions.invoke<
    FunctionEnvelope<{ uploadUrl: string; key: string }>
  >('admin-actions', {
    body: {
      action: 'get_plugin_upload_url',
      pluginId,
      version,
      fileName: file.name,
      contentLength: file.size,
    },
  })
  if (error) throw new Error(`admin-actions failed: ${error.message}`)
  if (!data?.success || data.data === undefined) {
    throw new Error(data?.error ?? 'admin-actions returned no data')
  }
  return data.data
}
```

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: PASS (no output beyond the script banner) — `src/lib/functions.ts` and `src/lib/storage.ts` compile.

- [ ] **Step 8: Commit**

(Skipped — no git repo, see Task 1 Step 4.)

---

### Task 5: Marketplace — real download path + admin ZIP upload

**Files:**
- Modify: `src/types/marketplace.ts`
- Modify: `src/lib/db/marketplace.ts`
- Modify: `src/lib/db/admin.ts`
- Modify: `src/services/marketplaceService.ts`
- Modify: `src/pages/admin/admin-marketplace.tsx`

**Interfaces:**
- Consumes: `getPluginDownloadUrl`, `getPluginUploadUrl` from `src/lib/storage.ts` (Task 4).
- Produces: `MarketplacePlugin.downloadAssetPath?: string`; `downloadMarketplacePlugin` now takes an optional `supabase` param and prefers the real asset when present.

- [ ] **Step 1: Add `downloadAssetPath` to the type**

In `src/types/marketplace.ts`, add the field to `MarketplacePlugin` right after `highlights: string[]`:

```typescript
export interface MarketplacePlugin {
  id: string
  slug: string
  name: string
  tagline: string
  description: string
  category: PluginCategory
  productType: ProductType
  tier: MarketplaceTier
  version: string
  requiresWordPress: string
  requiresPhp: string
  priceNgn: number
  featured: boolean
  rating: number
  installsLabel: string
  gradient: string
  highlights: string[]
  downloadAssetPath: string | null
}
```

- [ ] **Step 2: Map the DB column in `src/lib/db/marketplace.ts`**

Add `download_asset_path: string | null` to the `DbPluginRow` interface (right after `highlights: string[]`):

```typescript
interface DbPluginRow {
  id: string
  slug: string
  name: string
  tagline: string
  description: string
  category: string
  product_type: string
  tier: number
  version: string
  requires_wordpress: string
  requires_php: string
  price_ngn: number
  featured: boolean
  rating: number
  installs_label: string
  gradient: string
  highlights: string[]
  status: string
  download_asset_path: string | null
}
```

Add the mapped field in `mapDbPluginToMarketplacePlugin`'s returned object, right after `highlights: Array.isArray(row.highlights) ? row.highlights : [],`:

```typescript
    highlights: Array.isArray(row.highlights) ? row.highlights : [],
    downloadAssetPath: row.download_asset_path,
```

- [ ] **Step 3: Add `downloadAssetPath` to `AdminPluginRow` in `src/lib/db/admin.ts`**

Find `export interface AdminPluginRow` and add the field after `installsLabel: string`:

```typescript
export interface AdminPluginRow {
  id: string
  slug: string
  name: string
  tagline: string
  description: string
  category: string
  productType: string
  tier: number
  version: string
  requiresWordpress: string
  requiresPhp: string
  priceNgn: number
  status: 'active' | 'draft'
  featured: boolean
  rating: number
  installsLabel: string
  downloadAssetPath: string | null
  createdAt: string
}
```

In `fetchAdminPlugins`'s mapping, add the field to the returned object right after `installsLabel: r.installs_label as string,`:

```typescript
    installsLabel: r.installs_label as string,
    downloadAssetPath: (r.download_asset_path as string | null) ?? null,
```

- [ ] **Step 4: Typecheck (expect controlled failures, then fix call sites)**

Run: `npm run typecheck`
Expected: FAIL — `src/data/mockAdmin.ts`'s `mockAdminPlugins` array and any other object literals satisfying `AdminPluginRow`/`MarketplacePlugin` are now missing the required `downloadAssetPath` field.

- [ ] **Step 5: Fix `src/data/mockAdmin.ts`**

Add `downloadAssetPath: null,` to every object in the `mockAdminPlugins` array (there are three plugins in that array — `mock-plg-1`, `mock-plg-2`, `mock-plg-3`). For each, add the field right after its `createdAt` line... actually add it right after `installsLabel:` for consistency with the type's field order:

```typescript
    installsLabel: '12k+ installs',
    downloadAssetPath: null,
    createdAt: daysAgo(300),
```

Repeat for the other two entries in the array (using their respective `installsLabel` values), each getting `downloadAssetPath: null,` inserted right after.

- [ ] **Step 6: Fix `src/data/mockMarketplace.ts`**

This file's `marketplacePlugins` array has 7 objects, each ending with a `highlights: [...]` array as its last field before the closing `},`. Add `downloadAssetPath: null,` immediately after the closing `],` of each object's `highlights` array — for these 7 entries, identified by `id`:

`plugin-cache-pilot` — after:
```typescript
    highlights: [
      'Edge-aware cache purge orchestration',
      'Automatic WooCommerce exclusion rules',
      'One-click warmup after deploy',
    ],
    downloadAssetPath: null,
  },
```

`plugin-checkout-forge` — after:
```typescript
    highlights: [
      'Conversion-tested checkout blocks',
      'Order bump analytics',
      'Post-purchase offer routing',
    ],
    downloadAssetPath: null,
  },
```

`plugin-seo-canvas` — after:
```typescript
    highlights: [
      'Schema presets for posts and products',
      'Internal linking suggestions',
      'SERP preview composer',
    ],
    downloadAssetPath: null,
  },
```

`plugin-shield-ops` — after:
```typescript
    highlights: [
      'File drift alerts and audit logs',
      'Risk-based login hardening',
      'Daily security digest',
    ],
    downloadAssetPath: null,
  },
```

`theme-atelier-noir` — after:
```typescript
    highlights: [
      'Gallery-first case study layouts',
      'Display typography presets',
      'Dark-room color palettes',
    ],
    downloadAssetPath: null,
  },
```

`theme-storefront-lux` — after:
```typescript
    highlights: [
      'Lookbook and collection grids',
      'Editorial product page blocks',
      'Checkout-optimized templates',
    ],
    downloadAssetPath: null,
  },
```

`theme-editorial-prime` — after:
```typescript
    highlights: [
      'Curated front-page composer',
      'Newsroom article templates',
      'Reading-experience tuning',
    ],
    downloadAssetPath: null,
  },
```

Each insertion is a one-line addition (`downloadAssetPath: null,`) right before that object's closing `},` — no other lines in the file change.

- [ ] **Step 7: Typecheck again**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 8: Update `downloadMarketplacePlugin` in `marketplaceService.ts`**

Add the import at the top of `src/services/marketplaceService.ts`:

```typescript
import { getPluginDownloadUrl } from '@/lib/storage'
import { supabase } from '@/lib/supabase'
```

Replace the `downloadMarketplacePlugin` function's opening (before the `const zip = new JSZip()` line) to try the real asset first:

```typescript
export async function downloadMarketplacePlugin(
  plugin: MarketplacePlugin,
  purchase: PluginPurchase,
) {
  if (plugin.downloadAssetPath && supabase) {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (session) {
      const downloadUrl = await getPluginDownloadUrl(supabase, plugin.id)
      window.location.assign(downloadUrl)
      const downloadedAt = new Date().toISOString()
      return {
        fileName: `${plugin.slug}-${plugin.version}.zip`,
        archiveBytes: 0,
        purchase: {
          ...purchase,
          lastDownloadedAt: downloadedAt,
          updatedAt: downloadedAt,
          downloadCount: purchase.downloadCount + 1,
        } satisfies PluginPurchase,
      }
    }
  }

  const zip = new JSZip()
```

(Everything below the `const zip = new JSZip()` line stays exactly as it is today — the jszip mock remains the fallback for items with no uploaded asset, or in demo mode.)

- [ ] **Step 9: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 10: Add the upload control to the admin marketplace dialog**

In `src/pages/admin/admin-marketplace.tsx`, add imports at the top:

```typescript
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Star, Upload } from 'lucide-react'

import { mockAdminPlugins, mockAdminPurchases, mockAdminUsers } from '@/data/mockAdmin'
import {
  fetchAdminPlugins,
  fetchAdminPurchases,
  fetchAllProfiles,
  type AdminPluginRow,
  type AdminProfile,
  type AdminPurchaseRow,
} from '@/lib/db/admin'
import { adminAction } from '@/lib/functions'
import { getPluginUploadUrl } from '@/lib/storage'
import { useSession } from '@/lib/session-store'
```

Add `uploadBusy` state and an `uploadedAssetPath` slot on the form state. Add to `PluginFormState`:

```typescript
interface PluginFormState {
  id: string | null
  slug: string
  name: string
  tagline: string
  description: string
  category: string
  productType: 'plugin' | 'theme'
  tier: string
  version: string
  requiresWordpress: string
  requiresPhp: string
  priceNgn: string
  status: 'active' | 'draft'
  featured: boolean
  installsLabel: string
  downloadAssetPath: string | null
}
```

Add `downloadAssetPath: null,` to `emptyPluginForm` and to `formFromPlugin`'s return (after `installsLabel: plugin.installsLabel,`):

```typescript
const emptyPluginForm: PluginFormState = {
  id: null,
  slug: '',
  name: '',
  tagline: '',
  description: '',
  category: 'Performance',
  productType: 'plugin',
  tier: '1',
  version: '1.0.0',
  requiresWordpress: '6.5+',
  requiresPhp: '8.1+',
  priceNgn: '0',
  status: 'draft',
  featured: false,
  installsLabel: '',
  downloadAssetPath: null,
}
```

```typescript
function formFromPlugin(plugin: AdminPluginRow): PluginFormState {
  return {
    id: plugin.id,
    slug: plugin.slug,
    name: plugin.name,
    tagline: plugin.tagline,
    description: plugin.description,
    category: plugin.category,
    productType: plugin.productType === 'theme' ? 'theme' : 'plugin',
    tier: String(plugin.tier),
    version: plugin.version,
    requiresWordpress: plugin.requiresWordpress,
    requiresPhp: plugin.requiresPhp,
    priceNgn: String(plugin.priceNgn),
    status: plugin.status,
    featured: plugin.featured,
    installsLabel: plugin.installsLabel,
    downloadAssetPath: plugin.downloadAssetPath,
  }
}
```

Add `download_asset_path` to `mapFunctionPlugin`'s returned object (right after `installsLabel: (row.installs_label as string) ?? '',`):

```typescript
    installsLabel: (row.installs_label as string) ?? '',
    downloadAssetPath: (row.download_asset_path as string | null) ?? null,
```

Add `downloadAssetPath: state.downloadAssetPath ?? undefined,` inside `buildActionPayload`'s returned object (right after `installsLabel: state.installsLabel.trim(),`):

```typescript
  function buildActionPayload(state: PluginFormState) {
    return {
      action: 'upsert_plugin' as const,
      ...(state.id ? { id: state.id } : {}),
      slug: state.slug.trim(),
      name: state.name.trim(),
      tagline: state.tagline.trim(),
      description: state.description.trim(),
      category: state.category.trim(),
      productType: state.productType,
      tier: Number(state.tier),
      version: state.version.trim(),
      requiresWordpress: state.requiresWordpress.trim(),
      requiresPhp: state.requiresPhp.trim(),
      priceNgn: Number(state.priceNgn),
      status: state.status,
      featured: state.featured,
      installsLabel: state.installsLabel.trim(),
      downloadAssetPath: state.downloadAssetPath ?? undefined,
    }
  }
```

Inside the `AdminMarketplace` component, add upload state and a handler right after the existing `feedback` state declaration:

```typescript
  const [uploadBusy, setUploadBusy] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  async function handleZipSelected(fileList: FileList | null) {
    const file = fileList?.[0]
    if (!file || !form.id) {
      setFeedback({ kind: 'error', text: 'Save the item once before uploading its ZIP.' })
      return
    }
    if (isDemo || !supabase) {
      setForm((p) => ({ ...p, downloadAssetPath: `demo/${file.name}` }))
      setFeedback({ kind: 'demo' })
      return
    }
    setUploadBusy(true)
    setFeedback(null)
    try {
      const { key } = await getPluginUploadUrl(supabase, form.id, form.version, file)
      const putResponse = await fetch(
        (await getPluginUploadUrl(supabase, form.id, form.version, file)).uploadUrl,
        { method: 'PUT', headers: { 'Content-Type': 'application/zip' }, body: file },
      )
      if (!putResponse.ok) throw new Error(`Upload failed (${putResponse.status})`)
      setForm((p) => ({ ...p, downloadAssetPath: key }))
      setFeedback({ kind: 'ok', text: 'ZIP uploaded — save the item to attach it.' })
    } catch (error) {
      setFeedback({
        kind: 'error',
        text: error instanceof Error ? error.message : 'ZIP upload failed',
      })
    } finally {
      setUploadBusy(false)
    }
  }
```

Note: the double call to `getPluginUploadUrl` above is a bug from drafting (it presigns twice, wasting one call and getting two different keys). Fix it by presigning once:

```typescript
  async function handleZipSelected(fileList: FileList | null) {
    const file = fileList?.[0]
    if (!file || !form.id) {
      setFeedback({ kind: 'error', text: 'Save the item once before uploading its ZIP.' })
      return
    }
    if (isDemo || !supabase) {
      setForm((p) => ({ ...p, downloadAssetPath: `demo/${file.name}` }))
      setFeedback({ kind: 'demo' })
      return
    }
    setUploadBusy(true)
    setFeedback(null)
    try {
      const { key, uploadUrl } = await getPluginUploadUrl(supabase, form.id, form.version, file)
      const putResponse = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/zip' },
        body: file,
      })
      if (!putResponse.ok) throw new Error(`Upload failed (${putResponse.status})`)
      setForm((p) => ({ ...p, downloadAssetPath: key }))
      setFeedback({ kind: 'ok', text: 'ZIP uploaded — save the item to attach it.' })
    } catch (error) {
      setFeedback({
        kind: 'error',
        text: error instanceof Error ? error.message : 'ZIP upload failed',
      })
    } finally {
      setUploadBusy(false)
    }
  }
```

In the dialog JSX, add an upload row right after the "Published (active)" / "Featured" checkbox row (before the closing `</div>` of the grid, i.e. right after the `</div>` that closes the `flex items-center gap-6 sm:col-span-2` block):

```tsx
            <div className="sm:col-span-2">
              <label className={fieldLabelClass}>Plugin/theme ZIP</label>
              <div className="flex items-center gap-3">
                <input
                  accept=".zip"
                  className="hidden"
                  onChange={(e) => void handleZipSelected(e.target.files)}
                  ref={fileInputRef}
                  type="file"
                />
                <button
                  className={secondaryButtonClass}
                  disabled={uploadBusy || !form.id}
                  onClick={() => fileInputRef.current?.click()}
                  type="button"
                >
                  <Upload className="h-3.5 w-3.5 inline mr-1.5" />
                  {uploadBusy ? 'Uploading…' : 'Upload ZIP'}
                </button>
                <span className="text-[11px] text-muted-foreground truncate">
                  {form.downloadAssetPath
                    ? form.downloadAssetPath.split('/').pop()
                    : form.id
                      ? 'No asset uploaded yet — downloads use the demo mock.'
                      : 'Save the item first to enable uploads.'}
                </span>
              </div>
            </div>
```

- [ ] **Step 11: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 12: Build**

Run: `npm run build`
Expected: PASS, no new warnings beyond the pre-existing chunk-size notice.

- [ ] **Step 13: Manual verification (demo mode, no R2 configured)**

Run `npm run dev`, open `/admin/marketplace`, edit an existing item, click "Upload ZIP", pick any small file. Expected: the demo notice appears, `form.downloadAssetPath` becomes `demo/<filename>` (visible as the filename next to the button), saving the item persists it into the in-memory `plugins` list. Then open `/marketplace` as the customer and download a purchased item — expected: unchanged behavior, the jszip mock ZIP downloads (since demo `downloadAssetPath` values are never real R2 keys and the live-download branch in `downloadMarketplacePlugin` only triggers when `supabase` is configured).

- [ ] **Step 14: Commit**

(Skipped — no git repo, see Task 1 Step 4.)

---

### Task 6: Chat attachments — data layer, thread UI, both hooks

**Files:**
- Modify: `src/lib/db/support.ts`
- Modify: `src/components/support/message-thread.tsx`
- Modify: `src/hooks/use-support-chat.ts`
- Modify: `src/components/support/chat-widget.tsx`
- Modify: `src/pages/admin/admin-support.tsx`

**Interfaces:**
- Consumes: `uploadChatAttachment`, `getChatAttachmentUrl` from `src/lib/storage.ts` (Task 4).
- Produces: `SupportMessage` gains `attachment: { key; name; size; type } | null`; `sendMessage` accepts an optional 4th `attachment` argument; `MessageThread` gains an `onAttach?: (file: File) => void` prop and an `attaching?: boolean` prop; `useSupportChat` gains an `attach: (file: File) => Promise<void>` method.

- [ ] **Step 1: Extend `src/lib/db/support.ts`**

Add an `attachment` field to `SupportMessage` and update `mapMessage`:

```typescript
export interface SupportMessageAttachment {
  key: string
  name: string
  size: number
  type: string
}

export interface SupportMessage {
  id: string
  conversationId: string
  senderId: string
  senderRole: SenderRole
  body: string
  attachment: SupportMessageAttachment | null
  createdAt: string
}
```

```typescript
export function mapMessage(r: Row): SupportMessage {
  return {
    id: r.id as string,
    conversationId: r.conversation_id as string,
    senderId: r.sender_id as string,
    senderRole: r.sender_role as SenderRole,
    body: r.body as string,
    attachment: r.attachment_key
      ? {
          key: r.attachment_key as string,
          name: r.attachment_name as string,
          size: Number(r.attachment_size),
          type: r.attachment_type as string,
        }
      : null,
    createdAt: r.created_at as string,
  }
}
```

Update `sendMessage` to accept an optional attachment and insert its columns:

```typescript
export async function sendMessage(
  supabase: SupabaseClient,
  conversationId: string,
  body: string,
  attachment?: SupportMessageAttachment,
): Promise<SupportMessage> {
  const { data, error } = await supabase
    .from('support_messages')
    .insert({
      conversation_id: conversationId,
      body,
      ...(attachment
        ? {
            attachment_key: attachment.key,
            attachment_name: attachment.name,
            attachment_size: attachment.size,
            attachment_type: attachment.type,
          }
        : {}),
    })
    .select()
    .single()
  if (error) throw error
  return mapMessage(data as Row)
}
```

- [ ] **Step 2: Typecheck (expect a controlled failure)**

Run: `npm run typecheck`
Expected: FAIL — `src/data/mockSupport.ts`'s message objects are missing the new required `attachment` field.

- [ ] **Step 3: Fix `src/data/mockSupport.ts`**

Add `attachment: null,` to every object in `mockMessagesByConversation` (9 message objects across `mock-conv-1`, `mock-conv-2`, `mock-conv-3`), inserted right after each object's `body:` line. For example the first one becomes:

```typescript
    {
      id: 'mock-msg-1a',
      conversationId: 'mock-conv-1',
      senderId: DEMO_USER_ID,
      senderRole: 'user',
      body: 'Hi — my VIP plan renewal invoice is due tomorrow but our finance run is next week. Can I get a short extension?',
      attachment: null,
      createdAt: minutesAgo(60 * 26),
    },
```

Apply the same one-line insertion to the other 8 message objects in the file.

- [ ] **Step 4: Typecheck again**

Run: `npm run typecheck`
Expected: FAIL again — this time in `src/hooks/use-support-chat.ts` and `src/pages/admin/admin-support.tsx`, wherever a `SupportMessage` literal is constructed inline (the demo-mode `appendLocal`/`applyLocal` calls). Note the exact error locations reported; Steps 6 and 8 below fix them.

- [ ] **Step 5: Add attachment bubble + attach button to `MessageThread`**

In `src/components/support/message-thread.tsx`, add imports and props:

```typescript
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Paperclip, SendHorizontal } from 'lucide-react'

import type { SenderRole, SupportMessage } from '@/lib/db/support'
import { cn, formatDateLabel } from '@/lib/utils'

interface MessageThreadProps {
  messages: SupportMessage[]
  /** Which side the viewer is on — their messages render right-aligned. */
  viewerRole: SenderRole
  onSend: (body: string) => void
  onAttach?: (file: File) => void
  onOpenAttachment?: (message: SupportMessage) => void
  sending?: boolean
  attaching?: boolean
  disabled?: boolean
  disabledHint?: string
  error?: string | null
}
```

Update the function signature to destructure the new props:

```typescript
export function MessageThread({
  messages,
  viewerRole,
  onSend,
  onAttach,
  onOpenAttachment,
  sending = false,
  attaching = false,
  disabled = false,
  disabledHint,
  error,
}: MessageThreadProps) {
  const [draft, setDraft] = useState('')
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
```

Inside the message-rendering loop, add an attachment chip right after the message bubble `<div>` (before the timestamp `<span>`):

```tsx
              <div
                className={cn(
                  'rounded-lg px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap break-words',
                  isOwn
                    ? 'bg-[#5c4df0] text-white rounded-br-sm'
                    : 'bg-[#232328] text-white rounded-bl-sm',
                )}
              >
                {message.body}
              </div>
              {message.attachment ? (
                <button
                  className={cn(
                    'flex items-center gap-1.5 mt-1 px-2.5 py-1.5 rounded-md text-[11px] border transition',
                    isOwn
                      ? 'border-[#5c4df0]/40 bg-[#5c4df0]/10 text-[#a89cf7] hover:bg-[#5c4df0]/20'
                      : 'border-[#2d2d34] bg-[#1c1c1f] text-white hover:bg-[#232328]',
                  )}
                  onClick={() => onOpenAttachment?.(message)}
                  type="button"
                >
                  <Paperclip className="h-3 w-3 shrink-0" />
                  <span className="truncate max-w-[160px]">{message.attachment.name}</span>
                  <span className="text-muted-foreground shrink-0">
                    {Math.round(message.attachment.size / 1024)} KB
                  </span>
                </button>
              ) : null}
              <span className="text-[10px] text-muted-foreground mt-1">
                {message.senderRole === 'admin' ? 'Maxmark Support · ' : ''}
                {formatDateLabel(message.createdAt)}
              </span>
```

Add the attach button to the composer form (right before the send button), and the hidden file input:

```tsx
        <form
          className="flex items-end gap-2 border-t border-[#232328] bg-[#121214] px-3 py-3"
          onSubmit={handleSubmit}
        >
          {onAttach ? (
            <>
              <input
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) onAttach(file)
                  event.target.value = ''
                }}
                ref={fileInputRef}
                type="file"
              />
              <button
                aria-label="Attach a file"
                className="h-[38px] w-[38px] shrink-0 flex items-center justify-center bg-[#1c1c1f] hover:bg-[#232328] border border-[#2d2d34] rounded-md text-muted-foreground hover:text-white transition disabled:opacity-50"
                disabled={attaching}
                onClick={() => fileInputRef.current?.click()}
                type="button"
              >
                <Paperclip className="h-4 w-4" />
              </button>
            </>
          ) : null}
          <textarea
            className="flex-1 bg-[#1c1c1f] border border-[#2d2d34] rounded-md px-3 py-2 text-xs text-white placeholder:text-muted-foreground focus:outline-none focus:border-[#5c4df0]/50 transition-colors resize-none h-[38px] max-h-28"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                handleSubmit(event)
              }
            }}
            placeholder="Write a message…"
            rows={1}
            value={draft}
          />
          <button
            aria-label="Send message"
            className="h-[38px] w-[38px] shrink-0 flex items-center justify-center bg-[#5c4df0] hover:bg-[#4d3fe0] rounded-md text-white transition disabled:opacity-50"
            disabled={sending || !draft.trim()}
            type="submit"
          >
            <SendHorizontal className="h-4 w-4" />
          </button>
        </form>
```

- [ ] **Step 6: Add `attach` to `useSupportChat`**

In `src/hooks/use-support-chat.ts`, add the import and update `UseSupportChat`:

```typescript
import { uploadChatAttachment } from '@/lib/storage'
```

```typescript
export interface UseSupportChat {
  conversations: SupportConversation[]
  activeId: string | null
  messages: SupportMessage[]
  sending: boolean
  attaching: boolean
  error: string | null
  openConversation: (id: string) => void
  closeConversation: () => void
  send: (body: string) => Promise<void>
  attach: (file: File) => Promise<void>
  createCase: (subject: string, body: string) => Promise<string | null>
}
```

Add `attaching` state right after the existing `sending` state:

```typescript
  const [sending, setSending] = useState(false)
  const [attaching, setAttaching] = useState(false)
```

Fix the two demo-mode `SupportMessage` literals (in `send` and `createCase`) by adding `attachment: null,` right after each `body:` line — in `send`:

```typescript
      if (isDemo || !supabase || !session) {
        appendLocal({
          id: `demo-msg-${Date.now()}`,
          conversationId,
          senderId: DEMO_USER_ID,
          senderRole: 'user',
          body: trimmed,
          attachment: null,
          createdAt: new Date().toISOString(),
        })
        scheduleDemoReply(conversationId)
        return
      }
```

— and in `createCase`'s demo branch:

```typescript
        setMessagesByConv((prev) => ({
          ...prev,
          [conversation.id]: [
            {
              id: `demo-msg-${Date.now()}`,
              conversationId: conversation.id,
              senderId: DEMO_USER_ID,
              senderRole: 'user',
              body: trimmedBody,
              attachment: null,
              createdAt: now,
            },
          ],
        }))
```

— and in `scheduleDemoReply`'s reply object:

```typescript
        const reply: SupportMessage = {
          id: `demo-reply-${Date.now()}`,
          conversationId,
          senderId: DEMO_ADMIN_ID,
          senderRole: 'admin',
          body: cannedAdminReply,
          attachment: null,
          createdAt: new Date().toISOString(),
        }
```

Add the `attach` callback right after `send` (before `createCase`):

```typescript
  const attach = useCallback(
    async (file: File) => {
      const conversationId = activeIdRef.current
      if (!conversationId) return
      setError(null)

      if (isDemo || !supabase || !session) {
        appendLocal({
          id: `demo-attach-${Date.now()}`,
          conversationId,
          senderId: DEMO_USER_ID,
          senderRole: 'user',
          body: '',
          attachment: { key: `demo/${file.name}`, name: file.name, size: file.size, type: file.type },
          createdAt: new Date().toISOString(),
        })
        scheduleDemoReply(conversationId)
        return
      }

      setAttaching(true)
      try {
        const uploaded = await uploadChatAttachment(supabase, conversationId, file)
        const message = await sendMessage(supabase, conversationId, '', uploaded)
        appendLocal(message)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Attachment upload failed')
      } finally {
        setAttaching(false)
      }
    },
    [isDemo, session, appendLocal, scheduleDemoReply],
  )
```

Update the returned object to include the two new fields:

```typescript
  return {
    conversations,
    activeId,
    messages: activeId ? (messagesByConv[activeId] ?? []) : [],
    sending,
    attaching,
    error,
    openConversation,
    closeConversation,
    send,
    attach,
    createCase,
  }
```

- [ ] **Step 7: Wire `chat-widget.tsx`**

In `src/components/support/chat-widget.tsx`, add the import:

```typescript
import { getChatAttachmentUrl } from '@/lib/storage'
import { supabase } from '@/lib/supabase'
```

Add an `openAttachment` handler inside the component, right after `backToList`:

```typescript
  async function openAttachment(message: Parameters<NonNullable<typeof handleOpenAttachment>>[0]) {
    void message
  }
```

Replace that placeholder with the real handler (a message-typed parameter, not a generic extraction — write it directly):

```typescript
  async function handleOpenAttachment(message: { attachment: { key: string } | null }) {
    if (!message.attachment) return
    if (isDemo || !supabase) return // demo attachments have no real URL to open
    const url = await getChatAttachmentUrl(supabase, message.attachment.key)
    window.open(url, '_blank', 'noopener,noreferrer')
  }
```

Wait — `getChatAttachmentUrl` takes a `messageId`, not an attachment key (per Task 3/4's `chat-attachment-download` purpose, which looks up the message by id). Fix the handler to take the full message and use its `id`:

```typescript
  async function handleOpenAttachment(message: { id: string; attachment: unknown }) {
    if (!message.attachment) return
    if (isDemo || !supabase) return
    const url = await getChatAttachmentUrl(supabase, message.id)
    window.open(url, '_blank', 'noopener,noreferrer')
  }
```

Pass the new props to `MessageThread` in the `view === 'thread'` block:

```tsx
            {view === 'thread' ? (
              <MessageThread
                attaching={chat.attaching}
                disabled={activeConversation?.status === 'closed'}
                disabledHint="This case is closed — reply from the Support page to reopen it, or start a new case."
                error={chat.error}
                messages={chat.messages}
                onAttach={(file) => void chat.attach(file)}
                onOpenAttachment={(message) => void handleOpenAttachment(message)}
                onSend={(body) => void chat.send(body)}
                sending={chat.sending}
                viewerRole="user"
              />
            ) : null}
```

- [ ] **Step 8: Wire `admin-support.tsx`**

In `src/pages/admin/admin-support.tsx`, add imports:

```typescript
import { uploadChatAttachment, getChatAttachmentUrl } from '@/lib/storage'
```

Fix the two demo-mode `SupportMessage` literals the same way as Task 6 Step 6 — in `handleSend`'s `isDemo` branch, add `attachment: null,` right after `body,`:

```typescript
    if (isDemo || !supabase || !session) {
      applyLocal({
        id: `demo-admin-msg-${Date.now()}`,
        conversationId,
        senderId: DEMO_ADMIN_ID,
        senderRole: 'admin',
        body,
        attachment: null,
        createdAt: new Date().toISOString(),
      })
      setShowDemoNotice(true)
      return
    }
```

Add an `attaching` state and a `handleAttach` function right after `handleSend`:

```typescript
  const [attaching, setAttaching] = useState(false)

  async function handleAttach(file: File) {
    const conversationId = activeIdRef.current
    if (!conversationId) return
    setError(null)

    if (isDemo || !supabase || !session) {
      applyLocal({
        id: `demo-admin-attach-${Date.now()}`,
        conversationId,
        senderId: DEMO_ADMIN_ID,
        senderRole: 'admin',
        body: '',
        attachment: { key: `demo/${file.name}`, name: file.name, size: file.size, type: file.type },
        createdAt: new Date().toISOString(),
      })
      setShowDemoNotice(true)
      return
    }

    setAttaching(true)
    try {
      const uploaded = await uploadChatAttachment(supabase, conversationId, file)
      const message = await sendMessage(supabase, conversationId, '', uploaded)
      applyLocal(message)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Attachment upload failed')
    } finally {
      setAttaching(false)
    }
  }

  async function handleOpenAttachment(message: SupportMessage) {
    if (!message.attachment) return
    if (isDemo || !supabase) return
    const url = await getChatAttachmentUrl(supabase, message.id)
    window.open(url, '_blank', 'noopener,noreferrer')
  }
```

Pass the new props to the `MessageThread` in the thread pane:

```tsx
              <MessageThread
                attaching={attaching}
                error={error}
                messages={activeMessages}
                onAttach={(file) => void handleAttach(file)}
                onOpenAttachment={(message) => void handleOpenAttachment(message)}
                onSend={(body) => void handleSend(body)}
                sending={sending}
                viewerRole="admin"
              />
```

- [ ] **Step 9: Typecheck**

Run: `npm run typecheck`
Expected: PASS. If `chat-widget.tsx`'s placeholder `openAttachment` function from the middle of Step 7 was left in by mistake, delete it — only `handleOpenAttachment` should remain.

- [ ] **Step 10: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 11: Manual verification (demo mode)**

Run `npm run dev`. On `/support`, open the floating widget, open a conversation, click the paperclip, pick a small image. Expected: an attachment chip appears in the thread with the filename and a KB size; the canned auto-reply still fires after ~1.5s. Repeat on `/admin/support` from the agent side. Expected: same attachment-chip behavior; clicking a demo attachment chip does nothing (no real URL exists in demo mode) — confirm no console error is thrown (the `if (isDemo || !supabase) return` guard should prevent the call).

- [ ] **Step 12: Commit**

(Skipped — no git repo, see Task 1 Step 4.)

---

### Task 7: Avatars — own-profile fetch, header upload, admin list rendering

**Files:**
- Modify: `src/lib/session-store.ts`
- Modify: `src/lib/session-context.tsx`
- Modify: `src/layouts/dashboard-shell.tsx`
- Modify: `supabase/functions/admin-actions/index.ts` (list_users gains avatar_url)
- Modify: `src/lib/functions.ts` (`AdminListedUser` gains `avatarUrl`)
- Modify: `src/pages/admin/admin-users.tsx`

**Interfaces:**
- Consumes: `uploadAvatar` from `src/lib/storage.ts` (Task 4).
- Produces: `SessionContextValue` gains `avatarUrl: string | null` and `setAvatarUrl: (url: string | null) => void`. `AdminListedUser` gains `avatarUrl: string | null`.

- [ ] **Step 1: Extend `SessionContextValue` in `src/lib/session-store.ts`**

Add the two fields to the interface, right after `isDemo`:

```typescript
export interface SessionContextValue {
  session: Session | null
  /** True when the signed-in user holds the 'admin' role in user_roles. */
  isAdmin: boolean
  /** True when Supabase env vars are absent and the app runs on mock data. */
  isDemo: boolean
  /** The signed-in user's avatar (R2 public URL), if one has been uploaded. */
  avatarUrl: string | null
  setAvatarUrl: (url: string | null) => void
  /**
   * False until the admin-role lookup for the current session settles.
   * Route guards wait on this to avoid redirecting mid-lookup.
   */
  roleResolved: boolean
  /** Sum of the signed-in user's unread support messages (customer side). */
  supportUnread: number
  setSupportUnread: (count: number) => void
  /** Sum of unread customer messages across conversations (admin side). */
  adminSupportUnread: number
  setAdminSupportUnread: (count: number) => void
}
```

- [ ] **Step 2: Fetch the avatar in `src/lib/session-context.tsx`**

Add `avatarUrl` state right after `isAdmin`:

```typescript
  const [isAdmin, setIsAdmin] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
```

In the `resolveRole` function, fetch the avatar alongside the role check — replace the function with:

```typescript
    async function resolveRole(next: Session | null) {
      if (!next) {
        if (!cancelled) {
          setIsAdmin(false)
          setAvatarUrl(null)
          setRoleResolved(true)
        }
        return
      }
      try {
        const [roleRes, profileRes] = await Promise.all([
          sb
            .from('user_roles')
            .select('role')
            .eq('user_id', next.user.id)
            .eq('role', 'admin')
            .limit(1),
          sb.from('user_profiles').select('avatar_url').eq('user_id', next.user.id).maybeSingle(),
        ])
        if (roleRes.error) throw roleRes.error
        if (!cancelled) {
          setIsAdmin((roleRes.data?.length ?? 0) > 0)
          setAvatarUrl((profileRes.data?.avatar_url as string | null | undefined) ?? null)
        }
      } catch (error) {
        console.warn('Admin role lookup failed; treating as non-admin:', error)
        if (!cancelled) {
          setIsAdmin(false)
          setAvatarUrl(null)
        }
      } finally {
        if (!cancelled) setRoleResolved(true)
      }
    }
```

Add `avatarUrl` and `setAvatarUrl` to the context value at the bottom of the provider:

```typescript
  return (
    <SessionContext.Provider
      value={{
        session,
        isAdmin,
        isDemo,
        avatarUrl,
        setAvatarUrl,
        roleResolved,
        supportUnread,
        setSupportUnread,
        adminSupportUnread,
        setAdminSupportUnread,
      }}
    >
      {children}
    </SessionContext.Provider>
  )
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Add the avatar upload dialog to the header**

In `src/layouts/dashboard-shell.tsx`, add imports at the top (alongside existing ones):

```typescript
import { useRef, useState } from 'react'
import { uploadAvatar } from '@/lib/storage'
import { supabase } from '@/lib/supabase'
```

Destructure the new context fields:

```typescript
  const { session, isAdmin, isDemo, supportUnread, avatarUrl, setAvatarUrl } = useSession()
```

Add avatar-upload state and a handler right after the existing `clientInitials` computation:

```typescript
  const [avatarBusy, setAvatarBusy] = useState(false)
  const avatarInputRef = useRef<HTMLInputElement | null>(null)

  async function handleAvatarSelected(fileList: FileList | null) {
    const file = fileList?.[0]
    if (!file) return
    if (isDemo || !supabase || !session) {
      setAvatarUrl(URL.createObjectURL(file))
      return
    }
    setAvatarBusy(true)
    try {
      const publicUrl = await uploadAvatar(supabase, file)
      await supabase
        .from('user_profiles')
        .update({ avatar_url: publicUrl })
        .eq('user_id', session.user.id)
      setAvatarUrl(publicUrl)
    } catch (error) {
      console.warn('Avatar upload failed:', error)
    } finally {
      setAvatarBusy(false)
    }
  }
```

Replace the profile-chip markup to use the avatar when present and trigger the file picker on click:

```tsx
            <div className="flex items-center gap-3">
              <input
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => void handleAvatarSelected(e.target.files)}
                ref={avatarInputRef}
                type="file"
              />
              <button
                className="flex items-center gap-2 border border-[#2d2d34] bg-[#161619] rounded-md px-3 py-1.5 hover:bg-[#202024] transition duration-150 select-none disabled:opacity-60"
                disabled={avatarBusy}
                onClick={() => avatarInputRef.current?.click()}
                title="Click to change your avatar"
                type="button"
              >
                {avatarUrl ? (
                  <img
                    alt=""
                    className="h-5 w-5 rounded-full object-cover"
                    src={avatarUrl}
                  />
                ) : (
                  <div className="h-5 w-5 bg-zinc-700 rounded-full flex items-center justify-center text-[10px] font-bold text-white uppercase">
                    {clientInitials}
                  </div>
                )}
                <span className="text-xs font-semibold text-white">
                  {avatarBusy ? 'Uploading…' : `Hi, ${clientName}`}
                </span>
              </button>
            </div>
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Surface avatars in the admin console**

In `supabase/functions/admin-actions/index.ts`'s `listUsers` function, add `avatar_url` to the `user_profiles` select and to the mapped `users` output. Find:

```typescript
  const [profilesRes, sitesRes, plansRes] = await Promise.all([
    admin.from('user_profiles').select('*').in('user_id', userIds),
```

This already selects `*`, so no query change is needed — `avatar_url` is already included in `profile`. Add it to the mapped object, right after `supportPin`:

```typescript
  const users = data.users.map((u) => {
    const profile = profileByUser.get(u.id)
    return {
      userId: u.id,
      email: u.email ?? '',
      displayName: (profile?.display_name as string | undefined) ?? '',
      accountId: (profile?.account_id as string | undefined) ?? '',
      supportPin: (profile?.support_pin as string | undefined) ?? '',
      avatarUrl: (profile?.avatar_url as string | undefined) ?? null,
      createdAt: u.created_at,
      lastSignInAt: u.last_sign_in_at ?? null,
      siteCount: siteCounts.get(u.id) ?? 0,
      planCount: planCounts.get(u.id) ?? 0,
    }
  })
```

- [ ] **Step 7: Add `avatarUrl` to `AdminListedUser` in `src/lib/functions.ts`**

```typescript
export interface AdminListedUser {
  userId: string
  email: string
  displayName: string
  accountId: string
  supportPin: string
  avatarUrl: string | null
  createdAt: string
  lastSignInAt: string | null
  siteCount: number
  planCount: number
}
```

- [ ] **Step 8: Typecheck (expect a controlled failure)**

Run: `npm run typecheck`
Expected: FAIL — `src/data/mockAdmin.ts`'s `mockAdminUsers` array entries are missing the new required `avatarUrl` field (they're typed as `AdminUserSummary`, defined in `src/lib/db/admin.ts`, which extends `AdminProfile` — check whether `AdminUserSummary` needs the field too; it does not, since `AdminListedUser` is the function-response type and `AdminUserSummary` is the local-fetch type. Only fix if the compiler actually errors here — read the error output before editing).

- [ ] **Step 9: Fix compiler errors from Step 8's output**

Read the exact `npm run typecheck` error output from Step 8. If it names `src/pages/admin/admin-users.tsx` (which maps `AdminListedUser` results into rows) or any other file constructing an `AdminListedUser` literal without `avatarUrl`, add `avatarUrl: null,` (or the appropriate mapped value) at each reported location. Do not guess file paths — fix exactly what the compiler reports.

- [ ] **Step 10: Render the avatar in `admin-users.tsx`**

In `src/pages/admin/admin-users.tsx`, find the table row's customer cell (the `<td>` rendering `user.displayName || user.email`) and wrap it with an avatar circle:

```tsx
                <td className={cellClass}>
                  <div className="flex items-center gap-2.5">
                    {user.avatarUrl ? (
                      <img
                        alt=""
                        className="h-7 w-7 rounded-full object-cover shrink-0"
                        src={user.avatarUrl}
                      />
                    ) : (
                      <div className="h-7 w-7 rounded-full bg-zinc-700 flex items-center justify-center text-[10px] font-bold text-white uppercase shrink-0">
                        {(user.displayName || user.email || '?').slice(0, 2)}
                      </div>
                    )}
                    <div>
                      <p className="font-semibold text-white">
                        {user.displayName || user.email || 'Unnamed account'}
                      </p>
                      {user.email ? (
                        <p className="text-muted-foreground mt-0.5">{user.email}</p>
                      ) : null}
                    </div>
                  </div>
                </td>
```

(This replaces the existing `<td className={cellClass}>` block that currently renders just the name/email paragraphs — same content, wrapped in a flex row with the new avatar circle.)

- [ ] **Step 11: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 12: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 13: Manual verification (demo mode)**

Run `npm run dev`, open `/home`, click the header profile chip, pick a small image. Expected: the chip immediately shows the picked image (via `URL.createObjectURL`, demo-mode path) instead of initials. Open `/admin/users` — expected: existing mock users still render initials (since `mockAdminUsers`/`avatarUrl` are unset in mock data), no layout break.

- [ ] **Step 14: Commit**

(Skipped — no git repo, see Task 1 Step 4.)

---

### Task 8: Hardening — full verification, R2 setup docs

**Files:**
- Modify: `README.md` (or create if absent — check first)
- Modify: `ARCHITECTURE.md`

**Interfaces:** None — this task only verifies and documents; no new code interfaces.

- [ ] **Step 1: Check for an existing README**

Run: `ls "README.md" 2>&1 || echo "none"` from the project root. If it exists, read it before editing to match its existing structure/tone; if absent, skip README edits and only update `ARCHITECTURE.md`.

- [ ] **Step 2: Add the R2 setup section**

Add a new section (to `README.md` if it exists, otherwise to `ARCHITECTURE.md`) titled "Cloudflare R2 setup", containing:

```markdown
## Cloudflare R2 setup

Storage (marketplace ZIPs, chat attachments, avatars) uses two R2 buckets accessed via presigned URLs from Supabase Edge Functions. Nothing works until this is configured — until then, marketplace downloads use the built-in jszip mock, chat attachments/avatars are local-preview only.

1. In the Cloudflare dashboard, create two R2 buckets: `maxmark-private` and `maxmark-public`.
2. Enable public access on `maxmark-public` (custom domain or the `r2.dev` subdomain) and note the base URL.
3. Create one R2 API token scoped to Object Read & Write on both buckets. Note the Access Key ID and Secret Access Key.
4. Apply this CORS policy to both buckets (Cloudflare dashboard → bucket → Settings → CORS Policy), substituting your actual app origin(s):

   ```json
   [
     {
       "AllowedOrigins": ["https://your-app-domain.example", "http://localhost:5173"],
       "AllowedMethods": ["GET", "PUT"],
       "AllowedHeaders": ["Content-Type", "Content-Length"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

5. Set the Edge Function secrets:

   ```bash
   supabase secrets set R2_ACCOUNT_ID=<your-account-id>
   supabase secrets set R2_ACCESS_KEY_ID=<key-id>
   supabase secrets set R2_SECRET_ACCESS_KEY=<secret>
   supabase secrets set R2_PRIVATE_BUCKET=maxmark-private
   supabase secrets set R2_PUBLIC_BUCKET=maxmark-public
   supabase secrets set R2_PUBLIC_BASE_URL=<public bucket base URL from step 2>
   ```

6. Deploy the new/updated functions:

   ```bash
   supabase functions deploy storage
   supabase functions deploy admin-actions
   ```

7. Run `migrations/004_r2_storage.sql` against your database (or re-run `schema.sql`, which is idempotent and includes the same columns).
```

- [ ] **Step 3: Add a short note to `ARCHITECTURE.md`'s trust-boundary section**

Find the existing trust-boundary paragraph (added during the admin console work) and add one sentence after it:

```markdown
The same posture extends to object storage: the browser never gets direct R2 credentials — the `storage` Edge Function authorizes each upload/download (license ownership, conversation membership, or "it's your own avatar") and hands back a single short-lived presigned URL scoped to one object key.
```

- [ ] **Step 4: Full verification pass**

Run in order:

```bash
npm run typecheck
npm run lint
npm run build
```

Expected: all three PASS with no new errors or warnings beyond the pre-existing chunk-size notice on `npm run build`.

- [ ] **Step 5: End-to-end manual smoke test (demo mode — no R2/Supabase configured)**

With `npm run dev` running and no `.env` (or `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` unset):

1. `/marketplace` → download a purchased item → jszip mock ZIP downloads (unchanged from before this feature).
2. `/support` widget → attach a small file to a conversation → attachment chip renders; canned auto-reply still arrives.
3. `/admin/support` → open the same conversation → the attachment chip is visible from the admin side too.
4. `/admin/marketplace` → edit an item → "Upload ZIP" → demo notice shown, filename reflected next to the button.
5. Header profile chip → click → pick an image → chip shows the picture immediately.
6. `/admin/users` → list renders without layout breakage (initials fallback, since mock users have no `avatarUrl`).

Expected: no console errors in any of the six steps, and no behavior regresses for the flows unrelated to this feature (site provisioning, invoice payment, plugin purchase) — these were not touched by any task in this plan, so a regression here would indicate a mistake in an edit's surrounding context, not the feature itself.

- [ ] **Step 6: Commit**

(Skipped — no git repo, see Task 1 Step 4.)

---

## Self-Review Notes

**Spec coverage:** Task 1 covers the DB migration section. Task 2–3 cover the R2 helper + `storage` function (all four `purpose` values). Task 4 covers the `admin-actions` addition and both client bridges. Task 5 covers the marketplace download/upload flow end-to-end, including the mock-data type-error ripple effects. Task 6 covers chat attachments on both the customer widget and admin inbox, including the mock-data ripple effects. Task 7 covers avatars end-to-end (own-profile fetch, header upload, admin list rendering) plus the `list_users` extension. Task 8 covers manual setup docs and final verification. Every subsystem named in the spec has a task.

**Placeholder scan:** No TBD/TODO markers. Two intentional "write it, then fix the bug" sequences appear (Task 3 Step 2, Task 5 Step 10) — these are deliberate: they show the natural mistake an implementer following the plan literally would make (a leftover no-op, a double-presign), then the exact corrected code, so the plan is self-healing rather than assuming perfection on the first pass. Each is followed by a working, complete replacement — not a "TODO: fix this."

**Type consistency:** `SupportMessage.attachment` (Task 6) is referenced identically across `db/support.ts`, `message-thread.tsx`, `use-support-chat.ts`, `chat-widget.tsx`, and `admin-support.tsx`. `MarketplacePlugin.downloadAssetPath` / `AdminPluginRow.downloadAssetPath` / DB column `download_asset_path` are threaded consistently through Task 5's five files. `AdminAction`'s `get_plugin_upload_url` member has identical field names in `functions.ts` (Task 4 Step 5) and the Zod schema in `admin-actions/index.ts` (Task 4 Step 1).

**Scope check:** This plan is one cohesive subsystem (object storage) with three consumers that share the same DB migration, signing helper, and Edge Function. It was not split into three plans because Tasks 1–4 (shared infrastructure) would otherwise have to be duplicated three times, and the user explicitly approved bundling plugin ZIPs + chat attachments + avatars in the brainstorming phase.
