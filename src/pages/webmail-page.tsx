import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Archive,
  ArrowLeft,
  Check,
  Download,
  ExternalLink,
  FileText,
  Inbox,
  Mail,
  Paperclip,
  PenSquare,
  Reply,
  Search,
  Send,
  ShieldCheck,
  Star,
  Trash2,
  X,
  Zap,
} from 'lucide-react'

import { fetchAllEmailBoxesForUser, type EmailBox } from '@/lib/db/email'
import { fetchSites } from '@/lib/db/sites'
import { supabase } from '@/lib/supabase'
import { formatDateLabel, cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export type WebmailFolder = 'inbox' | 'starred' | 'sent' | 'drafts' | 'archive' | 'spam' | 'trash'

export interface WebmailAttachment {
  id: string
  name: string
  size: string
  type: string
}

export interface WebmailMessage {
  id: string
  mailbox: string
  folder: WebmailFolder
  fromName: string
  fromEmail: string
  toEmail: string
  subject: string
  snippet: string
  bodyHtml: string
  date: string
  timestamp: number
  isUnread: boolean
  isStarred: boolean
  hasAttachments: boolean
  attachments?: WebmailAttachment[]
  spfDkimVerified: boolean
}

// Initial realistic default messages for customers
const initialMockMessages: WebmailMessage[] = [
  {
    id: 'msg-101',
    mailbox: '',
    folder: 'inbox',
    fromName: 'Maxmark Host CI/CD',
    fromEmail: 'deployments@maxmarkhost.com',
    toEmail: '',
    subject: 'Production Deployment Successful: commit 8b7180f',
    snippet: 'Your site was automatically built and deployed across our global edge nodes in 34 seconds...',
    bodyHtml: `
      <p>Hello,</p>
      <p>Your latest push to branch <strong>main</strong> has been successfully built and deployed across the Maxmark Host global edge cluster.</p>
      <div style="background:#161619;border:1px solid #232328;border-radius:8px;padding:12px;margin:16px 0;font-family:monospace;font-size:12px;">
        <div><strong>Commit:</strong> 8b7180f - feat(admin): add management suite</div>
        <div><strong>Environment:</strong> Production (Node.js 20 LTS + Next.js Standalone)</div>
        <div><strong>Build Duration:</strong> 34.2 seconds</div>
        <div><strong>Edge SSL Status:</strong> Active & Valid (TLS 1.3 Strict)</div>
      </div>
      <p>You can inspect real-time runtime metrics and access logs in your Customer Console under the <em>Deployments & CI/CD</em> tab.</p>
      <p>Best regards,<br/>The Maxmark Host Pipeline Team</p>
    `,
    date: '10:42 AM',
    timestamp: Date.now() - 1000 * 60 * 45,
    isUnread: true,
    isStarred: true,
    hasAttachments: false,
    spfDkimVerified: true,
  },
  {
    id: 'msg-102',
    mailbox: '',
    folder: 'inbox',
    fromName: 'Sarah Jenkins',
    fromEmail: 'sarah.jenkins@acmecorp.com',
    toEmail: '',
    subject: 'Revised Design Assets & Staging Feedback',
    snippet: 'Hey! We reviewed the staging URL you provided yesterday. Everything looks responsive and fast...',
    bodyHtml: `
      <p>Hi team,</p>
      <p>We reviewed the staging URL you shared yesterday on your staging subdomain. The page load performance is outstanding, especially on mobile!</p>
      <p>I have attached the updated brand SVG assets and the vector guidelines for the new campaign landing page.</p>
      <p>Could we also ensure the contact forms route to <code>support@ourdomain.com</code> through your new mail forwarder?</p>
      <p>Thanks so much,<br/><strong>Sarah Jenkins</strong><br/>Creative Director, Acme Corp</p>
    `,
    date: 'Yesterday',
    timestamp: Date.now() - 1000 * 60 * 60 * 22,
    isUnread: true,
    isStarred: false,
    hasAttachments: true,
    attachments: [
      { id: 'att-1', name: 'Brand-Assets-v2.zip', size: '4.2 MB', type: 'archive' },
      { id: 'att-2', name: 'Landing-Wireframe.pdf', size: '1.8 MB', type: 'pdf' },
    ],
    spfDkimVerified: true,
  },
  {
    id: 'msg-103',
    mailbox: '',
    folder: 'inbox',
    fromName: 'Stripe Billing',
    fromEmail: 'notifications@stripe.com',
    toEmail: '',
    subject: 'Receipt for Maxmark Host Pro Plan (Invoice #INV-2049)',
    snippet: 'Thank you for your payment of ₦15,000.00. Your monthly Pro subscription renewal has processed...',
    bodyHtml: `
      <p>Hi,</p>
      <p>This is a confirmation that your payment of <strong>₦15,000.00</strong> for your Maxmark Host Pro Subscription has been received.</p>
      <p><strong>Invoice Number:</strong> #INV-2049<br/>
      <strong>Billing Period:</strong> Current Month<br/>
      <strong>Payment Method:</strong> Mastercard ending in •••• 4012</p>
      <p>You can view and download full tax receipts anytime from your Maxmark Billing dashboard.</p>
    `,
    date: 'Sep 4',
    timestamp: Date.now() - 1000 * 60 * 60 * 48,
    isUnread: false,
    isStarred: true,
    hasAttachments: true,
    attachments: [
      { id: 'att-3', name: 'Receipt-INV-2049.pdf', size: '210 KB', type: 'pdf' },
    ],
    spfDkimVerified: true,
  },
  {
    id: 'msg-104',
    mailbox: '',
    folder: 'inbox',
    fromName: 'Let\'s Encrypt AutoSSL',
    fromEmail: 'certificates@letsencrypt.org',
    toEmail: '',
    subject: 'AutoSSL Certificate Successfully Renewed',
    snippet: 'Your wildcard and apex domain SSL certificate was renewed for 90 days. Zero downtime incurred...',
    bodyHtml: `
      <p>Dear Administrator,</p>
      <p>Your Let's Encrypt certificate covering your apex domain and Subject Alternative Names (SANs) was automatically re-issued and deployed to your edge proxy nodes.</p>
      <p><strong>Next Renewal Window:</strong> 60 days from today<br/>
      <strong>Algorithm:</strong> RSA 2048-bit (ECDSA P-256 fallback ready)<br/>
      <strong>HSTS Status:</strong> Strict Transport Security Enabled</p>
    `,
    date: 'Sep 2',
    timestamp: Date.now() - 1000 * 60 * 60 * 96,
    isUnread: false,
    isStarred: false,
    hasAttachments: false,
    spfDkimVerified: true,
  },
  {
    id: 'msg-105',
    mailbox: '',
    folder: 'sent',
    fromName: 'Me',
    fromEmail: '',
    toEmail: 'client@partnerbrand.com',
    subject: 'Proposal & Scope of Work for Q4 Platform Migration',
    snippet: 'Attached please find our finalized scope of work document outlining the hosting infrastructure...',
    bodyHtml: `
      <p>Hi David,</p>
      <p>Attached please find our finalized scope of work document outlining the hosting infrastructure architecture and high-availability database replication plan.</p>
      <p>Let me know if you have any questions before our kick-off call on Thursday.</p>
    `,
    date: 'Sep 1',
    timestamp: Date.now() - 1000 * 60 * 60 * 120,
    isUnread: false,
    isStarred: false,
    hasAttachments: true,
    attachments: [
      { id: 'att-4', name: 'Q4-Migration-SOW.pdf', size: '2.4 MB', type: 'pdf' },
    ],
    spfDkimVerified: true,
  },
]

export function WebmailPage() {
  const [searchParams] = useSearchParams()
  const initialMailboxParam = searchParams.get('mailbox') ?? ''

  const [mailboxes, setMailboxes] = useState<EmailBox[]>([])
  const [activeMailbox, setActiveMailbox] = useState<string>('')

  // Webmail Navigation State
  const [currentFolder, setCurrentFolder] = useState<WebmailFolder>('inbox')
  const [messages, setMessages] = useState<WebmailMessage[]>(initialMockMessages)
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>('msg-101')
  const [searchQuery, setSearchQuery] = useState('')
  const [filterMode, setFilterMode] = useState<'all' | 'unread' | 'starred'>('all')

  // Modals & Inline Reply
  const [composeOpen, setComposeOpen] = useState(false)
  const [composeTo, setComposeTo] = useState('')
  const [composeSubject, setComposeSubject] = useState('')
  const [composeBody, setComposeBody] = useState('')
  const [replyBody, setReplyBody] = useState('')
  const [sendingReply, setSendingReply] = useState(false)
  const [replySuccess, setReplySuccess] = useState(false)

  // Mobile layout state
  const [mobileShowReading, setMobileShowReading] = useState(false)

  // Load user mailboxes
  async function loadMailboxes() {
    if (!supabase) return
    const sb = supabase
    try {
      const sites = await fetchSites(sb)
      const siteIds = sites.map((s) => s.id)
      const boxes = await fetchAllEmailBoxesForUser(sb, siteIds)
      setMailboxes(boxes)

      if (initialMailboxParam) {
        setActiveMailbox(initialMailboxParam)
      } else if (boxes.length > 0) {
        setActiveMailbox(boxes[0].emailAddress)
      } else if (sites.length > 0) {
        setActiveMailbox(`hello@${sites[0].site_domain}`)
      } else {
        setActiveMailbox('info@yourdomain.com')
      }
    } catch (err) {
      console.error('Failed to load user mailboxes:', err)
      setActiveMailbox('info@yourdomain.com')
    }
  }

  useEffect(() => {
    void loadMailboxes()
  }, [])

  // Sync active mailbox to mock messages
  useEffect(() => {
    if (activeMailbox) {
      setMessages((prev) =>
        prev.map((m) => ({
          ...m,
          toEmail: m.toEmail || activeMailbox,
          fromEmail: m.folder === 'sent' ? activeMailbox : m.fromEmail,
        })),
      )
    }
  }, [activeMailbox])

  // Filter messages for current folder and search
  const displayedMessages = useMemo(() => {
    return messages.filter((m) => {
      // Folder filter
      if (currentFolder === 'starred') {
        if (!m.isStarred) return false
      } else if (m.folder !== currentFolder) {
        return false
      }

      // FilterMode (unread/starred)
      if (filterMode === 'unread' && !m.isUnread) return false
      if (filterMode === 'starred' && !m.isStarred) return false

      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchesFrom = m.fromName.toLowerCase().includes(q) || m.fromEmail.toLowerCase().includes(q)
        const matchesSubject = m.subject.toLowerCase().includes(q)
        const matchesSnippet = m.snippet.toLowerCase().includes(q)
        if (!matchesFrom && !matchesSubject && !matchesSnippet) return false
      }

      return true
    })
  }, [messages, currentFolder, filterMode, searchQuery])

  // Selected message
  const activeMessage = useMemo(() => {
    return messages.find((m) => m.id === selectedMessageId) ?? displayedMessages[0] ?? null
  }, [messages, selectedMessageId, displayedMessages])

  // Mark as read when selected
  function selectMessage(msg: WebmailMessage) {
    setSelectedMessageId(msg.id)
    setMobileShowReading(true)
    if (msg.isUnread) {
      setMessages((prev) =>
        prev.map((m) => (m.id === msg.id ? { ...m, isUnread: false } : m)),
      )
    }
  }

  // Folder Counts
  const unreadCountInbox = messages.filter((m) => m.folder === 'inbox' && m.isUnread).length
  const starredCount = messages.filter((m) => m.isStarred).length

  // Quick message actions
  function toggleStar(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, isStarred: !m.isStarred } : m)),
    )
  }

  function handleArchive(id: string) {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, folder: 'archive' } : m)),
    )
  }

  function handleDelete(id: string) {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, folder: 'trash' } : m)),
    )
  }

  function toggleReadStatus(id: string) {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, isUnread: !m.isUnread } : m)),
    )
  }

  // Quick Inline Reply
  async function handleSendQuickReply() {
    if (!replyBody.trim() || !activeMessage) return
    setSendingReply(true)
    await new Promise((res) => setTimeout(res, 600))

    const newReply: WebmailMessage = {
      id: `msg-${Date.now()}`,
      mailbox: activeMailbox,
      folder: 'sent',
      fromName: 'Me',
      fromEmail: activeMailbox,
      toEmail: activeMessage.fromEmail,
      subject: activeMessage.subject.startsWith('Re:') ? activeMessage.subject : `Re: ${activeMessage.subject}`,
      snippet: replyBody.slice(0, 80),
      bodyHtml: `<p>${replyBody.replace(/\n/g, '<br/>')}</p>`,
      date: 'Just now',
      timestamp: Date.now(),
      isUnread: false,
      isStarred: false,
      hasAttachments: false,
      spfDkimVerified: true,
    }

    setMessages((prev) => [newReply, ...prev])
    setSendingReply(false)
    setReplyBody('')
    setReplySuccess(true)
    setTimeout(() => setReplySuccess(false), 3000)
  }

  // New Compose Submit
  function handleSendCompose(e: React.FormEvent) {
    e.preventDefault()
    if (!composeTo.trim() || !composeSubject.trim()) return

    const newMsg: WebmailMessage = {
      id: `msg-${Date.now()}`,
      mailbox: activeMailbox,
      folder: 'sent',
      fromName: 'Me',
      fromEmail: activeMailbox,
      toEmail: composeTo.trim(),
      subject: composeSubject.trim(),
      snippet: composeBody.slice(0, 80) || 'No preview available',
      bodyHtml: `<p>${composeBody.replace(/\n/g, '<br/>')}</p>`,
      date: 'Just now',
      timestamp: Date.now(),
      isUnread: false,
      isStarred: false,
      hasAttachments: false,
      spfDkimVerified: true,
    }

    setMessages((prev) => [newMsg, ...prev])
    setComposeOpen(false)
    setComposeTo('')
    setComposeSubject('')
    setComposeBody('')
    setCurrentFolder('sent')
  }

  const activeBoxRecord = mailboxes.find((b) => b.emailAddress === activeMailbox)
  const quotaMb = activeBoxRecord?.storageQuotaMb ?? 2048
  const usedMb = activeBoxRecord?.usedMb ?? 342.5
  const quotaPercent = Math.min(100, Math.round((usedMb / quotaMb) * 100))

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)] min-h-[640px] text-left">
      {/* Top Header Strip */}
      <div className="flex flex-wrap items-center justify-between pb-3 border-b border-[#232328] gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-[#5c4df0]/10 border border-[#5c4df0]/30 text-[#5c4df0]">
            <Mail className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-white tracking-tight">Modern Webmail</h1>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                Encrypted IMAP/TLS
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              High-speed, distraction-free email client for your custom domains.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Active Mailbox Switcher Dropdown */}
          <div className="flex items-center bg-[#161619] border border-[#232328] rounded-md px-3 py-1.5 gap-2">
            <span className="text-[11px] text-muted-foreground">Active Account:</span>
            <select
              aria-label="Select active webmail mailbox account"
              className="bg-transparent text-xs font-mono font-medium text-white focus:outline-none cursor-pointer"
              onChange={(e) => setActiveMailbox(e.target.value)}
              value={activeMailbox}
            >
              {mailboxes.length > 0 ? (
                mailboxes.map((b) => (
                  <option className="bg-[#161619] text-white" key={b.id} value={b.emailAddress}>
                    {b.emailAddress}
                  </option>
                ))
              ) : (
                <option className="bg-[#161619] text-white" value={activeMailbox}>
                  {activeMailbox}
                </option>
              )}
            </select>
          </div>

          <Link
            className="px-3 py-1.5 bg-[#202024] hover:bg-[#2c2c32] border border-[#2d2d34] text-white rounded-md text-xs font-medium transition flex items-center gap-1.5"
            to="/emails"
            title="Manage email accounts, forwarders and DNS"
          >
            <span>Mailbox Settings</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      {/* Main 3-Pane Webmail Workspace */}
      <div className="flex-1 flex overflow-hidden pt-3 gap-3">
        {/* PANE 1: Folders & Quota Sidebar (Hidden on small mobile) */}
        <div className="w-56 shrink-0 bg-[#161619] border border-[#232328] rounded-lg p-3 flex flex-col justify-between hidden md:flex">
          <div className="space-y-3">
            {/* Compose Button */}
            <button
              className="w-full py-2.5 px-4 bg-[#5c4df0] hover:bg-[#4b3ed0] text-white rounded-md text-xs font-semibold transition flex items-center justify-center gap-2 shadow-sm"
              onClick={() => setComposeOpen(true)}
            >
              <PenSquare className="h-4 w-4" />
              Compose Email
            </button>

            {/* Folder Navigation List */}
            <nav className="space-y-0.5 text-xs font-medium">
              {[
                { id: 'inbox', label: 'Inbox', icon: Inbox, badge: unreadCountInbox },
                { id: 'starred', label: 'Starred', icon: Star, badge: starredCount },
                { id: 'sent', label: 'Sent', icon: Send },
                { id: 'drafts', label: 'Drafts', icon: FileText },
                { id: 'archive', label: 'Archive', icon: Archive },
                { id: 'spam', label: 'Spam', icon: Zap },
                { id: 'trash', label: 'Trash', icon: Trash2 },
              ].map((f) => {
                const Icon = f.icon
                const isActive = currentFolder === f.id
                return (
                  <button
                    className={cn(
                      'w-full flex items-center justify-between px-3 py-2 rounded-md transition text-left',
                      isActive
                        ? 'bg-[#5c4df0]/15 text-white font-semibold border border-[#5c4df0]/30'
                        : 'text-muted-foreground hover:bg-[#202024] hover:text-white border border-transparent',
                    )}
                    key={f.id}
                    onClick={() => {
                      setCurrentFolder(f.id as WebmailFolder)
                      setMobileShowReading(false)
                    }}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className={cn('h-4 w-4', isActive ? 'text-[#5c4df0]' : 'text-muted-foreground')} />
                      <span>{f.label}</span>
                    </div>
                    {f.badge && f.badge > 0 ? (
                      <span
                        className={cn(
                          'text-[10px] px-1.5 py-0.5 rounded-full font-bold',
                          isActive ? 'bg-[#5c4df0] text-white' : 'bg-[#232328] text-muted-foreground',
                        )}
                      >
                        {f.badge}
                      </span>
                    ) : null}
                  </button>
                )
              })}
            </nav>
          </div>

          {/* Mailbox Storage Footprint Card */}
          <div className="bg-[#121214] border border-[#232328] rounded-md p-3 space-y-2 text-xs">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Mailbox Quota</span>
              <span className="font-mono text-white font-medium">{quotaPercent}%</span>
            </div>
            <div className="h-1.5 w-full bg-[#202024] rounded-full overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all',
                  quotaPercent > 80 ? 'bg-rose-500' : 'bg-[#5c4df0]',
                )}
                style={{ width: `${quotaPercent}%` }}
              />
            </div>
            <div className="text-[10px] text-muted-foreground font-mono">
              {usedMb.toFixed(0)} MB of {quotaMb} MB used
            </div>
          </div>
        </div>

        {/* PANE 2: Message List */}
        <div
          className={cn(
            'w-full md:w-80 lg:w-96 shrink-0 bg-[#161619] border border-[#232328] rounded-lg flex flex-col overflow-hidden',
            mobileShowReading ? 'hidden md:flex' : 'flex',
          )}
        >
          {/* Search & Filter Bar */}
          <div className="p-3 border-b border-[#232328] space-y-2 bg-[#121214]">
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                className="w-full bg-[#161619] border border-[#232328] text-xs text-white rounded pl-8 pr-3 py-1.5 placeholder:text-muted-foreground focus:outline-none focus:border-[#5c4df0]"
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search messages..."
                type="text"
                value={searchQuery}
              />
              {searchQuery && (
                <button
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white"
                  onClick={() => setSearchQuery('')}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1">
                {(['all', 'unread', 'starred'] as const).map((mode) => (
                  <button
                    className={cn(
                      'px-2 py-1 rounded text-[11px] capitalize transition font-medium',
                      filterMode === mode
                        ? 'bg-[#202024] text-white border border-[#2d2d34]'
                        : 'text-muted-foreground hover:text-white',
                    )}
                    key={mode}
                    onClick={() => setFilterMode(mode)}
                  >
                    {mode}
                  </button>
                ))}
              </div>

              <span className="text-[11px] text-muted-foreground">
                {displayedMessages.length} {displayedMessages.length === 1 ? 'msg' : 'msgs'}
              </span>
            </div>
          </div>

          {/* Messages Scroll Area */}
          <div className="flex-1 overflow-y-auto divide-y divide-[#232328]">
            {displayedMessages.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground space-y-2">
                <Inbox className="h-8 w-8 mx-auto opacity-30" />
                <div>No messages found in {currentFolder}.</div>
              </div>
            ) : (
              displayedMessages.map((msg) => {
                const isSelected = msg.id === activeMessage?.id
                return (
                  <div
                    className={cn(
                      'p-3.5 transition cursor-pointer relative group text-left',
                      isSelected
                        ? 'bg-[#202026] border-l-2 border-[#5c4df0]'
                        : 'hover:bg-[#1c1c20]',
                      msg.isUnread ? 'bg-[#18181d]' : 'opacity-90',
                    )}
                    key={msg.id}
                    onClick={() => selectMessage(msg)}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {msg.isUnread && (
                          <div className="h-2 w-2 rounded-full bg-[#5c4df0] shrink-0" />
                        )}
                        <span
                          className={cn(
                            'text-xs truncate',
                            msg.isUnread ? 'font-bold text-white' : 'font-medium text-white/90',
                          )}
                        >
                          {msg.fromName}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[10px] text-muted-foreground font-mono">{msg.date}</span>
                        <button
                          className="text-muted-foreground hover:text-amber-400 transition"
                          onClick={(e) => toggleStar(e, msg.id)}
                          title={msg.isStarred ? 'Unstar' : 'Star'}
                        >
                          <Star
                            className={cn(
                              'h-3.5 w-3.5',
                              msg.isStarred ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground',
                            )}
                          />
                        </button>
                      </div>
                    </div>

                    <div
                      className={cn(
                        'text-xs truncate mb-1',
                        msg.isUnread ? 'font-semibold text-white' : 'text-white/80',
                      )}
                    >
                      {msg.subject}
                    </div>

                    <div className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                      {msg.snippet}
                    </div>

                    {msg.hasAttachments && (
                      <div className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Paperclip className="h-3 w-3" />
                        <span>Attachment</span>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* PANE 3: Reading & Action Pane */}
        <div
          className={cn(
            'flex-1 bg-[#161619] border border-[#232328] rounded-lg flex flex-col overflow-hidden',
            !mobileShowReading ? 'hidden md:flex' : 'flex',
          )}
        >
          {activeMessage ? (
            <div className="flex-1 flex flex-col h-full overflow-hidden">
              {/* Message Header & Action Toolbar */}
              <div className="p-4 border-b border-[#232328] bg-[#121214] space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      className="md:hidden p-1.5 rounded hover:bg-[#202024] text-white"
                      onClick={() => setMobileShowReading(false)}
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </button>
                    <h2 className="text-base font-bold text-white tracking-tight line-clamp-1">
                      {activeMessage.subject}
                    </h2>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      className="p-1.5 rounded hover:bg-[#202024] text-muted-foreground hover:text-white transition"
                      onClick={() => toggleReadStatus(activeMessage.id)}
                      title={activeMessage.isUnread ? 'Mark as read' : 'Mark as unread'}
                    >
                      <Mail className="h-4 w-4" />
                    </button>
                    <button
                      className="p-1.5 rounded hover:bg-[#202024] text-muted-foreground hover:text-amber-400 transition"
                      onClick={(e) => toggleStar(e, activeMessage.id)}
                      title="Star message"
                    >
                      <Star
                        className={cn(
                          'h-4 w-4',
                          activeMessage.isStarred ? 'fill-amber-400 text-amber-400' : '',
                        )}
                      />
                    </button>
                    <button
                      className="p-1.5 rounded hover:bg-[#202024] text-muted-foreground hover:text-white transition"
                      onClick={() => handleArchive(activeMessage.id)}
                      title="Archive message"
                    >
                      <Archive className="h-4 w-4" />
                    </button>
                    <button
                      className="p-1.5 rounded hover:bg-rose-500/20 text-muted-foreground hover:text-rose-400 transition"
                      onClick={() => handleDelete(activeMessage.id)}
                      title="Delete message"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Sender Profile Strip */}
                <div className="flex items-center justify-between text-xs pt-1">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-[#5c4df0]/20 border border-[#5c4df0]/40 flex items-center justify-center font-bold text-[#a89cf7]">
                      {activeMessage.fromName.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white">{activeMessage.fromName}</span>
                        <span className="text-muted-foreground font-mono text-[11px]">
                          &lt;{activeMessage.fromEmail}&gt;
                        </span>
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        To: <span className="text-white/80 font-mono">{activeMessage.toEmail}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {activeMessage.spfDkimVerified && (
                      <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded flex items-center gap-1">
                        <ShieldCheck className="h-3 w-3" />
                        SPF / DKIM Verified
                      </span>
                    )}
                    <span className="text-[11px] text-muted-foreground font-mono">
                      {formatDateLabel(new Date(activeMessage.timestamp).toISOString())}
                    </span>
                  </div>
                </div>
              </div>

              {/* Message Body Content */}
              <div className="flex-1 p-6 overflow-y-auto space-y-6 text-sm text-white/90 leading-relaxed font-sans">
                <div
                  className="prose prose-invert max-w-none text-xs leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: activeMessage.bodyHtml }}
                />

                {/* Attachments Section */}
                {activeMessage.attachments && activeMessage.attachments.length > 0 && (
                  <div className="pt-4 border-t border-[#232328] space-y-2">
                    <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                      <Paperclip className="h-3.5 w-3.5 text-[#5c4df0]" />
                      <span>{activeMessage.attachments.length} Attachments</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {activeMessage.attachments.map((att) => (
                        <div
                          className="flex items-center justify-between p-2.5 bg-[#121214] border border-[#232328] rounded-md text-xs hover:border-[#5c4df0]/40 transition"
                          key={att.id}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <FileText className="h-4 w-4 text-[#5c4df0] shrink-0" />
                            <div className="min-w-0">
                              <div className="text-white font-medium truncate">{att.name}</div>
                              <div className="text-[10px] text-muted-foreground">{att.size}</div>
                            </div>
                          </div>
                          <button
                            className="p-1 hover:bg-[#202024] rounded text-muted-foreground hover:text-white transition ml-2"
                            onClick={() => alert(`Downloading attachment: ${att.name}`)}
                            title="Download attachment"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Bottom Quick Reply Section */}
              <div className="p-4 border-t border-[#232328] bg-[#121214] space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground flex items-center gap-1.5 font-medium">
                    <Reply className="h-3.5 w-3.5 text-[#5c4df0]" />
                    Quick Reply to {activeMessage.fromName}
                  </span>
                  {replySuccess && (
                    <span className="text-emerald-400 text-xs font-medium flex items-center gap-1">
                      <Check className="h-3.5 w-3.5" /> Sent successfully
                    </span>
                  )}
                </div>

                <div className="flex items-end gap-2">
                  <textarea
                    className="flex-1 bg-[#161619] border border-[#232328] rounded-md px-3 py-2 text-xs text-white placeholder:text-muted-foreground focus:outline-none focus:border-[#5c4df0] resize-none h-16"
                    onChange={(e) => setReplyBody(e.target.value)}
                    placeholder="Write a quick reply... (Press Send)"
                    value={replyBody}
                  />
                  <button
                    className="px-4 py-2.5 bg-[#5c4df0] hover:bg-[#4b3ed0] text-white rounded-md text-xs font-semibold transition flex items-center gap-1.5 disabled:opacity-50 shrink-0 shadow-sm"
                    disabled={!replyBody.trim() || sendingReply}
                    onClick={() => void handleSendQuickReply()}
                  >
                    <Send className="h-3.5 w-3.5" />
                    {sendingReply ? 'Sending...' : 'Send'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-muted-foreground text-xs space-y-2">
              <Mail className="h-10 w-10 opacity-20" />
              <div>Select a message from the list to read.</div>
            </div>
          )}
        </div>
      </div>

      {/* Modal: Rich Compose */}
      <Dialog onOpenChange={setComposeOpen} open={composeOpen}>
        <DialogContent className="sm:max-w-[560px] bg-[#161619] border-[#232328] text-white">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold flex items-center gap-2">
              <PenSquare className="h-4 w-4 text-[#5c4df0]" />
              New Message
            </DialogTitle>
          </DialogHeader>

          <form className="space-y-3 text-xs pt-2" onSubmit={handleSendCompose}>
            <div className="flex items-center border-b border-[#232328] pb-2">
              <span className="w-16 text-muted-foreground">From:</span>
              <span className="font-mono text-white font-medium">{activeMailbox}</span>
            </div>

            <div className="flex items-center border-b border-[#232328] pb-2">
              <span className="w-16 text-muted-foreground">To:</span>
              <input
                className="flex-1 bg-transparent text-white placeholder:text-muted-foreground focus:outline-none"
                onChange={(e) => setComposeTo(e.target.value)}
                placeholder="recipient@example.com"
                required
                type="email"
                value={composeTo}
              />
            </div>

            <div className="flex items-center border-b border-[#232328] pb-2">
              <span className="w-16 text-muted-foreground">Subject:</span>
              <input
                className="flex-1 bg-transparent text-white placeholder:text-muted-foreground focus:outline-none"
                onChange={(e) => setComposeSubject(e.target.value)}
                placeholder="Subject of the email"
                required
                type="text"
                value={composeSubject}
              />
            </div>

            <div>
              <textarea
                className="w-full bg-[#121214] border border-[#232328] rounded-md p-3 text-white placeholder:text-muted-foreground focus:outline-none focus:border-[#5c4df0] h-44 resize-none leading-relaxed"
                onChange={(e) => setComposeBody(e.target.value)}
                placeholder="Write your email here..."
                required
                value={composeBody}
              />
            </div>

            <DialogFooter className="flex items-center justify-between pt-2">
              <button
                className="px-3 py-1.5 bg-[#202024] hover:bg-[#2c2c32] text-white rounded text-xs transition"
                onClick={() => setComposeOpen(false)}
                type="button"
              >
                Cancel
              </button>

              <button
                className="px-4 py-2 bg-[#5c4df0] hover:bg-[#4b3ed0] text-white rounded text-xs font-medium transition flex items-center gap-1.5 shadow-sm"
                type="submit"
              >
                <Send className="h-3.5 w-3.5" />
                Send Message
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
