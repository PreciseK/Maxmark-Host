import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Edit2, Trash2, ExternalLink, Settings, ShieldAlert, Check, Search, Globe, KeyRound } from 'lucide-react'

import {
  fetchAllProfiles,
  fetchAllSitesAdmin,
  fetchNodes,
  type AdminProfile,
  type AdminSiteRow,
  type HostingNode,
} from '@/lib/db/admin'
import { adminAction, deprovisionSite } from '@/lib/functions'
import { supabase } from '@/lib/supabase'
import { formatDateLabel } from '@/lib/utils'
import { cn } from '@/lib/utils'
import {
  AdminPageHeader,
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
  adminDialogClass,
} from '@/components/admin/admin-ui'
import { ActionDropdown } from '@/components/ui/dropdown-menu'
import { WordPressLogo } from '@/components/icons/wordpress-logo'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'

const siteTone: Record<AdminSiteRow['status'], BadgeTone> = {
  active: 'green',
  provisioning: 'sky',
  suspended: 'amber',
  failed: 'red',
}

const deployTone: Record<AdminSiteRow['lastDeployStatus'], BadgeTone> = {
  idle: 'zinc',
  deploying: 'sky',
  success: 'green',
  failed: 'red',
}

const statusFilters = ['all', 'active', 'provisioning', 'suspended', 'failed'] as const
type StatusFilter = (typeof statusFilters)[number]

