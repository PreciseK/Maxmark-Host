import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { mockAdminUsers } from '@/data/mockAdmin'
import { DEMO_ADMIN_ID, mockConversations, mockMessagesByConversation } from '@/data/mockSupport'
import { fetchAllProfiles, type AdminProfile } from '@/lib/db/admin'
import {
  fetchAdminInbox,
  fetchMessages,
  markConversationRead,
  sendMessage,
  setConversationStatus,
  type ConversationStatus,
  type SupportConversation,
  type SupportMessage,
} from '@/lib/db/support'
import {
  subscribeToAdminInbox,
  subscribeToConversationMessages,
} from '@/lib/support-realtime'
import { useSession } from '@/lib/session-store'
import { supabase } from '@/lib/supabase'
import { uploadChatAttachment, getChatAttachmentUrl } from '@/lib/storage'
import { cn, formatDateLabel } from '@/lib/utils'
import { MessageThread } from '@/components/support/message-thread'
import {
  AdminPageHeader,
  DemoNotice,
  StatusBadge,
  type BadgeTone,
} from '@/components/admin/admin-ui'

const statusTone: Record<ConversationStatus, BadgeTone> = {
  open: 'green',
  pending: 'sky',
  closed: 'zinc',
}

const statusFilters = ['all', 'open', 'pending', 'closed'] as const
type StatusFilter = (typeof statusFilters)[number]

// Defensive refetch cadence: realtime delivery of other users' rows depends
// on RLS-authorized sockets, so the inbox also re-pulls periodically.
const INBOX_POLL_MS = 15_000

