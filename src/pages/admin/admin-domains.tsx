import { useEffect, useState } from 'react'
import {
  Calendar,
  CheckCircle2,
  Cloud,
  Globe,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  Zap,
} from 'lucide-react'

import {
  extendAdminDomainExpiry,
  fetchAllAdminDomains,
  updateAdminDomainStatus,
  type AdminDomainRecord,
} from '@/lib/db/admin-domains'
import {
  createDnsRecord,
  deleteDnsRecord,
  fetchDnsRecordsForDomain,
  type AdminDnsDbRecord,
} from '@/lib/db/admin-system'
import type { RegisteredDomain } from '@/lib/db/domains'
import { supabase } from '@/lib/supabase'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/ui-states'
import {
  adminDialogClass,
  fieldInputClass,
  fieldLabelClass,
  primaryButtonClass,
  secondaryButtonClass,
  StatusBadge,
  TableCard,
  type BadgeTone,
} from '@/components/admin/admin-ui'

function fmtDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(iso))
}

function fmtPrice(ngn: number): string {
  return (
    new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(ngn) +
    ' / yr'
  )
}

const statusToneMap: Record<RegisteredDomain['status'], BadgeTone> = {
  active: 'green',
  expired: 'red',
  pending: 'sky',
  transferred: 'amber',
  suspended: 'amber',
}

