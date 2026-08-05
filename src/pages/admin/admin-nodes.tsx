import { useEffect, useState } from 'react'
import { Plus, Server } from 'lucide-react'

import { mockNodes } from '@/data/mockAdmin'
import { fetchNodes, type HostingNode } from '@/lib/db/admin'
import { adminAction } from '@/lib/functions'
import { useSession } from '@/lib/session-store'
import { isDemoMode, supabase } from '@/lib/supabase'
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
  DemoNotice,
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
  const { isDemo } = useSession()
  const [nodes, setNodes] = useState<HostingNode[]>(isDemoMode ? mockNodes : [])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<NodeFormState>(emptyForm)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: 'demo' | 'error' | 'ok'; text?: string } | null>(
    null,
  )

  useEffect(() => {
    if (!supabase) return
    const sb = supabase

    async function loadLiveData() {
      try {
        setNodes(await fetchNodes(sb))
      } catch (error) {
        console.warn('Admin nodes fetch failed, keeping demo data:', error)
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

  function openEdit(node: HostingNode) {
    setForm({
      id: node.id,
      cpanelUsername: node.cpanelUsername,
      primaryDomain: node.primaryDomain,
      maxSlots: String(node.maxSlots),
    })
    setDialogOpen(true)
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

  async function handleSubmit() {
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

    if (isDemo || !supabase) {
      if (form.id) {
        setNodes((prev) =>
          prev.map((n) =>
            n.id === form.id
              ? {
                  ...n,
                  maxSlots,
                  status:
                    n.status === 'full' && n.currentSlots < maxSlots ? 'active' : n.status,
                }
              : n,
          ),
        )
      } else {
        setNodes((prev) => [
          ...prev,
          {
            id: `demo-node-${Date.now()}`,
            cpanelUsername: form.cpanelUsername.trim(),
            primaryDomain: form.primaryDomain.trim(),
            currentSlots: 0,
            maxSlots,
            status: 'active',
            createdAt: new Date().toISOString(),
          },
        ])
      }
      setDialogOpen(false)
      setFeedback({ kind: 'demo' })
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

    if (isDemo || !supabase) {
      setNodes((prev) =>
        prev.map((n) =>
          n.id === node.id
            ? {
                ...n,
                status:
                  nextStatus === 'active' && n.currentSlots >= n.maxSlots
                    ? 'full'
                    : nextStatus,
              }
            : n,
        ),
      )
      setFeedback({ kind: 'demo' })
      return
    }

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
        description="cPanel capacity pool. Provisioning allocates the least-loaded active node; 'full' is set automatically, 'maintenance' drains a node from new allocations."
        title="Hosting nodes"
      />

      {feedback?.kind === 'demo' ? <DemoNotice /> : null}
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

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {nodes.map((node) => {
          const percent = node.maxSlots > 0 ? (node.currentSlots / node.maxSlots) * 100 : 0
          return (
            <div
              className="bg-[#161618] border border-[#232328] rounded-lg p-5 flex flex-col gap-4"
              key={node.id}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-9 w-9 rounded-md bg-[#1c1c1f] border border-[#2d2d34] flex items-center justify-center shrink-0">
                    <Server className="h-4 w-4 text-[#a89cf7]" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-white font-mono">
                      {node.cpanelUsername}
                    </p>
                    <p
                      className="text-[11px] text-muted-foreground truncate"
                      title={node.primaryDomain}
                    >
                      {node.primaryDomain}
                    </p>
                  </div>
                </div>
                <StatusBadge tone={nodeTone[node.status]}>{node.status}</StatusBadge>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-muted-foreground">Slot usage</span>
                  <span className="text-white font-semibold">
                    {node.currentSlots}/{node.maxSlots}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-[#232328] overflow-hidden">
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

              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Added {formatDateLabel(node.createdAt)}</span>
                <div className="flex gap-3">
                  <button
                    className="text-[#5c4df0] hover:text-[#796ef3] font-semibold disabled:opacity-50"
                    disabled={busy}
                    onClick={() => openEdit(node)}
                  >
                    Edit
                  </button>
                  <button
                    className="text-[#5c4df0] hover:text-[#796ef3] font-semibold disabled:opacity-50"
                    disabled={busy}
                    onClick={() => void handleStatusToggle(node)}
                  >
                    {node.status === 'maintenance' ? 'Activate' : 'Drain'}
                  </button>
                </div>
              </div>
            </div>
          )
        })}
        {nodes.length === 0 ? (
          <div className="col-span-full bg-[#161618] border border-[#232328] rounded-lg p-8 text-center text-sm text-muted-foreground">
            No hosting nodes registered. Add one to enable site provisioning.
          </div>
        ) : null}
      </div>

      {/* Create / edit dialog */}
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
              onClick={() => void handleSubmit()}
            >
              {busy ? 'Saving…' : form.id ? 'Save changes' : 'Create node'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
