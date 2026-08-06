import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('live configuration is fail-closed and no sample-data path exists', async () => {
  const source = await read('src/lib/supabase.ts')
  const customerRoute = await read('src/components/customer-route.tsx')
  const example = await read('.env.example')
  // Placeholder or missing credentials must null the client, never fall back
  // to sample data. Demo mode was removed; nothing may reintroduce it.
  assert.match(source, /configurationError/)
  assert.match(source, /looksLikePlaceholder/)
  assert.doesNotMatch(source, /isDemoMode|VITE_DEMO_MODE/)
  assert.doesNotMatch(example, /VITE_DEMO_MODE/)
  assert.match(example, /MOCK_WHM_REQUESTS=false/)
  assert.match(customerRoute, /if \(!session\)/)
  assert.match(customerRoute, /<Navigate replace[\s\S]*to="\/login"/)
})

test('payment settlement and commercial tables are server controlled', async () => {
  const migration = await read('supabase/migrations/20260731000800_production_hardening.sql')
  const webhook = await read('supabase/functions/paystack-webhook/index.ts')
  assert.match(migration, /create table if not exists public\.payment_intents/)
  assert.match(migration, /for update;/)
  assert.match(migration, /revoke insert, update, delete on table public\.hosting_plans from authenticated/)
  assert.match(migration, /settle_payment_intent/)
  assert.match(webhook, /x-paystack-signature/)
  assert.match(webhook, /HMAC.*SHA-512/s)
  assert.match(webhook, /transaction\.amount === Math\.round/)
  assert.match(webhook, /settle_payment_intent/)
})

test('site provisioning reserves plan and node capacity', async () => {
  const migration = await read('supabase/migrations/20260731000800_production_hardening.sql')
  const provisioner = await read('supabase/functions/_shared/provisioner.ts')
  assert.match(migration, /pg_advisory_xact_lock/)
  assert.match(migration, /Your hosting plan site limit has been reached/)
  assert.match(provisioner, /reserve_site_capacity/)
  assert.match(provisioner, /complete_site_reservation/)
  assert.match(provisioner, /SSL::start_autossl_check/)
})

test('live marketplace never falls back to a generated demo asset', async () => {
  const service = await read('src/services/marketplaceService.ts')
  const claim = await read('supabase/functions/claim-item/index.ts')
  const initialize = await read('supabase/functions/initialize-payment/index.ts')
  assert.match(service, /if \(supabase\)[\s\S]*licensed asset is temporarily unavailable/)
  assert.match(claim, /download_asset_path/)
  assert.match(initialize, /download_asset_path/)
})

test('production preview and common static hosts route the app entry', async () => {
  const vite = await read('vite.config.ts')
  const redirects = await read('public/_redirects')
  const vercel = await read('vercel.json')
  assert.match(vite, /configurePreviewServer/)
  assert.match(redirects, /\/billing\s+\/app\.html\s+200/)
  assert.doesNotThrow(() => JSON.parse(vercel))
})
