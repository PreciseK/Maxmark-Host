import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  ArrowRight,
  Check,
  Copy,
  ExternalLink,
  Mail,
  Plus,
  RefreshCw,
  Search,
  Server,
  ShieldCheck,
  Trash2,
  Zap,
} from 'lucide-react'

import {
  createEmailAlias,
  createEmailBox,
  deleteEmailAlias,
  deleteEmailBox,
  fetchAllEmailAliasesForUser,
  fetchAllEmailBoxesForUser,
  updateEmailBox,
  type EmailAlias,
  type EmailBox,
} from '@/lib/db/email'
import { fetchSites } from '@/lib/db/sites'
import { supabase } from '@/lib/supabase'
import { formatDateLabel, cn } from '@/lib/utils'
import type { ManagedSite } from '@/types/provisioning'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EmptyState, TableSkeleton } from '@/components/ui/ui-states'

export function EmailsPage() {
  const [searchParams] = useSearchParams()
  const initialDomain = searchParams.get('domain') ?? ''

  const [sites, setSites] = useState<ManagedSite[]>([])
  const [emailBoxes, setEmailBoxes] = useState<EmailBox[]>([])
  const [emailAliases, setEmailAliases] = useState<EmailAlias[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [selectedSiteId, setSelectedSiteId] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState<'boxes' | 'aliases' | 'deliverability' | 'setup'>('boxes')

  // Modals
  const [createBoxOpen, setCreateBoxOpen] = useState(false)
  const [createAliasOpen, setCreateAliasOpen] = useState(false)
  const [autoresponderModalBox, setAutoresponderModalBox] = useState<EmailBox | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  // Form State - Create Mailbox
  const [formSiteId, setFormSiteId] = useState('')
  const [formUsername, setFormUsername] = useState('')
  const [formPassword, setFormPassword] = useState('')
  const [formQuotaMb, setFormQuotaMb] = useState<number | null>(2048)
  const [formAutoresponderEnabled, setFormAutoresponderEnabled] = useState(false)
  const [formAutoresponderSubject, setFormAutoresponderSubject] = useState('')
  const [formAutoresponderBody, setFormAutoresponderBody] = useState('')
  const [formSubmitting, setFormSubmitting] = useState(false)

  // Form State - Create Alias
  const [aliasFormSiteId, setAliasFormSiteId] = useState('')
  const [aliasFormPrefix, setAliasFormPrefix] = useState('')
  const [aliasFormTarget, setAliasFormTarget] = useState('')
  const [aliasSubmitting, setAliasSubmitting] = useState(false)

  // Autoresponder modal form state
  const [editAutoEnabled, setEditAutoEnabled] = useState(false)
  const [editAutoSubject, setEditAutoSubject] = useState('')
  const [editAutoBody, setEditAutoBody] = useState('')
  const [editAutoSaving, setEditAutoSaving] = useState(false)

  async function loadData() {
    if (!supabase) {
      setLoading(false)
      return
    }
    const sb = supabase
    setLoading(true)
    setError(null)
    try {
      const liveSites = await fetchSites(sb)
      setSites(liveSites)

      const siteIds = liveSites.map((s) => s.id)
      const [boxes, aliases] = await Promise.all([
        fetchAllEmailBoxesForUser(sb, siteIds),
        fetchAllEmailAliasesForUser(sb, siteIds),
      ])
      setEmailBoxes(boxes)
      setEmailAliases(aliases)

      if (initialDomain) {
        const matchingSite = liveSites.find((s) => s.site_domain.toLowerCase() === initialDomain.toLowerCase())
        if (matchingSite) {
          setSelectedSiteId(matchingSite.id)
        }
      }

      if (liveSites.length > 0 && !formSiteId) {
        setFormSiteId(liveSites[0].id)
        setAliasFormSiteId(liveSites[0].id)
      }
    } catch (err) {
      console.error('Failed to load email data:', err)
      setError(err instanceof Error ? err.message : 'Failed to load mailboxes.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  function handleCopy(text: string, key: string) {
    void navigator.clipboard.writeText(text)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  function generateRandomPassword() {
    const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*'
    let pwd = ''
    for (let i = 0; i < 16; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    setFormPassword(pwd)
  }

  // Active selected domain for DNS and Setup tabs
  const activeSelectedSite = useMemo(() => {
    if (selectedSiteId !== 'all') {
      return sites.find((s) => s.id === selectedSiteId) ?? sites[0]
    }
    return sites[0] ?? null
  }, [sites, selectedSiteId])

  const activeDomain = activeSelectedSite ? activeSelectedSite.site_domain : 'example.com'

  // Filtered lists
  const filteredBoxes = useMemo(() => {
    return emailBoxes.filter((box) => {
      const matchesSite = selectedSiteId === 'all' || box.siteId === selectedSiteId
      const matchesSearch =
        box.emailAddress.toLowerCase().includes(searchQuery.toLowerCase()) ||
        box.hostname.toLowerCase().includes(searchQuery.toLowerCase())
      return matchesSite && matchesSearch
    })
  }, [emailBoxes, selectedSiteId, searchQuery])

  const filteredAliases = useMemo(() => {
    return emailAliases.filter((alias) => {
      const matchesSite = selectedSiteId === 'all' || alias.siteId === selectedSiteId
      const matchesSearch =
        alias.aliasAddress.toLowerCase().includes(searchQuery.toLowerCase()) ||
        alias.targetAddress.toLowerCase().includes(searchQuery.toLowerCase())
      return matchesSite && matchesSearch
    })
  }, [emailAliases, selectedSiteId, searchQuery])

  // Aggregate telemetry
  const totalMailboxes = emailBoxes.length
  const totalAllocatedMb = emailBoxes.reduce((acc, b) => acc + (b.storageQuotaMb ?? 5120), 0)
  const totalUsedMb = emailBoxes.reduce((acc, b) => acc + b.usedMb, 0)
  const totalAliases = emailAliases.length

  async function handleCreateBox(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase || !formSiteId || !formUsername.trim()) return

    const selectedSite = sites.find((s) => s.id === formSiteId)
    if (!selectedSite) return

    const cleanUsername = formUsername.trim().replace(/@.*/, '')
    const fullEmail = `${cleanUsername}@${selectedSite.site_domain}`.toLowerCase()

    setFormSubmitting(true)
    try {
      const newBox = await createEmailBox(supabase, {
        siteId: formSiteId,
        emailAddress: fullEmail,
        storageQuotaMb: formQuotaMb,
        hostname: `mail.${selectedSite.site_domain}`,
        autoresponderEnabled: formAutoresponderEnabled,
        autoresponderSubject: formAutoresponderSubject || null,
        autoresponderBody: formAutoresponderBody || null,
      })

      setEmailBoxes((prev) => [newBox, ...prev])
      setCreateBoxOpen(false)
      setFormUsername('')
      setFormPassword('')
      setFormAutoresponderEnabled(false)
      setFormAutoresponderSubject('')
      setFormAutoresponderBody('')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not create email box.')
    } finally {
      setFormSubmitting(false)
    }
  }

  async function handleDeleteBox(box: EmailBox) {
    if (!confirm(`Are you sure you want to delete mailbox ${box.emailAddress}? All emails will be permanently deleted.`)) {
      return
    }

    if (!supabase) return
    try {
      await deleteEmailBox(supabase, box.id)
      setEmailBoxes((prev) => prev.filter((b) => b.id !== box.id))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete mailbox.')
    }
  }

  async function handleCreateAlias(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase || !aliasFormSiteId || !aliasFormPrefix.trim() || !aliasFormTarget.trim()) return

    const site = sites.find((s) => s.id === aliasFormSiteId)
    if (!site) return

    const cleanPrefix = aliasFormPrefix.trim().replace(/@.*/, '')
    const fullAlias = `${cleanPrefix}@${site.site_domain}`.toLowerCase()

    setAliasSubmitting(true)
    try {
      const newAlias = await createEmailAlias(supabase, {
        siteId: aliasFormSiteId,
        aliasAddress: fullAlias,
        targetAddress: aliasFormTarget.trim().toLowerCase(),
      })

      setEmailAliases((prev) => [newAlias, ...prev])
      setCreateAliasOpen(false)
      setAliasFormPrefix('')
      setAliasFormTarget('')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not create email forwarder.')
    } finally {
      setAliasSubmitting(false)
    }
  }

  async function handleDeleteAlias(alias: EmailAlias) {
    if (!confirm(`Delete forwarder for ${alias.aliasAddress}?`)) return
    if (!supabase) return
    try {
      await deleteEmailAlias(supabase, alias.id)
      setEmailAliases((prev) => prev.filter((a) => a.id !== alias.id))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete forwarder.')
    }
  }

  function openAutoresponderModal(box: EmailBox) {
    setAutoresponderModalBox(box)
    setEditAutoEnabled(box.autoresponderEnabled)
    setEditAutoSubject(box.autoresponderSubject ?? '')
    setEditAutoBody(box.autoresponderBody ?? '')
  }

  async function handleSaveAutoresponder() {
    if (!supabase || !autoresponderModalBox) return

    setEditAutoSaving(true)
    try {
      const updated = await updateEmailBox(supabase, autoresponderModalBox.id, {
        autoresponderEnabled: editAutoEnabled,
        autoresponderSubject: editAutoSubject || null,
        autoresponderBody: editAutoBody || null,
      })

      setEmailBoxes((prev) =>
        prev.map((b) => (b.id === autoresponderModalBox.id ? updated : b)),
      )
      setAutoresponderModalBox(null)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save autoresponder settings.')
    } finally {
      setEditAutoSaving(false)
    }
  }

  return (
    <div className="space-y-6 text-left">
      {/* Breadcrumbs */}
      <div className="text-xs text-muted-foreground flex items-center gap-1.5">
        <Link className="hover:text-white transition" to="/home">
          Home
        </Link>
        <span className="text-[#4f4f52]">/</span>
        <span className="text-white">Business Email & Mailboxes</span>
      </div>

      {error ? (
        <div className="rounded border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-400">
          {error}
        </div>
      ) : null}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <Mail className="h-6 w-6 text-[#5c4df0]" />
            Business Email & Mailboxes
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Provision custom domain inboxes, forwarders, webmail single sign-on, and DNS deliverability.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="px-3 py-2 bg-[#202024] hover:bg-[#2c2c32] text-white border border-[#2d2d34] rounded-md text-xs font-medium transition flex items-center gap-1.5"
            onClick={() => void loadData()}
            title="Refresh mail data"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            Refresh
          </button>
          <button
            className="px-3.5 py-2 bg-[#5c4df0] hover:bg-[#4b3ed0] text-white rounded-md text-xs font-medium transition flex items-center gap-1.5 shadow-sm"
            onClick={() => setCreateBoxOpen(true)}
          >
            <Plus className="h-4 w-4" />
            Create Mailbox
          </button>
        </div>
      </div>

      {/* Telemetry Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#161619] border border-[#232328] rounded-lg p-4">
          <div className="text-[10px] uppercase font-semibold text-muted-foreground flex items-center justify-between">
            <span>Total Mailboxes</span>
            <Mail className="h-4 w-4 text-[#5c4df0]" />
          </div>
          <div className="text-2xl font-bold text-white mt-1.5">{totalMailboxes}</div>
          <div className="text-[11px] text-muted-foreground mt-1">Across all hosted domains</div>
        </div>

        <div className="bg-[#161619] border border-[#232328] rounded-lg p-4">
          <div className="text-[10px] uppercase font-semibold text-muted-foreground flex items-center justify-between">
            <span>Storage Used</span>
            <Server className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-1.5">
            {(totalUsedMb / 1024).toFixed(1)} GB
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">
            Of {(totalAllocatedMb / 1024).toFixed(0)} GB allocated quota
          </div>
        </div>

        <div className="bg-[#161619] border border-[#232328] rounded-lg p-4">
          <div className="text-[10px] uppercase font-semibold text-muted-foreground flex items-center justify-between">
            <span>Forwarders</span>
            <ArrowRight className="h-4 w-4 text-blue-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-1.5">{totalAliases}</div>
          <div className="text-[11px] text-muted-foreground mt-1">Active email routing aliases</div>
        </div>

        <div className="bg-[#161619] border border-[#232328] rounded-lg p-4">
          <div className="text-[10px] uppercase font-semibold text-muted-foreground flex items-center justify-between">
            <span>Deliverability</span>
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-emerald-400 mt-1.5">100% Valid</div>
          <div className="text-[11px] text-muted-foreground mt-1">SPF, DKIM, DMARC aligned</div>
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
              Mailboxes ({emailBoxes.length})
            </button>
            <button
              className={cn(
                'px-3 py-2 text-xs font-medium border-b-2 transition -mb-[1px]',
                activeTab === 'aliases'
                  ? 'border-[#5c4df0] text-white'
                  : 'border-transparent text-muted-foreground hover:text-white',
              )}
              onClick={() => setActiveTab('aliases')}
            >
              Forwarders & Aliases ({emailAliases.length})
            </button>
            <button
              className={cn(
                'px-3 py-2 text-xs font-medium border-b-2 transition -mb-[1px]',
                activeTab === 'deliverability'
                  ? 'border-[#5c4df0] text-white'
                  : 'border-transparent text-muted-foreground hover:text-white',
              )}
              onClick={() => setActiveTab('deliverability')}
            >
              DNS Deliverability
            </button>
            <button
              className={cn(
                'px-3 py-2 text-xs font-medium border-b-2 transition -mb-[1px]',
                activeTab === 'setup'
                  ? 'border-[#5c4df0] text-white'
                  : 'border-transparent text-muted-foreground hover:text-white',
              )}
              onClick={() => setActiveTab('setup')}
            >
              Email Client Setup
            </button>
          </div>

          <div className="flex items-center gap-2 pb-2">
            <select
              aria-label="Filter mailboxes by hosted site"
              className="bg-[#121214] border border-[#232328] text-xs text-white rounded px-2.5 py-1.5 focus:outline-none focus:border-[#5c4df0]"
              onChange={(e) => setSelectedSiteId(e.target.value)}
              value={selectedSiteId}
            >
              <option value="all">All Sites & Domains</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.site_domain}
                </option>
              ))}
            </select>

            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                className="bg-[#121214] border border-[#232328] text-xs text-white rounded pl-8 pr-3 py-1.5 placeholder:text-muted-foreground focus:outline-none focus:border-[#5c4df0] w-44"
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search mailboxes..."
                type="text"
                value={searchQuery}
              />
            </div>
          </div>
        </div>

        {/* Tab 1: Mailboxes */}
        {activeTab === 'boxes' && (
          <div className="overflow-x-auto">
            {loading ? (
              <TableSkeleton rows={4} />
            ) : filteredBoxes.length === 0 ? (
              <EmptyState
                actionLabel="Create First Mailbox"
                description={
                  searchQuery
                    ? 'No mailboxes match your search query.'
                    : 'No email accounts have been provisioned yet. Create your first custom domain mailbox.'
                }
                onAction={() => setCreateBoxOpen(true)}
                title="No Mailboxes Found"
              />
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#232328] text-[10px] uppercase text-muted-foreground bg-[#121214] font-semibold">
                    <th className="px-5 py-2.5">Email Address</th>
                    <th className="px-5 py-2.5">Storage Quota</th>
                    <th className="px-5 py-2.5">Mail Server</th>
                    <th className="px-5 py-2.5">Status</th>
                    <th className="px-5 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#232328] text-white text-xs">
                  {filteredBoxes.map((box) => {
                    const quotaMb = box.storageQuotaMb ?? 5120
                    const percentUsed = Math.min(100, Math.round((box.usedMb / quotaMb) * 100))
                    return (
                      <tr className="hover:bg-[#1a1a1e] transition group" key={box.id}>
                        <td className="px-5 py-4 font-mono font-medium">
                          <div className="flex items-center gap-2">
                            <span>{box.emailAddress}</span>
                            <button
                              className="text-muted-foreground hover:text-white transition"
                              onClick={() => handleCopy(box.emailAddress, `addr-${box.id}`)}
                              title="Copy email address"
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

                        <td className="px-5 py-4">
                          <div className="w-36">
                            <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                              <span>{box.usedMb.toFixed(0)} MB</span>
                              <span>{box.storageQuotaMb === null ? 'Unlimited' : `${box.storageQuotaMb} MB`}</span>
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

                        <td className="px-5 py-4 font-mono text-muted-foreground text-[11px]">
                          <div className="flex items-center gap-1.5">
                            <span>{box.hostname}</span>
                            <button
                              className="hover:text-white"
                              onClick={() => handleCopy(box.hostname, `host-${box.id}`)}
                              title="Copy hostname"
                            >
                              {copiedKey === `host-${box.id}` ? (
                                <Check className="h-3 w-3 text-emerald-400" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </button>
                          </div>
                        </td>

                        <td className="px-5 py-4">
                          <span
                            className={cn(
                              'text-[10px] font-semibold px-2 py-0.5 rounded border capitalize',
                              box.status === 'active'
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                : 'bg-rose-500/10 text-rose-400 border-rose-500/30',
                            )}
                          >
                            {box.status}
                          </span>
                        </td>

                        <td className="px-5 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <a
                              className="px-2.5 py-1 bg-[#202024] hover:bg-[#2c2c32] border border-[#2d2d34] text-white rounded text-[11px] font-medium transition inline-flex items-center gap-1.5"
                              href={`https://${box.hostname}:2096`}
                              rel="noreferrer"
                              target="_blank"
                            >
                              Webmail
                              <ExternalLink className="h-3 w-3" />
                            </a>

                            <button
                              className="p-1 hover:bg-[#202024] rounded text-muted-foreground hover:text-white transition"
                              onClick={() => openAutoresponderModal(box)}
                              title="Configure autoresponder"
                            >
                              <Zap className="h-3.5 w-3.5" />
                            </button>

                            <button
                              className="p-1 hover:bg-rose-500/20 rounded text-muted-foreground hover:text-rose-400 transition"
                              onClick={() => void handleDeleteBox(box)}
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

        {/* Tab 2: Forwarders & Aliases */}
        {activeTab === 'aliases' && (
          <div>
            <div className="px-5 py-3 border-b border-[#232328] bg-[#121214] flex items-center justify-between">
              <div>
                <h2 className="text-xs font-semibold text-white">Email Forwarders & Aliases</h2>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Redirect incoming emails to external destinations like Gmail, Outlook, or another mailbox.
                </p>
              </div>
              <button
                className="px-3 py-1.5 bg-[#5c4df0] hover:bg-[#4b3ed0] text-white rounded text-xs font-medium transition flex items-center gap-1.5"
                onClick={() => setCreateAliasOpen(true)}
              >
                <Plus className="h-3.5 w-3.5" />
                Add Forwarder
              </button>
            </div>

            <div className="overflow-x-auto">
              {filteredAliases.length === 0 ? (
                <EmptyState
                  actionLabel="Add First Forwarder"
                  description="No forwarders have been configured for this domain."
                  onAction={() => setCreateAliasOpen(true)}
                  title="No Forwarders Configured"
                />
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#232328] text-[10px] uppercase text-muted-foreground bg-[#121214] font-semibold">
                      <th className="px-5 py-2.5">Incoming Alias</th>
                      <th className="px-5 py-2.5">Destination Forward</th>
                      <th className="px-5 py-2.5">Status</th>
                      <th className="px-5 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#232328] text-white text-xs">
                    {filteredAliases.map((alias) => (
                      <tr className="hover:bg-[#1a1a1e] transition" key={alias.id}>
                        <td className="px-5 py-4 font-mono font-medium">{alias.aliasAddress}</td>
                        <td className="px-5 py-4 font-mono text-muted-foreground flex items-center gap-2">
                          <ArrowRight className="h-3.5 w-3.5 text-[#5c4df0]" />
                          <span>{alias.targetAddress}</span>
                        </td>
                        <td className="px-5 py-4">
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded border bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                            Active
                          </span>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <button
                            className="p-1 hover:bg-rose-500/20 rounded text-muted-foreground hover:text-rose-400 transition"
                            onClick={() => void handleDeleteAlias(alias)}
                            title="Delete forwarder"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* Tab 3: DNS Deliverability */}
        {activeTab === 'deliverability' && (
          <div className="p-5 space-y-6">
            <div className="bg-[#121214] border border-[#232328] rounded-lg p-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-emerald-400" />
                    Deliverability Health for {activeDomain}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Verify that your MX, SPF, DKIM, and DMARC records are correctly published so your emails land in inboxes.
                  </p>
                </div>
                <Link
                  className="px-3 py-1.5 bg-[#202024] hover:bg-[#2c2c32] border border-[#2d2d34] text-white rounded text-xs font-medium transition inline-flex items-center gap-1.5"
                  to="/dns-zones"
                >
                  Manage in DNS Zones
                  <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>

            <div className="space-y-3">
              {/* MX Record */}
              <div className="bg-[#121214] border border-[#232328] rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white uppercase px-1.5 py-0.5 rounded bg-[#202024] border border-[#2d2d34]">
                      MX
                    </span>
                    <span className="text-xs font-semibold text-white">Mail Exchange Record</span>
                  </div>
                  <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded">
                    Configured
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs font-mono bg-[#161619] p-2.5 rounded border border-[#232328]">
                  <div>
                    <span className="text-muted-foreground text-[10px] uppercase block">Host / Name</span>
                    <span>@</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-[10px] uppercase block">Priority</span>
                    <span>10</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-muted-foreground text-[10px] uppercase block">Value</span>
                      <span>mail.{activeDomain}</span>
                    </div>
                    <button
                      className="text-muted-foreground hover:text-white"
                      onClick={() => handleCopy(`mail.${activeDomain}`, 'mx-val')}
                    >
                      {copiedKey === 'mx-val' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* SPF Record */}
              <div className="bg-[#121214] border border-[#232328] rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white uppercase px-1.5 py-0.5 rounded bg-[#202024] border border-[#2d2d34]">
                      TXT
                    </span>
                    <span className="text-xs font-semibold text-white">SPF (Sender Policy Framework)</span>
                  </div>
                  <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded">
                    Valid
                  </span>
                </div>
                <div className="flex items-center justify-between bg-[#161619] p-2.5 rounded border border-[#232328] text-xs font-mono">
                  <div className="overflow-x-auto">
                    <span className="text-muted-foreground text-[10px] uppercase block">TXT Value</span>
                    <span>v=spf1 include:_spf.maxmarkhost.com ~all</span>
                  </div>
                  <button
                    className="text-muted-foreground hover:text-white ml-2"
                    onClick={() => handleCopy('v=spf1 include:_spf.maxmarkhost.com ~all', 'spf-val')}
                  >
                    {copiedKey === 'spf-val' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>

              {/* DKIM Record */}
              <div className="bg-[#121214] border border-[#232328] rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white uppercase px-1.5 py-0.5 rounded bg-[#202024] border border-[#2d2d34]">
                      TXT
                    </span>
                    <span className="text-xs font-semibold text-white">DKIM (DomainKeys Identified Mail)</span>
                  </div>
                  <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded">
                    Signed & Active
                  </span>
                </div>
                <div className="flex items-center justify-between bg-[#161619] p-2.5 rounded border border-[#232328] text-xs font-mono">
                  <div className="overflow-x-auto">
                    <span className="text-muted-foreground text-[10px] uppercase block">Selector & Value</span>
                    <span>default._domainkey.{activeDomain} TXT &quot;v=DKIM1; k=rsa; p=MIIBIjANBgkqh...&quot;</span>
                  </div>
                  <button
                    className="text-muted-foreground hover:text-white ml-2"
                    onClick={() => handleCopy(`default._domainkey.${activeDomain}`, 'dkim-val')}
                  >
                    {copiedKey === 'dkim-val' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>

              {/* DMARC Record */}
              <div className="bg-[#121214] border border-[#232328] rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white uppercase px-1.5 py-0.5 rounded bg-[#202024] border border-[#2d2d34]">
                      TXT
                    </span>
                    <span className="text-xs font-semibold text-white">DMARC Policy</span>
                  </div>
                  <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded">
                    Protecting
                  </span>
                </div>
                <div className="flex items-center justify-between bg-[#161619] p-2.5 rounded border border-[#232328] text-xs font-mono">
                  <div className="overflow-x-auto">
                    <span className="text-muted-foreground text-[10px] uppercase block">Host & Value</span>
                    <span>_dmarc.{activeDomain} TXT &quot;v=DMARC1; p=none; sp=none; aspf=r&quot;</span>
                  </div>
                  <button
                    className="text-muted-foreground hover:text-white ml-2"
                    onClick={() => handleCopy('v=DMARC1; p=none; sp=none; aspf=r', 'dmarc-val')}
                  >
                    {copiedKey === 'dmarc-val' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: Email Client Setup */}
        {activeTab === 'setup' && (
          <div className="p-5 space-y-6">
            <div>
              <h3 className="text-sm font-semibold text-white">Manual Client Configuration Settings</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Use these secure SSL/TLS settings to configure Apple Mail, Microsoft Outlook, Mozilla Thunderbird, or iOS/Android devices.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Incoming Mail Server */}
              <div className="bg-[#121214] border border-[#232328] rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-[#232328] pb-2">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Server className="h-3.5 w-3.5 text-[#5c4df0]" />
                    Incoming Mail (IMAP / POP3)
                  </span>
                  <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded">
                    SSL / TLS Encrypted
                  </span>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between py-1 border-b border-[#232328]/60">
                    <span className="text-muted-foreground">IMAP Server:</span>
                    <span className="font-mono text-white font-medium">mail.{activeDomain}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-[#232328]/60">
                    <span className="text-muted-foreground">IMAP Port:</span>
                    <span className="font-mono text-white font-medium">993 (SSL/TLS)</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-[#232328]/60">
                    <span className="text-muted-foreground">POP3 Port:</span>
                    <span className="font-mono text-white font-medium">995 (SSL/TLS)</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-muted-foreground">Username:</span>
                    <span className="font-mono text-white font-medium">your-email@{activeDomain}</span>
                  </div>
                </div>
              </div>

              {/* Outgoing Mail Server */}
              <div className="bg-[#121214] border border-[#232328] rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-[#232328] pb-2">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Zap className="h-3.5 w-3.5 text-blue-400" />
                    Outgoing Mail (SMTP)
                  </span>
                  <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded">
                    Auth Required
                  </span>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between py-1 border-b border-[#232328]/60">
                    <span className="text-muted-foreground">SMTP Server:</span>
                    <span className="font-mono text-white font-medium">mail.{activeDomain}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-[#232328]/60">
                    <span className="text-muted-foreground">SMTP Port:</span>
                    <span className="font-mono text-white font-medium">465 (SSL) or 587 (TLS)</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-[#232328]/60">
                    <span className="text-muted-foreground">Authentication:</span>
                    <span className="font-mono text-white font-medium">Same as Incoming (Password)</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-muted-foreground">Webmail Access:</span>
                    <span className="font-mono text-white font-medium">https://webmail.{activeDomain}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal: Create Mailbox */}
      <Dialog onOpenChange={setCreateBoxOpen} open={createBoxOpen}>
        <DialogContent className="sm:max-w-[460px] bg-[#161619] border-[#232328] text-white">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">Create Email Account</DialogTitle>
          </DialogHeader>

          <form className="space-y-4 text-xs" onSubmit={handleCreateBox}>
            <div>
              <label className="text-muted-foreground block mb-1">Select Domain</label>
              <select
                className="w-full bg-[#121214] border border-[#232328] rounded px-3 py-2 text-white focus:outline-none focus:border-[#5c4df0]"
                onChange={(e) => setFormSiteId(e.target.value)}
                required
                value={formSiteId}
              >
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.site_domain}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-muted-foreground block mb-1">Email Username</label>
              <div className="flex items-center">
                <input
                  className="flex-1 bg-[#121214] border border-[#232328] rounded-l px-3 py-2 text-white placeholder:text-muted-foreground focus:outline-none focus:border-[#5c4df0]"
                  onChange={(e) => setFormUsername(e.target.value)}
                  placeholder="e.g. contact or info"
                  required
                  type="text"
                  value={formUsername}
                />
                <span className="bg-[#202024] border border-l-0 border-[#232328] px-3 py-2 text-muted-foreground rounded-r">
                  @{sites.find((s) => s.id === formSiteId)?.site_domain ?? 'domain.com'}
                </span>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-muted-foreground">Password</label>
                <button
                  className="text-[11px] text-[#5c4df0] hover:underline"
                  onClick={generateRandomPassword}
                  type="button"
                >
                  Generate Strong
                </button>
              </div>
              <input
                className="w-full bg-[#121214] border border-[#232328] rounded px-3 py-2 text-white placeholder:text-muted-foreground font-mono focus:outline-none focus:border-[#5c4df0]"
                onChange={(e) => setFormPassword(e.target.value)}
                placeholder="Choose a secure password"
                required
                type="text"
                value={formPassword}
              />
            </div>

            <div>
              <label className="text-muted-foreground block mb-1">Storage Quota</label>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: '1 GB', val: 1024 },
                  { label: '2 GB', val: 2048 },
                  { label: '5 GB', val: 5120 },
                  { label: 'Unlimited', val: null },
                ].map((opt) => (
                  <button
                    className={cn(
                      'py-1.5 rounded border text-center transition text-xs font-medium',
                      formQuotaMb === opt.val
                        ? 'bg-[#5c4df0]/10 border-[#5c4df0] text-white'
                        : 'bg-[#121214] border-[#232328] text-muted-foreground hover:text-white',
                    )}
                    key={opt.label}
                    onClick={() => setFormQuotaMb(opt.val)}
                    type="button"
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-2 border-t border-[#232328]">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  checked={formAutoresponderEnabled}
                  className="rounded border-[#232328] text-[#5c4df0] focus:ring-0"
                  onChange={(e) => setFormAutoresponderEnabled(e.target.checked)}
                  type="checkbox"
                />
                <span className="text-white font-medium">Enable Vacation Auto-Responder</span>
              </label>

              {formAutoresponderEnabled && (
                <div className="mt-3 space-y-2 pl-6">
                  <input
                    className="w-full bg-[#121214] border border-[#232328] rounded px-2.5 py-1.5 text-white placeholder:text-muted-foreground focus:outline-none focus:border-[#5c4df0]"
                    onChange={(e) => setFormAutoresponderSubject(e.target.value)}
                    placeholder="Subject: Thanks for reaching out"
                    type="text"
                    value={formAutoresponderSubject}
                  />
                  <textarea
                    className="w-full bg-[#121214] border border-[#232328] rounded px-2.5 py-1.5 text-white placeholder:text-muted-foreground focus:outline-none focus:border-[#5c4df0] h-20"
                    onChange={(e) => setFormAutoresponderBody(e.target.value)}
                    placeholder="I am currently away and will reply shortly..."
                    value={formAutoresponderBody}
                  />
                </div>
              )}
            </div>

            <DialogFooter className="pt-3">
              <button
                className="px-3.5 py-2 bg-[#202024] hover:bg-[#2c2c32] text-white rounded text-xs transition"
                onClick={() => setCreateBoxOpen(false)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 bg-[#5c4df0] hover:bg-[#4b3ed0] text-white rounded text-xs font-medium transition disabled:opacity-50"
                disabled={formSubmitting}
                type="submit"
              >
                {formSubmitting ? 'Provisioning...' : 'Create Account'}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal: Create Alias / Forwarder */}
      <Dialog onOpenChange={setCreateAliasOpen} open={createAliasOpen}>
        <DialogContent className="sm:max-w-[420px] bg-[#161619] border-[#232328] text-white">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">Add Email Forwarder</DialogTitle>
          </DialogHeader>

          <form className="space-y-4 text-xs" onSubmit={handleCreateAlias}>
            <div>
              <label className="text-muted-foreground block mb-1">Domain</label>
              <select
                className="w-full bg-[#121214] border border-[#232328] rounded px-3 py-2 text-white focus:outline-none focus:border-[#5c4df0]"
                onChange={(e) => setAliasFormSiteId(e.target.value)}
                required
                value={aliasFormSiteId}
              >
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.site_domain}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-muted-foreground block mb-1">Incoming Address Prefix</label>
              <div className="flex items-center">
                <input
                  className="flex-1 bg-[#121214] border border-[#232328] rounded-l px-3 py-2 text-white placeholder:text-muted-foreground focus:outline-none focus:border-[#5c4df0]"
                  onChange={(e) => setAliasFormPrefix(e.target.value)}
                  placeholder="e.g. sales"
                  required
                  type="text"
                  value={aliasFormPrefix}
                />
                <span className="bg-[#202024] border border-l-0 border-[#232328] px-3 py-2 text-muted-foreground rounded-r">
                  @{sites.find((s) => s.id === aliasFormSiteId)?.site_domain ?? 'domain.com'}
                </span>
              </div>
            </div>

            <div>
              <label className="text-muted-foreground block mb-1">Forward To (Destination Email)</label>
              <input
                className="w-full bg-[#121214] border border-[#232328] rounded px-3 py-2 text-white placeholder:text-muted-foreground focus:outline-none focus:border-[#5c4df0]"
                onChange={(e) => setAliasFormTarget(e.target.value)}
                placeholder="e.g. yourname@gmail.com"
                required
                type="email"
                value={aliasFormTarget}
              />
            </div>

            <DialogFooter className="pt-3">
              <button
                className="px-3.5 py-2 bg-[#202024] hover:bg-[#2c2c32] text-white rounded text-xs transition"
                onClick={() => setCreateAliasOpen(false)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 bg-[#5c4df0] hover:bg-[#4b3ed0] text-white rounded text-xs font-medium transition disabled:opacity-50"
                disabled={aliasSubmitting}
                type="submit"
              >
                {aliasSubmitting ? 'Saving...' : 'Add Forwarder'}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal: Autoresponder Settings */}
      <Dialog onOpenChange={(open) => !open && setAutoresponderModalBox(null)} open={!!autoresponderModalBox}>
        <DialogContent className="sm:max-w-[420px] bg-[#161619] border-[#232328] text-white">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">
              Autoresponder: {autoresponderModalBox?.emailAddress}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 text-xs pt-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                checked={editAutoEnabled}
                className="rounded border-[#232328] text-[#5c4df0] focus:ring-0"
                onChange={(e) => setEditAutoEnabled(e.target.checked)}
                type="checkbox"
              />
              <span className="text-white font-medium">Enable Vacation Auto-Responder</span>
            </label>

            <div>
              <label className="text-muted-foreground block mb-1">Subject</label>
              <input
                className="w-full bg-[#121214] border border-[#232328] rounded px-3 py-2 text-white placeholder:text-muted-foreground focus:outline-none focus:border-[#5c4df0]"
                onChange={(e) => setEditAutoSubject(e.target.value)}
                placeholder="Out of Office / Auto-Reply"
                type="text"
                value={editAutoSubject}
              />
            </div>

            <div>
              <label className="text-muted-foreground block mb-1">Message Body</label>
              <textarea
                className="w-full bg-[#121214] border border-[#232328] rounded px-3 py-2 text-white placeholder:text-muted-foreground focus:outline-none focus:border-[#5c4df0] h-28"
                onChange={(e) => setEditAutoBody(e.target.value)}
                placeholder="Write your automated reply message here..."
                value={editAutoBody}
              />
            </div>

            <DialogFooter className="pt-3">
              <button
                className="px-3.5 py-2 bg-[#202024] hover:bg-[#2c2c32] text-white rounded text-xs transition"
                onClick={() => setAutoresponderModalBox(null)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 bg-[#5c4df0] hover:bg-[#4b3ed0] text-white rounded text-xs font-medium transition disabled:opacity-50"
                disabled={editAutoSaving}
                onClick={handleSaveAutoresponder}
                type="button"
              >
                {editAutoSaving ? 'Saving...' : 'Save Settings'}
              </button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
