-- 20260813007000_github_connections.sql
-- Server-side storage for GitHub access tokens (OAuth provider_token or a
-- manually pasted PAT). Tokens must never live in browser localStorage —
-- any XSS on the site would otherwise be a full GitHub account compromise
-- (the OAuth flow requests 'repo' scope: read/write on every repo, public
-- and private). This table is reachable only through the service-role
-- client inside the github-api / git-deploy Edge Functions, matching the
-- existing site_provisioning_reservations trust-boundary pattern.

create table if not exists public.user_github_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  access_token text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.user_github_connections enable row level security;
revoke all on table public.user_github_connections from public, anon, authenticated;
