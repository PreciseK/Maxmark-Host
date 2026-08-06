import { useEffect, useState } from 'react'
import {
  Mail,
  Megaphone,
  Plus,
  Send,
  Trash2,
} from 'lucide-react'

import {
  createBroadcastBanner,
  deleteBroadcastBanner,
  fetchBroadcastBanners,
  getInitialEmailTemplates,
  toggleBroadcastBanner,
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
  const [templates] = useState<EmailTemplateInfo[]>(getInitialEmailTemplates())
  const [banners, setBanners] = useState<BroadcastBanner[]>([])
  const [activeTab, setActiveTab] = useState<'email' | 'banners'>('email')

  // Toast
  const [toastMessage, setToastMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)

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

    return () => {
      active = false
    }
  }, [])

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
            Send targeted customer email broadcasts via Resend and publish dashboard announcement banners.
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
                      <button
                        onClick={() => setToastMessage({ tone: 'success', text: `Test email for "${tpl.name}" dispatched to admin address.` })}
                        type="button"
                        className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-white/80 hover:bg-white/10 hover:text-white transition"
                      >
                        <Send className="h-3 w-3" />
                        Send Test Email
                      </button>
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
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#5c4df0] px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-violet-600/20 hover:bg-[#6c5df5] transition"
            >
              <Plus className="h-4 w-4" />
              New Announcement Banner
            </button>
          </div>

          <div className={adminCardClass}>
            <div className="px-5 py-4 border-b border-[#232328] bg-[#161619]">
              <h3 className="text-sm font-semibold text-white">Active Dashboard Banners</h3>
            </div>

            <div className="divide-y divide-[#232328]">
              {banners.map((b) => (
                <div key={b.id} className="p-5 flex items-start justify-between gap-4 hover:bg-[#1c1c20] transition">
                  <div className="flex items-start gap-3">
                    <Megaphone className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-white">{b.title}</h4>
                        <StatusBadge tone={b.active ? 'green' : 'zinc'}>
                          {b.active ? 'Active' : 'Paused'}
                        </StatusBadge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 max-w-2xl">{b.message}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => void handleToggleBanner(b.id, b.active)}
                      type="button"
                      className="px-2.5 py-1 text-[11px] font-semibold border border-white/10 rounded-lg text-white/80 hover:bg-white/10 transition"
                    >
                      {b.active ? 'Pause' : 'Activate'}
                    </button>
                    <button
                      onClick={() => void handleDeleteBanner(b.id)}
                      type="button"
                      className="p-1.5 text-muted-foreground hover:text-rose-400 transition"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── EMAIL BROADCAST MODAL ── */}
      <Dialog open={sendBroadcastOpen} onOpenChange={setSendBroadcastOpen}>
        <DialogContent className={adminDialogClass}>
          <DialogHeader>
            <DialogTitle className="text-white text-lg font-bold">Send Targeted Email Broadcast</DialogTitle>
            <DialogDescription>
              Dispatches an email broadcast via Resend to customer accounts.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 text-xs">
            <div>
              <label className={fieldLabelClass}>Target Audience</label>
              <select
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value as typeof targetAudience)}
                className={fieldInputClass}
              >
                <option value="all">All Active Customer Accounts</option>
                <option value="vip">WordPress VIP / Scale Tier Customers</option>
                <option value="standard">Standard Hosting Customers</option>
              </select>
            </div>

            <div>
              <label className={fieldLabelClass}>Email Subject</label>
              <input
                type="text"
                value={broadcastSubject}
                onChange={(e) => setBroadcastSubject(e.target.value)}
                placeholder="Important platform update or announcement…"
                className={fieldInputClass}
              />
            </div>

            <div>
              <label className={fieldLabelClass}>Email Message Content (HTML Supported)</label>
              <textarea
                rows={5}
                value={broadcastBody}
                onChange={(e) => setBroadcastBody(e.target.value)}
                placeholder="Write your email announcement message here…"
                className={`${fieldInputClass} min-h-[120px]`}
              />
            </div>
          </div>

          <DialogFooter>
            <button className={secondaryButtonClass} onClick={() => setSendBroadcastOpen(false)} type="button">
              Cancel
            </button>
            <button
              className={primaryButtonClass}
              disabled={!broadcastSubject.trim() || !broadcastBody.trim()}
              onClick={handleSendBroadcast}
              type="button"
            >
              Send Broadcast
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── NEW BANNER MODAL ── */}
      <Dialog open={addBannerOpen} onOpenChange={setAddBannerOpen}>
        <DialogContent className={adminDialogClass}>
          <DialogHeader>
            <DialogTitle className="text-white text-lg font-bold">New Dashboard Announcement Banner</DialogTitle>
            <DialogDescription>
              Publishes an announcement banner at the top of customer dashboards.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 text-xs">
            <div>
              <label className={fieldLabelClass}>Banner Title</label>
              <input
                type="text"
                value={bannerTitle}
                onChange={(e) => setBannerTitle(e.target.value)}
                placeholder="e.g. Scheduled Maintenance Notice"
                className={fieldInputClass}
              />
            </div>

            <div>
              <label className={fieldLabelClass}>Banner Message</label>
              <textarea
                rows={3}
                value={bannerMessage}
                onChange={(e) => setBannerMessage(e.target.value)}
                placeholder="Details of the announcement…"
                className={fieldInputClass}
              />
            </div>

            <div>
              <label className={fieldLabelClass}>Tone / Severity</label>
              <select
                value={bannerTone}
                onChange={(e) => setBannerTone(e.target.value as typeof bannerTone)}
                className={fieldInputClass}
              >
                <option value="info">Information (Blue/Violet)</option>
                <option value="warning">Warning (Amber)</option>
                <option value="critical">Critical (Red)</option>
              </select>
            </div>
          </div>

          <DialogFooter>
            <button className={secondaryButtonClass} onClick={() => setAddBannerOpen(false)} type="button">
              Cancel
            </button>
            <button
              className={primaryButtonClass}
              disabled={!bannerTitle.trim() || !bannerMessage.trim()}
              onClick={() => void handleAddBanner()}
              type="button"
            >
              Publish Banner
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
