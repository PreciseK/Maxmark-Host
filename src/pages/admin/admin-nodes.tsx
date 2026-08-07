import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ChevronDown,
  ChevronUp,
  Edit2,
  ExternalLink,
  Globe,
  Plus,
  Server,
  Settings,
  Trash2,
} from 'lucide-react'

import {
  fetchAllSitesAdmin,
  fetchNodes,
  type AdminSiteRow,
  type HostingNode,
} from '@/lib/db/admin'
import { adminAction, deprovisionSite } from '@/lib/functions'
import { supabase } from '@/lib/supabase'
import { formatDateLabel } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AdminPageHeader,
  StatusBadge,
  adminDialogClass,
  fieldInputClass,
  fieldLabelClass,
  primaryButtonClass,
  secondaryButtonClass,
  type BadgeTone,
} from '@/components/admin/admin-ui'

const nodeTone: Record<HostingNode['status'], BadgeTone> = {
  active: 'green',
  full: 'amber',
  maintenance: 'sky',
}

const siteTone: Record<AdminSiteRow['status'], BadgeTone> = {
  active: 'green',
  provisioning: 'sky',
  suspended: 'amber',
  failed: 'red',
}

interface NodeFormState {
  id: string | null
  cpanelUsername: string
  primaryDomain: string
  maxSlots: string
}

const emptyForm: NodeFormState = {
  id: null,
  cpanelUsername: '',
  primaryDomain: '',
  maxSlots: '20',
}

