import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpDown, ChevronLeft, Plus } from 'lucide-react'

import { useSupportChat } from '@/hooks/use-support-chat'
import type { ConversationStatus } from '@/lib/db/support'
import { formatDateLabel } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { MessageThread } from '@/components/support/message-thread'
import {
  StatusBadge,
  adminDialogClass,
  fieldInputClass,
  fieldLabelClass,
  primaryButtonClass,
  secondaryButtonClass,
  type BadgeTone,
} from '@/components/admin/admin-ui'

import { ScheduledMaintenanceWidget, StatusWidget } from './dashboard-home'

const statusTone: Record<ConversationStatus, BadgeTone> = {
  open: 'green',
  pending: 'sky',
  closed: 'zinc',
}

export function SupportPage() {
  const chat = useSupportChat()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [subject, setSubject] = useState('')
  const [firstMessage, setFirstMessage] = useState('')

  const activeConversation = chat.conversations.find((c) => c.id === chat.activeId) ?? null

  async function handleCreate() {
    const id = await chat.createCase(subject, firstMessage)
    if (id) {
      setDialogOpen(false)
      setSubject('')
      setFirstMessage('')
    }
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumbs */}
      <div className="text-xs text-muted-foreground">
        <Link className="hover:text-white transition" to="/home">
          Home
        </Link>{' '}
        <span className="mx-1 text-[#4f4f52]">/</span> <span className="text-white">Cases</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Cases</h1>
        <div className="flex gap-2">
          <button className="px-4 py-2 bg-[#202024] hover:bg-[#2c2c32] rounded-md text-xs font-semibold border border-[#2d2d34] transition">
            Request Migration
          </button>
          <button
            className="flex items-center gap-1.5 px-4 py-2 bg-[#5c4df0] hover:bg-[#4d3fe0] rounded-md text-xs font-semibold text-white transition"
            onClick={() => setDialogOpen(true)}
          >
            <Plus className="h-4 w-4" />
            Open Case
          </button>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        {activeConversation ? (
          /* Thread view (Left Column) */
          <div className="bg-[#161619] border border-[#232328] rounded-lg overflow-hidden flex flex-col h-[560px]">
            <div className="px-5 py-4 border-b border-[#232328] flex items-center gap-3 shrink-0">
              <button
                aria-label="Back to cases"
                className="text-muted-foreground hover:text-white transition"
                onClick={chat.closeConversation}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-white truncate">
                  {activeConversation.subject}
                </h3>
                <p className="text-[10px] text-muted-foreground">
                  Case {activeConversation.id.slice(0, 8)} · opened{' '}
                  {formatDateLabel(activeConversation.createdAt)}
                </p>
              </div>
              <StatusBadge tone={statusTone[activeConversation.status]}>
                {activeConversation.status}
              </StatusBadge>
            </div>
            <MessageThread
              disabledHint={undefined}
              error={chat.error}
              messages={chat.messages}
              onSend={(body) => void chat.send(body)}
              sending={chat.sending}
              viewerRole="user"
            />
            {activeConversation.status === 'closed' ? (
              <p className="px-5 py-2 text-[10px] text-muted-foreground bg-[#121214] border-t border-[#232328] shrink-0">
                This case is closed — sending a new message reopens it.
              </p>
            ) : null}
          </div>
        ) : (
          /* Cases Table (Left Column) */
          <div className="bg-[#161619] border border-[#232328] rounded-lg overflow-hidden flex flex-col justify-between">
            <div>
              <div className="px-5 py-4 border-b border-[#232328]">
                <h3 className="text-sm font-semibold text-white">Cases</h3>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#232328] text-xs text-muted-foreground bg-[#121214]">
                      <th className="px-5 py-3 font-semibold w-[120px]">
                        <button className="flex items-center gap-1.5 hover:text-white transition">
                          Case ID
                          <ArrowUpDown className="h-3 w-3" />
                        </button>
                      </th>
                      <th className="px-5 py-3 font-semibold">
                        <button className="flex items-center gap-1.5 hover:text-white transition">
                          Subject
                          <ArrowUpDown className="h-3 w-3" />
                        </button>
                      </th>
                      <th className="px-5 py-3 font-semibold w-[100px]">
                        <button className="flex items-center gap-1.5 hover:text-white transition">
                          Status
                          <ArrowUpDown className="h-3 w-3" />
                        </button>
                      </th>
                      <th className="px-5 py-3 font-semibold w-[180px]">
                        <button className="flex items-center gap-1.5 hover:text-white transition">
                          Updated
                          <ArrowUpDown className="h-3 w-3" />
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#232328] text-xs text-white">
                    {chat.conversations.map((conversation) => (
                      <tr
                        className="hover:bg-[#1c1c20] transition cursor-pointer"
                        key={conversation.id}
                        onClick={() => chat.openConversation(conversation.id)}
                      >
                        <td className="px-5 py-4 font-semibold underline text-muted-foreground hover:text-white font-mono">
                          {conversation.id.slice(0, 8)}
                        </td>
                        <td className="px-5 py-4 max-w-[280px]">
                          <div className="flex items-center gap-2">
                            <span className="truncate" title={conversation.subject}>
                              {conversation.subject}
                            </span>
                            {conversation.userUnreadCount > 0 ? (
                              <span className="bg-[#5c4df0] text-[10px] font-semibold px-1.5 py-0.5 rounded-full text-white shrink-0">
                                {conversation.userUnreadCount}
                              </span>
                            ) : null}
                          </div>
                          <p className="text-muted-foreground truncate mt-0.5">
                            {conversation.lastMessagePreview}
                          </p>
                        </td>
                        <td className="px-5 py-4">
                          <StatusBadge tone={statusTone[conversation.status]}>
                            {conversation.status}
                          </StatusBadge>
                        </td>
                        <td className="px-5 py-4 text-muted-foreground">
                          {formatDateLabel(conversation.lastMessageAt)}
                        </td>
                      </tr>
                    ))}
                    {chat.conversations.length === 0 ? (
                      <tr>
                        <td className="px-5 py-10 text-center text-muted-foreground" colSpan={4}>
                          No cases yet. Open one and our team will jump in.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Table Footer */}
            <div className="px-5 py-4 border-t border-[#232328] bg-[#121214] flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {chat.conversations.length} case{chat.conversations.length === 1 ? '' : 's'}
              </span>
            </div>
          </div>
        )}

        {/* Status / Maintenance Sidebar (Right Column) */}
        <div className="space-y-6">
          <StatusWidget />
          <ScheduledMaintenanceWidget />
        </div>
      </div>

      {/* Open case dialog */}
      <Dialog onOpenChange={setDialogOpen} open={dialogOpen}>
        <DialogContent className={adminDialogClass}>
          <DialogHeader>
            <DialogTitle className="text-white text-lg font-bold">Open a case</DialogTitle>
            <DialogDescription>
              Describe the issue and our support team will pick it up — replies arrive here
              and in the chat widget.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className={fieldLabelClass} htmlFor="case-subject">
                Subject
              </label>
              <input
                className={fieldInputClass}
                id="case-subject"
                maxLength={200}
                onChange={(event) => setSubject(event.target.value)}
                placeholder="What do you need help with?"
                type="text"
                value={subject}
              />
            </div>
            <div>
              <label className={fieldLabelClass} htmlFor="case-message">
                Message
              </label>
              <textarea
                className={`${fieldInputClass} min-h-[110px] resize-y`}
                id="case-message"
                maxLength={4000}
                onChange={(event) => setFirstMessage(event.target.value)}
                placeholder="Describe the issue, including the site or invoice involved…"
                value={firstMessage}
              />
            </div>
            {chat.error ? <p className="text-[11px] text-red-400">{chat.error}</p> : null}
          </div>
          <DialogFooter>
            <button className={secondaryButtonClass} onClick={() => setDialogOpen(false)}>
              Cancel
            </button>
            <button
              className={primaryButtonClass}
              disabled={chat.sending || !subject.trim() || !firstMessage.trim()}
              onClick={() => void handleCreate()}
            >
              {chat.sending ? 'Opening…' : 'Open case'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
