-- Migration 006 — Stored boolean flag for marketplace download assets
--
-- Round 2 of the final whole-branch review closed the download_asset_path
-- disclosure finding by having src/lib/db/marketplace.ts's fetchPlugins
-- select an explicit column list that excludes download_asset_path (the raw
-- R2 key), instead of select('*'). That alone would have broken the
-- has-an-asset check: a column absent from a PostgREST select() comes back
-- as `undefined` in the JS row, and `undefined !== null` is `true` — every
-- plugin would have appeared to have a real asset, defeating the
-- demo-first jszip mock fallback for every plugin that has none yet.
--
-- has_download_asset is a stored generated column computed server-side, so
-- the customer-facing query can select the boolean without ever selecting
-- the raw path.
--
-- Safe to run once. Re-running schema.sql afterward is idempotent.

alter table public.marketplace_plugins
  add column if not exists has_download_asset boolean
  generated always as (download_asset_path is not null) stored;

comment on column public.marketplace_plugins.has_download_asset is 'True when download_asset_path is set. Selected by customer-facing queries instead of the raw R2 key.';