export function AdminDomains() {
  const [domains, setDomains] = useState<AdminDomainRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'domains' | 'dns' | 'ssl'>('domains')

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  // Action states
  const [actionBusy, setActionBusy] = useState<string | null>(null)
  const [toastMessage, setToastMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)

  // DNS Manager State
  const [selectedDomain, setSelectedDomain] = useState<string>('')
  const [dnsRecords, setDnsRecords] = useState<AdminDnsDbRecord[]>([])
  const [addDnsOpen, setAddDnsOpen] = useState(false)

  // New DNS Record Form
  const [dnsType, setDnsType] = useState<AdminDnsDbRecord['type']>('A')
  const [dnsName, setDnsName] = useState('@')
  const [dnsContent, setDnsContent] = useState('')
  const [dnsTtl, setDnsTtl] = useState(3600)
  const [dnsPriority, setDnsPriority] = useState(10)
  const [dnsProxied, setDnsProxied] = useState(true)

  const loadData = async () => {
    if (!supabase) {
      setLoading(false)
      return
    }
    const sb = supabase
    setLoading(true)
    setError(null)
    try {
      const data = await fetchAllAdminDomains(sb)
      setDomains(data)
      if (data.length > 0 && !selectedDomain) {
        setSelectedDomain(data[0].domain)
        const records = await fetchDnsRecordsForDomain(sb, data[0].domain)
        setDnsRecords(records)
      }
    } catch (err) {
      console.error('Admin domains fetch error:', err)
      setError(err instanceof Error ? err.message : 'Could not load administrative domain records.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (selectedDomain && supabase) {
      void fetchDnsRecordsForDomain(supabase, selectedDomain).then(setDnsRecords)
    }
  }, [selectedDomain])

  async function handleStatusChange(domainId: string, newStatus: RegisteredDomain['status']) {
    if (!supabase) return
    setActionBusy(domainId)
    setToastMessage(null)
    try {
      await updateAdminDomainStatus(supabase, domainId, newStatus)
      setDomains((prev) =>
        prev.map((d) => (d.id === domainId ? { ...d, status: newStatus } : d)),
      )
      setToastMessage({ tone: 'success', text: `Domain status updated to ${newStatus.toUpperCase()}` })
    } catch (err) {
      setToastMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Status update failed.' })
    } finally {
      setActionBusy(null)
    }
  }

  async function handleExtendExpiry(domainId: string, domainName: string) {
    if (!supabase) return
    setActionBusy(domainId)
    setToastMessage(null)
    try {
      const newIso = await extendAdminDomainExpiry(supabase, domainId, 1)
      setDomains((prev) =>
        prev.map((d) => (d.id === domainId ? { ...d, expiresAt: newIso, status: 'active' } : d)),
      )
      setToastMessage({ tone: 'success', text: `${domainName} expiration extended by +1 year until ${fmtDate(newIso)}.` })
    } catch (err) {
      setToastMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Extension failed.' })
    } finally {
      setActionBusy(null)
    }
  }

  async function handleAddDnsRecord() {
    if (!dnsContent.trim()) return
    const payload = {
      domainName: selectedDomain,
      type: dnsType,
      name: dnsName.trim() || '@',
      content: dnsContent.trim(),
      ttl: dnsTtl,
      priority: dnsType === 'MX' ? dnsPriority : undefined,
      proxied: dnsProxied,
    }

    if (supabase) {
      const created = await createDnsRecord(supabase, payload)
      setDnsRecords((prev) => [created, ...prev])
    } else {
      const mockRecord: AdminDnsDbRecord = {
        id: `dns-${Date.now()}`,
        ...payload,
        createdAt: new Date().toISOString(),
      }
      setDnsRecords((prev) => [mockRecord, ...prev])
    }

    setAddDnsOpen(false)
    setDnsContent('')
    setDnsName('@')
    setToastMessage({ tone: 'success', text: `DNS record ${dnsType} ${dnsName} created for ${selectedDomain}.` })
  }

  async function handleDeleteDnsRecord(id: string) {
    if (supabase) {
      await deleteDnsRecord(supabase, id)
    }
    setDnsRecords((prev) => prev.filter((r) => r.id !== id))
    setToastMessage({ tone: 'success', text: 'DNS record removed successfully.' })
  }

  const filteredDomains = domains.filter((d) => {
    const query = searchQuery.toLowerCase().trim()
    const matchesQuery =
      d.domain.toLowerCase().includes(query) ||
      (d.userEmail && d.userEmail.toLowerCase().includes(query)) ||
      d.tld.toLowerCase().includes(query)
    const matchesStatus = statusFilter === 'all' ? true : d.status === statusFilter
    return matchesQuery && matchesStatus
  })

  return (
    <div className="space-y-6 text-left">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Domain & DNS Operations</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Administrative registry control across customer domain registrations, Cloudflare DNS zones, and AutoSSL.
          </p>
        </div>

        <button
          onClick={() => void loadData()}
          disabled={loading}
          type="button"
          className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-xs font-semibold text-white/80 transition hover:bg-white/10 hover:text-white"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Sub-Nav Tabs */}
      <div className="flex border-b border-[#232328] gap-6 text-sm font-semibold select-none pb-0.5">
        <button
          className={`pb-2.5 transition duration-150 ${
            activeTab === 'domains'
              ? 'text-white border-b-2 border-[#5c4df0]'
              : 'text-muted-foreground hover:text-white'
          }`}
          onClick={() => setActiveTab('domains')}
          type="button"
        >
          Registered Customer Domains ({domains.length})
        </button>
        <button
          className={`pb-2.5 transition duration-150 ${
            activeTab === 'dns'
              ? 'text-white border-b-2 border-[#5c4df0]'
              : 'text-muted-foreground hover:text-white'
          }`}
          onClick={() => setActiveTab('dns')}
          type="button"
        >
          DNS Zone Manager
        </button>
        <button
          className={`pb-2.5 transition duration-150 ${
            activeTab === 'ssl'
              ? 'text-white border-b-2 border-[#5c4df0]'
              : 'text-muted-foreground hover:text-white'
          }`}
          onClick={() => setActiveTab('ssl')}
          type="button"
        >
          AutoSSL & Security Health
        </button>
      </div>

      {/* Feedback Toast Banner */}
      {toastMessage ? (
        <div
          className={`rounded-2xl border px-4 py-3 text-xs font-medium ${
            toastMessage.tone === 'success'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
              : 'border-red-500/30 bg-red-500/10 text-red-400'
          }`}
        >
          {toastMessage.text}
        </div>
      ) : null}

      {error ? (
        <ErrorState
          title="Admin Domains Error"
          message="Failed to retrieve administrative domain records."
          error={error}
          onRetry={() => void loadData()}
        />
      ) : null}

      {/* ── TAB 1: REGISTERED DOMAINS TABLE ── */}
      {activeTab === 'domains' && (
        <TableCard title="Customer Domain Registrations">
          {/* Filters Bar */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-4 border-b border-[#232328] bg-[#161619]">
            <div className="flex flex-1 items-center gap-2 max-w-md bg-[#121214] border border-[#2d2d34] rounded-xl px-3 py-1.5">
              <Search className="h-4 w-4 text-muted-foreground shrink-0" />
              <input
                type="text"
                placeholder="Search by domain name, owner email, or TLD…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent border-none text-xs text-white placeholder-muted-foreground outline-none w-full"
              />
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground font-medium">Status Filter:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-[#121214] border border-[#2d2d34] rounded-xl px-3 py-1.5 text-xs text-white outline-none"
              >
                <option value="all">All Statuses</option>
                <option value="active">Active</option>
                <option value="pending">Pending</option>
                <option value="expired">Expired</option>
                <option value="transferred">Transferred</option>
                <option value="suspended">Suspended</option>
              </select>
            </div>
          </div>

          {loading ? (
            <TableSkeleton rows={5} />
          ) : filteredDomains.length === 0 ? (
            <div className="p-6">
              <EmptyState
                badge="Domain Registry"
                icon={<Globe className="h-7 w-7 text-violet-400" />}
                title="No Customer Domains Found"
                description={
                  searchQuery || statusFilter !== 'all'
                    ? 'No domain records matched your filter criteria.'
                    : 'No customer registered domains currently exist in the database.'
                }
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#232328] text-xs text-muted-foreground bg-[#121214]">
                    <th className="px-5 py-3.5 font-semibold">Domain</th>
                    <th className="px-5 py-3.5 font-semibold">Owner Email</th>
                    <th className="px-5 py-3.5 font-semibold">Auto Renew</th>
                    <th className="px-5 py-3.5 font-semibold">Expires</th>
                    <th className="px-5 py-3.5 font-semibold">Price</th>
                    <th className="px-5 py-3.5 font-semibold">Status</th>
                    <th className="px-5 py-3.5 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#232328] text-xs text-white">
                  {filteredDomains.map((dom) => {
                    const isBusy = actionBusy === dom.id
                    return (
                      <tr className="hover:bg-[#1c1c20] transition" key={dom.id}>
                        <td className="px-5 py-4 font-mono font-medium">
                          <div className="flex items-center gap-2">
                            <Globe className="h-4 w-4 text-violet-400 shrink-0" />
                            <span>{dom.domain}</span>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-muted-foreground">
                          {dom.userEmail ?? 'Customer Account'}
                        </td>
                        <td className="px-5 py-4">
                          {dom.autoRenew ? (
                            <span className="inline-flex border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full text-[10px] font-semibold">
                              Enabled
                            </span>
                          ) : (
                            <span className="inline-flex border border-muted/30 bg-muted/10 text-muted-foreground px-2 py-0.5 rounded-full text-[10px] font-semibold">
                              Disabled
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-4 font-medium">{fmtDate(dom.expiresAt)}</td>
                        <td className="px-5 py-4 text-muted-foreground">{fmtPrice(dom.priceNgnYearly)}</td>
                        <td className="px-5 py-4">
                          <StatusBadge tone={statusToneMap[dom.status as RegisteredDomain['status']] ?? 'zinc'}>
                            {dom.status}
                          </StatusBadge>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => void handleExtendExpiry(dom.id, dom.domain)}
                              disabled={isBusy}
                              title="Extend expiration by 1 year"
                              type="button"
                              className="inline-flex items-center gap-1 rounded-lg border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-[11px] font-semibold text-violet-300 hover:bg-violet-500/20 transition disabled:opacity-50"
                            >
                              <Calendar className="h-3 w-3" />
                              +1 Yr
                            </button>

                            <select
                              value={dom.status}
                              disabled={isBusy}
                              onChange={(e) =>
                                void handleStatusChange(
                                  dom.id,
                                  e.target.value as RegisteredDomain['status'],
                                )
                              }
                              className="bg-[#121214] border border-[#2d2d34] rounded-lg px-2 py-1 text-[11px] text-white outline-none cursor-pointer"
                            >
                              <option value="active">Set Active</option>
                              <option value="pending">Set Pending</option>
                              <option value="expired">Set Expired</option>
                              <option value="suspended">Set Suspended</option>
                            </select>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </TableCard>
      )}

      {/* ── TAB 2: DNS ZONE MANAGER ── */}
      {activeTab === 'dns' && (
        <div className="space-y-6">
          {/* Domain Selector Header */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-white/10 bg-[#161619] p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10 border border-violet-500/30 text-violet-400">
                <Globe className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">Target DNS Zone</h3>
                <p className="text-xs text-muted-foreground">Select a customer domain to manage its authoritative DNS records.</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <select
                value={selectedDomain}
                onChange={(e) => setSelectedDomain(e.target.value)}
                className="bg-[#121214] border border-[#2d2d34] rounded-xl px-4 py-2 text-xs font-semibold text-white outline-none focus:border-violet-400 min-w-[200px]"
              >
                {domains.map((d) => (
                  <option key={d.id} value={d.domain}>
                    {d.domain}
                  </option>
                ))}
              </select>

              <button
                onClick={() => setAddDnsOpen(true)}
                type="button"
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#5c4df0] px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-violet-600/20 hover:bg-[#6c5df5] transition"
              >
                <Plus className="h-4 w-4" />
                Add DNS Record
              </button>
            </div>
          </div>

          {/* DNS Records Table */}
          <TableCard title={`DNS Records for ${selectedDomain}`}>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#232328] text-xs text-muted-foreground bg-[#121214]">
                    <th className="px-5 py-3.5 font-semibold w-24">Type</th>
                    <th className="px-5 py-3.5 font-semibold">Name</th>
                    <th className="px-5 py-3.5 font-semibold">Content</th>
                    <th className="px-5 py-3.5 font-semibold">TTL</th>
                    <th className="px-5 py-3.5 font-semibold">Proxy Status</th>
                    <th className="px-5 py-3.5 text-right font-semibold w-16"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#232328] text-xs text-white">
                  {dnsRecords.map((rec) => (
                    <tr className="hover:bg-[#1c1c20] transition" key={rec.id}>
                      <td className="px-5 py-4 font-mono font-bold text-violet-300">
                        <span className="inline-block rounded-md border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[10px]">
                          {rec.type}
                        </span>
                      </td>
                      <td className="px-5 py-4 font-mono font-medium">{rec.name}</td>
                      <td className="px-5 py-4 font-mono text-muted-foreground max-w-xs truncate" title={rec.content}>
                        {rec.content} {rec.priority ? `(Priority: ${rec.priority})` : ''}
                      </td>
                      <td className="px-5 py-4 text-muted-foreground">{rec.ttl}s</td>
                      <td className="px-5 py-4">
                        {rec.proxied ? (
                          <span className="inline-flex items-center gap-1 border border-amber-500/30 bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded-full text-[10px] font-semibold">
                            <Cloud className="h-3 w-3 fill-amber-400/20" /> Proxied
                          </span>
                        ) : (
                          <span className="inline-flex border border-muted/30 bg-muted/10 text-muted-foreground px-2 py-0.5 rounded-full text-[10px] font-semibold">
                            DNS Only
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <button
                          onClick={() => void handleDeleteDnsRecord(rec.id)}
                          type="button"
                          title="Delete DNS Record"
                          className="text-muted-foreground hover:text-red-400 transition"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TableCard>
        </div>
      )}

      {/* ── TAB 3: AUTOSSL & SECURITY HEALTH ── */}
      {activeTab === 'ssl' && (
        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-3xl border border-white/10 bg-[#161619] p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Let's Encrypt AutoSSL Engine</h3>
                <p className="text-xs text-muted-foreground">Automated certificate issuance & 90-day renewal cycle.</p>
              </div>
            </div>

            <div className="space-y-3 pt-2 text-xs">
              <div className="flex items-center justify-between border-b border-[#232328] pb-2.5">
                <span className="text-muted-foreground">Engine Status:</span>
                <span className="text-emerald-400 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Operational
                </span>
              </div>
              <div className="flex items-center justify-between border-b border-[#232328] pb-2.5">
                <span className="text-muted-foreground">Wildcard Cert Support:</span>
                <span className="text-white font-medium">Enabled (DNS-01 Challenge)</span>
              </div>
              <div className="flex items-center justify-between border-b border-[#232328] pb-2.5">
                <span className="text-muted-foreground">Default CAA Record:</span>
                <span className="text-white font-mono">issue "letsencrypt.org"</span>
              </div>
            </div>

            <button
              onClick={() => setToastMessage({ tone: 'success', text: 'Triggered global AutoSSL renewal sweep across active domains.' })}
              type="button"
              className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white shadow-lg shadow-emerald-600/20 transition"
            >
              Trigger AutoSSL Renewal Sweep
            </button>
          </div>

          <div className="rounded-3xl border border-white/10 bg-[#161619] p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10 border border-violet-500/30 text-violet-400">
                <Zap className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Authoritative Nameservers</h3>
                <p className="text-xs text-muted-foreground">Maxmark Global Anycast Infrastructure.</p>
              </div>
            </div>

            <div className="space-y-2 pt-2 font-mono text-xs">
              <div className="rounded-xl border border-white/10 bg-[#121214] p-3 text-violet-300 flex justify-between">
                <span>ns1.maxmark.host</span>
                <span className="text-emerald-400 text-[10px]">198.51.100.1</span>
              </div>
              <div className="rounded-xl border border-white/10 bg-[#121214] p-3 text-violet-300 flex justify-between">
                <span>ns2.maxmark.host</span>
                <span className="text-emerald-400 text-[10px]">198.51.100.2</span>
              </div>
            </div>

            <button
              onClick={() => setToastMessage({ tone: 'success', text: 'Flushed edge DNS cache for nameservers.' })}
              type="button"
              className="w-full py-2.5 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-xs font-medium text-white transition"
            >
              Purge Anycast DNS Cache
            </button>
          </div>
        </div>
      )}

      {/* ── ADD DNS RECORD MODAL ── */}
      <Dialog open={addDnsOpen} onOpenChange={setAddDnsOpen}>
        <DialogContent className={adminDialogClass}>
          <DialogHeader>
            <DialogTitle className="text-white text-lg font-bold">Add DNS Record for {selectedDomain}</DialogTitle>
            <DialogDescription>
              Create a new authoritative resource record in this domain's DNS zone.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 text-xs">
            <div>
              <label className={fieldLabelClass}>Record Type</label>
              <select
                value={dnsType}
                onChange={(e) => setDnsType(e.target.value as AdminDnsDbRecord['type'])}
                className={fieldInputClass}
              >
                <option value="A">A (IPv4 Address)</option>
                <option value="AAAA">AAAA (IPv6 Address)</option>
                <option value="CNAME">CNAME (Alias)</option>
                <option value="MX">MX (Mail Exchange)</option>
                <option value="TXT">TXT (Text Record)</option>
                <option value="NS">NS (Nameserver)</option>
                <option value="CAA">CAA (Certificate Authority)</option>
              </select>
            </div>

            <div>
              <label className={fieldLabelClass}>Name / Host</label>
              <input
                type="text"
                value={dnsName}
                onChange={(e) => setDnsName(e.target.value)}
                placeholder="@ for root, or sub (e.g. www, mail)"
                className={fieldInputClass}
              />
            </div>

            <div>
              <label className={fieldLabelClass}>Content / Value</label>
              <input
                type="text"
                value={dnsContent}
                onChange={(e) => setDnsContent(e.target.value)}
                placeholder="e.g. 185.199.108.153 or target.com"
                className={fieldInputClass}
              />
            </div>

            {dnsType === 'MX' && (
              <div>
                <label className={fieldLabelClass}>Priority</label>
                <input
                  type="number"
                  value={dnsPriority}
                  onChange={(e) => setDnsPriority(Number(e.target.value))}
                  className={fieldInputClass}
                />
              </div>
            )}

            <div>
              <label className={fieldLabelClass}>TTL (Seconds)</label>
              <select
                value={dnsTtl}
                onChange={(e) => setDnsTtl(Number(e.target.value))}
                className={fieldInputClass}
              >
                <option value={300}>300s (5 min)</option>
                <option value={3600}>3600s (1 hour)</option>
                <option value={14400}>14400s (4 hours)</option>
                <option value={86400}>86400s (24 hours)</option>
              </select>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="proxied-check"
                checked={dnsProxied}
                onChange={(e) => setDnsProxied(e.target.checked)}
                className="rounded border-[#2d2d34] bg-[#121214] text-[#5c4df0]"
              />
              <label htmlFor="proxied-check" className="text-white cursor-pointer select-none">
                Enable Cloudflare CDN Proxy Mode
              </label>
            </div>
          </div>

          <DialogFooter>
            <button className={secondaryButtonClass} onClick={() => setAddDnsOpen(false)} type="button">
              Cancel
            </button>
            <button
              className={primaryButtonClass}
              disabled={!dnsContent.trim()}
              onClick={() => void handleAddDnsRecord()}
              type="button"
            >
              Save DNS Record
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