export function AdminSupport() {
  const { session, isDemo, setAdminSupportUnread } = useSession()

  const [conversations, setConversations] = useState<SupportConversation[]>(
    isDemo ? mockConversations : [],
  )
  const [messagesByConv, setMessagesByConv] = useState<Record<string, SupportMessage[]>>(
    isDemo ? mockMessagesByConversation : {},
  )
  const [profiles, setProfiles] = useState<AdminProfile[]>(mockAdminUsers)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [sending, setSending] = useState(false)
  const [attaching, setAttaching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showDemoNotice, setShowDemoNotice] = useState(false)

  const activeIdRef = useRef<string | null>(null)
  activeIdRef.current = activeId

  const syncBadge = useCallback(
    (rows: SupportConversation[]) => {
      setAdminSupportUnread(
        rows
          .filter((c) => c.status !== 'closed')
          .reduce((sum, c) => sum + c.adminUnreadCount, 0),
      )
    },
    [setAdminSupportUnread],
  )

  const upsertConversation = useCallback((conversation: SupportConversation) => {
    setConversations((prev) => {
      const exists = prev.some((c) => c.id === conversation.id)
      const next = exists
        ? prev.map((c) => (c.id === conversation.id ? conversation : c))
        : [conversation, ...prev]
      next.sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt))
      return next
    })
  }, [])

  // Badge follows the list. Kept in an effect — calling the session setter
  // inside a setConversations updater would setState during render.
  useEffect(() => {
    syncBadge(conversations)
  }, [conversations, syncBadge])

  // Live: initial load + realtime + polling fallback.
  useEffect(() => {
    if (!supabase || !session || isDemo) return
    const sb = supabase
    let cancelled = false

    const refresh = () => {
      fetchAdminInbox(sb)
        .then((rows) => {
          if (!cancelled) setConversations(rows)
        })
        .catch((err) => console.warn('Admin inbox fetch failed:', err))
    }

    refresh()
    fetchAllProfiles(sb)
      .then((rows) => {
        if (!cancelled && rows.length > 0) setProfiles(rows)
      })
      .catch(() => undefined)

    const unsubscribe = subscribeToAdminInbox(sb, upsertConversation, 'support-admin-inbox')
    const interval = window.setInterval(refresh, INBOX_POLL_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      unsubscribe()
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [session, isDemo, upsertConversation])

  // Live: messages for the open thread.
  useEffect(() => {
    if (!supabase || !session || isDemo || !activeId) return
    const sb = supabase

    fetchMessages(sb, activeId)
      .then((rows) => setMessagesByConv((prev) => ({ ...prev, [activeId]: rows })))
      .catch((err) => console.warn('Admin thread fetch failed:', err))

    const unsubscribe = subscribeToConversationMessages(sb, activeId, (message) => {
      setMessagesByConv((prev) => {
        const existing = prev[message.conversationId] ?? []
        if (existing.some((m) => m.id === message.id)) return prev
        return { ...prev, [message.conversationId]: [...existing, message] }
      })
      if (message.senderRole === 'user' && activeIdRef.current === message.conversationId) {
        void markConversationRead(sb, message.conversationId, 'admin').catch(() => undefined)
      }
    })

    return unsubscribe
  }, [session, isDemo, activeId])

  const profileByUser = useMemo(
    () => new Map(profiles.map((p) => [p.userId, p.displayName || p.accountId])),
    [profiles],
  )

  const filtered = useMemo(
    () => conversations.filter((c) => filter === 'all' || c.status === filter),
    [conversations, filter],
  )

  const activeConversation = conversations.find((c) => c.id === activeId) ?? null
  const activeMessages = activeId ? (messagesByConv[activeId] ?? []) : []

  function openThread(id: string) {
    setActiveId(id)
    setError(null)
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, adminUnreadCount: 0 } : c)),
    )
    if (supabase && session && !isDemo) {
      void markConversationRead(supabase, id, 'admin').catch(() => undefined)
    }
  }

  const applyLocal = useCallback((message: SupportMessage) => {
    setMessagesByConv((prev) => {
      const existing = prev[message.conversationId] ?? []
      if (existing.some((m) => m.id === message.id)) return prev
      return { ...prev, [message.conversationId]: [...existing, message] }
    })
    setConversations((prev) =>
      prev
        .map((c) =>
          c.id === message.conversationId
            ? {
                ...c,
                lastMessageAt: message.createdAt,
                lastMessagePreview: message.body
                  ? message.body.slice(0, 120)
                  : message.attachment
                    ? `📎 ${message.attachment.name}`
                    : '',
                status: c.status === 'open' ? ('pending' as const) : c.status,
              }
            : c,
        )
        .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt)),
    )
  }, [])

  async function handleSend(body: string) {
    const conversationId = activeIdRef.current
    if (!conversationId) return
    setError(null)

    if (isDemo || !supabase || !session) {
      applyLocal({
        id: `demo-admin-msg-${Date.now()}`,
        conversationId,
        senderId: DEMO_ADMIN_ID,
        senderRole: 'admin',
        body,
        attachment: null,
        createdAt: new Date().toISOString(),
      })
      setShowDemoNotice(true)
      return
    }

    setSending(true)
    try {
      const message = await sendMessage(supabase, conversationId, body)
      applyLocal(message)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Message failed to send')
    } finally {
      setSending(false)
    }
  }

  async function handleAttach(file: File) {
    const conversationId = activeIdRef.current
    if (!conversationId) return
    setError(null)

    if (isDemo || !supabase || !session) {
      applyLocal({
        id: `demo-admin-attach-${Date.now()}`,
        conversationId,
        senderId: DEMO_ADMIN_ID,
        senderRole: 'admin',
        body: '',
        attachment: { key: `demo/${file.name}`, name: file.name, size: file.size, type: file.type },
        createdAt: new Date().toISOString(),
      })
      setShowDemoNotice(true)
      return
    }

    setAttaching(true)
    try {
      const uploaded = await uploadChatAttachment(supabase, conversationId, file)
      const message = await sendMessage(supabase, conversationId, '', uploaded)
      applyLocal(message)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Attachment upload failed')
    } finally {
      setAttaching(false)
    }
  }

  async function handleOpenAttachment(message: SupportMessage) {
    if (!message.attachment) return
    if (isDemo || !supabase || !session) return
    setError(null)
    try {
      const url = await getChatAttachmentUrl(supabase, message.id)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to open attachment')
    }
  }

  async function handleStatusChange(status: ConversationStatus) {
    const conversationId = activeIdRef.current
    if (!conversationId) return

    const apply = () =>
      setConversations((prev) =>
        prev.map((c) => (c.id === conversationId ? { ...c, status } : c)),
      )

    if (isDemo || !supabase || !session) {
      apply()
      setShowDemoNotice(true)
      return
    }

    try {
      await setConversationStatus(supabase, conversationId, status)
      apply()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Status update failed')
    }
  }

  return (
    <div className="space-y-6 h-full flex flex-col">
      <AdminPageHeader
        description="Live customer conversations. Replies deliver instantly to the customer's chat widget."
        title="Support inbox"
      />

      {showDemoNotice ? <DemoNotice /> : null}

      <div className="flex-1 min-h-[520px] grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-0 bg-[#161619] border border-[#232328] rounded-lg overflow-hidden">
        {/* Conversation list */}
        <div className="border-r border-[#232328] flex flex-col min-h-0">
          <div className="flex items-center gap-1 p-2 border-b border-[#232328] bg-[#121214] shrink-0">
            {statusFilters.map((status) => (
              <button
                className={cn(
                  'px-3 py-1.5 rounded text-xs font-semibold capitalize transition',
                  filter === status
                    ? 'bg-[#262629] text-white'
                    : 'text-muted-foreground hover:text-white',
                )}
                key={status}
                onClick={() => setFilter(status)}
              >
                {status}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-[#232328]">
            {filtered.map((conversation) => (
              <button
                className={cn(
                  'w-full text-left px-4 py-3 transition flex flex-col gap-1',
                  activeId === conversation.id ? 'bg-[#1f1f24]' : 'hover:bg-[#1c1c20]',
                )}
                key={conversation.id}
                onClick={() => openThread(conversation.id)}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-white truncate">
                    {conversation.subject}
                  </p>
                  {conversation.adminUnreadCount > 0 ? (
                    <span className="h-2 w-2 rounded-full bg-[#5c4df0] shrink-0" />
                  ) : null}
                </div>
                <p className="text-[11px] text-muted-foreground truncate">
                  {conversation.lastMessagePreview || 'No messages yet'}
                </p>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] text-muted-foreground/80 truncate">
                    {profileByUser.get(conversation.userId) ??
                      conversation.userId.slice(0, 8)}
                    {' · '}
                    {formatDateLabel(conversation.lastMessageAt)}
                  </span>
                  <StatusBadge tone={statusTone[conversation.status]}>
                    {conversation.status}
                  </StatusBadge>
                </div>
              </button>
            ))}
            {filtered.length === 0 ? (
              <p className="px-4 py-10 text-center text-xs text-muted-foreground">
                No conversations{filter === 'all' ? '' : ` with status “${filter}”`}.
              </p>
            ) : null}
          </div>
        </div>

        {/* Thread pane */}
        <div className="flex flex-col min-h-0">
          {activeConversation ? (
            <>
              <div className="flex items-center gap-3 px-4 py-3 border-b border-[#232328] bg-[#121214] shrink-0">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-white truncate">
                    {activeConversation.subject}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {profileByUser.get(activeConversation.userId) ??
                      activeConversation.userId.slice(0, 8)}
                    {' · opened '}
                    {formatDateLabel(activeConversation.createdAt)}
                  </p>
                </div>
                <select
                  className="bg-[#1c1c1f] border border-[#2d2d34] rounded-md px-2 py-1.5 text-xs text-white focus:outline-none focus:border-[#5c4df0]/50 capitalize"
                  onChange={(event) =>
                    void handleStatusChange(event.target.value as ConversationStatus)
                  }
                  value={activeConversation.status}
                >
                  <option value="open">open</option>
                  <option value="pending">pending</option>
                  <option value="closed">closed</option>
                </select>
              </div>
              <MessageThread
                attaching={attaching}
                error={error}
                messages={activeMessages}
                onAttach={(file) => void handleAttach(file)}
                onOpenAttachment={(message) => void handleOpenAttachment(message)}
                onSend={(body) => void handleSend(body)}
                sending={sending}
                viewerRole="admin"
              />
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-sm text-muted-foreground">
                Select a conversation to view the thread.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
