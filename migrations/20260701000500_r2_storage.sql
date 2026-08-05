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
