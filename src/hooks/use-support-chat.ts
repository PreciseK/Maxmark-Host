import { useCallback, useEffect, useRef, useState } from 'react'

import {
  cannedAdminReply,
  DEMO_ADMIN_ID,
  DEMO_USER_ID,
  mockConversations,
  mockMessagesByConversation,
} from '@/data/mockSupport'
import {
  createConversation,
  fetchConversations,
  fetchMessages,
  markConversationRead,
  sendMessage,
  type SupportConversation,
  type SupportMessage,
} from '@/lib/db/support'
import { subscribeToConversationMessages } from '@/lib/support-realtime'
import { useSession } from '@/lib/session-store'
import { supabase } from '@/lib/supabase'
import { uploadChatAttachment } from '@/lib/storage'

// Customer-side chat state shared by the floating widget and /support.
// Demo mode (no Supabase) runs entirely on mockSupport data with a canned
// auto-reply so the chat feels alive; live mode uses RLS reads/writes plus a
// realtime subscription on the open thread.

export interface UseSupportChat {
  conversations: SupportConversation[]
  activeId: string | null
  messages: SupportMessage[]
  sending: boolean
  attaching: boolean
  error: string | null
  openConversation: (id: string) => void
  closeConversation: () => void
  send: (body: string) => Promise<void>
  attach: (file: File) => Promise<void>
  createCase: (subject: string, body: string) => Promise<string | null>
}

