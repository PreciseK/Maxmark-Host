import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('admin shell navigation registers Deployments, Plans, Databases, and SSL pages', async () => {
  const adminShell = await read('src/layouts/admin-shell.tsx')
  assert.match(adminShell, /label:\s*'Deployments & CI\/CD',\s*href:\s*'\/admin\/deployments'/)
  assert.match(adminShell, /label:\s*'Plans & Pricing',\s*href:\s*'\/admin\/plans'/)
  assert.match(adminShell, /label:\s*'Databases & Caches',\s*href:\s*'\/admin\/databases'/)
  assert.match(adminShell, /label:\s*'SSL & Encryption',\s*href:\s*'\/admin\/ssl'/)
})

test('admin area routes register all 4 new management pages', async () => {
  const adminArea = await read('src/pages/admin/admin-area.tsx')
  assert.match(adminArea, /<Route element=\{<AdminDeployments \/>\}\s*path="deployments"\s*\/>/)
  assert.match(adminArea, /<Route element=\{<AdminPlans \/>\}\s*path="plans"\s*\/>/)
  assert.match(adminArea, /<Route element=\{<AdminDatabases \/>\}\s*path="databases"\s*\/>/)
  assert.match(adminArea, /<Route element=\{<AdminSsl \/>\}\s*path="ssl"\s*\/>/)
})

test('admin deployments component features pipeline queue and build log inspection', async () => {
  const deployments = await read('src/pages/admin/admin-deployments.tsx')
  assert.match(deployments, /Deployments & CI\/CD Pipelines/)
  assert.match(deployments, /Pipeline Success Rate/)
  assert.match(deployments, /Build Pipeline Output/)
  assert.match(deployments, /handleRedeploy/)
  assert.match(deployments, /handleRollback/)
})

test('admin plans component manages Launch, Pro, and Scale tiers with quotas and entitlements', async () => {
  const plans = await read('src/pages/admin/admin-plans.tsx')
  assert.match(plans, /Hosting Plans & Pricing Manager/)
  assert.match(plans, /Launch Tier/)
  assert.match(plans, /10000/)
  assert.match(plans, /Pro Tier/)
  assert.match(plans, /15000/)
  assert.match(plans, /Scale Tier/)
  assert.match(plans, /25000/)
  assert.match(plans, /Configure Tier/)
  assert.match(plans, /GitHub CI\/CD/)
  assert.match(plans, /Redis Object Cache/)
})

test('admin databases component manages PostgreSQL, MySQL, and Redis object cache cluster', async () => {
  const databases = await read('src/pages/admin/admin-databases.tsx')
  assert.match(databases, /Database Clusters & Object Caches/)
  assert.match(databases, /Redis In-Memory Cache Cluster/)
  assert.match(databases, /handleFlushRedis/)
  assert.match(databases, /handleOptimizeDb/)
  assert.match(databases, /PostgreSQL/)
  assert.match(databases, /MySQL/)
})

test('admin ssl component oversees Let\'s Encrypt certificates and edge TLS security', async () => {
  const ssl = await read('src/pages/admin/admin-ssl.tsx')
  assert.match(ssl, /SSL & Edge TLS Certificates/)
  assert.match(ssl, /Global Edge Security & TLS Policy/)
  assert.match(ssl, /Force HTTPS Redirect/)
  assert.match(ssl, /HSTS Header/)
  assert.match(ssl, /handleForceRenew/)
})
