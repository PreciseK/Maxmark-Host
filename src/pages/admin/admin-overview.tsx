import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  CircleDollarSign,
  Globe2,
  MessageSquare,
  Server,
  Users,
} from 'lucide-react'

import {
  fetchAdminStats,
  fetchAuditLog,
  fetchNodes,
  type AdminStats,
  type AuditEntry,
  type HostingNode,
} from '@/lib/db/admin'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatDateLabel, formatPercent } from '@/lib/utils'
import { StatCard } from '@/components/admin/stat-card'

const actionLabels: Record<string, string> = {
  adjust_credit: 'Adjusted credit',
  set_site_status: 'Changed site status',
  create_node: 'Created hosting node',
  update_node: 'Updated hosting node',
  create_invoice: 'Created invoice',
  set_invoice_status: 'Changed invoice status',
  upsert_plugin: 'Saved marketplace item',
  set_purchase_status: 'Changed license status',
  set_conversation_status: 'Changed conversation status',
}

export function AdminOverview() {
  const [stats, setStats] = useState<AdminStats>({ totalUsers: 0, totalSites: 0, activeSites: 0, failedSites: 0, suspendedSites: 0, slotsUsed: 0, slotsTotal: 0, revenueNgn: 0, openConversations: 0 })
  const [nodes, setNodes] = useState<HostingNode[]>([])
  const [audit, setAudit] = useState<AuditEntry[]>([])

  useEffect(() => {
    if (!supabase) return
    const sb = supabase

    async function loadLiveData() {
      try {
        const [liveStats, liveNodes, liveAudit] = await Promise.all([
          fetchAdminStats(sb),
          fetchNodes(sb),
          fetchAuditLog(sb),
        ])
        setStats(liveStats)
        setNodes(liveNodes)
        setAudit(liveAudit)
      } catch (error) {
        console.warn('Admin overview fetch failed, keeping demo data:', error)
      }
    }

    sb.auth.getSession().then(({ data: { session } }) => {
      if (session) void loadLiveData()
    })
  }, [])

  const capacityPercent = stats.slotsTotal > 0 ? (stats.slotsUsed / stats.slotsTotal) * 100 : 0

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Overview</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Platform health across accounts, capacity, revenue, and support.
        </p>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        <StatCard
          icon={<Users className="h-4 w-4 text-muted-foreground" />}
          label="Customers"
          sub="registered accounts"
          value={String(stats.totalUsers)}
        />
        <StatCard
          icon={<Globe2 className="h-4 w-4 text-muted-foreground" />}
          label="Active sites"
          sub={`${stats.totalSites} total · ${stats.suspendedSites} suspended`}
          value={String(stats.activeSites)}
        />
        <StatCard
          icon={<Server className="h-4 w-4 text-muted-foreground" />}
          label="Node capacity"
          sub={`${stats.slotsUsed} of ${stats.slotsTotal} slots in use`}
          value={formatPercent(capacityPercent)}
        />
        <StatCard
          icon={<CircleDollarSign className="h-4 w-4 text-muted-foreground" />}
          label="Revenue"
          sub="successful payments, all time"
          value={formatCurrency(stats.revenueNgn)}
        />
        <StatCard
          icon={<MessageSquare className="h-4 w-4 text-muted-foreground" />}
          label="Open conversations"
          sub="awaiting a support reply"
          value={String(stats.openConversations)}
        />
        <StatCard
          icon={<AlertTriangle className="h-4 w-4 text-muted-foreground" />}
          label="Failed provisions"
          sub="sites needing intervention"
          value={String(stats.failedSites)}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Node utilization */}
        <div className="bg-[#161618] border border-[#232328] rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-white">Node utilization</h2>
            <Link
              className="text-xs text-[#5c4df0] hover:text-[#796ef3] hover:underline transition-colors"
              to="/admin/nodes"
            >
              Manage nodes
            </Link>
          </div>
          <div className="space-y-4">
            {nodes.map((node) => {
              const percent = node.maxSlots > 0 ? (node.currentSlots / node.maxSlots) * 100 : 0
              return (
                <div key={node.id}>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="font-medium text-white">{node.cpanelUsername}</span>
                    <span className="text-muted-foreground">
                      {node.currentSlots}/{node.maxSlots} slots ·{' '}
                      <span
                        className={
                          node.status === 'full'
                            ? 'text-amber-400'
                            : node.status === 'maintenance'
                              ? 'text-sky-400'
                              : 'text-emerald-400'
                        }
                      >
                        {node.status}
                      </span>
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-[#232328] overflow-hidden">
                    <div
                      className={
                        percent >= 100
                          ? 'h-full rounded-full bg-amber-400'
                          : 'h-full rounded-full bg-[#5c4df0]'
                      }
                      style={{ width: `${Math.min(percent, 100)}%` }}
                    />
                  </div>
                </div>
              )
            })}
            {nodes.length === 0 ? (
              <p className="text-xs text-muted-foreground">No hosting nodes registered yet.</p>
            ) : null}
          </div>
        </div>

        {/* Recent admin activity */}
        <div className="bg-[#161618] border border-[#232328] rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-white">Recent admin activity</h2>
            <Link
              className="text-xs text-[#5c4df0] hover:text-[#796ef3] hover:underline transition-colors"
              to="/admin/audit"
            >
              Full audit log
            </Link>
          </div>
          <div className="space-y-3">
            {audit.slice(0, 6).map((entry) => (
              <div
                className="flex items-start justify-between gap-4 border-b border-[#232328] last:border-b-0 pb-3 last:pb-0"
                key={entry.id}
              >
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-white">
                    {actionLabels[entry.action] ?? entry.action}
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {entry.targetType ?? 'system'}
                    {entry.targetId ? ` · ${entry.targetId}` : ''}
                  </p>
                </div>
                <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                  {formatDateLabel(entry.createdAt)}
                </span>
              </div>
            ))}
            {audit.length === 0 ? (
              <p className="text-xs text-muted-foreground">No admin actions recorded yet.</p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
