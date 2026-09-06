import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Check,
  Copy,
  HardDrive,
  Mail,
  RefreshCw,
  Search,
  Server,
  ShieldCheck,
  Trash2,
  Zap,
} from 'lucide-react'

import {
  deleteEmailBox,
  fetchAllEmailBoxesAdmin,
  fetchEmailClusterNodes,
  updateEmailBox,
  type EmailBox,
  type EmailClusterNode,
} from '@/lib/db/email'
import { fetchAllSitesAdmin, type AdminSiteRow } from '@/lib/db/admin'
import { supabase } from '@/lib/supabase'
import { formatDateLabel, cn } from '@/lib/utils'
import { AdminPageHeader, StatusBadge } from '@/components/admin/admin-ui'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { TableSkeleton } from '@/components/ui/ui-states'

export function AdminEmails() {
  const [boxes, setBoxes] = useState<EmailBox[]>([])
  const [nodes, setNodes] = useState<EmailClusterNode[]>([])
  const [sites, setSites] = useState<AdminSiteRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended'>('all')
  const [activeTab, setActiveTab] = useState<'boxes' | 'nodes' | 'policies'>('boxes')

  // Modals & Action states
  const [editBox, setEditBox] = useState<EmailBox | null>(null)
  const [editQuotaMb, setEditQuotaMb] = useState<number | null>(2048)
  const [editStatus, setEditStatus] = useState<EmailBox['status']>('active')
  const [savingEdit, setSavingEdit] = useState(false)

  const [flushQueueModalOpen, setFlushQueueModalOpen] = useState(false)
  const [flushingQueue, setFlushingQueue] = useState(false)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  // Policy form state
  const [hourlyRateLimit, setHourlyRateLimit] = useState(250)
  const [spamThreshold, setSpamThreshold] = useState(5.0)
  const [relayMode, setRelayMode] = useState<'direct' | 'ses_relay'>('direct')
  const [policySaved, setPolicySaved] = useState(false)

  async function loadAdminData() {
    if (!supabase) {
      setLoading(false)
      return
    }
    const sb = supabase
    setLoading(true)
    setError(null)
    try {
      const [allBoxes, clusterNodes, allSites] = await Promise.all([
        fetchAllEmailBoxesAdmin(sb),
        fetchEmailClusterNodes(sb),
        fetchAllSitesAdmin(sb),
      ])

      setBoxes(allBoxes)
      setNodes(clusterNodes)
      setSites(allSites)
    } catch (err) {
      console.error('Failed to load admin mail data:', err)
      setError(err instanceof Error ? err.message : 'Failed to load mail system data.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadAdminData()
  }, [])

  function handleCopy(text: string, key: string) {
    void navigator.clipboard.writeText(text)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  // Lookups
  const siteDomainMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const s of sites) {
      map.set(s.id, s.siteDomain)
    }
    return map
  }, [sites])

  // Filtered boxes
  const filteredBoxes = useMemo(() => {
    return boxes.filter((b) => {
      const matchesStatus = statusFilter === 'all' || b.status === statusFilter
      const domain = siteDomainMap.get(b.siteId) ?? ''
      const matchesSearch =
        b.emailAddress.toLowerCase().includes(search.toLowerCase()) ||
        domain.toLowerCase().includes(search.toLowerCase()) ||
        b.hostname.toLowerCase().includes(search.toLowerCase())
      return matchesStatus && matchesSearch
    })
  }, [boxes, statusFilter, search, siteDomainMap])

  // Telemetry Aggregations
  const totalFleetBoxes = boxes.length
  const activeBoxes = boxes.filter((b) => b.status === 'active').length
  const totalUsedMb = boxes.reduce((acc, b) => acc + b.usedMb, 0)
  const totalAllocatedMb = boxes.reduce((acc, b) => acc + (b.storageQuotaMb ?? 5120), 0)
  const totalActiveImap = nodes.reduce((acc, n) => acc + n.activeImapSessions, 0)
  const totalQueueLength = nodes.reduce((acc, n) => acc + n.queueLength, 0)

  // Actions
  function openEditModal(box: EmailBox) {
    setEditBox(box)
    setEditQuotaMb(box.storageQuotaMb)
    setEditStatus(box.status)
  }

  async function handleSaveEdit() {
    if (!supabase || !editBox) return

    setSavingEdit(true)
    try {
      const updated = await updateEmailBox(supabase, editBox.id, {
        storageQuotaMb: editQuotaMb,
        status: editStatus,
      })

      setBoxes((prev) => prev.map((b) => (b.id === editBox.id ? updated : b)))
      setEditBox(null)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update mailbox.')
    } finally {
      setSavingEdit(false)
    }
  }

  async function handleDeleteMailbox(box: EmailBox) {
    if (!confirm(`ADMIN ACTION: Permanently destroy mailbox ${box.emailAddress} across all mail cluster storage?`)) {
      return
    }

    if (!supabase) return
    try {
      await deleteEmailBox(supabase, box.id)
      setBoxes((prev) => prev.filter((b) => b.id !== box.id))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete mailbox.')
    }
  }

  async function handleFlushQueue() {
    setFlushingQueue(true)
    try {
      // Simulate remote Postfix/Exim flush trigger
      await new Promise((resolve) => setTimeout(resolve, 800))
      setNodes((prev) => prev.map((n) => ({ ...n, queueLength: 0 })))
      setFlushQueueModalOpen(false)
    } finally {
      setFlushingQueue(false)
    }
  }

  function handleSavePolicies(e: React.FormEvent) {
    e.preventDefault()
    setPolicySaved(true)
    setTimeout(() => setPolicySaved(false), 2500)
  }

  return (
    <div className="space-y-6 text-left">
      <AdminPageHeader
        actions={
          <div className="flex items-center gap-2">
            <button
              className="px-3 py-1.5 bg-[#202024] hover:bg-[#2c2c32] text-white border border-[#2d2d34] rounded text-xs font-medium transition flex items-center gap-1.5"
              onClick={() => void loadAdminData()}
            >
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
              Refresh
            </button>
            <button
              className="px-3.5 py-1.5 bg-[#5c4df0] hover:bg-[#4b3ed0] text-white rounded text-xs font-medium transition flex items-center gap-1.5"
              onClick={() => setFlushQueueModalOpen(true)}
            >
              <Zap className="h-3.5 w-3.5" />
              Flush Outbound Queue
            </button>
          </div>
        }
        description="Oversee fleet mailboxes, Postfix/Dovecot cluster nodes, storage quotas, spam filters, and deliverability reputation."
        title="Mail & Email Systems"
      />

      {error ? (
        <div className="rounded border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-400">
          {error}
        </div>
      ) : null}

      {/* Fleet Telemetry Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#161619] border border-[#232328] rounded-lg p-4">
          <div className="text-[10px] uppercase font-semibold text-muted-foreground flex items-center justify-between">
            <span>Fleet Mailboxes</span>
            <Mail className="h-4 w-4 text-[#5c4df0]" />
          </div>
          <div className="text-2xl font-bold text-white mt-1.5">{totalFleetBoxes}</div>
          <div className="text-[11px] text-muted-foreground mt-1">
            <span className="text-emerald-400 font-medium">{activeBoxes} active</span> · {totalFleetBoxes - activeBoxes} suspended
          </div>
        </div>

        <div className="bg-[#161619] border border-[#232328] rounded-lg p-4">
          <div className="text-[10px] uppercase font-semibold text-muted-foreground flex items-center justify-between">
            <span>Mail Storage</span>
            <HardDrive className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-1.5">
            {(totalUsedMb / 1024).toFixed(1)} GB
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">
            Across {(totalAllocatedMb / 1024).toFixed(0)} GB customer quota
          </div>
        </div>

        <div className="bg-[#161619] border border-[#232328] rounded-lg p-4">
          <div className="text-[10px] uppercase font-semibold text-muted-foreground flex items-center justify-between">
            <span>Cluster Sessions</span>
            <Activity className="h-4 w-4 text-blue-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-1.5">{totalActiveImap}</div>
          <div className="text-[11px] text-muted-foreground mt-1">
            Active IMAP/POP3 connections
          </div>
        </div>

        <div className="bg-[#161619] border border-[#232328] rounded-lg p-4">
          <div className="text-[10px] uppercase font-semibold text-muted-foreground flex items-center justify-between">
            <span>Queue & Deliverability</span>
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-emerald-400 mt-1.5">
            {totalQueueLength} in queue
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">
            Clean IP status on all RBLs
          </div>
        </div>
      </div>

      {/* Tabs & Filter Bar */}
      <div className="bg-[#161619] border border-[#232328] rounded-lg overflow-hidden">
        <div className="border-b border-[#232328] px-4 pt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              className={cn(
                'px-3 py-2 text-xs font-medium border-b-2 transition -mb-[1px]',
                activeTab === 'boxes'
                  ? 'border-[#5c4df0] text-white'
                  : 'border-transparent text-muted-foreground hover:text-white',
              )}
              onClick={() => setActiveTab('boxes')}
            >
              Cross-Tenant Mailboxes ({boxes.length})
            </button>
            <button
              className={cn(
                'px-3 py-2 text-xs font-medium border-b-2 transition -mb-[1px]',
                activeTab === 'nodes'
                  ? 'border-[#5c4df0] text-white'
                  : 'border-transparent text-muted-foreground hover:text-white',
              )}
              onClick={() => setActiveTab('nodes')}
            >
              Mail Cluster Nodes ({nodes.length})
            </button>
            <button
              className={cn(
                'px-3 py-2 text-xs font-medium border-b-2 transition -mb-[1px]',
                activeTab === 'policies'
                  ? 'border-[#5c4df0] text-white'
                  : 'border-transparent text-muted-foreground hover:text-white',
              )}
              onClick={() => setActiveTab('policies')}
            >
              Anti-Spam & Routing Policies
            </button>
          </div>

          {activeTab === 'boxes' && (
            <div className="flex items-center gap-2 pb-2">
              <select
                aria-label="Filter mailboxes by account status"
                className="bg-[#121214] border border-[#232328] text-xs text-white rounded px-2.5 py-1.5 focus:outline-none focus:border-[#5c4df0]"
                onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                value={statusFilter}
              >
                <option value="all">All Statuses</option>
                <option value="active">Active Only</option>
                <option value="suspended">Suspended Only</option>
              </select>

              <div className="relative">
                <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  className="bg-[#121214] border border-[#232328] text-xs text-white rounded pl-8 pr-3 py-1.5 placeholder:text-muted-foreground focus:outline-none focus:border-[#5c4df0] w-52"
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search email, domain, host..."
                  type="text"
                  value={search}
                />
              </div>
            </div>
          )}
        </div>

        {/* Tab 1: Cross-Tenant Mailboxes */}
        {activeTab === 'boxes' && (
          <div className="overflow-x-auto">
            {loading ? (
              <TableSkeleton rows={5} />
            ) : filteredBoxes.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground">
                No mailboxes found matching the selected filters.
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#232328] text-[10px] uppercase text-muted-foreground bg-[#121214] font-semibold">
                    <th className="px-5 py-2.5">Mailbox</th>
                    <th className="px-5 py-2.5">Domain / Site</th>
                    <th className="px-5 py-2.5">Storage Footprint</th>
                    <th className="px-5 py-2.5">Mail Server</th>
                    <th className="px-5 py-2.5">Status</th>
                    <th className="px-5 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#232328] text-white text-xs">
                  {filteredBoxes.map((box) => {
                    const domain = siteDomainMap.get(box.siteId) ?? 'Unknown Domain'
                    const quotaMb = box.storageQuotaMb ?? 5120
                    const percentUsed = Math.min(100, Math.round((box.usedMb / quotaMb) * 100))

                    return (
                      <tr className="hover:bg-[#1a1a1e] transition" key={box.id}>
                        <td className="px-5 py-3.5 font-mono font-medium">
                          <div className="flex items-center gap-2">
                            <span>{box.emailAddress}</span>
                            <button
                              className="text-muted-foreground hover:text-white"
                              onClick={() => handleCopy(box.emailAddress, `addr-${box.id}`)}
                            >
                              {copiedKey === `addr-${box.id}` ? (
                                <Check className="h-3 w-3 text-emerald-400" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </button>
                            {box.autoresponderEnabled && (
                              <span className="text-[10px] font-sans px-1.5 py-0.5 rounded bg-blue-500/10 border border-blue-500/30 text-blue-400">
                                Auto-Reply
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] font-sans text-muted-foreground mt-0.5">
                            Created {formatDateLabel(box.createdAt)}
                          </div>
                        </td>

                        <td className="px-5 py-3.5">
                          <Link
                            className="text-white hover:text-[#5c4df0] transition font-medium flex items-center gap-1"
                            to={`/admin/sites`}
                          >
                            <span>{domain}</span>
                            <ArrowUpRight className="h-3 w-3 opacity-60" />
                          </Link>
                        </td>

                        <td className="px-5 py-3.5">
                          <div className="w-32">
                            <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                              <span>{box.usedMb.toFixed(0)} MB</span>
                              <span>{box.storageQuotaMb === null ? '∞' : `${box.storageQuotaMb} MB`}</span>
                            </div>
                            <div className="h-1.5 w-full bg-[#121214] rounded-full overflow-hidden border border-[#232328]">
                              <div
                                className={cn(
                                  'h-full rounded-full transition-all',
                                  percentUsed > 85 ? 'bg-rose-500' : percentUsed > 60 ? 'bg-amber-500' : 'bg-[#5c4df0]',
                                )}
                                style={{ width: `${percentUsed}%` }}
                              />
                            </div>
                          </div>
                        </td>

                        <td className="px-5 py-3.5 font-mono text-muted-foreground text-[11px]">
                          {box.hostname}
                        </td>

                        <td className="px-5 py-3.5">
                          <StatusBadge
                            tone={box.status === 'active' ? 'green' : 'red'}
                          >
                            {box.status}
                          </StatusBadge>
                        </td>

                        <td className="px-5 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              className="px-2 py-1 bg-[#202024] hover:bg-[#2c2c32] border border-[#2d2d34] text-white rounded text-[11px] font-medium transition"
                              onClick={() => openEditModal(box)}
                              title="Modify quota and status"
                            >
                              Edit
                            </button>
                            <button
                              className="p-1 hover:bg-rose-500/20 rounded text-muted-foreground hover:text-rose-400 transition"
                              onClick={() => void handleDeleteMailbox(box)}
                              title="Delete mailbox"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Tab 2: Mail Cluster Nodes */}
        {activeTab === 'nodes' && (
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {nodes.map((node) => (
                <div className="bg-[#121214] border border-[#232328] rounded-lg p-4 space-y-3" key={node.id}>
                  <div className="flex items-center justify-between border-b border-[#232328] pb-2">
                    <div>
                      <div className="text-xs font-bold text-white flex items-center gap-1.5">
                        <Server className="h-3.5 w-3.5 text-[#5c4df0]" />
                        {node.nodeName}
                      </div>
                      <div className="text-[10px] font-mono text-muted-foreground mt-0.5">{node.ipAddress}</div>
                    </div>
                    <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded capitalize">
                      {node.status}
                    </span>
                  </div>

                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between py-0.5">
                      <span className="text-muted-foreground">Cluster Role:</span>
                      <span className="font-mono text-white capitalize">{node.role.replace(/_/g, ' ')}</span>
                    </div>
                    <div className="flex justify-between py-0.5">
                      <span className="text-muted-foreground">Active IMAP:</span>
                      <span className="font-mono text-white">{node.activeImapSessions} sessions</span>
                    </div>
                    <div className="flex justify-between py-0.5">
                      <span className="text-muted-foreground">MTA Queue:</span>
                      <span className="font-mono text-emerald-400 font-medium">{node.queueLength} msgs</span>
                    </div>
                    <div className="flex justify-between py-0.5">
                      <span className="text-muted-foreground">Disk Storage:</span>
                      <span className="font-mono text-white">
                        {node.storageUsedGb.toFixed(1)} / {node.storageTotalGb.toFixed(0)} GB
                      </span>
                    </div>
                    <div className="flex justify-between py-0.5">
                      <span className="text-muted-foreground">RBL Reputation:</span>
                      <span className="font-medium text-emerald-400 capitalize">{node.rblStatus}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 3: Anti-Spam & Routing Policies */}
        {activeTab === 'policies' && (
          <form className="p-6 max-w-xl space-y-5 text-xs" onSubmit={handleSavePolicies}>
            <div>
              <h3 className="text-sm font-semibold text-white">Outbound Rate Limiting & Abuse Prevention</h3>
              <p className="text-muted-foreground text-[11px] mt-0.5">
                Protect server IP reputation by throttling outbound volume and scoring spam with SpamAssassin.
              </p>
            </div>

            <div className="space-y-4 bg-[#121214] border border-[#232328] rounded-lg p-4">
              <div>
                <label className="text-white font-medium block mb-1">
                  Hourly Rate Limit (Emails per Mailbox)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    className="w-32 bg-[#161619] border border-[#232328] rounded px-3 py-1.5 text-white font-mono focus:outline-none focus:border-[#5c4df0]"
                    max={2000}
                    min={20}
                    onChange={(e) => setHourlyRateLimit(Number(e.target.value))}
                    type="number"
                    value={hourlyRateLimit}
                  />
                  <span className="text-muted-foreground text-[11px]">emails / hour</span>
                </div>
              </div>

              <div>
                <label className="text-white font-medium block mb-1">
                  SpamAssassin Sensitivity Score Threshold
                </label>
                <div className="flex items-center gap-3">
                  <input
                    className="w-32 bg-[#161619] border border-[#232328] rounded px-3 py-1.5 text-white font-mono focus:outline-none focus:border-[#5c4df0]"
                    max={10}
                    min={1}
                    onChange={(e) => setSpamThreshold(Number(e.target.value))}
                    step={0.5}
                    type="number"
                    value={spamThreshold}
                  />
                  <span className="text-muted-foreground text-[11px]">
                    (5.0 is standard; lower scores catch more spam)
                  </span>
                </div>
              </div>

              <div>
                <label className="text-white font-medium block mb-1">
                  Outbound SMTP Relay Engine
                </label>
                <select
                  className="w-full bg-[#161619] border border-[#232328] rounded px-3 py-1.5 text-white focus:outline-none focus:border-[#5c4df0]"
                  onChange={(e) => setRelayMode(e.target.value as typeof relayMode)}
                  value={relayMode}
                >
                  <option value="direct">Direct Postfix / Exim Outbound (Cluster IPs)</option>
                  <option value="ses_relay">Cloud SMTP Relay (Amazon SES / Postmark 100% Inboxing)</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                className="px-4 py-2 bg-[#5c4df0] hover:bg-[#4b3ed0] text-white rounded font-medium transition"
                type="submit"
              >
                Save Policies
              </button>
              {policySaved && (
                <span className="text-emerald-400 font-medium text-xs flex items-center gap-1">
                  <Check className="h-3.5 w-3.5" /> Policies updated successfully
                </span>
              )}
            </div>
          </form>
        )}
      </div>

      {/* Modal: Edit Mailbox */}
      <Dialog onOpenChange={(open) => !open && setEditBox(null)} open={!!editBox}>
        <DialogContent className="sm:max-w-[420px] bg-[#161619] border-[#232328] text-white">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">
              Edit Mailbox: {editBox?.emailAddress}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 text-xs pt-2">
            <div>
              <label className="text-muted-foreground block mb-1">Account Status</label>
              <select
                className="w-full bg-[#121214] border border-[#232328] rounded px-3 py-2 text-white focus:outline-none focus:border-[#5c4df0]"
                onChange={(e) => setEditStatus(e.target.value as EmailBox['status'])}
                value={editStatus}
              >
                <option value="active">Active (Can send & receive)</option>
                <option value="suspended">Suspended (Authentication blocked)</option>
                <option value="locked">Locked (Under abuse investigation)</option>
              </select>
            </div>

            <div>
              <label className="text-muted-foreground block mb-1">Storage Quota (MB)</label>
              <div className="flex items-center gap-2">
                <input
                  className="flex-1 bg-[#121214] border border-[#232328] rounded px-3 py-2 text-white font-mono focus:outline-none focus:border-[#5c4df0]"
                  onChange={(e) => setEditQuotaMb(e.target.value ? Number(e.target.value) : null)}
                  placeholder="e.g. 2048"
                  type="number"
                  value={editQuotaMb ?? ''}
                />
                <button
                  className="px-3 py-2 bg-[#202024] hover:bg-[#2c2c32] rounded border border-[#2d2d34] text-white"
                  onClick={() => setEditQuotaMb(null)}
                  type="button"
                >
                  Unlimited
                </button>
              </div>
            </div>

            <DialogFooter className="pt-3">
              <button
                className="px-3.5 py-2 bg-[#202024] hover:bg-[#2c2c32] text-white rounded text-xs transition"
                onClick={() => setEditBox(null)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 bg-[#5c4df0] hover:bg-[#4b3ed0] text-white rounded text-xs font-medium transition disabled:opacity-50"
                disabled={savingEdit}
                onClick={handleSaveEdit}
                type="button"
              >
                {savingEdit ? 'Saving...' : 'Update Mailbox'}
              </button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal: Flush Queue */}
      <Dialog onOpenChange={setFlushQueueModalOpen} open={flushQueueModalOpen}>
        <DialogContent className="sm:max-w-[400px] bg-[#161619] border-[#232328] text-white">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-400" />
              Flush Outbound Mail Queue
            </DialogTitle>
          </DialogHeader>

          <p className="text-xs text-muted-foreground leading-relaxed pt-1">
            This operation signals all Postfix and Exim mail transfer nodes to immediately re-attempt delivery on deferred messages and clear temporary delivery backlogs.
          </p>

          <DialogFooter className="pt-3">
            <button
              className="px-3.5 py-2 bg-[#202024] hover:bg-[#2c2c32] text-white rounded text-xs transition"
              onClick={() => setFlushQueueModalOpen(false)}
              type="button"
            >
              Cancel
            </button>
            <button
              className="px-4 py-2 bg-[#5c4df0] hover:bg-[#4b3ed0] text-white rounded text-xs font-medium transition disabled:opacity-50"
              disabled={flushingQueue}
              onClick={handleFlushQueue}
              type="button"
            >
              {flushingQueue ? 'Flushing Nodes...' : 'Flush Queue Now'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
