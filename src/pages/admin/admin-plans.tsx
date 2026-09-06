import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Edit2,
  Layers,
  RefreshCw,
  Search,
  Settings,
} from 'lucide-react'

import {
  fetchAdminPlans,
  fetchAllProfiles,
  fetchAllSitesAdmin,
  type AdminPlanRow,
  type AdminProfile,
  type AdminSiteRow,
} from '@/lib/db/admin'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatDateLabel, cn } from '@/lib/utils'
import { AdminPageHeader, StatusBadge, type BadgeTone } from '@/components/admin/admin-ui'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { TableSkeleton } from '@/components/ui/ui-states'

export interface PlanConfig {
  id: string
  name: string
  tier: 'Launch' | 'Pro' | 'Scale'
  monthlyNgn: number
  yearlyNgn: number
  sitesLimit: number
  storageGb: number
  bandwidthGb: number
  hasGitCicd: boolean
  hasRedis: boolean
  hasStaging: boolean
  hasDedicatedIp: boolean
  description: string
  subscribersCount: number
}

const defaultPlans: PlanConfig[] = [
  {
    id: 'plan_launch',
    name: 'Launch Tier',
    tier: 'Launch',
    monthlyNgn: 10000,
    yearlyNgn: 8000,
    sitesLimit: 1,
    storageGb: 10,
    bandwidthGb: 50,
    hasGitCicd: false,
    hasRedis: false,
    hasStaging: false,
    hasDedicatedIp: false,
    description: 'Essential managed runtime for starter websites and single applications.',
    subscribersCount: 14,
  },
  {
    id: 'plan_pro',
    name: 'Pro Tier',
    tier: 'Pro',
    monthlyNgn: 15000,
    yearlyNgn: 12000,
    sitesLimit: 5,
    storageGb: 40,
    bandwidthGb: 200,
    hasGitCicd: true,
    hasRedis: true,
    hasStaging: true,
    hasDedicatedIp: false,
    description: 'For agencies and developers managing multi-site applications with CI/CD.',
    subscribersCount: 28,
  },
  {
    id: 'plan_scale',
    name: 'Scale Tier',
    tier: 'Scale',
    monthlyNgn: 25000,
    yearlyNgn: 20000,
    sitesLimit: 20,
    storageGb: 150,
    bandwidthGb: 1000,
    hasGitCicd: true,
    hasRedis: true,
    hasStaging: true,
    hasDedicatedIp: true,
    description: 'High-concurrency cluster allocation with dedicated resources and priority SLA.',
    subscribersCount: 9,
  },
]

