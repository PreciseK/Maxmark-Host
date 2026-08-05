import { useCallback, useEffect, useRef, useState } from 'react'

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
  const { session } = useSession()
  const [conversations, setConversations] = useState<SupportConversation[]>([])
  const [messagesByConv, setMessagesByConv] = useState<Record<string, SupportMessage[]>>({})
  const [activeId, setActiveId] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [attaching, setAttaching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const activeIdRef = useRef<string | null>(null)
  activeIdRef.current = activeId

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

  const send = useCallback(
    async (body: string) => {
      const trimmed = body.trim()
      const conversationId = activeIdRef.current
      if (!trimmed || !conversationId) return

      setError(null)

      if (!supabase || !session) return

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
    [session, appendLocal],
  )

  const attach = useCallback(
    async (file: File) => {
      const conversationId = activeIdRef.current
      if (!conversationId) return
      setError(null)

      if (!supabase || !session) return

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
    [session, appendLocal],
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

      if (!supabase || !session) return null

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
    [session],
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
