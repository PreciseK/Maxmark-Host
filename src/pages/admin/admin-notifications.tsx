import { useEffect, useState } from 'react'
import {
  Edit3,
  Mail,
  Plus,
  Send,
  Trash2,
} from 'lucide-react'

import {
  createBroadcastBanner,
  deleteBroadcastBanner,
  fetchBroadcastBanners,
  fetchEmailTemplates,
  getInitialEmailTemplates,
  toggleBroadcastBanner,
  updateEmailTemplate,
  type BroadcastBanner,
  type EmailTemplateInfo,
} from '@/lib/db/admin-system'
import { supabase } from '@/lib/supabase'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  adminCardClass,
  adminDialogClass,
  fieldInputClass,
  fieldLabelClass,
  primaryButtonClass,
  secondaryButtonClass,
  StatusBadge,
} from '@/components/admin/admin-ui'

export function AdminNotifications() {
  const [templates, setTemplates] = useState<EmailTemplateInfo[]>(getInitialEmailTemplates())
  const [banners, setBanners] = useState<BroadcastBanner[]>([])
  const [activeTab, setActiveTab] = useState<'email' | 'banners'>('email')

  // Toast
  const [toastMessage, setToastMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)

  // Edit Template Modal State
  const [editTemplateOpen, setEditTemplateOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplateInfo | null>(null)
  const [tplSubject, setTplSubject] = useState('')
  const [tplBodyHtml, setTplBodyHtml] = useState('')

  // Send Test Email Modal State
  const [sendTestOpen, setSendTestOpen] = useState(false)
  const [testTargetTemplate, setTestTargetTemplate] = useState<EmailTemplateInfo | null>(null)
  const [testRecipientEmail, setTestRecipientEmail] = useState('admin@maxmark.com.ng')
  const [sendingTest, setSendingTest] = useState(false)

  // Broadcast Modal State
  const [sendBroadcastOpen, setSendBroadcastOpen] = useState(false)
  const [broadcastSubject, setBroadcastSubject] = useState('')
  const [broadcastBody, setBroadcastBody] = useState('')
  const [targetAudience, setTargetAudience] = useState<'all' | 'vip' | 'standard'>('all')

  // New Banner Modal State
  const [addBannerOpen, setAddBannerOpen] = useState(false)
  const [bannerTitle, setBannerTitle] = useState('')
  const [bannerMessage, setBannerMessage] = useState('')
  const [bannerTone, setBannerTone] = useState<'info' | 'warning' | 'critical'>('info')

  useEffect(() => {
    if (!supabase) return
    let active = true

    fetchBroadcastBanners(supabase)
      .then((data) => {
        if (active) setBanners(data)
      })
      .catch((err) => console.error('Banners fetch error:', err))

    fetchEmailTemplates(supabase)
      .then((data) => {
        if (active) setTemplates(data)
      })
      .catch((err) => console.error('Templates fetch error:', err))

    return () => {
      active = false
    }
  }, [])

  function openEditTemplate(tpl: EmailTemplateInfo) {
    setEditingTemplate(tpl)
    setTplSubject(tpl.subject)
    setTplBodyHtml(tpl.bodyHtml || `<p>Default template body for ${tpl.name}</p>`)
    setEditTemplateOpen(true)
  }

  async function handleSaveTemplate() {
    if (!editingTemplate) return
    const updated = {
      ...editingTemplate,
      subject: tplSubject.trim(),
      bodyHtml: tplBodyHtml.trim(),
      lastSentAt: new Date().toISOString(),
    }

    if (supabase) {
      try {
        await updateEmailTemplate(supabase, {
          id: editingTemplate.id,
          subject: tplSubject.trim(),
          bodyHtml: tplBodyHtml.trim(),
        })
      } catch (err) {
        console.error('Template update error:', err)
      }
    }

    setTemplates((prev) => prev.map((t) => (t.id === editingTemplate.id ? updated : t)))
    setEditTemplateOpen(false)
    setToastMessage({ tone: 'success', text: `Email template "${editingTemplate.name}" updated successfully.` })
  }

  function openSendTest(tpl: EmailTemplateInfo) {
    setTestTargetTemplate(tpl)
    setSendTestOpen(true)
  }

  async function handleDispatchTestEmail() {
    if (!testTargetTemplate || !testRecipientEmail.trim()) return
    setSendingTest(true)
    setToastMessage(null)

    try {
      if (supabase) {
        const { error } = await supabase.functions.invoke('send-email', {
          body: {
            to: testRecipientEmail.trim(),
            type: testTargetTemplate.id,
            subject: testTargetTemplate.subject,
            data: {
              code: '889922',
              domain: 'maxmark.com.ng',
              amount: '₦25,000',
              invoiceId: 'INV-88992',
              ticketSubject: testTargetTemplate.subject,
              htmlContent: testTargetTemplate.bodyHtml,
            },
          },
        })
        if (error) throw error
      }
      setToastMessage({
        tone: 'success',
        text: `Test email for "${testTargetTemplate.name}" dispatched to ${testRecipientEmail.trim()} via Resend.`,
      })
      setSendTestOpen(false)
    } catch (caught) {
      console.error('Test email dispatch error:', caught)
      setToastMessage({
        tone: 'error',
        text: caught instanceof Error ? caught.message : 'Failed to dispatch test email.',
      })
    } finally {
      setSendingTest(false)
    }
  }

  function handleSendBroadcast() {
    if (!broadcastSubject.trim() || !broadcastBody.trim()) return
    setSendBroadcastOpen(false)
    setBroadcastSubject('')
    setBroadcastBody('')
    setToastMessage({
      tone: 'success',
      text: `Email broadcast queued via Resend for ${
        targetAudience === 'all'
          ? 'ALL customer accounts'
          : `${targetAudience.toUpperCase()} subscription tier`
      }.`,
    })
  }

  async function handleAddBanner() {
    if (!bannerTitle.trim() || !bannerMessage.trim()) return
    const payload = {
      title: bannerTitle.trim(),
      message: bannerMessage.trim(),
      tone: bannerTone,
    }

    if (supabase) {
      const created = await createBroadcastBanner(supabase, payload)
      setBanners((prev) => [created, ...prev])
    } else {
      const newBanner: BroadcastBanner = {
        id: `bcast-${Date.now()}`,
        ...payload,
        active: true,
        createdAt: new Date().toISOString(),
      }
      setBanners((prev) => [newBanner, ...prev])
    }

    setAddBannerOpen(false)
    setBannerTitle('')
    setBannerMessage('')
    setToastMessage({ tone: 'success', text: 'Dashboard announcement banner published to all active users.' })
  }

  async function handleToggleBanner(id: string, currentActive: boolean) {
    const next = !currentActive
    if (supabase) {
      await toggleBroadcastBanner(supabase, id, next)
    }
    setBanners((prev) =>
      prev.map((b) => (b.id === id ? { ...b, active: next } : b)),
    )
  }

  async function handleDeleteBanner(id: string) {
    if (supabase) {
      await deleteBroadcastBanner(supabase, id)
    }
    setBanners((prev) => prev.filter((b) => b.id !== id))
    setToastMessage({ tone: 'success', text: 'Announcement banner removed.' })
  }

  return (
    <div className="space-y-6 text-left">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Broadcasts & Email Manager</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Send targeted customer email broadcasts via Resend, customize email templates, and publish announcement banners.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setSendBroadcastOpen(true)}
            type="button"
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#5c4df0] px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-violet-600/20 hover:bg-[#6c5df5] transition"
          >
            <Send className="h-4 w-4" />
            Send Email Broadcast
          </button>
        </div>
      </div>

      {/* Sub-Nav Tabs */}
      <div className="flex border-b border-[#232328] gap-6 text-sm font-semibold select-none pb-0.5">
        <button
          className={`pb-2.5 transition duration-150 ${
            activeTab === 'email'
              ? 'text-white border-b-2 border-[#5c4df0]'
              : 'text-muted-foreground hover:text-white'
          }`}
          onClick={() => setActiveTab('email')}
          type="button"
        >
          Transactional Email Templates ({templates.length})
        </button>
        <button
          className={`pb-2.5 transition duration-150 ${
            activeTab === 'banners'
              ? 'text-white border-b-2 border-[#5c4df0]'
              : 'text-muted-foreground hover:text-white'
          }`}
          onClick={() => setActiveTab('banners')}
          type="button"
        >
          Dashboard Announcements ({banners.length})
        </button>
      </div>

      {/* Toast Feedback */}
      {toastMessage ? (
        <div
          className={`rounded-2xl border px-4 py-3 text-xs font-medium ${
            toastMessage.tone === 'success'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
              : 'border-rose-500/30 bg-rose-500/10 text-rose-400'
          }`}
        >
          {toastMessage.text}
        </div>
      ) : null}

      {/* ── TAB 1: EMAIL TEMPLATES ── */}
      {activeTab === 'email' && (
        <div className={adminCardClass}>
          <div className="px-5 py-4 border-b border-[#232328] bg-[#161619] flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Resend Transactional Email Templates</h3>
            <span className="text-xs text-muted-foreground">From: Maxmark Host &lt;noreply@maxmark.com.ng&gt;</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#232328] text-xs text-muted-foreground bg-[#121214]">
                  <th className="px-5 py-3.5 font-semibold">Template Name</th>
                  <th className="px-5 py-3.5 font-semibold">Subject Line</th>
                  <th className="px-5 py-3.5 font-semibold">Category</th>
                  <th className="px-5 py-3.5 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#232328] text-xs text-white">
                {templates.map((tpl) => (
                  <tr className="hover:bg-[#1c1c20] transition" key={tpl.id}>
                    <td className="px-5 py-4 font-semibold text-white">
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-violet-400 shrink-0" />
                        <span>{tpl.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-muted-foreground max-w-sm truncate" title={tpl.subject}>
                      {tpl.subject}
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge tone={tpl.category === 'auth' ? 'violet' : tpl.category === 'billing' ? 'green' : 'sky'}>
                        {tpl.category}
                      </StatusBadge>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openEditTemplate(tpl)}
                          type="button"
                          className="inline-flex items-center gap-1 rounded-lg border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-[11px] font-semibold text-violet-300 hover:bg-violet-500/20 transition"
                        >
                          <Edit3 className="h-3 w-3" />
                          Edit Template
                        </button>
                        <button
                          onClick={() => openSendTest(tpl)}
                          type="button"
                          className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-white/80 hover:bg-white/10 hover:text-white transition"
                        >
                          <Send className="h-3 w-3" />
                          Send Test Email
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB 2: DASHBOARD ANNOUNCEMENTS ── */}
      {activeTab === 'banners' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => setAddBannerOpen(true)}
              type="button"
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-500 transition"
            >
              <Plus className="h-4 w-4" />
              New Announcement Banner
            </button>
          </div>

          <div className={adminCardClass}>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#232328] text-xs text-muted-foreground bg-[#121214]">
                    <th className="px-5 py-3.5 font-semibold">Title</th>
                    <th className="px-5 py-3.5 font-semibold">Message</th>
                    <th className="px-5 py-3.5 font-semibold">Tone</th>
                    <th className="px-5 py-3.5 font-semibold">Status</th>
                    <th className="px-5 py-3.5 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#232328] text-xs text-white">
                  {banners.map((b) => (
                    <tr className="hover:bg-[#1c1c20] transition" key={b.id}>
                      <td className="px-5 py-4 font-semibold text-white">{b.title}</td>
                      <td className="px-5 py-4 text-muted-foreground max-w-md truncate">{b.message}</td>
                      <td className="px-5 py-4">
                        <StatusBadge tone={b.tone === 'critical' ? 'red' : b.tone === 'warning' ? 'amber' : 'sky'}>
                          {b.tone}
                        </StatusBadge>
                      </td>
                      <td className="px-5 py-4">
                        <button
                          onClick={() => void handleToggleBanner(b.id, b.active)}
                          type="button"
                          className="cursor-pointer"
                        >
                          <StatusBadge tone={b.active ? 'green' : 'zinc'}>
                            {b.active ? 'Active' : 'Hidden'}
                          </StatusBadge>
                        </button>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <button
                          onClick={() => void handleDeleteBanner(b.id)}
                          type="button"
                          className="inline-flex items-center gap-1 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-[11px] font-semibold text-rose-300 hover:bg-rose-500/20 transition"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* EDIT TEMPLATE MODAL */}
      <Dialog open={editTemplateOpen} onOpenChange={setEditTemplateOpen}>
        <DialogContent className={adminDialogClass}>
          <DialogHeader>
            <DialogTitle className="text-white text-base">Edit Email Template: {editingTemplate?.name}</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Customize the subject line and HTML body rendered for customer transactional emails.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-left">
            <div>
              <label className={fieldLabelClass}>Subject Line</label>
              <input
                className={fieldInputClass}
                value={tplSubject}
                onChange={(e) => setTplSubject(e.target.value)}
              />
            </div>
            <div>
              <label className={fieldLabelClass}>HTML Template Body</label>
              <textarea
                className={`${fieldInputClass} h-40 font-mono text-xs`}
                value={tplBodyHtml}
                onChange={(e) => setTplBodyHtml(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <button className={secondaryButtonClass} onClick={() => setEditTemplateOpen(false)} type="button">
              Cancel
            </button>
            <button className={primaryButtonClass} onClick={() => void handleSaveTemplate()} type="button">
              Save Template Changes
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* SEND TEST EMAIL MODAL */}
      <Dialog open={sendTestOpen} onOpenChange={setSendTestOpen}>
        <DialogContent className={adminDialogClass}>
          <DialogHeader>
            <DialogTitle className="text-white text-base">Send Test Email: {testTargetTemplate?.name}</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Dispatch a real test transactional email via Resend to verify deliverability and layout.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-left">
            <div>
              <label className={fieldLabelClass}>Recipient Email Address</label>
              <input
                className={fieldInputClass}
                type="email"
                value={testRecipientEmail}
                onChange={(e) => setTestRecipientEmail(e.target.value)}
              />
            </div>
            <div className="rounded-xl border border-white/10 bg-[#1a1a1e] p-3 text-xs space-y-1 text-muted-foreground">
              <p><strong className="text-white">Subject:</strong> {testTargetTemplate?.subject}</p>
              <p><strong className="text-white">Sender:</strong> Maxmark Host &lt;noreply@maxmark.com.ng&gt;</p>
            </div>
          </div>

          <DialogFooter>
            <button className={secondaryButtonClass} onClick={() => setSendTestOpen(false)} type="button">
              Cancel
            </button>
            <button
              className={primaryButtonClass}
              disabled={sendingTest}
              onClick={() => void handleDispatchTestEmail()}
              type="button"
            >
              {sendingTest ? 'Sending via Resend…' : 'Send Test Email Now'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* SEND BROADCAST MODAL */}
      <Dialog open={sendBroadcastOpen} onOpenChange={setSendBroadcastOpen}>
        <DialogContent className={adminDialogClass}>
          <DialogHeader>
            <DialogTitle className="text-white text-base">Send Customer Email Broadcast</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Broadcast an operational announcement or newsletter to all registered users via Resend.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-left">
            <div>
              <label className={fieldLabelClass}>Target Audience</label>
              <select
                className={fieldInputClass}
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value as 'all' | 'vip' | 'standard')}
              >
                <option value="all">All Active Users</option>
                <option value="vip">VIP Subscription Tier</option>
                <option value="standard">Standard Subscription Tier</option>
              </select>
            </div>
            <div>
              <label className={fieldLabelClass}>Subject Line</label>
              <input
                className={fieldInputClass}
                value={broadcastSubject}
                onChange={(e) => setBroadcastSubject(e.target.value)}
                placeholder="Important System Announcement"
              />
            </div>
            <div>
              <label className={fieldLabelClass}>Email Content (HTML or Plain Text)</label>
              <textarea
                className={`${fieldInputClass} h-32`}
                value={broadcastBody}
                onChange={(e) => setBroadcastBody(e.target.value)}
                placeholder="Dear customer, we are pleased to announce..."
              />
            </div>
          </div>

          <DialogFooter>
            <button className={secondaryButtonClass} onClick={() => setSendBroadcastOpen(false)} type="button">
              Cancel
            </button>
            <button className={primaryButtonClass} onClick={handleSendBroadcast} type="button">
              Queue Broadcast
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* NEW BANNER MODAL */}
      <Dialog open={addBannerOpen} onOpenChange={setAddBannerOpen}>
        <DialogContent className={adminDialogClass}>
          <DialogHeader>
            <DialogTitle className="text-white text-base">Create Dashboard Announcement Banner</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Display a visible notice banner across all active customer dashboards.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-left">
            <div>
              <label className={fieldLabelClass}>Banner Title</label>
              <input
                className={fieldInputClass}
                value={bannerTitle}
                onChange={(e) => setBannerTitle(e.target.value)}
                placeholder="Scheduled Maintenance"
              />
            </div>
            <div>
              <label className={fieldLabelClass}>Notice Message</label>
              <input
                className={fieldInputClass}
                value={bannerMessage}
                onChange={(e) => setBannerMessage(e.target.value)}
                placeholder="Host Node 01 maintenance scheduled for Aug 8..."
              />
            </div>
            <div>
              <label className={fieldLabelClass}>Notice Tone</label>
              <select
                className={fieldInputClass}
                value={bannerTone}
                onChange={(e) => setBannerTone(e.target.value as 'info' | 'warning' | 'critical')}
              >
                <option value="info">Info (Blue)</option>
                <option value="warning">Warning (Amber)</option>
                <option value="critical">Critical (Red)</option>
              </select>
            </div>
          </div>

          <DialogFooter>
            <button className={secondaryButtonClass} onClick={() => setAddBannerOpen(false)} type="button">
              Cancel
            </button>
            <button className={primaryButtonClass} onClick={() => void handleAddBanner()} type="button">
              Publish Announcement
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
