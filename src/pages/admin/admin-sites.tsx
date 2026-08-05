import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Search } from 'lucide-react'

import { mockAdminSites, mockAdminUsers, mockNodes } from '@/data/mockAdmin'
import {
  fetchAllProfiles,
  fetchAllSitesAdmin,
  fetchNodes,
  type AdminProfile,
  type AdminSiteRow,
  type HostingNode,
} from '@/lib/db/admin'
import { adminAction } from '@/lib/functions'
import { useSession } from '@/lib/session-store'
import { isDemoMode, supabase } from '@/lib/supabase'
import { formatDateLabel } from '@/lib/utils'
import { cn } from '@/lib/utils'
import {
  AdminPageHeader,
  DemoNotice,
  EmptyRow,
  StatusBadge,
  TableCard,
  cellClass,
  rowClass,
  tableClass,
  tbodyClass,
  theadRowClass,
  thClass,
  type BadgeTone,
} from '@/components/admin/admin-ui'

const siteTone: Record<AdminSiteRow['status'], BadgeTone> = {
  active: 'green',
  provisioning: 'sky',
  suspended: 'amber',
  failed: 'red',
}

const statusFilters = ['all', 'active', 'provisioning', 'suspended', 'failed'] as const
type StatusFilter = (typeof statusFilters)[number]

