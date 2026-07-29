-- Migration 002 — admin roles, audit log, node maintenance status
--
-- 1. hosting_node_status gains a 'maintenance' value so admins can drain a
--    node (stop new allocations at any slot count). 'full' remains machine-
--    owned by allocate_hosting_node().
-- 2. hosting_nodes_status_consistency is relaxed to permit 'maintenance'.
--
-- Safe to run once against a database created from the old schema.sql.
-- Fresh databases created from the current schema.sql do not need this file.
--
-- NOTE: `alter type … add value` must not run in the same transaction that
-- references the new value, so it sits outside the begin/commit block.

alter type public.hosting_node_status add value if not exists 'maintenance';

begin;

alter table public.hosting_nodes
  drop constraint if exists hosting_nodes_status_consistency;

alter table public.hosting_nodes
  add constraint hosting_nodes_status_consistency
    check (
      (status = 'full' and current_slots = max_slots)
      or
      (status = 'active' and current_slots < max_slots)
      or
      (status = 'maintenance')
    );

commit;

-- ─── Roles, audit log, and admin read policies ───────────────────────────────
-- Re-run schema.sql after this migration. It is idempotent and additionally:
--   * creates public.app_role, public.user_roles, public.admin_audit_log
--   * installs public.is_admin() (SECURITY DEFINER — never inline a
--     user_roles subquery in a policy; it would recurse through the
--     table's own RLS)
--   * adds permissive "Admins can view …" SELECT policies across the
--     customer tables so /admin can list data directly under RLS
--
-- Then seed the first admin (auth.users is environment-specific):
--   insert into public.user_roles (user_id, role)
--   select id, 'admin' from auth.users where email = 'you@example.com'
--   on conflict do nothing;
--
-- Known caveat (v1): release_hosting_node() unconditionally resets its target
-- node to 'active'. If a node is drained to 'maintenance' while a provision on
-- it is still in flight and that provision fails, the rollback flips the node
-- back to 'active'. Re-drain it from /admin/nodes if that happens.