export function AdminPlans() {
  const [plans, setPlans] = useState<PlanConfig[]>(defaultPlans)
  const [subscribers, setSubscribers] = useState<AdminPlanRow[]>([])
  const [profiles, setProfiles] = useState<AdminProfile[]>([])
  const [sites, setSites] = useState<AdminSiteRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [tierFilter, setTierFilter] = useState<'all' | 'Launch' | 'Pro' | 'Scale'>('all')

  // Edit Plan Modal
  const [editingPlan, setEditingPlan] = useState<PlanConfig | null>(null)
  const [editMonthly, setEditMonthly] = useState(10000)
  const [editYearly, setEditYearly] = useState(8000)
  const [editSitesLimit, setEditSitesLimit] = useState(1)
  const [editStorageGb, setEditStorageGb] = useState(10)
  const [editBandwidthGb, setEditBandwidthGb] = useState(50)
  const [editHasGitCicd, setEditHasGitCicd] = useState(false)
  const [editHasRedis, setEditHasRedis] = useState(false)
  const [editHasStaging, setEditHasStaging] = useState(false)
  const [editHasDedicatedIp, setEditHasDedicatedIp] = useState(false)

  // Feedback
  const [toast, setToast] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)

  const loadData = async () => {
    if (!supabase) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const [fetchedPlans, fetchedProfiles, fetchedSites] = await Promise.all([
        fetchAdminPlans(supabase),
        fetchAllProfiles(supabase),
        fetchAllSitesAdmin(supabase),
      ])
      setSubscribers(fetchedPlans)
      setProfiles(fetchedProfiles)
      setSites(fetchedSites)
    } catch (err) {
      console.warn('Admin plans load failed:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  const profileMap = useMemo(() => {
    const map = new Map<string, AdminProfile>()
    profiles.forEach((p) => map.set(p.userId, p))
    return map
  }, [profiles])

  const siteCountsByUser = useMemo(() => {
    const map = new Map<string, number>()
    sites.forEach((s) => {
      map.set(s.userId, (map.get(s.userId) || 0) + 1)
    })
    return map
  }, [sites])

  const openEditModal = (p: PlanConfig) => {
    setEditingPlan(p)
    setEditMonthly(p.monthlyNgn)
    setEditYearly(p.yearlyNgn)
    setEditSitesLimit(p.sitesLimit)
    setEditStorageGb(p.storageGb)
    setEditBandwidthGb(p.bandwidthGb)
    setEditHasGitCicd(p.hasGitCicd)
    setEditHasRedis(p.hasRedis)
    setEditHasStaging(p.hasStaging)
    setEditHasDedicatedIp(p.hasDedicatedIp)
  }

  const handleSavePlan = (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingPlan) return

    setPlans((prev) =>
      prev.map((p) =>
        p.id === editingPlan.id
          ? {
              ...p,
              monthlyNgn: editMonthly,
              yearlyNgn: editYearly,
              sitesLimit: editSitesLimit,
              storageGb: editStorageGb,
              bandwidthGb: editBandwidthGb,
              hasGitCicd: editHasGitCicd,
              hasRedis: editHasRedis,
              hasStaging: editHasStaging,
              hasDedicatedIp: editHasDedicatedIp,
            }
          : p,
      ),
    )

    setToast({
      tone: 'success',
      text: `Updated tier configuration for ${editingPlan.name} (Monthly: ₦${editMonthly.toLocaleString()}, Yearly: ₦${editYearly.toLocaleString()}).`,
    })
    setEditingPlan(null)
    setTimeout(() => setToast(null), 4000)
  }

  const filteredSubscribers = useMemo(() => {
    return subscribers.filter((sub) => {
      const matchesTier =
        tierFilter === 'all' ||
        sub.name.toLowerCase().includes(tierFilter.toLowerCase()) ||
        sub.type.toLowerCase().includes(tierFilter.toLowerCase())

      const userProfile = profileMap.get(sub.userId)
      const q = search.toLowerCase()
      const matchesSearch =
        !q ||
        sub.name.toLowerCase().includes(q) ||
        sub.region.toLowerCase().includes(q) ||
        sub.userId.toLowerCase().includes(q) ||
        (userProfile?.displayName.toLowerCase().includes(q) ?? false) ||
        (userProfile?.accountId.toLowerCase().includes(q) ?? false)

      return matchesTier && matchesSearch
    })
  }, [subscribers, tierFilter, search, profileMap])

  const statusTone: Record<AdminPlanRow['status'], BadgeTone> = {
    active: 'green',
    cancelled: 'red',
    suspended: 'amber',
  }

  return (
    <div className="space-y-6 text-left">
      <AdminPageHeader
        title="Hosting Plans & Pricing Manager"
        description="Configure subscription pricing tiers (Launch ₦10k, Pro ₦15k, Scale ₦25k), site allocations, quota ceilings, and feature entitlements."
        actions={
          <button
            onClick={() => void loadData()}
            type="button"
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-xs font-semibold text-white/80 transition hover:bg-white/10 hover:text-white"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            Refresh Tiers
          </button>
        }
      />

      {toast && (
        <div
          className={cn(
            'rounded-2xl border px-4 py-3 text-xs font-medium',
            toast.tone === 'success'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
              : 'border-rose-500/30 bg-rose-500/10 text-rose-400',
          )}
        >
          {toast.text}
        </div>
      )}

      {/* ── 3 ACTIVE TIER CARDS ── */}
      <div>
        <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">
          Configured Hosting Tiers
        </h3>
        <div className="grid gap-4 md:grid-cols-3">
          {plans.map((p) => {
            const isFeatured = p.tier === 'Pro'
            return (
              <div
                key={p.id}
                className={cn(
                  'rounded-3xl border p-6 space-y-4 relative flex flex-col justify-between backdrop-blur-xl',
                  isFeatured
                    ? 'border-[#5c4df0]/50 bg-[#5c4df0]/[0.05] shadow-lg shadow-[#5c4df0]/10'
                    : 'border-white/10 bg-[#161619]',
                )}
              >
                {isFeatured && (
                  <span className="absolute -top-2.5 right-6 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider bg-[#5c4df0] text-white shadow">
                    POPULAR
                  </span>
                )}

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-lg font-bold text-white">{p.name}</h4>
                      <p className="text-xs text-muted-foreground">{p.description}</p>
                    </div>
                  </div>

                  <div className="pt-1">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-2xl font-extrabold text-white font-mono">
                        ₦{p.monthlyNgn.toLocaleString()}
                      </span>
                      <span className="text-xs text-muted-foreground">/ month</span>
                    </div>
                    <p className="text-[11px] text-emerald-400 font-medium">
                      ₦{p.yearlyNgn.toLocaleString()} / mo billed annually (-20%)
                    </p>
                  </div>

                  <div className="space-y-1.5 pt-2 border-t border-white/10 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Site Capacity:</span>
                      <span className="text-white font-semibold font-mono">{p.sitesLimit} sites</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">NVMe Storage:</span>
                      <span className="text-white font-semibold font-mono">{p.storageGb} GB</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Monthly Bandwidth:</span>
                      <span className="text-white font-semibold font-mono">{p.bandwidthGb} GB</span>
                    </div>
                  </div>

                  {/* Feature Entitlements Badges */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {p.hasGitCicd && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-violet-500/10 text-violet-400 border border-violet-500/20">
                        GitHub CI/CD
                      </span>
                    )}
                    {p.hasRedis && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                        Redis Cache
                      </span>
                    )}
                    {p.hasStaging && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        Staging & Dev
                      </span>
                    )}
                    {p.hasDedicatedIp && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        Dedicated IP
                      </span>
                    )}
                  </div>
                </div>

                <div className="pt-4 border-t border-white/10 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    <strong className="text-white font-mono">{p.subscribersCount}</strong> active subscribers
                  </span>
                  <button
                    onClick={() => openEditModal(p)}
                    className="px-3 py-1.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-white text-xs font-semibold flex items-center gap-1.5 transition"
                  >
                    <Edit2 className="h-3 w-3" />
                    <span>Configure</span>
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── ACTIVE SUBSCRIPTIONS DIRECTORY ── */}
      <div className="rounded-3xl border border-white/10 bg-[#161619] p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <h3 className="text-base font-bold text-white">Active Plan Subscriptions</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Live customer subscription records across all hosting nodes and tiers.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-[#121214] p-1 rounded-lg border border-white/10">
              {(['all', 'Launch', 'Pro', 'Scale'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTierFilter(t)}
                  className={cn(
                    'px-2.5 py-1 rounded text-xs font-semibold transition',
                    tierFilter === t
                      ? 'bg-[#262629] text-white'
                      : 'text-muted-foreground hover:text-white',
                  )}
                >
                  {t === 'all' ? 'All Tiers' : t}
                </button>
              ))}
            </div>

            <div className="relative w-56">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search subscriber..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-[#121214] border border-white/10 text-white text-xs placeholder:text-muted-foreground focus:outline-none focus:border-[#5c4df0]"
              />
            </div>
          </div>
        </div>

        {loading ? (
          <TableSkeleton rows={4} />
        ) : filteredSubscribers.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center space-y-1">
            <p className="text-white text-xs font-semibold">No subscriptions match your query</p>
            <p className="text-muted-foreground text-[11px]">Adjust your filter or search keywords.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-white/10 bg-[#121214]">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-white/10 text-[11px] text-muted-foreground">
                  <th className="px-4 py-3 font-semibold">Plan Name</th>
                  <th className="px-4 py-3 font-semibold">Customer</th>
                  <th className="px-4 py-3 font-semibold">Region</th>
                  <th className="px-4 py-3 font-semibold">Sites Used / Limit</th>
                  <th className="px-4 py-3 font-semibold">Annual Price</th>
                  <th className="px-4 py-3 font-semibold">Renewal Date</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredSubscribers.map((sub) => {
                  const userProfile = profileMap.get(sub.userId)
                  const usedSites = siteCountsByUser.get(sub.userId) || 0

                  return (
                    <tr key={sub.id} className="hover:bg-white/[0.02] transition">
                      <td className="px-4 py-3 font-medium text-white">
                        <span className="flex items-center gap-1.5">
                          <Layers className="h-3.5 w-3.5 text-[#8d82f5]" />
                          {sub.name}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          to={`/admin/users/${sub.userId}`}
                          className="text-[#5c4df0] hover:text-[#796ef3] hover:underline font-medium"
                        >
                          {userProfile?.displayName || userProfile?.accountId || sub.userId.slice(0, 8)}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{sub.region}</td>
                      <td className="px-4 py-3 font-mono">
                        <span className={cn(usedSites >= sub.sitesLimit ? 'text-amber-400 font-bold' : 'text-white')}>
                          {usedSites}
                        </span>
                        <span className="text-muted-foreground"> / {sub.sitesLimit} sites</span>
                      </td>
                      <td className="px-4 py-3 font-mono text-white">
                        {formatCurrency(sub.priceNgnYearly)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDateLabel(sub.renewalDate)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={statusTone[sub.status]}>{sub.status}</StatusBadge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          to={`/admin/users/${sub.userId}`}
                          className="px-2.5 py-1 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-white text-[11px] font-semibold transition"
                        >
                          Manage User
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── CONFIGURE PLAN MODAL ── */}
      {editingPlan && (
        <Dialog open={Boolean(editingPlan)} onOpenChange={(open) => !open && setEditingPlan(null)}>
          <DialogContent className="max-w-lg bg-[#161619] border border-white/10 text-white">
            <DialogHeader>
              <DialogTitle className="text-base font-bold flex items-center gap-2">
                <Settings className="h-4 w-4 text-[#8d82f5]" />
                Configure Tier: {editingPlan.name}
              </DialogTitle>
            </DialogHeader>

            <form onSubmit={handleSavePlan} className="space-y-4 py-2 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-muted-foreground mb-1">
                    Monthly Price (NGN)
                  </label>
                  <input
                    type="number"
                    value={editMonthly}
                    onChange={(e) => setEditMonthly(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-[#121214] border border-white/10 text-white font-mono text-xs focus:outline-none focus:border-[#5c4df0]"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-muted-foreground mb-1">
                    Yearly Monthly-Equivalent (NGN)
                  </label>
                  <input
                    type="number"
                    value={editYearly}
                    onChange={(e) => setEditYearly(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-[#121214] border border-white/10 text-white font-mono text-xs focus:outline-none focus:border-[#5c4df0]"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-muted-foreground mb-1">
                    Sites Limit
                  </label>
                  <input
                    type="number"
                    value={editSitesLimit}
                    onChange={(e) => setEditSitesLimit(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-[#121214] border border-white/10 text-white font-mono text-xs focus:outline-none focus:border-[#5c4df0]"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-muted-foreground mb-1">
                    Storage (GB)
                  </label>
                  <input
                    type="number"
                    value={editStorageGb}
                    onChange={(e) => setEditStorageGb(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-[#121214] border border-white/10 text-white font-mono text-xs focus:outline-none focus:border-[#5c4df0]"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-muted-foreground mb-1">
                    Bandwidth (GB)
                  </label>
                  <input
                    type="number"
                    value={editBandwidthGb}
                    onChange={(e) => setEditBandwidthGb(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-[#121214] border border-white/10 text-white font-mono text-xs focus:outline-none focus:border-[#5c4df0]"
                    required
                  />
                </div>
              </div>

              {/* Feature Toggles */}
              <div className="space-y-2 pt-2 border-t border-white/10">
                <label className="block text-[11px] font-semibold text-muted-foreground">
                  Feature Entitlements
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex items-center gap-2 p-2 rounded-lg bg-[#121214] border border-white/5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editHasGitCicd}
                      onChange={(e) => setEditHasGitCicd(e.target.checked)}
                      className="rounded bg-black border-white/10 text-[#5c4df0] focus:ring-0"
                    />
                    <span className="text-white text-xs">GitHub CI/CD</span>
                  </label>

                  <label className="flex items-center gap-2 p-2 rounded-lg bg-[#121214] border border-white/5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editHasRedis}
                      onChange={(e) => setEditHasRedis(e.target.checked)}
                      className="rounded bg-black border-white/10 text-[#5c4df0] focus:ring-0"
                    />
                    <span className="text-white text-xs">Redis Object Cache</span>
                  </label>

                  <label className="flex items-center gap-2 p-2 rounded-lg bg-[#121214] border border-white/5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editHasStaging}
                      onChange={(e) => setEditHasStaging(e.target.checked)}
                      className="rounded bg-black border-white/10 text-[#5c4df0] focus:ring-0"
                    />
                    <span className="text-white text-xs">Staging Envs</span>
                  </label>

                  <label className="flex items-center gap-2 p-2 rounded-lg bg-[#121214] border border-white/5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editHasDedicatedIp}
                      onChange={(e) => setEditHasDedicatedIp(e.target.checked)}
                      className="rounded bg-black border-white/10 text-[#5c4df0] focus:ring-0"
                    />
                    <span className="text-white text-xs">Dedicated IP</span>
                  </label>
                </div>
              </div>

              <DialogFooter className="gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setEditingPlan(null)}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white text-xs font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-[#5c4df0] hover:bg-[#4d3fe0] text-white text-xs font-semibold transition shadow"
                >
                  Save Tier Config
                </button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
