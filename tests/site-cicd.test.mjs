import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

const DB_TYPE_MIGRATION = 'supabase/migrations/20260812005000_database_type.sql'
const GITHUB_CICD_MIGRATION = 'supabase/migrations/20260812006000_github_cicd.sql'
const GITHUB_CONNECTIONS_MIGRATION = 'supabase/migrations/20260813007000_github_connections.sql'
const GIT_DEPLOY = 'supabase/functions/git-deploy/index.ts'
const GITHUB_API = 'supabase/functions/github-api/index.ts'
const GITHUB_SERVICE = 'src/services/githubService.ts'
const SITE_GIT_TAB = 'src/components/site/site-git-cicd-tab.tsx'

test('complete_site_reservation persists both site_type and db_type on insert and on conflict', async () => {
  const sql = await read(DB_TYPE_MIGRATION)
  assert.match(sql, /create type public\.db_type as enum \('none', 'mysql', 'postgresql'\)/)
  assert.match(sql, /add column if not exists db_type public\.db_type not null default 'none'/)

  // The insert column list and its values must both carry site_type and
  // db_type — a regression here silently drops the user's chosen site/db
  // type back to the column default regardless of what was provisioned.
  assert.match(
    sql,
    /insert into public\.user_sites \(\s*user_id, node_id, site_domain, db_name, db_user, document_root, status, site_type, db_type\s*\)/,
  )
  assert.match(sql, /coalesce\(site_values->>'site_type', 'wordpress'\)::public\.site_type/)
  assert.match(sql, /v_db_type/)

  // ON CONFLICT UPDATE must also set both — this is the exact bug class
  // fixed twice this session (site_type, then db_type).
  const onConflict = sql.slice(sql.indexOf('on conflict'))
  assert.match(onConflict, /site_type = coalesce\(site_values->>'site_type', 'wordpress'\)::public\.site_type/)
  assert.match(onConflict, /db_type = v_db_type/)
})

test('github CI/CD columns exist with a real per-site webhook secret', async () => {
  const sql = await read(GITHUB_CICD_MIGRATION)
  assert.match(sql, /add column if not exists github_repo_url text/)
  assert.match(sql, /add column if not exists github_branch text not null default 'main'/)
  assert.match(sql, /add column if not exists auto_deploy_enabled boolean not null default false/)
  // gen_random_uuid() per row, not a shared/static default.
  assert.match(sql, /add column if not exists deploy_webhook_token text not null default gen_random_uuid\(\)::text/)
  assert.match(sql, /add column if not exists last_deploy_status text not null default 'idle'/)
})

test('user_github_connections is reachable only through the service role', async () => {
  const sql = await read(GITHUB_CONNECTIONS_MIGRATION)
  assert.match(sql, /create table if not exists public\.user_github_connections/)
  assert.match(sql, /access_token text not null/)
  assert.match(sql, /alter table public\.user_github_connections enable row level security/)
  assert.match(sql, /revoke all on table public\.user_github_connections from public, anon, authenticated/)
})

