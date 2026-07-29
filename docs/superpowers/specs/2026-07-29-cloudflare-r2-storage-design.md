# Cloudflare R2 Storage — Design

## Context

Maxmark Host has no real object storage today. Two features fake it:

- **Marketplace downloads** (`src/services/marketplaceService.ts::downloadMarketplacePlugin`) generate a throwaway ZIP client-side with `jszip` containing a bootstrap stub, readme, and license file — never the actual plugin/theme code, because none is stored anywhere.
- **Support chat** (`support_messages`, built 2026-07-05) is text-only; there's no way to attach a screenshot or log file to a conversation.
- **User identity** (`user_profiles`) has no avatar; the header chip and admin user list render initials only.

This spec adds Cloudflare R2 as the object store for all three, using presigned URLs issued by Supabase Edge Functions — the same trust-boundary pattern the project already uses for Paystack (`verify-payment`) and WHM (`provision-site`): the browser never gets write access to anything privileged directly, a server-side function authorizes each operation and hands back a short-lived signed URL.

Existing demo-first behavior is preserved: with no Supabase/R2 configuration, marketplace downloads keep using the current jszip mock, chat attachments work via local object URLs, and avatar upload is a local preview only.

## Buckets & configuration

Two R2 buckets — R2 has no per-object ACLs, so public/private is a bucket-level split:

- **`maxmark-private`** — plugin/theme ZIPs and chat attachments. Never publicly readable. Keys:
  - `plugins/<pluginId>/<version>/<slug>.zip`
  - `support/<conversationId>/<uuid>-<sanitizedFilename>`
- **`maxmark-public`** — avatars, publicly readable so `<img src>` works without expiring URLs. Key: `avatars/<userId>.<ext>`

Both buckets get a CORS rule permitting `PUT`/`GET` from the app's origin(s), required because uploads/downloads go browser → R2 directly using the presigned URL (not proxied through Supabase).

New Supabase secrets (`supabase secrets set`, never shipped to the client bundle):

```
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_PRIVATE_BUCKET
R2_PUBLIC_BUCKET
R2_PUBLIC_BASE_URL
```

A shared `supabase/functions/_shared/r2.ts` module wraps the R2 S3-compatible API using `aws4fetch` (Deno-native, ~6 KB, already the right shape for Edge Functions — no AWS SDK needed). It exports:

- `presignPut(bucket, key, contentType, contentLength, expiresInSeconds)` — signs `Content-Length` into the URL so R2 itself enforces the size cap, not just client-side JS.
- `presignGet(bucket, key, expiresInSeconds)`

## Server: `storage` Edge Function

One new function, same shape as `verify-payment` (JWT → anon client resolves caller, Zod discriminated union on `purpose`, service-role client for privileged work, `FunctionEnvelope` response):

| purpose | authorization check | behavior |
|---|---|---|
| `plugin-download` | caller has a `plugin_purchases` row for `pluginId` with `status = 'active'` | bumps `download_count`/`last_downloaded_at` server-side, returns a 5-minute presigned GET for `marketplace_plugins.download_asset_path` |
| `chat-attachment-upload` | caller owns the conversation (`support_conversations.user_id`) OR caller is admin | validates size ≤ 10 MB and content-type against an allowlist (images, PDF, plain text, zip), returns `{ key, uploadUrl }` (10-minute PUT) |
| `chat-attachment-download` | the message's conversation is owned by caller, or caller is admin | returns a 5-minute presigned GET |
| `avatar-upload` | any signed-in user | validates size ≤ 2 MB and image content-type, returns `{ uploadUrl, publicUrl }` for the caller's own `avatars/<uid>.<ext>` key (10-minute PUT) |

`avatar-upload` returns the final public URL immediately (no expiry issue — the bucket is public) so the client can save it straight to `user_profiles.avatar_url` via the existing self-row RLS UPDATE policy, without a second round trip.

