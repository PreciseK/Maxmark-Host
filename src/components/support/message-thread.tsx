import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Paperclip, SendHorizontal } from 'lucide-react'

import type { SenderRole, SupportMessage } from '@/lib/db/support'
import { cn, formatDateLabel } from '@/lib/utils'

interface MessageThreadProps {
  messages: SupportMessage[]
  /** Which side the viewer is on — their messages render right-aligned. */
  viewerRole: SenderRole
  onSend: (body: string) => void
  onAttach?: (file: File) => void
  onOpenAttachment?: (message: SupportMessage) => void
  sending?: boolean
  attaching?: boolean
  disabled?: boolean
  disabledHint?: string
  error?: string | null
}

export function MessageThread({
  messages,
  viewerRole,
  onSend,
  onAttach,
  onOpenAttachment,
  sending = false,
  attaching = false,
  disabled = false,
  disabledHint,
  error,
}: MessageThreadProps) {
  const [draft, setDraft] = useState('')
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length])

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const body = draft.trim()
    if (!body || sending || disabled) return
    onSend(body)
    setDraft('')
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3" ref={scrollRef}>
        {messages.map((message) => {
          const isOwn = message.senderRole === viewerRole
          return (
            <div
              className={cn('flex flex-col max-w-[85%]', isOwn ? 'ml-auto items-end' : 'items-start')}
              key={message.id}
            >
              <div
                className={cn(
                  'rounded-lg px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap break-words',
                  isOwn
                    ? 'bg-[#5c4df0] text-white rounded-br-sm'
                    : 'bg-[#232328] text-white rounded-bl-sm',
                )}
              >
                {message.body}
              </div>
              {message.attachment ? (
                <button
                  className={cn(
                    'flex items-center gap-1.5 mt-1 px-2.5 py-1.5 rounded-md text-[11px] border transition',
                    isOwn
                      ? 'border-[#5c4df0]/40 bg-[#5c4df0]/10 text-[#a89cf7] hover:bg-[#5c4df0]/20'
                      : 'border-[#2d2d34] bg-[#1c1c1f] text-white hover:bg-[#232328]',
                  )}
                  onClick={() => onOpenAttachment?.(message)}
                  type="button"
                >
                  <Paperclip className="h-3 w-3 shrink-0" />
                  <span className="truncate max-w-[160px]">{message.attachment.name}</span>
                  <span className="text-muted-foreground shrink-0">
                    {Math.round(message.attachment.size / 1024)} KB
                  </span>
                </button>
              ) : null}
              <span className="text-[10px] text-muted-foreground mt-1">
                {message.senderRole === 'admin' ? 'Maxmark Support · ' : ''}
                {formatDateLabel(message.createdAt)}
              </span>
            </div>
          )
        })}
        {messages.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8">
            No messages yet — say hello!
          </p>
        ) : null}
      </div>

      {error ? (
        <p className="px-4 py-2 text-[11px] text-red-400 bg-red-500/10 border-t border-red-500/20">
          {error}
        </p>
      ) : null}

      {disabled ? (
        <p className="px-4 py-3 text-[11px] text-muted-foreground border-t border-[#232328] bg-[#121214]">
          {disabledHint ?? 'This conversation is closed.'}
        </p>
      ) : (
        <form
          className="flex items-end gap-2 border-t border-[#232328] bg-[#121214] px-3 py-3"
          onSubmit={handleSubmit}
        >
          {onAttach ? (
            <>
              <input
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) onAttach(file)
                  event.target.value = ''
                }}
                ref={fileInputRef}
                type="file"
              />
              <button
                aria-label="Attach a file"
                className="h-[38px] w-[38px] shrink-0 flex items-center justify-center bg-[#1c1c1f] hover:bg-[#232328] border border-[#2d2d34] rounded-md text-muted-foreground hover:text-white transition disabled:opacity-50"
                disabled={attaching}
                onClick={() => fileInputRef.current?.click()}
                type="button"
              >
                <Paperclip className="h-4 w-4" />
              </button>
            </>
          ) : null}
          <textarea
            className="flex-1 bg-[#1c1c1f] border border-[#2d2d34] rounded-md px-3 py-2 text-xs text-white placeholder:text-muted-foreground focus:outline-none focus:border-[#5c4df0]/50 transition-colors resize-none h-[38px] max-h-28"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                handleSubmit(event)
              }
            }}
            placeholder="Write a message…"
            rows={1}
            value={draft}
          />
          <button
            aria-label="Send message"
            className="h-[38px] w-[38px] shrink-0 flex items-center justify-center bg-[#5c4df0] hover:bg-[#4d3fe0] rounded-md text-white transition disabled:opacity-50"
            disabled={sending || !draft.trim()}
            type="submit"
          >
            <SendHorizontal className="h-4 w-4" />
          </button>
        </form>
      )}
    </div>
  )
}
