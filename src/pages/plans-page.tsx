import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpDown, Layers, Plus, Settings, Key, RefreshCw, Copy } from 'lucide-react'

import { fetchPlans, type HostingPlan } from '@/lib/db/plans'
import { supabase } from '@/lib/supabase'
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/ui-states'
import { WordPressLogo } from '@/components/icons/wordpress-logo'
import { ActionDropdown } from '@/components/ui/dropdown-menu'

function regionFlag(region: string): { emoji: string; label: string } {
  const r = region.toLowerCase()
  if (r.includes('uk') || r.includes('london')) return { emoji: '🇬🇧', label: 'UK' }
  if (r.includes('us') || r.includes('new york') || r.includes('chicago')) return { emoji: '🇺🇸', label: 'US' }
  if (r.includes('eu') || r.includes('frankfurt') || r.includes('amsterdam')) return { emoji: '🇪🇺', label: 'EU' }
  if (r.includes('sg') || r.includes('singapore')) return { emoji: '🇸🇬', label: 'SG' }
  if (r.includes('ng') || r.includes('lagos') || r.includes('nigeria')) return { emoji: '🇳🇬', label: 'NG' }
  return { emoji: '🌐', label: region }
}

function fmtDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(
    new Date(iso),
  )
}

function fmtPrice(ngnYearly: number): string {
  return (
    new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(ngnYearly) +
    ' / yr'
  )
}

export function PlansPage() {
  const [plans, setPlans] = useState<HostingPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadPlansData = async () => {
    if (!supabase) {
      setLoading(false)
      return
    }
    const sb = supabase
    setLoading(true)
    setError(null)
    try {
      const { data: { session } } = await sb.auth.getSession()
      if (!session) {
        setLoading(false)
        return
      }
      const fetchedPlans = await fetchPlans(sb)
      setPlans(fetchedPlans)
    } catch (err) {
      console.error('Plans fetch error:', err)
      setError(err instanceof Error ? err.message : 'Hosting plans could not be loaded.')
      setPlans([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadPlansData()
  }, [])

  return (
    <div className="space-y-6 text-left">
      {/* Breadcrumbs */}
      <div className="text-xs text-muted-foreground">
        <Link className="hover:text-white transition" to="/home">
          Home
        </Link>{' '}
        <span className="mx-1 text-[#4f4f52]">/</span> <span className="text-white">Plans</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Plans</h1>
        <button className="flex items-center gap-1.5 px-4 py-2 bg-[#5c4df0] hover:bg-[#4d3fe0] rounded-md text-xs font-semibold text-white transition" type="button">
          <Plus className="h-4 w-4" />
          Subscribe to Plan
        </button>
      </div>

      {error ? (
        <ErrorState
          title="Hosting Plans Error"
          message="We were unable to load active subscription plans."
          error={error}
          onRetry={() => void loadPlansData()}
        />
      ) : null}

      {/* Plans Card/Table */}
      <div className="bg-[#161619] border border-[#232328] rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-[#232328]">
          <h3 className="text-sm font-semibold text-white">Active Subscriptions</h3>
        </div>

        {loading ? (
          <TableSkeleton rows={4} />
        ) : plans.length === 0 ? (
          <div className="p-6">
            <EmptyState
              badge="Managed WordPress"
              icon={<Layers className="h-7 w-7 text-violet-400" />}
              title="No Active Hosting Subscriptions"
              description="Subscribe to a managed WordPress hosting tier (Standard, Scale, VIP) to provision high-performance cPanel sites."
              actionLabel="Subscribe to Plan"
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#232328] text-xs text-muted-foreground bg-[#121214]">
                  <th className="px-5 py-3 font-semibold">
                    <button className="flex items-center gap-1.5 hover:text-white transition">
                      Name
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="px-5 py-3 font-semibold">Sites Used</th>
                  <th className="px-5 py-3 font-semibold">App Environment</th>
                  <th className="px-5 py-3 font-semibold">
                    <button className="flex items-center gap-1.5 hover:text-white transition">
                      Type
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="px-5 py-3 font-semibold">Price</th>
                  <th className="px-5 py-3 font-semibold">
                    <button className="flex items-center gap-1.5 hover:text-white transition">
                      Renewal Date
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="px-5 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#232328] text-xs text-white">
                {plans.map((plan) => {
                  const { emoji, label } = regionFlag(plan.region)
                  return (
                    <tr className="hover:bg-[#1c1c20] transition" key={plan.id}>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <span className="text-base leading-none select-none">{plan.name}</span>
                          <span
                            className="inline-flex items-center justify-center bg-[#202024] border border-[#2d2d34] h-5 w-5 rounded-full text-xs"
                            title={label}
                          >
                            {emoji}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-muted-foreground">– / {plan.sitesLimit}</td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex h-5 w-5 rounded-full bg-[#0073aa] items-center justify-center p-1 text-white select-none">
                            <WordPressLogo className="h-3.5 w-3.5" />
                          </span>
                          <span>{plan.appEnvironment}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4 font-semibold">{plan.type}</td>
                      <td className="px-5 py-4">{fmtPrice(plan.priceNgnYearly)}</td>
                      <td className="px-5 py-4 text-muted-foreground">{fmtDate(plan.renewalDate)}</td>
                      <td className="px-5 py-4 text-right">
                        <ActionDropdown
                          items={[
                            {
                              label: 'View Environment Settings',
                              icon: <Settings className="h-3.5 w-3.5 text-sky-400" />,
                              href: '/sites',
                            },
                            {
                              label: 'View Credentials',
                              icon: <Key className="h-3.5 w-3.5 text-amber-400" />,
                              href: '/sites',
                            },
                            {
                              label: 'Upgrade / Modify Plan',
                              icon: <RefreshCw className="h-3.5 w-3.5 text-emerald-400" />,
                              onClick: () => {
                                alert(`Plan upgrade requested for ${plan.name}`)
                              },
                            },
                            {
                              label: 'Copy Subscription ID',
                              icon: <Copy className="h-3.5 w-3.5 text-muted-foreground" />,
                              onClick: () => {
                                navigator.clipboard.writeText(plan.id)
                              },
                            },
                          ]}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