export function AdminSites() {
  const { isDemo } = useSession()
  const [searchParams, setSearchParams] = useSearchParams()

  const [sites, setSites] = useState<AdminSiteRow[]>(isDemoMode ? mockAdminSites : [])
  const [nodes, setNodes] = useState<HostingNode[]>(isDemoMode ? mockNodes : [])
  const [profiles, setProfiles] = useState<AdminProfile[]>(isDemoMode ? mockAdminUsers : [])
  const [search, setSearch] = useState('')
  const [busySiteId, setBusySiteId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ kind: 'demo' | 'error'; text?: string } | null>(
    null,
  )

  const statusParam = searchParams.get('status')
  const statusFilter: StatusFilter = statusFilters.includes(statusParam as StatusFilter)
    ? (statusParam as StatusFilter)
    : 'all'
  const nodeFilter = searchParams.get('node') ?? 'all'

  useEffect(() => {
    if (!supabase) return
    const sb = supabase

    async function loadLiveData() {
      try {
        const [liveSites, liveNodes, liveProfiles] = await Promise.all([
          fetchAllSitesAdmin(sb),
          fetchNodes(sb),
          fetchAllProfiles(sb),
        ])
        setSites(liveSites)
        setNodes(liveNodes)
        setProfiles(liveProfiles)
      } catch (error) {
        console.warn('Admin sites fetch failed, keeping demo data:', error)
      }
    }

    sb.auth.getSession().then(({ data: { session } }) => {
      if (session) void loadLiveData()
    })
  }, [])

  const ownerByUser = useMemo(
    () => new Map(profiles.map((p) => [p.userId, p.displayName || p.accountId])),
    [profiles],
  )
  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return sites.filter((site) => {
      if (statusFilter !== 'all' && site.status !== statusFilter) return false
      if (nodeFilter !== 'all' && site.nodeId !== nodeFilter) return false
      if (!term) return true
      return (
        site.siteDomain.toLowerCase().includes(term) ||
        (ownerByUser.get(site.userId) ?? '').toLowerCase().includes(term)
      )
    })
  }, [sites, statusFilter, nodeFilter, search, ownerByUser])

  function setFilter(key: 'status' | 'node', value: string) {
    const next = new URLSearchParams(searchParams)
    if (value === 'all') next.delete(key)
    else next.set(key, value)
    setSearchParams(next, { replace: true })
  }

  async function handleStatusToggle(site: AdminSiteRow) {
    const nextStatus = site.status === 'suspended' ? 'active' : 'suspended'

    if (isDemo || !supabase) {
      setSites((prev) =>
        prev.map((s) => (s.id === site.id ? { ...s, status: nextStatus } : s)),
      )
      setFeedback({ kind: 'demo' })
      return
    }

    setBusySiteId(site.id)
    setFeedback(null)
    try {
      await adminAction(supabase, {
        action: 'set_site_status',
        siteId: site.id,
        status: nextStatus,
      })
      setSites((prev) =>
        prev.map((s) => (s.id === site.id ? { ...s, status: nextStatus } : s)),
      )
    } catch (error) {
      setFeedback({
        kind: 'error',
        text: error instanceof Error ? error.message : 'Site update failed',
      })
    } finally {
      setBusySiteId(null)
    }
  }

  const failedCount = sites.filter((s) => s.status === 'failed').length

  return (
    <div className="space-y-6">
      <AdminPageHeader
        description="Every WordPress site on the platform, across all customers and nodes."
        title="Sites"
      />

      {feedback?.kind === 'demo' ? <DemoNotice /> : null}
      {feedback?.kind === 'error' ? (
        <p className="text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">
          {feedback.text}
        </p>
      ) : null}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 bg-[#161618] border border-[#232328] rounded-md p-1">
          {statusFilters.map((status) => (
            <button
              className={cn(
                'px-3 py-1.5 rounded text-xs font-semibold transition',
                statusFilter === status
                  ? 'bg-[#262629] text-white'
                  : 'text-muted-foreground hover:text-white',
              )}
              key={status}
              onClick={() => setFilter('status', status)}
            >
              {status === 'all' ? 'All' : status}
              {status === 'failed' && failedCount > 0 ? (
                <span className="ml-1.5 text-red-400">({failedCount})</span>
              ) : null}
            </button>
          ))}
        </div>

        <select
          className="bg-[#161618] border border-[#232328] rounded-md px-3 py-2 text-xs text-white focus:outline-none focus:border-[#5c4df0]/50"
          onChange={(event) => setFilter('node', event.target.value)}
          value={nodeFilter}
        >
          <option value="all">All nodes</option>
          {nodes.map((node) => (
            <option key={node.id} value={node.id}>
              {node.cpanelUsername}
            </option>
          ))}
        </select>

        <div className="relative flex-1 min-w-[220px] max-w-xs">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            className="w-full bg-[#161618] border border-[#232328] rounded-md pl-9 pr-4 py-2 text-xs text-white placeholder-muted-foreground focus:outline-none focus:border-[#5c4df0]/50 transition-colors"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search domain or owner"
            type="text"
            value={search}
          />
        </div>
      </div>

      <TableCard
        footer={
          <span>
            {filtered.length} site{filtered.length === 1 ? '' : 's'}
          </span>
        }
        title="All sites"
      >
        <table className={tableClass}>
          <thead>
            <tr className={theadRowClass}>
              <th className={thClass}>Domain</th>
              <th className={thClass}>Owner</th>
              <th className={thClass}>Node</th>
              <th className={thClass}>Plan</th>
              <th className={thClass}>Status</th>
              <th className={thClass}>Created</th>
              <th className={thClass}>Actions</th>
            </tr>
          </thead>
          <tbody className={tbodyClass}>
            {filtered.map((site) => {
              const node = nodeById.get(site.nodeId)
              return (
                <tr className={rowClass} key={site.id}>
                  <td className={`${cellClass} font-semibold`}>{site.siteDomain}</td>
                  <td className={cellClass}>
                    <Link
                      className="text-[#5c4df0] hover:text-[#796ef3] hover:underline"
                      to={`/admin/users/${site.userId}`}
                    >
                      {ownerByUser.get(site.userId) ?? site.userId.slice(0, 8)}
                    </Link>
                  </td>
                  <td className={`${cellClass} text-muted-foreground font-mono text-[10px]`}>
                    {node?.cpanelUsername ?? site.nodeId.slice(0, 8)}
                  </td>
                  <td className={`${cellClass} text-muted-foreground`}>{site.plan}</td>
                  <td className={cellClass}>
                    <StatusBadge tone={siteTone[site.status]}>{site.status}</StatusBadge>
                  </td>
                  <td className={`${cellClass} text-muted-foreground`}>
                    {formatDateLabel(site.createdAt)}
                  </td>
                  <td className={cellClass}>
                    {site.status === 'active' || site.status === 'suspended' ? (
                      <button
                        className="text-[#5c4df0] hover:text-[#796ef3] font-semibold disabled:opacity-50"
                        disabled={busySiteId === site.id}
                        onClick={() => void handleStatusToggle(site)}
                      >
                        {busySiteId === site.id
                          ? 'Saving…'
                          : site.status === 'suspended'
                            ? 'Unsuspend'
                            : 'Suspend'}
                      </button>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              )
            })}
            {filtered.length === 0 ? (
              <EmptyRow colSpan={7} message="No sites match these filters." />
            ) : null}
          </tbody>
        </table>
      </TableCard>
    </div>
  )
}