Admin side — `admin-actions` gains one more action:

- **`get_plugin_upload_url`** — audited (appended to `admin_audit_log` like every other admin-actions call), returns a presigned PUT into `maxmark-private` for a given `pluginId`/`version`. The admin console uploads the ZIP directly to that URL, then calls the existing `upsert_plugin` action with the resulting key in a new `downloadAssetPath` field.

## Database changes — `migrations/004_r2_storage.sql`

Mirrored into `schema.sql` per repo convention.

```sql
alter table public.user_profiles
  add column if not exists avatar_url text;

alter table public.support_messages
  add column if not exists attachment_key text,
  add column if not exists attachment_name text,
  add column if not exists attachment_size integer,
  add column if not exists attachment_type text;

-- A message may now be attachment-only.
alter table public.support_messages
  drop constraint if exists support_messages_body_length,
  add constraint support_messages_body_length
    check (
      char_length(body) between 1 and 4000
      or (char_length(body) = 0 and attachment_key is not null)
    );

alter table public.marketplace_plugins
  add column if not exists download_asset_path text;
```

No RLS changes needed: `support_messages` already restricts by conversation ownership/admin, `user_profiles` and `marketplace_plugins` already have the right SELECT/UPDATE policies for the new columns to ride along.

## Frontend changes

- **`src/lib/storage.ts`** (new) — thin client bridge: `getPluginDownloadUrl`, `uploadChatAttachment(file, conversationId)` (calls the presign purpose, then `fetch(uploadUrl, { method: 'PUT', body: file })`), `getChatAttachmentUrl`, `uploadAvatar(file)`.
- **Marketplace download** (`marketplaceService.ts`): live mode now checks `plugin.downloadAssetPath` — if set, call `storage.getPluginDownloadUrl` and redirect/download from the signed URL; if unset (no asset uploaded yet), fall back to the current jszip mock so existing catalog items keep working unchanged.
- **Admin marketplace** (`admin-marketplace.tsx` + its dialog): add a file input ("Upload ZIP") that calls `get_plugin_upload_url`, PUTs the file, then includes `downloadAssetPath` in the `upsert_plugin` call.
- **`MessageThread`** (shared chat component): add a paperclip button → file picker → `uploadChatAttachment`, then send the message with attachment fields set. Attachment bubbles render name + size and fetch a fresh signed GET on click (never store a long-lived URL in state).
- **Header profile chip + admin user list**: minimal avatar upload dialog (crop-free, just a file picker) wired to `uploadAvatar`; render `avatar_url` when present, initials fallback otherwise.

**Demo mode** (`supabase === null`): unchanged behavior — jszip mock for downloads, local `URL.createObjectURL` for chat attachments (with the existing demo notice), avatar upload previews locally via `FileReader` without persisting anywhere.

## Manual setup (outside this repo — documented in README)

1. Create both R2 buckets in the Cloudflare dashboard.
2. Create one R2 API token scoped to Object Read & Write on both buckets.
3. Enable public access on `maxmark-public` (custom domain or `r2.dev` subdomain) and record it as `R2_PUBLIC_BASE_URL`.
4. Apply the CORS policy (provided as JSON in the README) to both buckets.
5. `supabase secrets set` the six variables above.
6. `supabase functions deploy storage` and redeploy `admin-actions`.

## Verification

- Typecheck/build after each phase.
- With R2 configured: admin uploads a plugin ZIP, a customer with an active purchase downloads and gets the real file (not the jszip stub); a customer without a purchase gets a 403 from `plugin-download`.
- Chat: attach a small image from the customer widget, confirm it appears in the admin inbox thread and is downloadable; attempt an 11 MB file and confirm the function rejects it before any R2 write.
- Avatar: upload from the header chip, confirm it renders in both the customer header and the admin users list.
- Demo mode (no env vars): all three flows keep working exactly as before this change (jszip download, local-preview attachment, local-preview avatar) — no regression.
