-- 20260812006000_github_cicd.sql
-- Adds GitHub repository integration and CI/CD deployment tracking fields to user_sites.

alter table public.user_sites
  add column if not exists github_repo_url text,
  add column if not exists github_branch text not null default 'main',
  add column if not exists auto_deploy_enabled boolean not null default false,
  add column if not exists deploy_webhook_token text not null default gen_random_uuid()::text,
  add column if not exists last_deployed_at timestamptz,
  add column if not exists last_deploy_status text not null default 'idle',
  add column if not exists last_deploy_log text;

-- Index for webhook token lookup
create index if not exists idx_user_sites_deploy_webhook_token on public.user_sites(deploy_webhook_token);
