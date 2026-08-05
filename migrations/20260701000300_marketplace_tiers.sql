-- Migration 002 — marketplace tiers (plugins + themes)
--
-- Adds product_type + tier to the catalog and acquisition to licences.
-- Safe to run once against a database created before this feature.
-- After running, re-run schema.sql (idempotent) to install
-- marketplace_tier_for_user().

begin;

alter table public.marketplace_plugins
  add column if not exists product_type text not null default 'plugin',
  add column if not exists tier smallint not null default 1;

alter table public.marketplace_plugins
  drop constraint if exists marketplace_plugins_product_type,
  drop constraint if exists marketplace_plugins_tier_range;

alter table public.marketplace_plugins
  add constraint marketplace_plugins_product_type
    check (product_type in ('plugin', 'theme')),
  add constraint marketplace_plugins_tier_range
    check (tier between 1 and 3);

alter table public.plugin_purchases
  add column if not exists acquisition text not null default 'purchase';

alter table public.plugin_purchases
  drop constraint if exists plugin_purchases_acquisition;

alter table public.plugin_purchases
  add constraint plugin_purchases_acquisition
    check (acquisition in ('purchase', 'subscription'));

commit;
