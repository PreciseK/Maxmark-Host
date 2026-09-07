import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('webmail client provides 3-pane architecture, folder navigation, and mailbox selector', async () => {
  const webmail = await read('src/pages/webmail-page.tsx')

  // Top header and active mailbox selector
  assert.match(webmail, /Modern Webmail/)
  assert.match(webmail, /Encrypted IMAP\/TLS/)
  assert.match(webmail, /Active Account:/)
  assert.match(webmail, /Mailbox Settings/)

  // 3-Pane structure
  assert.match(webmail, /PANE 1: Folders & Quota Sidebar/)
  assert.match(webmail, /PANE 2: Message List/)
  assert.match(webmail, /PANE 3: Reading & Action Pane/)

  // Folder navigation
  assert.match(webmail, /id:\s*'inbox',\s*label:\s*'Inbox'/)
  assert.match(webmail, /id:\s*'starred',\s*label:\s*'Starred'/)
  assert.match(webmail, /id:\s*'sent',\s*label:\s*'Sent'/)
  assert.match(webmail, /id:\s*'drafts',\s*label:\s*'Drafts'/)
  assert.match(webmail, /id:\s*'archive',\s*label:\s*'Archive'/)
  assert.match(webmail, /id:\s*'spam',\s*label:\s*'Spam'/)
  assert.match(webmail, /id:\s*'trash',\s*label:\s*'Trash'/)

  // Quota bar
  assert.match(webmail, /Mailbox Quota/)
  assert.match(webmail, /usedMb\.toFixed\(0\)\}\s*MB of/)
})

test('webmail message pane provides search, unread/starred filters, and message cards', async () => {
  const webmail = await read('src/pages/webmail-page.tsx')

  assert.match(webmail, /placeholder="Search messages\.\.\."/)
  assert.match(webmail, /filterMode === mode/)
  assert.match(webmail, /toggleStar\(e,\s*msg\.id\)/)
  assert.match(webmail, /selectMessage\(msg\)/)
  assert.match(webmail, /msg\.isUnread/)
})

test('webmail reading pane features SPF/DKIM verification, attachment previews, and inline quick reply', async () => {
  const webmail = await read('src/pages/webmail-page.tsx')

  assert.match(webmail, /SPF \/ DKIM Verified/)
  assert.match(webmail, /toggleReadStatus/)
  assert.match(webmail, /handleArchive/)
  assert.match(webmail, /handleDelete/)
  assert.match(webmail, /Attachments/)
  assert.match(webmail, /Quick Reply to/)
  assert.match(webmail, /handleSendQuickReply/)
})

test('webmail compose modal allows drafting and sending messages', async () => {
  const webmail = await read('src/pages/webmail-page.tsx')

  assert.match(webmail, /Compose Email/)
  assert.match(webmail, /New Message/)
  assert.match(webmail, /placeholder="recipient@example\.com"/)
  assert.match(webmail, /placeholder="Subject of the email"/)
  assert.match(webmail, /handleSendCompose/)
  assert.match(webmail, /Send Message/)
})

test('dashboard shell and app route register webmail navigation and deep links', async () => {
  const dashboardShell = await read('src/layouts/dashboard-shell.tsx')
  assert.match(dashboardShell, /\{ label:\s*'Webmail',\s*href:\s*'\/webmail',\s*icon:\s*Inbox \}/)

  const app = await read('src/App.tsx')
  assert.match(app, /const WebmailPage = lazyPage\(\(\) => import\('@\/pages\/webmail-page'\),\s*'WebmailPage'\)/)
  assert.match(app, /<Route element=\{<WebmailPage \/>\}\s*path="webmail"\s*\/>/)

  const emailsPage = await read('src/pages/emails-page.tsx')
  assert.match(emailsPage, /to=\{`\/webmail\?mailbox=\$\{encodeURIComponent\(box\.emailAddress\)\}`\}/)
  assert.match(emailsPage, /Open Webmail/)
})