test('github-api never accepts or returns a client-supplied token for read actions', async () => {
  const source = await read(GITHUB_API)
  // save_token is the only action allowed to carry a token in the request.
  assert.match(source, /action: z\.literal\('save_token'\)/)
  assert.match(source, /token: z\.string\(\)\.min\(1.*\)\.max\(500\)/)

  // list_repos / list_branches resolve the token server-side from the
  // authenticated caller's stored connection — neither schema nor handler
  // should read a "token" field out of the request body for these actions.
  const listReposIdx = source.indexOf("action === 'list_repos'")
  const listBranchesIdx = source.indexOf("action === 'list_branches'")
  assert.ok(listReposIdx > -1 && listBranchesIdx > -1)
  const listReposBlock = source.slice(listReposIdx, listReposIdx + 400)
  const listBranchesBlock = source.slice(listBranchesIdx, listBranchesIdx + 600)
  assert.match(listReposBlock, /getStoredToken\(adminClient, user\.id\)/)
  assert.match(listBranchesBlock, /getStoredToken\(adminClient, user\.id\)/)
  assert.doesNotMatch(listReposBlock, /bodyObj\.token/)
  assert.doesNotMatch(listBranchesBlock, /bodyObj\.token/)

  // The stored token is written via upsert and never included in any
  // jsonResponse payload.
  assert.match(source, /\.upsert\(\s*\{ user_id: user\.id, access_token: parse\.data\.token/)
  assert.doesNotMatch(source, /jsonResponse\(\{[^}]*access_token/s)
})

test('githubService never persists the GitHub token to browser storage', async () => {
  const source = await read(GITHUB_SERVICE)
  assert.doesNotMatch(source, /localStorage/)
  assert.match(source, /export async function saveGitHubToken/)
  assert.match(source, /action: 'save_token'/)
})

test('git-deploy restricts repo URLs to https://github.com and branches to safe git-ref characters', async () => {
  const source = await read(GIT_DEPLOY)

  const GITHUB_REPO_URL_PATTERN =
    /^https:\/\/github\.com\/[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,38})\/[a-zA-Z0-9._-]+(?:\.git)?\/?$/
  assert.ok(GITHUB_REPO_URL_PATTERN.test('https://github.com/owner/repo'))
  assert.ok(GITHUB_REPO_URL_PATTERN.test('https://github.com/owner/repo.git'))
  assert.ok(!GITHUB_REPO_URL_PATTERN.test('file:///etc/passwd'))
  assert.ok(!GITHUB_REPO_URL_PATTERN.test('https://evil.com/owner/repo'))
  assert.ok(!GITHUB_REPO_URL_PATTERN.test('javascript:alert(1)'))

  const GIT_BRANCH_PATTERN = /^(?!-)[A-Za-z0-9._/-]+$/
  assert.ok(GIT_BRANCH_PATTERN.test('main'))
  assert.ok(GIT_BRANCH_PATTERN.test('release/1.2.3'))
  assert.ok(!GIT_BRANCH_PATTERN.test('--upload-pack=/bin/sh'))
  assert.ok(!GIT_BRANCH_PATTERN.test('-x'))

  // Both patterns must actually gate the Zod schema, and the branch pattern
  // must be re-checked immediately before the value reaches a WHM call
  // (defense in depth for rows written before this validation existed).
  assert.match(source, /githubRepoUrl: z\.union\(\[[\s\S]*?GITHUB_REPO_URL_PATTERN/)
  assert.match(source, /githubBranch: z\.string\(\)\.trim\(\)\.max\(100\)\.regex\(GIT_BRANCH_PATTERN/)
  assert.match(source, /if \(!GIT_BRANCH_PATTERN\.test\(branch\)\)/)
})

test('git-deploy webhook mode ignores non-push events and pushes to other branches', async () => {
  const source = await read(GIT_DEPLOY)
  assert.match(source, /X-GitHub-Event/)
  assert.match(source, /githubEvent && githubEvent !== 'push'/)
  assert.match(source, /pushedBranch !== configuredBranch/)
  // Both cases must be acknowledged (200/success), never treated as an error
  // — GitHub would eventually disable a webhook whose deliveries keep failing.
  const ignoredBlock = source.slice(source.indexOf("githubEvent && githubEvent !== 'push'"), source.indexOf('Mode B'))
  assert.match(ignoredBlock, /success: true/)
})

test('git-deploy embeds the stored token for private-repo clones and fails loudly with no hosting node', async () => {
  const source = await read(GIT_DEPLOY)
  assert.match(source, /async function buildAuthenticatedRepoUrl/)
  assert.match(source, /authed\.username = 'x-access-token'/)
  assert.match(source, /from\('user_github_connections'\)/)
  // No stored token -> falls back to the plain URL (public repos keep working).
  assert.match(source, /if \(!token\) return repoUrl/)

  // A missing hosting-node link must abort with a clear error, never guess
  // a cpanel account (this was a real bug: silently defaulting to 'maxmark').
  assert.match(source, /if \(!cpanelUser\)/)
  assert.doesNotMatch(source, /cpanel_username \|\| 'maxmark'/)
})

test('the Git & CI/CD tab updates site state immutably and builds the webhook URL from config, not a literal', async () => {
  const source = await read(SITE_GIT_TAB)
  // No hardcoded Supabase project URL — must come from config.
  assert.doesNotMatch(source, /https:\/\/[a-z0-9]+\.supabase\.co/)
  assert.match(source, /import \{ supabase, supabaseUrl \} from '@\/lib\/supabase'/)
  assert.match(source, /\$\{supabaseUrl\}\/functions\/v1\/git-deploy/)

  // Updates go through the onSiteUpdated callback, not direct prop mutation.
  assert.match(source, /onSiteUpdated\(\{ \.\.\.site, \.\.\.res\.site \}\)/)
  assert.doesNotMatch(source, /site\.github_repo_url = /)
  assert.doesNotMatch(source, /site\.last_deploy_status = /)
})

test('site-detail-page has no hardcoded Supabase URL and passes onSiteUpdated through to the Git tab', async () => {
  const source = await read('src/pages/site-detail-page.tsx')
  assert.doesNotMatch(source, /https:\/\/[a-z0-9]+\.supabase\.co/)
  assert.match(source, /onSiteUpdated: \(site: ManagedSite\) => void/)
  assert.match(source, /<SiteGitCicdTab site=\{site\} onSiteUpdated=\{onSiteUpdated\}/)

  // The dead 'deployment' tab (superseded by 'git-cicd') must not linger,
  // and the placeholder fallback must not double-render under the real tab.
  assert.doesNotMatch(source, /activeTab === 'deployment'/)
  assert.match(source, /activeTab !== 'git-cicd' &&/)
})

test('App wires site updates back into shared state by id, not by replacing the whole list', async () => {
  const source = await read('src/App.tsx')
  assert.match(source, /function handleSiteUpdated\(site: ManagedSite\) \{/)
  assert.match(source, /prev\.map\(\(s\) => \(s\.id === site\.id \? site : s\)\)/)
  assert.match(source, /onSiteUpdated=\{handleSiteUpdated\}/)
})