export function AdminNodes() {
  const [nodes, setNodes] = useState<HostingNode[]>([])
  const [sites, setSites] = useState<AdminSiteRow[]>([])
  const [expandedNodeId, setExpandedNodeId] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<NodeFormState>(emptyForm)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: 'demo' | 'error' | 'ok'; text?: string } | null>(
    null,
  )

  // Edit Site State
  const [editingSite, setEditingSite] = useState<AdminSiteRow | null>(null)
  const [editDomain, setEditDomain] = useState('')
  const [editPlan, setEditPlan] = useState('')
  const [editPhpVersion, setEditPhpVersion] = useState('PHP 8.3')
  const [editStatus, setEditStatus] = useState<AdminSiteRow['status']>('active')
  const [isSavingEditSite, setIsSavingEditSite] = useState(false)

  useEffect(() => {
    if (!supabase) return
    const sb = supabase

    async function loadLiveData() {
      try {
        const [loadedNodes, loadedSites] = await Promise.all([
          fetchNodes(sb),
          fetchAllSitesAdmin(sb),
        ])
        setNodes(loadedNodes)
        setSites(loadedSites)
      } catch (error) {
        console.warn('Admin data fetch failed:', error)
      }
    }

    sb.auth.getSession().then(({ data: { session } }) => {
      if (session) void loadLiveData()
    })
  }, [])

  function openCreate() {
    setForm(emptyForm)
    setDialogOpen(true)
  }

  function openEditNode(node: HostingNode) {
    setForm({
      id: node.id,
      cpanelUsername: node.cpanelUsername,
      primaryDomain: node.primaryDomain,
      maxSlots: String(node.maxSlots),
    })
    setDialogOpen(true)
  }

  function openEditSiteModal(site: AdminSiteRow) {
    setEditingSite(site)
    setEditDomain(site.siteDomain)
    setEditPlan(site.plan || 'Managed WordPress Pro')
    setEditPhpVersion(site.phpVersion || 'PHP 8.3')
    setEditStatus(site.status)
  }

  async function handleSaveEditSite() {
    if (!editingSite || !supabase) return
    setIsSavingEditSite(true)
    setFeedback(null)
    try {
      const { error } = await supabase
        .from('user_sites')
        .update({
          site_domain: editDomain.trim(),
          plan: editPlan.trim(),
          php_version: editPhpVersion,
          status: editStatus,
        })
        .eq('id', editingSite.id)

      if (error) throw error

      setSites((prev) =>
        prev.map((s) =>
          s.id === editingSite.id
            ? {
                ...s,
                siteDomain: editDomain.trim(),
                plan: editPlan.trim(),
                phpVersion: editPhpVersion,
                status: editStatus,
              }
            : s,
        ),
      )

      setFeedback({ kind: 'ok', text: `Updated site details for ${editDomain}` })
      setEditingSite(null)
    } catch (err) {
      setFeedback({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Failed to update site',
      })
    } finally {
      setIsSavingEditSite(false)
    }
  }

  async function handleDeleteSite(site: AdminSiteRow) {
    if (!supabase) return
    if (
      !confirm(
        `Are you sure you want to delete ${site.siteDomain}? This will purge the addon domain and database from cPanel.`,
      )
    ) {
      return
    }

    setBusy(true)
    setFeedback(null)
    try {
      await deprovisionSite(supabase, site.id)
      setSites((prev) => prev.filter((s) => s.id !== site.id))
      setNodes((prev) =>
        prev.map((n) =>
          n.id === site.nodeId
            ? { ...n, currentSlots: Math.max(0, n.currentSlots - 1) }
            : n,
        ),
      )
      setFeedback({
        kind: 'ok',
        text: `Successfully purged site ${site.siteDomain} from cPanel node & database.`,
      })
    } catch (err) {
      setFeedback({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Failed to delete site from node',
      })
    } finally {
      setBusy(false)
    }
  }

  function mapFunctionNode(row: Record<string, unknown>): HostingNode {
    return {
      id: row.id as string,
      cpanelUsername: row.cpanel_username as string,
      primaryDomain: row.primary_domain as string,
      currentSlots: Number(row.current_slots),
      maxSlots: Number(row.max_slots),
      status: row.status as HostingNode['status'],
      createdAt: row.created_at as string,
    }
  }

  async function handleSubmitNode() {
    const maxSlots = Number(form.maxSlots)
    if (!Number.isInteger(maxSlots) || maxSlots < 1) {
      setFeedback({ kind: 'error', text: 'Max slots must be a positive whole number.' })
      return
    }
    if (!form.id && (!form.cpanelUsername.trim() || !form.primaryDomain.trim())) {
      setFeedback({ kind: 'error', text: 'cPanel username and primary domain are required.' })
      return
    }

    const editingNode = form.id ? nodes.find((n) => n.id === form.id) : null
    if (editingNode && maxSlots < editingNode.currentSlots) {
      setFeedback({
        kind: 'error',
        text: `Max slots cannot be below current usage (${editingNode.currentSlots}).`,
      })
      return
    }

    if (!supabase) {
      setFeedback({ kind: 'error', text: 'Supabase connection required.' })
      return
    }

    setBusy(true)
    setFeedback(null)
    try {
      if (form.id) {
        const { node } = await adminAction<{ node: Record<string, unknown> }>(supabase, {
          action: 'update_node',
          nodeId: form.id,
          maxSlots,
        })
        const mapped = mapFunctionNode(node)
        setNodes((prev) => prev.map((n) => (n.id === mapped.id ? mapped : n)))
      } else {
        const { node } = await adminAction<{ node: Record<string, unknown> }>(supabase, {
          action: 'create_node',
          cpanelUsername: form.cpanelUsername.trim(),
          primaryDomain: form.primaryDomain.trim(),
          maxSlots,
        })
        setNodes((prev) => [...prev, mapFunctionNode(node)])
      }
      setDialogOpen(false)
      setFeedback({ kind: 'ok', text: form.id ? 'Node updated.' : 'Node created.' })
    } catch (error) {
      setFeedback({
        kind: 'error',
        text: error instanceof Error ? error.message : 'Node save failed',
      })
    } finally {
      setBusy(false)
    }
  }

  async function handleStatusToggle(node: HostingNode) {
    const nextStatus: 'active' | 'maintenance' =
      node.status === 'maintenance' ? 'active' : 'maintenance'

    if (!supabase) return

    setBusy(true)
    setFeedback(null)
    try {
      const { node: updated } = await adminAction<{ node: Record<string, unknown> }>(
        supabase,
        { action: 'update_node', nodeId: node.id, status: nextStatus },
      )
      const mapped = mapFunctionNode(updated)
      setNodes((prev) => prev.map((n) => (n.id === mapped.id ? mapped : n)))
    } catch (error) {
      setFeedback({
        kind: 'error',
        text: error instanceof Error ? error.message : 'Node update failed',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        actions={
          <button className={primaryButtonClass} onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Add node
          </button>
        }
        description="cPanel capacity pool. View and manage all WordPress sites hosted on each node."
        title="Hosting nodes & server sites"
      />
      {feedback?.kind === 'error' ? (
        <p className="text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">
          {feedback.text}
        </p>
      ) : null}
      {feedback?.kind === 'ok' ? (
        <p className="text-[11px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-md px-3 py-2">
          {feedback.text}
        </p>
      ) : null}

      <div className="space-y-4">
        {nodes.map((node) => {
          const nodeSites = sites.filter((s) => s.nodeId === node.id)
          const isExpanded = expandedNodeId === node.id
          const percent = node.maxSlots > 0 ? (node.currentSlots / node.maxSlots) * 100 : 0

          return (
            <div
              className="bg-[#161618] border border-[#232328] rounded-xl overflow-hidden shadow-lg transition"
              key={node.id}
            >
              {/* Node Card Header */}
              <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#141416]">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="h-10 w-10 rounded-lg bg-[#1c1c1f] border border-[#2d2d34] flex items-center justify-center shrink-0">
                    <Server className="h-5 w-5 text-[#a89cf7]" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2.5">
                      <p className="text-base font-bold text-white font-mono tracking-tight">
                        {node.cpanelUsername}
                      </p>
                      <StatusBadge tone={nodeTone[node.status]}>{node.status}</StatusBadge>
                    </div>
                    <p
                      className="text-xs text-muted-foreground truncate font-mono mt-0.5"
                      title={node.primaryDomain}
                    >
                      {node.primaryDomain}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  {/* Slot Usage Bar */}
                  <div className="w-48 hidden sm:block">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="text-muted-foreground">Slots occupied</span>
                      <span className="text-white font-semibold">
                        {node.currentSlots}/{node.maxSlots}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-[#232328] overflow-hidden">
                      <div
                        className={
                          percent >= 100
                            ? 'h-full rounded-full bg-amber-400'
                            : percent >= 80
                              ? 'h-full rounded-full bg-amber-400/70'
                              : 'h-full rounded-full bg-[#5c4df0]'
                        }
                        style={{ width: `${Math.min(percent, 100)}%` }}
                      />
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-3">
                    <button
                      className="px-3 py-1.5 rounded-lg bg-[#202024] hover:bg-[#2c2c32] text-xs font-medium text-white border border-[#2d2d34] flex items-center gap-1.5 transition"
                      onClick={() =>
                        setExpandedNodeId(isExpanded ? null : node.id)
                      }
                    >
                      <Globe className="h-3.5 w-3.5 text-[#a89cf7]" />
                      <span>Sites ({nodeSites.length})</span>
                      {isExpanded ? (
                        <ChevronUp className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" />
                      )}
                    </button>

                    <button
                      className="text-xs font-semibold text-[#5c4df0] hover:text-[#796ef3] disabled:opacity-50"
                      disabled={busy}
                      onClick={() => openEditNode(node)}
                    >
                      Edit node
                    </button>
                    <button
                      className="text-xs font-semibold text-muted-foreground hover:text-white disabled:opacity-50"
                      disabled={busy}
                      onClick={() => void handleStatusToggle(node)}
                    >
                      {node.status === 'maintenance' ? 'Activate' : 'Drain'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Expanded Sites Drawer */}
              {isExpanded && (
                <div className="border-t border-[#232328] bg-[#111113] p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                      <Globe className="h-3.5 w-3.5 text-[#5c4df0]" />
                      WordPress Sites Provisioned on {node.cpanelUsername} ({nodeSites.length})
                    </h4>
                    <Link
                      to={`/admin/sites?nodeId=${node.id}`}
                      className="text-xs text-[#a89cf7] hover:underline flex items-center gap-1 font-medium"
                    >
                      Manage in Sites Console
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>

                  {nodeSites.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-[#232328] p-6 text-center text-xs text-muted-foreground">
                      No active sites assigned to this hosting node yet.
                    </div>
                  ) : (
                    <div className="rounded-lg border border-[#232328] overflow-hidden bg-[#161618]">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-[#232328] bg-[#1d1d22] text-muted-foreground font-semibold">
                            <th className="px-4 py-3">Site Domain</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3">Hosting Plan</th>
                            <th className="px-4 py-3">PHP Version</th>
                            <th className="px-4 py-3">Created</th>
                            <th className="px-4 py-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#232328]">
                          {nodeSites.map((site) => (
                            <tr key={site.id} className="hover:bg-[#1a1a1d] transition">
                              <td className="px-4 py-3 font-semibold text-white">
                                <div className="flex items-center gap-2">
                                  <span>{site.siteDomain}</span>
                                  <a
                                    href={`https://${site.siteDomain}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-muted-foreground hover:text-white"
                                    title="Open website"
                                  >
                                    <ExternalLink className="h-3 w-3" />
                                  </a>
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <StatusBadge tone={siteTone[site.status]}>
                                  {site.status}
                                </StatusBadge>
                              </td>
                              <td className="px-4 py-3 text-muted-foreground">
                                {site.plan || 'Managed WordPress Pro'}
                              </td>
                              <td className="px-4 py-3 font-mono text-muted-foreground">
                                {site.phpVersion || 'PHP 8.3'}
                              </td>
                              <td className="px-4 py-3 text-muted-foreground">
                                {formatDateLabel(site.createdAt)}
                              </td>
                              <td className="px-4 py-3 text-right space-x-3">
                                <button
                                  type="button"
                                  onClick={() => openEditSiteModal(site)}
                                  className="text-xs text-[#5c4df0] hover:text-[#796ef3] font-semibold inline-flex items-center gap-1"
                                >
                                  <Edit2 className="h-3 w-3" />
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleDeleteSite(site)}
                                  className="text-xs text-red-400 hover:text-red-300 font-semibold inline-flex items-center gap-1"
                                >
                                  <Trash2 className="h-3 w-3" />
                                  Delete
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
        {nodes.length === 0 ? (
          <div className="bg-[#161618] border border-[#232328] rounded-lg p-8 text-center text-sm text-muted-foreground">
            No hosting nodes registered. Add one to enable site provisioning.
          </div>
        ) : null}
      </div>

      {/* Edit Site Dialog */}
      {editingSite && (
        <Dialog open={Boolean(editingSite)} onOpenChange={() => setEditingSite(null)}>
          <DialogContent className={adminDialogClass}>
            <DialogHeader>
              <DialogTitle className="text-white text-lg font-bold flex items-center gap-2">
                <Settings className="h-4 w-4 text-[#5c4df0]" />
                Edit WordPress Site Configuration
              </DialogTitle>
              <DialogDescription>
                Modify live domain parameters, hosting plan, PHP version, or status for{' '}
                <span className="font-semibold text-white">{editingSite.siteDomain}</span>.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 text-xs">
              <div>
                <label className={fieldLabelClass} htmlFor="edit-site-domain">
                  Primary Domain
                </label>
                <input
                  id="edit-site-domain"
                  className={fieldInputClass}
                  value={editDomain}
                  onChange={(e) => setEditDomain(e.target.value)}
                  placeholder="e.g. client-site.com"
                />
              </div>

              <div>
                <label className={fieldLabelClass} htmlFor="edit-site-plan">
                  Hosting Plan Name
                </label>
                <input
                  id="edit-site-plan"
                  className={fieldInputClass}
                  value={editPlan}
                  onChange={(e) => setEditPlan(e.target.value)}
                  placeholder="e.g. Managed WordPress Pro"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={fieldLabelClass} htmlFor="edit-site-php">
                    PHP Engine Version
                  </label>
                  <select
                    id="edit-site-php"
                    className={fieldInputClass}
                    value={editPhpVersion}
                    onChange={(e) => setEditPhpVersion(e.target.value)}
                  >
                    <option value="PHP 8.3">PHP 8.3 (Latest)</option>
                    <option value="PHP 8.2">PHP 8.2</option>
                    <option value="PHP 8.1">PHP 8.1</option>
                    <option value="PHP 8.0">PHP 8.0</option>
                    <option value="PHP 7.4">PHP 7.4 (Legacy)</option>
                  </select>
                </div>

                <div>
                  <label className={fieldLabelClass} htmlFor="edit-site-status">
                    Site Operational Status
                  </label>
                  <select
                    id="edit-site-status"
                    className={fieldInputClass}
                    value={editStatus}
                    onChange={(e) =>
                      setEditStatus(e.target.value as AdminSiteRow['status'])
                    }
                  >
                    <option value="active">active</option>
                    <option value="provisioning">provisioning</option>
                    <option value="suspended">suspended</option>
                    <option value="failed">failed</option>
                  </select>
                </div>
              </div>
            </div>

            <DialogFooter>
              <button
                className={secondaryButtonClass}
                onClick={() => setEditingSite(null)}
              >
                Cancel
              </button>
              <button
                className={primaryButtonClass}
                disabled={isSavingEditSite}
                onClick={() => void handleSaveEditSite()}
              >
                {isSavingEditSite ? 'Saving…' : 'Save Changes'}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Create / edit Node dialog */}
      <Dialog onOpenChange={setDialogOpen} open={dialogOpen}>
        <DialogContent className={adminDialogClass}>
          <DialogHeader>
            <DialogTitle className="text-white text-lg font-bold">
              {form.id ? 'Edit node' : 'Add hosting node'}
            </DialogTitle>
            <DialogDescription>
              {form.id
                ? 'Adjust capacity for this cPanel account. Identity fields are immutable once sites are allocated.'
                : 'Register a cPanel account as provisioning capacity. It joins the allocation pool immediately.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {!form.id ? (
              <>
                <div>
                  <label className={fieldLabelClass} htmlFor="node-username">
                    cPanel username
                  </label>
                  <input
                    className={fieldInputClass}
                    id="node-username"
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, cpanelUsername: event.target.value }))
                    }
                    placeholder="e.g. a877b99a"
                    type="text"
                    value={form.cpanelUsername}
                  />
                </div>
                <div>
                  <label className={fieldLabelClass} htmlFor="node-domain">
                    Primary domain
                  </label>
                  <input
                    className={fieldInputClass}
                    id="node-domain"
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, primaryDomain: event.target.value }))
                    }
                    placeholder="e.g. cloudhost-000000.uk-south-2.nxcli.net"
                    type="text"
                    value={form.primaryDomain}
                  />
                </div>
              </>
            ) : null}
            <div>
              <label className={fieldLabelClass} htmlFor="node-slots">
                Max WordPress slots
              </label>
              <input
                className={fieldInputClass}
                id="node-slots"
                min={1}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, maxSlots: event.target.value }))
                }
                type="number"
                value={form.maxSlots}
              />
            </div>
          </div>
          <DialogFooter>
            <button className={secondaryButtonClass} onClick={() => setDialogOpen(false)}>
              Cancel
            </button>
            <button
              className={primaryButtonClass}
              disabled={busy}
              onClick={() => void handleSubmitNode()}
            >
              {busy ? 'Saving…' : form.id ? 'Save changes' : 'Create node'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
