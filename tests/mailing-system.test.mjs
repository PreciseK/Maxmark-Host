import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('mailing system migration defines schema additions, cluster nodes, and admin RLS policies', async () => {
  const migration = await read('supabase/migrations/20260907001000_mailing_system_enhancements.sql')

  // email_boxes alterations
  assert.match(migration, /add column if not exists used_mb numeric\(10, 2\)/)
  assert.match(migration, /add column if not exists status text not null default 'active'/)
  assert.match(migration, /add column if not exists autoresponder_enabled boolean/)
  assert.match(migration, /add column if not exists autoresponder_subject text/)
  assert.match(migration, /add column if not exists autoresponder_body text/)

  // email_aliases alterations
  assert.match(migration, /add column if not exists is_active boolean/)

  // email_cluster_nodes table
  assert.match(migration, /create table if not exists public\.email_cluster_nodes/)
  assert.match(migration, /node_name text not null unique/)
  assert.match(migration, /active_imap_sessions integer/)
  assert.match(migration, /queue_length integer/)
  assert.match(migration, /rbl_status text not null default 'clean'/)

  // Admin RLS policies
  assert.match(migration, /create policy "Admins have full access to email_boxes"/)
  assert.match(migration, /create policy "Admins have full access to email_aliases"/)
  assert.match(migration, /create policy "Admins have full access to email_cluster_nodes"/)
})

test('db email module exports complete CRUD and admin cluster operations', async () => {
  const dbEmail = await read('src/lib/db/email.ts')

  assert.match(dbEmail, /export interface EmailBox/)
  assert.match(dbEmail, /usedMb: number/)
  assert.match(dbEmail, /status: EmailBoxStatus/)
  assert.match(dbEmail, /autoresponderEnabled: boolean/)
  assert.match(dbEmail, /export interface EmailClusterNode/)

  assert.match(dbEmail, /export async function createEmailBox\(/)
  assert.match(dbEmail, /export async function updateEmailBox\(/)
  assert.match(dbEmail, /export async function deleteEmailBox\(/)
  assert.match(dbEmail, /export async function createEmailAlias\(/)
  assert.match(dbEmail, /export async function deleteEmailAlias\(/)
  assert.match(dbEmail, /export async function fetchAllEmailBoxesAdmin\(/)
  assert.match(dbEmail, /export async function fetchEmailClusterNodes\(/)
})

test('customer emails page provides mailboxes, forwarders, DNS deliverability, and client setup', async () => {
  const customerPage = await read('src/pages/emails-page.tsx')

  // Header and stats
  assert.match(customerPage, /Business Email & Mailboxes/)
  assert.match(customerPage, /Total Mailboxes/)
  assert.match(customerPage, /Storage Used/)
  assert.match(customerPage, /Deliverability/)

  // Tabs
  assert.match(customerPage, /Mailboxes \(\{emailBoxes\.length\}\)/)
  assert.match(customerPage, /Forwarders & Aliases \(\{emailAliases\.length\}\)/)
  assert.match(customerPage, /DNS Deliverability/)
  assert.match(customerPage, /Email Client Setup/)

  // Deliverability records
  assert.match(customerPage, /v=spf1 include:_spf\.maxmarkhost\.com ~all/)
  assert.match(customerPage, /default\._domainkey/)
  assert.match(customerPage, /v=DMARC1; p=none/)

  // Client setup ports
  assert.match(customerPage, /993 \(SSL\/TLS\)/)
  assert.match(customerPage, /465 \(SSL\) or 587 \(TLS\)/)

  // Webmail launcher
  assert.match(customerPage, /:2096/)
  assert.match(customerPage, /Webmail/)
})

test('admin emails page provides fleet telemetry, cross-tenant management, and cluster controls', async () => {
  const adminPage = await read('src/pages/admin/admin-emails.tsx')

  assert.match(adminPage, /Mail & Email Systems/)
  assert.match(adminPage, /Fleet Mailboxes/)
  assert.match(adminPage, /Cluster Sessions/)
  assert.match(adminPage, /Flush Outbound Mail Queue/)
  assert.match(adminPage, /Cross-Tenant Mailboxes/)
  assert.match(adminPage, /Mail Cluster Nodes/)
  assert.match(adminPage, /Anti-Spam & Routing Policies/)
  assert.match(adminPage, /Hourly Rate Limit \(Emails per Mailbox\)/)
  assert.match(adminPage, /SpamAssassin Sensitivity Score Threshold/)
})

test('customer and admin shells register email navigation links and routing', async () => {
  const dashboardShell = await read('src/layouts/dashboard-shell.tsx')
  assert.match(dashboardShell, /\{ label:\s*'Emails',\s*href:\s*'\/emails',\s*icon:\s*Mail \}/)
  assert.match(dashboardShell, /\{ label:\s*'Email Accounts',\s*tabId:\s*'email',\s*icon:\s*Mail \}/)

  const app = await read('src/App.tsx')
  assert.match(app, /const EmailsPage = lazyPage\(\(\) => import\('@\/pages\/emails-page'\),\s*'EmailsPage'\)/)
  assert.match(app, /<Route element=\{<EmailsPage \/>\}\s*path="emails"\s*\/>/)

  const adminShell = await read('src/layouts/admin-shell.tsx')
  assert.match(adminShell, /\{ label:\s*'Mail & Email Systems',\s*href:\s*'\/admin\/emails',\s*icon:\s*Mail \}/)

  const adminArea = await read('src/pages/admin/admin-area.tsx')
  assert.match(adminArea, /import \{ AdminEmails \} from '@\/pages\/admin\/admin-emails'/)
  assert.match(adminArea, /<Route element=\{<AdminEmails \/>\}\s*path="emails"\s*\/>/)
})