export function AdminSites() {
  const [searchParams, setSearchParams] = useSearchParams()

  const [sites, setSites] = useState<AdminSiteRow[]>([])
  const [nodes, setNodes] = useState<HostingNode[]>([])
  const [profiles, setProfiles] = useState<AdminProfile[]>([])
  const [search, setSearch] = useState('')
  const [feedback, setFeedback] = useState<{ kind: 'demo' | 'error' | 'success'; text?: string } | null>(
    null,
  )

  // Edit Site State
  const [editingSite, setEditingSite] = useState<AdminSiteRow | null>(null)
  const [editDomain, setEditDomain] = useState('')
  const [editPlan, setEditPlan] = useState('')
  const [editPhpVersion, setEditPhpVersion] = useState('8.2')
  const [editStatus, setEditStatus] = useState<AdminSiteRow['status']>('active')
  const [isSavingEdit, setIsSavingEdit] = useState(false)

  // Delete Site State
  const [deletingSite, setDeletingSite] = useState<AdminSiteRow | null>(null)
  const [confirmDomainInput, setConfirmDomainInput] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)

  const statusParam = searchParams.get('status')
  const typeParam = searchParams.get('type') ?? 'all'
  const statusFilter: StatusFilter = statusFilters.includes(statusParam as StatusFilter)
    ? (statusParam as StatusFilter)
    : 'all'
  const nodeFilter = searchParams.get('node') ?? searchParams.get('nodeId') ?? 'all'

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
      if (typeParam !== 'all' && (site.siteType ?? 'wordpress') !== typeParam) return false
      if (nodeFilter !== 'all' && site.nodeId !== nodeFilter) return false
      if (!term) return true
      return (
        site.siteDomain.toLowerCase().includes(term) ||
        (ownerByUser.get(site.userId) ?? '').toLowerCase().includes(term)
      )
    })
  }, [sites, statusFilter, typeParam, nodeFilter, search, ownerByUser])

  function setFilter(key: 'status' | 'node' | 'type', value: string) {
    const next = new URLSearchParams(searchParams)
    if (value === 'all') next.delete(key)
    else next.set(key, value)
    setSearchParams(next, { replace: true })
  }

  async function handleStatusToggle(site: AdminSiteRow) {
    const nextStatus = site.status === 'suspended' ? 'active' : 'suspended'

    if (!supabase) return

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
    }
  }

  function openEditModal(site: AdminSiteRow) {
    setEditingSite(site)
    setEditDomain(site.siteDomain)
    setEditPlan(site.plan)
    setEditPhpVersion(site.phpVersion || '8.2')
    setEditStatus(site.status)
  }

  async function handleSaveEdit() {
    if (!editingSite || !supabase) return
    setIsSavingEdit(true)
    setFeedback(null)
    try {
      const { error } = await supabase
        .from('user_sites')
        .update({
          site_domain: editDomain,
          plan: editPlan,
          status: editStatus,
          php_version: editPhpVersion,
        })
        .eq('id', editingSite.id)

      if (error) throw error

      setSites((prev) =>
        prev.map((s) =>
          s.id === editingSite.id
            ? {
                ...s,
                siteDomain: editDomain,
                plan: editPlan,
                status: editStatus,
                phpVersion: editPhpVersion,
              }
            : s,
        ),
      )

      setFeedback({ kind: 'success', text: `Updated details for ${editDomain}` })
      setEditingSite(null)
    } catch (err) {
      setFeedback({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Failed to update site',
      })
    } finally {
      setIsSavingEdit(false)
    }
  }

  async function handleDeleteSite() {
    if (!deletingSite || !supabase) return
    setIsDeleting(true)
    setFeedback(null)
    try {
      await deprovisionSite(supabase, deletingSite.id)

      setSites((prev) => prev.filter((s) => s.id !== deletingSite.id))
      setFeedback({ kind: 'success', text: `Successfully purged site ${deletingSite.siteDomain} from cPanel node & database` })
      setDeletingSite(null)
      setConfirmDomainInput('')
    } catch (err) {
      setFeedback({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Failed to delete site from cPanel node',
      })
    } finally {
      setIsDeleting(false)
    }
  }

  const failedCount = sites.filter((s) => s.status === 'failed').length

  return (
    <div className="space-y-6">
      <AdminPageHeader
        description="Every site provisioned on the platform — WordPress, Next.js, Static, and Node.js."
        title="Sites"
      />

      {feedback?.kind === 'error' ? (
        <p className="text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">
          {feedback.text}
        </p>
      ) : feedback?.kind === 'success' ? (
        <p className="text-[11px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-md px-3 py-2 flex items-center gap-1.5">
          <Check className="h-3.5 w-3.5" /> {feedback.text}
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
          onChange={(event) => setFilter('type', event.target.value)}
          value={typeParam}
        >
          <option value="all">All types</option>
          <option value="wordpress">WordPress</option>
          <option value="nextjs">Next.js</option>
          <option value="static">Static Site</option>
          <option value="nodejs">Node.js App</option>
        </select>

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
              <th className={thClass}>Type</th>
              <th className={thClass}>Deploy</th>
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
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold border border-[#2d2d34] bg-[#202024] text-white">
                      {site.siteType === 'nextjs' ? 'Next.js'
                        : site.siteType === 'static' ? 'Static'
                        : site.siteType === 'nodejs' ? 'Node.js'
                        : 'WordPress'}
                    </span>
                  </td>
                  <td className={cellClass}>
                    {site.githubRepoUrl ? (
                      <div className="flex items-center gap-1.5">
                        <StatusBadge tone={deployTone[site.lastDeployStatus]}>
                          {site.lastDeployStatus}
                        </StatusBadge>
                        <a
                          className="text-muted-foreground hover:text-white transition"
                          href={site.githubRepoUrl}
                          rel="noopener noreferrer"
                          target="_blank"
                          title={`${site.githubRepoUrl} (${site.githubBranch})`}
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
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
                  <td className={`${cellClass} text-right`}>
                    <ActionDropdown
                      items={[
                        ...((!site.siteType || site.siteType === 'wordpress') ? [{
                          label: 'WP-Admin Dashboard',
                          icon: <WordPressLogo className="h-3.5 w-3.5 text-[#0073aa]" />,
                          onClick: () => {
                            const cleanDomain = site.siteDomain.replace(/^https?:\/\//, '').replace(/\/$/, '')
                            window.open(`https://${cleanDomain}/wp-admin`, '_blank', 'noopener,noreferrer')
                          },
                        }] : [{
                          label: 'Open Live Site',
                          icon: <Globe className="h-3.5 w-3.5 text-sky-400" />,
                          onClick: () => {
                            const cleanDomain = site.siteDomain.replace(/^https?:\/\//, '').replace(/\/$/, '')
                            window.open(`https://${cleanDomain}`, '_blank', 'noopener,noreferrer')
                          },
                        }]),
                        {
                          label: 'Open Customer Console',
                          icon: <ExternalLink className="h-3.5 w-3.5 text-sky-400" />,
                          href: `/sites/${site.id}`,
                        },
                        {
                          label: 'Environment Variables',
                          icon: <KeyRound className="h-3.5 w-3.5 text-emerald-400" />,
                          href: `/admin/environments?siteId=${site.id}`,
                        },
                        {
                          label: 'Edit Site Details',
                          icon: <Edit2 className="h-3.5 w-3.5 text-amber-400" />,
                          onClick: () => openEditModal(site),
                        },
                        {
                          label: site.status === 'suspended' ? 'Unsuspend Site' : 'Suspend Site',
                          icon: <Settings className="h-3.5 w-3.5 text-[#5c4df0]" />,
                          onClick: () => void handleStatusToggle(site),
                        },
                        {
                          label: 'Delete Site',
                          icon: <Trash2 className="h-3.5 w-3.5" />,
                          danger: true,
                          onClick: () => {
                            setDeletingSite(site)
                            setConfirmDomainInput('')
                          },
                        },
                      ]}
                    />
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

      {/* Edit Site Dialog */}
      <Dialog open={Boolean(editingSite)} onOpenChange={(open) => !open && setEditingSite(null)}>
        <DialogContent className={adminDialogClass}>
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-white flex items-center gap-2">
              <Edit2 className="h-4 w-4 text-[#5c4df0]" />
              Edit Site Configuration
            </DialogTitle>
          </DialogHeader>

          {editingSite && (
            <div className="space-y-4 text-xs py-2">
              <div className="space-y-1">
                <label className="text-muted-foreground font-medium">Domain Name</label>
                <input
                  type="text"
                  value={editDomain}
                  onChange={(e) => setEditDomain(e.target.value)}
                  className="w-full bg-[#121214] border border-[#232328] rounded px-3 py-2 text-white font-mono focus:outline-none focus:border-[#5c4df0]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-muted-foreground font-medium">Hosting Plan</label>
                  <select
                    value={editPlan}
                    onChange={(e) => setEditPlan(e.target.value)}
                    className="w-full bg-[#121214] border border-[#232328] rounded px-3 py-2 text-white focus:outline-none focus:border-[#5c4df0]"
                  >
                    <option value="WordPress Starter">WordPress Starter</option>
                    <option value="WordPress Pro">WordPress Pro</option>
                    <option value="WordPress VIP">WordPress VIP</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-muted-foreground font-medium">PHP Version</label>
                  <select
                    value={editPhpVersion}
                    onChange={(e) => setEditPhpVersion(e.target.value)}
                    className="w-full bg-[#121214] border border-[#232328] rounded px-3 py-2 text-white focus:outline-none focus:border-[#5c4df0]"
                  >
                    <option value="8.3">PHP 8.3 (Latest)</option>
                    <option value="8.2">PHP 8.2 (Recommended)</option>
                    <option value="8.1">PHP 8.1</option>
                    <option value="8.0">PHP 8.0</option>
                    <option value="7.4">PHP 7.4</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-muted-foreground font-medium">Status</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as AdminSiteRow['status'])}
                  className="w-full bg-[#121214] border border-[#232328] rounded px-3 py-2 text-white focus:outline-none focus:border-[#5c4df0]"
                >
                  <option value="active">Active</option>
                  <option value="provisioning">Provisioning</option>
                  <option value="suspended">Suspended</option>
                  <option value="failed">Failed</option>
                </select>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <button
              onClick={() => setEditingSite(null)}
              className="px-4 py-2 bg-[#202024] hover:bg-[#2c2c32] text-white/80 text-xs rounded transition"
            >
              Cancel
            </button>
            <button
              onClick={() => void handleSaveEdit()}
              disabled={isSavingEdit || !editDomain}
              className="px-4 py-2 bg-[#5c4df0] hover:bg-[#4d3fe0] text-white text-xs font-semibold rounded transition disabled:opacity-50 flex items-center gap-1.5"
            >
              {isSavingEdit ? 'Saving...' : 'Save Changes'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Site Dialog */}
      <Dialog open={Boolean(deletingSite)} onOpenChange={(open) => !open && setDeletingSite(null)}>
        <DialogContent className={adminDialogClass}>
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-red-400 flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-red-500" />
              Delete Site Permanently
            </DialogTitle>
          </DialogHeader>

          {deletingSite && (
            <div className="space-y-4 text-xs py-2">
              <p className="text-muted-foreground leading-relaxed">
                This action cannot be undone. This will permanently remove <span className="text-white font-mono font-semibold">{deletingSite.siteDomain}</span> and delete all attached credentials and metadata.
              </p>

              <div className="space-y-1">
                <label className="text-muted-foreground font-medium">
                  Type <span className="text-white font-mono">{deletingSite.siteDomain}</span> to confirm:
                </label>
                <input
                  type="text"
                  value={confirmDomainInput}
                  onChange={(e) => setConfirmDomainInput(e.target.value)}
                  placeholder={deletingSite.siteDomain}
                  className="w-full bg-[#121214] border border-[#232328] rounded px-3 py-2 text-white font-mono focus:outline-none focus:border-red-500/50"
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <button
              onClick={() => setDeletingSite(null)}
              className="px-4 py-2 bg-[#202024] hover:bg-[#2c2c32] text-white/80 text-xs rounded transition"
            >
              Cancel
            </button>
            <button
              onClick={() => void handleDeleteSite()}
              disabled={isDeleting || confirmDomainInput !== deletingSite?.siteDomain}
              className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-semibold rounded transition disabled:opacity-50 flex items-center gap-1.5"
            >
              {isDeleting ? 'Deleting...' : 'Delete Site'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