export function useSupportChat(): UseSupportChat {
  const { session, isDemo, setSupportUnread } = useSession()
  const [conversations, setConversations] = useState<SupportConversation[]>(
    isDemo ? mockConversations : [],
  )
  const [messagesByConv, setMessagesByConv] = useState<Record<string, SupportMessage[]>>(
    isDemo ? mockMessagesByConversation : {},
  )
  const [activeId, setActiveId] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [attaching, setAttaching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const activeIdRef = useRef<string | null>(null)
  activeIdRef.current = activeId

  // Demo badge follows the local list (an effect — never setState another
  // component's state from inside a setConversations updater). Live mode's
  // badge is owned by SessionProvider's realtime subscription instead.
  useEffect(() => {
    if (!isDemo) return
    setSupportUnread(conversations.reduce((sum, c) => sum + c.userUnreadCount, 0))
  }, [isDemo, conversations, setSupportUnread])

  // Live: load the customer's conversations once a session exists.
  useEffect(() => {
    if (!supabase || !session) return
    const sb = supabase
    let cancelled = false

    fetchConversations(sb)
      .then((rows) => {
        if (!cancelled) setConversations(rows)
      })
      .catch((err) => console.warn('Support conversations fetch failed:', err))

    return () => {
      cancelled = true
    }
  }, [session])

  // Live: subscribe to new messages in the open thread.
  useEffect(() => {
    if (!supabase || !session || !activeId) return
    const sb = supabase

    const unsubscribe = subscribeToConversationMessages(sb, activeId, (message) => {
      setMessagesByConv((prev) => {
        const existing = prev[message.conversationId] ?? []
        if (existing.some((m) => m.id === message.id)) return prev
        return { ...prev, [message.conversationId]: [...existing, message] }
      })
      // Reading along in an open thread: immediately clear our counter.
      if (message.senderRole === 'admin' && activeIdRef.current === message.conversationId) {
        void markConversationRead(sb, message.conversationId, 'user').catch(() => undefined)
      }
    })

    return unsubscribe
  }, [session, activeId])

  const openConversation = useCallback(
    (id: string) => {
      setActiveId(id)
      setError(null)
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, userUnreadCount: 0 } : c)),
      )

      if (supabase && session) {
        const sb = supabase
        fetchMessages(sb, id)
          .then((rows) =>
            setMessagesByConv((prev) => {
              const optimistic = prev[id] ?? []
              const merged = [...rows]
              for (const message of optimistic) {
                if (!merged.some((m) => m.id === message.id)) merged.push(message)
              }
              return { ...prev, [id]: merged }
            }),
          )
          .catch((err) => console.warn('Support messages fetch failed:', err))
        void markConversationRead(sb, id, 'user').catch(() => undefined)
      }
    },
    [session],
  )

  const closeConversation = useCallback(() => setActiveId(null), [])

  const appendLocal = useCallback((message: SupportMessage) => {
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
                status: message.senderRole === 'user' ? ('open' as const) : c.status,
              }
            : c,
        )
        .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt)),
    )
  }, [])

  const scheduleDemoReply = useCallback(
    (conversationId: string) => {
      window.setTimeout(() => {
        const reply: SupportMessage = {
          id: `demo-reply-${Date.now()}`,
          conversationId,
          senderId: DEMO_ADMIN_ID,
          senderRole: 'admin',
          body: cannedAdminReply,
          attachment: null,
          createdAt: new Date().toISOString(),
        }
        appendLocal(reply)
        setConversations((prev) =>
          prev.map((c) =>
            c.id === conversationId
              ? {
                  ...c,
                  lastMessageAt: reply.createdAt,
                  lastMessagePreview: reply.body.slice(0, 120),
                  status: 'pending' as const,
                  userUnreadCount:
                    activeIdRef.current === conversationId ? 0 : c.userUnreadCount + 1,
                }
              : c,
          ),
        )
      }, 1500)
    },
    [appendLocal],
  )

  const send = useCallback(
    async (body: string) => {
      const trimmed = body.trim()
      const conversationId = activeIdRef.current
      if (!trimmed || !conversationId) return

      setError(null)

      if (isDemo || !supabase || !session) {
        appendLocal({
          id: `demo-msg-${Date.now()}`,
          conversationId,
          senderId: DEMO_USER_ID,
          senderRole: 'user',
          body: trimmed,
          attachment: null,
          createdAt: new Date().toISOString(),
        })
        scheduleDemoReply(conversationId)
        return
      }

      setSending(true)
      try {
        const message = await sendMessage(supabase, conversationId, trimmed)
        appendLocal(message)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Message failed to send')
      } finally {
        setSending(false)
      }
    },
    [isDemo, session, appendLocal, scheduleDemoReply],
  )

  const attach = useCallback(
    async (file: File) => {
      const conversationId = activeIdRef.current
      if (!conversationId) return
      setError(null)

      if (isDemo || !supabase || !session) {
        appendLocal({
          id: `demo-attach-${Date.now()}`,
          conversationId,
          senderId: DEMO_USER_ID,
          senderRole: 'user',
          body: '',
          attachment: { key: `demo/${file.name}`, name: file.name, size: file.size, type: file.type },
          createdAt: new Date().toISOString(),
        })
        scheduleDemoReply(conversationId)
        return
      }

      setAttaching(true)
      try {
        const uploaded = await uploadChatAttachment(supabase, conversationId, file)
        const message = await sendMessage(supabase, conversationId, '', uploaded)
        appendLocal(message)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Attachment upload failed')
      } finally {
        setAttaching(false)
      }
    },
    [isDemo, session, appendLocal, scheduleDemoReply],
  )

  const createCase = useCallback(
    async (subject: string, body: string): Promise<string | null> => {
      const trimmedSubject = subject.trim()
      const trimmedBody = body.trim()
      if (!trimmedSubject || !trimmedBody) {
        setError('Subject and message are required.')
        return null
      }

      setError(null)

      if (isDemo || !supabase || !session) {
        const now = new Date().toISOString()
        const conversation: SupportConversation = {
          id: `demo-conv-${Date.now()}`,
          userId: DEMO_USER_ID,
          subject: trimmedSubject,
          status: 'open',
          lastMessageAt: now,
          lastMessagePreview: trimmedBody.slice(0, 120),
          userUnreadCount: 0,
          adminUnreadCount: 1,
          createdAt: now,
        }
        setConversations((prev) => [conversation, ...prev])
        setMessagesByConv((prev) => ({
          ...prev,
          [conversation.id]: [
            {
              id: `demo-msg-${Date.now()}`,
              conversationId: conversation.id,
              senderId: DEMO_USER_ID,
              senderRole: 'user',
              body: trimmedBody,
              attachment: null,
              createdAt: now,
            },
          ],
        }))
        setActiveId(conversation.id)
        scheduleDemoReply(conversation.id)
        return conversation.id
      }

      setSending(true)
      try {
        const { conversation, message } = await createConversation(
          supabase,
          trimmedSubject,
          trimmedBody,
        )
        setConversations((prev) => [conversation, ...prev])
        setMessagesByConv((prev) => ({ ...prev, [conversation.id]: [message] }))
        setActiveId(conversation.id)
        return conversation.id
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to open the case')
        return null
      } finally {
        setSending(false)
      }
    },
    [isDemo, session, scheduleDemoReply],
  )

  return {
    conversations,
    activeId,
    messages: activeId ? (messagesByConv[activeId] ?? []) : [],
    sending,
    attaching,
    error,
    openConversation,
    closeConversation,
    send,
    attach,
    createCase,
  }
}
