-- Migration 001 — align existing databases with schema.sql
--
-- 1. The application (UI, Paystack checkout, repository layer) works in NGN,
--    but the original schema created *_usd columns. Rename them.
-- 2. hosting_nodes gains a per-node max_slots column; the slot-bound checks and
--    the availability index no longer hardcode 20.
--
-- Safe to run once against a database created from the old schema.sql.
-- Fresh databases created from the current schema.sql do not need this file.

begin;

-- ─── 1. Currency column renames ──────────────────────────────────────────────

do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'marketplace_plugins' and column_name = 'price_usd') then
    alter table public.marketplace_plugins rename column price_usd to price_ngn;
  end if;

  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'plugin_purchases' and column_name = 'amount_paid_usd') then
    alter table public.plugin_purchases rename column amount_paid_usd to amount_paid_ngn;
  end if;

  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'hosting_plans' and column_name = 'price_usd_yearly') then
    alter table public.hosting_plans rename column price_usd_yearly to price_ngn_yearly;
  end if;

  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'invoices' and column_name = 'total_usd') then
    alter table public.invoices rename column total_usd to total_ngn;
  end if;

  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'payments' and column_name = 'amount_usd') then
    alter table public.payments rename column amount_usd to amount_ngn;
  end if;

  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'credits' and column_name = 'amount_usd') then
    alter table public.credits rename column amount_usd to amount_ngn;
  end if;

  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'registered_domains' and column_name = 'price_usd_yearly') then
    alter table public.registered_domains rename column price_usd_yearly to price_ngn_yearly;
  end if;
end
$$;

-- ─── 2. hosting_nodes.max_slots ──────────────────────────────────────────────

alter table public.hosting_nodes
  add column if not exists max_slots integer not null default 20;

alter table public.hosting_nodes
  drop constraint if exists hosting_nodes_slot_bounds,
  drop constraint if exists hosting_nodes_status_consistency;

alter table public.hosting_nodes
  add constraint hosting_nodes_slot_bounds
    check (current_slots >= 0 and current_slots <= max_slots),
  add constraint hosting_nodes_status_consistency
    check (
      (status = 'full' and current_slots = max_slots)
      or
      (status = 'active' and current_slots < max_slots)
    );

drop index if exists public.idx_hosting_nodes_available;
create index idx_hosting_nodes_available
  on public.hosting_nodes (status, current_slots, created_at)
  where status = 'active';

commit;

-- ─── 3. Functions and policy hardening ───────────────────────────────────────
-- Re-run schema.sql after this migration. It is idempotent and additionally:
--   * installs allocate_hosting_node() / release_hosting_node()
--   * DROPS the client INSERT policies on user_sites and plugin_purchases —
--     those writes now happen exclusively in the Edge Functions
--     (provision-site, verify-payment) using the service role.
