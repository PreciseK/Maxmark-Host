import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('site_env_vars table migration defines schema, constraints and RLS policies', async () => {
  const migration = await read('supabase/migrations/20260906001000_site_env_vars.sql')
  assert.match(migration, /create table if not exists public\.site_env_vars/i)
  assert.match(migration, /site_id uuid not null references public\.user_sites/i)
  assert.match(migration, /key text not null/i)
  assert.match(migration, /value text not null/i)
  assert.match(migration, /target_env text not null default 'production'/i)
  assert.match(migration, /constraint site_env_vars_target_env_check check/i)
  assert.match(migration, /constraint site_env_vars_unique_key unique/i)
  assert.match(migration, /alter table public\.site_env_vars enable row level security/i)
  assert.match(migration, /create policy "Users can view env vars for their own sites"/i)
  assert.match(migration, /or public\.is_admin\(\)/i)
})

test('site navigation and site detail page expose environment variables management to users', async () => {
  const dashboardShell = await read('src/layouts/dashboard-shell.tsx')
  const siteDetailPage = await read('src/pages/site-detail-page.tsx')
  const envVarsTab = await read('src/components/site/site-env-vars-tab.tsx')

  // Dashboard sidebar exposes Environment Variables tab
  assert.match(dashboardShell, /label:\s*'Environment Variables',\s*tabId:\s*'env-vars'/)

  // Site detail page routes env-vars to SiteEnvVarsTab
  assert.match(siteDetailPage, /import\s*\{\s*SiteEnvVarsTab\s*\}\s*from\s*'@\/components\/site\/site-env-vars-tab'/)
  assert.match(siteDetailPage, /'env-vars':\s*'Environment Variables'/)
  assert.match(siteDetailPage, /activeTab === 'env-vars'[\s\S]*<SiteEnvVarsTab/)

  // SiteEnvVarsTab provides status, custom vars, system vars, and .env import
  assert.match(envVarsTab, /Runtime Environment Status/)
  assert.match(envVarsTab, /Custom Environment Variables/)
  assert.match(envVarsTab, /System-Provided Variables/)
  assert.match(envVarsTab, /Import \.env/)
  assert.match(envVarsTab, /NODE_ENV/)
})

test('admin shell and area expose environments and runtimes inspection', async () => {
  const adminShell = await read('src/layouts/admin-shell.tsx')
  const adminArea = await read('src/pages/admin/admin-area.tsx')
  const adminSites = await read('src/pages/admin/admin-sites.tsx')
  const adminEnvironments = await read('src/pages/admin/admin-environments.tsx')

  // Admin shell sidebar
  assert.match(adminShell, /label:\s*'Environments & Runtimes',\s*href:\s*'\/admin\/environments'/)

  // Admin routes
  assert.match(adminArea, /<Route element=\{<AdminEnvironments \/>\}\s*path="environments"\s*\/>/)

  // Admin sites quick action
  assert.match(adminSites, /label:\s*'Environment Variables'[\s\S]*href:\s*`\/admin\/environments\?siteId=\$\{site\.id\}`/)

  // Admin environments component features
  assert.match(adminEnvironments, /Cluster Runtime Environments/)
  assert.match(adminEnvironments, /Platform Infrastructure Gateways/)
  assert.match(adminEnvironments, /Customer Site Environment Variables Inspector/)
})
