import { useState, type FormEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronLeft, MessageSquare, Plus, X } from 'lucide-react'

import { useSupportChat } from '@/hooks/use-support-chat'
import { useSession } from '@/lib/session-store'
import { cn, formatDateLabel } from '@/lib/utils'
import { MessageThread } from '@/components/support/message-thread'
import { StatusBadge, type BadgeTone } from '@/components/admin/admin-ui'
import type { ConversationStatus } from '@/lib/db/support'

const statusTone: Record<ConversationStatus, BadgeTone> = {
  open: 'green',
  pending: 'sky',
  closed: 'zinc',
}

/**
 * Floating support chat, mounted inside DashboardShell so it is available on
 * every customer page. Three panel views: conversation list, open thread,
 * and new-case form.
 */
export function ChatWidget() {
  const { session, isDemo, supportUnread } = useSession()
  const chat = useSupportChat()
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<'list' | 'thread' | 'new'>('list')
  const [subject, setSubject] = useState('')
  const [firstMessage, setFirstMessage] = useState('')

  // Without a session (and outside demo mode) there is nobody to chat as.
  if (!isDemo && !session) return null

  const activeConversation = chat.conversations.find((c) => c.id === chat.activeId) ?? null

  function openThread(id: string) {
    chat.openConversation(id)
    setView('thread')
  }

  function backToList() {
    chat.closeConversation()
    setView('list')
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault()
    const id = await chat.createCase(subject, firstMessage)
    if (id) {
      setSubject('')
      setFirstMessage('')
      setView('thread')
    }
  }

  return (
    <>
      <AnimatePresence>
        {open ? (
          <motion.div
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="fixed bottom-24 right-6 z-50 w-[min(94vw,380px)] h-[520px] max-h-[calc(100vh-140px)] bg-[#161618] border border-[#2d2d34] rounded-xl shadow-2xl overflow-hidden flex flex-col"
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            {/* Panel header */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-[#232328] bg-[#121214] shrink-0">
              {view !== 'list' ? (
                <button
                  aria-label="Back to conversations"
                  className="text-muted-foreground hover:text-white transition"
                  onClick={backToList}
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
              ) : null}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-white truncate">
                  {view === 'thread' && activeConversation
                    ? activeConversation.subject
                    : view === 'new'
                      ? 'New case'
                      : 'Maxmark Support'}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {view === 'thread' && activeConversation
                    ? `Status: ${activeConversation.status}`
                    : 'We typically reply within a few minutes'}
                </p>
              </div>
              {view === 'list' ? (
                <button
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-[#5c4df0] hover:bg-[#4d3fe0] rounded-md text-[11px] font-semibold text-white transition"
                  onClick={() => setView('new')}
                >
                  <Plus className="h-3 w-3" />
                  New
                </button>
              ) : null}
              <button
                aria-label="Close chat"
                className="text-muted-foreground hover:text-white transition"
                onClick={() => setOpen(false)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Panel body */}
            {view === 'list' ? (
              <div className="flex-1 overflow-y-auto divide-y divide-[#232328]">
                {chat.conversations.map((conversation) => (
                  <button
                    className="w-full text-left px-4 py-3 hover:bg-[#1c1c20] transition flex flex-col gap-1"
                    key={conversation.id}
                    onClick={() => openThread(conversation.id)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-white truncate">
                        {conversation.subject}
                      </p>
                      {conversation.userUnreadCount > 0 ? (
                        <span className="bg-[#5c4df0] text-[10px] font-semibold px-1.5 py-0.5 rounded-full text-white shrink-0">
                          {conversation.userUnreadCount}
                        </span>
                      ) : (
                        <StatusBadge tone={statusTone[conversation.status]}>
                          {conversation.status}
                        </StatusBadge>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {conversation.lastMessagePreview || 'No messages yet'}
                    </p>
                    <p className="text-[10px] text-muted-foreground/70">
                      {formatDateLabel(conversation.lastMessageAt)}
                    </p>
                  </button>
                ))}
                {chat.conversations.length === 0 ? (
                  <div className="px-4 py-10 text-center space-y-3">
                    <p className="text-xs text-muted-foreground">
                      No conversations yet. Start one and our team will jump in.
                    </p>
                    <button
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#5c4df0] hover:bg-[#4d3fe0] rounded-md text-xs font-semibold text-white transition"
                      onClick={() => setView('new')}
                    >
                      <Plus className="h-4 w-4" />
                      Start a conversation
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}

            {view === 'thread' ? (
              <MessageThread
                disabled={activeConversation?.status === 'closed'}
                disabledHint="This case is closed — reply from the Support page to reopen it, or start a new case."
                error={chat.error}
                messages={chat.messages}
                onSend={(body) => void chat.send(body)}
                sending={chat.sending}
                viewerRole="user"
              />
            ) : null}

            {view === 'new' ? (
              <form className="flex-1 flex flex-col gap-4 p-4" onSubmit={handleCreate}>
                <div>
                  <label
                    className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5"
                    htmlFor="chat-subject"
                  >
                    Subject
                  </label>
                  <input
                    className="w-full bg-[#1c1c1f] border border-[#2d2d34] rounded-md px-3 py-2 text-xs text-white placeholder:text-muted-foreground focus:outline-none focus:border-[#5c4df0]/50 transition-colors"
                    id="chat-subject"
                    maxLength={200}
                    onChange={(event) => setSubject(event.target.value)}
                    placeholder="What do you need help with?"
                    type="text"
                    value={subject}
                  />
                </div>
                <div className="flex-1 flex flex-col">
                  <label
                    className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5"
                    htmlFor="chat-first-message"
                  >
                    Message
                  </label>
                  <textarea
                    className="flex-1 w-full bg-[#1c1c1f] border border-[#2d2d34] rounded-md px-3 py-2 text-xs text-white placeholder:text-muted-foreground focus:outline-none focus:border-[#5c4df0]/50 transition-colors resize-none"
                    id="chat-first-message"
                    maxLength={4000}
                    onChange={(event) => setFirstMessage(event.target.value)}
                    placeholder="Describe the issue, including the site or invoice involved…"
                    value={firstMessage}
                  />
                </div>
                {chat.error ? (
                  <p className="text-[11px] text-red-400">{chat.error}</p>
                ) : null}
                <button
                  className="w-full py-2.5 bg-[#5c4df0] hover:bg-[#4d3fe0] rounded-md text-xs font-semibold text-white transition disabled:opacity-50"
                  disabled={chat.sending || !subject.trim() || !firstMessage.trim()}
                  type="submit"
                >
                  {chat.sending ? 'Opening…' : 'Open case'}
                </button>
              </form>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Launcher */}
      <button
        aria-label={open ? 'Close support chat' : 'Open support chat'}
        className={cn(
          'fixed bottom-6 right-6 z-50 h-12 w-12 rounded-full flex items-center justify-center shadow-xl transition',
          open
            ? 'bg-[#232328] hover:bg-[#2c2c32] text-white'
            : 'bg-[#5c4df0] hover:bg-[#4d3fe0] text-white',
        )}
        onClick={() => setOpen((prev) => !prev)}
      >
        {open ? <X className="h-5 w-5" /> : <MessageSquare className="h-5 w-5" />}
        {!open && supportUnread > 0 ? (
          <span className="absolute -top-1 -right-1 h-5 min-w-5 px-1 rounded-full bg-red-500 text-[10px] font-bold text-white flex items-center justify-center">
            {supportUnread}
          </span>
        ) : null}
      </button>
    </>
  )
}
